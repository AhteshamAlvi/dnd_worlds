# Ten and Ren Redesign — AI Execution Plan

**Ticket ID:** TRR-1  
**Starting point:** `main` at `05aabf753a1ba70fd2b3670480af8ef1c356c277`  
**Primary package:** `packages/engine`  
**Execution mode:** one integrated implementation ticket, one final writer

## 1. Objective

Replace the current coupled Ten/Ren model with two independent, mutually exclusive principles:

- **Ten** is the passive defensive state that contains Aura around the entire body. Its intended whole-body surface coating is always 10% of Physiological Output, regardless of mastery. Ten mastery improves containment by reducing involuntary leakage from `2R/hour` at Mastery I to `0` at Mastery X.
- **Ren** is the active offensive alternative to Ten. It opens a chosen amount of the character's Ren-accessible Output and emits that Aura uniformly outward across the body. It has no stable defensive coating. It continuously expends Aura at the selected Output rate, supplies raw Aura to the one body part actually making an attack, and uses the existing mastery-dependent Output and endurance progression.

Ten and Ren must never operate simultaneously. Activating Ren atomically suspends automatic Ten; ending Ren restores automatic Ten at the exact transition timestamp if Ten is still legal. Neither principle depends on the other's mastery or calculation.

Implement these rules through the existing generic Aura access, time, allocation, and maintained-activity boundaries. Do not add principle-name branching to Aura or the generic Nen runtime.

## 2. Verified starting point

ARC-1 is complete at the starting commit. The executing agent must verify this baseline before editing rather than assuming file names or public surfaces are unchanged.

Known starting behavior and architecture:

- The full engine baseline is 126 test files / 5,116 passing tests.
- The engine TypeScript check is clean.
- The monorepo typecheck has 65 unrelated Workbench errors. Capture the actual baseline before editing and compare it after implementation.
- `R` is the single revised Regeneration unit: half the existing rounded VIT-derived capacity.
- The character-time solver already integrates recovery, leakage, physical consumption, active-Nen recovery suppression, Aura depletion, collapse, sleep completion, and runtime changes over exact intervals.
- Active Nen makes gross recovery zero. Physical activity independently consumes `2R/hour`.
- Fully open, uncontrolled Aura currently leaks at `O/minute`, or `60O/hour`.
- Half-open pores leak `2R/hour` but do not trigger the special uncontained-collapse path.
- Eight continuous hours of qualifying sleep top Current Aura off once.
- Fatigue already derives indirectly from Aura depletion. Stamina no longer prices per-action physical Aura expenditure.
- `additionalPhysicalAuraCostRate` remains an optional, explicitly authored skill surcharge and is unrelated to this ticket.
- `foundation/nen/principles/ten.ts` currently derives Ten's coating from Ren-accessible Output, Ten mastery, and a 5% Physiological Output floor.
- `foundation/nen/principles/ren.ts` already owns Ren Mastery I–X Output ceilings, CON gates, and full-output endurance durations, but also contains obsolete Ten-containment, waste, and diminishing-return calculations.
- `character/nen/access.ts` is the existing one-way adapter through which passive principle rules reach generic Aura access.
- `foundation/aura/access.ts` and the Aura budget currently represent Ten as a contained coating/allocation. Their output-access override preserves Ten coating, which is incorrect for active Ren.
- `foundation/aura/time.ts` currently recognizes half-open and uncontained leakage, while contained access has zero leakage. It needs a generic, projected contained-leakage value rather than knowledge of Ten.
- `foundation/nen/runtime` provides a generic, definition-opaque `NenActivityRuntime` with requested Aura, committed funding, upkeep, duration, condition, timestamps, and stop reasons. Runtime code must remain unaware of principle ids.
- Active activities live beside Character state in the time/scene integration rather than inside `Character` or `NenState`.

Before editing, search all callers, exports, fixtures, tests, documentation comments, and architecture guards for:

```text
resolveTen
tenContainment
containmentFraction
minimumCoating
renAccessFraction
renAccessibleOutput
resolveRen
resolveRenContainmentEfficiency
deriveRenContainmentAuraLoss
output-access
uncontained
upkeepPerRound
durationSeconds
NenActivityProgress
activeNenUse
```

Classify every result before deleting or changing a symbol. Remove stale APIs instead of retaining compatibility aliases for the rejected model.

## 3. Non-negotiable rules

### 3.1 Core quantities

Use these symbols throughout implementation, tests, traces, and comments:

- `P` — Physiological Output Limit.
- `R` — revised VIT-derived Aura Regeneration unit per hour.
- `m` — effective Ten mastery rank, an integer from 1 through 10.
- `fRen` — Ren mastery Output fraction, from 0.10 through 1.00.
- `Olimit` — maximum Output available to the character's current Ren mastery: `P × fRen`.
- `Oactive` — Output deliberately selected for the current Ren activity, where `0 < Oactive <= Olimit`.

All numeric inputs must be finite and non-negative where zero is legal. Reject malformed ranks, non-finite values, invalid timestamps, illegal selections, and contradictory activity/access combinations before mutating state.

### 3.2 Ten and Ren incompatibility

Ten and Ren are mutually exclusive operating states, not stacked modifiers.

- Ten is automatic passive derived state once learned and legal.
- Starting Ren at timestamp `t` atomically replaces Ten at `t`.
- There must be no interval in which both contribute coating/access/leakage and no artificial transition interval in which neither applies.
- Ending Ren at timestamp `t` restores Ten at `t` if the character is awakened, has effective Ten Mastery I or higher, is not suppressed/sealed, and has no other state that legally prevents Ten.
- Suppression stops both Ren and Ten according to the existing suppression lifecycle.
- An invalid or unaffordable Ren activation must leave Ten, allocations, Current Aura, runtime, and time state unchanged.
- Do not add activation-speed, reaction-time, or transition-roll mechanics.

### 3.3 Principle-neutral architecture

- Aura may consume generic facts such as access class, intended coating, contained leakage rate, active outward-flow rate, deliberate Output access, and active-Nen use.
- Aura must not import `ten.ts`, `ren.ts`, or any other principle file.
- Generic Nen runtime code must not compare `definitionId` to a Ten/Ren string, import a Ten/Ren module, or switch on a specific principle.
- Principle-specific adapters may translate Ten and Ren rules into generic Aura/runtime vocabulary.
- There must be exactly one producer for Ten's mastery leakage formula and exactly one producer for Ren's mastery Output/endurance tables.

## 4. Ten specification

### 4.1 Semantic role

Ten contains Aura around the whole exterior of the body. It is passive, automatic, defensive, uniform, surface-only, and free to maintain.

Ten does not:

- increase accessible Output;
- depend on Ren mastery or Ren availability;
- use an active-Nen runtime entry;
- set the active-Nen-use recovery flag;
- have an activation cost, upkeep cost, or duration;
- concentrate on selected body parts;
- reinforce the inside of the body;
- directly add Fatigue or consume Stamina;
- gain density, pressure, or coating strength from mastery.

### 4.2 Fixed coating

At every usable Ten rank, the intended coating is:

```text
intendedTenCoating = P × 0.10
```

Remove the existing 5% minimum floor. Remove Ten mastery and Ren access from coating arithmetic. Mastery I and Mastery X have the same intended coating.

The existing generic allocation/budget layer may still cap the resolved usable coating when the character lacks fundable Aura/Output, but it must not reinterpret the intended formula or deduct Current Aura merely for holding the allocation. At zero usable Aura, the actual funded coating can fall to zero without changing the 10% intended rule.

Ten remains distributed evenly over the eligible whole-body exterior using the canonical body-surface owner. Do not move body measurements, surface partitioning, density, damage, or defense arithmetic into `ten.ts`.

### 4.3 Mastery progression: residual involuntary leakage

Ten mastery controls only how completely the character contains Aura. The exact hourly leakage rate is:

```text
tenLeakagePerHour(m) = 2R × (10 - m) / 9
```

The engine must calculate the formula from the exact mastery rank and exact `R`. The following decimals are display values only and must not be used as rounded calculation constants.

| Ten mastery | Exact leakage | Display coefficient |
|---:|---:|---:|
| I | `2R × 9/9` | `2.00R/hour` |
| II | `2R × 8/9` | `1.78R/hour` |
| III | `2R × 7/9` | `1.56R/hour` |
| IV | `2R × 6/9` | `1.33R/hour` |
| V | `2R × 5/9` | `1.11R/hour` |
| VI | `2R × 4/9` | `0.89R/hour` |
| VII | `2R × 3/9` | `0.67R/hour` |
| VIII | `2R × 2/9` | `0.44R/hour` |
| IX | `2R × 1/9` | `0.22R/hour` |
| X | `0` | `0R/hour` |

Learning Ten at Mastery I changes the awakened character from uncontrolled `60P/hour` open-pore leakage to the ordinary `2R/hour` baseline. Increasing mastery then reduces the residual leak linearly until Mastery X contains it completely.

Retain the existing Ten mastery gates unless repository inspection proves the current source of truth differs:

| Mastery | Minimum DEX |
|---:|---:|
| I | 12 |
| II | 12 |
| III | 13 |
| IV | 13 |
| V | 14 |
| VI | 14 |
| VII | 15 |
| VIII | 15 |
| IX | 16 |
| X | 16 |

### 4.4 Ten recovery and expenditure matrix

Ten still uses the **contained** gross-recovery column. Residual Ten leakage is then subtracted as its own contribution. Physical consumption remains independent.

Let `Lm = tenLeakagePerHour(m)`:

| Activity while Ten is operating | Gross recovery | Ten leakage | Physical consumption | Net per hour |
|---|---:|---:|---:|---:|
| Ordinary activity | `2R` | `Lm` | `0` | `2R - Lm` |
| Physical activity | `R` | `Lm` | `2R` | `-R - Lm` |
| Intentional rest | `3R` | `Lm` | `0` | `3R - Lm` |
| Sleep | `4R` | `Lm` | `0` | `4R - Lm` |

Important anchors:

| State | Ordinary | Physical | Rest | Sleep |
|---|---:|---:|---:|---:|
| Ten I | `0` | `-3R` | `+R` | `+2R` |
| Ten X | `+2R` | `-R` | `+3R` | `+4R` |

The eight-hour qualifying-sleep top-off remains unchanged and happens after continuous rate settlement at the crossing boundary.

### 4.5 Ten depletion behavior

Residual Ten leakage is contained leakage, not fully open uncontrolled leakage. If it empties Current Aura:

- clamp Current Aura to zero through the existing solver;
- report used and unmet/discarded contributions consistently;
- reduce usable Output/coating funding to zero through existing budget rules;
- allow existing Aura-depletion Fatigue to reach its normal maximum contribution;
- do **not** emit the special uncontained-collapse request;
- do **not** force suppression, blackout, or mandatory sleep merely because Ten leakage reached zero.

This behavior must be subdivision-invariant.

### 4.6 Ten interaction with Stamina and Fatigue

Do not add a Stamina cost or Stamina-derived Ten multiplier. Ten affects Fatigue only indirectly by changing Current Aura over time, after which the existing Aura-depletion Fatigue thresholds apply. Preserve the current fatigue thresholds and recomputation path.

## 5. Ren specification

### 5.1 Semantic role

Ren is a deliberate active release of Aura and the basic offensive alternative to Ten. It raises usable Output up to the character's Ren mastery ceiling and emits the selected Output uniformly outward across the whole body.

Raw Ren:

- is active Nen and therefore sets gross natural recovery to zero;
- suspends Ten for its entire active interval;
- provides no stable defensive coating or Ten allocation;
- is exterior/outward flow, not internal reinforcement;
- does not concentrate Aura on a chosen part;
- does not coat held objects by default;
- does not depend on Ten mastery or containment efficiency;
- has no Ten-derived waste or diminishing-return calculation.

Specific authored skills remain free to define their own explicit effects. Such effects must not silently change the default raw Ren resolver for all attacks.

### 5.2 Mastery Output ceiling

Preserve Ren's existing mastery progression:

| Ren mastery | Output ceiling | Minimum CON |
|---:|---:|---:|
| I | `10% of P` | 12 |
| II | `20% of P` | 12 |
| III | `30% of P` | 13 |
| IV | `40% of P` | 13 |
| V | `50% of P` | 14 |
| VI | `60% of P` | 14 |
| VII | `70% of P` | 15 |
| VIII | `80% of P` | 15 |
| IX | `90% of P` | 16 |
| X | `100% of P` | 16 |

```text
Olimit = P × renMasteryFraction
```

Activation must select a finite value satisfying:

```text
0 < Oactive <= Olimit
```

The character may deliberately use less than the mastery maximum. Ren must be fully funded at the selected value; do not silently downgrade an activation to a smaller Output.

### 5.3 Raw offensive contribution

While Ren is active, a body attack may use the Aura flowing from the **single body part that actually makes contact or carries the attack**.

```text
localRenAttackOutput
  = Oactive
  × attackingPartSurfaceArea / eligibleWholeBodySurfaceArea
```

Rules:

- The input must identify exactly one eligible surface-bearing attacking Body Part.
- A punch uses the declared striking hand; it does not automatically include hand, forearm, upper arm, shoulder, or torso.
- A kick uses the declared striking foot; it does not automatically include the rest of the leg or pelvis.
- There is no recruitment chain, ancestor chain, continuity chain, or adjacent-part aggregation for raw Ren.
- Existing internal/physical-force systems may use their own chain rules independently. They must not leak into this calculation.
- If a strike is described by a joint or contact feature that has no canonical surface measurement, the caller must resolve it to the actual canonical surface-bearing contact part before invoking the raw Ren projection. Do not invent joint surface area inside Ren.
- Raw Ren does not transfer to a weapon, projectile, or other object by default.
- A specific skill may own an explicit special carrier, multi-part, object, concentration, or conversion effect. That skill's effect is separate from and must not mutate the default raw Ren rule.

The ticket does not require inventing a new damage formula. It does require a pure, typed Ren attack-output projection that consumes canonical body-surface measurements and is exportable to the combat/action layer. If a real compatible consumer already exists, integrate it. Otherwise, test and expose the projection without fabricating an unrelated combat subsystem.

### 5.4 Continuous Aura expenditure

Ren expends Aura at the chosen active Output rate for the entire active interval, whether or not the character attacks:

```text
renExpenditurePerMinute = Oactive
renExpenditurePerHour   = 60 × Oactive
renExpenditurePerRound  = Oactive / 30
```

The Round conversion assumes the canonical two-second Round and must import that duration rather than restating a magic constant if the engine already owns it.

Ren's outward flow **replaces** ordinary fully open uncontrolled leakage for that interval. It does not stack `60P/hour` on top of `60Oactive/hour`.

Because Ren is active Nen, gross recovery is zero:

| Ren activity | Gross recovery | Ren expenditure | Physical consumption | Net per hour before other costs |
|---|---:|---:|---:|---:|
| Stationary/nonphysical | `0` | `60Oactive` | `0` | `-60Oactive` |
| Physical | `0` | `60Oactive` | `2R` | `-60Oactive - 2R` |

Explicit skill costs, hostile drains, and the optional authored additional physical Aura surcharge remain independent and add afterward. Do not charge both a generic Ren upkeep event and a second Aura-time Ren flow for the same interval.

### 5.5 Endurance progression

Preserve the existing full-output duration table:

| Ren mastery | Full-output duration |
|---:|---:|
| I | 1 minute |
| II | 2 minutes |
| III | 5 minutes |
| IV | 10 minutes |
| V | 20 minutes |
| VI | 30 minutes |
| VII | 60 minutes |
| VIII | 120 minutes |
| IX | 240 minutes |
| X | Physiologically unlimited |

For Mastery I–IX, lower selected Output extends maximum duration inversely:

```text
renLoad = Oactive / Olimit
maxDuration = fullOutputDuration / renLoad
```

Equivalently, track full-output-equivalent exertion:

```text
renExertion = integral((Oactive / Olimit) dt)
```

The activity expires when accumulated Ren exertion reaches the mastery full-output duration. This integral is authoritative when Output changes during an activity.

Mastery X has no physiological duration ceiling, but Aura expenditure remains finite and can still end Ren when Current Aura can no longer fund the selected flow.

### 5.6 Ren lifecycle and stopping boundaries

Ren ends at the earliest exact timestamp of:

- its mastery-derived exertion limit;
- Aura becoming unable to fund the selected Output flow;
- voluntary cancellation;
- replacement by another legal state/activity;
- suppression;
- sealing, loss of access, or another existing generic invalidation.

At the stop timestamp:

- release committed Output and stop Ren expenditure;
- emit the normal typed runtime transition/stop reason;
- stop counting active-Nen use from that instant;
- restore automatic Ten from that instant if it is legal;
- apply the correct post-Ren access, recovery, and leakage rules for the remainder of the containing time advance.

Exact exhaustion and duration boundaries must work inside a larger time advance. The caller must not need to rerun the remaining interval manually.

### 5.7 Ren Output adjustment

Changing selected Output while Ren is already active is an adjustment transition, not a stop-and-restart loophole.

- Validate the new selection against the current mastery ceiling and available funding before mutation.
- Resolve the old rate through the adjustment timestamp.
- Preserve accumulated full-output-equivalent exertion.
- Change committed Output, outward-flow expenditure, access fraction, and remaining-duration slope at the same timestamp.
- Do not restore Ten between the old and new Ren values.
- Do not reset `startedAt`, activity identity, or endurance.
- Refusal leaves the prior active Ren and all state untouched.

## 6. Runtime and projection design

### 6.1 Reuse the generic maintained-activity runtime

Do not add active Ren fields to `Character`, `NenState`, or Ten's passive projection. Represent Ren with the existing `NenActivityRuntime` and its generic funding/lifecycle vocabulary.

The Ren-specific activation resolver should accept at least:

```ts
interface StartRenInput {
  readonly selectedOutput: number;
  readonly at: GameTimestamp;
}
```

After validation it should derive a generic activity configuration equivalent to:

```text
requested.aura       = Oactive
funding.committed    = Oactive
funding.status       = fully funded
funding.unmet        = 0
funding.allocationIds = []
upkeepPerRound       = Oactive / 30   // equivalent metadata if retained
durationSeconds      = derived full-output-equivalent duration, except at Mastery X
```

Raw Ren outward flow is not a standing defensive coating or stored body allocation, so it must not create a Ten-like whole-body allocation id merely to satisfy bookkeeping.

If `upkeepPerRound` is retained on the generic activity, it is an equivalent representation of the continuous flow, not an additional charge. Choose one settlement authority and prove by tests that Ren is charged exactly once.

### 6.2 Persist exertion across adjustments

The current runtime must be extended or composed with a generic progress value capable of preserving accumulated load across rate changes. Prefer a generic shape usable by any adjustable maintained activity, for example:

```ts
interface NenActivityProgress {
  readonly exertionSeconds: number;
  readonly resolvedAt: GameTimestamp;
}
```

`exertionSeconds` means full-output-equivalent seconds, not wall-clock duration. Naming may differ if the repository already has a more accurate generic vocabulary, but the semantics and validation must be explicit.

Absent legacy progress should normalize safely for a newly started activity. Reject negative, non-finite, future-dated, or internally contradictory progress before mutation. Preserve immutability on success and refusal.

### 6.3 Generic Aura projection

Create or extend a principle-specific character/Nen adapter that projects an active Ren activity into generic facts. The generic Aura/time layers may receive values equivalent to:

- deliberate accessible Output = `Oactive`;
- access fraction = `Oactive / P`;
- open outward-flow rate = `Oactive/minute`;
- active Nen use = true;
- passive Ten projection = suppressed for the interval;
- stable coating allocation = none.

Do not infer Ren by matching an opaque activity `definitionId` inside generic runtime or Aura code. Resolve the activity's typed definition/contribution at the principle integration boundary, then pass the generic contribution downstream.

The existing uncontained access path must be generalized enough that the outward flow can use selected accessible Output rather than automatically using full Physiological Output. It must also distinguish:

- uncontrolled open pores with no containment: `P/minute`, eligible for special collapse;
- deliberate Ren outward flow: `Oactive/minute`, ordinary active-Nen exhaustion/stop behavior;
- Ten containment: mastery-derived `Lm/hour`, no special collapse.

### 6.4 Exact interval coordination

The character-time coordinator must consider Ren's next duration, adjustment, cancellation, invalidation, and Aura-affordability boundary alongside existing Aura, sleep, collapse, upkeep, and scheduled-event boundaries.

Required ordering at a shared timestamp:

1. Settle all rates up to but not beyond the boundary.
2. Apply the cause that ends or adjusts Ren once.
3. Release/update funding and runtime state.
4. Reproject access/Ten state.
5. Resolve the remainder under the new rates.

Use existing deterministic event ordering. Add an explicit tie-break only if repository inspection shows it is missing. One long advance and any equivalent subdivision must produce the same Current Aura, exertion progress, runtime state, access, Ten coating/leakage, fatigue, and equivalent absolute-timestamp events.

## 7. Removal of obsolete behavior

Remove, rename, or rewrite every live path and public claim that encodes any of the following:

- Ten coating scales with Ten mastery.
- Ten coating depends on Ren mastery, Ren access, or Ren output.
- Ten has a 5% Physiological Output minimum floor.
- Functioning Ten always has zero leakage at all ranks.
- An output-access override keeps Ten coating active.
- Ren and Ten operate concurrently.
- Ren efficiency is limited by Ten containment.
- Ren loses Aura through Ten-derived containment waste.
- Ren has diminishing returns based on Ten.
- Ren automatically contributes a whole limb/body-part chain to an attack.
- Raw Ren coats a weapon or object.
- Ren flow stacks with full `P/minute` uncontrolled leakage.
- Adjusting Ren Output restarts its endurance clock.

Expected stale APIs include `resolveRenContainmentEfficiency`, `deriveRenContainmentAuraLoss`, Ten inputs named `renAccessFraction`/`renAccessibleOutput`, and any Ten result whose mastery fraction means coating strength. Confirm actual call sites before removal.

## 8. Scope boundaries

This ticket includes only:

- Ten's fixed coating, mastery leakage progression, passive access behavior, depletion behavior, and related recovery integration;
- Ren's Output selection, maintained activity, continuous expenditure, endurance, adjustment, lifecycle, and raw one-part offensive projection;
- shared generic changes strictly required to support those behaviors;
- exports, tests, architecture guards, comments, and traces affected by the redesign.

Do not implement or redesign:

- unrelated principles or their activation/combat behavior;
- a new damage, defense, armor, weapon-coating, projectile, or internal-reinforcement system;
- Maximum Aura, Physiological Output, Control, the VIT curve, or `R`;
- Stamina formulas or Fatigue thresholds;
- the ARC-1 recovery matrix outside the Ten/active-Ren changes specified here;
- sleep-completion semantics;
- the optional authored skill physical surcharge;
- Workbench UI controls, unless a compile break is directly caused by a changed public engine API and the smallest caller migration is required.

Do not add speculative hooks for excluded systems. Preserve generic extension points already present.

## 9. Execution strategy

Use one final writer because the principle contracts, access projection, runtime progress, and time solver overlap. Parallel read-only audits are safe, but do not let multiple writers independently edit the central access/time/runtime types.

### Wave 0 — Baseline and dependency map

1. Confirm branch, starting commit, and clean working tree.
2. Record focused/full engine tests, engine typecheck, and monorepo typecheck.
3. Search all symbols listed in Section 2 plus all current Ten/Ren exports.
4. Diagram the live flow from mastery → principle projection → access/budget → character-time → Aura settlement → runtime stop/reprojection.
5. Identify the canonical body-surface measurement API and an existing attack/body-part identity type before designing the raw Ren projection.
6. Identify whether `upkeepPerRound` is currently discrete or continuously integrated and select one authoritative Ren settlement path.

### Wave 1 — Pure principle contracts

Primary files are expected to include:

- `packages/engine/src/character/foundation/nen/principles/ten.ts`
- `packages/engine/src/character/foundation/nen/principles/ren.ts`
- their barrel exports and focused tests

Tasks:

1. Rewrite Ten's pure result around fixed `0.10P` intended coating and exact residual-leakage formula.
2. Preserve Ten gates and passive semantics; delete Ren inputs and the 5% floor.
3. Preserve Ren mastery Output ceilings, gates, and full-output durations.
4. Remove all Ten-containment/waste/diminishing-return calculations from Ren.
5. Add pure Ren selection, load, accumulated-exertion, remaining-duration, and rate conversions.
6. Add the pure single-part raw attack-output projection using canonical body-surface data.
7. Validate all hostile numeric and mastery inputs before returning a successful result.

### Wave 2 — Generic access and allocation projection

Expected files include:

- `packages/engine/src/character/nen/access.ts`
- `packages/engine/src/character/foundation/aura/access.ts`
- `packages/engine/src/character/foundation/aura/types.ts`
- `packages/engine/src/character/foundation/aura/passive.ts`
- Aura budget/distribution files discovered during the audit

Tasks:

1. Change the passive Ten adapter to supply fixed intended coating plus generic contained-leakage rate.
2. Generalize Aura access/balance vocabulary to consume contained leakage without naming Ten.
3. Ensure Ten allocation remains whole-body, surface-only, free, and independent of Ren.
4. Ensure an active Ren contribution removes/suspends Ten projection instead of preserving its coating.
5. Represent deliberate Ren outward flow generically at selected Output.
6. Keep uncontrolled full-open access at `P/minute` and distinct from deliberate Ren flow.
7. Update traces/provenance so tests can distinguish uncontrolled leakage, Ten residual leakage, and Ren expenditure.

### Wave 3 — Ren maintained activity and progress

Expected files include:

- `packages/engine/src/character/foundation/nen/runtime/types.ts`
- runtime transition/state/resolution files discovered during the audit
- a Ren-specific character/Nen activation adapter or resolver
- `packages/engine/src/character/time/types.ts`

Tasks:

1. Add start, adjust, cancel, and invalidation transitions through the generic runtime.
2. Add validated persistent full-output-equivalent progress.
3. Require complete Output funding and refuse partial activation/adjustment.
4. Keep raw Ren allocation-free while exposing committed Output.
5. Derive exact next physiological-expiry timestamp from remaining exertion and current load.
6. Keep Mastery X duration unlimited but otherwise subject to funding/exhaustion.
7. Preserve activity identity and progress across adjustments.
8. Ensure generic runtime remains definition-opaque.

### Wave 4 — Aura-time and coordinator integration

Expected files include:

- `packages/engine/src/character/foundation/aura/leakage.ts`
- `packages/engine/src/character/foundation/aura/time.ts`
- `packages/engine/src/character/foundation/aura/timeline.ts`
- `packages/engine/src/character/foundation/aura/transitions.ts`
- `packages/engine/src/character/time/advance.ts`
- projection/resolution files discovered during the audit

Tasks:

1. Subtract generic contained leakage in every Ten activity row.
2. Ensure Ten depletion never invokes uncontained collapse.
3. Integrate Ren flow continuously at `Oactive/minute`, with zero natural recovery.
4. Compose physical consumption and explicit costs independently.
5. Prevent double charging from runtime upkeep and Aura-time flow.
6. Split intervals at Ren duration, affordability, adjustment, cancellation, suppression, and invalidation boundaries.
7. Restore Ten and recompute rates at the exact Ren stop boundary.
8. Preserve sleep, collapse, fatigue, allocation, and event-order invariants.

### Wave 5 — Public surface, tests, and cleanup

1. Migrate all callers to the new Ten and Ren contracts.
2. Remove stale exports and compatibility aliases.
3. Add architecture guards for dependency direction and principle-id opacity.
4. Update comments and decision references only after behavior is correct.
5. Search again for every rejected formula and claim in Section 7.
6. Inspect the final diff for accidental Workbench or unrelated changes.

## 10. Required tests

### 10.1 Ten pure behavior

- Every effective Ten rank resolves intended coating to exactly `0.10P`.
- Representative `P` values, including fractional legal values, preserve the formula without a 5% floor.
- Ten coating is identical with Ren unlearned, low mastery, high mastery, inactive, or absent from the input because Ren is no longer an input.
- Mastery I leakage is exactly `2R`; Mastery X is exactly zero.
- Intermediate ranks use exact rational coefficients. For example, Mastery II is `16R/9`, not a stored `1.78R`, and Mastery IX is `2R/9`, not a stored `0.22R`.
- Invalid rank, `R`, or `P` refuses before mutation/allocation.
- Existing whole-body surface partition totals equal the resolved Ten coating within the engine's established numeric tolerance.

### 10.2 Ten time integration

- Table-drive all four activity rows at Mastery I, representative intermediate ranks, and Mastery X through the real `advanceAuraTime` and character-time paths.
- Assert recovery, contained leakage, physical consumption, explicit costs, net-before-clamp, used/discarded/unmet values, Current Aura, and provenance separately.
- At Ten I, assert nets `0`, `-3R`, `+R`, and `+2R` for ordinary, physical, rest, and sleep.
- At Ten X, assert nets `+2R`, `-R`, `+3R`, and `+4R`.
- Verify the eight-hour sleep completion behavior remains unchanged at every Ten rank.
- Verify reaching zero through Ten leakage produces no uncontained-collapse request, forced suppression, or blackout.
- Verify output/coating funding and Aura-depletion Fatigue recompute normally at zero.
- Verify one long interval equals equivalent subdivisions, including an exact zero boundary and sleep completion.

### 10.3 Mutual exclusion and transitions

- Learned legal Ten is automatically present without a runtime activity.
- Starting Ren while Ten is present removes Ten coating/leakage and starts Ren at the same timestamp.
- No trace segment or allocation snapshot contains both Ten coating and Ren outward flow.
- Cancelling or expiring Ren restores Ten at the exact timestamp when legal.
- Suppression prevents Ten restoration until suppression ends.
- Invalid/underfunded Ren activation leaves Ten and every state object unchanged.
- Adjusting Ren never creates a transient Ten segment and never resets runtime identity or exertion.

### 10.4 Ren Output, cost, and recovery

- Every Ren rank resolves the exact 10%–100% mastery ceiling and retains its existing CON gate.
- Activation accepts a valid submaximum selection and the exact maximum; it rejects zero, negative, non-finite, and above-ceiling selections.
- Full funding is required. A partially fundable request refuses rather than silently reducing `Oactive`.
- At `Oactive = 6`, assert exactly 6 Aura/minute, 360 Aura/hour, and 0.2 Aura per canonical two-second Round.
- Stationary Ren has zero gross recovery and net `-60Oactive/hour` before other costs.
- Physical Ren also reports independent `2R/hour` physical consumption and nets `-60Oactive - 2R`.
- Ren never adds uncontrolled `60P/hour` leakage on top of its own flow.
- Explicit skill cost and `additionalPhysicalAuraCostRate` remain additive and separately reported.
- Ten coating has no funding/allocation while Ren is active.

### 10.5 Ren endurance and adjustment

- Pin the entire full-output duration table.
- At 50% load, Mastery I–IX last exactly twice their full-output duration if Aura remains available.
- At 25% load, they last four times the full-output duration.
- Equivalent piecewise schedules consume equal full-output-equivalent exertion regardless of subdivision.
- Increasing or decreasing Output mid-activity changes the remaining wall-clock duration without resetting accumulated exertion.
- Mastery X has no physiological expiry event but still stops at Aura exhaustion.
- An exact duration boundary inside a larger advance stops once and applies post-Ren rates for the remainder.
- An exact affordability boundary stops once without driving Current Aura negative.
- Equal-timestamp duration and affordability boundaries produce one deterministic stop and no duplicate refund/release/event.

### 10.6 Raw Ren attack projection

- Whole-body part surface shares sum according to the canonical body-surface owner.
- A declared hand strike uses only that hand's surface share.
- A declared foot strike uses only that foot's surface share.
- Mutating the resolver to include a parent, ancestor, adjacent part, or continuity chain causes tests to fail.
- Left/right identity is preserved; selecting one side never includes its counterpart.
- Missing, ineligible, non-surface, duplicated, or contradictory attacking-part input refuses.
- Raw Ren produces no weapon/object allocation or contribution.
- The projection returns zero/unavailable when Ren is inactive or has stopped.
- Specific skill effects remain able to use their own explicit effect path without changing the raw resolver globally.

### 10.7 Runtime, validation, and architecture

- Projection and committed advancement at the same timestamp produce equivalent access, runtime progress, Current Aura, and events.
- Input Character, Aura, runtime, activity, progress, and allocation objects remain immutable on success and refusal.
- Malformed progress, timestamps, funding, access, activity, and body-surface inputs fail before state changes.
- Aura production files do not import Ten or Ren files.
- Generic runtime files do not import Ten or Ren files and do not branch on their ids.
- Only approved character/Nen adapters import principle files.
- There is no second `0.10P` Ten coating formula, Ten leakage formula, Ren mastery table, or Ren endurance table.
- No production caller references removed Ten/Ren coupling APIs.

## 11. Required mutation checks

Manually introduce each mutation after the ordinary tests pass, confirm at least one intended test fails for the correct reason, then revert it:

1. Restore Ten's 5% floor.
2. Multiply Ten coating by mastery.
3. Multiply Ten coating by Ren access.
4. Change Ten I leakage from `2R` to `R`.
5. Change Ten X leakage from `0` to a positive value.
6. Replace an intermediate exact Ten fraction with its rounded display decimal.
7. Route Ten depletion into uncontained collapse.
8. Let Ren preserve Ten coating.
9. Stack `60P` uncontrolled leakage with Ren expenditure.
10. Allow natural recovery during Ren.
11. Change physical Ren consumption from `2R` to `R`.
12. Reset exertion on Ren Output adjustment.
13. Charge Ren once through upkeep and again through Aura time.
14. Include a parent/adjacent Body Part in raw Ren attack Output.
15. Let generic runtime branch on the Ren id.
16. Let Aura import either principle file.

Report the test count or named test that caught each mutation. Architecture guards must be mutation-tested so they cannot pass vacuously.

## 12. Acceptance criteria

- Ten and Ren are independent and mutually exclusive in every public and internal path.
- Ten's sole intended coating formula is `0.10P` for Mastery I–X, with no floor and no Ren input.
- Ten's sole mastery benefit in this ticket is exact residual leakage reduction from `2R/hour` to zero.
- Ten uses contained gross recovery and reports residual leakage separately.
- Ten leakage reaching zero Aura does not trigger uncontained collapse.
- Ren's mastery Output ceilings, gates, and full-output endurance table remain intact.
- Ren allows a validated submaximum Output selection and continuously expends exactly `Oactive/minute`.
- Ren replaces uncontrolled open-pore leakage rather than stacking with it.
- Ren sets natural recovery to zero; physical activity independently adds `2R/hour` consumption.
- Ren adjustments preserve accumulated full-output-equivalent exertion.
- Ren stops and Ten resumes at exact in-interval boundaries, subdivision-invariantly.
- Raw Ren offensive Output comes from exactly one declared attacking Body Part and never a chain.
- Raw Ren creates no defensive coating and does not affect objects by default.
- Generic Aura and runtime code remain principle-neutral.
- No live caller or export retains Ten-dependent Ren containment/waste behavior.
- No duplicate charge, compatibility alias, skipped test, `.only`, unresolved TODO, placeholder, or unrelated refactor remains.
- Focused tests, full engine tests, and engine typecheck pass. Monorepo failures must match the recorded unrelated baseline unless a directly caused caller break is repaired.

## 13. Verification commands

Run from the repository root. Adjust only the focused test file list after discovering the repository's exact names; do not weaken coverage.

```bash
git status --short --branch
git rev-parse HEAD
git diff --check

npm test -w @nenworld/engine -- \
  src/__tests__/nen-ten.test.ts \
  src/__tests__/nen-ren.test.ts \
  src/__tests__/aura-access.test.ts \
  src/__tests__/aura-time.test.ts \
  src/__tests__/aura-interval-invariance.test.ts \
  src/__tests__/aura-profile.test.ts \
  src/__tests__/character-time.test.ts \
  src/__tests__/nen-aura-runtime-integration.test.ts \
  src/__tests__/architecture.test.ts

npm run typecheck -w @nenworld/engine
npm test -w @nenworld/engine
npm test
npm run typecheck

git diff --check
git status --short
git diff --stat
git diff
```

Also perform targeted searches after tests pass:

```bash
rg -n "minimumCoating|renAccessFraction|renAccessibleOutput|resolveRenContainmentEfficiency|deriveRenContainmentAuraLoss" packages/engine/src
rg -n "definitionId.*ren|ren.*definitionId" packages/engine/src/character/foundation packages/engine/src/character/time
rg -n "\.only\(|\.skip\(|TODO|FIXME" packages/engine/src
```

Review every remaining match in context. A string match is not automatically a defect, but no live formula or comment may describe the rejected model.

## 14. Commit and completion report

Commit only after all engine exit gates pass. Do not push unless explicitly authorized.

The executing agent must return this report:

1. **Commit and branch** — commit hash, branch, clean/dirty state, and whether pushed.
2. **Ticket summary** — final Ten and Ren behavior implemented.
3. **Intentional deviations** — any departure from this plan, with technical evidence and reason.
4. **Files changed** — grouped by production, tests, documentation/architecture, and any necessary caller migration.
5. **Verification** — focused suites, full engine suite, engine typecheck, monorepo test/typecheck, and exact counts.
6. **Mutation checks** — each mutation and the test that caught it.
7. **Baseline comparison** — before/after counts with unrelated pre-existing failures separated.
8. **Bugs found** — defects discovered during implementation and whether fixed or deferred.
9. **Remaining risks and deferred work** — only genuinely unresolved integration concerns; do not expand scope into unrelated principles.
10. **Working tree and push status** — exact final state. Never imply a push occurred without confirmation.

Do not call TRR-1 complete while an acceptance criterion, mutation check, focused test, full engine test, or engine typecheck is failing.
