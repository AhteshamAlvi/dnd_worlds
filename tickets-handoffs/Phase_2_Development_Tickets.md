# Stage II, Phase 2 — Consolidated Development Tickets

## Purpose

Phase 2 creates the neutral action, targeting, Range, spatial, narrative-resolution, and GM-adjudication layer shared by Combat and non-Combat play. It does not make `CombatAction` universal. Skills, Items, improvised attempts, movement, En, projectiles, attacks, healing, status applications, and Aura applications must all be able to describe what is attempted without requiring a Combat encounter.

The final development sequence is:

1. **2A — Neutral action, targeting, Range, and spatial vocabulary**
2. **2B-0 — Dice reconciliation and structured dice failures**
3. **2B-1 — Pure action preparation and `ActionProposal`**
4. **2B-2 — GM adjudication, secret overrides, and visibility**
5. **2B-3 — Consequence settlement and ground-impact end to end**
6. **2B-4 — Combat characterization and neutral-action wrapping**

Each ticket must land independently with `tsc` clean, the full test suite green, architecture tests intact, no focused/skipped/quarantined tests, and an appended decision record. Do not start the next ticket until the current gate passes. Keep the Rulebook and Workbench untouched unless separately authorized.

## Phase-wide decisions

- An `ActionProfile` describes what a capability permits. An `ActionIntent` describes one concrete attempt. An `ActionProposal` is a pure, non-committing preview. A finalized resolution is committed once through the runtime coordinator.
- A Skill never requires a target merely because it is an attack. Target cardinality determines whether zero, one, or many declared targets are legal.
- Keep **declared goal**, **declared targets**, **action focus**, **suggested affected subjects**, and **final affected subjects** distinct.
- A focus may be none, a direction, a position, a path, or an area. Multiple targets are a flat collection, not a recursive `multiple` target.
- Body Parts and Anatomical Points retain Body-owned `BodyPartId` and `CriticalPointId` identities.
- All distance is normalized to metres. Hosts resolve walls, grids, cover, obstruction, occupancy, and complex geometry; the engine decides whether supplied facts satisfy the mechanic.
- Structured Action cost is separate from Aura, Stamina, ammunition, Item, Body, and other mechanical costs.
- Execution duration, delivery travel time, and consequence duration are separate.
- Mechanical, guided-narrative, and free-adjudication resolution are all valid inside or outside Combat.
- The GM may override rule-level results, including dice, requirements, Range, costs, affected subjects, and consequences. Technical integrity constraints remain enforced.
- Secret original dice values must never enter check resolution, public results, public events, public diagnostics, or any publicly reachable trace.
- Unsupported world changes remain typed host-facing consequences; the engine must not claim to have mutated state it does not own.
- Movement continues to use the canonical two-second Round from `time/duration.ts`.

---

# Ticket 2A — Neutral Action, Targeting, Range, and Spatial Vocabulary

## Outcome

Introduce pure, VTT-independent contracts for describing actions and their spatial intent. No action is executed and no state is mutated in this ticket.

## Required work

### Neutral actions

Create a top-level `actions/` domain defining or equivalently representing:

- `ActionProfileId` and `ActionIntentId`.
- Actor identity, separate from mechanical source identity.
- `ActionProfile` and `ActionIntent`.
- Allowed Action/Reaction timing and the current structured or non-structured execution context.
- Structured Action cost.
- Declared goal or purpose as narrative context.
- Target specification and concrete target selection.
- Action focus.
- Execution duration.
- A minimal check-profile reference using the existing `checks/` vocabulary.
- Only the smallest provisional eligibility contract needed by later preparation.

Do not create a second Character requirement system. Character rules continue to own Character requirements; targeting, spatial, timing, and resource domains own their own validity. Do not speculate about the final eligibility-result shape before 2B-1.

### Optional targeting

Support target cardinality with `minimum` and nullable `maximum`. It must express no targets, an optional target, exactly one, one or more, and any number. Validate minimum/maximum consistency and selected-target counts.

Support concrete target references for:

- Self.
- Character or general entity.
- Body Part, carrying its Body owner and exact `BodyPartId`.
- Anatomical Point, carrying its Body owner and exact `CriticalPointId`.
- Object.
- Position.
- Area.

The target list may be empty when the profile permits it. An Aura Punch aimed into empty space or at the ground is valid if its profile permits zero declared targets. A healing capability that requires one recipient must still reject an empty selection.

### Focus and goal

Define a closed focus union covering:

- None.
- Direction.
- Position.
- Path.
- Area placement.

A ground punch may have no declared target, a goal such as “tear up the surrounding ground,” and a position focus. Do not parse the declared goal as authoritative mechanics.

### Spatial and Range vocabulary

Create a top-level `spatial/` domain with composable primitives for:

- Spatial-context identity.
- Metric positions in metres and opaque host-position references.
- Directions.
- Direct and path distance.
- Minimum/maximum distance intervals.
- Melee reach.
- Ordered, non-overlapping Range bands.
- Sphere, cylinder, cone, line, and box areas.
- Paths and path length.
- Line-of-effect, cover, obstruction, and destination-reach facts.
- Instantaneous or speed-based travel.

“One Range model” means shared primitives, not one interface filled with unrelated optional fields. Skills, Items, En, movement, areas, and projectiles compose the same primitives differently.

Hosts may supply resolved geometry and occupancy. The engine must reject incompatible spatial contexts and distinguish missing required facts from mechanically invalid facts. Do not import Foundry scenes, walls, tokens, squares, hexes, grids, canvas types, or host geometry implementations.

### Layering

Establish and enforce:

```text
infrastructure / time / checks / runtime / character foundation
                              ↑
                         spatial / targeting
                              ↑
                            actions
                              ↑
                    later consumers, including Combat
```

Specific constraints:

- `targeting/` may type-import `BodyPartId` and `CriticalPointId`, placing it above Body Foundation.
- Body must never import `targeting/`.
- `actions/` may depend on `targeting/`, `spatial/`, `checks/`, `time/`, `runtime/`, and lower infrastructure contracts.
- Permit the intended `actions/ → runtime/` edge now, even if 2A uses little or none of it, so later action preparation does not appear to erode the boundary.
- `actions/` must not import Combat, Skill catalogs, or Item catalogs.
- `spatial/` must remain independent of Character, Combat, and every VTT/host.

Add architecture tests for these boundaries in this ticket.

## Required tests

- Targetless stance with no focus.
- Targetless Aura Punch into empty space.
- Targetless Aura Punch with a ground-position focus.
- Exactly-one-target healing rejecting zero and two targets.
- Optional-target profile accepting zero or one target.
- Flat multiple-target selections.
- Body Part and Anatomical Point references preserving exact owner and IDs.
- Invalid/missing anatomical owner or ID.
- Range boundaries inclusive at their declared minimum and maximum.
- Below-minimum and above-maximum rejection.
- Different spatial contexts refusing comparison.
- Opaque host positions requiring supplied facts.
- Direct distance and path distance remaining distinct.
- Invalid distances, areas, paths, bands, travel speeds, and durations.
- Movement continuing to consume `SECONDS_PER_COMBAT_ROUND` with unchanged Move-share arithmetic.
- Architecture constraints above.

Use stable machine-readable diagnostics. Invalid data, missing host facts, and ordinary rule failure must remain distinguishable.

## Out of scope

No action execution, GM adjudication, dice override, affected-subject resolution, consequence settlement, damage conversion, healing formula, object durability, terrain destruction, projectile collision, detailed cover modifier, Combat refactor, Foundry integration, or Workbench UI.

## Exit gate

- Neutral profiles and intents can represent Skill, Item, movement, En, projectile, Combat, and non-Combat uses without importing Combat.
- Zero-target actions, declared goals, declared targets, and focus are first-class and separate.
- Body identities are reused rather than recreated.
- One metres-based spatial/Range vocabulary exists and remains host-independent.
- The two-second movement model is unchanged.
- `tsc`, all tests, architecture tests, and repository hygiene gates pass.
- Append decision records covering optional targets, focus versus targets, metres-only space, host-supplied geometry, layering, and provisional eligibility.

---

# Ticket 2B-0 — Dice Reconciliation and Structured Dice Failures

## Outcome

Reconcile runtime dice with check dice before `ActionProposal` depends on either. Support advantage/disadvantage without a third general-purpose dice vocabulary, and remove the existing exception-based empty-roll path.

## Problem

`CheckDiceInput` accepts multiple rolls for advantage/disadvantage. Runtime dice currently treat more than one roll for the same purpose as `runtime.dice.duplicate`. These models have not previously met, and 2B-1 must not build against a shape that 2B-0 immediately replaces.

## Required work

- Choose one explicit runtime representation for multiple rolls belonging to one purpose: preferably a purpose-owned ordered roll collection, or explicit indices if repository constraints make that materially better.
- A runtime die requirement must state enough information to validate the required number of rolls, sides, purpose, and ordering/identity without relying on ambiguous caller array order.
- Preserve the distinction between runtime dice and check dice:
  - Runtime owns operation-level identity and validation.
  - Checks own advantage/disadvantage retention over the effective numeric rolls supplied to one check.
- Define one canonical projection from validated runtime dice to `CheckDiceInput`.
- Do not add `EffectiveDieRoll` or an equivalent third shared die structure.
- Migrate all callers and tests atomically; leave no legacy duplicate policy or transitional parallel API.
- Change `resolveCheckDice` so empty or malformed rolls return `EngineResult` failure with stable diagnostics instead of throwing `RangeError`.
- Ensure no ordinary invalid-dice path remains half-throwing and half-returning.

This ticket does not implement secret overriding. It only establishes the model that 2B-2 will adjudicate.

## Required tests

- One purpose requiring one d20.
- Advantage requiring two d20 rolls for one purpose.
- Disadvantage requiring the appropriate ordered collection.
- Missing, extra, wrongly sided, duplicated-index, or ambiguous rolls failing structurally.
- Canonical projection into `CheckDiceInput`.
- Correct highest/lowest retention and retained-index behavior.
- Empty `CheckDiceInput.rolls` returning failure rather than throwing.
- All affected callers consuming `EngineResult` consistently.
- Deterministic validation independent of unrelated input-array order.

## Out of scope

No GM adjudication, secret roll storage, public/private split, action proposal, consequence settlement, or Combat changes.

## Exit gate

- Advantage/disadvantage is representable through runtime dice without ambiguity.
- Exactly two dice layers remain, with an explicit relationship.
- `resolveCheckDice` uses structured failure for ordinary invalid input.
- All callers are migrated; no transitional API survives.
- `tsc` and all tests pass.
- Append decision records covering multi-roll purpose ownership, runtime-to-check projection, and the throw-to-`EngineResult` migration.

---

# Ticket 2B-1 — Pure Action Preparation and `ActionProposal`

## Outcome

Turn an `ActionIntent` into a pure, non-committing `ActionProposal` under `actions/`. Nothing is spent, applied, moved, or committed.

## Required work

Define the three approaches:

- `mechanical`: ordinary rules can propose the result.
- `guided-narrative`: the engine gathers facts and suggestions; the GM decides.
- `free-adjudication`: the GM supplies the substantive outcome with engine assistance.

These approaches are selectable per action and are not hardwired to Combat versus non-Combat.

Place the proposal pipeline under `actions/`; do not introduce a fourth orchestration module.

An `ActionProposal` must expose, where relevant:

- Operation identity, actor, source, declared goal, targets, and focus.
- Resolution approach and structured/non-structured timing context.
- Structured Action cost.
- Finalized eligibility findings from Character rules and other owning domains.
- Target and spatial findings, including missing host facts.
- Check requirements and the reconciled dice requirements from 2B-0.
- Uncommitted runtime cost requests.
- Execution duration and travel information.
- Relevant output/potency facts.
- Suggested affected subjects and consequences when already knowable.
- Warnings and unresolved world questions.
- A trace containing only proposal inputs that are safe at this stage.

Aggregate findings without taking ownership of them: Character rules resolve Character eligibility; targeting resolves selection validity; spatial resolves Range/spatial validity; resource domains price their costs later; Combat eventually resolves current structured timing availability.

Distinguish mechanically ineligible, spatially invalid, missing facts, valid but check-dependent, mechanically resolvable, and valid but requiring adjudication.

Preparation must be deterministic and pure. It must not spend Aura or Actions, consume Items/ammunition, damage Body, apply Conditions, move entities, advance time, emit committed events, mutate captured state, or execute the coordinator.

## Required tests

- Targetless stance proposal.
- Aura Punch into empty space.
- Ground-focused Aura Punch with no declared target.
- Target-required healing rejecting an empty intent.
- Outside-Combat preparation carrying but not spending structured Action cost.
- Mechanical costs present but uncommitted.
- Required dice expressed through the 2B-0 model.
- Missing geometry reported as unresolved rather than fabricated.
- Goal, declared targets, and focus preserved exactly.
- Guided narrative exposing useful facts/suggestions.
- Free adjudication not inventing an automatic outcome.
- Repeated preparation leaving all supplied states unchanged.

## Out of scope

No GM overrides, secret dice, public/private views, consequence commitment, ground-impact settlement, or Combat changes.

## Exit gate

- `actions/` owns a pure proposal pipeline.
- Eligibility findings are concrete without duplicating owner-domain rules.
- Proposal preparation is demonstrably non-committing.
- The reconciled dice model is consumed without another dice type.
- `tsc` and all tests pass.
- Append decision records covering proposal ownership, non-commitment, resolution approaches, and eligibility aggregation.

---

# Ticket 2B-2 — GM Adjudication, Secret Overrides, and Visibility

## Outcome

Allow the GM to accept, modify, or replace rule-level proposal results, including secretly overriding dice, while structurally separating player-visible information from GM-private information.

## Required work

### Central adjudication

Implement one adjudication layer over `ActionProposal`. Do not scatter `override?` fields across checks, actions, Body, Aura, targeting, spatial, and Combat.

The GM may override:

- Success, failure, margin, or outcome tier.
- Requirements and eligibility.
- Range, cover, obstruction, and line-of-effect findings.
- Costs before commitment.
- Execution duration and travel findings.
- Suggested/final affected subjects.
- Suggested consequences.
- Public narration and revealed mechanical detail.

Technical integrity remains enforced: no invalid identifiers, non-finite values, contradictory operation IDs, invalid timestamps, missing state, unhandled requests, or corrupt domain state.

### Secret dice

Do not create a third dice vocabulary. Store original rolled values only in a GM-private adjudication record. Apply the GM override before constructing `CheckDiceInput`, then pass only effective values into the check resolver.

Hard constraint:

> A secretly overridden original roll must never enter check resolution or any trace/result/event/diagnostic reachable by players.

The check trace may record the effective value. The GM-private adjudication record may retain original and effective values plus optional private reasoning. Players may be shown the effective roll, only the total, only success/failure, or narrative output, at GM discretion.

### Visibility boundary

Return separate public and GM-private views, or an equivalently safe structure. Do not place private data in a parent `EngineResult.trace` outside that split.

Public output may contain only explicitly revealed narration, targets, affected subjects, results, and consequences. GM output may additionally contain hidden entities, original rolls, override records, private reasoning, full provenance, and unrevealed suggestions/consequences.

The host enforces authorization, but the engine must make accidental leakage avoidable by construction.

## Required tests

- Accept preserving the proposal.
- Modify changing only selected findings.
- Replace supplying a different outcome.
- Requirement and out-of-Range overrides.
- Cost changes occurring before any commitment.
- Ordinary roll with effective value equal to rolled value.
- Secret override changing success to failure and failure to success.
- Check consuming only effective rolls.
- Check and parent public traces omitting original rolls.
- GM-private view retaining original/effective rolls and provenance.
- Public serialization containing no hidden entities or override metadata.
- Malformed technical input remaining rejected despite GM authority.

## Out of scope

No consequence commitment, full consequence builders, ground-impact end to end, Combat refactor, or UI.

## Exit gate

- One central GM-adjudication path exists.
- Rule-level authority is broad while integrity validation remains absolute.
- Secret original rolls cannot leak through public data or traces.
- Public and GM-private outputs are structurally separated.
- `tsc` and all tests pass.
- Append decision records covering GM authority, integrity limits, secret-roll placement, effective-only check input, and visibility.

---

# Ticket 2B-3 — Consequence Settlement and Ground-Impact End to End

## Outcome

Translate finalized mechanical/GM consequences into safe runtime requests or typed host-facing consequences, and prove the complete non-Combat ground-impact scenario. This completes Phase 2 except for Combat wrapping.

## Required work

### High-level consequence builders

The GM and host must not construct raw `RuntimeRequest` objects. Provide high-level builders for supported concepts such as:

- BP-denominated Body damage and supported Body recovery.
- Aura expenditure/restoration.
- Supported Condition application/removal.
- Supported movement/displacement.
- Sensory or informational consequences.
- Adding/removing affected subjects.
- Narrative-only consequences.
- Host-owned object and terrain changes.

Engine-owned consequences become requests to the owning domain. Host-owned world changes return separately as typed host-facing consequences. Never claim the engine mutated terrain, traps, or other state it does not own.

### SP/BP boundary

`applyBodyDamage` accepts BP, but SP-to-BP conversion does not exist. Route BP damage normally. Leave SP-denominated damage unresolved with an explicit diagnostic or pending result. Never treat SP and BP as interchangeable and do not invent conversion here.

### Settlement

Finalize adjudication before coordinator execution. Apply the finalized operation exactly once. Costs price cumulatively against the draft; all costs/effects commit atomically; invalid operations commit nothing; a resolved miss or resisted effect may still spend costs; reduced effects do not automatically refund them. Returned state is authoritative and events remain explanatory.

### Required ground-impact scenario

Implement an end-to-end fixture:

> Gon uses an Aura-filled punch against the ground near a hidden trap, intending to tear up the surrounding terrain.

It must prove:

1. No direct target is declared.
2. The ground position is the focus and the goal records the intended disruption.
3. Zero targets are legal for the profile.
4. Preparation exposes costs and punch output without committing.
5. Host facts expose nearby terrain and the hidden trap only to the GM.
6. The trap remains absent from declared targets.
7. The GM adds it as a collateral final affected subject.
8. The GM declares terrain/trap damage or destruction.
9. Engine-owned costs commit atomically.
10. Terrain/trap changes return as host-facing consequences unless a proper owning domain exists.
11. Public output reveals only GM-approved information.
12. GM output retains hidden-subject and adjudication provenance.
13. No SP-to-BP conversion is assumed.

## Additional tests

- Preview and rejected adjudication committing nothing.
- Finalized action committing once.
- Failed routing rolling back the whole operation.
- Missed/resisted action still paying finalized costs.
- Waived cost removed before execution.
- Cumulative costs against one Aura owner.
- BP damage routing to Body.
- SP damage remaining unresolved.
- Unsupported world changes returning host-facing consequences.
- Narrative-only consequences surviving finalization.
- Collateral subjects not rewriting declared targets.
- Public/private consequence separation.

## Out of scope

No SP-to-BP conversion, full object durability, terrain physics, material hardness, projectile collision, Combat changes, or UI.

## Exit gate

- Finalized actions settle once and atomically.
- High-level consequences route safely without exposing low-level request construction to the GM.
- Unsupported world changes remain faithfully representable.
- The ground-impact fixture passes outside Combat.
- Declared and collateral targets remain distinct.
- `tsc` and all tests pass.
- Append decision records covering consequence ownership, host-facing consequences, BP-only damage, and the non-Combat stopping point.

Stop and report the green gate before beginning the high-risk Combat ticket.

---

# Ticket 2B-4 — Combat Characterization and Neutral-Action Wrapping

## Outcome

Protect existing Combat behavior with characterization tests, then refactor Combat to schedule neutral actions without changing settled Round, Turn, Reaction, initiative, Action-capacity, or movement semantics.

## Part 1: characterize before modifying

Before changing Combat production code, add tests against the existing implementation covering:

- Valid/invalid Action spending, wrong Combatant, insufficient Round Actions, and state caps.
- Bonus Actions, voluntary inaction, hesitation, and timeout-related expenditure.
- Round initialization, capacity snapshots, per-Round initiative reroll, rotation, multiple Turns per Round, skipping ineligible Combatants, and completion only after all Actions are exhausted.
- Turn start/end eligibility and Turn Action caps.
- Reaction opportunity creation, self/non-affected rejection, external Detection gate, Reaction opening ending the triggering Turn, Reaction/round limits, Reaction completion, the triggering Turn not resuming, and correct initiative continuation.
- Reaction movement sharing the same Round movement allowance.

Counterattack is not currently implemented; characterize it only if production code actually gains relevant behavior before this ticket.

Characterization tests must pass before the refactor begins. If current behavior contradicts a settled rule, report it rather than cementing it as desired behavior.

## Part 2: wrap neutral actions

After the characterization gate is green, make Combat wrap/reference the neutral action intent or finalized action. Combat continues to own only:

- Participating Combatant mapping.
- Active Turn/Reaction authorization.
- Round, Turn, and Reaction Action limits.
- Structured Action expenditure.
- Combat-local scheduling and identities.
- Reaction opportunities from finalized affected Combatants or explicit credible incoming threats.
- Initiative continuation.

Combat must not own Skills, Items, neutral profiles, goals, targeting/anatomical validity, Range/geometry, checks, resource mutation, adjudication, or world consequences.

`CombatAction.targetCombatantIds` is already optional. Migrate it carefully rather than assuming every existing action targets someone. Do not leave two permanent competing sources of affected-Combatant truth. Declared targets are not affected Combatants: position-focused actions may affect collateral Combatants, while a declared target may ultimately be unaffected.

Preserve Reaction rules:

- Being affected creates an opportunity, not an automatic Reaction.
- The Detection gate remains separate.
- Opening a Reaction ends the triggering Turn.
- Reaction Actions use the shared Round pool and obey their cap.
- The triggering Turn does not resume.
- Initiative continues according to the established rule.

If pre-impact reactions require “credible incoming threat,” model it explicitly; do not misuse declared targets.

## Required tests

- All characterization tests passing before and after refactoring, unchanged where possible.
- Same neutral intent resolving outside Combat without a wrapper.
- Turn and Reaction scheduling of eligible neutral intents.
- Structured Action cost paid only during structured Combat.
- Mechanical costs remaining separate.
- Targetless Combat action when permitted.
- Position-focused action producing affected Combatants.
- Collateral affected Combatant receiving an appropriate Reaction opportunity.
- Declared-but-unaffected subject not receiving the final consequence automatically.
- Unchanged initiative, Turn, Reaction, Round, and two-second movement behavior.

Do not export internal Combat helpers merely to make testing convenient. If Combat becomes public, expose only the supported surface through `src/index.ts` and record the decision.

## Out of scope

No accuracy implementation, SP-to-BP conversion, Reaction Gate perception resolution, new counterattack rules, projectile physics, terrain rules, Workbench synchronization, Foundry UI, or unrelated Combat redesign.

## Exit gate

- Existing Combat is characterized before modification.
- Contradictory behavior is reported rather than canonized.
- The same suite passes after neutral-action wrapping.
- Combat schedules neutral actions without owning their mechanics.
- Targetless, position-focused, and collateral-subject behavior works.
- Reaction and movement semantics remain intact.
- `tsc`, all tests, architecture tests, and repository hygiene gates pass.
- Append decision records covering characterization, the Combat wrapper boundary, affected-subject Reaction inputs, and public API exposure.

---

# Final Phase 2 Completion Gate

Phase 2 is complete only after all six tickets land and a combined verification proves:

- One neutral action model supports Skills, Items, movement, En, projectiles, Combat, and non-Combat play.
- Targetless actions are valid where permitted.
- Goal, declared targets, focus, suggested subjects, and final subjects remain distinct.
- One target model supports characters/entities, Body Parts, Anatomical Points, objects, positions, areas, and multiple targets.
- One metres-based, host-independent spatial/Range vocabulary exists.
- Movement uses the canonical two-second timing.
- Runtime advantage/disadvantage and check dice share a reconciled two-layer model.
- Mechanical, guided-narrative, and free-adjudication resolution work.
- GM rule-level authority includes secret dice overrides without trace leakage.
- Consequences commit atomically through state owners or return honestly as host-facing work.
- Combat behavior is characterized and preserved while Combat becomes a scheduling wrapper.
- `tsc` is clean, every test passes, architecture boundaries are enforced, no focused/skipped/quarantined tests remain, and documentation/decision records describe the final implementation.
