# Pre-Nen Aura Foundation — AI Execution Plan

## 1. Objective

Complete the principle-neutral Aura and active-Nen foundation so the engine can validate, prioritize, fund, commit, distribute, maintain, suppress, interrupt, and explain Aura activity through one deterministic pipeline. The result must enforce one shared simultaneous Physiological Output ceiling and one Current Aura reserve, preserve requested and resolved values plus provenance, and expose typed projections for later systems without implementing individual Nen principles, reinforcement, defense, or damage.

## 2. Verified starting point

Audit baseline: `main` at `bba8835d1086331f2834e8d30e06f9e299bb8023`, tracking `origin/main`, with a clean tree. `npm test` passes 120 engine test files/4,817 tests, and `npm run typecheck -w @nenworld/engine` passes. The full `npm run typecheck` has 65 pre-existing Workbench errors involving stale engine exports, `surfaceUnits`, abbreviated Attributes, and obsolete character/catalog fields. This phase is engine-only; report that baseline separately rather than treating the monorepo as green.

Verified foundations to preserve:

- `character/foundation/aura/output.ts` contains the settled CON-based Output formula and caps usable Output by access and Current Aura.
- `pool.ts`, `control.ts`, `recovery.ts`, `leakage.ts`, `upkeep.ts`, `time.ts`, and `timeline.ts` already provide reserve, DEX-based expenditure efficiency, recovery, uncontained leakage, upkeep, authoritative elapsed time, partial-interval exhaustion, and interval invariance.
- `state.ts`, `distribution.ts`, and `density.ts` already separate stored allocations from resolved per-part Aura and correctly use Body volume for internal density and surface area for surface density.
- `budget.ts`, `resolution.ts`, and `transitions.ts` share a budget/reconciliation path.
- `runtime/coordinator.ts` already provides immutable owner-keyed transaction drafts, cumulative cost preparation, atomic structural refusal, simultaneous effect batches, and owner isolation.
- Phase 5 separates awakening, node state, mastery, seals, history, forced/involuntary suppression, and collapse recovery. `NenState` intentionally has no active-principle state.
- Targeting already owns `self`, `entity`, `body-part`, `anatomical-point`, `object`, `position`, and `area`; Spatial owns metre-based positions and sphere/cylinder/cone/line/box geometry. The existing requirement system distinguishes satisfied, unsatisfied, and unresolved/incomplete.

Confirmed conflicts and omissions:

1. **High — wrong shortage rule.** `budget.ts::proportionallyReduce` and `reconcileAuraAllocations` scale every surviving allocation when Output shrinks; tests in `aura-profile.test.ts` and `aura-transitions.test.ts` pin this. Required behavior preserves higher-priority commitments and affects only the lowest priority necessary. Do not confuse this defect with correct proportional-by-area/volume Body distribution.
2. **High — no gameplay cost priority.** `compareRuntimeRequests` orders costs by metadata, so kind/request identity can determine which cost is funded. Add explicit priority while retaining deterministic ties and simultaneous-effect semantics.
3. **High — partial funding cannot express the settled example.** `AuraCostRequest` forces `allowPartial: false`, and `spendActionAura` rejects insufficient reserve. The engine cannot spend 10 on a priority skill, consume the remaining 4 on a 10-Aura sword attempt, then report either below-minimum failure or a 4-Aura scalable effect.
4. **High — request owners cannot read actual funding during resolution.** `CoordinatedOperation.resolve` receives dice and post-cost states, not prepared cost outcomes, encouraging forbidden recomputation.
5. **High — no generic active-Nen runtime exists.** Phase 5 explicitly deferred active principles; no state owns activation, adjustment, cancellation, suppression, sealing, interruption, replacement, or collapse.
6. **Medium — allocation contracts are incomplete.** Stored allocations lack complete provenance, priority, shortfall behavior, differential authorization, lifecycle linkage, and requested-versus-resolved information. Distribution lacks item surfaces, projected measures, and multi-target/differential contracts.
7. **Medium — no canonical ledger spans commitment, expenditure, useful Aura, Control delta, leakage, failure loss, and unmet demand.**
8. **Architecture conflict — legacy principle implementations already exist.** `foundation/nen/principles/{ten,ren,zetsu,hatsu}.ts` contain principle-specific rules but are not publicly exported and are not imported by production Aura; two Aura tests import a Zetsu helper. Treat these files as legacy/non-authoritative. Do not expand, export, redesign, or delete them. If integration requires choosing between them and this plan, stop and ask the user.

## 3. Scope boundaries

Implement canonical Aura resource contracts, aggregate Output commitments, explicit priority, full/consume-and-fail/scalable funding, requested-versus-resolved state, a shared ledger, target-aware physical/projected distribution, authorization-gated differential allocation, a generic active-Nen lifecycle, time/upkeep integration, provenance, validation, traces, exports, and compatibility handling at real persistence boundaries.

Do not implement or rebalance any individual Nen principle; Mastery I–X values; principle-specific gates, costs, durations, compatibility pairs, or intensity curves; reinforcement; SP-to-BP conversion; physical force, momentum, energy, velocity, pressure, contact type, weapons/projectiles, armor, penetration, injuries, or Combat sequencing.

Do not redesign the Pool/Output/Control/recovery formulas, two-second Round, Body measurements, Target/Spatial vocabulary, requirements, `EngineResult`, trace conventions, owner-keyed transaction protocol, Phase 5 awakening, mastery, or Body ownership of injuries. Do not create a second clock, reserve, target union, geometry model, requirement evaluator, trace format, or universal gameplay resolver.

Prefer additive stored-state compatibility. Locate the actual load/save path before adding migration code. If no versioned character loader exists and old state exists only in fixtures, use validated defaults rather than a dead migration API. If real localized allocations lack provenance needed to prove differential authorization, stop and ask for migration policy; never manufacture authorization or silently discard data.

Make narrow technical decisions using established repository patterns. Stop and ask only when a new choice changes gameplay, settled formulas, legacy-data meaning, persistence, or cross-domain ownership. Do not interrupt the user for helper names, formatting, or local refactors, and do not make major decisions arbitrarily.

## 4. Source-of-truth contracts

### 4.1 Ownership and state

```text
Awakening + permanent mastery
        ↓
Principle-neutral active Nen runtime
        ↓
Requested Aura configuration
        ↓
Aura access + priority funding + commitment + distribution
        ↓
Resolved Aura state/ledger
        ↓
Later reinforcement, senses, items, and combat projections
```

Permanent mastery is never current activation; forced Zetsu-like suppression never grants mastery. Aura owns Current Aura, commitments, expenditure, leakage, and resolved placement. Active Nen owns lifecycle intent/cause. Body owns anatomy, measurements, and injuries. Spatial owns geometry; the host owns occupancy and measurements the engine cannot derive. Generic `runtime/` remains gameplay-free.

### 4.2 Resource vocabulary and formulas

| Term | Semantics |
| --- | --- |
| Maximum Aura | CON+VIT-derived total reserve |
| Current Aura | Stored remaining reserve |
| Physiological Output | CON-derived instantaneous manipulation ceiling; not a rate |
| Accessible Output | Portion currently reachable through access rules |
| Usable Output | `min(Current Aura, Accessible Output)` |
| Output commitment | Aura occupying shared capacity while active; not reserve expenditure by itself |
| Reserve expenditure | Aura removed from Current Aura |
| Upkeep/leakage | Aura/time inputs resolved into elapsed-interval amounts; deliberate/involuntary respectively |
| Control delta | Extra waste or savings on deliberate expenditure; never effect strength |
| Unmet demand | Requested Aura not funded or committed |
| Distribution/density | Where committed Aura exists; Aura per litre or square metre when physically resolved |

```text
n = (CON - 10) / 5
M(CON) = 50^n * 2^[n(n - 1) / 2]
O_phys = roundToOneSignificantFigure(2 * M(CON))

sum(active automatic + deliberate commitments)
  <= usable Output
  <= accessible Output
  <= physiological Output
```

Reference outputs must remain CON 10→2, 15→100, 20→10,000, 25→2,000,000, 30→800,000,000. A 200-Output character maintaining 200 in Ten has no free Output for another 20-Aura manipulation; they must redistribute to 180+20.

### 4.3 Priority and shortfall

Higher numeric priority resolves first. Equal priorities use a documented stable identifier tie-break, never caller array order. Priority affects same-owner costs and commitments, not simultaneous effect-batch calculation.

```ts
type AuraShortfallPolicy =
  | { readonly kind: "require-full" }
  | { readonly kind: "consume-and-fail"; readonly minimum: number }
  | { readonly kind: "scale"; readonly minimum?: number };
```

Equivalent repository-native shapes are allowed, but all three semantics are required. Validate all structures/owners first; order valid demands; derive authoritative cost; fund against the running draft; deduct the funded reserve amount; record requested/funded/unmet/status; then let the requesting mechanic resolve from those outcomes. Malformed input remains an atomic `EngineResult` failure. Legal shortfall is an outcome, not a structural error.

For Current Aura 14 and priority-ordered 10-Aura skill then 10-Aura sword: fund 10 then 4 and leave 0. Under `consume-and-fail` with minimum 10, the sword fails but 4 remains spent. Under `scale`, it produces a 4-Aura effect. A `require-full` request retains explicit atomic refusal semantics.

When an existing Output budget shrinks, preserve higher priorities first. Give only the remaining capacity to the lowest affected scalable commitment; deactivate/remove an indivisible one according to lifecycle policy. Decommitting Output alone never spends Current Aura. Preserve proportional area/volume expansion for equal density.

Expose immutable cost outcomes to `CoordinatedOperation.resolve` without giving the coordinator Aura knowledge. Preserve existing callbacks where TypeScript permits or migrate callers mechanically.

### 4.4 Requested/resolved ledger

Preserve the actor's request and engine result. A resolved entry must identify owner, request, source/provenance, target/configuration, priority, requested Aura, accessible capacity, funded/committed Aura, reserve expenditure, Control delta, useful Aura when Aura can know it, unmet demand, status, and trace/event linkage. Downstream systems consume resolved values only; Aura must not guess effect strength owned by another domain.

### 4.5 Distribution

Target answers what is affected; distribution answers how Aura is arranged. Reuse `TargetRef`, `SpatialPosition`, and `SpatialArea`.

```text
uniform-body-surface   surfaceAreaCm2 across every eligible present part
uniform-body-internal  volumeL across every eligible present part
item-surface           authoritative item/host physical surface measure
projected-spatial      existing Spatial target plus resolved measure
differential-surface   explicit authorization required
differential-internal  explicit authorization required
```

Uniform means equal density over the complete eligible domain:

```text
partAura = totalAura * (partMeasure / totalEligibleMeasure)
```

Uniform requests cannot carry arbitrary part weights or gaps. Differential requests require typed authorization bound to the request/source/owner; generic allocation must refuse unverified weights. Do not implement Gyō/Kō/Ryū/Yū. Derive metric measures only when exact; otherwise require a finite positive host-provided measure with provenance. Do not implement occupancy or En.

### 4.6 Active lifecycle

Active Nen is separate scene/runtime state, not `NenState` mastery and not booleans per principle. Represent stable activity identity, owner, authored-definition reference, provenance, requested configuration, priority, Aura ledger/commitment linkage, lifecycle condition, timestamps, constraints, and stop/resume cause. Use half-open intervals `[startedAt, endedAt)`.

Support activation, adjustment/redistribution, cancellation, elapsed-time advancement, suppression, sealing, interruption, collapse, replacement, and explicitly permitted resume. Separate lifecycle condition from causes/constraints to avoid a combinatorial enum. A stopped activity preserves why, when, and by whom it stopped; restart permission; upkeep termination; and residual consequences. The generic runtime interprets declarations and never branches on principle ids.

Compatibility declarations must express compatible, incompatible, conditional, requires, modifies, composite, suppresses, replaces, sealed-by, and component-loss collapse without populating principle pairings.

### 4.7 Time, Control, validation, and authored definitions

Use the existing elapsed-time solver and half-open intervals. Rates may be authored per round/hour and normalized, but Output remains an amount. One 60-second advance must equal sixty one-second advances unless a real transition boundary intervenes.

Control uses the existing DEX 22 pivot and applies through shared helpers to deliberate reserve expenditure, including activation/upkeep. It never changes Output, commitments, density, effect strength, or involuntary leakage. If a future adjustment has a base cost, it uses the same path; do not invent that cost here.

Distinguish malformed request, unmet prerequisite, rejected activation, partial funding, below-minimum failed activation, suppression, sealing, interruption, voluntary cancellation, and collapse using existing results/events/traces. Equivalent invalid input must not sometimes throw.

Future `foundation/nen/principles/` files declare principle rules and never mutate state. This phase only proves the shared contract can carry all fifteen structural categories; it does not edit legacy implementations or author mechanics.

## 5. Execution strategy

| Wave | Work | Dependency | Concurrency | File ownership | Model |
| --- | --- | --- | --- | --- | --- |
| 0 | Reconfirm baseline/callers/persistence boundary | None | One read-only agent | None | Sonnet — low effort |
| 1 | A1: central funding, priority, ledger contracts | Wave 0 | Sequential lead | Runtime request/coordinator + central Aura files | Opus — high effort |
| 2A | A2: target-aware distribution | A1 | Parallel with A3 | Distribution/density/new geometry + isolated tests | Opus — medium effort |
| 2B | A3: generic active lifecycle | A1 | Parallel with A2 | New Nen runtime directories + isolated tests | Opus — high effort |
| 3 | A4: integration, compatibility, final verification | A2+A3 | Sequential lead | Barrels, Character/time boundary, migrations, architecture tests | Opus — high effort |

Maximum useful agents: three including lead; use three only in Wave 2. Critical path: Wave 0 → A1 → A2/A3 → A4. More writers would overlap shared contracts. Without subagents, run A1–A4 sequentially.

## 6. Model assignment

- **Sonnet — low effort:** Wave 0 discovery only.
- **Opus — high effort:** A1 because it changes transaction, priority, persistence-sensitive state, and partial-payment invariants.
- **Opus — medium effort:** A2 because it is bounded but crosses Aura, Body measurements, Targeting, and Spatial.
- **Opus — high effort:** A3 state-machine/time work and A4 cross-domain/adversarial integration.
- Use Sonnet medium/high only for isolated fixture or small implementation work explicitly delegated by the lead. Do not give shared contracts or migrations to a low-effort model.

## 7. Subagent orchestration

Spawn R0 before edits: read-only inventory of callers of `reconcileAuraAllocations`, `proportionallyReduce`, `AuraCostRequest`, `allowPartial`, `CoordinatedOperation.resolve`, `AuraAllocation`, active-effect inputs, and persistence paths. Model: Sonnet low. It returns paths/symbols, commands, and blockers; `git status --short` must remain unchanged.

After A1 is committed or checkpointed cleanly, spawn at most two writers:

- **D1 / A2:** owns only `aura/distribution.ts`, `density.ts`, approved new geometry/distribution helpers, and one isolated new distribution test. It must not edit shared types/state/barrels, Targeting, Spatial, Body, Items, fixtures, or principles. Model: Opus medium. Verify from `packages/engine` with `npx vitest run src/__tests__/aura-allocation.test.ts src/__tests__/aura-distribution-contract.test.ts`.
- **N1 / A3:** owns only new files under `character/foundation/nen/runtime/`, `character/nen/runtime/`, and one isolated lifecycle test. It must not edit barrels, Character/time, awakening, Aura central files, or principles. Model: Opus high. Verify with `npx vitest run src/__tests__/nen-active-runtime.test.ts src/__tests__/nen-suppression.test.ts`.

Give each subagent only its ticket, Section 4 contracts, frozen A1 types, owned paths, and focused command. Each returns only: changes/findings; files changed; focused tests; risks/blockers. The lead owns A1, shared types/barrels, conflicts, integration, persistence decisions, full verification, commit, and report.

## 8. Implementation tickets

### Ticket A1 — Establish canonical funding, commitment, and priority settlement

**Goal:** Enforce aggregate Output, gameplay priority, all three shortfall policies, authoritative funding outcomes, and a complete Aura ledger without weakening structural atomicity.

**Why:** Current shortage reconciliation is proportional, metadata controls cost order, Aura cannot partially fund, and action resolution cannot read actual payments.

**Depends on:** Wave 0.

**Concurrency:** None.

**Model:** Opus — high effort.

**Agent:** Lead.

**Owned files:** `runtime/{requests,coordinator}.ts`; central `aura/{types,state,budget,expenditure,transitions,runtime,validation,resolution}.ts`; one new `ledger.ts`/`funding.ts` only if needed; related tests/fixtures. Shared for the whole plan.

**Required changes:**

1. First reproduce proportional reduction and metadata-controlled cost order in focused regression tests.
2. Extend existing Aura/runtime types with Section 4 semantics; do not duplicate `AuraOutput`, budgets, results, owners, sources, or traces.
3. Add validated higher-first cost priority with stable equal-priority identity. Leave simultaneous effect batches order-independent.
4. Replace proportional Output-shortage reconciliation with priority settlement. Retain proportional math only where equal-density distribution or recovery overflow genuinely needs it, under a narrow name.
5. Add the three shortfall policies and validate all amounts/minima/priorities/discriminants before mutation.
6. Separate requested, authoritative cost, funded amount, Control delta, commitment, expenditure, and unmet demand. Physical and deliberate action costs remain distinct; commitments do not drain reserve by themselves.
7. Partially fund declared policies from the running owner draft. `consume-and-fail` deducts funded Aura even below minimum; malformed requests still roll the entire operation back.
8. Pass immutable cost outcomes into `CoordinatedOperation.resolve`; migrate callers without exposing gameplay to the coordinator.
9. Keep automatic plus deliberate commitments within usable Output and preserve owner isolation.
10. Update only comments/decision records that encode displaced proportional or never-pay-on-failure behavior. Preserve old state through narrow defaults where safe; defer ambiguous localized-data migration to A4.

**Required tests:**

- Output reference values and 200 ceiling with 200+20 refusal versus 180+20 success.
- Exact 14/10/10 priority example for both consume-and-fail and scalable sword behavior.
- Input permutations and hostile lexical ids cannot change priority results; equal priorities use stable identity.
- Budget shrink preserves high priority and affects only the lowest necessary commitment; restoring proportional reduction fails.
- `require-full` remains explicitly atomic; legal underfunding preserves earlier costs; later malformed input rolls all drafts back.
- Resolver receives funded/unmet/status without recomputing Aura.
- Two owners with different contexts/reserves remain isolated.
- NaN, infinities, negatives, invalid minima/priority/discriminants, duplicate ids, and missing state/context return diagnostics without throws or input mutation.
- Trace/event ledger reports requested, authoritative, funded/committed, expenditure, Control delta, unmet, and status.

**Acceptance criteria:** The above regressions pass; no Output-shortage path scales every allocation; cost funding is explicit-priority-driven; the 14-Aura example is exact; structural refusal remains atomic; focused runtime/Aura tests and engine typecheck pass.

### Ticket A2 — Resolve target-aware physical and projected distributions

**Goal:** Support uniform Body surface/internal, item-surface, projected Spatial, multi-target, and authorized differential distributions while conserving committed Aura and stopping before reinforcement.

**Why:** Existing whole-body density is correct, but generic localized allocation is not authorization-gated and item/projected targets are absent.

**Depends on:** A1.

**Concurrency:** A3 only.

**Model:** Opus — medium effort.

**Agent:** D1.

**Owned files:** `aura/{distribution,density}.ts`, approved new distribution/geometry helpers, isolated new tests. Shared types/barrels and other domains remain lead-owned.

**Required changes:**

1. Consume A1 request/resolved/provenance types and existing Target/Spatial validators.
2. Preserve existing equal-density Body calculations and continuity behavior.
3. Keep target separate from distribution; add Section 4.5 structural categories without principle names.
4. Require request/source/owner-bound authorization for differential weights. Validate finite non-negative weights with a positive total and deterministic normalization.
5. Require authoritative finite positive item/host measures where the engine cannot derive geometry; do not implement occupancy.
6. Conserve funded Aura across parts/targets within existing floating tolerance, preserving requested/resolved transformation and provenance in trace.
7. Treat absent world facts as typed dropped/unresolved results where existing conventions do; malformed geometry/authorization remains failure.

**Required tests:**

- Reference, scaled, transformed, and missing-part bodies retain equal density and Aura conservation.
- Uniform requests cannot supply gaps, localized weights, or excluded parts.
- Missing/forged/wrong-owner/wrong-source differential authorization fails; valid weights normalize deterministically.
- Item/projected/multiple targets preserve context, measures, provenance, and total Aura without duplication.
- Invalid targets, NaN/infinite/non-positive measures, invalid weights, and duplicate ids return diagnostics without mutation or throw.
- Mutants using equal Aura per part or accepting unverified weights fail.

**Acceptance criteria:** Every result identifies target, channel, measure, Aura, density/contribution, and provenance; uniform distributions are complete/equal-density; differential use requires authorization; existing Targeting/Spatial types are reused; focused tests/typecheck pass with no reinforcement or principle branches.

### Ticket A3 — Implement the principle-neutral active Nen lifecycle

**Goal:** Add immutable active-runtime state and transitions for activation, adjustment, maintenance, cancellation, suppression, sealing, interruption, replacement, collapse, and allowed resume without encoding principles.

**Why:** Phase 5 intentionally owns mastery/awakening/suppression but not voluntary active activities or their Aura/time lifecycle.

**Depends on:** A1.

**Concurrency:** A2 only.

**Model:** Opus — high effort.

**Agent:** N1.

**Owned files:** New `character/foundation/nen/runtime/`, `character/nen/runtime/`, and isolated lifecycle tests; no shared barrels/integration files.

**Required changes:**

1. Implement Section 4.6 as scene/runtime state separate from `NenState`; do not add mastery booleans or persist on `Character` here.
2. Reuse Phase 5 suppression, requirements, sources, owners, results, events, and traces. Forced states never grant mastery.
3. Separate lifecycle condition from cause/constraint and validate legal combinations/transitions.
4. Resolve in order: structure → owner/source/current state → supplied prerequisite result → compatibility/constraints → A1 funding outcome → immutable transition → events/consequences/trace.
5. A below-minimum consumed attempt records failure/no activity while preserving expenditure; scalable funding records actual commitment/unmet demand.
6. Preserve stop cause/time/authority, restart permission, upkeep termination, and residual requests. Decommitment alone spends no Aura.
7. Use half-open intervals and deterministic same-time ordering; emit Aura requests rather than mutating Aura.
8. Define generic compatibility/composition declarations only; do not populate a principle matrix.

**Required tests:**

- Full, scalable partial, and consumed-below-minimum activation outcomes.
- Adjustment validates/funds before replacement; refusal preserves prior activity.
- Cancellation, forced suppression, sealing, interruption, replacement, collapse, and resume remain distinguishable.
- Wrong owner/source/authority cannot alter another activity; forced suppression cannot change mastery.
- Access loss stops upkeep/decommits without reserve loss; same-time permutations and interval boundaries are deterministic.
- Hostile discriminants, duplicate ids, illegal transitions, unresolved requirements, and invalid times fail without mutation/throw.
- JSON round-trip preserves discriminants/reasons if state is serializable; boolean-active and mastery-grant mutants fail.

**Acceptance criteria:** Runtime state is independent of mastery and principle ids; every transition returns typed cause, before/after, event/trace, and Aura linkage; invalid transitions preserve inputs; focused lifecycle/suppression tests and engine typecheck pass.

### Ticket A4 — Integrate, migrate, and freeze the foundation

**Goal:** Connect A1–A3 through real public and time-advancement paths, apply safe compatibility handling, enforce architecture, and prove structural coverage for all fifteen principles.

**Why:** Isolated contracts are incomplete unless active activities drive Aura funding, commitments, distributions, and time through authoritative boundaries.

**Depends on:** A1–A3.

**Concurrency:** None.

**Model:** Opus — high effort.

**Agent:** Lead.

**Owned files:** Shared Aura/Nen/runtime barrels, engine `index.ts`, `character/time/*`, necessary Character resolution/integration, verified persistence boundary, shared integration/architecture tests. Legacy principles excluded.

**Required changes:**

1. Review writer diffs for duplicate vocabularies, principle branches, cross-domain mutation, and authorization bypasses before integration.
2. Export stable consumer contracts/entry points only; prove they have real callers.
3. Thread active runtime through the scene/host operation and `advanceCharacterTime`. If host-owned scene state fits existing architecture, return it beside Character rather than embedding it in permanent character data.
4. Extend the one Aura timeline with deterministic commitment, priority, upkeep, leakage, recovery, access-loss, shutdown/collapse, decommitment, events, and traces. Preserve interval invariance.
5. Connect lifecycle funding to A2 distributions and existing requirements; keep unresolved distinct from unsatisfied.
6. At the real persistence boundary, use additive defaults or exact-shape idempotent migration. Never invent authorization/source/mastery/active state; stop for user policy if real ambiguous localized data exists.
7. Keep legacy principle files unchanged/unexported. Remove their test-only dependency only if verified behavior is preserved without designing a principle.
8. Add architecture guards: generic runtime imports no gameplay; Foundation does not import `character/nen`; generic active runtime imports no individual principle; Body does not depend on Aura/Targeting; Aura creates no Body injuries; differential authorization is behaviorally enforced.
9. Add table-driven structural cases for Ten, Ren, Zetsu, Chū, Hatsu, Shū, Gyō, In, Ken, En, Kō, Ryū, Yū, Jū, and Fū using categories only—surface/internal, access change, suppression, item target, projection, concealment placeholder, composite, and differential authorization.
10. Run Section 9 verification, commit once, and do not push.

**Required tests:**

- End-to-end request → priority funding → lifecycle → commitment → distribution → ledger/trace for full, scalable, and consumed-failure cases.
- Aggregate ceiling/reconciliation under reserve/access shrink and two-character owner isolation.
- One large versus many small time advances across exact upkeep/suppression boundaries.
- Suppression/access loss stops activity/upkeep without mastery creation.
- Historical emitted JSON fixtures migrate/load idempotently; hostile data is refused.
- Public barrel smoke test calls real integration entry points.
- Fifteen principle-category cases pass without importing legacy implementations.
- Architecture mutants described above fail.

**Acceptance criteria:** A real public path produces the full resolved ledger/distribution; authoritative time advancement returns updated Aura and active runtime; all fifteen categories fit without principle rules; compatibility is safe or explicitly user-approved; engine tests/typecheck pass; no phase-attributable Workbench regression; excluded systems/files remain untouched.

## 9. Integration and final verification

Run ticket-focused tests first. Then run the integrated focused set from `packages/engine` (adjust only filenames intentionally consolidated into existing suites):

```bash
npx vitest run \
  src/__tests__/runtime-protocol.test.ts \
  src/__tests__/runtime-references.test.ts \
  src/__tests__/aura-expenditure.test.ts \
  src/__tests__/aura-transitions.test.ts \
  src/__tests__/aura-profile.test.ts \
  src/__tests__/aura-allocation.test.ts \
  src/__tests__/aura-time.test.ts \
  src/__tests__/aura-interval-invariance.test.ts \
  src/__tests__/aura-funding-priority.test.ts \
  src/__tests__/aura-distribution-contract.test.ts \
  src/__tests__/nen-active-runtime.test.ts \
  src/__tests__/nen-aura-runtime-integration.test.ts
```

From repository root:

```bash
git diff --check
npm run typecheck -w @nenworld/engine
npm test
npm run typecheck
git status --short
```

The final `npm run typecheck` is a baseline comparison: it currently fails with 65 Workbench errors. Report pre-existing and new failures separately; any new engine failure or phase-attributable Workbench error blocks completion. Run the full engine suite once after integration, not per subagent.

Search for `.only`, skipped/disabled or placeholder tests, unresolved implementation TODOs, and accidental files. Inspect the final diff; confirm unrelated files, Workbench, legacy principles, reinforcement, and damage are untouched. Verify public exports have real callers and migrations use literal historical emitted shapes, not idealized fixtures.

Perform an independent adversarial review of priority ties, aggregate Output arithmetic, partial-payment/failure ordering, rollback boundaries, owner isolation, union validation, hostile JSON, migration idempotence, differential authorization, time ordering, and provenance. Temporarily restore proportional shortage or metadata cost ordering; the regression suite must fail.

After every gate passes, create one commit on the current branch, confirm a clean tree, and do not push without explicit authorization. Passing tests do not override a reproduced semantic defect.

## 10. Completion-report format

```markdown
## Commit
- Branch: `<branch>`
- Commit: `<hash>`
- Pushed: `No` unless explicitly authorized

## Ticket results
### A1 — Funding, commitment, priority
- Implemented:
- Files changed:
- Focused verification:
- Deviations:

### A2 — Distribution
- Implemented:
- Files changed:
- Focused verification:
- Deviations:

### A3 — Active lifecycle
- Implemented:
- Files changed:
- Focused verification:
- Deviations:

### A4 — Integration
- Implemented:
- Files changed:
- Focused verification:
- Deviations:

## Full verification
- `git diff --check`:
- Engine tests: `<files/tests passed>`
- Engine typecheck:
- Monorepo baseline comparison:
- `.only`/skipped/placeholders/TODO audit:
- Public caller/export and final-diff review:
- Adversarial review:

## Bugs found
- `<confirmed defect, reproduction, disposition>`

## Remaining risks and deferred work
- `<risk or deferred principle/reinforcement/damage work>`

## Repository state
- Working tree clean:
- Unrelated files changed:
- Changes pushed:
```

Report uncertainty honestly. If an exit gate fails, the phase is incomplete. For a material gameplay, migration, persistence, or ownership decision, stop and ask with the exact conflict, affected files, options, and recommendation. Resolve trivial implementation details from repository patterns without interrupting the user.
