# Nenworld Rules Engine — Complete State Handoff

> ⚠️ **This document is a historical snapshot and is stale.** It was written at 27 files /
> 596 tests; the engine is now at **70 files / 1,978 tests**. Several sections below describe
> code that has since moved (`character/mechanics/` → `foundation/`), been rewritten (Speed and
> movement), or been completed (Aura time resolution).
>
> - For **current state**, read [`ENGINE_SUMMARY.md`](ENGINE_SUMMARY.md).
> - For **what is not done**, read [`BACKLOG.md`](BACKLOG.md) — the single authoritative backlog.
>
> This file is kept for the design narrative it carries, not as a status report.

**Package:** `@nenworld/engine` (`packages/engine`)
**Snapshot date:** 2026-08-27
**Branch:** `main` @ `6a3450b` + substantial uncommitted work (see §12)

**Health at snapshot:** `vitest run` → **27 files, 596 tests, all passing** (~1.2s). `tsc --noEmit` → **clean**.
**Size:** 120 `.ts` files, ~38,100 LOC total (~28,000 source / ~10,000 test).

**Stack:** TypeScript 5.6, ESM (`"type": "module"`), Vitest 2.1, zero runtime dependencies.
Consumed by `apps/workbench` (React/Vite), plus planned Foundry module and Obsidian plugin.

---

## 1. Architecture in one page

The engine is a **pure, data-driven rules kernel**. No I/O, no persistence, no randomness, no mutation of inputs. Everything is a pure function from authored data to derived data.

```
infrastructure/          JsonValue · EngineResult · TraceNode · Warning/EngineError · Registry · id · rounding
        │
        ├── character/rules/          the universal vocabulary: Effect, Requirement, EffectfulDefinition
        │           │                 + rules/resolution.ts (the interpreter) + rules/validation.ts
        │           │
        │   ┌───────┴────────────────────────────────────────────────┐
        │   │  every content domain is built on that one vocabulary  │
        │   └────────────────────────────────────────────────────────┘
        │
        ├── character/identity/       species · clans · traits
        ├── character/capabilities/   mastery · skills · techniques · resolution · attempts
        ├── character/status/         stage · conditions · injuries · resolution
        ├── character/equipment/      items
        ├── character/foundation/     attributes (+ derived) · body · aura · nen
        ├── character/progression/    levels · stats · growth
        ├── character/mechanics/      recovery
        ├── character/catalogs.ts     one generic surface over all 10 catalog domains
        ├── character/resolution.ts   THE ORCHESTRATOR: authored character → ResolvedCharacter
        ├── character/validation.ts   THE VALIDATOR: every domain's issues → EngineErrors
        │
        ├── time/                     timestamp · duration · calendar · clock · validation
        ├── decisions/log.ts          where the engine knowingly diverges from the frozen Rulebook
        ├── combat/index.ts           STUB (empty)
        └── index.ts                  the public barrel — 871 lines, heavily commented
```

### The four load-bearing design rules

1. **Nothing derivable is stored.** Level comes from `lifetimeXp`. Derived Attributes come from resolved Attributes. Granted Skills/Traits are never written to the sheet. Two fields that must agree are two fields that will eventually disagree.
2. **New content is data, not code.** A domain adds a definition to a catalog; the rules layer already knows how to read its `effects` and `requirements`. The deliberate exceptions are the Nen principles (§7), which carry substantial bespoke Aura math.
3. **Closed vocabularies everywhere.** Every union is `as const satisfies` a typed list. A free-string "tag" scope for check modifiers was considered and explicitly rejected — a typo would validate clean, resolve clean, and silently match nothing.
4. **Everything explains itself.** Public entry points return `EngineResult<T>` carrying a JSON-serializable `TraceNode` tree, on both success and failure.

---

## 2. Infrastructure layer

| File | What it owns |
|---|---|
| `json.ts` | `JsonValue` / `JsonObject` / `JsonArray` / `JsonPrimitive`. The serialization boundary — traces must survive `JSON.stringify` intact (bug reports, golden snapshots, Foundry/Obsidian adapters). |
| `result.ts` | `EngineResult<T>` = `EngineSuccess<T>` \| `EngineFailure`, discriminated on `success`. Both branches carry `trace` and `warnings`; failure carries `NonEmptyArray<EngineError>`. |
| `diagnostics.ts` | `Warning` (non-blocking) and `EngineError` (blocking). Both have `code`, `message`, `audience` (`player` \| `gm` \| `developer`), optional `subject: {kind, id}`. Errors add `required`/`actual`/`resolution`. |
| `trace.ts` | `TraceNode` — recursive `{id, label, formula?, inputs, output?, rounding?, ruleSource?, decisionId?, warnings, children}`. `createTraceNode()` is the only sanctioned constructor; it defaults the collections so consumers never null-check. |
| `registry.ts` | `createRegistry<T>(label, authored)` — the machinery behind **every** catalog. Two layers: **authored** (frozen engine source, canon, never removable) and **custom** (host-registered at runtime, additive only, **can never shadow an authored id**). Also `scanReferences()` (the "unknown or duplicate" walk) and `DEFINITION_ID_PATTERN` = `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Uses `hasOwnProperty` so ids like `"constructor"` can't resolve through the prototype chain. |
| `id.ts` | `createId(prefix)` → prefix + 16 random chars from `[a-z0-9]`, via Web Crypto (`Math.random` fallback for exotic embeddings). `idPattern(prefix)` recognises one. Ids never depend on name, timestamp, or list position. |
| `rounding.ts` | `roundToSignificantFigures(value, digits)` and `roundToOneSignificantFigure()` — shared by Aura Pool, Aura Output, Aura Regeneration, Aura Control and XP thresholds so every caller stays byte-for-byte consistent. Implemented through `toPrecision`, so a two-significant-figure Control multiplier is exactly `2.9` rather than `2.9000000000000004`. |

---

## 3. The universal rules vocabulary (`character/rules/`)

This is the heart of the engine. Every content domain speaks it.

### Effects (`effects.ts`) — 6 types

```ts
type Effect =
  | { type: "modifyBaseAttribute";      attribute: AttributeKey; amount: number }
  | { type: "modifyResolvedAttribute";  attribute: AttributeKey; amount: number }
  | { type: "modifyCheck";              check: CheckScope;       amount: number }
  | { type: "grantTrait";     traitId: string }
  | { type: "grantSkill";     skillId: string }
  | { type: "grantTechnique"; techniqueId: string }
```

`CheckScope` is a closed 2-variant union: `{kind:"attribute", attribute}` or `{kind:"derivedAttribute", derivedAttribute}`.

**Three things are called "modifier"** — this distinction is documented at length in three separate file headers and is the easiest mistake in the domain:

| Kind | Direction | Example |
|---|---|---|
| `AttributeModifier` | applied **to** a score | Flexible's "+2 AGI" turns 17 into 19 |
| standard modifier | derived **from** a score | AGI 19 yields +4, via `floor((19-10)/2)` |
| `modifyCheck` Effect | applies to **one resolution only** | Contort's "+3 to applicable AGI checks" — never on the sheet |

### Requirements (`requirements.ts`) — 16 types

`attributeMinimum` · `derivedAttributeMinimum` · `levelMinimum` · `hasSpecies` · `hasSubspecies` · `hasClan` · `hasTrait` · `hasSkill` · `skillMastery` · `hasTechnique` · `techniqueMastery` · `hasCondition` · `hasItem` · `all` · `any` · `not`

Attribute requirements carry a `layer: "stored" | "base" | "resolved"` — permanent acquisition normally checks `base`, so a temporary Condition can't revoke a capability the character trained for.

**Requirements resolve to three answers, not two.** `resolveRequirement()` returns a `RequirementDisposition` of `satisfied` / `unsatisfied` / `unresolved`. The third exists because Character collections are optional so a half-built sheet still resolves.

Presence and absence are **not symmetric**. The context lists hold everything the engine can see — including Traits, Skills and Techniques a Species granted — and `RequirementContext.incomplete` names the collections the sheet has not filled in. So: a **known** id is `satisfied` even when the collection is incomplete; an **unknown** id is `unsatisfied` only when the collection is complete; an unknown id in an incomplete collection is `unresolved`. A recorded Mastery rank is definitive in both directions, since a Skill cannot appear twice.

Presence and rank are **separate context fields**: `skillIds` / `techniqueIds` hold everything the character has, `skillMastery` / `techniqueMastery` hold only what carries a rank. `hasSkill` and `hasTechnique` read the id lists; `skillMastery` and `techniqueMastery` read the records. A capability with no Mastery track therefore satisfies `hasSkill` and is definitively `unsatisfied` for any rank requirement — there is no rank there to meet it with.

An unresolved capability requirement is a **warning**, not an error, so an incomplete sheet stays resolvable. That is a diagnostic severity only — the requirement is still unresolved for action preparation, the proposal reads `missing-facts`, and settlement refuses to commit.

Compound propagation: `all` is unsatisfied if any member is, else unresolved if any member is, else satisfied. `any` is satisfied if any member is, else unresolved if any member is, else unsatisfied. `not` inverts the two definite answers and leaves unresolved alone.

`meetsRequirement()` and `meetsAllRequirements()` remain as **boolean compatibility helpers that treat unresolved as false**. That is correct for "may this proceed" and wrong for "why not" — anything producing a diagnostic must use the tri-state evaluator, or it will tell an author a requirement definitively failed when the sheet is merely unfinished.

### `content.ts`

`EffectfulDefinition extends Definition { effects?, requirements? }` — the shape every authored domain extends. Plus `collectGrantedIds()` and `collectRequirementReferences()` (walks compound trees, tags each id with its domain) for cross-catalog validation.

### `resolution.ts` (754 LOC) — the interpreter

- `RuleSourceRef {type: string, id: string}` — provenance rides on every modifier and grant. `type` is deliberately an open string (it only ever *labels*, never *decides*).
- `collectSourcedEffects()` flattens sources → `SourcedEffect[]`.
- `resolveRuleEffects()` → `ResolvedRuleEffects { effects, baseAttributeModifiers, resolvedAttributeModifiers, checkModifiers, traitGrants, skillGrants, techniqueGrants }`. **Grants are deliberately NOT deduplicated** — removing one source must not remove access another still supplies.
- `resolveCheckModifier(standardModifier, checkModifiers, scope)` → `CheckModifierResolution`. **The one place** a standard modifier and situational modifiers are summed. Every mechanic resolving a check comes through here.
- `meetsRequirement()` / `meetsAllRequirements()` against a `RequirementContext`.

### `validation.ts` (675 LOC)

`findEffectValidationIssues`, `findRequirementValidationIssues`, `findRuleValidationIssues`, and `MAX_REQUIREMENT_DEPTH` (guards against malformed recursive trees).

---

## 4. Attributes

### Base (`foundation/attributes/`)

- **Ten attributes:** STR AGI DEX CON VIT INT WIS PER SPI CHA (`ATTRIBUTE_KEYS`).
- **Stored range:** `ATTRIBUTE_MIN = 1`, `ATTRIBUTE_MAX = 30`. Only *authored* scores are held to it — Base and Resolved may fall outside, because clamping a Trait/injury penalty silently would hide it.
- **Ordinary vs rolled:** `ORDINARY_ATTRIBUTE_KEYS` (STR AGI DEX CON VIT INT WIS PER) are assigned from the starting array and raisable by Stat Points. `ROLLED_ATTRIBUTE_KEYS` (SPI, CHA) are rolled at creation and **only** raisable by Limited Stat Point grants.

### The three-stage ladder

```
Stored   (authored; only progression writes it)
   ↓ modifyBaseAttribute      permanent: Traits, Sub-species, transformations
Base     (what the sheet shows)
   ↓ modifyResolvedAttribute  active: Conditions, injuries, equipped Items
Resolved (what a check rolls against)
```

All three are the same `Attributes` shape, aliased not branded. `AttributeLayers {stored, base, resolved}` is returned together because a sheet showing "DEX 14 (11)" needs two at once.

### The standard modifier ladder

```
deriveStandardModifier(score) = floor((score - 10) / 2)
```

`STANDARD_MODIFIER_REFERENCE_SCORE = 10`, `STANDARD_MODIFIER_DIVISOR = 2`. **Single authoritative implementation.** Takes a plain number precisely so an Attribute score and a Derived Attribute score go through the same ladder — the Rulebook gives them one table, not two. Not clamped.

`ResolvedScore {score, standardModifier}` is the shared render shape for both.

### Explanation surface

`explainAttribute()` → `AttributeExplanation {attribute, stored, baseContributions[], base, resolvedContributions[], resolved}`.
`createAttributeTraceNode()` / `createAttributeResolutionTrace()`. Both dedupe repeated input keys with a `(2)`, `(3)` suffix so a trace never shows a total its own inputs don't add up to.

### Derived Attributes (`foundation/attributes/derived/`) — **NEW, uncommitted**

Ten values, each the **rounded mean** of 2–5 **resolved** Attributes:

| Derived Attribute | Formula |
|---|---|
| `combatAbility` | round((STR + AGI + DEX + PER + WIS) / 5) |
| `speed` | round((STR + AGI) / 2) — named `athletics` at the time of this snapshot |
| `acrobatics` | round((AGI + DEX) / 2) |
| `accuracy` | round((DEX + PER) / 2) |
| `detection` | round((PER + WIS) / 2) |
| `concealment` | round((DEX + WIS) / 2) |
| `investigation` | round((INT + WIS + PER) / 3) |
| `stamina` | round((CON + VIT) / 2) |
| `willpower` | round((WIS + SPI) / 2) |
| `intimidation` | round((CHA + SPI) / 2) |

`DERIVED_ATTRIBUTE_SOURCES` is the single place a formula is stated; the ten named `resolveX()` functions all delegate to `resolveDerivedAttribute(name, attributes)`.

**There is deliberately no `modifyDerivedAttribute` Effect and no stored Derived Attribute state.** A Trait raises AGI and Acrobatics follows because it is recalculated. Situational bonuses are `modifyCheck` Effects applied at check time.

Ties round **up** (`Math.round`) — recorded as decision `attributes.derived.rounding-direction` because it's asymmetric across zero, and a Derived Attribute *can* go negative once penalties push contributing Attributes below 1.

---

## 5. Body system (largest subsystem, ~4,800 LOC)

`Body { heightCm, massKg, build: {muscularity, adiposity}, anatomy }`. CON is **not** part of Body — it's an Attribute consumed during BP resolution.

### Anatomy (`body/anatomy/`)

Data-driven; the engine holds **no closed list** of valid part types. `Anatomy { parts: BodyPart[] }` is a directed acyclic **forest** (each part has 0–1 parent, multiple roots allowed, cycles/dangling refs invalid — enforced by `validation.ts`, not the types).

```ts
BodyPart { id, type, name?, attachment: {parentId, site?} | null, damage, recoveryProgress }
BodyPartDefinition { id, name, description, tags[], baseBP, morphologySensitivity {height, mass, muscularity, adiposity} }
```

`recoveryProgress` invariant: `0 <= progress < 1`. Reaching full BP or hitting an Injury cap resets it to 0 — recovery is never banked with nowhere to go.

**`BODY_PART_DEFINITIONS` (8 authored):**

| Part | tags | baseBP | height / mass / musc / adip sensitivity |
|---|---|---|---|
| head | core | 8 | 0 / 0 / 0 / 0 |
| neck | core | 4 | 0 / 1 / 0.20 / 0.05 |
| upper-body | core, torso | 8 | 1 / 1 / 0.40 / 0.15 |
| lower-body | core, torso | 4 | 1 / 1 / 0.30 / 0.20 |
| arm | limb, upper-limb | 14 | 1 / 1 / 0.60 / 0.05 |
| hand | limb, upper-limb, extremity, manipulator | 5 | 0 / 0 / 0.10 / 0.02 |
| leg | limb, lower-limb, locomotor | 14 | 1 / 1 / 0.60 / 0.08 |
| foot | limb, lower-limb, extremity, locomotor | 5 | 0 / 0 / 0.10 / 0.02 |

**`STANDARD_HUMANOID_ANATOMY`** — 12 instances. Upper Body is the root; Neck→Head, Lower Body→(Leg-1→Foot-1, Leg-2→Foot-2), Arm-1→Hand-1, Arm-2→Hand-2. "Upper Body"/"Lower Body" are the permanent mechanical names (never Chest/Torso). Left/Right in display names is presentational only; every pair shares one side-agnostic definition.

Files: `creation.ts` (`createAnatomy`), `modification.ts` (`applyAnatomyModifications`, `applyBodyPartDamage`, `removeBodyPart` with automatic descendant cascade), `resolution.ts` (`resolveAnatomy` = stored + temporary modifications), `validation.ts` (612 LOC).

### Selectors (`body/selectors.ts`)

Shared targeting vocabulary used by BP modifiers, Critical Point placement, and Injury applicability. Either `{all: true}` or `{ids?, types?, tags?, tagMode?}` — dimensions **intersect**, within-dimension is any-of, `tagMode` defaults to `"all"`.

### Morphology (`body/body-points/morphology.ts`)

Reference body: **165 cm, 62 kg, muscularity 1, adiposity 1**.

```
heightRatio       = heightCm / 165
buildMassFactor   = 0.45 + 0.35·muscularity + 0.20·adiposity      (= 1 at reference)
expectedMassKg    = 62 · heightRatio² · buildMassFactor
residualMassRatio = actualMassKg / expectedMassKg
residualMassFactor= residualMassRatio^0.5

per-part factor   = 1 + sensitivity · (dimensionFactor - 1)
combinedMultiplier= heightF · massF · muscularityF · adiposityF
morphAdjustedBaseBP = definition.baseBP · combinedMultiplier
```

The expected-mass step is the mechanism preventing height, muscularity, adiposity, and total mass from independently rewarding the same physical tissue. The `^0.5` softening means a 20% unexplained mass excess produces only a ~9.5% factor. **No rounding anywhere in morphology.**

### Body Points (`body/body-points/resolution.ts`)

```
template Base BP
  × morphology              →  morphology-adjusted Base BP
  + additive BP modifiers   →  resolved Base BP
  × Constitution multiplier →  Constitution-scaled BP
  × true BP multipliers     →  raw Maximum BP
  round once (max(1, …))    →  Maximum BP
  - stored damage           →  Current BP   (floored at 0; damage itself never clamped)
```

**Constitution multiplier: `2 ^ ((CON - 10) / 5)`** (`REFERENCE_CONSTITUTION = 10`, `CONSTITUTION_DOUBLING_INTERVAL = 5`). CON 5 → ×0.5 · CON 10 → ×1 · CON 15 → ×2 · CON 20 → ×4 · CON 25 → ×8 · CON 30 → ×16.

Standard humanoid at reference morphology aggregates to **100 BP** (regression-tested; `STANDARD_BODY` is built from the reference constants so this is true by construction).

Current BP reaching 0 destroys the part. The resolver **reports** destruction; it never mutates Anatomy.

### Critical Points (`body/critical-points/`)

Three categories layered over resolved Anatomy, derived not stored. Placement kinds: `per-part` (one instance per matched part), `shared` (one instance spanning several hosts), `body-part-self` (the part *is* the target — Neck).

**`SPECIAL_POINT_DEFINITIONS` (14 authored):**

- **Critical (failure = death):** brain (head), heart (upper-body), neck (self)
- **Semicritical (Injury opportunity):** face (head), upper-organs (upper-body), lower-organs (lower-body), groin (lower-body), spine (**shared**: upper-body + lower-body)
- **Joint (damage multiplier + Injury opportunity):** shoulder ×2 (arm), elbow ×1.5 (arm), wrist ×2 (hand), hip ×2 (leg), knee ×1.5 (leg), ankle ×2 (foot)

### Damage pipeline (`body/damage.ts`) — the Body↔Combat seam

`applyBodyDamage(BodyDamageInput) → EngineResult<BodyDamageOutcome>`. Locked 12-step order; two steps are load-bearing:

- **Step 8** (fatal Critical check) evaluates against the **pre-removal** point set. A Head reaching 0 BP that is removed before the Brain's fatal failure is checked would silently lose that failure. Regression-tested.
- Damage is applied to **two** trees: the resolved tree (may include temporary-only parts) feeds BP resolution; the stored tree feeds persistence. A temporary-only target takes damage for this resolution but persists nothing.
- **No damage spill**: nothing but the resolved host is touched. Destroyed-part descendants cascade via `removeBodyPart`; they don't inherit damage.
- Step 5 never touches `recoveryProgress` — only `body-points/recovery.ts` decides when progress resets.

This is the one Body function taking potentially-invalid caller input across a domain boundary, so it returns `EngineResult` rather than throwing.

---

## 5b. Endurance (`foundation/body/endurance/`)

Body's half of the energy model, and a strict one-way dependency: Maximum Aura, the depletion fraction and the Stamina score all arrive as **plain numbers**, so the Aura domain depends on this folder and this folder imports nothing from it — the same rule that keeps Body independent of the Attribute layer.

| | What it is | Stored? |
|---|---|---|
| **Stamina** | physical-expenditure efficiency, `10 / max(1, Stamina)` | no — the existing Derived Attribute `round((CON+VIT)/2)` |
| **Wakefulness** | accumulated hours awake | **yes** — `Character.wakefulness`, a sibling of `aura` |
| **Fatigue** | derived 0–10 condition | no |

Stamina multipliers: 5 → ×2.0 · 10 → ×1.0 · 15 → ×0.667 · 20 → ×0.5 · 25 → ×0.4 · 30 → ×0.333. Kept at full internal precision; the Rulebook's ×0.67 and ×0.33 are printed two-decimal figures.

**Maximum wakefulness** is `24 × max(1, floor(2 + log10(A_max / 10)))` hours — logarithmic, so ten times the Aura buys one more day rather than ten:

| Max Aura | 10 | 100 | 1,000 | 10,000 | 1e6 | 1e9 | 4e9 |
|---|---|---|---|---|---|---|---|
| Hours | 48 | 72 | 96 | 120 | 168 | 240 | 240 |

The last two are equal because of the floor, not a cap. Only **sleep** reduces the debt, at two waking hours per hour slept; intentional rest recovers Aura and clears nothing, and neither does resting behind a Zetsu.

**Fatigue** = `clamp(10r² + depletionBand, 0, 10)`, floored once at the end, `r = hoursAwake / maximumWakefulHours` clamped to 1.

The quadratic is chosen for its shape: half way to the limit is 2.5 and functional, three quarters is 5.6 and impaired, and the last stretch arrives fast. `r = 1` is exactly 10, so the wakefulness limit blacks a character out on its own.

Depletion bands: <25% +0 · 25% +1 · 50% +2 · 75% +3 · 90% +4 · 100% +5, preserving the calibration that ~65% drained is +2. Physical exertion is **not** a third component — exertion spends Aura, depletion already charges for it, and a third term would bill the same effort twice.

States are categorical, never dice penalties: 0–4 unimpaired · 5–6 fatigued · 7–8 severely fatigued · **9 cannot fight** · **10 blackout**. What Fatigue 6 costs a Skill check, a recovery rate or an attack roll belongs to Skills, Body recovery and Combat.

`ResolvedCharacter.fatigue` is assembled after Aura, because the wakefulness limit needs Maximum Aura and the depletion component needs the resolved pool. It feeds nothing back, which keeps that a line rather than a cycle.

---

## 6. Aura (`foundation/aura/`)

Exported through its own barrel (`foundation/aura/index.ts`), re-exported wholesale from the package root. `resolveCharacter` populates `ResolvedCharacter.aura` through the one central resolver, `resolveAuraProfile`.

Major derived Aura figures round to **one significant figure**; Aura Control rounds to two below DEX 22 and one above it (see below).

| Quantity | Formula |
|---|---|
| **Maximum Aura** | `10 · 50^((CON+VIT-20)/10) · 2^(((CON+VIT-20)(CON+VIT-30))/200)` |
| **Physiological Output Capacity** | `n = (CON-10)/5`; `M = 50ⁿ · 2^(n(n-1)/2)`; `O_phys = 2M` |
| **Accessible Output** | `O_phys × accessFraction` |
| **Usable Output** | `min(currentAura, accessibleOutput)` |
| **Aura Regeneration (per hour)** | `n = (VIT-10)/5`; `50ⁿ · 2^(n(n-1)/2)` |
| **Internal Aura Density** | `allocatedAura / coveredVolumeL` — Aura/L |
| **Surface Aura Density** | `allocatedAura / (coveredSurfaceAreaCm2 / 10000)` — Aura/m² |
| **Passive internal Aura** (unawakened) | `currentAura × 0.20`, split by Volume |
| **Baseline Ten coating** | `min(currentAura, 0.05 × O_phys)`, split by Surface Area |

### The three Output figures

They are three different questions and conflating any two produces a plausible wrong answer.

- **Physiological** — what the body can produce. **CON alone.** It is *not* a percentage of Maximum Aura and has no 20%-of-pool ceiling. When CON and VIT are equal the Pool and Output formulas happen to place it at exactly 20% of Maximum Aura; when they differ it is some other fraction, and nothing computes it that way.
- **Accessible** — the share the character's current state can reach. Ren raises the fraction, Zetsu closes it, the default Ten state opens 5% of it. None of them move the physiological figure.
- **Usable** — accessible, capped by Current Aura, because reachable capacity is not Aura you have.

### Access states (`access.ts`)

A closed, typed model, so the resolver never branches on the name of a Nen principle. It reads a fraction and two permissions.

| State | Nodes | Access fraction | Internal | Surface | Passive |
|---|---|---|---|---|---|
| `unawakened` | half-open | 0 | — | — | pseudo-Chū |
| `uncontained` | open | 0 | — | permitted | — |
| `ten` | open | 0.05 | — | permitted | — |
| `override` | open | as supplied | as supplied | as supplied | — |

Overrides are a closed union: `output-access` (Ren), `suppressed` (Zetsu), `internal-access` (Chū), `explicit` (everything else). None of those principles' mechanics are implemented; the shapes exist so they plug in rather than being special-cased. Effective Ten Mastery, after seals, decides one thing only — whether Ten is available.

**Pseudo-Chū is not Output.** An unawakened body converts 20% of *Current Aura* into internal reinforcement through half-open nodes. It consumes no Output capacity, deducts nothing from the reserve, weakens as the character is drained, and disappears at awakening. An awakened character's internal Density is **zero** unless an access override explicitly permits internal placement.

### Aura Control (`control.ts`)

Derived from resolved DEX, affects deliberate expenditure **cost only** — not Maximum Aura, Output, Distribution, Density, reinforcement strength, mastery, permission, or involuntary loss. Two curves meeting at DEX 22, which is perfect mortal control:

```
D ≤ 22   M(D) = (1 + (D - 22)/20) ^ -log₄(5)      → 2 significant figures
D > 22   M(D) = (1 + (D - 22)/10) ^ -2.75         → 1 significant figure
D < 7    uses the DEX 7 result
```

The rounding is part of the calculation, not display formatting. DEX ≤7 → ×5.0 · 10 → ×2.9 · 15 → ×1.6 · 20 → ×1.1 · **22 → ×1.0** · 23 → ×0.8 · 25 → ×0.5 · 30 → ×0.2 · 36 → ×0.09 · 50 → ×0.03. There is **no maximum supported DEX**; the superhuman curve stays defined, positive and falling. Final Cost is *not* rounded — fractional Aura stays precise. `AuraControl` carries the multiplier and nothing else: permission belongs to access and to the application's own requirements.

### Placement, aggregation and the shared budget

Stored allocations and the automatic Ten coating draw on **one** usable-Output budget; pseudo-Chū bypasses it. Same-placement contributions on a Body Part add their Aura and their densities; internal (Aura/L) and surface (Aura/m²) never combine — how the layers interact is reinforcement's decision.

`resolveAuraProfile` **reconciles** rather than refuses: stored allocations whose anatomy is not manifested, whose placement is not permitted, or that no longer fit the budget are removed or scaled proportionally, and every adjustment is listed in `ResolvedAuraProfile.adjustments`. Stored state is untouched. That keeps `validateCharacter` from judging allocations against runtime Output, which is a boundary the previous ticket drew deliberately.

### State transitions (`transitions.ts`)

Pure, immutable, atomic. All return `EngineResult<AuraStateTransition>` and leave the input state untouched on success and on failure.

| Operation | Current Aura | Control |
|---|---|---|
| `spendAura` | `−(baseCost × multiplier)` | applied |
| `drainAura` | `−amount` | bypassed |
| `replaceAuraAllocations` / `upsert` / `remove` / `clear` | unchanged | n/a |
| `reconcileAuraState` | unchanged | n/a |

`replaceAuraAllocations` is the primary operation and the only one that validates; the rest delegate to it. Every operation ends in reconciliation, because Current Aura caps usable Output and a drain can invalidate a placement nobody touched.

### The Aura balance, and the one reserve

Aura is the character's **only** expendable reserve — there is no Stamina bar. Every change composes through one equation, and `advanceAuraTime` (`time.ts`) is the only thing that applies all of it at once:

```
A' = clamp(A + recovery − physical − deliberate − upkeep − leakage − forcedDrain, 0, A_max)
```

| Term | Scaled by | Formula |
|---|---|---|
| **recovery** | recovery context | `R_VIT × M_recovery × t`, capped at missing Aura |
| **physical** | **Stamina** | `A_max × 0.001 × ExertionLoad × (10 / Stamina)` |
| **deliberate** | **Control** | `baseCost × M_Control` |
| **upkeep** | **Control** | `baseRate × M_Control × t` (rate quoted per hour or per Round) |
| **leakage** | nothing | uncontained only: `A_max / H_wake` per hour |
| **forced drain** | nothing | whatever something else took |

Allocation is deliberately absent from the equation: placing Aura through Output changes the distribution and does not touch the reserve. Every transition carries an `AuraBalance` itemising which terms it moved, with the rest at zero.

### Physical expenditure (`expenditure.ts`)

Cost scales with **Maximum Aura**, which is what makes one reserve work across the power range. A superhuman's ordinary punch and an ordinary person's ordinary punch are both Exertion Load 1 — the same relative effort — and the superhuman pays vastly more absolute Aura for a vastly more destructive punch, while their higher Stamina makes it a smaller share of a much larger pool:

| | Max Aura | Stamina | ordinary punch | as % of pool |
|---|---|---|---|---|
| CON 10 / VIT 10 | 10 | 10 | 0.01 | 0.1% |
| CON 20 / VIT 20 | 50,000 | 20 | 25 | 0.05% |

Discrete loads: negligible 0 · light 0.25 · **ordinary committed 1** · forceful 2 · maximal 4 · desperate overexertion 8. Sustained loads are quoted per hour (0 / 5 / 15 / 50 / 100) and at Stamina 10 come out as 0%, 0.5%, 1.5%, 5% and 10% of Maximum Aura per hour. **Ordinary waking is free on both scales** — the cost of merely being awake is wakefulness, which is a different axis.

Load is supplied by Combat and the action layer, never inferred here, and is **relative to the actor**: a superhuman pulling a blow down to human force is doing something light for them. Combat will eventually derive it from force used over maximum force available.

Physical cost bypasses Control and works before and after awakening — awakening gates deliberate projection, not metabolism. `spendActionAura` charges both halves of an Aura-enhanced action in one transaction, because two calls can half-succeed. Required Output is checked and **not** spent.

### Recovery (`recovery.ts`)

The unrestricted `replenishAura(pool, attributes, hours)` is **gone**. It restored at the full VIT rate for any hours handed to it, so an ordinary waking day was a full heal and rest, sleep and Zetsu were decoration on something already free. Recovery now needs an explicit context:

| Context | Multiplier |
|---|---|
| ordinary waking | ×0 |
| intentional rest | ×0.5 |
| sleep | ×1.0 |
| rest + Zetsu I–X | ×1.0 – ×5.0 |
| forced Zetsu | ×1.0 |

Suppression **replaces** the mode multiplier rather than multiplying it — rest + Zetsu I is ×1.0, not ×0.5 — implemented as the maximum of the two, which also stops it downgrading someone already asleep. Voluntary suppression is worth nothing to a character who is not resting; forced suppression applies regardless. Aura never asks which principle is suppressing: it is handed a multiplier and a label.

### Uncontained leakage (`leakage.ts`)

One state leaks: awakened, no effective Ten. `ResolvedAuraAccess.uncontained` says so explicitly rather than being inferred from a missing coating — Chū has no coating and is containing Aura internally, and Zetsu has closed the nodes.

`L = A_max / H_wake`, so a character empties in exactly as long as they could have stayed awake: a full standard reserve in **48 hours**, a half-full one in 24, a 50,000 pool in its own 120. Control does not apply. Reaching zero returns a typed `AuraCollapse` requesting `end-uncontained-state`, `forced-zetsu`, `blackout` and `clear-usable-output` — Aura implements none of those.

### Upkeep (`upkeep.ts`)

`baseRate × M_Control × t`, with rates quoted per hour or per Combat Round. Baseline Ten and pseudo-Chū cost **nothing**: Ten occupies Output without withdrawing from the reserve, and pseudo-Chū is a conversion of Current Aura rather than a withdrawal.

Unaffordable upkeep has two correct answers. `payAuraUpkeep` fails **atomically** — a caller asking to pay wanted a transaction. `advanceAuraTime` **shuts the effect down** instead, because hours passing is not a request that can be refused.

### Time resolution (`time.ts`)

`advanceAuraTime` takes a `GameTimeInterval`, never a bare hour count, and resolves it **continuously**. The span is split wherever the active rates change and each segment integrated at constant rates; boundary times are solved for algebraically, never stepped towards.

Recognised boundaries: the pool reaching Maximum · the pool reaching zero · an upkeep shutdown · a collapse · an activity mode change · suppression beginning or ending · a timed effect starting or expiring · a scheduled instantaneous action · the interval's end.

The property this buys:

```
advance(T) === advance(T / N), applied N times
```

verified at 1, 2, 5, 60 and 600 subdivisions and at **28,800 one-second steps** across eight hours. The previous implementation summed everything over the whole submitted span and clamped once, so the answer depended on how the caller chopped up the day.

**Recovery is netted uncapped** and only the pool is clamped. Capping it against missing Aura first is what produced the contradiction; now a character at full Aura pays an upkeep out of incoming regeneration indefinitely and the surplus is discarded. Reported as `recovery: {potential, used, discarded}` — 5,000/hour against a 100/hour upkeep at full is potential 5,000, used 100, discarded 4,900.

**Upkeep runs until the exact instant it cannot be carried.** 150 Aura against 100/hour across two hours runs 90 minutes, is charged 150, and shuts down at `start + 1.5h`; the remaining half hour resolves without it. Commitments carry an optional `priority` and optional `startsAt` / `endsAt`. When the balance cannot carry several, the lowest priority sheds first and shedding stops as soon as what remains is sustainable; equal priorities break by **commitment id**, never by array order. Expiry is reported as an expiry, not a shutdown.

**Instantaneous events** resolve at their own timestamps:

```ts
interface ScheduledAuraEvent {
  readonly at: GameTimestamp;
  readonly kind: "physical" | "deliberate" | "forced-drain" | "recovery";
  readonly source: string;
  readonly amount: number;   // already Stamina- or Control-scaled
}
```

They replaced the accumulated `discretePhysical` / `discreteDeliberate` / `forcedDrain` fields, which could only ever be smeared across the whole interval — so a strike landing in the last minute of an eight-hour advance was charged as though it had been happening all night.

Events sharing a timestamp resolve as **one instant**: recovery and drain are summed separately and the pool clamped once, so a 500 drain and a 900 heal at the same moment on a pool of 100 give the same answer whichever the caller listed first. Discarded recovery is split across simultaneous sources in proportion.

The result carries a timestamped `events` list and the `segments` the interval was cut into, plus `unmetDrain` for the drain an empty pool could not pay for.

### The timeline validator (`timeline.ts`)

One validator judges the whole of `AdvanceAuraTimeInput` before the solver calculates anything. The solver used to validate as it went, which meant it validated only what it happened to look at:

| What slipped through | What it did |
|---|---|
| an unrecognised event `kind` | fell through the dispatch and became a forced drain |
| duplicate or empty upkeep ids | charged twice |
| a `NaN` suppression multiplier | silently ignored; the mode's own rate used instead |
| a timestamp fifty hours before the interval | applied inside it anyway |
| an event on `endedAt` | applied here AND by the next interval |

It validates modes and activity levels against their vocabularies, suppression sources and multipliers, event kinds, sources, amounts and timestamps, activity-change timestamps and duplicates, and every upkeep commitment through the shared `findAuraUpkeepIssues` — which `payAuraUpkeep` and `deriveAuraUpkeep` also use, so one predicate decides. **Nothing is partially processed.** It also resolves the activity windows and groups simultaneous events, so the solver consumes a shape that cannot be malformed.

`AuraUpkeepCommitment` gains `endsAt > startsAt` and finite-priority checks. A commitment whose `startsAt` predates the interval was already running and emits no `upkeep-started`; one ending exactly at `endedAt` may emit its expiry there, having been active throughout.

### Suppression and leakage

`uncontained` (does this character bleed at all) and suppression (are the nodes shut right now) are **separate facts**, and conflating them had a character in Zetsu still losing Aura through nodes the Zetsu had closed — and still able to collapse from it.

Leakage is therefore computed per segment as `uncontainedByDefault && !suppressed && !collapsed`. It stops at the instant suppression begins, resumes when suppression lifts if the character is still fundamentally uncontained, and cannot cause a collapse while suppression is active. Recovery continues at the supplied multiplier throughout. Suppression interrupts; it does not cure.

### Recovery provenance

Accumulated **per constant-rate segment**, not summarised over the interval. The summary version reported the interval's initial activity as though it had held throughout, producing contributions like `multiplier: 0, hours: 4, restored: 10,000` for a character who woke, worked and then slept — every field true of the first instant and none true of the interval.

Each `AuraRecoveryContribution` carries `source`, `context`, `ratePerHour`, `multiplier`, `hours`, and `potential` / `used` / `discarded`. Identical stretches merge; a mode or suppression change opens a new one. `AURA_RECOVERY_SOURCES` gained `"scheduled-event"` so a healing potion is no longer reported as the character's own metabolism.

Invariants, to `1e-9` relative:

```
sum(contribution.potential)  = recovery.potential
sum(contribution.used)       = recovery.used
sum(contribution.discarded)  = recovery.discarded
recovery.potential           = recovery.used + recovery.discarded
balance.recovery             = recovery.used
contribution.potential       = ratePerHour × multiplier × hours   (continuous only)
```

### Charged durations

`AuraUpkeepCharge.hours` is how long that commitment was **actually charged**, not the enclosing interval's length. An effect starting three hours into a four-hour advance used to report four hours against a one-hour cost, breaking its own invariant. Now `cost ≈ ratePerHour × hours` holds for late starts, expiries, insufficient-Aura and access-lost shutdowns, effects that predate the interval, and effects ending exactly on `endedAt`.

### Deliberate access (§ enforced)

|  | unawakened | awakened with access | suppressed |
|---|---|---|---|
| physical exertion | allowed | allowed | allowed |
| involuntary drain | allowed | allowed | allowed |
| uncontained leakage | n/a | when uncontained | disabled |
| **deliberate expenditure** | **refused** | allowed | **refused** |
| **deliberate upkeep** | **refused** | allowed | **refused** |

`hasDeliberateAuraAccess` is the one predicate, and `spendAura`, the deliberate half of `spendActionAura` and `payAuraUpkeep` all consult it. Keyed off the **base Aura cost**, not required Output — a technique that costs Aura and places none must not slip through a zero-Output check. Over an interval the answer differs and both are right: hours passing cannot be refused, so suppression beginning mid-span drops running effects at that instant with `reason: "access-lost"`.

### Activity validation

Ordinary waking covers walking, talking, eating and desk work at **zero** expenditure, and permits any activity level on top. Rest and sleep are defined as the body doing nothing, so `{mode: "sleep", activity: "extreme"}` is refused unless an `exertionOverride` names both its source and its reason.

### Not implemented here

Attack-force-to-BP conversion, Injury generation, concrete penalties for Fatigue 5–8, final Nen activation/upkeep formulas, Chū reinforcement strength, Trait/Species/equipment modifiers, advanced Zetsu substitution for sleep, and Workbench integration.

---

## 7. Nen (`foundation/nen/`, ~3,800 LOC) — **NOT exported from the public barrel**

The largest complete-but-unreachable subsystem. It is the deliberate exception to "content is data": each principle carries substantial bespoke Aura math.

### The dependency graph (`nen.ts`, `NEN_PRINCIPLE_GRAPH`)

15 principles. **Universal rule: to hold Mastery N in a child, every prerequisite applying at N must hold at least N** — so child Mastery ≤ lowest applicable prerequisite Mastery.

| Principle | Prerequisites | Conditional | Contextual |
|---|---|---|---|
| ten | — | | |
| ren | ten | | |
| zetsu | ren | | |
| hatsu | zetsu | | |
| shu | ten | | |
| en | ten, ren | | |
| gyo | ren | | |
| ken | ten, ren | | |
| chu | ten, ren, zetsu | | |
| in | zetsu | | |
| ko | ten, ren, zetsu, gyo | chu from rank VI | shu when weapon |
| ryu | gyo, ken | chu from rank VI | shu when weapon |
| yu | gyo, ren, chu, hatsu | | |
| ju | ken, chu, hatsu | | |
| fu | en, hatsu | | |

Foundational learning order is Ten → Ren → Zetsu → Hatsu. `nen.ts` also owns awakening-state validation, structural ceilings, **temporary mastery seals** (`NenMasterySeals` — permanent rank is never reduced; seals cap *access*), and propagation of seals through dependents.

`NenMasteryRank` is an alias of `capabilities/mastery.ts`'s `MasteryValue` — one rank vocabulary engine-wide.

### Implemented principles (4 of 15)

**Ten** (346 LOC) — Aura containment. Indefinitely maintainable from I. Determines how much Output can be handled *efficiently* (vs Ren's how much can be *produced*).

| Rank | min DEX | containment fraction | passive leakage (fraction of regen) |
|---|---|---|---|
| I–II | 12 | 0.10 / 0.20 | 1.00 / 0.80 |
| III–IV | 13 | 0.30 / 0.40 | 0.60 / 0.45 |
| V–VI | 14 | 0.50 / 0.60 | 0.30 / 0.20 |
| VII–VIII | 15 | 0.70 / 0.80 | 0.125 / 0.075 |
| IX–X | 16 | 0.90 / 1.00 | 0.025 / 0.00 |

Imperfect Ten consumes part of Aura Regeneration Capacity; it never drains Current Aura directly.

**Ren** (889 LOC) — active Output. CON-based. Access fraction 10%→100% across I→X.

| Rank | min CON | access | full-Output endurance |
|---|---|---|---|
| I / II | 12 | 0.10 / 0.20 | 1 / 2 min |
| III / IV | 13 | 0.30 / 0.40 | 5 / 10 min |
| V / VI | 14 | 0.50 / 0.60 | 20 / 30 min |
| VII / VIII | 15 | 0.70 / 0.80 | 60 / 120 min |
| IX / X | 16 | 0.90 / 1.00 | 240 min / **unlimited** |

Owns Ren endurance, exertion minutes, and the waste/diminishing-returns consequences of exceeding Ten's containment limit (`resolveRenContainmentEfficiency`, `deriveRenContainmentAuraLoss`).

**Zetsu** (914 LOC) — suppression. Active Output = 0 at every rank; underlying capacities untouched. Indefinitely maintainable from I.

| Rank | I | II | III | IV | V | VI | VII | VIII | IX | X |
|---|---|---|---|---|---|---|---|---|---|---|
| Replenishment ×| 1.00 | 1.25 | 1.50 | 1.75 | 2.00 | 2.50 | 3.00 | 3.50 | 4.00 | 5.00 |
| Aura Concealment | +1 | +1 | +1 | +2 | +2 | +3 | +3 | +4 | +4 | +5 |

Concealment is a **situational modifier to the ordinary Concealment Derived Attribute** against aura detection — not a special check, not a score change. This file was rewritten in the uncommitted work to route through the new Derived Attributes.

**Hatsu** (530 LOC) — expression. `HATSU_EFFECT_MINIMUM_MASTERY = 3` to create a personal Nen Ability. Generic effect multiplier from III: III ×0.60, IV ×0.80, V ×1.00, VI ×1.20, VII ×1.40, VIII ×1.60, IX ×1.80, X ×2.00. Deliberately agnostic about what it scales — the caller decides what counts as an eligible Hatsu effect. Costs/cooldowns/requirements are never auto-scaled.

**Not implemented:** shu, en, gyo, ken, chu, in, ko, ryu, yu, ju, fu (graph nodes exist; no principle files). Nen Abilities have no subsystem at all.

---

## 8. Capabilities, identity, status, equipment

### Mastery (`capabilities/mastery.ts`)

Numeric 1–10 internally, Roman I–X for display. `NO_MASTERY = 0`, `STANDARD_MASTERY_MAX = 10`. `MasteryRankDefinition {rank, description?, growthPointCost?, requirements?, effects?}` — **cumulative**: holding III means I, II and III all apply. `MasteryTrack {maximumMastery, ranks?}` (sparse by design). Technique Mastery = breadth (usually grants a Skill); Skill Mastery = depth.

**Mastery is optional and definition-specific.** A Skill or Technique declares `mastery?: MasteryTrack` — a track of any length, or none at all. `trackMastery(track, stored)` is the single reading of a stored rank: I when a track exists and nothing is stored, the stored rank when there is one, and `null` when there is no track. A rank stored against a trackless capability is a validation error (`character.skill.mastery_unsupported`), not a rank to honour. **Null is not zero**: null means held with no Mastery, while not being held at all is absence from the resolved record.

### Techniques — 3 authored

| Technique | max | ranks |
|---|---|---|
| martial-arts | X | I→grant `punch`, II→grant `parry`, III→grant `defensive-stance` |
| lockpicking | V | I→grant `pick-lock` |
| firebending-forms | X | requires Trait `firebending`; I→grant `fire-blast` |

### Skills — 5 authored

| Skill | timings | max | requirements |
|---|---|---|---|
| punch | action | X | hasTechnique martial-arts |
| parry | reaction | X | techniqueMastery martial-arts ≥ II |
| defensive-stance | action | X | techniqueMastery martial-arts ≥ III |
| pick-lock | action | V | hasTechnique lockpicking |
| fire-blast | action | X | all[ hasTrait firebending, hasTechnique firebending-forms ] |

`SkillTiming` = `"action" | "reaction"`, relevant only under structured timing. `attempts.ts` defines `DefinedSkillAttempt` / `ImprovisedSkillAttempt` (types only — improvised attempts have no resolution yet).

`capabilities/resolution.ts` folds authored capabilities with granted access, keeping both visible: `ResolvedCapability` records `isAuthored`, `isGranted`, `grantedBy` sources, `supportsMastery`, an optional `authoredMastery`, a `mastery` of a rank **or `null`**, plus `availability`, `unlockedBy` and `subsumedBy`. `getResolvedSkillMastery` / `getResolvedTechniqueMastery` answer a rank / `null` (held, no Mastery) / `undefined` (not held — including a capability that is only unlocked). It takes the authored `CharacterSkill` / `CharacterTechnique` entries rather than an id→rank record, since a record cannot describe a capability that is held and has no rank. **Possession is never `mastery > 0`** — enforced by `architecture.test.ts` — and it is no longer bare presence either, since the record also holds capabilities that are only unlocked; use `hasResolvedSkill` / `isHeldCapability`.

### Capability lifecycle (`capabilities/lifecycle.ts`, `capabilities/dependencies.ts`)

`CapabilityKind` (`trait` | `technique` | `skill`), `CapabilityRef` and `CapabilityGrantMode` are declared in `rules/effects.ts` — the mode is a field on the three grant Effects — and re-exported from `lifecycle.ts`.

**Grant modes.** `grantTrait` / `grantSkill` / `grantTechnique` each take an optional `mode`:

| mode | means |
|---|---|
| `granted-while-present` (default) | access for as long as some source supplies it |
| `unlocked-for-acquisition` | permission to acquire; **no access** |
| `granted-permanently` | access now, plus a `CapabilityAward` the caller commits |

An omitted mode is a loan, so every grant authored before modes still means what it said. `resolveCharacter` returns `capabilityAwards` and never writes them — commit with `commitCapabilityAwards` / `commitCapabilityAwardsToCharacter`, which are idempotent.

**Two gates.** A definition may declare `requiresUnlock?: boolean` — prerequisites are not the whole gate, and something must also be offering it. `CapabilityAcquisitionEvaluation` reports `disposition` (prerequisites), `unlocked` and `requiresUnlock` separately plus `acquisition`, the decision they combine to; act on `acquisition`, read the parts to say *which* gate is shut. An unlock supplies permission and never prerequisites, in resolution and in dependency analysis alike.

**Availability.** `available` (theirs), `subsumed` (superseded, still on the record and still satisfying requirements naming it), `inaccessible` (on the record without access — what an unlock produces). Application-level inaccessibility is Ticket 3.3's.

**Acquisition requirements are a moment, not a lease.** A definition's `requirements` are checked when the capability is taken up. Losing one afterwards does not delete the capability; character validation reports it as a **warning** (`character.skill.requirements_unsatisfied`), never an error. `evaluateCapabilityAcquisition` (requirements passed in) and `evaluateAcquisition` (catalog-aware) are pure and answer `satisfied` / `unsatisfied` / `unresolved`.

**Subsumption.** `subsumes?: readonly Id[]` on a Skill, Technique or Trait definition, same-kind only. Declared, never inferred — `parentTraitId` is taxonomy and implies nothing. The survivor inherits the subsumed capability's effects and grants, transitively, **once** even when two replacements name the same predecessor, and at the subsumed capability's own Mastery.

**Dependency analysis.** `findCapabilityDependencyIssues()` (folded into `findCatalogReferenceIssues()`) runs a least fixed point over what is obtainable rather than a cycle search, so `A requires B OR C` with `B requires A` and an obtainable `C` is accepted while a direct `A ⇄ B` deadlock is rejected. Nodes are (capability, rank), so unreachable Mastery ranks are caught separately. Access grants and subsumption widen reachability; **unlocks do not**, so an offer never rescues a capability whose prerequisites are impossible, and a `requiresUnlock` capability nothing obtainable offers is itself reported. It also rejects self-, cross-kind and cyclic subsumption, and Traits requiring Skills or Techniques (a learnable Trait is *awarded* after training, never gated on a Skill).

### Species — 8 authored

`human` (root), plus 7 Sub-species of human: `firebender`, `waterbender`, `earthbender`, `airbender`, `lightningbender`, `metalbender` (each grants its matching Trait), and `bloodkin` (no effects).

Species is a **mix**: `CharacterSpecies {speciesId, percentage}[]` totalling exactly **100** (tolerance 0.011, so 33.33/33.33/33.34 passes). Plain human is the one-entry case, not a different shape. A Sub-species is just a Species with `parentSpeciesId` — `speciesAncestry()` walks it (max depth 16), so a Human Firebender satisfies any "hasSpecies human" requirement for free.

### Clans — 1 authored: `uchiha` (classification only, no mechanics).

### Traits — 12 authored

`one-armed` (modifyBaseAttribute dex -2) · the 6 bending traits · `jinchuriki` · `heavenly-restriction` · `devil-fruit-user` · `infernal`.

`ResolvedTrait {traitId, isAuthored, grantedBy: RuleSourceRef[]}` — an authored Trait survives its granter disappearing; a purely-granted one disappears with its last source. Sub-traits (`parentTraitId`) record taxonomy only; an ordinary `grantTrait` Effect is what actually confers one.

**The Trait/Condition line is integration, not duration.** Poison is a Condition. The scar it leaves is a Trait.

### Status

`stage.ts` — the shared expiry/progression/stacking vocabulary. **Stage effects are NOT cumulative** (unlike Mastery): stage 3 gets stage 3's effects only. Severity is a plain count with **no engine-interpreted math**. Duration is a countdown in whatever unit the host assigns; the engine only honours the zero point — it never decrements and doesn't know what a "round" is.

**Conditions — 11 authored, all classification-only (zero Effects):** frightened, paralyzed, numbed, prone, grappled, restrained, blinded, exhausted, flat-footed, marked, leaking. This is deliberate: their d20 penalties, halved Strike and advantage swings need combat mechanics that don't exist. That's a missing *mechanic*, not missing content.

**Injuries — machinery complete, `INJURY_DEFINITIONS` is EMPTY `{}`.**

```ts
InjuryDefinition extends EffectfulDefinition {
  applicability: { bodyParts?: BodyPartSelector; specialPointDefinitionIds?: NonEmptyArray<id> }  // ≥1 dimension required; both must match if both present
  recovery: { treatmentRequired: false } | { treatmentRequired: true; bpRecoveryCeilingFraction: number }
  treatmentEffects?: { untreated?: Effect[]; treated?: Effect[] }
}
CharacterInjury { id, injuryId, location: {bodyPartIds: NonEmpty, specialPointDefinitionId?}, treatmentStatus? }
```

`injuryId` is **not** unique per character (two broken arms); `CharacterInjury.id` is the instance identity. Injuries have no stage/severity track — Bleeding vs Heavy Bleeding are separate Conditions, not stages. Treatment never restores BP or removes the Injury; it only lifts the recovery ceiling.

### Equipment — 2 authored items

`gauntlets` (equippedEffects: STR +2), `cursed-idol` (possessedEffects: CHA -1). `ItemDefinition` supports `possessedEffects`, `equippedEffects`, `useEffects`, `equipRequirements`, `useRequirements`. `useEffects` are declared but **not executed anywhere** — no use-item pipeline exists.

---

## 9. Progression (`character/progression/`, ~3,400 LOC)

### Levels

`MIN = 1`, `MAX = 30`, `POST_CAP_MILESTONE_LEVEL_INTERVAL = 5`.

**XP curve:** raw cost L→L+1 is `5 + 0.75L + L³/75`, then rounded to one significant figure. Lifetime thresholds sum the **already-rounded** costs.

| Level | 1→2 | 10→11 | 20→21 | 29→30 |
|---|---|---|---|---|
| raw | 5.76 | 25.83 | 126.66 | 351.93 |
| rounded | 6 | 30 | 100 | 400 |

Cumulative: L5 = 30 · L10 = 100 · L15 = 290 · L20 = 700 · L25 = 1,500 · **L30 = 3,000 (`LEVEL_CAP_LIFETIME_XP`)**.

**Post-cap:** the formula continues past 30 but Level does not. Every 5 formula-levels = one Post-Cap Milestone. Post-Cap I = 5,400 XP · II = 9,000 · III = 13,900. A character at 9,000 XP is **Level 30, Post-Cap Milestone II**.

### Stat Points

Starting array for the eight ordinary Attributes: **11, 11, 10, 10, 10, 10, 9, 9** (total 80, average 10). SPI/CHA are rolled separately and excluded.

`STARTING_STAT_POINTS = 2`, `STAT_POINTS_PER_LEVEL_GAINED = 2`, `POST_CAP_STAT_POINTS_PER_MILESTONE = 1`. → L1 = 2 SP, L10 = 20, L20 = 40, L30 = 60, Post-Cap I = 61.

+1 to a Base Attribute costs exactly 1 SP. **Limited Stat Point grants** (`applyLimitedStatPointGrant`) are the only route to permanently raising SPI or CHA.

### Growth Points

`GROWTH_POINTS_PER_LEVEL = 3`, `POST_CAP_GROWTH_POINTS_PER_MILESTONE = 3`. → L1 = 3, L10 = 30, L20 = 60, L30 = 90, Post-Cap I = 93.

GP is **generic currency**. The capability owns its own cost (`MasteryRankDefinition.growthPointCost`); `growth.ts` only performs the deduction once something else has said the advancement is valid.

Progression only ever writes **stored** values — which is why it sits outside `foundation/`.

---

## 10. Recovery (`character/mechanics/recovery/`)

The Body↔Status seam; the only file allowed to know a BodyPart's `recoveryProgress` and an Injury's treatment state simultaneously.

**Daily recovery fraction:** `0.10 × 2^((VIT - 10) / 5)` — same reference (10) and doubling interval (5) as the CON→BP ladder. At VIT 10, a damaged part recovers 10% of Maximum BP per 24 game hours.

Per-pass pipeline:
1. Resolve Body Points once (needed for damaged *and* healthy parts — the latter to tell whether an Injury's other parts are already full).
2. Derive the daily fraction from VIT and the raw BP it represents over the elapsed `GameDuration`.
3. Per damaged part, reduce all currently-active untreated Injury caps to **one effective ceiling** (the lowest — caps only restrict).
4. Call `applyBodyPartRecovery()` once per damaged part.
5. Report Injuries whose **entire** location has reached Maximum BP as fully healed.

It **reports** healed Injury ids; it never mutates `character.injuries` — mirroring `body/damage.ts` reporting destroyed part ids. A treatment-required Injury with no recorded status is treated as untreated (the conservative default, and the state every such Injury starts in).

`detectInjuryOverlap()` surfaces a **non-blocking GM decision** when a second Injury lands on anatomy carrying banked recovery progress. Default: preserve it (decision `injury.overlap.recovery-progress-default`).

---

## 11. Time, catalogs, orchestration, validation

### Time (`time/`, ~1,200 LOC)

`GameTimestamp` = ms from calendar epoch (absolute). `GameDuration` = ms (quantity). `GameDateTime {year, month, day, hour, minute, second}` derived via the calendar, never independently mutable.

`GameClockState {currentTime, campaignStartedAt, mode, timeScale, fractionalMs}`. Modes: `running` (real time advances game time by `timeScale`), `paused`, `combat` (combat advances the clock explicitly). `fractionalMs` prevents precision loss under sub-millisecond scaling.

`calendar.ts` — 12 months, leap years, `to/fromGameDateTime`. `clock.ts` — create/advance/pause/resume/enter-combat/leave-combat. `validation.ts` — 9 validators. `interval.ts` — the elapsed span every mechanic consumes.

**`GameClockState.currentTime` is the sole authoritative world time.** Nothing else keeps its own, and a host may refresh a display on whatever interval it likes without gameplay depending on it.

#### The authoritative units

All in `duration.ts`, all exported, and everything that converts reads them rather than carrying a copy:

`GAME_MILLISECONDS_PER_SECOND` · `_MINUTE` · `_HOUR` · `_DAY` · `GAME_SECONDS_PER_MINUTE` · `GAME_MINUTES_PER_HOUR` · `GAME_HOURS_PER_DAY` · `GAME_SECONDS_PER_HOUR`.

**`SECONDS_PER_COMBAT_ROUND = 2`**, so `COMBAT_ROUNDS_PER_HOUR = 1800` and `GAME_MILLISECONDS_PER_COMBAT_ROUND = 2000`. `calendar.ts` had four private copies of the same numbers and Combat had its own round length; both now alias these. `gameplay/combat/round.ts` re-exports the round as `COMBAT_ROUND_DURATION_SECONDS`, the name Combat callers already use, and `foundation/attributes/speed.ts` imports it to denominate movement per Round.

#### Intervals

```ts
interface GameTimeInterval {
  readonly startedAt: GameTimestamp;
  readonly endedAt: GameTimestamp;
  readonly elapsed: GameDuration;   // checked against the endpoints
}
```

The redundancy is the point: an interval whose `elapsed` disagrees with its endpoints is refused in `validateGameTimeInterval` rather than charging a mechanic for the wrong span three domains away. Backwards intervals are refused; zero-length ones are legal and mean nothing happened.

**An interval is half-open, `[startedAt, endedAt)`,** and the two questions have two names so they cannot be confused:

- `intervalOwns(interval, at)` — half-open. Whether this interval is responsible for what a CALLER scheduled at that instant.
- `intervalReaches(interval, at)` — inclusive. Whether an OUTCOME lies in or on the span.

Two adjacent intervals meet at one timestamp. An inclusive rule for inputs would have both apply the same strike, so chained advancement would charge every boundary action twice. Solver outcomes are the other way round: a pool emptying exactly at `endedAt` emptied during this interval and is reported by it, and nothing re-claims that instant because the next interval starts from the state this one left.

`advanceGameClock(clock, duration)` returns `GameClockTransition {previous, clock, interval}`, and `advanceGameClockFromRealTime` does the same from real elapsed time. `advanceGameTime` survives as a wrapper for callers that only want the new clock. A paused or combat clock crosses a **zero-length** interval rather than none at all, so a projection asked to bring a character up to a stopped clock resolves to "nothing happened" instead of failing.

Manual time skips, ordinary progression and combat time all produce the same shape, which is what lets one coordinator consume all three.

The whole of `time/` is now exported.

### Character time (`character/time/`)

The coordinator between the clock and a character. **Time imports nothing from Aura or Body; neither may read or advance the clock.**

`advanceCharacterTime({character, temporalState, interval, activity, activeEffects})` hands ONE interval to Aura recovery, sustained expenditure, upkeep, leakage, wakefulness and Fatigue. They are not independent — the same hours decide how much Aura came back AND how much sleep debt was paid, and Fatigue reads both — so three callers each advancing one domain would be three chances to disagree.

```ts
interface CharacterTemporalState { readonly resolvedAt: GameTimestamp; }
```

One timestamp per character, recording when their stored Aura and wakefulness were last committed. An advance may only start **exactly** there: `character.time.interval.stale` going backwards, `.gap` going forwards. That is what makes double application impossible in a system with both a live clock and a manual time skip.

Runtime activity, active principles and maintained effects stay **outside** `NenState` and outside the character. They are scene state the caller already holds; a sheet that persisted "Ren is active" could be loaded into a world where it is not.

`projectCharacterAtTime({character, temporalState, currentTime, activity, activeEffects})` runs the same coordinator from `resolvedAt` to now and persists nothing. A sheet shows live Aura, wakefulness and Fatigue without a tick walking every character; an NPC nobody has opened for three in-world days costs nothing until somebody opens them. **Projection and commitment are one implementation**, so a display cannot drift from what saving would produce. Before resolving an action: commit the projection through the action's timestamp, then resolve against `projection.character`.

### Catalogs (`character/catalogs.ts`)

One generic surface over **10 domains**: `species` · `clan` · `trait` · `technique` · `skill` · `condition` · `injury` · `item` · `body-part` · `special-point`. `CatalogDefinitions` maps each to its own definition type, so naming a domain literally gets that type back.

API: `listDefinitions` · `listCustomDefinitions` · `getDefinition` · `isKnownDefinitionId` · `registerDefinition` · `unregisterDefinition` · `clearCustomDefinitions` · `exportCustomDefinitions` · `createDefinitionId(domain)` · `definitionIdPattern(domain)` · **`findCatalogReferenceIssues()`**.

That last one is the only place cross-catalog claims can be checked — a Technique granting a Skill and a Skill requiring a Trait are both cross-domain, and neither domain can see the other. A host should run it after loading a homebrew catalog.

Custom definitions live in the host's storage; the engine holds them for the session and validates against them but **never persists them**.

### `character/resolution.ts` — the orchestrator

`resolveCharacter(character) → ResolvedCharacter`. Pure; calling twice gives the same answer.

```
authored character
  ↓ seedSources()      species (ancestry-expanded) + clans + conditions + injuries + items
applicable sources
  ↓ fixpoint expansion  follow grants until nothing new appears (MAX_EXPANSION_PASSES = 32)
every applicable source
  ↓ resolveRuleEffects()
attribute modifiers                        capability grants
  ↓ stored → base → resolved                 ↓ resolved Skills / Techniques
  ↓ resolveDerivedAttributes(RESOLVED)
```

Key decisions:
- Grant expansion is a **fixpoint, not a pass** — a Sub-species grants a Trait which grants Attribute effects. The visited set makes self-granting and mutually-granting content settle instead of looping.
- Expanded **ids**, not sources — a Trait reached from two granters contributes effects once, while both grants are still recorded.
- Seeded from the Mastery **records**, not the arrays: a sheet listing a Skill twice at different ranks would otherwise take the first entry's rank for effects and the last one's for resolved Mastery.
- A grant supplies Mastery I; anything the character trained themselves wins.
- Derived Attributes come off the **resolved** layer, which is what makes propagation free — no second propagation path to fall out of step.
- **It does not check whether the character was allowed to have any of it.** Resolving an ineligible sheet is correct — the workbench must show a character halfway to legal.

`ResolvedCharacter` = `{character, attributes, attributeScores, derivedAttributes, derivedScores, traits, capabilities, effects, baseAttributeModifiers, resolvedAttributeModifiers, requirementContext}`.

### `character/validation.ts` — the validator

`validateCharacter(character) → EngineResult<ResolvedCharacter>`. The single place every domain's plain issue objects become `EngineError`s, so codes/audiences/subjects stay consistent. **36 error codes:**

```
character.id.empty · character.name.empty
character.species.{unknown,duplicate,missing,percentage_invalid,mix_incomplete}
character.clan.{unknown,duplicate}
character.trait.{unknown,duplicate}
character.skill.{unknown,duplicate,mastery_invalid,requirements_unsatisfied}
character.technique.{unknown,duplicate,mastery_invalid,requirements_unsatisfied}
character.condition.{unknown,duplicate,lifecycle_invalid}
character.item.{unknown,duplicate,quantity_invalid}
character.injury.{unknown,instance_id_invalid,instance_id_duplicate,location_invalid,
                  body_part_unknown,body_part_not_applicable,special_point_unknown,
                  special_point_missing,special_point_not_hosted,special_point_not_applicable,
                  treatment_status_invalid}
```

---

## 12. Uncommitted work in progress ⚠️

`git status` shows a substantial in-flight refactor: **bespoke Detection/Investigation mechanics replaced by generic Derived Attributes.** Net −2,171 / +833 lines.

**Deleted (10 files, ~2,144 LOC):**
- `character/mechanics/detection/` — concealment, detection, resolution, senses, types, validation
- `character/mechanics/investigation/` — investigation, resolution, types, validation

**Added:**
- `character/foundation/attributes/derived/` — types, resolution, validation (715 LOC)
- 4 new test files: `attribute-propagation` (7), `check-modifiers` (22), `derived-attributes` (35), `standard-modifier` (39) — **103 new tests**

**Modified:** `attributes/{types,modifiers,resolution}.ts` (added `ResolvedScore`, `deriveStandardModifier`, `resolveAttributeScores`), `rules/{effects,requirements,resolution,validation}.ts` (added `modifyCheck` / `CheckScope` / `derivedAttributeMinimum` / `resolveCheckModifier`), `character/{resolution,validation}.ts`, `nen/principles/zetsu.ts` (rerouted Aura Concealment through the Concealment Derived Attribute), `decisions/log.ts` (+1 entry), `index.ts` (+82 lines of exports).

**Everything typechecks and all 596 tests pass**, so the refactor is functionally complete and uncommitted rather than half-done. A commit is warranted.

The detection *senses* model (sense-specific modifiers, per-sense concealment) was deleted without replacement — the note in `CheckScope`'s comment says a `{kind:"sense", sense: DetectionSenseId}` variant is "a one-line addition when something needs it." That capability is currently **gone**.

---

## 13. What is NOT in the engine

**Moved.** This section used to carry its own gap table and its own "unexported modules (complete
list)". Both are gone: the single authoritative backlog is [`BACKLOG.md`](BACKLOG.md), which
classifies every incomplete mechanic as *Specified but absent*, *Partially implemented*,
*Implemented but internal*, *Implemented but insufficiently tested*, or *Complete*.

The table that stood here was already wrong in ways nobody noticed — it recorded movement as
"Nothing. `athletics` is derived but unconsumed" long after `athletics` had been renamed to
`speed` and wired into `ResolvedCharacter`. That is the argument for one list rather than three.

---

## 14. Test coverage map (27 files, 596 tests)

| Area | Files (tests) |
|---|---|
| Body | body-anatomy (31), body-points (24), body-damage (22), body-selectors (19), body-critical-points (17), body-recovery (17), body-reference-humanoid (13), body-morphology (11) — **154** |
| Attributes | standard-modifier (39), derived-attributes (35), attribute-propagation (7) — **81** |
| Progression | progression (55) |
| Capabilities | skills (41) |
| Character | validation (25), lifecycle (32), character-features (27), classification (23) — **107** |
| Rules | requirements (24), check-modifiers (22), effects (16) — **62** |
| Injuries | injury-validation (18), injury-recovery (13) — **31** |
| Catalogs | catalogs (28) |
| Aura | aura (22) |
| Infrastructure | trace (8), id (3), id.infrastructure (4) — **15** |

Fixtures: `__tests__/fixtures/character.ts`, `__tests__/fixtures/ko-fist-3200.json`.

**Untested / thinly tested:** the entire Nen subsystem (no `nen*.test.ts` at all), aura control, time clock/calendar, equipment beyond the two demo items.

---

## 15. Repository context

```
dnd_worlds/                     npm workspaces, "nenworld"
├── packages/engine/            ← this document
├── apps/workbench/             React + Vite; 25 files import @nenworld/engine
│   └── src/{panels,state,adapters,components,features/{combat,catalog,sandbox,aura,characters,palette}}
├── foundry_module/             planned consumer
└── worldbuilding/              Obsidian vault — the frozen Rulebook + content
    ├── Rulebook/               00-06: Core Rules, Aura Engine, Combat, Progression, Races
    └── Vault/                  host-registered custom content (JSON, one file per entry)
        ├── character-vault/    char-glqzon2i30i0tc07.json
        ├── species-vault/      elf.json
        └── clan/condition/injury/item/skill/technique/trait-vault/   (all empty)
```

Scripts: `npm test` (engine vitest — must be run from `packages/engine`, the root `-w` filter finds no files), `npm run typecheck`, `npm run dev` (workbench).

**Standing project rules:** the engine is authoritative over game mechanics, not the Rulebook prose. The Rulebook is frozen — every divergence gets an entry in `decisions/log.ts` and a `decisionId` on the emitted trace node, rather than an edit to the book.

### The three recorded decisions

1. **`body.surface-units.total`** — the regional SU table sums to 101, text and worked examples divide by 100. Engine uses 100.
2. **`attributes.derived.rounding-direction`** — Derived Attribute ties round up (toward +∞). Asymmetric across zero, and Derived Attributes *can* go negative.
3. **`injury.overlap.recovery-progress-default`** — a second Injury on anatomy with banked recovery progress preserves that progress by default; surfaced to the GM as a non-blocking decision.

---

## 16. Suggested next steps

1. **Commit the Derived Attributes refactor.** It's complete, green, and large enough that leaving it uncommitted is a real risk.
2. **Decide the fate of sense-specific detection.** The senses model was deleted; either add the `{kind:"sense"}` `CheckScope` variant or record that per-sense modifiers are out of scope.
3. **Export the Nen subsystem**, or write down why it is deliberately gated. ~3,800 LOC of finished, untested, unreachable code is the largest single risk in the package. (Aura is now fully exported through its own barrel.)
4. **Write Nen tests.** It is the only major subsystem with zero coverage.
5. **Author Injury content.** The machinery, validation, and recovery integration are all done and tested against an empty catalog.
6. **Start combat**, which unblocks Condition effects, Injury effects, the `useEffects` pipeline, and Body damage's caller side.
7. **Resolve the height/weight duplication** between `CharacterDetails` and `Body`.
8. **Consume Fatigue.** The 0–10 condition and its typed states now resolve on every character and nothing reads them — Body recovery, Skills and Combat each owe a rule for 5–8, and Combat owes the Exertion Load that feeds it.
