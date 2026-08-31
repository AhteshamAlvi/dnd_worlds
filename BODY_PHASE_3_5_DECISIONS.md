# Body Refactor — Phase 3–5 Blocking Decisions

**Status: FINAL.** These decisions supersede conflicting wording in
`BODY_REFACTOR_HANDOFF.md`, `~/Downloads/Body_Implementation_Plan.md`, and
`~/Downloads/Consolidated_Body_Design.md`. Where any of those disagree with
this file, this file wins. Do not infer behaviour from the older specs.

Baseline at time of writing: `packages/engine` 30 files / 655 tests passing,
`tsc --noEmit` clean. The workbench's 47 failures are pre-existing Phase 11
work and are not a gate for Phases 3–10.

---

# Phase 3 — Measurements and Height

## 3a · Height is a signed vertical span, not a longest unsigned path

The unsigned longest-simple-path rule is invalid. On the Standard Human it
lets `Foot-1 → Leg-1 → Lower Body → Leg-2 → Foot-2` resolve as
`7 + 81 + 0 + 81 + 7 = 176 cm`, beating the intended 165 cm.

Height instead assigns **signed** vertical coordinates to resolved anatomy and
measures total vertical extent.

Each Height-relevant BodyPart keeps a normalized longitudinal coordinate
`0.0 … 1.0` whose ends follow that part's authored anatomical axis, and gains:

```
heightContribution ∈ [0, 1]
heightAxisSign     ∈ { -1, +1 }
```

`heightAxisSign` says whether increasing local coordinate moves up or down in
the form's canonical vertical orientation. Moving through a part from local
coordinate `a` to `b`:

```
VerticalDelta = (b - a) x ResolvedLength x heightContribution x heightAxisSign
```

The delta is signed. This is deliberately a magnitude plus an orientation
rather than one signed number, despite the "one mechanism" principle applied
to `heightContribution` elsewhere: the two answer different questions.

## 3b · Attachments carry coordinates on both connected parts

Extend `BodyPartAttachment`. It keeps `parentId` and `site`, and gains:

```
parentPosition   0 <= p <= 1
childPosition    0 <= p <= 1
```

`site` survives as semantic metadata (shoulder, wrist, hip, neck). The
coordinate pair is separate numeric geometry.

Connections add no vertical distance. They assert:

```
vertical position at parentPosition == vertical position at childPosition
```

so the resolver traverses in either direction without depending on which part
was authored as parent.

## 3c · No authored Height bases or ground-contact schema

Signed coordinates make Height translation-invariant. The resolver picks any
point in a connected Height component as `z = 0`, propagates, and returns:

```
ResolvedHeight = max vertical coordinate - min vertical coordinate
```

The origin cancels. For the Standard Human the field produces bottom-of-foot
0 and top-of-head 165; crossing the pelvis into the opposite Leg returns to
the same lower coordinate instead of adding another 88 cm.

## 3d · Height-relevant anatomy must be acyclic

The Height-relevant subgraph must be a tree, or a forest where disconnected
components are intentional. Validation rejects a Height-relevant cycle. This
guarantees unique coordinate propagation without a cyclic-constraint solver.

Per connected component: choose an arbitrary origin, propagate signed
coordinates, take that component's min/max. An ordinary body has one
component. With several valid components, resolve each independently and use
the greatest span unless a later form-specific rule says otherwise.

## 3e · Standard Human authored orientation

```
Foot:        0 = ankle-side attachment, 1 = distal   sign -1   contribution 0.28
Leg:         0 = hip,                   1 = ankle    sign -1   contribution 1.0
Lower Body:  0 = inferior/pelvis,       1 = superior sign +1   contribution 1.0
Upper Body:  0 = inferior,              1 = superior sign +1   contribution 1.0
Neck:        0 = inferior,              1 = superior sign +1   contribution 1.0
Head:        0 = inferior,              1 = superior sign +1   contribution 1.0
```

Both Legs attach at the same Lower Body coordinate. Resulting span:

```
7 + 81 + 18 + 31 + 6 + 22 = 165 cm
```

Arms and Hands do not increase ordinary standing Height.

Worked propagation, taking lower-body coordinate 0 as origin:

```
lower-body 0 = 0        lower-body 1 = +18
leg 0 (hip)  = 0        leg 1 (ankle) = -81
foot 0       = -81      foot 1 (toe)  = -88
upper-body 1 = +49      neck 1 = +55      head 1 = +77
max 77 - min -88 = 165
```

## 3f · `BodyPart.state` is added now

`BodyPartState` exists as a type and is used by nothing. Make it persistent
anatomy-instance state:

```
state: BodyPartState   // "active" | "suppressed" | "archived-removed"
```

Default construction is active. Support it in constructors, defaults,
validation, serialization, selectors, and tracing where relevant.

Resolved measurements use only active anatomy:

```
active            -> contributes Length geometry, Size, Mass, Height
suppressed        -> contributes nothing
archived-removed  -> contributes nothing
```

A damaged but still active part keeps contributing its full physical
measurements. Strength normalization and destruction need this field too.

## 3g · Reference Form and instance state stay separate

Reference Form says what anatomy the current form is supposed to contain.
Instance state says which of it is currently present. Damage-driven removal
sets `state` to archived-removed and never rewrites the Reference Form.

## 3h · Species wiring stays deferred

`SpeciesBodyProfile` and `HUMAN_AGE_PROFILE` are not connected to production
Character resolution; that is Phase 8. Phases 3–5 Human and Giant gates use
explicit test/reference fixtures. Do not introduce premature Species
integration just to make these production-path tests. Document the split.

## 3i · Human age 12 Scale is locked to 0.89

`0.85 → 0.89` is authoritative. Update `HUMAN_AGE_PROFILE`, its documented age
table, the Phase 3 age goldens, and any fixture derived from that anchor,
*before* writing the Measurement goldens. Do not retain anything expecting
0.85. Regenerate every Height/Mass/Size expectation for that age from the
finalized profile rather than preserving stale output.

(The STR column of that documented table cannot be regenerated until Phase 5.
Phase 3 regenerates height and mass; Phase 5 closes the STR column.)

## Phase 3 gate

```
Standard Human:   Height 165 cm   Mass 62.00 kg   Size 60.00 L
Scale-10 fixture: Height 16.5 m   Mass 62,000 kg  Size 60,000 L
Height traversal: direction-independent, signed-coordinate based,
                  does not produce the false 176 cm two-Leg path
Age:              final HUMAN_AGE_PROFILE reproduces its own updated table
```

Also remove `CharacterDetails.heightCm` and `CharacterDetails.weightKg` as
persistent authored fields. They have no readers and are now derived Body
values.

---

# Phase 4 — Structural Capacity

Intentionally narrow.

```
MuscularityStructuralFactor = 1 + ((Muscularity - 1) x MuscularityStructuralSensitivity)

StructuralCapacity = ReferenceStructuralCapacity
                   x EffectiveScale^2
                   x MuscularityStructuralFactor
```

SC is not directly modified by Length, Bulk, Adiposity, CON, or STR.

## 4a · Do not integrate BP in Phase 4

Do not migrate Body Points onto SC here. The transitional `baseBP` shim
deliberately disagrees with the finalized Reference SC data — old Neck BP 4
against new Neck reference SC 2, old Leg BP 14 against new Leg reference SC
16. That mismatch is expected during a staged refactor. Keep the old BP
implementation green until Phase 6. Do not "clean up" BP while implementing
SC.

## 4b · Giant stays a fixture

```
Standard Human:     total SC = 100
Scale-10 fixture:   total SC = 10,000
Human Muscularity structural response: sum(refSC x muscularityStructural) = 76.30
```

---

# Phase 5 — Strength

Implements the Muscularity Force Factor, Intrinsic Max SP, Reference-Form
normalization, Normalized Body SP, Strength Position, Displayed STR, and
Strength advancement solving.

No `forceContributing` flag exists. Every physically present part is in the SP
sum; anatomy that inherently produces no force sets
`intrinsicPhysicalForce = 0` and contributes 0 by arithmetic.

## 5a · Base-mode advancement ignores anatomy instance state — final

Permanent Strength advancement must never become cheaper or dearer because a
character is injured, amputated, suppressed, or temporarily transformed.
Advancement resolves against the intact Base Reference Form.

Base mode ignores current `BodyPart.state`, damage/integrity, temporary
suppression, and resolved-only anatomy changes, and evaluates the Base
Reference Form's anatomy as intact:

```
Base Reference Form
 -> all base-form anatomy treated as present and intact
 -> Base Scale, Base Morphology, StrengthDevelopmentMuscularity,
    Base force modifiers
 -> Base Normalized Body SP
```

A character with 400 base normalized SP whose current resolved amputated body
reads 247 still buys the next advancement against `400 x 2 = 800`, not 494.

## 5b · Resolved mode does honour instance state

```
active           -> contributes IntrinsicMaxSP
suppressed       -> 0
archived-removed -> 0
```

The denominator stays the intact Reference Form capacity for the currently
resolved form. So amputation lowers current displayed STR while leaving
permanent advancement pricing untouched.

```
Base STR      -> permanent advancement baseline
Resolved STR  -> what the body can currently express
```

## 5c · Build `BodyResolutionMode` in Phase 5

Do not wait for Phase 8.

```
type BodyResolutionMode = "base" | "resolved"

resolveBody(input, { mode: "base" })
resolveBody(input, { mode: "resolved" })
```

One shared implementation. The mode controls which sources participate. Never
two algorithms. Through Phase 5 the Effect sets are simply empty; Phase 8
populates Base and Resolved Effects without redesigning the Strength solver or
adding a second physical pipeline.

## 5d · Strength development stays persistent Body state

`strengthDevelopmentMuscularity` remains a persistent Body field, never an
Effect, applied exactly once in the morphology pipeline. Advancement writes
this field. It must never also be expressed as `modifyBaseBodyMorphology`, or
it double-counts.

## 5e · Strength formulas

```
MuscularityForceFactor = 2^((Muscularity - 1) x MuscularityForceSensitivity)

IntrinsicMaxSP = StructuralCapacity
               x MuscularityForceFactor
               x intrinsicPhysicalForce
               x applicable intrinsic force modifiers

TotalIntrinsicBodySP = sum of IntrinsicMaxSP
```

Resolved mode sums over currently active parts. Base mode sums over the intact
Base Reference Form.

## 5f · Reference-Form normalization

```
ReferenceFormAnatomicalCapacity = sum of ReferenceStructuralCapacity
                                  over the intact Reference Form

NormalizedBodySP = 100 x (TotalIntrinsicBodySP / ReferenceFormAnatomicalCapacity)
```

The denominator never shrinks from damage, amputation, suppression, Joint
failure, or instance-state destruction. Extra anatomy genuinely part of the
form raises both numerator potential and denominator; missing anatomy reduces
only the numerator.

## 5g · Zero-Strength rule

```
NormalizedBodySP = 0
  -> StrengthPosition = null
  -> DisplayedSTR     = 0
```

Never `DisplayedSTR = null`. Derived Attributes require a numeric STR:
`derived/resolution.ts` sums `["str","agi","dex","per","wis"]` directly, and
`deriveStandardModifier` is deliberately unclamped so 0 -> -5 is safe.

## 5h · STR representation and cap

```
StrengthPosition = 10 + log2(NormalizedBodySP / 100)     // never clamped
DisplayedSTR     = clamp(1, 30, floor(StrengthPosition)) // Stat surface only
```

The zero-strength case returns `DisplayedSTR = 0`; 0 is reserved for it and
the ordinary range stays 1–30.

## 5i · Phase 5 exposes an advancement-cap failure

The low-level numerical solver may stay mathematically generic, but the public
Strength-advancement operation returns an explicit `EngineResult` failure when
Base-mode displayed STR is already at the ordinary cap:

```
if BaseDisplayedSTR >= 30: advancement fails
```

A character at STR 29 may buy one advancement that carries Strength Position
past 30 and displays 30; further ordinary advancement is refused. Temporary or
resolved-only effects reaching 30 do not block advancement while Base-mode STR
is below the cap. Phase 9 Progression calls this Phase 5 contract rather than
inventing its own cap check.

## 5j · Advancement target

```
TargetNormalizedBodySP = CurrentBaseNormalizedBodySP x 2
```

Not the next displayed tier minimum, and not the resolved/damaged SP doubled.
Always Base-mode normalized SP.

## 5k · Solver requirements

The solver changes only `strengthDevelopmentMuscularity` and searches upward
from its current value, by deterministic monotonic bracket expansion plus
binary search:

```
1. resolve current Base Normalized Body SP
2. target = current x 2
3. lower bound = current strengthDevelopmentMuscularity
4. expand upper bound until Base Normalized SP >= target
5. binary-search the bracket
6. return the solved persistent strengthDevelopmentMuscularity
```

Fixed guards:

```
maximum bracket expansions:      64
maximum binary-search iterations: 128
relative target-SP tolerance:     1e-9
```

All evaluations stay finite. If expansion goes non-finite or cannot bracket
the target within the ceiling, return an explicit failure. Never loop
indefinitely.

## 5l · Monotonicity preconditions

The solver relies on non-decreasing Strength response as
`strengthDevelopmentMuscularity` rises, which follows from:

```
Muscularity > 0
0 <= MuscularityStructuralSensitivity <= 1
MuscularityForceSensitivity >= 0
intrinsicPhysicalForce >= 0
```

and every other multiplicative Muscularity layer staying strictly positive.
Assert these rather than assume them.

Before solving, verify the Base Reference Form actually responds to Strength:
at least one part with effective intrinsic force above zero and a positive
response through `muscularityStructural > 0` or `muscularityForce > 0`. A Base
Body insensitive to Strength-development Muscularity cannot reach the doubling
target, and advancement must fail explicitly. Likewise a Base Reference Form
with no usable intrinsic physical force cannot buy ordinary muscular Strength
advancement.

## 5m · Human calibration gate

```
Muscularity 1.0 -> total SC 100, intrinsic SP 100, reference capacity 100,
                   normalized SP 100, Strength Position 10, Displayed STR 10

first advancement: Muscularity 1.0000 -> ~1.5747
                   normalized SP 100 -> ~200
                   Displayed STR 10 -> 11
                   total SC 100 -> ~143.85
```

The old `M ~= 2.3106` calibration is obsolete.

## 5n · Giant gate (Scale-10 proportional fixture)

```
Scale 10, neutral Muscularity 1
reference capacity 100, total SC 10,000, intrinsic SP 10,000
normalized SP 10,000
StrengthPosition = 10 + log2(100) ~= 16.64
Displayed STR = 16
```

## 5o · Four-arm normalization gate

```
reference capacity 136, intrinsic SP 136 -> normalized 100 -> STR 10
```

Extra intended anatomy creates no free normalized STR.

## 5p · Amputation gate

Neutral Human, Base Reference Form still 100, Resolved anatomy missing both
Arms and Hands:

```
active neutral intrinsic SP ~= 64
Resolved normalized SP 64, Strength Position ~= 9.36, Displayed STR 9
Base mode unaffected by the damage-driven anatomy state
```

## Phase 5 gate

```
Standard Human           100 normalized SP -> STR 10
first advancement        100 -> 200, M ~= 1.5747, STR 11
off-threshold            current Base normalized SP x2, no tier snapping
Giant                    10,000 normalized SP, position ~16.64, STR 16
four-arm form            136 / 136 -> 100 -> STR 10
amputated Human          Resolved STR falls, Base baseline does not
zero-SP body             StrengthPosition null, Displayed STR 0
STR cap                  public advancement refuses at Base displayed STR 30
solver                   bounded, finite, monotonic, deterministic
```

---

# Cross-cutting schema corrections

Two prerequisites were skipped in earlier phases and must land before Phase 5:

```
1. BodyPart.state
2. two-sided attachment longitudinal coordinates
```

Both belong to Phase 3 — Measurements is the first subsystem that needs
either. No separate Phase 2.5 unless repository workflow specifically benefits
from isolating schema-only changes.

---

# Sequencing rule

```
Phase 3 -> green engine tests -> tsc clean -> report/commit
Phase 4 -> green engine tests -> tsc clean -> report/commit
Phase 5 -> green engine tests -> tsc clean -> report/commit
```

Do not mix the Phase 6 BP migration into Phases 3–5. Do not prematurely
implement Phase 8 Species/Effect wiring. Do introduce the Base/Resolved
resolution mode in Phase 5 so Phase 8 can populate it without rewriting
Strength. The existing green engine baseline remains the falsification gate
after every phase.

---

# Final decisions, condensed

```
Height                        signed coordinate span, not longest unsigned path
Height base                   none required
Attachment geometry           coordinates on both connected BodyParts
Height graph                  acyclic
BodyPart state                persistent instance field, added in Phase 3
Age 12 Human Scale            0.89
Species Body production wiring deferred to Phase 8; fixtures through Phase 5
Phase 4                       SC only; do not migrate BP
Strength advancement baseline intact Base Reference Form
Damage/amputation/suppression does not alter advancement pricing
Resolved STR                  does respond to missing/suppressed anatomy
Base/Resolved resolver mode   introduced in Phase 5
StrengthDevelopmentMuscularity persistent Body field, never an Effect
Zero physical Strength        Displayed STR 0, Strength Position null
STR cap                       surface cap 30; Phase 5 advancement refuses at Base 30
Solver                        bracket + binary search, 64 expansions,
                              128 iterations, 1e-9 relative tolerance
Force-contributing flag       does not exist
Non-force-producing anatomy   intrinsicPhysicalForce = 0
```
