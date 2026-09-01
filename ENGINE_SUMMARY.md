# Nenworld Rules Engine — Consolidated State

**Package:** `@nenworld/engine` (`packages/engine`) · **Branch:** `newbranch-refactor` @ `e004135`
**Snapshot:** 2026-09-01 · supersedes `ENGINE_HANDOFF.md` (2026-08-27, pre-Body-refactor)

**Health:** `vitest run` → **41 files, 1,023 tests, all passing** (~1.8 s). `tsc --noEmit` → **clean**.
**Size:** 143 source files / ~45,800 LOC + 43 test files / ~16,800 LOC.
**Stack:** TypeScript 5.6, ESM, Vitest 2.1, **zero runtime dependencies**.

The Body refactor (12 phases) is **through Phase 10**, plus the post-refactor integration
cleanup and the **anatomical continuity refactor**: Reference Forms are complete blueprints and
a catalog domain, anatomy is derived rather than stored, and persistent physical state is keyed
by cross-form identity so transformation and regeneration work. Phase 11 (downstream consumers)
and Phase 12 (full regression) are outstanding — see §16.

---

## 1 · Architecture

Pure, data-driven rules kernel. No I/O, no persistence, no randomness, no input mutation.
Every public entry point is a pure function from authored data to derived data.

```
infrastructure/       JsonValue · EngineResult · TraceNode · Warning/EngineError · Registry · id · rounding
      │
      ├── character/rules/         THE VOCABULARY: Effect (16) · Requirement (16) · EffectfulDefinition
      │                            + resolution.ts (interpreter) + validation.ts
      │
      ├── character/identity/      species · clans · traits
      ├── character/capabilities/  mastery · skills · techniques · resolution · attempts
      ├── character/status/        stage · conditions · injuries · resolution
      ├── character/equipment/     items
      ├── character/foundation/
      │      ├── attributes/       base · derived · physical · speed · strength · stats · modifiers
      │      ├── body/             ~12,400 LOC — the largest subsystem (§5)
      │      ├── aura/             ~1,330 LOC
      │      └── nen/              ~3,970 LOC  (NOT exported)
      ├── character/progression/   levels · stats · growth
      ├── character/mechanics/     recovery · actions (action capacity)
      ├── character/catalogs.ts    one generic surface over 11 catalog domains
      ├── character/resolution.ts  THE ORCHESTRATOR: authored character → ResolvedCharacter
      ├── character/validation.ts  THE VALIDATOR: domain issues → EngineErrors
      │
      ├── time/                    timestamp · duration · calendar · clock · validation
      ├── decisions/log.ts         where the engine knowingly diverges from the frozen Rulebook
      ├── combat/                  ~5,470 LOC of encounter structure (NOT exported, NO tests)
      └── index.ts                 the public barrel (800 lines)
```

### The load-bearing design rules

1. **Nothing derivable is stored.** Level comes from `lifetimeXp`. Derived Attributes from
   resolved Attributes. Height/Mass/Size/BP/STR from Body physics. Granted content is never
   written to the sheet. Two fields that must agree are two fields that will disagree.
2. **New content is data, not code.** A domain adds a definition; the rules layer already
   reads its `effects` / `requirements`. Deliberate exception: Nen principles (bespoke math).
3. **Closed vocabularies.** Every union is `as const satisfies` a typed list.
4. **Everything explains itself.** Public entries return `EngineResult<T>` with a
   JSON-serializable `TraceNode` tree, on success *and* failure.
5. **One implementation per formula.** Base and Resolved are one resolver with a mode, never
   two algorithms.

---

## 2 · Infrastructure

| File | Owns |
|---|---|
| `json.ts` | `JsonValue`/`JsonObject`/`JsonArray` — the serialization boundary; traces must survive `JSON.stringify`. |
| `result.ts` | `EngineResult<T>` = success \| failure, discriminated on `success`; both carry `trace` + `warnings`. |
| `diagnostics.ts` | `Warning` (non-blocking) / `EngineError` (blocking): `code`, `message`, `audience` (player\|gm\|developer), `subject`, `required`/`actual`/`resolution`. |
| `trace.ts` | `TraceNode {id,label,formula?,inputs,output?,rounding?,ruleSource?,decisionId?,warnings,children}`; `createTraceNode()` is the only sanctioned constructor. |
| `registry.ts` | Machinery behind every catalog. **Authored** layer (frozen engine source, never removable) + **custom** layer (host-registered, additive, can never shadow an authored id). `DEFINITION_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/`. Uses `hasOwnProperty` so `"constructor"` can't resolve through the prototype chain. |
| `id.ts` | `createId(prefix)` → prefix + 16 chars from `[a-z0-9]` via Web Crypto. Ids never depend on name, time, or list position. |
| `rounding.ts` | `roundToOneSignificantFigure()` — shared by Aura Pool/Output/Regen and XP thresholds. |

---

## 3 · The rules vocabulary (`character/rules/`)

### Effects — 16 types

```
modifyBaseAttribute      modifyResolvedAttribute      modifyCheck
grantTrait               grantSkill                   grantTechnique

modifyBase/ResolvedBodyScale                 modifyBase/ResolvedBodyMorphology
modifyBase/ResolvedBodyAnatomy               modifyBase/ResolvedIntrinsicPhysicalForce
modifyBase/ResolvedDestructionResistance
```

`CheckScope` is a closed 2-variant union: `{kind:"attribute"}` / `{kind:"derivedAttribute"}`.

The ten Body variants are owned by `foundation/body/effects.ts` (vocabulary and application)
and re-exported by `rules/effects.ts`. `applyBodyEffects` turns each into one of five inputs
the physical resolvers already took — a Scale multiplier, a morphology layer, a changed
anatomy/Reference Form, a per-part force modifier, a `BodyPointModifier` — so an Effect can
only move an existing input, never introduce a formula.

**Three different things are called "modifier":**

| Kind | Direction | Example |
|---|---|---|
| `AttributeModifier` | applied **to** a score | +2 AGI turns 17 into 19 |
| standard modifier | derived **from** a score | AGI 19 → +4, via `floor((19−10)/2)` |
| `modifyCheck` Effect | applies to **one resolution** | "+3 to applicable AGI checks" — never on the sheet |

**Body Anatomy Effects carry an explicit mode** — never inferred:

| mode | Reference Form | Present anatomy |
|---|---|---|
| `addToForm` | grows | contributes |
| `removeFromForm` | shrinks | identity stops being manifested, state kept |
| `suppress` | **unchanged** | hidden → STR unaffected, present SP falls |
| `replaceForm` | replaced wholesale | **the new form's anatomy, instantiated** |

`replaceForm` loads the target form from the catalog and rebuilds anatomy from it, reconciling
through continuity keys: matching identities carry their integrity and morphology across, new
ones start intact, and identities the new form does not express go **dormant** — not deleted,
not healed. Base-mode replacement changes the permanent form; resolved-mode replacement is a
view that vanishes with its Effect and never writes to the sheet.

`suppress` is invalid on `modifyBaseBodyAnatomy`. **Damage-driven loss is never an Effect** —
destruction sets instance state to `archived-removed`, so the normalization denominator can't
shrink and cancel the loss out.

### Requirements — 16 types

`attributeMinimum` · `derivedAttributeMinimum` · `levelMinimum` · `hasSpecies` · `hasSubspecies` ·
`hasClan` · `hasTrait` · `hasSkill` · `skillMastery` · `hasTechnique` · `techniqueMastery` ·
`hasCondition` · `hasItem` · `all` · `any` · `not`

Attribute requirements carry `layer: "stored" | "base" | "resolved"` — permanent acquisition
checks `base`, so a temporary Condition can't revoke a trained capability.

### `resolution.ts` — the interpreter

- `RuleSourceRef {type, id}` — provenance rides on every modifier and grant (`type` only ever *labels*).
- `resolveRuleEffects()` → `{effects, baseAttributeModifiers, resolvedAttributeModifiers,
  checkModifiers, traitGrants, skillGrants, techniqueGrants, body: {base, resolved}}`.
- **Grants are deliberately NOT deduplicated** — removing one source must not remove access another supplies.
- `resolveCheckModifier(standardModifier, checkModifiers, scope)` — **the one place** a standard
  modifier and situational modifiers are summed.
- `meetsRequirement()` / `meetsAllRequirements()` against a `RequirementContext`.

---

## 4 · Attributes (`foundation/attributes/`)

### Stored attributes — 9

`ATTRIBUTE_KEYS = AGI DEX CON VIT INT WIS PER SPI CHA`. **STR is no longer stored** — it is
derived from Body physics (§5.6). Range `ATTRIBUTE_MIN 1` … `ATTRIBUTE_MAX 30`, enforced on
*authored* scores only; Base/Resolved may fall outside so penalties stay visible.

- `ORDINARY_ATTRIBUTE_KEYS` (AGI DEX CON VIT INT WIS PER) — starting array + Stat Points.
- `ROLLED_ATTRIBUTE_KEYS` (SPI, CHA) — rolled at creation; raisable only by Limited Stat Point grants.

### `CharacterStats` — the read surface

```
AttributeKey      what a character STORES and progression writes   (9)
CharacterStatKey  what rules and derived attributes READ           (9 + "str")
```

`createCharacterStats(attributes, displayedStrength)` is the only way STR enters a stat block.

### The three-stage ladder

```
Stored   (authored; only progression writes it)
   ↓ modifyBaseAttribute      permanent: Traits, Sub-species, transformations
Base     (what the sheet shows)
   ↓ modifyResolvedAttribute  active: Conditions, injuries, equipped Items
Resolved (what a check rolls against)
   ↓ physical scale burden    Size/Mass move AGI and DEX
```

### Standard modifier

`deriveStandardModifier(score) = floor((score − 10) / 2)` — one implementation, unclamped, used
by both Attributes and Derived Attributes. `ResolvedScore {score, standardModifier}` is the
shared render shape.

### Physical scale burden (`physical.ts`) — how being large costs agility

```
LinearSizeRatio = (SizeL / 60)^(1/3)
RawBurden       = 0.50·log2(LinearSizeRatio) + 0.25·log2(MassKg / 62)
Steps           = round(RawBurden)
BaseAGI/DEX     = stored − Steps
```

The **burden** is quantized, not the result: ordinary human variation costs nothing, the first
step lands near 150 kg / 230 cm, and a proportional Scale-10 Giant lands on exactly 4 steps
(AGI 10 → 6). Symmetrical and unclamped — smaller creatures gain.
Uses the **form** measurements, not present ones, so losing an arm doesn't make you quicker.

### Derived Attributes — 10, rounded means of resolved stats

| Derived | Sources |
|---|---|
| `combatAbility` | STR AGI DEX PER WIS |
| `speed` | STR AGI |
| `acrobatics` | AGI DEX |
| `accuracy` | DEX PER |
| `detection` | PER WIS |
| `concealment` | DEX WIS |
| `investigation` | INT WIS PER |
| `stamina` | CON VIT |
| `willpower` | WIS SPI |
| `intimidation` | CHA SPI |

`DERIVED_ATTRIBUTE_SOURCES` is the single place a formula is stated. There is deliberately **no
`modifyDerivedAttribute` Effect and no stored derived state** — a Trait raises AGI and Acrobatics
follows because it is recalculated. Ties round up (decision `attributes.derived.rounding-direction`).
(`athletics` was replaced by `speed` in Phase 10.)

### Speed → real velocity (`speed.ts`)

```
Speed 10 = 10/3 m/s = 10 m in a 3-second Move     every +3 Speed doubles velocity
ROUND_DURATION_SECONDS = 6      STANDARD_ACTIONS_PER_TURN = 2
```

Conversion takes the **continuous** position, not the floored stat. No height or stride term —
large bodies were already charged through AGI. `resolveMovement()` returns both the intact rate
and the current rate (rate × locomotor condition), because a GM seeing only one can't explain
why a character moved 5 m instead of 10.

### Strength surface (`attributes/strength.ts`)

```
StrengthPosition = 10 + log2(NormalizedBodySP / 100)     never clamped
DisplayedSTR     = clamp(1, 30, floor(StrengthPosition)) // Stat surface only
NormalizedBodySP = 0 → StrengthPosition null, DisplayedSTR 0   (0 is reserved for this)
```

---

## 5 · Body (`foundation/body/`, ~12,400 LOC)

```ts
Body {
  characterScale                    // this individual vs. an ordinary same-age member; neutral 1
  globalMorphology                  // {length, bulk, muscularity, adiposity}, neutral 1
  localMorphology                   // per-BodyPart overrides, keyed by instance id
  strengthDevelopmentMuscularity    // what advancement bought; never an Effect
  anatomy                           // the parts physically possessed
  anatomicalPoints                  // sparse: what has happened to points; absent = active
}
```

Height, Mass and Size are **not stored** — they resolve. CON is not part of Body; it enters
only at Body Points.

**What each morphology dimension drives:** `length` → Length→Size/Mass/Height · `bulk` → Size,
Mass, BP · `muscularity` → Mass, **Structural Capacity**, force · `adiposity` → Size, Mass, BP.
Only Muscularity reaches SC, which is why it is the channel Strength advancement operates through.

### 5.1 The three namespaces

```
slotId         where anatomy sits inside ONE Reference Form
BodyPart.id    which instance is standing there right now
ContinuityKey  what that anatomy IS, across forms and regenerations
```

All three are branded or kept structurally distinct, and none is ever inferred from another.
Continuity is **authored**: a Wolf's front-right leg and a Human's right arm correspond because
both form definitions say `upper-limb:right`, never because a name, a type or a slot id matches.

### 5.2 Anatomy, Reference Form, instance state

`Anatomy {parts: BodyPart[]}` — a directed acyclic **forest**; the engine holds no closed list of
part types (data-driven). Height-relevant subgraph must be acyclic (validated).

```ts
BodyPart { id, type, referenceFormId, referenceSlotId, continuityKey, name?,
           attachment: {parentId, site?, parentPosition, childPosition} | null, integrity, state }
BodyPartState = "active" | "suppressed" | "archived-removed"

ReferenceForm { id, parts: [{ slotId, type, continuityKey, name?,
                              attachment: {parentSlotId, site?, parentPosition, childPosition} | null }] }
```

A Reference Form is a **complete blueprint** — enough topology and geometry to instantiate
anatomy from — and a **catalog domain**, so a transformation, mutation or Item can name one
without being a Species. Species carry `referenceFormId`, not a private copy.

**Anatomy is derived, never stored:**

```
ReferenceForm  +  ContinuityStates  ->  Anatomy
```

`Body` stores `{characterScale, globalMorphology, strengthDevelopmentMuscularity, continuity,
anatomicalPoints}`. `AnatomicalContinuityState {morphology?, integrity?, destroyed?}` is keyed by
identity, sparse, and is what survives destruction, regeneration and transformation. Integrity is
a **fraction**, so a form with different Maximum BP for the same identity recalculates Current BP
rather than inheriting raw missing points — a Human's 0.4 arm becomes a Wolf's 0.4 foreleg,
6/14 becoming 6/16.

**Regeneration** (`regenerateAnatomy`) grows a limb back *whole*: full integrity, and the old
manifestation's Anatomical Point records cleared, because point state belongs to the tissue that
was standing there rather than to the identity. It cascades the way destruction did — regrowing
an Arm returns its Hand. What survives is the identity's own morphology, so the limb is theirs;
everything else is reapplied from the character's current state, including Strength development
bought while it was missing.

Reference Form = intent; instance state = what is currently present. Damage never rewrites the form.

**Basic Human Standard — 8 part definitions** (`anatomy/body-parts.ts`), 12 instances in
`STANDARD_HUMANOID_ANATOMY`:

| Part | Length cm | Size L | Mass kg | Ref SC | heightContribution / axis |
|---|---|---|---|---|---|
| head | 22 | 3.35 | 3.65 | 8 | 1.0 / +1 |
| neck | 6 | 0.55 | 0.58 | 2 | 1.0 / +1 |
| upper-body | 31 | 20.15 | 19.82 | 10 | 1.0 / +1 |
| lower-body | 18 | 6.95 | 6.85 | 4 | 1.0 / +1 |
| arm | 55 | 2.37 | 2.56 | 14 | 0 / +1 |
| hand | 18 | 0.32 | 0.36 | 4 | 0 / +1 |
| leg | 81 | 11.05 | 11.80 | 16 | 1.0 / −1 |
| foot | 25 | 0.76 | 0.83 | 4 | 0.28 / −1 |

Whole body resolves to **165 cm · 62.00 kg · 60.00 L · 100 SC · 100 normalized SP · STR 10**.
Every other Species and creature is calibrated against this.

### 5.2 Scale, age, morphology layers

```
EffectiveScale = SpeciesStandardScale × AgeScale × CharacterScale
Length ∝ Scale · Size ∝ Scale³ · Mass ∝ Scale³ · SC ∝ Scale²
```

`age/` — linear anchor interpolation; holds flat outside the authored range; absent data →
mature adult (default age 20). `HUMAN_AGE_PROFILE` authored (age-12 Scale locked at **0.89**).
`morphology/` — **add within a layer, multiply between layers**; layers are species, age,
character, strengthDevelopmentMuscularity, and Effect layers.

### 5.3 Measurements and Height (`measurements/`)

```
ScaledReferenceLength = ReferenceLength × EffectiveScale
ScaledReferenceSize   = ReferenceSize   × EffectiveScale³
ScaledReferenceMass   = ReferenceMass   × EffectiveScale³

Length responds to length
Size   responds to length, bulk, adiposity
Mass   responds to length, bulk, adiposity AND muscularity   (muscle is denser)
```

Two views resolve with identical formulas: **form** (the intact Reference Form) and **present**
(active anatomy only). Suppressed and archived parts contribute nothing; damaged-but-active
parts contribute in full.

**Height is a signed vertical span**, not a longest path. Each part carries
`heightContribution ∈ [0,1]` and `heightAxisSign ∈ {−1,+1}`; attachments carry positions on
*both* sides; connections add zero distance. The resolver picks any origin, propagates, and
returns `max − min`, so it is translation-invariant and direction-independent. This is what
stops `Foot→Leg→Lower Body→Leg→Foot` from resolving as a false 176 cm.

### 5.4 Structural Capacity (`structure/`)

```
MuscularityStructuralFactor = 1 + ((Muscularity − 1) × muscularityStructural)   // sensitivity ∈ [0,1]
StructuralCapacity = ReferenceSC × EffectiveScale² × MuscularityStructuralFactor
```

Scale enters **squared** — cross-section, not volume. SC responds to exactly two things: Scale
and Muscularity. Never Length, Bulk, Adiposity, CON or STR. A body can be enormous and feeble.

### 5.5 Strength (`strength/`)

```
MuscularityForceFactor = 2^((Muscularity − 1) × muscularityForce)
IntrinsicMaxSP         = SC × MuscularityForceFactor × intrinsicPhysicalForce × force modifiers

ReferenceFormAnatomicalCapacity = Σ ReferenceSC over the INTACT Reference Form
NormalizedBodySP = 100 × (ReferenceFormIntrinsicSP / ReferenceFormAnatomicalCapacity)
```

**Both halves are taken over the intact Reference Form.** Extra ordinary anatomy is therefore
never free Strength (a four-armed form: 136/136 → 100 → STR 10), and **amputation, suppression,
severance and Joint failure no longer touch STR at all** — they reduce `presentIntrinsicSP`,
resolved alongside and never inside normalization. STR describes the quality of the intact form;
instance history describes how much of that form is left.

There is no `forceContributing` flag: inert anatomy (horn, shell, bone spike) sets
`intrinsicPhysicalForce: 0` and contributes 0 by arithmetic while still carrying Size, Mass, SC and BP.

**Advancement** (`advancement.ts`): buying +1 STR does not write a number — it solves for the
`strengthDevelopmentMuscularity` that **doubles Base normalized SP**, and persists it.

```
target = Base normalized SP × 2        (never a displayed-tier minimum, never resolved SP)
solver = monotonic bracket expansion + binary search
guards = 64 expansions · 128 iterations · 1e-9 relative tolerance
fails explicitly at Base displayed STR ≥ 30, or on a form that cannot respond to Muscularity
```

Human calibration: Muscularity 1.0000 → **~1.5747** takes normalized SP 100 → 200, STR 10 → 11,
total SC 100 → ~143.85. Base mode ignores instance state, so advancement price never depends on
transient misfortune.

### 5.6 Body Points (`body-points/`)

```
MaxBP = SC × BuildFactor × CONFactor × DestructionResistance

BuildFactor = 1 + ((EffectiveBulk − 1) × 0.50) + ((EffectiveAdiposity − 1) × 0.25)
CONFactor   = 2^((CON − 10) / 2)        ← every +2 CON doubles BP
MaxBP       = max(1, round(rawMaxBP))   ← the only rounding step; the floor is load-bearing
CurrentBP   = max(1, round(exactCurrentBP))    ← 0 is reserved for destruction alone
```

**No STR → BP direction any more.** Muscularity reaches BP only honestly, through SC.
`CONSTITUTION_DOUBLING_INTERVAL = 2` is calibrated so a point of STR and a point of CON buy about
the same durability; it is a **named constant precisely because it is an unvalidated guess** —
nothing yet defines how SP becomes BP damage. `/3` is the documented alternative. Range at `/2`:
CON 1–30 spans ~23,170×.

Damage is stored as an **integrity fraction**, so recovery and Max-BP changes work in exact space.

### 5.7 Anatomical Points (`critical-points/`)

Derived from anatomy, not stored; state stored sparsely. Points hold **no BP pool of their own** —
every consequence is a threshold read against a containing or designated BodyPart's Max BP.

**Four independent categories — flags, not a union.** A point may carry any combination:

| Category | Effect |
|---|---|
| `fatal` | `ceil(containing MaxBP × 0.50)` of final damage kills |
| `critical` | 10% / 30% / 50% of containing MaxBP — three injury tiers |
| `joint` | `ceil(designated MaxBP × 0.30)` breaks the connection |
| `weak` | multiplies final BP damage by 1.5 |

The Human Neck is all four at once; an Armpit is Joint + Weak; an Eye is Critical + Weak.
"Semicritical" is gone (Critical tiers say it with precision) and **Joints no longer multiply
damage** — where a joint really is soft, the definition also says Weak.

**20 authored points:** brain · left-eye · right-eye · jaw · neck · heart · respiratory-organs ·
upper-spine · shoulder · armpit · abdominal-core · solar-plexus · gut · groin · lower-spine ·
hip · elbow · wrist · knee · ankle.
Placement kinds: `per-part`, `shared` (one instance spanning hosts), `body-part-self`.

### 5.8 Damage (`damage.ts`) — the Body↔Combat seam

`applyBodyDamage(input) → EngineResult<BodyDamageOutcome>`. Locked order; three steps are load-bearing:

- **Step 5** resolves BP *before* the hit, so a hit is a transition between two known states.
- **Step 7** is the only place a part can be destroyed — never a Current BP that rounded to zero.
- **Step 8** checks fatal failure against the **pre-archive** point set (a destroyed Head no
  longer hosts a Brain; regression-tested).

Applied to two trees: the resolved tree (may include temporary-only parts) feeds BP resolution,
the stored tree feeds persistence. **No damage spill** — only the host and, on destruction, its
descendants. The function reports destroyed ids; it never mutates Character.

### 5.9 Capability and Locomotion

```
ACCESSIBLE?   binary    — can this part be used at all?
EFFECTIVE?    numerical — if so, how well?
```

Never the same number. A destroyed Joint multiplies everything downstream by **0.5**
(multiplicatively — never additive, never a floor). Locomotion resolves **per limb chain** from
the `locomotor` tag: weakest link within a chain, mean across chains. A body with no locomotor
anatomy resolves 1.00 (the mechanic simply doesn't constrain it), not 0.

### 5.10 Archive and Stature

Destroyed parts stay in the anatomy store as `archived-removed`; `ArchivedBodyPart` and
"orphaned" are **derived views**, never a second container, so identity, tree position,
attachment geometry and point associations survive. A record is *orphaned* when its slot is
absent from the current Reference Form — retained inert, never auto-deleted.

`stature/` asks "is this a height a member of this Species can simply have?" as a **ratio** to an
ordinary same-age member, never centimetres. Human bands: height `0.89–1.20` (147–198 cm adult),
mass `0.70–1.60` (BMI ≈ 16–36). Muscularity is excluded from both — otherwise the engine's own
Strength progression would generate characters the engine rejects.

### 5.11 Species profile and the root resolver

`SpeciesBodyProfile {standardScale, referenceForm, globalMorphology, localMorphology, stature,
adiposeTissueDensityKgPerL, ageProfile}`. Body never asks what Species a character is; a Giant is
large because its profile says `standardScale: 10`. `HUMAN_BODY_PROFILE` stands in when no
Species is authored. Ancestry is walked for the first profile, so the six Bender sub-species
inherit Human's.

`resolveBody(input) → EngineResult<ResolvedBody>` is orchestration only — every formula stays in
its submodule; this file owns the **order**:

```
scale → morphology → measurements (form + present) → structural capacity
                                                     ├→ strength
                                                     └→ body points → anatomical points
                                                                    → capability → locomotion
```

`BodyResolutionMode = "base" | "resolved"` — one implementation, mode selects which sources
participate. CON enters at Body Points and nowhere else, which is what makes
"attributes → Body → Strength" an ordering rather than a cycle.

---

## 6 · Aura (`foundation/aura/`)

All major derived figures round to **one significant figure**.

| Quantity | Formula |
|---|---|
| Maximum Aura | `10 · 50^((CON+VIT−20)/10) · 2^(((CON+VIT−20)(CON+VIT−30))/200)` |
| Physiological Output Capacity | `n=(CON−10)/5`; `M=50ⁿ·2^(n(n−1)/2)`; `O_phys = 2M` |
| Usable Output | `min(currentAura, O_phys × renAccessFraction)` |
| Aura Regeneration / hour | `n=(VIT−10)/5`; `50ⁿ·2^(n(n−1)/2)` |
| Aura Density | `aura / surfaceUnits` |
| Aura Control (cost only, from DEX) | `x=(DEX−25)/5`; `e^(−0.00850107x⁴ −0.14447086x³ −0.54024269x² −0.91622329x)`, rounded to 1 dp |

Aura Control: DEX 7 → ×5.0 · DEX 10 → ×3.0 · **DEX 25 → ×1.0** · DEX 30 → ×0.2. Final cost is
not rounded.

---

## 7 · Nen (`foundation/nen/`, ~3,970 LOC) — complete but **unexported**

15 principles in `NEN_PRINCIPLE_GRAPH`. Universal rule: to hold Mastery N in a child, every
prerequisite applying at N must hold at least N.

| Principle | Prerequisites | Conditional / Contextual |
|---|---|---|
| ten | — | |
| ren | ten | |
| zetsu | ren | |
| hatsu | zetsu | |
| shu | ten | |
| en | ten, ren | |
| gyo | ren | |
| ken | ten, ren | |
| chu | ten, ren, zetsu | |
| in | zetsu | |
| ko | ten, ren, zetsu, gyo | chu from rank VI; shu when weapon |
| ryu | gyo, ken | chu from rank VI; shu when weapon |
| yu | gyo, ren, chu, hatsu | |
| ju | ken, chu, hatsu | |
| fu | en, hatsu | |

Also owns awakening-state validation, structural ceilings, and **temporary mastery seals**
(permanent rank is never reduced; seals cap *access* and propagate to dependents).

**Implemented: 4 of 15.**
- **Ten** — containment fraction 0.10→1.00 across I→X; passive leakage 1.00→0.00 of regen; min DEX 12→16.
- **Ren** — access fraction 0.10→1.00; min CON 12→16; endurance 1 min → unlimited at X; owns the
  waste/diminishing-returns math when Output exceeds Ten's containment.
- **Zetsu** — Output 0 at every rank; replenishment ×1.00→×5.00; Aura Concealment +1→+5 as a
  **situational modifier to the ordinary Concealment Derived Attribute**.
- **Hatsu** — `HATSU_EFFECT_MINIMUM_MASTERY = 3`; generic effect multiplier III ×0.60 → X ×2.00.
  Agnostic about what it scales; never auto-scales costs, cooldowns or requirements.

---

## 8 · Identity, capabilities, status, equipment

**Mastery** — numeric 1–10, Roman I–X for display; `NO_MASTERY = 0`. Ranks are **cumulative**
(III means I, II and III apply — unlike stage effects). `MasteryTrack` is sparse by design.
Technique Mastery = breadth (usually grants a Skill); Skill Mastery = depth.

| Domain | Count | Authored |
|---|---|---|
| Species | 8 | `human` + 7 sub-species: firebender, waterbender, earthbender, airbender, lightningbender, metalbender (each grants its Trait), bloodkin |
| Clans | 1 | `uchiha` (classification only) |
| Traits | 11 | `one-armed`, the 6 bending traits, `jinchuriki`, `heavenly-restriction`, `devil-fruit-user`, `infernal` |
| Techniques | 3 | martial-arts (X), lockpicking (V), firebending-forms (X) |
| Skills | 5 | punch, parry, defensive-stance, pick-lock, fire-blast |
| Conditions | 11 | frightened, paralyzed, numbed, prone, grappled, restrained, blinded, exhausted, flat-footed, marked, leaking — **all zero-Effect classification** |
| Injuries | **0** | machinery complete, catalog empty |
| Items | 2 | gauntlets (equipped: STR +2), cursed-idol (possessed: CHA −1) |
| Body parts | 8 | §5.1 |
| Anatomical points | 20 | §5.7 |

Species is a **mix**: `{speciesId, percentage}[]` totalling 100 (tolerance 0.011). A Sub-species
is a Species with `parentSpeciesId`; `speciesAncestry()` walks it (max depth 16), so a Human
Firebender satisfies `hasSpecies human` for free.

`ResolvedTrait {traitId, isAuthored, grantedBy[]}` — an authored Trait survives its granter
disappearing; a purely-granted one disappears with its last source. **The Trait/Condition line is
integration, not duration**: poison is a Condition, the scar it leaves is a Trait.

`stage.ts` — shared expiry/progression/stacking. **Stage effects are NOT cumulative.** Severity is
a plain count with no engine-interpreted math. Duration is a countdown in whatever unit the host
assigns; the engine honours only the zero point and does not know what a "round" is.

Injury machinery: `applicability` (bodyParts and/or specialPointDefinitionIds — ≥1 required, both
must match if both present), `recovery` (treatmentRequired + `bpRecoveryCeilingFraction`),
`treatmentEffects.{untreated,treated}`. `injuryId` is not unique per character (two broken arms);
`CharacterInjury.id` is the instance identity. Treatment never restores BP or removes the Injury —
it lifts the recovery ceiling.

---

## 9 · Progression (`character/progression/`)

**Levels** — `MIN 1`, `MAX 30`, post-cap milestone every 5 formula-levels.
XP cost L→L+1 = `5 + 0.75L + L³/75`, rounded to one significant figure; lifetime thresholds sum
the **already-rounded** costs.

```
L5 = 30 · L10 = 100 · L15 = 290 · L20 = 700 · L25 = 1,500 · L30 = 3,000 (cap)
Post-Cap I = 5,400 · II = 9,000 · III = 13,900
```

**Stat Points** — `STARTING_STAT_POINTS 2`, `+2 per level`, `+1 per post-cap milestone`
(L1 = 2, L30 = 60). +1 Base Attribute = 1 SP. `applyLimitedStatPointGrant()` is the only route to
permanently raising SPI or CHA.

`STARTING_STAT_ARRAY = [11, 11, 10, 10, 10, 9, 9]` — one value per ordinarily trainable
Attribute, still averaging 10. STR has no slot: it is derived from the body, and raising it
means `advanceStrength` solving for Muscularity, not spending a Stat Point.

**Growth Points** — 3 per level, 3 per post-cap milestone (L1 = 3, L30 = 90). Generic currency:
the capability owns its own cost via `MasteryRankDefinition.growthPointCost`; `growth.ts` only
performs the deduction.

Progression writes **stored** values only, which is why it sits outside `foundation/`.

---

## 10 · Recovery (`character/mechanics/recovery/`)

The Body↔Status seam — the only file allowed to know a part's `recoveryProgress` and an Injury's
treatment state at once.

```
daily fraction = 0.10 × 2^((VIT − 10) / 5)
```

Per pass: resolve BP once → derive raw BP recovered over the elapsed `GameDuration` → per damaged
part reduce all active untreated Injury caps to **one effective ceiling** (the lowest; caps only
restrict) → `applyBodyPartRecovery()` → report Injuries whose **entire** location has reached Max BP.

Recovery works in exact-integrity space; destroyed parts are never restored by ordinary healing.
It **reports** healed ids and never mutates `character.injuries`. `detectInjuryOverlap()` raises a
non-blocking GM decision when a second Injury lands on anatomy carrying banked progress
(default: preserve).

---

## 11 · Time, catalogs, orchestration, validation

**Time** — `GameTimestamp` (ms from epoch) · `GameDuration` (ms) · `GameDateTime` (derived via
calendar, never independently mutable). `GameClockState {currentTime, campaignStartedAt, mode,
timeScale, fractionalMs}`; modes `running` / `paused` / `combat`. Calendar: 12 months, leap years.
Only `time/types.ts` and `time/duration.ts` are exported.

**Catalogs** — one generic surface over 11 domains: species · clan · trait · technique · skill ·
condition · injury · item · body-part · special-point · **reference-form**. `listDefinitions` · `getDefinition` ·
`registerDefinition` · `unregisterDefinition` · `exportCustomDefinitions` · `createDefinitionId` ·
**`findCatalogReferenceIssues()`** — the only place cross-catalog claims can be checked (a
Technique granting a Skill, a Skill requiring a Trait). Custom definitions live in host storage;
the engine holds them for the session and never persists them.

**`resolveCharacter()`** — pure; twice gives the same answer. Returns
`EngineResult<ResolvedCharacter>`: the body can fail to resolve (anatomy naming an unknown
BodyPartDefinition, a zero Effective Scale) and every stat below it depends on that. An
ineligible sheet is *not* a failure — it resolves, and validation judges it.

```
authored character
  ↓ seedSources()        species (ancestry-expanded) + clans + conditions + injuries + items
  ↓ fixpoint expansion   follow grants until nothing new appears (MAX_EXPANSION_PASSES 32)
  ↓ resolveRuleEffects()
attribute modifiers: stored → base → resolved
  ↓ RESOLVE BODY         morphology → measurements → SC → strength → BP → capability → locomotion
  ↓ STR from normalized SP; Size/Mass burden on AGI and DEX (once, from the FORM measurements)
  ↓ CharacterStats → Derived Attributes → movement
```

Grant expansion is a **fixpoint, not a pass**; expanded **ids**, not sources; seeded from the
Mastery *records*, not the arrays; a grant supplies Mastery I and anything trained wins.
It deliberately **does not check whether the character was allowed to have any of it** — the
workbench must be able to show a character halfway to legal.

`ResolvedCharacter` = `{character, attributes, attributeScores, stats, body, bodyTrace,
physicalScaleBurden, strengthPosition, movement, derivedAttributes, derivedScores, traits,
capabilities, effects, baseAttributeModifiers, resolvedAttributeModifiers, requirementContext}`.

**`validateCharacter()`** — the single place domain issues become `EngineError`s. Runs the
sheet-only checks first (id, name, attributes), then resolution, then the catalog-reference,
Body and stature checks. Body is judged from the RESOLVED body, so an Effect that changed the
body plan has its result validated rather than its declaration.

**36 character codes:**

```
character.id.empty · character.name.empty
character.species.{unknown,duplicate,missing,percentage_invalid,mix_incomplete}
character.clan.{unknown,duplicate} · character.trait.{unknown,duplicate}
character.skill.{unknown,duplicate,mastery_invalid,requirements_unsatisfied}
character.technique.{unknown,duplicate,mastery_invalid,requirements_unsatisfied}
character.condition.{unknown,duplicate,lifecycle_invalid}
character.item.{unknown,duplicate,quantity_invalid}
character.injury.{unknown,instance_id_invalid,instance_id_duplicate,location_invalid,
                  body_part_unknown,body_part_not_applicable,special_point_unknown,
                  special_point_missing,special_point_not_hosted,special_point_not_applicable,
                  treatment_status_invalid}
```

**Body codes** are `body.<domain>.<the owning subsystem's own issue code>`, across the seven
domains `anatomy` · `morphology` · `measurements` · `structure` · `strength` · `age` ·
`stature` — e.g. `body.measurements.unknown-body-part-type`,
`body.morphology.invalid-morphology-value`, `body.stature.unjustified-height`.
`foundation/body/validation.ts` decides which rules a whole body must satisfy and adds none of
its own; `findBodyResolutionBlockers` is the subset `resolveBody` runs on itself so invalid
anatomy is reported instead of throwing three modules down.

Injury locations are validated against the **resolved** anatomy, so an Injury on anatomy an
Effect added is legal. That check separates two questions the engine had been conflating:

```
IS THIS INJURY VALID?        does this anatomical position exist, and does the Injury belong on it
IS IT CURRENTLY MANIFESTED?  is that position present and usable right now
```

Only the first is validation's. Injuries are located by **continuity identity**, and an identity
the current form cannot express is dormant — valid, unhealed, and expressible again the moment a
form that has that anatomy returns. `resolveInjuryManifestation` answers the second question:
an Injury applies only when the form manifests every identity it occupies AND its own
applicability fits the anatomy standing there, so a Dragon's wing fracture is dormant as a Human
and active again as an Angel without the record ever changing.

**Stature** is the one Body rule that needs content: `EffectfulDefinition.statureAllowances`
lets a Trait, Condition or Species permit an out-of-band height or mass, resolution stamps each
with its source, and `checkStatureJustified` checks coverage per dimension AND per direction.

---

## 12 · Combat (`combat/`, ~5,470 LOC) — structure only, **unexported, untested**

Owns Combat Actions, Round runtime state, Turn state, Reaction opportunities/gates, Initiative
ordering and rotation, Action expenditure, state transitions, structural validation.

It explicitly does **not** own: a character's Action capacities (supplied by Character mechanics),
Skill classification (attack/defense/movement), or any check resolution.

`character/mechanics/actions/` resolves capacity:

```
Combat Ability < 5   → 0 stat-derived Round Actions
Combat Ability 5–7   → 1
Combat Ability ≥ 8   → 2 + floor((CA − 10) × 0.4), capped at 10 from stats alone
Turn capacity        = 2 (min 2) · Reaction capacity min 1
```

---

## 13 · Recorded decisions (`decisions/log.ts`)

The Rulebook is frozen; every divergence gets a log entry and a `decisionId` on the trace node
rather than an edit to the book.

1. **`body.surface-units.total`** — the regional SU table sums to 101, the text divides by 100; the engine uses 100.
2. **`attributes.derived.rounding-direction`** — Derived Attribute ties round up; asymmetric across zero, and derived values *can* go negative.
3. **`injury.overlap.recovery-progress-default`** — a second Injury on anatomy with banked recovery progress preserves it by default; surfaced to the GM as non-blocking.

---

## 14 · Test coverage (39 files, 959 tests)

| Area | Files (tests) |
|---|---|
| Body | strength 56 · anatomy 42 · critical-points 42 · measurements 34 · stature 33 · age 31 · points 31 · damage 24 · selectors 24 · structure 22 · archive 20 · recovery 19 · effects 19 · morphology-layers 17 · capability 15 · point-state 14 · reference-humanoid 13 · reference-standard 11 — **~467** |
| Attributes | standard-modifier 39 · derived 35 · phase9-model 34 · physical 15 · propagation 7 — **130** |
| Progression | 55 |
| Capabilities | skills 41 |
| Character | lifecycle 32 · character-features 27 · validation 25 · classification 23 — **107** |
| Rules | requirements 25 · check-modifiers 22 · effects 16 — **63** |
| Catalogs | 28 · **Aura** 22 · **Injuries** validation 18 + recovery 13 · **Infra** trace 8 + id 7 |

**Zero tests:** Nen (~3,970 LOC), Combat (~5,470 LOC), Aura Control, time clock/calendar,
equipment beyond the two demo items.

---

## 15 · What is NOT developed

### Not built at all

| Gap | State |
|---|---|
| **Damage → BP model** | Nothing defines how Strength Points become BP damage. This is the **highest-leverage hole**: it is what would validate `CONSTITUTION_DOUBLING_INTERVAL = 2` and the STR/CON durability parity the whole BP calibration rests on. |
| **Combat check resolution** | No Guard, Strike, Evasion, attack rolls, death saves. `combat/` is turn/round/initiative/action *structure* only and references no Body, STR, BP or damage. |
| **Nen: 11 of 15 principles** | shu, en, gyo, ken, chu, in, ko, ryu, yu, ju, fu — graph nodes only, no principle files. |
| **Nen Abilities (Hatsu abilities)** | No subsystem. `HATSU_EFFECT_MINIMUM_MASTERY = 3` is the only hook. |
| **Injury content** | `INJURY_DEFINITIONS = {}`. Machinery, validation and recovery integration are done and tested against an empty catalog. |
| **Condition effects** | 11 Conditions, zero Effects — blocked on combat mechanics. |
| **Item use pipeline** | `useEffects` / `useRequirements` are declared and validated, never executed. |
| **Improvised skill attempts** | `ImprovisedSkillAttempt` type exists; no resolution. |
| **Sense-specific detection** | The senses model was deleted in the Derived Attributes refactor. A `{kind:"sense"}` `CheckScope` variant is described as a one-line addition; the capability is currently gone. |
| **Awakening mechanics** | `NenState.awakened` is a bare boolean. |
| **Aura density / Surface Units** | `STANDARD_BODY_SURFACE_UNITS = 100` is explicitly scaffolding kept only so `aura/distribution.ts` compiles. Its header says: do not build on it. Pending a redesign around the new Body model. |

### Built but not wired up

| Gap | Detail |
|---|---|
| **`details.nenType`** | Declared on `CharacterDetails`; nothing reads it. |

### Built but unexported from `@nenworld/engine`

`combat/*` (~5,470 LOC) · `character/mechanics/actions/*` · the whole `foundation/nen/` tree
(~3,970 LOC) · `foundation/aura/control.ts` · `character/details.ts` ·
`time/{validation,calendar,clock}` · `infrastructure/{rounding,id}` · `character/progression/index`.

**~9,400 LOC of finished code is unreachable from the public barrel**, most of it also untested.

### Outstanding refactor phases

- **Phase 11 — downstream consumers.** `apps/workbench` is broken against the engine:
  **65 TypeScript errors, 49 of 97 tests failing.** It never absorbed three engine migrations
  (`character.name` → `character.details.name`, `body.surfaceUnits` removed, `str` no longer an
  Attribute) plus everything the Body refactor changed. It was deliberately not a gate for
  Phases 1–10.
- **Phase 12 — full regression.** Body goldens + full suite + `tsc`.

### Open questions carried forward

1. `CONSTITUTION_DOUBLING_INTERVAL = 2` is a reasoned guess pending a damage model (`/3` is the alternative).
2. Ages below ~4 resolve too light (1.8 kg at birth vs. a real 3.5) — mass goes as scale³, and the real fix is age *local* morphology, which the profile format supports but does not use. Ages 6+ land within 3%.
3. Orphaned archive retention policy is implemented as "retain forever"; a deliberate purge operation does not exist.
4. `details.heightCm` / `weightKg` were removed; the duplicate-source problem is resolved.

---

## 16 · Repository and commands

```
dnd_worlds/                     npm workspaces, "nenworld"
├── packages/engine/            the rules kernel — this document
├── apps/workbench/             React + Vite; currently broken (Phase 11)
├── foundry_module/             planned consumer
└── worldbuilding/              Obsidian vault — the frozen Rulebook + content
    ├── Rulebook/               01 Core Rules · 02 Characters · 03 Aura Engine · 04 Combat ·
    │                           05 Progression · 06 Races · 07 World · 08 GM Tools · 09 Appendices
    └── Vault/                  host-registered custom content (JSON, one file per entry)
```

```bash
cd packages/engine && npx vitest run     # 39 files, 959 tests
```

```bash
cd packages/engine && npx tsc --noEmit   # clean
```

**Standing rules:** the engine is authoritative over game mechanics, not the Rulebook prose.
Every divergence gets a `decisions/log.ts` entry and a `decisionId` on the trace, never an edit
to the book. One refactor phase at a time; every phase ends green.
