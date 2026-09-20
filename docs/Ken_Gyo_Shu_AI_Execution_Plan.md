# KGS-1 — Implement Ken, Gyō, and Shū

## 1. Starting point

- Branch: `main`
- Authoritative starting commit: `49b9a53` (`Hatsu and nen type`)
- Expected engine baseline: 136 test files / 5,742 tests passing
- Engine typecheck: clean
- Monorepo typecheck: 65 pre-existing Workbench errors
- `foundation/nen/principles/` currently contains only Ten, Ren, Zetsu, Hatsu, and Chū.
- `character/nen/` has runtime adapters for Ren and Zetsu but none for Ken, Gyō, or Shū.
- `NEN_PROGRESSION_RULES` currently and incorrectly treats Ken and Gyō as mastery-capped by `min(Ten, Ren)` and treats Shū as mastery-capped by Ten.
- The current Ren table still gives Mastery VIII and IX finite physiological durations; this ticket changes VIII–X to unlimited.
- Generic Aura already supports whole-body and authorized differential body placement. `gameplay/aura` already supports authoritative `item-surface` measures. Equipment already owns binary `shuInteraction`, a whole-Item envelope, signed Item Effects, and an integrity-mitigation seam.
- There is no equipment slot/contact model and no authoritative Item surface geometry yet. Do not infer either from names, mass, price, family, attack values, or `held`/`worn` alone.

Start from the latest pushed `main`, not an older local checkout. Record the actual commit, test counts, engine typecheck, monorepo typecheck, and dirty files before editing. Preserve unrelated changes. Do not commit or delete pre-existing untracked ticket documents unless explicitly asked.

## 2. Objective

Implement Ken, Gyō, and Shū as one integrated feature:

1. Ken opens Output through Ren and contains it uniformly over the body without leakage.
2. Gyō uses the same Ren-access/Ken-containment limits and moves part of the coating into one contiguous focus region.
3. Shū extends the existing coating boundary onto selected Items without creating Output, concentration, upkeep, or endurance of its own.
4. Implement their unlock rules, seal propagation, compatibility, transitions, action costs, Output competition, exact endurance, placement, eye-Gyō sensory contribution, Item contact/conductivity, whole-Item enhancement, and exact-time loss/recomputation.
5. Keep Aura, equipment, senses, Combat, and the generic Nen runtime principle-neutral.

This is one ticket because the three principles share one coating boundary and one Output budget. Do not implement them as disconnected systems that later attempt to reconcile three different distributions.

## 3. Non-goals

Do not implement:

- Kō, Ryū, En, In, Yū, Jū, Fū, or awakened Chū;
- Nen Ability category allocation, governed effects, restrictions, conditions, or vows;
- a new damage or defense formula;
- equipment hands, slots, readiness, or general contact simulation;
- automatic Item geometry inferred from descriptive content;
- automatic defeat of concealment, In, Zetsu, darkness, range, or line of sight;
- a second Detection check;
- permanent principle activity inside `Character` or `NenState`;
- principle-id branches in Foundation Aura, equipment, senses, Combat, or the generic runtime.

Ken/Gyō/Shū must expose resolved coating, density, attack/defense inputs, sensory modifiers, Item factors, and integrity mitigation for their existing consumers. They must not finish the later combat schema themselves.

## 4. Architectural boundaries

### 4.1 Ownership

- `foundation/nen/principles/ken.ts`, `gyo.ts`, and `shu.ts` own pure tables, formulas, validation, and traces.
- `character/nen/ken.ts`, `gyo.ts`, and `shu.ts` own character state/mastery access, principle-specific runtime definitions, activation/adjustment/termination, and projection into generic facts.
- The generic Nen runtime owns lifecycle, compatibility declarations, funding links, exact timestamps, exertion-clock integration, and stop causes. It must not compare principle ids.
- Foundation Aura owns Output, funding, body allocations, density, time, and recovery. It must not import a principle or equipment module.
- Equipment owns Item identity, compatibility, authored Shū physics, structural validation, envelopes, and integrity settlement. It must not calculate Aura or import a principle.
- `gameplay/aura` remains the composition boundary for body and Item surface placement.
- Add `gameplay/nen/` as the composition layer allowed to join character Nen projections, Body measurements, `gameplay/aura`, equipment envelopes, senses, and Combat action spending. Character and Foundation must never import `gameplay/nen/`.
- Eye Gyō produces at most one contextual modifier for one concrete check. Senses must not learn what Gyō is.

### 4.2 One source of truth

There must be exactly one production owner for each of:

- Ken containment fractions and durations;
- Gyō concentration fractions and DEX requirements;
- Shū Item-count, efficiency, and DEX tables;
- eye-Gyō tier calculation;
- Item conductivity/path transmission;
- Shū enhancement factor;
- principle transition Action cost;
- compatibility declarations.

Tests may state expected values but no second production table or formula may exist.

### 4.3 Scene state

Ken, Gyō, and Shū are runtime activities beside Character state. Do not add active flags to `NenState`.

Principle-specific configuration that cannot fit the existing generic fields—Gyō focus/shift and Shū Item/contact selection—must be carried as validated JSON-safe opaque activity configuration that the generic runtime preserves but never interprets. Add the smallest generic field necessary, validate that it is JSON-safe, and let only the owning adapter decode it. Do not add `ken`, `gyo`, or `shu` fields to generic runtime types.

### 4.4 Multiple endurance clocks

The existing runtime has one `durationSeconds`, one `exertionLoad`, and one progress value. Ken and Gyō require two independent clocks. Generalize this into named, principle-neutral exertion clocks:

```text
clock = { id, fullLoadDurationSeconds, load }
progress = { clockId, fullLoadEquivalentSeconds, resolvedAt }
```

- A missing clock means that dimension is unlimited.
- Every finite duration is positive and every load is finite in `(0, 1]`, except a Gyō-adjusted containment load may reach `2`; define the generic bound to accept the actual closed range required rather than pretending it is still `(0,1]`.
- The runtime integrates every clock, expires at the earliest exhausted clock, and reports which clock exhausted.
- Adjustment settles all old clocks to the adjustment instant, preserves accumulated progress by clock id, then applies new loads/capacities.
- Ren migrates to one `output` clock. Ken and Gyō use `output` and `containment` clocks. Do not leave the old single-clock API as a parallel authority unless a proven external compatibility requirement exists.
- Subdivision invariance and JSON round-trip stability are mandatory.

## 5. Progression

### 5.1 Unlock-only dependencies

Replace the current mastery-cap edges:

| Principle | Unlock prerequisite | Continuous functional prerequisites | Mastery cap from prerequisite |
|---|---|---|---|
| Ken | Ten and Ren learned | effective Ten ≥ I and effective Ren ≥ I | None |
| Gyō | Ken learned | effective Ken ≥ I, Ten ≥ I, Ren ≥ I | None |
| Shū | Ten learned | effective Ten ≥ I | None |

Ken III remains Ken III with Ren II; its containment capacity is III, but Ren II limits how much Output it can actually open. Gyō and Shū likewise retain their stored/effective mastery when a predecessor has a lower rank.

Seals do not mutate stored mastery. A seal reducing a functional predecessor to zero prevents the child activity from starting and ends a running child as `sealed`. Lifting the seal does not resume it.

Ren being sealed must not disable Shū.

### 5.2 Gyō backfill

Ordinary advancement to Gyō I requires Ken I. An explicitly authorized grant that gives Gyō while Ken is unlearned must atomically grant Ken I in the same transition. It must:

- never grant Ten, Ren, Zetsu, or Hatsu;
- preserve a Ken rank already above I;
- emit deterministic events for both grants;
- either apply both changes or neither;
- validate the final draft before commitment.

Implement this as an explicit generic progression/grant rule used only where declared; do not hard-code `if principleId === "gyo"` in generic settlement. Hand-built invalid state is not silently mutated by a read resolver.

### 5.3 Advancement attributes

Gyō DEX requirements:

| Mastery | I | II | III | IV | V | VI | VII | VIII | IX | X |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DEX | 16 | 16 | 17 | 17 | 18 | 18 | 19 | 20 | 21 | 22 |

Shū DEX requirements:

| Mastery | I | II | III | IV | V | VI | VII | VIII | IX | X |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DEX | 16 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 24 | 26 |

These are advancement gates only. They never reduce mastery already held and never become runtime constraints.

## 6. Compatibility and lifecycle

Ten is passive derived state. Ren, Ken, Gyō, and Zetsu are exclusive body states. Shū is an Item-boundary overlay.

| Combination | Allowed |
|---|---:|
| Ten + Ken | No |
| Ten + Gyō | No |
| Ten + Shū | Yes |
| Ren + Ken | No |
| Ren + Gyō | No |
| Ren + Shū | No |
| Ken + Gyō | No |
| Ken + Shū | Yes |
| Gyō + Shū | Yes |
| Zetsu + Ken/Gyō/Shū | No |
| Hatsu/Ability + Ken/Gyō/Shū | Yes unless that activity declares otherwise |

Required transitions:

- Starting Ren ends Ken, Gyō, and Shū as `replaced`; Ten is displaced through access projection.
- Starting Ken ends Ren and Gyō as `replaced`; Ten is displaced; Shū remains.
- Starting Gyō ends Ren and Ken as `replaced`; Ten is displaced; Shū remains.
- Ending Ken or Gyō restores ordinary Ten at the same timestamp if legal; replaced activities do not resume.
- Starting Zetsu ends Ken, Gyō, and Shū according to existing suppression/replacement rules.
- Returning to Ten ends Ren/Ken/Gyō but does not end a legal Shū.
- A failed activation or adjustment mutates nothing and spends no Action.
- A forced reduction/end costs no Action.
- Suppression, reversion, seal loss, Output loss, expiry, and owner/component loss must stop activities at the exact boundary.

Express compatibility through authored generic runtime relations/constraints. Do not add principle switches to runtime.

## 7. Principle Action cost

For Ken, Gyō, Shū, and future ordinary principles:

| Effective mastery | Voluntary start, adjust, or stop |
|---:|---:|
| I–VII | 1 Action |
| VIII–X | 0 Actions |

Rules:

- The operation is legal only on the actor’s Turn or during their already-open Reaction.
- The cost uses the existing shared Combat Action pool and state cap through `spendCombatAction`/the canonical Combat resolution path.
- Ten remains automatic and has no activation action.
- Hatsu/Ability activation remains at least one Action regardless of mastery and is not changed here.
- A Skill may declare that one or more principle transitions are bundled into its own application. The Skill pays its existing Action cost; the bundled transition adds no second Action.
- A Skill that only requires an already-active principle does not bundle activation.
- A resolved Trait authorization may waive the principle Action cost during a Turn or Reaction.
- Do not accept an unproven raw boolean such as `free: true`. Bundle/waiver authorization must be source-bound and resolved through the same authored-source/provenance pattern used elsewhere.
- Principle settlement and Action spending are atomic: validate the principle transition first without committing it, validate Action affordability/window, then commit both or neither.

Place cross-domain composition in `gameplay/nen/`, not `gameplay/combat/` importing Character. Add architecture guards for the direction.

## 8. Ren correction required by Ken

Preserve Ren’s Output fractions. Change physiological full-output endurance to:

| Ren mastery | I | II | III | IV | V | VI | VII | VIII | IX | X |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Full-output endurance | 1m | 2m | 5m | 10m | 20m | 30m | 60m | Unlimited | Unlimited | Unlimited |

Raw Ren still loses `Oactive` Aura per minute. Unlimited physiological duration does not make its Aura expenditure free.

Move Ren onto the generic named `output` exertion clock. Ren VIII–X omit that finite clock but retain outward-flow depletion.

## 9. Ken

### 9.1 Pure mastery table

| Ken mastery | Containment fraction of Physiological Output `P` | Full-containment endurance |
|---:|---:|---:|
| I | 10% | 30 seconds |
| II | 20% | 1 minute |
| III | 30% | 2.5 minutes |
| IV | 40% | 5 minutes |
| V | 50% | 10 minutes |
| VI | 60% | 15 minutes |
| VII | 70% | 30 minutes |
| VIII | 80% | 60 minutes |
| IX | 90% | 120 minutes |
| X | 100% | Unlimited |

```text
Cken = P * kenContainmentFraction
Oren = P * renAccessFraction
OkenMax = min(Cken, Oren, shared Output remaining, Current Aura availability)
```

Ken mastery determines how much can be contained. Ren mastery determines how much can be opened. Neither caps the other’s mastery rank.

### 9.2 Selection and shortfall

- Select a finite positive absolute Output `Oactive <= OkenMax`.
- Start or deliberate increase requires full funding; never silently scale the requested transition.
- Deliberate raise/lower uses the Action rule in §7.
- Later budget/Aura loss may reduce Ken automatically to the greatest valid amount.
- Zero funding or loss of a functional prerequisite ends Ken.
- Store the requested/active absolute Output, not merely a percentage.

### 9.3 Endurance

Ken has two independent clocks:

```text
outputLoad      = Oactive / Oren
containmentLoad = Oactive / Cken
```

- `output` uses the effective Ren rank’s duration from §8.
- `containment` uses the effective Ken rank’s duration from §9.1.
- Ken ends at the earliest exhausted finite clock.
- Lower Output extends each finite clock proportionally.
- Adjustments settle old loads first and preserve accumulated progress.

### 9.4 Aura economy and access

Ken is fully contained. Its active Output has exactly zero leakage at every Ken mastery. Containment capacity is what mastery represents: Ken II means up to `20%P` can be held without leaking.

Ken has:

- no Ren-style outward-flow cost;
- no passive leakage;
- no generic Aura upkeep;
- zero natural recovery because it is deliberate active Nen;
- ordinary `2R/hour` physical consumption while physically exerting;
- all explicit Skill/Ability costs, hostile drains, and authored surcharges normally.

Do not derive Ken leakage from Ten mastery. Do not retain a placeholder leakage field.

### 9.5 Placement

Ken places all `Oactive` uniformly across the current valid coating boundary. Without Shū, that is the entire eligible body surface:

```text
Dken = Oactive / body surface area
```

Ken I’s `10%P` coating is physically the same coating as Ten’s `10%P` coating. Do not invent offensive/defensive coating types or a Ken-only force bonus.

Attack consumers read the attacking Body Part’s coating. Defense consumers read the struck Body Part’s coating. No parent, adjacent-part, or internal chain contributes. The coating is not consumed by use.

## 10. Gyō

### 10.1 Output and containment

Gyō has no separate Output or containment curve:

```text
OgyoMax = min(Cken, Oren, shared Output remaining, Current Aura availability)
```

Resolve `Cken` from effective Ken mastery and `Oren` from effective Ren mastery. Select a finite positive active Output and apply the same full-funding/automatic-shortfall rules as Ken.

### 10.2 Concentration table

| Gyō mastery | Maximum shift fraction |
|---:|---:|
| I | 10% |
| II | 20% |
| III | 30% |
| IV | 40% |
| V | 50% |
| VI | 60% |
| VII | 70% |
| VIII | 80% |
| IX | 85% |
| X | 90% |

`100%` is reserved for Kō.

```text
Oshifted = Oactive * selectedShift
Ouniform = Oactive * (1 - selectedShift)
```

The uniform remainder covers the complete current coating boundary. The shifted amount is added across the selected focus at equal density.

### 10.3 Focus topology

- Exactly one focus region.
- The region contains one or more Body continuity identities and/or Shū-selected Item entry ids.
- The induced selection must be connected through authoritative body attachment and Shū contact edges.
- Every intermediary must be selected.
- `hand + arm` and `sword + hand + arm` are valid.
- `hand + foot`, `sword + boots`, and `boots + hand + arm` are invalid.
- All focus sites receive equal density. No independently weighted subregions; that belongs to Ryū.
- An Item is atomic. Selecting only its edge, point, or blade is illegal unless that component is independently modeled as an Item.

Use continuity identities for body targets and stable inventory entry ids for Items. Never bind a focus to transient BodyPart array positions or inventory indices.

### 10.4 Adjustment and endurance

One Gyō adjustment may atomically change active Output, shift fraction, and focus. Apply §7 once to the combined adjustment.

Gyō uses the Ren `output` clock and a Ken-derived `containment` clock:

```text
baseContainmentLoad = Oactive / Cken
shiftLoad           = selectedShift / maximumShiftForGyoRank
gyoContainmentLoad  = baseContainmentLoad * (1 + shiftLoad)
```

At the rank’s maximum shift, containment strain doubles. At half the maximum, it is `1.5x`. A zero shift is structurally allowed only if needed for an atomic transition/adjustment boundary; an active steady-state Gyō should require a positive shift or it is simply Ken.

### 10.5 Eye Gyō

Eye Gyō applies only while the active Gyō focus contains the authoritative eye region. Use the total Aura actually placed there after uniform and shifted placement, not a percentage of Output.

Let `Aeyes` be that amount. Invalid/negative/non-finite values are refused.

```text
if Aeyes < 1:
  auraBonus = 0
else if Aeyes >= 800_000_000:
  auraBonus = 10
else:
  auraBonus = min(9, max(1, ceil(log10(Aeyes))))

visualBonus = ceil(auraBonus / 2)
```

| Eye Aura | Aura Detection | Visual Detection |
|---:|---:|---:|
| `< 1` | +0 | +0 |
| `1–10` | +1 | +1 |
| `>10–100` | +2 | +1 |
| `>100–1,000` | +3 | +2 |
| `>1,000–10,000` | +4 | +2 |
| `>10,000–100,000` | +5 | +3 |
| `>100,000–1,000,000` | +6 | +3 |
| `>1,000,000–10,000,000` | +7 | +4 |
| `>10,000,000–100,000,000` | +8 | +4 |
| `>100,000,000–<800,000,000` | +9 | +5 |
| `>=800,000,000` | +10 | +5 |

For one concrete check, return exactly one contextual contribution:

- sight + Nen phenomenon: Aura Detection bonus;
- sight + non-Nen phenomenon: visual bonus;
- nonvisual route: none.

Do not emit two broad contributions that stack on visual Nen Detection. Eye Gyō uses the existing passive Detection, deliberate search, and Reaction Gate paths. It creates no third check and affects a Reaction Gate only if already active before preparation, unless a Skill explicitly bundles a valid pre-Gate transition.

## 11. Shū

### 11.1 Boundary-only rule

Shū extends the existing coating onto Items:

```text
Output after Shū = Output before Shū
```

Shū has no Output access, commitment, concentration, density selection, leakage, upkeep, duration, exertion clock, or independent recovery suppression. Ten/Ken/Gyō supplies the coating and owns its recovery/endurance.

Shū may remain active under Ten, Ken, or Gyō. It ends under Ren or Zetsu.

### 11.2 Mastery tables

| Shū mastery | Maximum selected Items | Enhancement efficiency |
|---:|---:|---:|
| I | 1 | 20% |
| II | 1 | 30% |
| III | 2 | 40% |
| IV | 2 | 50% |
| V | 3 | 60% |
| VI | 4 | 70% |
| VII | 5 | 80% |
| VIII | 7 | 90% |
| IX | 10 | 95% |
| X | all valid connected selected Items | 100% |

At X, `all` is still a finite, explicit selection of compatible Items currently used in the valid contact network. It never means inventory, incidental contact, terrain, or the environment.

### 11.3 Authored Item physics

Retain required binary `shuInteraction`. A compatible Item must additionally resolve:

- boundary mode: `overlay` or `extension`;
- conductivity `kappa > 0`;
- an authoritative surface measure:
  - extension: explicit positive surface area or deterministic authored geometry;
  - overlay: surface derived from the body continuity identities it authoritatively covers;
- stable measure provenance.

An incompatible Item must not accidentally supply active Shū physics. Missing/malformed physics on a compatible selected Item is a structural failure, never a default.

Provide deterministic geometry only for shapes whose dimensions determine surface area without assumptions, such as box, cylinder, sphere, plate, and explicit composite. Never infer geometry from Item name, mass, price, family, damage, or flavor.

### 11.4 Boundary modes

`overlay` Items—armor, boots, fitted gloves—replace the covered body surface. Only the outermost selected overlay owns a covered surface. Layers do not duplicate area.

`extension` Items—weapons, shields, staffs, brass knuckles—add exposed Item area:

```text
Acombined = AuncoveredBody + sum(Aoverlay) + sum(Aextension)
```

Because an overlay’s resolved area equals the body surface it replaces, it normally adds zero net area. Extensions dilute density. This is intentional: brass knuckles preserve more density than a sword, while the sword supplies reach and cutting geometry.

Do not add slots to equipment. The Shū activation request must carry authoritative, source-bound contact/coverage facts supplied by the host or existing action context. `held`/`worn` may establish general eligibility but cannot identify the contacted Body Part by itself.

### 11.5 Contact graph

A selected Item must contact the body or another selected coated Item. Every intermediary:

- is selected;
- counts against the mastery limit;
- is a concrete Item (`quantity === 1`);
- is compatible and measurable;
- has authoritative current contact;
- belongs to the same owner/network.

Momentary collision is not contact. Another living creature is not an Item. A finite tree may be an Item if authored with identity, measure, and conductivity; the ground is not one finite Item.

### 11.6 Conductivity and secondary decay

Use the following semantic bands without rounding an authored value into a band:

| Conductivity `kappa` | Band |
|---:|---|
| `0.01–0.05` | extremely poor |
| `>0.05–0.15` | poor |
| `>0.15–0.30` | ordinary |
| `>0.30–0.50` | good |
| `>0.50–0.70` | excellent |
| `>0.70–0.85` | exceptional |
| `>0.85–0.95` | near-perfect |
| `>0.95–<1.00` | approaching perfection |
| `1.00` | perfect conductor |
| `>1.00–1.10` | legendary amplifier |
| `>1.10–1.25` | great legendary amplifier |
| `>1.25–1.50` | apex amplifier |

Ordinary authored content is at most `1.00`. Values above `1.00` require explicit exceptional authorization; above `1.50` requires a world-level exceptional source rather than ordinary registration.

For Item `i`:

```text
Ti = 0.5^di * product(kappa_j for every Item j on the chosen path, including i)
```

`di` is the number of Item-to-Item edges after the body: body→Item has depth 0; body→A→B gives B depth 1. If several paths exist, use the strongest single simple path. Never add paths and never multiply around a loop.

Conductivity/transmission affects reinforcement expression, not Aura placement. A large poor conductor still adds its full extension area and dilutes the whole coating.

### 11.7 Placement and Gyō interaction

Use `gameplay/aura` to resolve one shared coating boundary at equal density. Extend that composition minimally where necessary to represent uncovered body sites, overlay Item sites, extension Item sites, and a mixed body/Item Gyō focus. Do not add equipment concepts to Foundation Aura.

The uniform remainder covers the whole current boundary. A Gyō shift may target one contiguous region containing Shū Items and body sites. The Item remains atomic. Conductivity changes its effective enhancement, not the Aura placed on it.

### 11.8 Enhancement

For Item `i`:

```text
Di = actual resolved surface Aura density on Item i
D0 = 1 Aura / m^2
eta = Shū mastery efficiency
Ti = resolved path transmission

Hi = eta * Ti * (Di / D0)
Fi = 1 + Hi
```

Do not round intermediate or final values.

Whole-Item application:

```text
enhanced physical quantity = base quantity * Fi
enhanced signed numeric Item Effect = base value * Fi
effective integrity stress = incoming stress / Fi
integrity mitigation = incoming stress - effective integrity stress
```

- Preserve signs; negative Item-owned numeric Effects become proportionally stronger.
- Enhance only Item-owned attack, defense, possessed, equipped, use, and integrity-band surfaces from the existing authoritative Item envelope.
- Never enhance Skill-, Technique-, Trait-, character-, or environment-owned contributions merely because an Item was involved.
- Nonnumeric fields and Effects remain unchanged unless they carry an explicitly scalable numeric magnitude.
- Geometry, mass, reach, range, targets, and dimensions do not change unless a separate authored rule says so.
- Do not apply the same Aura again as generic external-coating force. Shū Item enhancement is the one application.
- Compute integrity mitigation above Nen/equipment and pass the number into the existing equipment seam. Equipment must not import Nen.

### 11.9 Loss and recomputation

At the exact timestamp an Item is dropped, transferred, consumed, destroyed, disconnected, ceases being used, or loses a required upstream contact:

- remove it and every downstream Item that has no remaining valid path;
- recompute strongest paths, boundary area, density, transmission, enhancement, and Gyō focus;
- release no Aura from the reserve because placement is not expenditure;
- spend no Action;
- do not automatically add newly contacted Items.

A broken Item may remain if it retains identity/contact and its authored policy still permits the relevant use. A destroyed or consumed Item cannot.

If the remaining Gyō focus is nonempty and connected, it continues. If it becomes empty or disconnected, Gyō ends at that boundary.

## 12. Required implementation work

The executor must audit actual callers before changing names, then implement at least these responsibilities:

1. Rewrite Ken/Gyō/Shū progression rules and add Gyō/Shū DEX tables.
2. Add the explicit Gyō→Ken exceptional backfill rule and atomic settlement.
3. Add pure principle files and exports.
4. Correct Ren VIII–X endurance and move Ren to generic named clocks.
5. Generalize runtime exertion to multiple named clocks with exact expiry.
6. Add principle-specific activity definitions/adapters and runtime payload validation.
7. Add generic compatibility declarations sufficient for the matrix without runtime id switches.
8. Add principle transition Action-cost resolution and a `gameplay/nen` atomic Combat adapter, including source-bound bundle/waiver authorization.
9. Add Shū Item physics vocabulary, geometry/surface resolver, validation, conductivity, and exceptional authorization.
10. Compose body and Item coating boundaries through `gameplay/aura`; preserve one Output total and equal-density conservation.
11. Project Ken/Gyō coating per body part and Shū enhancement per Item without implementing final damage.
12. Add eye-Gyō concrete-check modifier projection into passive Detection, deliberate search, and Reaction Gate preparation.
13. Integrate runtime/time boundaries: expiry, shortfall, seals, suppression, replacement, Item loss, and exact recovery changes.
14. Export only intended public adapters from package boundaries. Keep pure principle files internal except through their owning adapters, following Ten/Ren/Hatsu precedent.
15. Add architecture guards preventing upward imports and principle-id branches.

Remove rejected old APIs rather than keeping compatibility aliases. Scene runtime state needs no permanent migration; if a changed public type has real external callers, update them atomically.

## 13. Concurrency and agent plan

Use one lead/coordinator and at most three implementation agents. Agents must use isolated worktrees/branches or return patches; they must not concurrently edit the same checkout.

### Wave 0 — lead only, sequential

1. Verify baseline and dirty tree.
2. Search every caller/export/test for progression rules, runtime duration/progress, Ren selection/endurance, differential allocation, `item-surface`, `shuInteraction`, Item envelopes, integrity mitigation, Detection modifiers, Reaction Gate preparation, and Combat Action spending.
3. Freeze exact shared contracts: named exertion clocks, opaque activity payload, Shū physics/contact shape, coating-boundary result, and Action authorization.
4. Write the interfaces first or provide them verbatim to agents. No agent invents a competing shape.

### Wave 1 — parallel, disjoint ownership

**Agent A: pure Nen mathematics**

- Own only new `foundation/nen/principles/{ken,gyo,shu}.ts`, the Ren table correction, and new pure-math tests.
- No shared index/export edits.

**Agent B: Item physics and enhancement**

- Own equipment Shū-physics types/validation/geometry/conductivity/envelope-scaling and focused tests.
- Must not import Nen or Aura and must not edit runtime or progression.

**Agent C: generic runtime clocks**

- Own generic named-clock types, validation, integration, expiry/adjustment behavior, Ren adapter migration to the agreed contract, and focused runtime/Ren tests.
- Must not implement Ken/Gyō/Shū policy or edit equipment.

The lead reviews each patch for contract compliance before integration. If isolated worktrees are unavailable, agents return analysis/test matrices only and the lead writes the code; never permit concurrent writes to shared files.

### Wave 2 — lead/integration writer, sequential

1. Integrate Wave 1 and run focused tests/typecheck.
2. Implement progression/backfill and character adapters.
3. Implement generic compatibility declarations and principle lifecycle.
4. Implement `gameplay/nen` coating, mixed boundary, Action, and sensory composition.
5. Integrate character-time exact boundaries and automatic recomputation.
6. Add end-to-end and architecture tests.

### Wave 3 — independent verification

An optional verification agent may inspect the final diff read-only, run the mutation list, and report survivors. The lead fixes survivors and alone owns the final commit. Do not split final integration among multiple writers.

## 14. Required tests

Add focused suites for pure Ken, Gyō, Shū, progression, runtime integration, Item integration, sensory integration, Action integration, and architecture. Test public routes, not only pure helpers.

At minimum cover:

### Progression

- all unlock-only relationships;
- stored mastery independence;
- seal propagation and exact restoration after seal removal;
- Ren seal does not disable Shū;
- standard Gyō unlock refusal without Ken;
- authorized Gyō grant atomically backfills Ken I only;
- every Gyō/Shū DEX threshold, including repeated values and advancement-only behavior.

### Runtime and Actions

- complete compatibility matrix in both activation orders;
- atomic replacement and Ten restoration at the same timestamp;
- no automatic resumption;
- I–VII one Action, VIII–X zero Actions;
- Turn and opened-Reaction legality;
- insufficient Actions leaves all states unchanged;
- bundled Skill activation pays once;
- a mere Skill prerequisite pays separately;
- source-bound Trait waiver;
- malformed/unproven exception refused;
- exact named-clock expiry, adjustment preservation, earliest-clock win, sliced/whole equality, and JSON round-trip equality.

### Ken

- all containment fractions and durations;
- Ren vs Ken limiting in both directions;
- full-funding start/increase and automatic later reduction;
- zero leakage at every rank;
- zero natural recovery, no upkeep/outward flow, and independent physical consumption;
- uniform body density and one-part attack/defense reading;
- Ken I equals Ten’s physical `10%P` coating result.

### Gyō

- all shift fractions, with X = 90 and no 100 route;
- one connected focus; valid and invalid body/Item chains;
- uniform remainder plus shifted focus conserves exactly `Oactive`;
- equal density inside focus;
- attack/defense read their actual parts;
- shift strain at zero, half, and full selected maximum;
- Item loss preserves or ends focus correctly.

### Eye Gyō

- boundary values immediately below/at/above 1, 10, 100, every decade, 100M, and 800M;
- `300 -> Aura +3, visual +2`;
- `720M -> Aura +9, visual +5`;
- `800M -> Aura +10, visual +5`;
- visual Nen check receives one Aura contribution, not Aura + visual;
- mundane sight receives visual only;
- nonvisual receives none;
- inactive/non-eye Gyō receives none;
- passive, active search, and Reaction Gate use the same projection;
- a late activation cannot retroactively alter a prepared Gate.

### Shū

- all count, efficiency, and DEX rows;
- X means all explicitly selected valid Items, not inventory/environment;
- overlay replaces area once; extension adds area; layering cannot duplicate it;
- small extension preserves more density than a large one;
- missing/guessed measure refused;
- concrete Item/contact/path validation;
- direct and secondary transmission, strongest-path choice, cycle safety;
- conductivity below/equal/above 1 and exceptional authorization;
- poor conductivity still dilutes by full area;
- enhancement formula and no rounding;
- positive/negative Item-owned numeric Effects scale; nonnumeric and non-Item contributions do not;
- integrity mitigation matches `incoming - incoming/F` and is applied once;
- loss/destruction/consumption/transfer/contact break recomputes exactly and never spends/refunds reserve Aura;
- Ten+Shū, Ken+Shū, Gyō+Shū work; Ren/Zetsu end Shū.

### Subdivision and conservation

For representative Ken, Gyō, and Shū scenarios, one whole advance must equal uneven slices in:

- Current Aura;
- allocations and density;
- activity condition/progress;
- stop timestamp/cause;
- Item factors and focus;
- emitted events.

## 15. Mandatory mutation checks

Apply each mutation separately, prove at least one relevant test fails, then revert it. Report the failing-test count. At minimum:

1. Restore Ken/Gyō/Shū mastery caps.
2. Let a Ren seal leave Ken/Gyō running.
3. Let a Ren seal disable Shū.
4. Remove Gyō→Ken grant backfill.
5. Let backfill grant Ten or Ren.
6. Change one Gyō or Shū DEX threshold.
7. Restore finite Ren VIII or IX endurance.
8. Give Ken Ren-style outward-flow expenditure.
9. Give Ken any leakage.
10. Use `max(Cken,Oren)` instead of `min`.
11. Reset clock progress on adjustment.
12. Expire only at caller interval end.
13. Let Ken and Gyō coexist.
14. Let Ren and Shū coexist.
15. Make Ken I physically stronger than equal-density Ten.
16. Change Gyō X from 90 to 100.
17. Accept disconnected focus.
18. Allow two independently weighted focus regions.
19. Remove Gyō shift strain multiplier.
20. Change an eye-Gyō decade boundary.
21. Let visual and Aura eye bonuses stack on one visual Nen check.
22. Give 720M the +10 tier or deny 800M the +10 tier.
23. Make Shū create/commit Output.
24. Count an overlay as added surface.
25. Infer a missing Item measure.
26. Remove the `0.5^depth` decay.
27. Sum multiple conductivity paths.
28. Let ordinary content author `kappa > 1` without exceptional authorization.
29. Apply conductivity to Aura density rather than Item expression.
30. Double-count Shū as enhancement plus external coating force.
31. Scale Skill/Trait contributions with the Item.
32. Fail to recompute after contact loss.
33. Charge an Action for forced recomputation.
34. Runtime branch on `"ken"`, `"gyo"`, or `"shu"`.
35. Foundation Aura/equipment/senses import a principle or `gameplay/nen`.

If a mutation survives because the branch is provably unreachable, document the proof and replace it with a reachable mutation testing the same invariant. Do not claim success merely because a broad suite failed to compile.

## 16. Verification gates

Run, in order:

1. focused new/affected suites;
2. engine typecheck: `npm run typecheck -w @nenworld/engine`;
3. full engine tests: `npm test -w @nenworld/engine`;
4. monorepo typecheck: `npm run typecheck --workspaces --if-present`;
5. `git diff --check`;
6. searches for skipped tests, `.only`, stale APIs, duplicate tables/formulas, forbidden imports, and principle-id branches.

The engine typecheck must remain clean. The monorepo may retain only the exact pre-existing Workbench error set; compare codes/files rather than only the number.

## 17. Acceptance criteria

KGS-1 is complete only when:

- progression, backfill, seals, compatibility, and Action rules match this ticket;
- Ren VIII–X are physiologically unlimited;
- Ken/Gyō use independent Ren-output and containment clocks;
- Ken is fully contained with zero leakage and no outward-flow expense;
- Gyō produces one contiguous differential focus capped at 90%;
- eye Gyō uses the exact decade formula and check routing;
- Shū changes the coating boundary without changing total Output;
- overlays/extensions, contact, conductivity, enhancement, and loss behavior are deterministic and validated;
- Item enhancement is applied once and equipment remains Aura/Nen-agnostic;
- all exact-time results are subdivision-invariant;
- architecture guards enforce the declared boundaries;
- all required mutations are caught and reverted;
- full tests/typechecks meet the baseline comparison rules;
- the working tree contains no accidental files or unrelated edits.

## 18. Required completion report

Return:

1. commit hash, branch, working-tree status, and push status;
2. verified before/after test and typecheck baselines;
3. concise description of Ken, Gyō, and Shū behavior now shipped;
4. files changed, grouped by production/tests/docs;
5. every intentional deviation and why it was necessary;
6. every bug found and whether fixed or deferred;
7. the mutation table with failing-test counts;
8. remaining risks or genuinely blocked design inputs;
9. confirmation that unrelated dirty/untracked files were preserved.

Do not call the work complete while required mutations survive, architecture boundaries are violated, or a deviation silently changes a settled formula.
