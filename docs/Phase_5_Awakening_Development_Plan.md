# Stage IV — Phase 5: Awakening Mechanics

## AI coding execution plan

Use this document as the complete implementation prompt for Phase 5. Execute the phase autonomously in the repository. Follow repository instructions and established architecture before this document. Do not stop between tickets unless blocked by a genuine design contradiction, missing required system, unsafe repository state, or failed gate that cannot be repaired within Phase 5.

## Mission

Implement Nen awakening as a validated, atomic domain/runtime transition. Keep these concepts independent:

1. Aura possession and reserve.
2. Current awakening condition.
3. Aura-node state.
4. Awakening history and provenance.
5. Nen mastery and whether it is currently usable.
6. Nen Type and whether the character knows it.
7. Temporary forced runtime states.

Aura exists before awakening. Ordinary unawakened sentient characters have half-open nodes and passive pseudo-Chū equal to 20% of available/current Aura. Awakening ends pseudo-Chū permanently; it does not return during Zetsu or after reversion.

## Non-goals

Do not implement active Ten, Ren, voluntary Zetsu, Chū, principle switching/upkeep, mastery-scaled containment, Zetsu regeneration, reinforcement values, combat mitigation, Body injury selection, or SP-to-BP damage conversion. Phase 5 may create only the forced-Zetsu state and release guard required by awakening. Phase 6 owns general principle runtime.

## Required execution behavior

### Preflight

Before editing:

1. Read all repository instructions, package scripts, architecture rules, and the relevant existing tests.
2. Record the current branch, dirty files, typecheck result, test total, architecture-test result, and existing warnings. Preserve all unrelated user changes.
3. Locate existing implementations for Aura reserve/output/timeline, pseudo-Chū, Nen Type/mastery, requirements, runtime ownership, atomic settlement, RNG/dice, results/errors/events/consequences, content registration, serialization, and architecture tests.
4. Reuse existing conventions. Do not create a parallel clock, event framework, requirement system, owner type, or result type.
5. Produce a short internal repository map naming the actual files and symbols each ticket will use. This map supersedes guessed paths; this plan intentionally specifies responsibilities rather than fictional filenames.

### Decision policy

- Prefer existing engine conventions over new abstractions.
- Do not invent unstated game mechanics. If a required decision is genuinely absent, isolate it behind a typed/configurable contract and report it.
- Validate before mutation and settle each transition atomically.
- Return structured errors through existing engine patterns; do not mix thrown domain errors with returned errors.
- Preserve original state on every rejected or failed transition.
- Use deterministic/injected RNG. Pure probability functions must never roll internally.
- Never weaken global mastery, Zetsu, ability, or content rules to support one awakening exception.
- In the case where input is necessary, stop and consult the user.

## Multi-agent protocol

Use subagents only for bounded work with non-overlapping ownership. The primary agent owns coordination, shared contracts, integration, and the final report. If subagents are unavailable, execute the same waves sequentially.

### Model routing

Use the cheapest model/effort that can safely own the task. Do not use a strong model for mechanical searches or test execution merely to occupy capacity.

| Capability | Assignments |
| --- | --- |
| Sonnet Low | Repository/file mapping, symbol searches, test execution, export checks, baseline comparison |
| Sonnet Medium | Pure formulas, table-driven tests, fixtures, serialization cases, localized validators |
| Sonnet High | Aura timeline integration, leakage settlement, collapse recovery, contained localized implementation |
| Opus Low | Focused read-only review, invariant/provenance audit, localized repairs under frozen contracts |
| Opus Medium | Atomic awakening transitions, reversion/reawakening, cross-domain settlement |
| Opus High | Shared domain architecture, exceptional override design, ambiguity resolution, final integration |

Use low effort for discovery and command execution, medium effort for pure/localized implementation, and high effort for shared contracts, atomic state transitions, exceptional rules, and integration.

### Spawn plan

Do not spawn all agents at once. Use these waves:

| Wave | Concurrent assignments | Barrier |
| --- | --- | --- |
| 0 | Read-only repository scout; Aura/runtime scout; Nen/content/validation scout | Primary consolidates one repository map |
| 1 | 5.1 primary; isolated calculation/test helper; read-only API reviewer | 5.1 public contracts and exports pass tests |
| 2 | 5.2 writer and 5.3 writer; optional isolated test helper | 5.2 and 5.3 settle without duplicate vocabulary |
| 3 | 5.4 writer and 5.5 writer; optional read-only provenance/timeline reviewer | Both tickets pass focused tests |
| 4 | One 5.6 integration owner; other agents audit or run tests read-only | Full exit gate passes |

Recommended models: Wave 0 uses Sonnet Low, Sonnet High, and Opus Low; Wave 1 uses Opus High plus Sonnet Medium; Wave 2 uses Opus Medium for 5.2 and Opus High for 5.3; Wave 3 uses Sonnet High for 5.4 and Opus Medium for 5.5; Wave 4 uses Opus High as integration owner.

### Ownership rules

- One writer owns each file at a time. The primary assigns actual files after preflight.
- Only the 5.1 owner may establish or change shared awakening/node/history/provenance discriminants and public exports during Wave 1.
- Later agents import those frozen contracts; they must not duplicate or redesign them.
- Test helpers may edit only isolated test/fixture files explicitly assigned to them.
- Review agents begin read-only. They report defects to the ticket owner or integration owner; they edit only if ownership is explicitly transferred.
- Do not run simultaneous formatting or broad mechanical rewrites.
- Reuse an existing subagent for follow-up work when it already has the necessary context.

### Subagent prompt contract

Give each subagent only its ticket, repository map entries, allowed files/modules, required public contracts, relevant tests, and this return format:

```text
Return only:
1. Files inspected.
2. Files changed.
3. Contracts added or changed.
4. Tests added and exact command results.
5. Risks, blockers, or deviations.

Do not paste complete files or full test logs.
Do not edit outside assigned ownership.
```

### Token discipline

- Search for symbols before opening files; read the smallest relevant ranges.
- Read the full repository instruction files, but do not repeatedly reread this plan or the original Phase 5 handoff.
- Share the Wave 0 repository map instead of making every agent rediscover the same architecture.
- Pass ticket-specific context, not the entire phase, to implementation agents.
- Refer to frozen 5.1 contracts by symbol/file rather than restating them.
- Keep agent handoffs factual and short. Preserve exact test totals and diagnostics; omit routine logs.
- Use focused tests during tickets and the full suite only at integration points or when repository rules require it.

---

## Canonical rules

### Standard eligibility

Standard awakening and standard reawakening require:

```text
CON >= 13
VIT >= 13
PER >= 13
WIS >= 13
SPI >= 16
```

Abrupt awakening has no minimum Attribute thresholds. Instinctive awakening requires SPI >= 20 plus explicit authorization. Exceptional awakening follows its source-defined requirements.

### Awakening methods

- **Standard:** gradual/safe; opens nodes; marks awakened/history; ends pseudo-Chū; grants Ten Mastery I through the existing mastery path; finishes stable and non-leaking. This does not create an active Ten runtime instance.
- **Abrupt:** requires a capable external actor/source and a success roll; ignores standard thresholds; grants no Ten; success opens nodes and starts uncontrolled leakage; failure leaves awakening/node/mastery state unchanged and emits severe or fatal trauma consequences.
- **Instinctive:** rare GM/content/world-authorized transition; never an automatic rarity roll; requires SPI >= 20 and a validated natural Nen Ability; applies forced Zetsu; grants no ordinary mastery; only the originating ability may function through that forced Zetsu.
- **Exceptional:** content-defined transition with explicit, field-scoped overrides. It may replace eligibility, force/change Nen Type, prohibit natural ability development, require an item/status/transformation/external mastery, emit side effects, or alter later progression. Unmentioned rules remain normal. Do not hard-code franchise examples.

### Abrupt success

```text
odds = 1.5
  * 1.25^(CON - 13)
  * 1.25^(VIT - 13)
  * 1.25^(PER - 13)
  * 1.25^(WIS - 13)
  * 1.75^(SPI - 16)

successProbability = clamp(odds / (1 + odds), 0.01, 0.99)
```

At exact standard thresholds, success is 60%. Apply a reawakening odds multiplier, when relevant, before converting/clamping the final probability.

### Abrupt failure severity

```text
danger =
  2 * max(0, 13 - CON)
  + 2 * max(0, 13 - VIT)
  + max(0, 13 - PER)
  + max(0, 13 - WIS)
  + 1.5 * max(0, 16 - SPI)
```

| Danger | Death chance after failed attempt |
| --- | ---: |
| 0 | 0% |
| (0, 2] | 5% |
| (2, 4] | 15% |
| (4, 6] | 30% |
| (6, 8] | 50% |
| (8, 10] | 70% |
| >10 | 85% |

Success and failure severity are separate recorded resolutions. Resolve death/trauma only after the success roll fails. At or above all thresholds, failure can still emit severe trauma but cannot be fatal. Phase 5 emits typed trauma/fatal-trauma consequences; Body chooses actual injuries later.

### Fresh-awakener leakage and collapse

An awakened owner with fully open nodes and no usable containment leaks through the existing Aura timeline:

```text
leakage/minute = Physical Output Limit
leakage/second = Physical Output Limit / 60
leakage/2-second round = Physical Output Limit / 30
```

Clamp at Current Aura and preserve interval invariance. At 0 Aura: stop leakage, apply unconsciousness, and create an eight-hour qualifying-sleep recovery requirement. Existing sleep recovery may operate during that period; after eight accumulated host-confirmed qualifying sleep hours, set Current Aura to Maximum Aura, wake the owner, and apply collapse-origin forced Zetsu. Interruption pauses rather than resets progress unless an existing canonical sleep/status rule says otherwise. Do not heal awakening trauma.

Releasing collapse-origin forced Zetsu without usable Ten reopens the system and restarts leakage. With usable Ten, release does not restart the trap. Forced Zetsu does not grant Zetsu mastery, and pseudo-Chū remains unavailable because the owner is awakened.

### Reversion and reawakening

Reversion is exceptional, not ordinary unawakening. It sets current awakening to reverted/previously awakened, returns nodes to half-open, disables normal Nen access, preserves awakening history and all ordinary Nen principle mastery, and removes only the natural Nen Ability identified by provenance. External abilities remain unless the source explicitly targets them. A source may explicitly change Nen Type and must record old type, new type, and cause.

Reawakening restores access to retained mastery without relearning, duplicating, or resetting it. Standard reawakening keeps the standard thresholds. Abrupt reawakening keeps abrupt awakening's no-minimum-threshold rule. Exceptional reawakening applies only explicit source overrides. Instinctive awakening is not a generic reawakening route.

| Hurdle | Standard-time multiplier | Abrupt-odds multiplier |
| --- | ---: | ---: |
| Ideal | 0.10 | 2.00 |
| Minor | 0.25 | 1.75 |
| Moderate | 0.50 | 1.50 |
| Severe | 1.00 | 1.25 |
| Critical | 2.00 | 1.00 |
| Catastrophic | 4.00 | 0.50 |

The universal standard-awakening duration is intentionally undefined. Accept a validated base duration from the existing training/content workflow and apply the multiplier. Catastrophic reawakening may also require an explicit recovery prerequisite. At exact thresholds, ideal abrupt reawakening produces odds `1.5 * 2 = 3`, or 75% success.

---

## Ticket 5.1 — Domain foundation and pure rules

### Implement

- Distinct validated types for current awakening condition, node state, awakening method, history/provenance, reawakening hurdle, and exceptional overrides.
- Owner-scoped forced-state representation separate from awakening and mastery.
- Nen Type independent of awakening, with knowledge tracked separately if not already modeled.
- Typed transition requests/results for all Phase 5 routes.
- Structured standard eligibility using existing `satisfied | unsatisfied | unresolved` requirements.
- Pure abrupt success, Danger Score/death table, duration multiplier, and abrupt-reawakening odds functions.
- Serialization and structural/domain validation for all new values.
- Migration of existing awakening boolean reads/writes to the new model; retain compatibility only if repository policy requires a deliberate adapter.

### Gate

- Threshold abrupt success is exactly 60%; threshold Danger is 0.
- Final probability clamps to 1–99%.
- Every danger boundary is tested on and immediately across the boundary.
- Calculators are deterministic, pure, and combat-independent.
- Malformed owners, discriminants, numbers, durations, sources, and overrides return structured errors without throwing.
- Public contracts/exports are frozen before Wave 2.

---

## Ticket 5.2 — Standard and abrupt transitions

### Implement

- Standard workflow: validate eligibility/training completion; atomically open nodes, mark history, end pseudo-Chū, and acquire Ten I through the existing mastery path; finish stable/non-leaking without active Ten runtime.
- Do not duplicate or downgrade an already-valid Ten mastery grant.
- Abrupt workflow: validate external actor/source capability through existing requirements; preserve `unresolved`; use injected RNG and recorded rolls.
- Abrupt success: awaken/open nodes, mark history, end pseudo-Chū, grant no Ten, and start leakage.
- Abrupt failure: retain original awakening/node/mastery/pseudo-Chū state; resolve separate death/trauma roll and emit the correct typed consequence.
- Expose inputs, probability, rolls, source, method, eligibility bypass, and consequences through existing trace/reveal rules.

### Gate

- Every rejected path preserves original state.
- Standard completion commits awakening and Ten I together and creates no active principle runtime.
- Abrupt awakening works below thresholds with a valid source.
- Abrupt success leaks immediately and grants no mastery.
- Abrupt failure never opens nodes or ends pseudo-Chū.
- Fixed-RNG tests cover success, nonfatal failure, fatal failure, 1%/99% clamps, invalid source, and unresolved capability.

---

## Ticket 5.3 — Instinctive and exceptional transitions

### Implement

- Instinctive request requires SPI >= 20, explicit authorization, and a validated natural Nen Ability in one atomic transaction.
- Success awakens/opens nodes, ends pseudo-Chū, grants no ordinary mastery, applies instinctive forced Zetsu, and grants only that ability an origin-bound forced-Zetsu exception.
- Generic exceptional source contract using existing content requirements/provenance and explicit field-scoped overrides.
- Record source and applied overrides in history/results.

### Gate

- SPI 19 fails even when authorized; SPI 20 alone never auto-awakens.
- Instinctive awakening cannot commit without its ability.
- No global ability-through-Zetsu exception exists.
- Exceptional eligibility override does not implicitly grant Ten, alter Nen Type, or bypass unrelated mastery.
- Contradictory/malformed overrides fail before mutation and provenance survives serialization.

---

## Ticket 5.4 — Leakage, collapse, and forced recovery

### Implement

- Integrate leakage with the existing owner-scoped Aura time/settlement path; do not create another clock.
- Clamp depletion, preserve interval invariance, and emit one collapse exactly when Current Aura reaches 0.
- Apply unconsciousness, stop leakage, and track eight accumulated hours of qualifying sleep.
- Complete recovery by restoring Maximum Aura, waking, and applying collapse-origin forced Zetsu once.
- Add only the narrow release transition/guard required to restart leakage without usable Ten.

### Gate

- One 60-second advance equals sixty 1-second advances under existing rounding policy.
- The threshold example using existing derived values is approximately 100 Aura, 20 Aura/minute, and five minutes to depletion.
- Aura never becomes negative; collapse/recovery events cannot duplicate.
- Fewer than eight qualifying sleep hours cannot complete special recovery.
- Recovery does not heal Body trauma or grant Zetsu mastery.

---

## Ticket 5.5 — Reversion and reawakening

### Implement

- Validated exceptional reversion to reverted/half-open/no-normal-access state.
- Preserve history and all ordinary principle mastery; stop awakening-owned leakage/forced states.
- Remove only the provenance-linked natural Nen Ability.
- Support explicit, recorded Nen Type changes.
- Apply hurdle multipliers to supplied standard-training duration and abrupt success odds.
- Restore retained mastery usability on successful reawakening without changing mastery levels.

### Gate

- Reversion cannot delete unrelated/external abilities or ordinary mastery.
- Ideal standard reawakening is exactly 10% of the supplied base duration.
- Ideal threshold abrupt reawakening is 75%.
- A reverted owner below thresholds cannot use standard reawakening but may use valid abrupt/exceptional routes.
- Failed reawakening preserves reverted state.

---

## Ticket 5.6 — Integration and hardening

### Implement

- Route all awakening/reversion mutations through validated transition APIs; validate hostile persisted state at construction/deserialization boundaries.
- Normalize outputs into existing result/error/event/consequence patterns.
- Cover logical signals for awakening, nodes opened/reverted, pseudo-Chū ended, leakage started/stopped, trauma/fatal trauma, collapse, forced Zetsu applied/released, natural ability lost, Nen Type changed, and reawakening completed.
- Test ownership isolation, atomicity, event order, serialization, malformed inputs, original-state preservation, and every valid transition.
- Add architecture checks proving no combat dependency, duplicate clock/Aura settlement, Nen-only event framework, Body injury selection, or Phase 6 active-principle imports.
- Remove obsolete direct awakening mutation routes and update all consumers.

### Required invariants

- Pseudo-Chū exists only while currently unawakened.
- Awakened without Ten is valid.
- Reverted with retained mastery is valid.
- Forced Zetsu never implies Zetsu mastery.
- Instinctive ability-through-Zetsu requires matching ability/origin/forced-state provenance.
- Ordinary first-time unawakened with acquired Nen mastery is invalid unless a precise exceptional rule permits it.
- Exceptional overrides never silently bypass unrelated mastery rules.

### Exit gate

- Focused and full tests pass.
- Typecheck passes.
- Architecture tests pass.
- No focused/skipped tests or new baseline warnings.
- Every failed/rejected transition is atomic and owner-isolated.
- No Phase 6, Body injury, or combat-damage behavior was introduced.

## Required transition matrix

| Start | Request/trigger | Result |
| --- | --- | --- |
| Unawakened | Standard | Awakened, open, Ten I, stable, no pseudo-Chū |
| Unawakened | Abrupt success | Awakened, open, no Ten grant, leaking |
| Unawakened | Abrupt failure | Unchanged awakening state; trauma/fatal-trauma consequence |
| Unawakened | Instinctive | Awakened, forced Zetsu, origin-bound ability exception |
| Unawakened | Exceptional | Only explicitly source-defined overrides |
| Awakened | Reversion | Reverted, half-open, mastery retained, natural ability lost |
| Reverted | Standard reawakening | Awakened after thresholds and adjusted duration |
| Reverted | Abrupt reawakening | Abrupt resolution with hurdle odds modifier |
| Reverted | Exceptional reawakening | Only explicitly source-defined overrides |
| Leaking awakened | Aura reaches 0 | Unconscious, leakage stopped, recovery created |
| Collapsed | Recovery completes | Aura full, awake, collapse-origin forced Zetsu |
| Forced Zetsu without usable Ten | Release | Forced state ends; leakage restarts |

## Final completion report

Return one concise report containing:

1. Outcome and any intentional deviations.
2. Tickets completed and the important contracts established.
3. Files changed, grouped by responsibility rather than pasted diffs.
4. Focused tests, full tests, typecheck, and architecture-test commands with exact totals/results.
5. Baseline warnings compared with final warnings.
6. Remaining risks or deferred Phase 6/Body/combat work.
7. Commit hashes only if commits were authorized and created; never push unless explicitly authorized.

Do not claim completion if any exit gate fails. Repair in scope when safe; otherwise report the exact blocker and preserve the repository state.
