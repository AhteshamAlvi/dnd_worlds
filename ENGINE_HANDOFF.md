# Nenworld Rules Engine — Complete State Handoff

**Package:** `@nenworld/engine` (`packages/engine`)
**Snapshot date:** 2026-08-27
**Branch:** `main` @ `6a3450b` + substantial uncommitted work (see §12)

**Health:** `vitest run` → **27 files, 596 tests, all passing** (~1.2s). `tsc --noEmit` → **clean**.
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
| `rounding.ts` | `roundToOneSignificantFigure()` — shared by Aura Pool, Aura Output, Aura Regeneration and XP thresholds so every caller stays byte-for-byte consistent. |

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
| `athletics` | round((STR + AGI) / 2) |
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

## 6. Aura (`foundation/aura/`)

All major derived Aura figures round to **one significant figure**.

| Quantity | Formula |
|---|---|
| **Maximum Aura** | `10 · 50^((CON+VIT-20)/10) · 2^(((CON+VIT-20)(CON+VIT-30))/200)` |
| **Physiological Output Capacity** | `n = (CON-10)/5`; `M = 50ⁿ · 2^(n(n-1)/2)`; `O_phys = 2M` |
| **Usable Output** | `min(currentAura, O_phys × renAccessFraction)` |
| **Aura Regeneration (per hour)** | `n = (VIT-10)/5`; `50ⁿ · 2^(n(n-1)/2)` |
| **Aura Density** | `aura / surfaceUnits` |

**Aura Control** (`control.ts`) — derived from DEX at the moment of expenditure, affects **cost only**. `x = (DEX-25)/5`:

```
rawMultiplier = e^(-0.00850107x⁴ - 0.14447086x³ - 0.54024269x² - 0.91622329x)
```

rounded to one decimal. DEX 7 → ×5.0 · DEX 10 → ×3.0 · **DEX 25 → ×1.0 (perfect)** · DEX 28 → ×0.5 · DEX 30 → ×0.2. Final cost is *not* rounded — fractional Aura stays precise.

**Known debt:** `STANDARD_BODY_SURFACE_UNITS = 100` (`constants/surface-units.ts`) is explicitly flagged as scaffolding. The Surface Unit architecture was removed from `Body`; this constant survives only so `aura/distribution.ts` compiles, pending a ticket to redesign Aura density around the new Body/Body-Points model. Its header says: do not build on it. (Rulebook's regional table sums to 101; the engine uses 100 — decision `body.surface-units.total`.)

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

Numeric 1–10 internally, Roman I–X for display. `NO_MASTERY = 0`, `STANDARD_MASTERY_MAX = 10`. A capability may declare a shorter track. `MasteryRankDefinition {rank, description?, growthPointCost?, requirements?, effects?}` — **cumulative**: holding III means I, II and III all apply. `MasteryTrack {maximumMastery, ranks?}` (sparse by design). Technique Mastery = breadth (usually grants a Skill); Skill Mastery = depth.

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

`capabilities/resolution.ts` folds authored Mastery with granted access, keeping both visible (`ResolvedCapability` records `authoredMastery` and `grantedBy` sources).

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

`calendar.ts` — 12 months, leap years, `to/fromGameDateTime`. `clock.ts` — create/advance/pause/resume/enter-combat/leave-combat. `validation.ts` — 9 validators.

**Only `time/types.ts` and `time/duration.ts` are exported** (Recovery is the first mechanic needing a caller to build a `GameDuration`). `calendar.ts`, `clock.ts` and `time/validation.ts` stay unexported until a host mechanic needs them.

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

| Gap | Status |
|---|---|
| **Combat** | `combat/index.ts` is `export {}`. No Guard, Strike, Evasion, action economy, initiative, or death saves. |
| **Nen: 11 of 15 principles** | shu, en, gyo, ken, chu, in, ko, ryu, yu, ju, fu — graph nodes only. |
| **Nen Abilities (Hatsu abilities)** | No subsystem. `HATSU_EFFECT_MINIMUM_MASTERY = 3` is the only hook. |
| **Nen subsystem exports** | The whole ~3,800-LOC Nen tree is unreachable from `@nenworld/engine`. |
| **Aura Control export** | `aura/control.ts` (481 LOC, fully implemented) is not in the barrel. |
| **Injury content** | `INJURY_DEFINITIONS = {}`. Full machinery, zero entries. |
| **Condition effects** | 11 Conditions, zero Effects — blocked on combat mechanics. |
| **Movement / speed** | Nothing. `athletics` is derived but unconsumed. |
| **Item use pipeline** | `useEffects` / `useRequirements` declared, never executed. |
| **Improvised skill attempts** | `ImprovisedSkillAttempt` type exists; no resolution. |
| **Surface Units / Aura density** | Explicitly flagged scaffolding pending redesign. |
| **`details.ts` integration** | `heightCm`/`weightKg`/`nenType` on `CharacterDetails` are descriptive; `Body` carries its own height/mass and nothing reads `nenType`. **Two sources of truth for height/weight.** |
| **Awakening mechanics** | `NenState.awakened` is a bare boolean. |
| **Time clock/calendar exports** | Implemented + validated, unexported by design. |

### Unexported modules (complete list)

`combat/index` · `character/details` · `time/{validation,calendar,clock}` · `infrastructure/{rounding,id}` · `character/progression/index` (superseded by direct barrel exports) · `character/foundation/nen/{nen,types}` · `character/foundation/nen/principles/{ten,ren,zetsu,hatsu}` · `character/foundation/aura/control` · `character/foundation/body/body-points/modifiers`

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
3. **Export Nen and Aura Control**, or write down why they're deliberately gated. ~4,300 LOC of finished, untested, unreachable code is the largest single risk in the package.
4. **Write Nen tests.** It is the only major subsystem with zero coverage.
5. **Author Injury content.** The machinery, validation, and recovery integration are all done and tested against an empty catalog.
6. **Start combat**, which unblocks Condition effects, Injury effects, the `useEffects` pipeline, and Body damage's caller side.
7. **Resolve the height/weight duplication** between `CharacterDetails` and `Body`.
8. **Retire or replace `STANDARD_BODY_SURFACE_UNITS`** and the Aura density model built on it.
