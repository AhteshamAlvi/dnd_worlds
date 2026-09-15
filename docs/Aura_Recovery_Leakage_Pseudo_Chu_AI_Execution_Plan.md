# Aura Recovery, Leakage, Physical Consumption, and Pseudo-Chū Correction — AI Execution Plan

## 1. Objective

Replace the engine’s current Aura-over-time model with the settled rate matrix in this plan: halve the existing resolved Regeneration unit and use integer coefficients; make half-open pores leak; make physical exertion a continuous rate instead of a price attached to individual actions; make active Nen stop natural regeneration; apply the corrected ordinary, rest, sleep, voluntary Zetsu, forced-Zetsu, contained, and uncontained rates; make eight qualifying hours of continuous sleep top off Current Aura; and move every pseudo-Chū-specific rule into a new `character/foundation/nen/principles/chu.ts` while preserving Aura’s principle-neutral boundary. Complete the change without altering Ten’s coating formula, Aura Output, Maximum Aura, Control, damage, defense, full awakened Chū, or the generic active-Nen lifecycle.

## 2. Verified starting point

Repository evidence was inspected on `main` at head commit `49eeeb27ee3a855fe0a4f350b8c958832affbfc2` (`completed the fix for ten`). The user-reported baseline for that commit is 125 test files / 5,049 passing engine tests with `tsc --noEmit` clean; reproduce and record the actual local baseline before editing. The repository also has 65 reported pre-existing `apps/workbench` type errors; capture the local monorepo baseline and do not make this ticket responsible for unrelated Workbench repair.

The following implementation facts were verified directly:

- `aura/recovery.ts` currently derives the old resolved rate as `roundToOneSignificantFigure(raw)` and applies mode multipliers `ordinary-waking: 0`, `intentional-rest: 0.5`, and `sleep: 1`.
- `resolveAuraRecoveryMultiplier` currently ignores voluntary suppression during ordinary waking and otherwise takes `max(mode, suppression.multiplier)`.
- `nen/principles/zetsu.ts` currently makes Aura replenishment mastery-dependent, from ×1 through ×5. That contradicts the activity-dependent Zetsu rates settled below.
- `aura/leakage.ts` correctly owns fully open, uncontained leakage at Physiological Output per minute. The standard 100-Aura / 20-Output awakener therefore has a five-minute no-recovery projection. This `O/minute`, `60O/hour` authority must remain.
- `aura/access.ts` currently marks unawakened and reverted half-open states as `uncontained: false`, so the time solver charges them no passive leakage. It also owns `PSEUDO_CHU_EFFICIENCY = 0.20` and manufactures the pseudo-Chū descriptor itself.
- `aura/passive.ts` currently performs the whole-body internal distribution for pseudo-Chū. Its numerical behavior already uses `Current Aura × efficiency`, bypasses Output, deducts nothing, and weakens with Current Aura. Its naming and ownership are pseudo-Chū-specific even though the distribution operation can be generalized.
- No `foundation/nen/principles/chu.ts` exists. The principles directory currently contains `ten.ts`, `ren.ts`, `zetsu.ts`, and `hatsu.ts`.
- `aura/time.ts` already provides the correct interval solver foundation: it validates a full timeline before calculation, splits at exact boundaries, nets uncapped recovery against drains before clamping, reports contribution provenance, preserves interval invariance, stops uncontained leakage during suppression, and emits typed collapse results.
- `aura/time.ts` currently computes sustained physical expenditure as `Maximum Aura × 0.001 × loadPerHour × Stamina multiplier`. `aura/expenditure.ts` also prices discrete physical actions with the same coefficient.
- `ScheduledAuraEventKind` currently includes `physical`, allowing per-action physical charges. `AuraBalance.physical` is already an appropriate reporting bucket and should remain, but its producer must become the continuous physical-consumption rate.
- `body/endurance/exertion.ts` currently defines action loads, sustained hourly loads, and `M_Stamina = 10 / max(1, Stamina)` specifically for physical Aura expenditure. Retain any vocabulary used elsewhere, but remove the obsolete Aura-cost role and dead exports after a complete call-site inventory.
- `AuraTimeActivity` already separates wakefulness mode from sustained activity and supports mid-interval activity changes. Any named sustained activity other than `ordinary-waking`, or any positive raw activity load, can identify physical exertion without creating another clock.
- `CharacterWakefulnessState` stores only `hoursAwake`. Neither it nor `CharacterTemporalState` records consecutive sleep, so an eight-hour completion benefit cannot currently survive subdivision across multiple time advances.
- `character/time/advance.ts` is the real integration path that hands one authoritative interval to Aura, wakefulness, Fatigue, and the active-Nen runtime. It must remain the only cross-domain coordinator.
- `NenActivityRuntime` is principle-neutral and treats `definitionId` as opaque. No implementation in this ticket may branch on strings such as `ren`, `zetsu`, or `hatsu` inside the generic runtime.
- Architecture tests currently permit `character/nen/access.ts` to import passive `ten.ts`, ban Aura from importing anything under `foundation/nen`, and ban active principle imports from the Nen access projection. The same one-way projection pattern is required for passive pseudo-Chū.
- Ten’s corrected implementation is already the sole authority for its coating, consumes no Current Aura, has no upkeep, and causes no leakage. Do not reopen its formula or its 5% floor.

### Confirmed issues to repair

1. **Severity: high — recovery rates contradict the settled activity table.** Observable failure: ordinary waking restores nothing, rest restores half of the old rate, and sleep restores the old rate. Reproduce in `aura-recovery.test.ts` or with `recoverAura` at a partially empty pool. Root cause: the old three-entry multiplier table and old definition of the resolved rate. Recommended correction: define revised `R = old resolved regeneration / 2` once, then resolve coefficients from access state, activity, active Nen, and suppression using the contracts below.

2. **Severity: high — half-open pores never reduce Current Aura.** Observable failure: an unawakened ordinary hour reports zero leakage and pseudo-Chū is treated as a costless static conversion only. Reproduce by advancing an unawakened character. Root cause: half-open access states are deliberately excluded from `uncontained`, and the time solver only knows uncontained leakage. Recommended correction: add a separate half-open leakage producer at `2R/hour`; do not overload `uncontained`, because half-open depletion must not trigger uncontained collapse.

3. **Severity: high — physical Aura consumption is action/load/Stamina-priced instead of time-based.** Observable failure: a strenuous hour and a discrete punch are charged by `Maximum Aura × 0.001 × load × M_Stamina`. Root cause: `expenditure.ts`, the sustained-load arithmetic in `time.ts`, `physical` scheduled events, and public physical-cost exports. Recommended correction: charge a flat continuous `2R/hour` whenever the activity is physically exerting, remove direct physical action pricing, and preserve explicit Nen costs, upkeep, hostile drains, and recovery events.

4. **Severity: high — Zetsu recovery is mastery-scaled and not activity-scaled.** Observable failure: Zetsu X can replenish at five times the old capacity, while voluntary Zetsu during ordinary waking is deliberately ignored. Root cause: `zetsu.ts` replenishment profiles plus `resolveAuraRecoveryMultiplier`. Recommended correction: remove mastery as a recovery-rate input and project the activity-aware coefficients below; retain mastery where it still governs suppression/concealment behavior.

5. **Severity: high — active Nen does not suppress natural regeneration.** Observable failure: upkeep may be paid during sleep/rest while natural recovery continues; the Aura activity vocabulary has no resolved active-Nen-use fact. Root cause: the generic active runtime is carried beside Aura but recovery never receives a principle-neutral “active Nen is operating” signal. Recommended correction: add a generic activity fact and integrate it through the real character-time path without inspecting principle ids. Ten is excluded because it is passive; suppression uses its own branch.

6. **Severity: high — forced-Zetsu recovery is not applied after an in-interval collapse.** Observable failure: collapse stops leakage but the remaining interval continues using the pre-collapse recovery/activity rates. Root cause: collapse is emitted as a request while `ratesFor()` continues reading the original activity. Recommended correction: split at the collapse boundary and apply the forced-suppression `3R` recovery state thereafter, with no physical consumption while blacked out.

7. **Severity: high — eight hours of sleep has no completion top-off and no subdivision-safe progress state.** Observable failure: recovery is only rate-based, and eight one-hour calls cannot know they form one continuous sleep. Root cause: no consecutive-sleep state or eight-hour boundary. Recommended correction: track qualifying consecutive sleep across advances, reset it on non-sleep, and top off Current Aura once when the streak crosses eight hours.

8. **Severity: medium — pseudo-Chū’s numerical behavior is mostly right but its ownership and explanation are wrong.** Observable failure: Aura owns the `0.20` rule and describes only a fraction of the reserve as sitting internally. Root cause: pseudo-Chū constants and construction live in `aura/access.ts`/`aura/passive.ts`. Recommended correction: create `foundation/nen/principles/chu.ts` as the sole owner of the passive pseudo-Chū rule and project a generic passive-internal-reinforcement descriptor into Aura through `character/nen/access.ts`.

## 3. Scope boundaries

This plan implements:

- the revised base Regeneration unit and every rate in the source-of-truth table;
- half-open leakage, fully open leakage composition, and physical consumption;
- active-Nen recovery suppression through a principle-neutral activity fact;
- voluntary Zetsu and forced-Zetsu activity rates;
- post-collapse forced-Zetsu recovery within a continued interval;
- eight-hour continuous-sleep completion and persistence across chained advances;
- removal of per-action and load-scaled physical Aura expenditure;
- pseudo-Chū ownership under a new `foundation/nen/principles/chu.ts`;
- required public API cleanup, integration edits, documentation, traces, tests, and architecture guards.

This plan deliberately does not implement:

- awakened Chū activation, mastery, internal Output access, upkeep, or reinforcement strength;
- Ren, Gyo, Shu, Ken, Ryū, Kō, damage, defense, or reinforcement conversion;
- changes to Ten’s coating formula, floor, distribution, access projection, or free/passive status;
- changes to Maximum Aura, Physiological Output, Aura Control, Fatigue bands, wakefulness limits, or the two-hours-cleared-per-hour-slept rule;
- Zetsu concealment redesign or full active-principle activation wiring beyond the recovery facts needed here;
- per-action exertion tiers or a replacement Stamina bar;
- repair of unrelated Workbench type errors.

Compatibility rules:

- Preserve the current fully open leakage formula exactly: `ratePerMinute = physiologicalOutput`, `ratePerHour = 60 × physiologicalOutput`.
- Preserve `AuraBalance.physical` as the reporting field for continuous bodily consumption; remove only its old producers and obsolete action-cost APIs.
- Old stored wakefulness objects lacking consecutive-sleep progress must normalize to zero. Do not invent a broad save migration framework solely for this field.
- Returned/committed wakefulness state must include normalized sleep progress so chained advances are deterministic.
- Remove obsolete public APIs rather than leaving aliases that allow the old physical or mastery-scaled recovery model to survive. Update all repository callers in the same change.
- Aura must continue to import no individual Nen principle. Dependency remains `foundation/nen/principles/{ten,chu} -> Aura vocabulary`, then `character/nen/access.ts -> AuraAccessInput`, never Aura -> Nen.
- The generic active-Nen runtime must remain principle-neutral and may not branch on `definitionId`.

Narrow assumptions required to make this executable:

- “Qualifying sleep” means a continuous interval whose wakefulness mode is `sleep`. Any positive-duration non-sleep segment resets the streak to zero. A zero-duration boundary does not reset it.
- The streak is capped at eight hours after the top-off so the bonus fires once per continuous sleep period. Waking resets it and permits a future completed sleep period.
- Any named sustained activity other than `ordinary-waking`, or a positive raw activity load, counts as physical exertion. Load magnitude no longer changes Aura cost.
- A physical interval under active Nen receives zero natural regeneration and still consumes `2R/hour`.
- Ordinary Zetsu is represented by suppression plus its resolved activity coefficient, not by a special branch on a principle id. Forced collapse is already a typed Aura outcome and may apply the generic forced-suppression coefficient internally after collapse.

## 4. Source-of-truth contracts

### 4.1 Revised Regeneration unit

Keep the existing raw VIT curve and existing one-significant-figure resolution, then halve the resolved value:

```ts
oldResolved = roundToOneSignificantFigure(rawVitRegeneration)
R = oldResolved / 2
```

Do not halve before rounding; `R` must be exactly half of the value the current engine exposes so doubled coefficients preserve existing magnitudes. `deriveAuraRegeneration`, `deriveAuraRegenerationCapacity`, traces, comments, and public documentation must all agree on whether they return `R` or the obsolete value. There must be one numerical producer.

At VIT 13, the old resolved value is approximately 10 Aura/hour and the revised `R` is 5 Aura/hour.

### 4.2 Rate equation and independent terms

For each constant segment:

```text
net/hour = regeneration
         - leakage
         - physicalConsumption
         - deliberateNenCost
         - upkeep
         - forcedDrain
```

Continue netting uncapped generation and drains before clamping the pool. Keep contribution provenance. Allocation remains absent from `AuraBalance` because Output placement is not reserve expenditure.

The passive outflows are independent and stack:

```text
half-open leakage       = 2R/hour
physical consumption    = 2R/hour while physically exerting
uncontained leakage     = O/minute = 60O/hour
```

Half-open leakage and physical consumption both apply to an unawakened physical interval. Uncontained leakage and physical consumption both apply to an awakened, uncontained physical interval. Ten or Zetsu stops leakage, not physical consumption.

### 4.3 Complete rate matrix

“Unmastered Ten” means awakened with effective Ten Mastery 0 and no other containment. “In Ten” means contained by usable passive Ten. Explicit generic overrides that contain Aura without suppression follow the contained column unless their resolved contract says otherwise.

| Activity and Aura state | Regeneration | Leakage | Physical consumption | Net/hour before explicit Nen costs |
|---|---:|---:|---:|---:|
| Unawakened during ordinary activity | `2R` | `2R` | `0` | `0` |
| Zetsu during ordinary activity | `3R` | `0` | `0` | `+3R` |
| Awakened, Unmastered Ten during ordinary activity | `R` | `60O` | `0` | `R - 60O` |
| Awakened in Ten during ordinary activity | `2R` | `0` | `0` | `+2R` |
| Unawakened during physical activity | `R` | `2R` | `2R` | `-3R` |
| Zetsu during physical activity | `R` | `0` | `2R` | `-R` |
| Awakened, Unmastered Ten during physical activity | `R` | `60O` | `2R` | `-60O - R` |
| Awakened in Ten during physical activity | `R` | `0` | `2R` | `-R` |
| Unawakened during intentional rest | `3R` | `2R` | `0` | `+R` |
| Zetsu during intentional rest | `4R` | `0` | `0` | `+4R` |
| Awakened, Unmastered Ten during intentional rest | `2R` | `60O` | `0` | `2R - 60O` |
| Awakened in Ten during intentional rest | `3R` | `0` | `0` | `+3R` |
| Unawakened during sleep | `4R` | `2R` | `0` | `+2R` |
| Zetsu during sleep | `4R` | `0` | `0` | `+4R` |
| Awakened, Unmastered Ten during sleep | `4R` | `60O` | `0` | `4R - 60O` |
| Awakened in Ten during sleep | `4R` | `0` | `0` | `+4R` |
| Awakened, Unmastered Ten using active Nen while stationary | `0` | `60O` | `0` | `-60O`, before Nen costs |
| Awakened in Ten using active Nen while stationary | `0` | `0` | `0` | `0`, before Nen costs |
| Awakened, Unmastered Ten using active Nen physically | `0` | `60O` | `2R` | `-60O - 2R`, before Nen costs |
| Awakened in Ten using active Nen physically | `0` | `0` | `2R` | `-2R`, before Nen costs |
| Forced Zetsu after collapse | `3R` | `0` | `0` | `+3R` |

Unawakened active Nen is impossible. Ordinary Zetsu cannot be combined with another ordinary active Nen principle. Ten itself never activates the zero-regeneration rule.

### 4.4 Generic recovery context

Aura must resolve rates from generic facts, not Nen principle names. The exact internal shape may follow repository conventions, but it must distinguish at least:

```ts
type AuraRecoveryAccessClass =
  | "half-open"
  | "uncontained"
  | "contained"
  | "suppressed";

interface AuraTimeActivity {
  readonly mode: "ordinary-waking" | "intentional-rest" | "sleep";
  readonly activeNenUse?: boolean; // default false for compatibility
  // existing sustained-activity and suppression facts remain
}
```

Derive the access class from `ResolvedAuraAccess` and the resolved suppression fact. Do not ask Aura whether Ten, Zetsu, or Chū is active. Validate contradictory combinations before calculation, including unawakened suppression and ordinary active Nen combined with suppression where the rules forbid it.

If the implementation retains `AuraSuppression.multiplier`, it must now carry the activity-resolved coefficient and must not be combined with the base mode by `max(...)`. Prefer a clearly named coefficient/policy shape if changing it removes ambiguity. Do not leave a field documented as Zetsu Mastery ×1–×5.

### 4.5 Active Nen

Active Nen is a generic recovery fact. It means a non-passive Nen activity is actively operating during that segment and therefore natural regeneration is zero. Explicit Aura costs and upkeep continue to apply normally.

- Ten does not count; it is passive derived state and is absent from the active runtime.
- Suppression/Zetsu uses the suppression recovery branch rather than the active-Nen-zero branch.
- Never branch on `NenActivity.definitionId`.
- If the character-time coordinator derives the initial fact from `NenActivityRuntime`, use the generic active-activity query and let explicit activity changes describe mid-interval changes. Do not create a second active-principle state machine in Aura.

### 4.6 Pseudo-Chū ownership

Create:

```text
packages/engine/src/character/foundation/nen/principles/chu.ts
```

This file owns the passive pseudo-Chū contract and only that part of Chū for now:

```text
source Aura            = all Current Aura
reinforcement efficiency = 0.20
effective reinforcement  = Current Aura × 0.20
placement                = uniform, whole-body, internal
control                   = none
Output use                = none
Current Aura deduction    = none from reinforcement itself
availability              = never-awakened only
```

All Current Aura circulates through and reinforces the body; `0.20` is effectiveness, not the share used. Actual half-open loss is independently `2R/hour`.

`chu.ts` should project a generic Aura vocabulary value through `character/nen/access.ts`, following Ten’s one-way adapter pattern. Aura may retain a principle-neutral whole-body internal-distribution resolver, but it must no longer own the pseudo-Chū coefficient, manufacture a pseudo-Chū descriptor, or describe only 20% of the reserve as the amount being used. Do not implement awakened Chū in this file.

### 4.7 Sleep completion

Track consecutive qualifying sleep in persistent character endurance state, normalized from absent to zero for old objects:

```ts
interface CharacterWakefulnessState {
  readonly hoursAwake: number;
  readonly consecutiveSleepHours?: number; // absent input normalizes to 0
}
```

The concrete name may follow repository style. Successful transitions should return the normalized field. During time advancement:

1. Accumulate across consecutive `sleep` segments and chained calls.
2. Reset to zero on the first positive-duration non-sleep segment.
3. Split exactly at the instant the streak reaches eight hours.
4. Resolve ordinary rates up to that instant.
5. Set Current Aura to Maximum Aura and report the amount actually added as sleep-completion recovery with distinct provenance.
6. Cap the streak at eight until waking so the top-off cannot fire repeatedly.
7. Preserve one-long-advance versus many-short-advances equivalence.

The top-off belongs to completed sleep, not Zetsu alone. Post-collapse mandatory unconscious sleep qualifies. If uncontained leakage reaches zero before eight hours, collapse happens first; subsequent time uses forced-Zetsu `3R`, no leakage, no physical consumption, and the sleep streak begins/continues from the collapse instant as appropriate.

## 5. Execution strategy

This is one coherent implementation ticket. The same central files (`aura/time.ts`, `aura/types.ts`, `aura/recovery.ts`, `character/time/*`, and their tests) carry almost every dependency, so parallel writers would create more coordination cost than value. Use one lead writer. A read-only adversarial reviewer may run after the integrated focused tests are green.

| Wave | Work | Dependency | Concurrency | File ownership | Model |
|---|---|---|---|---|---|
| 0 | Reproduce baseline; inventory all callers/exports of physical-cost, recovery, suppression, pseudo-Chū, and sleep-state symbols | None | Read-only reconnaissance may run alone | No writes | Sonnet — low effort |
| 1 | Establish revised `R`, generic recovery/activity contracts, half-open/physical rates, pseudo-Chū projection, and obsolete API removals | Wave 0 | Sequential; one writer | Lead owns all production files | Opus — medium effort |
| 2 | Integrate exact interval boundaries, collapse-to-forced-recovery, active Nen, consecutive sleep, and eight-hour top-off | Wave 1 | Sequential; overlaps central time files | Lead owns all production files | Opus — medium effort |
| 3 | Rewrite/add focused tests and architecture guards; run focused suites and engine typecheck | Waves 1–2 | Sequential with implementation; no second writer | Lead owns relevant tests | Sonnet — high effort |
| 4 | Adversarial read-only review of formulas, old API removal, interval invariance, and architecture direction | Wave 3 green | One read-only subagent may overlap only with lead’s diff inspection | No writes | Opus — high effort |
| 5 | Apply review fixes, run full verification once, inspect diff, commit | Wave 4 | Lead only | Lead owns integration and commit | Opus — medium effort |

Concurrency summary:

- Maximum useful concurrent agents: 2, only during final read-only review.
- Recommended concurrent agents: 1 writer; optionally 1 read-only reviewer after focused verification.
- No implementation tickets overlap because central file ownership is shared.
- Critical path: baseline → contracts/rates → time/sleep/collapse integration → focused tests → adversarial review → full suite.
- Sequential fallback: the lead performs Wave 4 as a fresh read-only pass after clearing implementation context.

## 6. Model assignment

- Wave 0: **Sonnet — low effort**, because it is targeted discovery and baseline capture.
- Waves 1–2 / Ticket ARC-1: **Opus — medium effort**, because this changes cross-domain numerical contracts, persistent sleep progress, state-transition boundaries, public APIs, and interval invariants.
- Wave 3: **Sonnet — high effort**, because the expected behavior is settled but the focused regression suite is broad.
- Wave 4: **Opus — high effort**, used only for the final adversarial review of high-risk state transitions and mathematical invariants.
- Wave 5: **Opus — medium effort**, because integration fixes and final acceptance remain architecture-sensitive.

## 7. Subagent orchestration

Do not spawn implementation subagents. The lead agent owns every write, all shared contracts, conflict resolution, integration, final verification, and the completion report.

One optional read-only reviewer is recommended:

- **Spawn point:** after all focused tests and engine typecheck pass, before the full suite.
- **Assignment:** review Ticket ARC-1’s final diff against Section 4 and identify semantic omissions, duplicated numerical authorities, stale exports/comments, interval-dependence, and illegal dependency directions.
- **Status:** read-only.
- **Writable boundary:** none; the reviewer must not edit files.
- **Required inputs:** this ticket, `git diff --stat`, `git diff`, baseline results, focused test results, and the relevant production/test paths only.
- **Expected return:** exactly (1) findings, (2) files implicated, (3) checks performed, and (4) remaining risks/blockers.
- **Focused verification:** reviewer may request or run read-only focused tests but may not run the final full suite in parallel with the lead.
- **Model:** Opus — high effort.
- **Prerequisite:** Wave 3 green.

## 8. Implementation tickets

### Ticket ARC-1 — Replace the Aura-over-time economy and relocate pseudo-Chū ownership

**Goal:** Every real character-time advance follows the exact rate matrix, uses continuous rather than per-action physical consumption, handles collapse and eight-hour sleep invariantly, and receives pseudo-Chū from the new Chū principle file without Aura importing Nen.

**Why:** The existing pieces are individually robust but encode the superseded economy: zero waking recovery, costless half-open pores, load/Stamina-priced movement, mastery-scaled Zetsu recovery, no active-Nen recovery stop, and no eight-hour completion boundary. Pseudo-Chū’s arithmetic is largely reusable, but its principle-specific constant and construction are in Aura instead of the Nen principle layer.

**Depends on:** None beyond reproducing Wave 0’s baseline.

**Concurrency:** No writer ticket may run alongside ARC-1. The optional Wave 4 reviewer is read-only and begins only after focused verification is green.

**Model:** Opus — medium effort.

**Agent:** Lead agent.

**Owned files:** Expected production scope includes the following; adjust only after targeted call-site discovery. Shared central files are marked.

- `packages/engine/src/character/foundation/aura/recovery.ts` **shared central**
- `packages/engine/src/character/foundation/aura/time.ts` **shared central**
- `packages/engine/src/character/foundation/aura/timeline.ts` **shared central**
- `packages/engine/src/character/foundation/aura/types.ts` **shared central**
- `packages/engine/src/character/foundation/aura/access.ts`
- `packages/engine/src/character/foundation/aura/leakage.ts`
- `packages/engine/src/character/foundation/aura/passive.ts`
- `packages/engine/src/character/foundation/aura/expenditure.ts`
- `packages/engine/src/character/foundation/aura/transitions.ts`
- `packages/engine/src/character/foundation/aura/index.ts`
- `packages/engine/src/character/foundation/aura/resolution.ts`
- `packages/engine/src/character/foundation/body/endurance/types.ts`
- `packages/engine/src/character/foundation/body/endurance/exertion.ts`
- `packages/engine/src/character/foundation/body/endurance/wakefulness.ts`
- `packages/engine/src/character/foundation/body/endurance/index.ts`
- `packages/engine/src/character/foundation/nen/principles/chu.ts` **new**
- `packages/engine/src/character/foundation/nen/principles/zetsu.ts`
- `packages/engine/src/character/nen/access.ts`
- `packages/engine/src/character/time/types.ts` **shared central**
- `packages/engine/src/character/time/advance.ts` **shared central**
- `packages/engine/src/character/time/projection.ts` if required by normalized sleep state
- `packages/engine/src/index.ts` only if the public surface actually changes there
- focused tests under `packages/engine/src/__tests__/`, especially `aura-recovery`, `aura-time`, `aura-interval-invariance`, `aura-expenditure`, `aura-access`, `aura-profile`, `body-endurance`, `character-time`, `nen-ten`, `nen-aura-runtime-integration`, and `architecture`.

**Required changes:**

1. Capture the engine and monorepo baselines. Search every repository caller and export of `PHYSICAL_AURA_COST_COEFFICIENT`, `PhysicalAuraCost`, `derivePhysicalAuraCost`, `deriveSustainedPhysicalAuraCost`, `deriveSustainedActivityAuraCost`, `spendPhysicalAura`, `exertionLoad`, scheduled `kind: "physical"`, `deriveZetsuReplenishmentMultiplier`, `PSEUDO_CHU_EFFICIENCY`, `PSEUDO_CHU_ALLOCATION_ID`, `resolvePassiveInternalAura`, `AuraSuppression.multiplier`, and `CharacterWakefulnessState`. Do not delete a symbol before classifying every caller.

2. Make the revised `R` the single resolved Regeneration authority by dividing the existing one-significant-figure resolved capacity by two. Keep raw derivation available only if currently public/used, and make its naming/documentation clear. Update resolved Aura profiles and traces so they report the revised capacity.

3. Replace the three-value recovery multiplier table with a generic state/activity resolver implementing Section 4.3. Reuse `ResolvedAuraAccess`, the existing activity timeline, and the existing suppression vocabulary. Do not introduce principle names into Aura.

4. Add a principle-neutral active-Nen-use fact to the time activity contract. Default omitted legacy input to false, validate hostile non-boolean/non-enum input, and ensure the real `character/time` route carries or derives it without inspecting `definitionId`. Suppression takes its own recovery branch; Ten never sets active use.

5. Implement half-open leakage as a separate rate from uncontained leakage. It applies to every half-open state, including a reverted character without pseudo-Chū. Report it in `AuraBalance.leakage`, cap actual loss at the pool through the existing solver, and never emit uncontained-collapse requests from half-open depletion.

6. Preserve fully open leakage in `leakage.ts` at exactly `O/minute` and `60O/hour`. Compose it additively with physical consumption. Keep the imported canonical Round duration and all consistency conversions.

7. Replace load/Stamina-scaled sustained physical expenditure in `time.ts` with `2R/hour` whenever the activity is physically exerting. Preserve `AuraBalance.physical`, segment reporting, unmet drain, upkeep shedding, and net-before-clamp behavior.

8. Remove per-action physical Aura pricing. Eliminate physical cost from action cost requests/results, remove or narrow the `physical` scheduled-event route, remove `spendPhysicalAura` and obsolete physical-cost exports, and update all callers. Explicit deliberate Aura cost, required Output, upkeep, scheduled recovery, and forced drains remain. Do not leave compatibility aliases for the old formula.

9. Retain generic activity/exertion vocabulary only where it still identifies physical intervals or serves another verified non-Aura consumer. Remove the Stamina expenditure multiplier and load tables from the Aura cost path. Update Body comments/tests so they no longer claim Stamina prices physical Aura; do not redesign what Stamina may later do.

10. Create `foundation/nen/principles/chu.ts`. Put the `0.20` pseudo-Chū efficiency, never-awakened eligibility, whole-body/internal/uncontrolled semantics, and generic Aura projection there. Do not add awakened Chū behavior. Type-import Aura vocabulary as needed, exactly as `ten.ts` projects an Aura coating.

11. Change `character/nen/access.ts` to be the only adapter importing the passive pseudo-Chū projection and handing it to `AuraAccessInput`. Generalize Aura’s passive-internal descriptor and distribution resolver so Aura applies a supplied value without knowing pseudo-Chū’s coefficient or inventing its source. Keep reverted characters without pseudo-Chū.

12. Add architecture guards that pin both passive-principle imports (`ten.ts` and `chu.ts`) to the exact Nen access adapter, keep Aura from importing any `foundation/nen` file, and prevent the `0.20` pseudo-Chū efficiency from being restated anywhere under Aura. Mutation-check each new guard so it cannot pass vacuously.

13. Remove Zetsu recovery scaling from mastery profiles and obsolete multiplier APIs. Preserve unrelated mastery/suppression/concealment behavior. Make Zetsu provide the activity-aware coefficients: ordinary `3R`, physical `R`, intentional rest `4R`, sleep `4R`; forced collapse provides `3R`. Aura consumes a generic resolved suppression coefficient/policy.

14. Update `resolveAuraRecoveryMultiplier` or replace it with a more accurate resolver. Remove the old “voluntary suppression does nothing while awake” and `max(mode, suppression)` behavior. Ensure no stale ×1–×5 comments or exports remain for Zetsu replenishment.

15. Add consecutive-sleep progress to the stored endurance state with absent-input normalization. Validate finite values in `[0, 8]`; refuse NaN, negative, or over-cap hostile values rather than silently clamping them. Return normalized state from every successful wakefulness/time transition and leave input immutable.

16. Extend the boundary solver to split at the exact eight-hour qualifying-sleep crossing. Apply rate arithmetic first, then top off the pool, report distinct recovery provenance and a typed timeline event, and cap the streak at eight until a positive-duration non-sleep segment resets it.

17. At uncontained collapse, keep the exact collapse timestamp, stop fully open leakage, stop physical consumption because blackout ends exertion, and apply forced-Zetsu `3R` for the remainder of the interval. Make the collapse request/event remain the integration boundary for Condition and Nen state owners; Aura may resolve its own post-collapse rates without manufacturing mastery.

18. Make post-collapse mandatory unconscious time count as qualifying sleep for the eight-hour completion rule. If the same interval crosses both collapse and sleep completion, order them by timestamp and apply each once. A pool reaching zero exactly at an interval end still collapses; a sleep streak reaching eight exactly at an interval end still tops off.

19. Preserve validation-before-mutation. Malformed activity, suppression, sleep state, access, pool, or interval must return failure with the original Character, Aura state, wakefulness, temporal state, active runtime, and allocations untouched.

20. Update comments, traces, exported names, and decision references only after behavior is correct. Remove prose that says ordinary waking recovers zero, unawakened leakage is not a loss, only 20% of Aura is used by pseudo-Chū, physical effort is priced by Maximum Aura/Stamina, or Zetsu replenishment scales ×1–×5.

**Required tests:**

- Pin the revised Regeneration producer: VIT 13 resolves to `R = 5` when the old resolved capacity was 10; representative low/high VIT anchors remain finite and preserve the halving-after-rounding rule.
- Table-drive every row in Section 4.3 through `advanceAuraTime`, checking recovery, leakage, physical, explicit costs, net, Current Aura, and provenance separately—not merely the final pool.
- Catch restoration of the old recovery table: ordinary contained activity must recover `2R`, intentional rest `3R`, sleep `4R`, and uncontained ordinary/rest must use `R`/`2R` respectively.
- Catch failure to stack independent drains: unawakened physical must report `R` recovery, `2R` leakage, `2R` physical, and `-3R` net; uncontained physical must report both `60O` leakage and `2R` physical.
- Verify fully open leakage remains exactly `O/minute`, `60O/hour`, and tied to the canonical Round duration. A mutation doubling `60O` must fail.
- Verify half-open leakage applies to never-awakened and reverted half-open states, does not apply under Ten/Zetsu, does not use Output, and never emits uncontained collapse.
- Verify Ten still deducts no Current Aura, has no upkeep, causes no leakage, and leaves its coating/output behavior unchanged.
- Verify all learned Ten ranks receive the same recovery table; Ten mastery must not alter recovery.
- Verify active Nen makes natural recovery zero while stationary and while physical, while explicit upkeep/costs still charge. Verify Ten alone does not count. Verify contradictory suppression plus ordinary active Nen input is refused if that combination is illegal.
- Verify Zetsu rates for ordinary, physical, intentional rest, and sleep. Verify Mastery I and X produce identical recovery and retain any unrelated mastery behavior. A mutation restoring mastery-scaled recovery must fail.
- Verify forced Zetsu after collapse uses `3R` even when the pre-collapse segment was ordinary, physical, rest, or sleep.
- Verify collapse halfway through an interval creates two correct segments: pre-collapse uncontained rates and post-collapse forced-Zetsu rates. Verify blackout removes physical consumption after the collapse instant.
- Verify pseudo-Chū uses all Current Aura as its source, produces effective reinforcement `Current Aura × 0.20`, remains whole-body/internal/equal-density, uses no Output, deducts nothing for reinforcement, and weakens with the reserve.
- Verify half-open leakage is independent of pseudo-Chū efficiency. Mutating `0.20` must change reinforcement but not the `2R` leakage rate; mutating leakage must not change reinforcement efficiency.
- Verify pseudo-Chū is supplied from `chu.ts` through the Nen access adapter, absent after awakening, absent after reversion, and unavailable on malformed/contradictory access input.
- Verify old physical APIs and exports are absent and no production/test caller reconstructs `Maximum Aura × 0.001 × load × Stamina` under another name. Prefer behavioral tests plus one public-surface assertion.
- Verify a non-Aura physical action causes no instantaneous Aura deduction. Time spent in its physical interval causes the continuous rate instead.
- Verify one eight-hour sleep from zero at CON/VIT 13 naturally reaches approximately 80 before the completion boundary and then tops off to 100. Inspect the event/contribution so the top-off is not mistaken for ordinary regeneration.
- Verify seven hours and `7.999...` qualifying hours do not top off; exactly eight does; more than eight fires only once.
- Verify eight one-hour advances equal one eight-hour advance in Aura, wakefulness, consecutive-sleep progress, Fatigue, events at equivalent absolute timestamps, collapse outcome, and active-runtime result.
- Verify a positive-duration ordinary/rest/physical segment resets sleep progress; subsequent sleep begins from zero. Verify a zero-duration boundary does not manufacture a reset or duplicate top-off.
- Verify post-collapse mandatory sleep can reach the eight-hour top-off across one or many advances.
- Verify sleeping in Zetsu does not stack to `8R`; it remains `4R`. Zetsu without sleep does not receive the eight-hour completion bonus.
- Verify recovery and drains are still netted before clamping at zero/Maximum Aura; contribution invariants remain `potential = used + discarded`.
- Verify invalid coefficients, NaN activity loads, malformed active-Nen facts, invalid consecutive-sleep state, invalid suppression, and contradictory activity combinations fail before state changes.
- Preserve and extend interval-invariance mutation tests around pool-full, pool-empty, upkeep shutdown, collapse, activity changes, forced suppression, and sleep completion boundaries.
- Architecture tests must fail when Aura imports `chu.ts`, when a second character/Nen file imports `chu.ts`, when Aura restates `0.20`, or when the generic runtime branches on a principle id.

**Acceptance criteria:**

- `deriveAuraRegeneration`/the resolved profile exposes one revised `R` equal to half the prior rounded capacity, with no competing producer.
- Every row in Section 4.3 passes through the real interval solver and the real character-time integration path.
- Fully open leakage is byte-for-byte equivalent in formula to `O/minute` and is not doubled.
- Half-open leakage and physical consumption stack exactly where specified.
- No direct physical action or ability deducts Aura merely for being physical; continuous activity does.
- No exported or internal live path still prices physical Aura through Maximum Aura, action load, or Stamina.
- Active Nen stops natural regeneration without making Ten cost regeneration and without principle-id branching in the generic runtime.
- Zetsu recovery is activity-dependent and not mastery-dependent; forced collapse is `3R`.
- An in-interval collapse immediately changes subsequent rates without requiring the caller to rerun elapsed time.
- Eight continuous hours of sleep top off Current Aura exactly once and remain subdivision-invariant across committed advances and projections.
- `chu.ts` is the sole owner of pseudo-Chū’s `0.20` rule; Aura remains principle-neutral and contains no duplicate pseudo-Chū coefficient.
- Pseudo-Chū still produces uniform whole-body internal density from all Current Aura at 20% effectiveness, uses no Output, and has no reinforcement deduction.
- Ten’s existing coating tests remain green without changing Ten arithmetic.
- Engine focused suites, full engine tests, and engine typecheck pass. Any monorepo failures match the recorded unrelated baseline.
- Final diff contains no compatibility aliases, skipped tests, `.only`, unresolved TODOs, accidental Workbench changes, or unrelated refactors.

## 9. Integration and final verification

Run this sequence from the repository root, adapting only the focused file list if the test runner requires it:

```bash
git status --short
git diff --check

npm test -w @nenworld/engine -- \
  src/__tests__/aura-recovery.test.ts \
  src/__tests__/aura-time.test.ts \
  src/__tests__/aura-interval-invariance.test.ts \
  src/__tests__/aura-expenditure.test.ts \
  src/__tests__/aura-access.test.ts \
  src/__tests__/aura-profile.test.ts \
  src/__tests__/body-endurance.test.ts \
  src/__tests__/character-time.test.ts \
  src/__tests__/nen-ten.test.ts \
  src/__tests__/nen-aura-runtime-integration.test.ts \
  src/__tests__/architecture.test.ts

npm run typecheck -w @nenworld/engine
npm test
npm run typecheck

git diff --check
git status --short
git diff --stat
git diff
```

Requirements:

1. Record pre-edit engine test/typecheck and monorepo typecheck baselines. Report unrelated failures separately.
2. Run focused suites before the full engine suite. Run the full suite once after integration and review fixes.
3. Mutation-check the rate matrix’s distinguishing rows, the halving-after-rounding rule, stacked drains, unchanged `60O`, active-Nen zero recovery, Zetsu mastery independence, sleep boundary, post-collapse boundary, old physical API removal, and each new architecture guard.
4. Search for stale formulas and claims after tests pass: `0.001`, `PHYSICAL_AURA_COST_COEFFICIENT`, old Stamina-cost functions, `ordinary-waking: 0`, `intentional-rest: 0.5`, `sleep: 1`, Zetsu `5x`, duplicate `0.20`, and per-action `kind: "physical"`.
5. Confirm no `.only`, skipped tests, placeholders, unresolved TODOs, compatibility aliases, or dead exports.
6. Inspect the final diff rather than relying on passing tests. Verify every new public input has a real caller and every removed export has no caller.
7. Confirm the input Character, Aura, wakefulness, temporal, and runtime objects remain immutable on success and refusal.
8. Confirm projections equal committed advancement at the same timestamp, including sleep progress and the completion top-off.
9. Confirm unrelated files, especially `apps/workbench`, were not changed.
10. Commit only after every engine exit gate passes. Do not push unless explicitly authorized.

## 10. Completion-report format

The executing agent must finish with this exact report structure:

1. **Commit and branch** — commit hash and branch name.
2. **Ticket summary** — ARC-1 outcome and the final behavior implemented.
3. **Intentional deviations** — any departure from this plan, with evidence and reason.
4. **Files changed** — grouped by production, tests, and documentation/architecture.
5. **Verification** — focused tests, engine full suite, engine typecheck, monorepo typecheck, mutation checks, and exact counts.
6. **Baseline comparison** — before/after results, with pre-existing failures separated.
7. **Bugs found during implementation** — newly discovered defects and whether fixed or deferred.
8. **Remaining risks and deferred work** — including full awakened Chū, later principle activation, and any explicitly unresolved host integration.
9. **Working tree** — clean or list remaining paths and why.
10. **Push status** — pushed or not pushed. Never imply a push occurred without confirmation.

Report uncertainty honestly. Do not call the ticket complete while an acceptance criterion or engine exit gate is failing.
