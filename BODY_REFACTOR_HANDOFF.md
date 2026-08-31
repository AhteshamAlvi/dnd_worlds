# Body System Refactor — Handoff

**Branch:** `newbranch-refactor` · **Last commit:** `1272f5c` (Phase 2)
**Baseline:** `npm test` → 30 files / **655 passing**. `npm run typecheck -w @nenworld/engine` → **clean**.
**Done:** Phases 0, 1, 2 · **Next:** Phase 3 (approved) · **Total:** 12 phases

---

## ⚠️ Read this first: the plans in `~/Downloads` are one generation behind

The three source documents are **generation 2**. They already contain the
Muscularity Force Factor and Reference-Form normalization. They do **not**
contain a set of later corrections that were agreed in conversation and
**never written to any file**.

**§"Corrections not in any document" below is authoritative and overrides the
Downloads documents wherever they disagree.** Implementing straight from those
files will produce the wrong CON curve, a `null` STR that breaks Derived
Attributes, an unbounded sensitivity that yields negative Body Points, and no
Base/Resolved Effect split at all.

---

## Source documents

| File in `~/Downloads` | Use it for | Watch out |
|---|---|---|
| `Body_Implementation_Plan.md` | Phase structure, module layout, test plan | Missing corrections below; Phase 11 under-scoped |
| `Consolidated_Body_Design.md` | Formulas, semantics, invariants | Missing corrections below |
| `Human_Standard_Scale.md` | Per-part Length/Size/Mass/SC, sensitivity matrix, Anatomical Point roster | Current and clean. Already ported into the engine in Phase 1 |

The older `Body System Refactor — Implementation Plan.md`, `Body System —
Complete Consolidated Design.md`, and `Basic Human Standard — Complete Body
Reference.md` are gone from Downloads and fully superseded. If they resurface,
discard them — they carry the obsolete `STRFactor = 2^((STR-9)/3)` / 127-SP
model.

---

## Corrections not in any document

Verified absent from both `Body_Implementation_Plan.md` and
`Consolidated_Body_Design.md` by grep. These are decisions, not proposals.

**1 · CON scaling is `/2`, not `/5`.**
```
CONFactor = 2^((CON - 10) / 2)      every +2 CON doubles BP
```
Rationale: with the force factor in place, +1 STR raises SC by ×1.44, so
`/2` (×1.414 per CON) makes STR and CON roughly equal durability buys at
baseline. Consequences to keep in view: the CON 1–30 dynamic range widens from
56× to 23,170×, and CON ≤ 5 drives a Human Neck's Max BP below 0.5. **The
existing `Math.max(1, ...)` floor in `roundMaximumBP` becomes load-bearing** —
it is currently in code only, in no document, and Phase 6 rewrites that file.
Keep `CONSTITUTION_DOUBLING_INTERVAL` a named constant; this number is a guess
until a damage model exists to validate it.

**2 · A Strength-less body resolves `DisplayedSTR = 0`, not `null`.**
`strengthPosition` stays `null` (log₂(0) is undefined) but the Stat must be
numeric, because `derived/resolution.ts` sums `["str","agi","dex","per","wis"]`
directly. `deriveStandardModifier` is deliberately unclamped, so 0 → −5 is
safe. `0` is reserved for this case; the ordinary range stays 1–30.

**3 · `DisplayedSTR = clamp(1, 30, floor(strengthPosition))`.**
`strengthPosition` itself is never clamped. The cap applies only at the Stat
surface. Progression must reject Strength advancement at the cap.

**4 · `muscularityStructural` must be within `[0, 1]`; `muscularityForce ≥ 0`.**
Above 1, `1 + ((M−1)×s)` crosses zero at legal low Muscularity — at s=1.5,
M=0.3 gives −0.05 and the part gets negative SC/BP/SP. Validation failure, not
a silent clamp. *(Implemented in Phase 2.)*

**5 · The Height-relevant subgraph must be acyclic.** "Greatest path, no
revisiting" is longest-simple-path: linear on a forest, NP-hard with a cycle.
Validation must reject cycles.

**6 · Recovery operates in exact-integrity space.**
`newExact = min(maxBP, exactCurrentBP + healed)`, then re-derive the fraction.
Round only for display. Destroyed parts are never restored by ordinary healing.

**7 · Anatomical Point thresholds use *rounded* gameplay Max BP**, so
thresholds match the number on the sheet.

**8 · Body Effects need a Base/Resolved split — ten new variants.**
```
modifyBase/ResolvedBodyScale          modifyBase/ResolvedIntrinsicPhysicalForce
modifyBase/ResolvedBodyMorphology     modifyBase/ResolvedDestructionResistance
modifyBase/ResolvedBodyAnatomy
```
Effect union goes 6 → 16; each needs type, validation, resolver, trace,
serialization, `EFFECT_TYPES`, workbench selector.

One resolver with a mode: `resolveBody(input, "base" | "resolved")`. Base mode
excludes resolved-only Effects and is what Strength advancement calibrates
against. **Never two implementations.**

**9 · Anatomy Effects carry an explicit mode.** Never infer Reference-Form
behaviour from the Effect type:

| mode | Reference Form | Present anatomy |
|---|---|---|
| `addToForm` | grows | contributes |
| `removeFromForm` | shrinks | absent |
| `suppress` | **unchanged** | absent → STR falls |
| `replaceForm` | replaced wholesale | new form's anatomy |

`suppress` is invalid on `modifyBaseBodyAnatomy`. Validation must enforce the
matrix.

**10 · Damage-driven loss is never an Effect.** Destruction sets anatomy
instance state to `ARCHIVED_REMOVED`. It must never emit
`modifyBase/ResolvedBodyAnatomy` — that would shrink the denominator too and
resurrect the normalization bug where amputation cancels itself out.

**11 · No `forceContributing` flag.** Both sums are unfiltered:
```
ReferenceFormAnatomicalCapacity = Σ refSC of ALL parts in the intact Reference Form
TotalIntrinsicBodySP            = Σ IntrinsicMaxSP of ALL physically present parts
```
Inert anatomy (bone spike, shell, horn) sets `intrinsicPhysicalForce: 0` and
contributes 0 to the numerator by arithmetic while still carrying Size, Mass,
SC and BP. **Delete the phrase "force-contributing anatomy" from the design
doc.** Intended consequence: a form carrying inert structure reads as weaker.

**12 · This is a breaking schema change.** No migration layer. Old Body JSON
should fail validation with an explicit error.

---

## Also decided in conversation, not in the docs

- **Human age curve authored** (`body/age/human-age-profile.ts`). Scale and
  muscularity as the user specified; bulk and adiposity added by Claude.
- **`heightContribution` is one number, not a flag + number.** `0` means the
  part never contributes to Height. Same "one mechanism" principle as #11.
- **Internal resolvers return plain values.** `EngineResult`/`TraceNode` wraps
  at `body/resolution.ts` in Phase 10, matching how `attributes/` already works.
- **`SpeciesBodyProfile` lives in `body/species-profile.ts`**, so Body owns the
  shape and Species imports it (avoids `body → identity`).

---

## Current state

### Shims — all deleted in Phase 6, none are permanent

| Shim | Why |
|---|---|
| `BodyPartDefinition.baseBP` | BP still resolves from it until BP consumes SC. Deliberately disagrees with `reference.structuralCapacity` per part (Neck 4 vs 2, Leg 14 vs 16) |
| `BodyPartDefinition.morphologySensitivity` | Superseded by `sensitivity` |
| `Body.heightCm` / `massKg` / `build` | Superseded by derived measurements + `globalMorphology` |
| `body-points/morphology.ts` (544 lines) | The old morphology system. Two morphology modules coexist until Phase 6 — **this is intentional, not accidental duplication** |
| `__tests__/fixtures/body.ts` | Deliberately inert placeholders for suites predating the physical model. Never assert against them |

**Keeping the suite green is the point of the shims.** It is the only signal
distinguishing new breakage from pre-existing breakage across twelve phases.

### Phases done

**0** — Fixed 11 `noUncheckedIndexedAccess` errors in `combat/initiative.ts` and
`mechanics/actions/validation.ts` (5,459 lines of combat code had never been
typechecked; there are no combat tests, so `tsc` is its only gate). Removed
`body.zip` + tracked `.DS_Store`.

**1** — `BodyPartDefinition` gained `reference` + `sensitivity`. Human Standard
authored. `Body` gained `characterScale`, `globalMorphology`, `localMorphology`,
`strengthDevelopmentMuscularity`. `BodyPartState` + `ReferenceForm` defined.
`body-reference-standard.test.ts` asserts the calibration gate with no resolver:
60.00 L / 62.00 kg / 100 SC / 165 cm / 76.30.

**2** — `body/age/` (linear anchor interpolation, holds flat outside range,
absent data → mature adult) and `body/morphology/` (add-within-layer,
multiply-between-layer) and `body/scale.ts`. Sensitivity bounds enforced.

---

## Next: Phase 3 — Measurements and Height

**Approved, including:** remove `CharacterDetails.heightCm` and `weightKg`
(currently commented "descriptive for now — Body integration can be added
later"). They become a silently-disagreeing second source once measurements
resolve.

- `body/measurements/` — resolved Length/Size/Mass per part and body totals.
  `EffectiveBulk`, `AdipositySizeFactor`, `MassCompositionFactor`. Only
  physically present parts contribute; joint-destroyed and paralysed limbs
  still have mass, suppressed and severed ones don't.
- `measurements/height.ts` — direction-independent longitudinal coordinates on
  **both** ends of each height-relevant connection;
  `|exit − entry| × resolvedLength × heightContribution`; connections add zero
  distance. Enforce the acyclic constraint (correction #5).

**Gate:** the resolver (not a sum of constants) produces 165 cm / 62.00 kg /
60.00 L; Height is identical whichever direction connections were authored;
Giant at scale 10 → 16.5 m / 62 t; the age curve reproduces its height/mass
table end to end.

---

## Remaining phases

| # | Scope | The thing that will bite |
|---|---|---|
| 4 | Structural Capacity | Human SC 100, Giant scale-10 SC 10,000 |
| 5 | Strength: force factor, normalization, STR, advancement solver | **Open decision below.** Solver is bracket-expand + binary search — the `2^` term means no closed form |
| 6 | Body Points + integrity | Delete every shim. Apply CON `/2`. Preserve the Max-BP-≥-1 floor |
| 7 | Damage + Anatomical Points | Weak ×1.5 → round → apply → evaluate Critical/Joint/Fatal independently |
| 8 | Effects + Species integration | Corrections #8, #9, #10. 6 → 16 Effect variants |
| 9 | Attributes + progression | Remove stored `str` (only 4 non-test files touch it). Array 8 → 7 values |
| 10 | Character resolution + trace | `EngineResult`/`TraceNode` wrapping lands here |
| 11 | Downstream consumers | **Under-scoped in the plan** — see below |
| 12 | Full regression | Body goldens + full suite + `tsc` |

### Phase 11 is bigger than the plan says

The workbench is **already broken against the current engine**, before this
refactor touched anything: **38 type errors, 47 of 97 tests failing.** It never
absorbed two prior engine migrations — `character.name` → `character.details.name`
(≈44 of the 47 failures bottom out here), `body.surfaceUnits` removed, and
`mutation`/`ability` dropped from `CatalogDomain`.

So Phase 11 is "reconnect the workbench to an engine that moved three times",
not "update it for Body". **Do not fix it earlier** — Body will invalidate part
of the fix (`surfaceUnits` is a Body field being deleted anyway). The workbench
is **not a gate** for Phases 1–10.

---

## Open items

**1 · Blocking Phase 5 — does base-mode resolution see anatomy instance state?**
The final §5 still says both:
> RESOLVED BODY = Base Body + resolved-only effects **+ current anatomy instance state**

> Body persistent state ├── character morphology ├── StrengthDevelopmentMuscularity └── **anatomy instance state**

> `resolveBody(input, BASE)` applies: **persistent Body state**, Base Effects, Base Reference Form

It decides a price. A STR 12 Human (M ≈ 2.2153, normalized 400) who loses both
Arms and Hands drops to ≈247 resolved. On buying +1 STR:
- base mode **ignores** instance state → baseline 400, target 800
- base mode **includes** it → baseline 247, target 494

**Claude's recommendation: exclude instance state from base mode**, so
advancement cost doesn't depend on transient physical misfortune. Pick one and
delete the other two phrasings.

**2 · Human age curve, 12-year-old.** Scale `0.85` (140 cm) forces bulk to
*rise* from 1.10 at six to 1.13 to hit a realistic mass — a 12-year-old
stockier than a 6-year-old. Bulk was kept monotonic at 1.08 and the
12-year-old reads ~6% light instead. **Nudging scale to `0.89` (147 cm, closer
to a real ~149) fixes both.** Offered, not taken — it's an authored number.

**3 · Ages below ~4 are too light.** 1.8 kg at birth against a real 3.5. Not a
bad anchor: mass goes as scale³, which assumes an infant is a scaled-down
adult, and no bulk/adiposity value fixes it. The real fix is age **local**
morphology (proportionally large head, short limbs) — supported by the profile
format, unused. Ages 6+ land within 3% with sane BMI. Documented in the profile.

**4 · CON `/2` is unvalidated.** Nothing defines how SP becomes BP damage;
`combat/` is turn/round/initiative structure only and references no
Body/STR/BP/damage. The divisor is a named constant precisely so it can be
retuned once a damage model exists. `/3` (range 1,024×, CON 30 → ×101) is the
obvious alternative.

**5 · Orphaned archive records.** If a Base `removeFromForm` drops Legs from the
form while those Legs are already `ARCHIVED_REMOVED`, are the records dropped or
retained for a later form restoration? Retention is probably right. Decide
before Phase 8.

---

## Working agreement

- **One phase at a time.** Explain the phase, get approval, implement, report.
  Never run ahead.
- **Every phase ends green** — full suite + `tsc --noEmit`. A red baseline makes
  every later phase unfalsifiable.
- **Commit per phase**, with the reasoning in the message, not just the change.
- **Surface arithmetic before authoring it.** Both real problems found so far —
  the STR-14 density blowup and the infant mass gap — came from computing the
  consequences rather than trusting the tables.
