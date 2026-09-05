# Nenworld Rules Engine — Consolidated State

**Package:** `@nenworld/engine` (`packages/engine`) · **Branch:** `main` @ `3e0b961`
**Snapshot:** 2026-09-05 · supersedes `ENGINE_HANDOFF.md` (2026-08-27, pre-Body-refactor)

**Health:** `vitest run` → **46 files, 1,111 tests, all passing** (~2.1 s). `tsc --noEmit` → **clean**.
**Size:** 164 source files / ~49,800 LOC + 48 test files / ~19,600 LOC.
**Stack:** TypeScript 5.6, ESM, Vitest 2.1, **zero runtime dependencies**.

The Body refactor (12 phases) is **through Phase 10**, plus the post-refactor integration
cleanup and the **anatomical continuity refactor**: Reference Forms are complete blueprints and
a catalog domain, anatomy is derived rather than stored, and persistent physical state is keyed
by cross-form identity so transformation and regeneration work. Phase 11 (downstream consumers)
and Phase 12 (full regression) are outstanding — see §16.

The **character-foundation stabilization** pass is complete on top of that, and it settled four
contracts that `character/mechanics/`'s removal had left ambiguous or broken. Each was a silent
wrong answer rather than a missing feature, so each now has a named owner and a regression test:

| Contract | Owner | §  |
|---|---|---|
| **Check-modifier activation** — persistent vs invoked vs contextual | `checks/modifiers.ts` + `character/checks/` | §3, §12b |
| **Injury manifestation gates Effects** — dormant contributes nothing | `character/resolution.ts` (phased fixpoint) | §10, §11 |
| **Recovery reads active anatomy only**, and stays continuous | `foundation/body/recovery/` | §10 |
| **Contribution provenance** is neutral infrastructure | `infrastructure/contribution-source.ts` | §2 |
| **Injury anatomy vs. Injury content** — the interface split that ended the last upward import | `foundation/body/injuries/` + `character/status/injuries/` | §10 |

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
      ├── character/status/        stage · conditions · resolution (injuries moved to Body, below)
      ├── character/equipment/     items
      ├── character/foundation/
      │      ├── actions/          Action capacity: Actions per Round/Turn/Reaction,
      │      │                     resolved from Combat Ability + Action-capacity Effects
      │      ├── attributes/       base · derived · physical · speed · strength · stats · modifiers
      │      ├── body/             ~15,000 LOC — the largest subsystem (§5)
      │      │                     continuity · effects · regeneration · validation ·
      │      │                     anatomy/reference-forms · measurements · structure ·
      │      │                     strength · body-points · critical-points · stature ·
      │      │                     injuries · recovery (moved here from status/ and
      │      │                     character/mechanics/ — an Injury is anatomical, and Recovery
      │      │                     is the Body↔Injury seam; see §10)
      │      ├── aura/             ~1,330 LOC
      │      └── nen/              ~3,970 LOC  (NOT exported)
      ├── character/progression/   levels · stats · growth
      ├── character/catalogs.ts    one generic surface over 11 catalog domains
      ├── character/resolution.ts  THE ORCHESTRATOR: authored character → ResolvedCharacter
      ├── character/validation.ts  THE VALIDATOR: domain issues → EngineErrors
      │
      ├── checks/                  THE UNIVERSAL RESOLUTION MECHANIC — a peer, not a
      │                            subsystem: scopes · matching · modifiers · resolution ·
      │                            validation. character/rules/ authors against it and
      │                            gameplay/ resolves with it, so it belongs to neither
      ├── time/                    timestamp · duration · calendar · clock · validation
      ├── decisions/log.ts         where the engine knowingly diverges from the frozen Rulebook
      ├── gameplay/                the runtime encounter layer, ON TOP of character/
      │      └── combat/           ~5,470 LOC of encounter structure (NOT exported, NO tests)
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
6. **Layers depend downward, with no exceptions.** Rules sits on top of Foundation and may import
   the contracts its Effects target; Foundation may not reach back up for them, nor for Status.
   Anything both layers need — provenance, the check vocabulary — moves to neutral ground rather
   than being imported upward; anything that is genuinely *two* things — an Injury, which is
   anatomy and content at once — gets its interface split rather than its domain moved (§10).
   Enforced by `__tests__/architecture.test.ts`, because TypeScript resolves type-only cycles
   perfectly happily and will never complain. There is no whitelist, which is the only state a
   layering rule reliably survives in.

---

## 2 · Infrastructure

| File | Owns |
|---|---|
| `contribution-source.ts` | `ContributionSourceRef {type, id}` — the ONE structural definition of "who supplied this". Rule Effects, check modifiers, Action-capacity contributions, Attribute contributions and Body contributions all carry it. `RuleSourceRef` and `CheckSourceRef` are `type X = ContributionSourceRef` **aliases**, never second definitions. Plus `isSameContributionSource` / `contributionSourceKey`. |
| `json.ts` | `JsonValue`/`JsonObject`/`JsonArray` — the serialization boundary; traces must survive `JSON.stringify`. |
| `result.ts` | `EngineResult<T>` = success \| failure, discriminated on `success`; both carry `trace` + `warnings`. |
| `diagnostics.ts` | `Warning` (non-blocking) / `EngineError` (blocking): `code`, `message`, `audience` (player\|gm\|developer), `subject`, `required`/`actual`/`resolution`. |
| `trace.ts` | `TraceNode {id,label,formula?,inputs,output?,rounding?,ruleSource?,decisionId?,warnings,children}`; `createTraceNode()` is the only sanctioned constructor. |
| `registry.ts` | Machinery behind every catalog. **Authored** layer (frozen engine source, never removable) + **custom** layer (host-registered, additive, can never shadow an authored id). `DEFINITION_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/`. Uses `hasOwnProperty` so `"constructor"` can't resolve through the prototype chain. |
| `id.ts` | `createId(prefix)` → prefix + 16 chars from `[a-z0-9]` via Web Crypto. Ids never depend on name, time, or list position. |
| `rounding.ts` | `roundToOneSignificantFigure()` — shared by Aura Pool/Output/Regen and XP thresholds. |

---

## 3 · The rules vocabulary (`character/rules/`)

### Effects — 17 types

```
modifyBaseAttribute      modifyResolvedAttribute      modifyCheck
modifyActionCapacity
grantTrait               grantSkill                   grantTechnique

modifyBase/ResolvedBodyScale                 modifyBase/ResolvedBodyMorphology
modifyBase/ResolvedBodyAnatomy               modifyBase/ResolvedIntrinsicPhysicalForce
modifyBase/ResolvedDestructionResistance
```

`modifyActionCapacity {capacity: "round"|"turn"|"reaction", amount}` is a situational modifier
in the same family as `modifyCheck` — it never touches a score, it adds to one of the
character's resolved Action capacities (§10.5) at the moment `resolveActionCapacity()` runs.

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
destruction is recorded against continuity state, so the normalization denominator can't shrink
and cancel the loss out. Routing it through `removeFromForm` would take the Reference Form with
it, and a form that stops expecting the arm it just lost is a form that has healed.

`ModifyCheckEffect.check` is a `CheckScopeSelector` from the top-level `checks/` module, shared with the
gameplay check resolver — one vocabulary, one matcher, so an authored modifier and the check it
applies to cannot drift apart.

**`modifyCheck` also declares WHEN it applies, not only which checks it applies to.**
`ModifyCheckEffect.activation` is `"persistent" | "invoked"` (`CheckModifierActivation`), and
left unstated the default follows the **source kind**, not the effect:

| Source | Default | Why |
|---|---|---|
| `skill` · `technique` | `invoked` | Something a character does on purpose. "I have Contort" and "I am contorting" are different claims, and only the second is worth +3. |
| everything else | `persistent` | Something a character simply has. Keen Eyes does not need switching on. |

`defaultCheckModifierActivation(sourceType)` is the single place that rule is written down. One
definition may declare both — a Technique whose training permanently sharpens the senses *and*
pays off while being performed writes two Effects, one of each activation.

This was the ticket's central bug: every collected `modifyCheck` used to be tagged
`channel: "persistent"`, so knowing a Skill silently converted its situational bonus into a
permanent one on every check its scope matched.

`rules/validation.ts` rejects any `activation` outside `CHECK_MODIFIER_ACTIVATIONS`
(`invalid-check-activation`), checked against that list rather than a second copy of it. The
closed union stops hand-authored TypeScript from getting this wrong, but homebrew and
machine-generated JSON cross the boundary — and this is the one `modifyCheck` field where a typo
is silently *catastrophic* rather than merely wrong. `"invoke"` or `"Invoked"` survive the
`?? default` fallback and land in the channel verbatim, where neither collector matches them: the
modifier applies to **nothing, ever**, and looks exactly like content that was never written. A
scope typo at least produces a modifier that visibly applies to the wrong checks. `"contextual"`
is rejected too, though it is a real *channel* — a modifier the GM or environment supplied is by
definition not something a Trait authored.

### Requirements — 16 types

`attributeMinimum` · `derivedAttributeMinimum` · `levelMinimum` · `hasSpecies` · `hasSubspecies` ·
`hasClan` · `hasTrait` · `hasSkill` · `skillMastery` · `hasTechnique` · `techniqueMastery` ·
`hasCondition` · `hasItem` · `all` · `any` · `not`

Attribute requirements carry `layer: "stored" | "base" | "resolved"` — permanent acquisition
checks `base`, so a temporary Condition can't revoke a trained capability.

### `resolution.ts` — the interpreter

- `RuleSourceRef` — an **alias** for `infrastructure/contribution-source.ts`'s
  `ContributionSourceRef {type, id}`; provenance rides on every modifier and grant (`type` only
  ever *labels*). It used to be defined here, which meant `foundation/actions/types.ts` imported
  it upward while `rules/effects.ts` imported Action and Body contracts downward — a
  Rules ↔ Foundation type cycle. The shape now lives below both.
- `resolveRuleEffects()` → `{effects, baseAttributeModifiers, resolvedAttributeModifiers,
  availableCheckModifiers, persistentCheckModifiers, invokedCheckModifiers,
  actionCapacity, traitGrants, skillGrants, techniqueGrants, body: {base, resolved}}`.
- **Grants are deliberately NOT deduplicated** — removing one source must not remove access another supplies.
- `availableCheckModifiers` is the top-level `checks/` module's own `CheckModifierContribution`
  shape (`{source, scope, amount, channel}`) rather than a second character-only structure. Each
  is tagged with its **activation** (below), and `persistentCheckModifiers` /
  `invokedCheckModifiers` are the pre-split subsets.
  **Available, not active** — the name is the warning. It was called `checkModifiers`, which read
  like "the character's check modifiers" and got passed whole into `resolveCheck`, which is
  exactly what made a merely-known Skill permanently active. Read the subsets, or call
  `collectCharacterCheckModifiers` (§12b), which is the canonical assembly point.
  Check-modifier arithmetic itself (`collectApplicableCheckModifiers`, `resolveCheckModifier`,
  `createCheckModifierTraceNode`) lives only in `checks/modifiers.ts` (§12b); this file just
  collects the sourced declarations.
- `actionCapacity` is a plain `ActionCapacityContribution[]` bucket — combining it into a final
  `ActionCapacity` is `foundation/actions/`'s job (§10.5), not this file's.
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

Destruction is recorded on the identity (`AnatomicalContinuityState.destroyed`), and
instantiation renders that identity — and everything the blueprint hangs off it — as an
`archived-removed` BodyPart rather than omitting it. Keeping the absent part visible is what
`archive.ts` reports on and what regeneration finds; every physical resolver already skips
non-active anatomy, so it costs nothing.

`ArchivedBodyPart` and "orphaned" are **derived views**, never a second container. A record is
*orphaned* when its identity's slot is absent from the current Reference Form — retained inert,
never auto-deleted, and expressible again the moment a form containing it returns.

`stature/` asks "is this a height a member of this Species can simply have?" as a **ratio** to an
ordinary same-age member, never centimetres. Human bands: height `0.89–1.20` (147–198 cm adult),
mass `0.70–1.60` (BMI ≈ 16–36). Muscularity is excluded from both — otherwise the engine's own
Strength progression would generate characters the engine rejects.

### 5.11 Species profile and the root resolver

`SpeciesBodyProfile {standardScale, referenceFormId, globalMorphology, localMorphology, stature,
adiposeTissueDensityKgPerL, ageProfile}` — the body plan by **id**, so one authoritative copy
lives in the Reference Form catalog and a transformation can name it without being a Species.
`localMorphology` here is the Species' own, keyed by slot; what is unusual about one individual's
anatomy is keyed by continuity identity and lives on the character. Body never asks what Species a character is; a Giant is
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

## 10 · Injuries and Recovery (`foundation/body/injuries/`, `character/status/injuries/`, `foundation/body/recovery/`)

Recovery moved under Body from `character/mechanics/recovery/`, and the Injury domain was split
in two. The ANATOMY is Body's — BodyPart applicability, continuity locations, optional Special
Point locations, BP recovery ceilings — so it belongs there rather than in a generic
Condition-like status layer; putting Recovery under Body too (rather than beside it) is what lets
Recovery reduce a BodyPart's active Injury caps to one ceiling without `foundation/body/`
reaching upward. The CONTENT — the Effects an Injury carries — went up to
`character/status/injuries/`, which is what ended the last Foundation → Rules import.

### The ownership boundary — one Injury, two layers

An Injury is anatomical **and** authored content, and those halves are declared in two places.
The split is what removed the engine's last `foundation/` → `character/rules/` import: `Effect` is
a union over every domain (Body selectors, check scopes, Attribute keys, Action capacities), so a
Foundation type that named it made Foundation depend on the layer sitting on top of it.

| | `foundation/body/injuries/` | `character/status/injuries/` |
|---|---|---|
| **Owns** | ANATOMY | CONTENT |
| Definition | `AnatomicalInjuryDefinition extends Definition` | `InjuryDefinition extends AnatomicalInjuryDefinition, EffectfulDefinition` |
| Fields | `applicability`, `recovery` | `effects`, `requirements`, `treatmentEffects` |
| Also | `CharacterInjury`, continuity locations, treatment state, manifestation, anatomical validation | the authored catalog/registry, Effect collection, content validation |
| May name `Effect`? | **never** | yes |

The **interface** was split, not the domain. Manifestation and Recovery stay under Body because
they are anatomical; the catalog goes up because it is content. And the **serialized shape is
unchanged** — an authored Injury is still one object carrying `applicability`, `recovery`,
`effects` and `treatmentEffects` together — so no stored content needed migrating.

**Definitions are injected, never fetched.** Body must not import the catalog, so every Foundation
entry point that needs a definition takes `readonly AnatomicalInjuryDefinition[]`:
`resolveInjuryManifestation`, `findInjuryValidationIssues`, `findInjuryLocationIssues`,
`findBodyInjuryValidationIssues`, `findAnatomicalInjuryCatalogIssues`,
`resolveBodyPartRecoveryCeiling`, and `ResolveRecoveryInput.injuryDefinitions`.
`createInjuryDefinitionMap` is the shared way to index them, mirroring
`createBodyPartDefinitionMap`. Callers above Foundation pass full `InjuryDefinition`s straight
in — one structurally extends the other, so nothing converts and nothing is looked up twice.
`listAnatomicalInjuryDefinitions()` is the call site that says so out loud.

`foundation/body/injuries/` is `types.ts` (IDs, applicability, recovery contract,
`CharacterInjury`, locations, `AnatomicalInjuryDefinition`), `resolution.ts`
(`resolveInjuryManifestation` — anatomy only), and `validation.ts` (intrinsic validity,
anatomical applicability, the anatomical half of catalog validation, and the composed
`findBodyInjuryValidationIssues` that `character/validation.ts` calls).

`character/status/injuries/` is `types.ts` (`InjuryDefinition`), `definitions.ts` (registry and
lookups), `effects.ts` (`collectInjuryEffectSources`), and `validation.ts`
(`findInjuryCatalogIssues`, which composes the registry's own checks with the anatomical half it
**delegates** to Body rather than reimplementing).

**What an Injury CONTRIBUTES is `character/status/injuries/effects.ts`**, beside the authored
catalog and re-exported through `status/resolution.ts` next to the Condition collector.
`collectInjuryEffectSources(manifestedInjuries)` does the treatment-state Effect blending, and
takes the **manifested subset**, never the whole stored list.

### Manifestation gates Effects

An Injury contributes **only while manifested** — while the current form expresses every
continuity identity its location names *and* the anatomy standing there can host it. That is
circular on its face (Injury Effects can change anatomy; anatomy decides manifestation), and the
old code resolved the circle by ignoring it: every stored Injury was collected up front, so a
Dragon's fractured wing went on penalising its owner while they were human.
`character/resolution.ts` now drives a small fixpoint instead — see §11.

```
manifested   Effects apply, treatment state matters, natural Recovery applies
dormant      contributes NOTHING — no Effects, no penalties, no recovery
```

A dormant Injury is **not** removed, **not** healed, and **not** invalid. It stays stored, stays
valid against `knownContinuityKeys`, and resumes contributing the moment a form manifesting
compatible anatomy returns. Treatment state only ever changes what a *manifested* Injury
contributes. `ResolvedCharacter.injuries {manifested, dormant}` reports both, because a sheet
showing only the active ones would make a transformation look like a cure.

`resolveInjuryManifestation` returns `InjuryManifestation {active, dormant, manifestedByIndex}`.
The id lists are for display and are **lossy**: duplicate `CharacterInjury.id`s are a validation
error, but resolution runs before *and during* validation and must answer either way, and two
entries sharing an id are indistinguishable in `active`. `manifestedByIndex` is positional — one
boolean per supplied Injury, index-aligned — and is what the fixpoint in §11 actually runs on.

### Location vocabulary

`CharacterInjury.location` holds **continuity keys**, not BodyPart ids, and the diagnostics say
so: `no-continuity-keys` · `invalid-continuity-key` · `duplicate-continuity-key`, carrying
`continuityKey`. The one deliberate exception is `injury-body-part-not-applicable`, which stays
body-part-shaped because applicability is judged against the concrete BodyPart *currently
manifesting* that identity.

`foundation/body/recovery/` is the seam allowed to know a part's `integrity` and an Injury's
treatment state at once:

```
daily fraction = 0.10 × 2^((VIT − 10) / 5)
```

Per pass: resolve BP once → derive raw BP recovered over the elapsed `GameDuration` → per damaged
part reduce all active untreated Injury caps to **one effective ceiling** (the lowest; caps only
restrict) → `applyBodyPartRecovery()` → report Injuries whose **entire** location has reached Max BP.

It reads a manifestation and writes an **identity**: healing is recorded on continuity state, so a
limb that heals stays healed through regeneration and through a change of form. Injuries are
grouped by continuity key, and an identity the current form does not express is not asked whether
it healed — dormant anatomy is not there to heal.

**Only `state === "active"` anatomy participates.** A suppressed, removed, destroyed or archived
BodyPart receives no natural Recovery, does not count as manifested when an Injury is evaluated,
and cannot make an Injury look healed. The post-Recovery integrity lookup is built from active
parts alone, so "did not heal" and "does not count as manifested" cannot disagree. An Injury is
removable only when **every** continuity identity in its location is both actively manifested and
at Maximum BP — a fracture across two limbs is not healed because one of them was severed.

**Ceilings stay continuous.** `ceilingBP = bpRecoveryCeilingFraction × maximumBP`, with no
`Math.floor()`: a 0.33 ceiling on a 14 Maximum BP part is **4.62 BP**, not 4. Integrity is a
fraction and `body-points/recovery.ts` already owns whatever whole-BP presentation a sheet wants,
so flooring here only discarded part of an authored ceiling — worst on small parts, where the
lost fraction is the largest share of the whole. (The VIT recovery curve itself is untouched and
remains a separate balance item.)

### `recovery/validation.ts` — the guarded entry point

Recovery is one of the few places a **host** supplies the numbers rather than the pipeline above
it, and its arithmetic accepts nonsense eagerly: `elapsed = -7 days` un-heals a limb,
`vitality = NaN` stores NaN integrity, `effectiveScale = 0` collapses every Maximum BP. None
throw — each produces an ordinary-looking `ResolveRecoveryOutcome` and a corrupt continuity map,
discovered much later and far from its cause.

So the rule is stronger than "report a problem": **invalid input produces no outcome at all.**

| Function | Purpose |
|---|---|
| `findRecoveryInputIssues(input)` | every problem at once, as `RecoveryValidationIssue[]` |
| `isValidRecoveryInput(input)` | predicate |
| `toRecoveryEngineError(issue)` | `body.recovery.*` diagnostics, `audience: "developer"` |
| `validateRecoveryInput(input)` | `EngineResult<ResolveRecoveryInput>` with trace |
| **`resolveValidatedRecovery(input)`** | **what a host should call** — `EngineResult<ResolveRecoveryOutcome>` |

**The boundary is explicit, and it is narrower than the name suggests.** "Validated" means
validated *Recovery input*, not validated *character*.

CHECKED — everything a Recovery pass consumes: elapsed duration finite and **non-negative**
(Recovery advances time; `elapsedBetween` may legitimately return negative, so this is stricter
than `validateGameDuration`) · CON finite · VIT finite · Effective Scale finite and `> 0` · Body
Point modifiers (delegated to `body-points/validation.ts`) · a morphology entry for every
*active* BodyPart · recovery ceiling fractions finite and within `[0, 1]` · Injury shape
(delegated to `findInjuryValidationIssues` — instance ids, known definitions, location keys
present and unique, treatment state matching the definition).

NOT CHECKED — anatomical Injury **applicability**: whether the BodyPart manifesting an Injury's
identity satisfies the definition's `BodyPartSelector`, and whether a Special Point location is
real, allowed and hosted. That is `findBodyInjuryValidationIssues`, reached through
`character/validation.ts`. Recovery does not *consume* applicability — an Injury caps recovery on
the identities its location names either way — so checking it here would validate a field this
module never reads, in a second place, differently from the place that owns it. It would also
need `SpecialPointDefinition`s and `knownContinuityKeys`, neither of which is a Recovery input.

**So the precondition is the caller's: Injuries passed to Recovery must come from a character
`validateCharacter()` has already accepted.** Both halves — what is checked, and that
applicability specifically is *not* — are pinned by the "Recovery's validation boundary" tests,
so this is a checked contract rather than a comment that can quietly stop being true.

`resolveRecovery` itself keeps its "assumes valid input" contract, matching
`body-points/resolution.ts` — callers already inside the engine's pipeline should not pay for a
second full validation every tick.

Recovery works in exact-integrity space; destroyed parts are never restored by ordinary healing —
that is `regenerateAnatomy`'s job, and it grows a limb back whole rather than merely present.
It **reports** healed ids and never mutates `character.injuries`. A second Injury landing on
anatomy that already carries one is not a special case — the damage that produced it changes
integrity through the damage system, and multiple Injuries on the same identity simply combine
their active ceilings to the lowest one, the same as any other multiple-cap case. (There used to
be a `detectInjuryOverlap()` GM-decision flag and a companion `BodyPart.recoveryProgress` field;
both are gone. Integrity is stored continuously now, so there is no banked fractional-BP progress
left to preserve, reset, or flag a decision about.)

---

## 11 · Time, catalogs, orchestration, validation

**Time** — `GameTimestamp` (ms from epoch) · `GameDuration` (ms) · `GameDateTime` (derived via
calendar, never independently mutable). `GameClockState {currentTime, campaignStartedAt, mode,
timeScale, fractionalMs}`; modes `running` / `paused` / `combat`. Calendar: 12 months, leap years.
Only `time/types.ts` and `time/duration.ts` are exported.

**Catalogs** — one generic surface over 11 domains: species · clan · trait · technique · skill ·
condition · injury · item · body-part · special-point · **reference-form**. The `injury` registry
lives in `character/status/injuries/` rather than under Body, because its definitions carry
Effects — see §10. `listDefinitions` · `getDefinition` ·
`registerDefinition` · `unregisterDefinition` · `exportCustomDefinitions` · `createDefinitionId` ·
**`findCatalogReferenceIssues()`** — the only place cross-catalog claims can be checked (a
Technique granting a Skill, a Skill requiring a Trait). Custom definitions live in host storage;
the engine holds them for the session and never persists them.

**`resolveCharacter()`** — pure; twice gives the same answer. Returns
`EngineResult<ResolvedCharacter>`: the body can fail to resolve (a form naming an unknown
BodyPartDefinition, a zero Effective Scale) and every stat below it depends on that. An
ineligible sheet is *not* a failure — it resolves, and validation judges it.

Resolution is **phased**, because Injuries are the one kind of content whose applicability
depends on the thing they help produce. One pass is `resolveCharacterPass(character,
manifestedInjuries)` — pure in both arguments — and `resolveCharacter` drives it to a fixpoint:

```
1. resolveCharacterPass(character, [])      every applicable NON-Injury Effect
2.                                          → a preliminary Body
3. resolveInjuryManifestation(anatomy, …)   which Injuries that anatomy expresses
4. collectInjuryEffectSources(manifested)   Effects from the manifested ones ALONE
5. resolveCharacterPass(character, those)   the final character and Body
6. resolveInjuryManifestation(…) again      recheck against the FINAL anatomy
7. repeat only while the manifested set keeps changing
```

Bounded at `MAX_INJURY_MANIFESTATION_PASSES = 3` — the same treatment grant expansion gets. A set
that will not settle means an authored cycle (manifesting an Injury changes what manifests), and
returns `character.injuries.manifestation_unstable` rather than looping or silently returning
whichever pass came last. **A character with no Injuries settles at step 3 and costs exactly one
Body resolution**, which is what it cost before; a stable set is normally reached on the first
recheck.

The set is tracked **positionally** (`manifestedByIndex`), never by id — both for selecting which
Injuries contribute and for deciding whether the loop has settled. Resolution runs before
validation has rejected duplicate ids, so it has to be deterministic on a sheet carrying them.
Selecting by id would apply a *dormant* entry's Effects because a manifested entry shared its id;
and the id-set comparison this replaced called `["dup", "dup"]` and `["dup", "other"]` equal —
same length, every left id present on the right — so the fixpoint could stop on a set that was
still moving.

Inside one pass:

```
authored character
  ↓ seedSources()        species (ancestry-expanded) + clans + conditions + items
  ↓                      + collectInjuryEffectSources(manifestedInjuries)
  ↓ fixpoint expansion   follow grants until nothing new appears (MAX_EXPANSION_PASSES 32)
  ↓ resolveRuleEffects()
attribute modifiers: stored → base → resolved
  ↓ RESOLVE BODY         form (+ replaceForm) → instantiate anatomy from continuity →
                         morphology → measurements → SC → strength → BP → capability → locomotion
  ↓ STR from normalized SP; Size/Mass burden on AGI and DEX (once, from the FORM measurements)
  ↓ CharacterStats → Derived Attributes → movement
  ↓ resolveActionCapacity(combatAbility, resolvedRuleEffects.actionCapacity)
```

Grant expansion is a **fixpoint, not a pass**; expanded **ids**, not sources; seeded from the
Mastery *records*, not the arrays; a grant supplies Mastery I and anything trained wins.
It deliberately **does not check whether the character was allowed to have any of it** — the
workbench must be able to show a character halfway to legal.

`ResolvedCharacter` = `{character, attributes, attributeScores, stats, body, bodyTrace,
physicalScaleBurden, strengthPosition, movement, derivedAttributes, derivedScores,
actionCapacity, traits, capabilities, effects, baseAttributeModifiers,
resolvedAttributeModifiers, requirementContext, bodyInput, knownContinuityKeys,
statureJustifications, **`injuries {manifested, dormant}`**}`. `actionCapacity` was integrated
end to end by the mechanics-removal ticket; `injuries` by the stabilization ticket, and together
they account for every entry in `character.injuries` — nothing is dropped.

**`validateCharacter()`** — the single place domain issues become `EngineError`s. Runs the
sheet-only checks first (id, name, attributes), then resolution, then the catalog-reference,
**Action-capacity**, Body and stature checks. Body is judged from the RESOLVED body, so an
Effect that changed the body plan has its result validated rather than its declaration.

**Action-capacity validation ownership is settled.** `foundation/actions/validation.ts` used to
expose a complete set of validators that nothing called, so "is this character's Action capacity
sound?" was a question only a caller who knew about them could ask. `validateCharacter()` now
runs `findResolvedActionCapacityValidationIssues(resolved.actionCapacity)` and maps what it
reports through the domain's own `toActionCapacityEngineError` — so unknown capacity kinds,
non-finite amounts, fractional Action contributions and resolved capacities that disagree with
the mechanic's own formulas all fail ordinary character validation.

The RESOLVED capacity is validated rather than the authored Effects, deliberately: it carries its
own contributions, so the authored amounts are checked as part of it, and it is the only place
the arithmetic can be checked at all. The authored half is still checked at catalog time by
`rules/validation.ts` — but **with the same predicate**. `isValidActionCapacityAmount` is
exported from the Action domain and used by both, because `rules/validation.ts` used to accept
any *finite* amount while resolution demanded a *whole* one: an authored `2.5` validated cleanly
as content and then failed as a character.

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
                  continuity_unknown,body_part_not_applicable,special_point_unknown,
                  special_point_missing,special_point_not_hosted,special_point_not_applicable,
                  treatment_status_invalid}
character.injuries.manifestation_unstable
character.actions.{combat_ability_invalid,contribution_kind_invalid,
                   contribution_amount_invalid,
                   action_capacity_*_invalid, action_capacity_*_mismatch}
```

**Recovery codes** are `body.recovery.{elapsed_negative,elapsed_non_finite,constitution_invalid,
vitality_invalid,effective_scale_invalid,body_point_modifier_invalid,morphology_missing,
ceiling_fraction_invalid,injury_invalid}` — `audience: "developer"` throughout, matching
`time/validation.ts` and `foundation/body/damage.ts`: a malformed elapsed duration is an
integration problem for whoever wired up the clock, not something a player can fix on a sheet.

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

`continuity_unknown` is the only injury-location code named for the identity, and deliberately:
it fires when this character's body has never had such anatomy. `body_part_not_applicable` stays
body-part-shaped because applicability is judged against the concrete part standing in the
identity right now, which a different form may express as something else entirely.

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

## 12 · Gameplay (`gameplay/`) — the runtime layer, **unexported**

### Combat (`gameplay/combat/`, ~5,470 LOC) — structure only, untested

Owns Combat Actions, Round runtime state, Turn state, Reaction opportunities/gates, Initiative
ordering and rotation, Action expenditure, state transitions, structural validation.

It explicitly does **not** own: a character's Action capacities (`foundation/actions/`, resolved
onto `ResolvedCharacter.actionCapacity` — see §11), Skill classification (attack/defense/movement),
or any check resolution. Combat will consume the resolved capacity when it lands but keeps owning
its own remaining-Actions/Turns/Reactions runtime state and its separate `CombatActionCapacity`
type; the two are not wired together yet.

`foundation/actions/` resolves capacity:

```
Combat Ability < 5   → 0 stat-derived Round Actions
Combat Ability 5–7   → 1
Combat Ability ≥ 8   → 2 + floor((CA − 10) × 0.4), capped at 10 from stats alone
Turn capacity        = 2 (min 2) · Reaction capacity min 1, derived from RESOLVED Turn
```

`modifyActionCapacity {capacity, amount}` Effects (Traits, Skills, Techniques, equipment,
Conditions) add to `round`/`turn`/`reaction` on top of those bases through the ordinary
`ResolvedRuleEffects.actionCapacity` bucket — a Turn contribution changes the derived Reaction
base *before* any Reaction-specific contribution applies, so raising Turn capacity alone can
raise Reaction capacity too. The full explanation is a `TraceNode` on
`ResolvedActionCapacity.trace`, with one child each for Round, Turn, and Reaction.

---

## 12b · Checks (`checks/`, ~1,150 LOC) — universal d20 resolution

Deterministic: the caller supplies the dice, so nothing here is random. `resolveCheckDice` takes
a signed advantage pool (`1 + abs(advantage)` rolls, validated) and keeps highest or lowest, ties
going to the earliest die. Resolution emits `TraceNode`s like every other explained calculation.

`CheckScope` names ONE concrete check; `CheckScopeSelector` names the SET a modifier applies to.
Six variants each: attribute · derivedAttribute · perception · detection · concealment ·
investigation, over closed sense/mode/subject lists.

The module is a **top-level peer**, under neither `character/` nor `gameplay/`. A check is not a
property of a character and not an encounter mechanic; attributes exist in order to be checked
against, and a Perception roll outside an encounter is the same thing combat asks for. The
dependency direction settles it: content authors modifiers against this vocabulary and the
runtime resolves checks with it, so putting it inside either would make the other depend upward.
Same shape as `time/`, which recovery and combat both need and neither owns.

```
checks/          →  character/foundation/attributes · infrastructure/trace
character/rules/ →  checks/
gameplay/        →  checks/
```

A `modifyCheck` Effect authors a **selector**, which is what lets a Trait say "+2 to hearing
Detection" rather than only naming one exact check.

`modifiers.ts` also has a roll-free sibling to `resolveCheck`: `resolveCheckModifier(baseContributions,
modifiers, scope)` → `CheckModifierResolution {scope, baseContributions, baseModifierTotal,
applicableModifiers, situationalModifierTotal, finalModifier}`, plus
`createCheckModifierTraceNode()`. This is what a passive value — a sensory DC, a static defense,
a sheet display — reads when nothing is actually being rolled; it shares
`collectApplicableCheckModifiers`/`sumCheckBaseContributions`/`sumCheckModifiers` with the
dice-based path, so the two can never disagree about what a modifier is worth. `character/rules/`
no longer keeps its own copy of this arithmetic (it used to, against an incompatible
`SourcedCheckModifier` shape keyed by `check` rather than `scope` and with no `channel`) —
`ResolvedRuleEffects.availableCheckModifiers` is now the canonical `CheckModifierContribution[]`
directly.

### Activation — the three channels

`CHECK_MODIFIER_CHANNELS = persistent · invoked · contextual`. Scope and activation are two
**independent** filters, and conflating them is what the stabilization ticket fixed.

| Channel | Applies when | Supplied by |
|---|---|---|
| `persistent` | the scope matches — automatically | resolved character (`persistentCheckModifiers`) |
| `invoked` | the scope matches **and** its source was explicitly selected for this check | resolved character (`invokedCheckModifiers`), gated by the caller's selection |
| `contextual` | the caller says so, for this resolution only | GM / environment / calling system — never collected from content, never stored |

`CHECK_MODIFIER_ACTIVATIONS = persistent · invoked` is the authored subset: content has nothing
to say about a modifier that came from the GM.

**`collectCharacterCheckModifiers(resolved, invocation)` is THE public assembly function.**
Anything building a `CheckRequest` from a character calls it and nothing else. It is the only
place the activation filter is applied, so it is the only path on which an invoked modifier
cannot leak in unselected — reaching past it for `effects.availableCheckModifiers` gets a list
that looks usable and is not.

Around it: `collectCharacterInvokedCheckModifiers`, `canInvokeCheckSource`, and
`CheckInvocation {sources?, contextual?}` in `character/checks/`; and the lower-level
`collectPersistentCheckModifiers`, `collectInvokedCheckModifiers(modifiers, invokedSources)`,
`assembleCheckModifiers({persistent, available, invokedSources, contextual})` in
`checks/modifiers.ts`, for mechanics assembling from something other than a whole
`ResolvedCharacter`.

`character/checks/invocation.ts` exists specifically so that **no future mechanic re-answers
"was this Skill used?" by walking the catalogs itself**. Perception, Detection, Investigation
and Concealment each growing a private answer is how they end up disagreeing about whether a
Skill counted. Scope filtering is deliberately *not* done there — it stays in
`checks/modifiers.ts` at the moment the concrete check resolves, so an invoked-but-inapplicable
modifier is dropped by exactly the same rule that drops a persistent one.

### Trace identifiers

`checks.dice` · `checks.modifiers` · `checks.resolve` · `checks.fixed` · `checks.opposed` —
top-level, matching the module. They were still `gameplay.checks.*` from before the promotion
out of `gameplay/`.

---

## 13 · Recorded decisions (`decisions/log.ts`)

The Rulebook is frozen; every divergence gets a log entry and a `decisionId` on the trace node
rather than an edit to the book.

1. **`body.surface-units.total`** — the regional SU table sums to 101, the text divides by 100; the engine uses 100.
2. **`attributes.derived.rounding-direction`** — Derived Attribute ties round up; asymmetric across zero, and derived values *can* go negative.

`injury.overlap.recovery-progress-default` used to be a third entry here — a non-blocking GM
decision for a second Injury landing on anatomy with banked recovery progress. It is gone along
with the `recoveryProgress` field it was about: integrity is stored continuously now, so there is
nothing left to bank, preserve, or reset, and no decision to surface.

---

## 14 · Test coverage (46 files, 1,111 tests)

| Area | Files (tests) |
|---|---|
| Body | strength 59 · anatomy 42 · critical-points 42 · measurements 34 · stature 33 · age 31 · points 31 · effects-integration 29 · damage 25 · **continuity 24** · selectors 24 · structure 22 · morphology-layers 21 · archive 20 · effects 19 · recovery 20 · capability 15 · point-state 14 · reference-humanoid 13 · reference-standard 11 — **529** |
| Attributes | standard-modifier 39 · derived 35 · phase9-model 34 · physical 15 · propagation 7 — **130** |
| Progression | 58 |
| Capabilities | skills 41 |
| Character | lifecycle 32 · character-features 27 · validation 25 · classification 23 — **107** |
| Rules | check-modifiers 29 · requirements 25 · effects 16 — **70** |
| Catalogs | 28 · **Aura** 22 · **Injuries** validation 19 + recovery 13 · **Actions** 7 · **Checks** 6 · **Infra** trace 8 + id 7 — **110** |
| **Foundation stability** | character-foundation-stability 41 · injury-ownership 17 · architecture 8 — **66** |

`character-foundation-stability.test.ts` is grouped rather than folded into the domain suites on
purpose: every case in it corresponds to something that was silently **wrong** — it passed a
compile and a full test run while producing a character the rules do not describe. Knowing a
Skill invoked it · a dormant Injury still applying · an inactive BodyPart healing and clearing
its Injury · a multi-location Injury cleared by absence · a floored recovery ceiling · Recovery
run backwards or on `NaN` · continuity diagnostics speaking BodyPart · manifestation looping
instead of failing · two Injury entries sharing an id collapsing into one. It also pins
Recovery's validation boundary in both directions — what it checks, and that anatomical
applicability specifically is *not* its job.

`injury-ownership.test.ts` pins the §10 split as a contract, because an ownership refactor with
no behavioural intent breaks quietly: that an authored definition carrying both halves in one
object still registers and round-trips through JSON unchanged, that an `InjuryDefinition` stands
in as an `AnatomicalInjuryDefinition` with no conversion, that the catalog still works from its
new home and is the same map `registerDefinition("injury")` writes to, that Body manifests from
definitions **passed in** rather than fetched (proved by supplying one that was never registered,
and by supplying none), and that character validation still reports the anatomical and the
content error each from its owning layer.

`architecture.test.ts` checks the §1 rule 6 layering against the source text, because a
type-only import cycle compiles perfectly happily. It asserts Foundation imports **nothing** from
Rules — no whitelist, no exceptions — nor from Status (which would be a Rules edge one hop
round); that Rules never imports Injuries back; that Checks imports nothing from Rules; and that
provenance has exactly one structural definition. Its own detection was verified twice, by
reintroducing a removed import and watching it fail.

**Zero tests:** Nen (~3,970 LOC), Combat (~5,470 LOC), Aura Control, time clock/calendar,
equipment beyond the two demo items.

---

## 15 · What is NOT developed

### Not built at all

| Gap | State |
|---|---|
| **Damage → BP model** | Nothing defines how Strength Points become BP damage. This is the **highest-leverage hole**: it is what would validate `CONSTITUTION_DOUBLING_INTERVAL = 2` and the STR/CON durability parity the whole BP calibration rests on. |
| **Combat check resolution** | No Guard, Strike, Evasion, attack rolls, death saves. `gameplay/combat/` is turn/round/initiative/action *structure* only and references no Body, STR, BP or damage. |
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

`gameplay/combat/*` (~5,470 LOC) · most of `checks/*` (~1,150 LOC — `resolveCheck`,
`resolveFixedCheck`, `resolveOpposedCheck`, `CheckRequest` and friends are not exported; only the
scope vocabulary, `CheckModifierContribution`/`CheckSourceRef`/`CheckModifierChannel`, and the
roll-free `resolveCheckModifier`/`createCheckModifierTraceNode`/`collectApplicableCheckModifiers`
are, via `character/rules/effects.ts`'s re-export and the "Checks" barrel block) · the whole
`foundation/nen/` tree (~3,970 LOC) · `foundation/aura/control.ts` · `character/details.ts` ·
`time/{validation,calendar,clock}` · `infrastructure/{rounding,id}` · `character/progression/index`.

`foundation/actions/*` (Action capacity) is exported now — it moved out of `character/mechanics/`
in the Body-ownership pass and was integrated into `ResolvedCharacter.actionCapacity` at the same
time (§11), closing what used to be a "tested but never resolved" gap.

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
5. *(Resolved.)* The last `foundation/` → `character/rules/` import — the Injury definition —
   is gone. `AnatomicalInjuryDefinition` stays under Body, `InjuryDefinition` was rebuilt on top
   of it in `character/status/injuries/`, and Body is handed the definitions it needs. §1 rule 6
   now holds with **no exceptions**, enforced by `architecture.test.ts`. See §10.

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
cd packages/engine && npx vitest run     # 41 files, 1,023 tests
```

```bash
cd packages/engine && npx tsc --noEmit   # clean
```

**Standing rules:** the engine is authoritative over game mechanics, not the Rulebook prose.
Every divergence gets a `decisions/log.ts` entry and a `decisionId` on the trace, never an edit
to the book. One refactor phase at a time; every phase ends green.
