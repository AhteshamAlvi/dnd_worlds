# ECP-1 — Implement Demand-Driven Action Composition and Persistent Sources

Version 1.0 · AI execution plan

## 1. Starting state and authority

- Repository / workspace: `AhteshamAlvi/dnd_worlds`; expected engine package `packages/engine` (`@nenworld/engine`). Verify locally before editing.
- Target branch / expected base SHA: expected branch `main`; current SHA unknown at ticket drafting and must be verified at execution.
- Evidence:
  - Verified design source: `Engine_Composition_Architecture_Consolidated.md` and the decisions accepted in the design chat.
  - Verified historical source: `Engine_Event_Composition_Design_Handoff.md`, based on `39dd0ed` (`KGS-1`), reported 148 engine test files / 6,145 passing tests and clean engine typecheck at that snapshot.
  - Verified historical source: `Sensory_System_AI_Execution_Plan.md` (`SEN-1`) defines the resolved-cue consumer boundary and explicitly excludes automatic action/Item/event emission production.
  - User-reported later state: SEN-1 and its follow-up fixes were completed. The drafting environment could not independently inspect the current GitHub HEAD. Treat the current sensory contracts, test count, and SHA as unknown until audited.
- Baseline: current commands, counts, typecheck state, and known Workbench failures are unknown. Historical commands appear in §8; audit package scripts and establish the current exact baseline once.
- Existing user changes: unknown. Inspect and preserve all tracked and untracked work.
- Authorization: this ticket authorizes implementation of ECP-1 when supplied to an executor. Do not push or perform any Git remote write. Create a local commit only if the execution prompt explicitly authorizes it.

Read applicable repository instructions. Verify actual HEAD, branch, status, package scripts, and SEN-1 completion before editing. A newer HEAD is expected and is not itself a blocker. Inspect relevant drift. Stop for overlapping user edits, an incomplete or materially divergent SEN-1 contract, or a contradiction between current public callers and this ticket that would change accepted behavior. Do not reset the tree, discard changes, switch branches, or overwrite work to recreate an old baseline.

## 2. Outcome and scope

Implement a pure, deterministic, demand-driven composition layer that derives action-scoped projections from existing authored definitions, runtime state, and host-supplied spatial/environmental facts. Prove the architecture through two complete vertical slices: a fired arrow as a finite multi-phase action and a campfire as a persistent queryable source. Routine arrow use must derive phase-specific sensory emissions, range/path inputs, pre-resolution danger, and post-adjudication impact/aftermath outputs without manual per-shot channel entry. A campfire must remain queryable without generating per-tick events or continuously scanning all observers.

In scope:

- audit and reuse of the current action lifecycle, ActionProfile/Skill/Item implementation seams, state binding, range/spatial vocabulary, Effects, Reaction Gate, and SEN-1 cue boundary;
- immutable action preparation snapshot and fixed semantic phase vocabulary;
- typed, sourced action and sensory contributions; explicit authorized adjustments;
- host-neutral spatial, environment, and candidate-query contracts;
- domain-specific range/path projection without ballistic simulation;
- automatic phase-specific sensory source composition and coarse propagation;
- pre-resolution threat projection and `danger` emission;
- request-scoped memoization only;
- persistent phenomenon source contract and campfire slice;
- incremental migration of the real callers needed by the two slices;
- validation, JSON round trips, traces, architecture tests, behavioral tests, and meaningful mutation checks.

Out of scope:

- Foundry system/module code, Foundry imports, UI, networking, persistence adapters, canvas logic, or scene-document implementation;
- a universal `EventFacts`, `Occurrence`, reactive graph, or replacement action lifecycle;
- continuous all-source/all-observer perception evaluation;
- complete acoustics, optics, ballistics, thermodynamics, scent, fluid, or weather simulation;
- arbitrary executable callbacks in authored content;
- a general expression language or unrestricted tag interpreter;
- repository-wide migration of every Skill, Item, attack, movement type, hazard, or supernatural Effect unless required by the two real vertical slices;
- new Nen principles, Nen Ability design, or unrelated damage/defense formula changes;
- tuning global environment modifiers not supported by accepted rules or the two slices;
- Workbench/Foundry presentation work and unrelated cleanup or dependency upgrades.

Preserve:

- the authoritative lifecycle `ActionIntent -> ActionProposal -> AdjudicatedAction -> ScheduledActionAuthorization -> SettledAction -> RuntimeEvent`;
- existing atomic settlement and stale-state behavior;
- pure/synchronous/no-I/O engine boundaries and caller-supplied randomness;
- immutable JSON-safe persisted/runtime contracts;
- SEN-1 ownership of receivers, routes, Perception, Detection, Concealment, Investigation, ESP, Reaction Gates, and Sensory Gyō;
- one best sensory route and at most one Detection roll;
- existing range, action, Effect, contribution, registry, and trace vocabulary where it already expresses the required fact;
- current public behavior not explicitly changed below.

Do not bundle unrelated cleanup, catalog expansion, balance changes, or dependency upgrades.

## 3. Normative contract

### 3.1 Rules

| Rule | Required behavior | Boundary / error behavior |
|---|---|---|
| R1 — Lifecycle ownership | Composition occurs during action proposal/preparation and, for consequence-dependent outputs, after adjudication but before/with settlement. `RuntimeEvent` reports settled facts and never recalculates authoritative mechanics. | Do not replace or bypass any existing lifecycle stage. Reject attempts to use a post-settlement report as an authority input. |
| R2 — Prepared snapshot | One immutable `PreparedActionSnapshot` binds the action/proposal identity, actor, targets, implementation, phase, authoritative time, state revisions, spatial/environment facts, and authorized adjustments needed by the pending decision. Reuse existing binding/revision types rather than duplicating them. | Missing required facts refuse preparation with traced `EngineError`s. Changed bound state makes settlement stale; never silently recompute against a changed world. |
| R3 — Narrow projection inputs | The preparation snapshot is orchestration state. Range, threat, sensory composition, propagation, and consequence projectors each consume the smallest typed input they require. | No domain receives a generic writable context or imports unrelated catalogs to rediscover facts. |
| R4 — Fixed phases | Core semantic phases are exactly `preparation`, `release`, `travel`, `impact`, and `aftermath`. An action may omit or repeat a phase through stable `stepId` and `sequence`, but content may not invent new semantic phase ids. | Unknown phase ids are invalid. Repeated phases require stable unique step identity and deterministic ordering. |
| R5 — Typed data, not tag execution | Classification ids select applicable typed profiles; typed fields and sourced contributions perform calculations. Tags never directly encode formulas or arbitrary behavior. | Unknown required registry ids, malformed typed properties, or executable authored callbacks are refused. Open provenance labels may not decide mechanics. |
| R6 — Directed dependency graph | Canonical definitions/state/host facts produce resolved action facts; those produce independent projections; projections produce reactions/adjudication; adjudication produces consequences; settlement produces reports. | A projector may consume an explicitly earlier result only. Refuse or structurally prevent recursive projection, same-tier hidden coupling, and sensory-to-source feedback. |
| R7 — Lazy evaluation | Resolve only projections requested by the current action, reaction, inspection, or settlement. Memoize identical work only inside one preparation/session. | No cross-action mechanical cache in ECP-1. No global observer/source matrix, background loop, or correctness dependency on memoization. |
| R8 — Spatial host boundary | The engine consumes validated host-neutral facts: metres, elevation relationship, path/exposure classification, obstruction summaries, region membership, illumination, ambient noise, visibility, precipitation, wind, contact, containment, and supernatural interference as applicable. | The engine does not import or reconstruct Foundry/map objects. Distance is finite and `>= 0`; absent, zero, blocked, unknown, and invalid remain distinct. Missing required geometry refuses that projection rather than guessing. |
| R9 — Separate range questions | Authored attack capability, exact measured distance, travel/path feasibility, attack range result, and sensory propagation are distinct contracts. | Never use one generic `range` result as the answer to all questions. A reachable target may still be imperceptible, and an impact cue may propagate beyond attack range. |
| R10 — Environment vocabulary | Use the exact bands in §3.3. The host supplies facts; each owning projection decides whether and how a band matters. | Do not attach universal numeric modifiers to environment bands. Unsupported or irrelevant bands contribute nothing. Numeric behavior must come from a validated domain/channel/action profile or explicit authorized adjustment. |
| R11 — Source versus reception | Sensory source composition derives phase-specific `ResolvedSensoryCue`s. Propagation derives received intensity from the source cue and supplied exposure/environment facts. SEN-1 then owns compatible receiver discovery, route selection, checks, and information. | Composition must not name receiving anatomy or resolve Detection. Sensory must not inspect Skills, Items, attacks, projectiles, or damage definitions to invent source emissions. |
| R12 — Combination | Within one cue identity—same action/source, phase step, origin, subject, phenomenon, and channel—the strongest ordinary contribution wins. Different phases, origins, subjects, or independent sources remain separate cues. | Clamp final intensity to 1–10; omit suppressed/absent channels. Do not add ordinal intensities. `replace`, `suppress`, and exceptional `add` require sourced authorized adjustments; exceptional add clamps at 10. |
| R13 — Threat projection | Pre-resolution threat uses severity, urgency, commitment, threatened subject/area, and confidence from §3.4. `danger = clamp(severity + urgency + commitment, 1, 10)`. Confidence affects trace/information wording, not danger intensity. | Do not use final rolled damage or expose exact secret consequence values. A non-threat emits no `danger` channel rather than intensity zero. Invalid table values refuse the projection. |
| R14 — Snapshot timing | Preparation binds actor/target revisions, implementation, equipment/ammunition, resources/commitments, active Effects/Nen state, declared targets, positions/path/environment, pre-resolution threat, pre-impact cues, reaction bindings, requested dice, registries, and overrides. Actual hit, impact location, damage, Injury/Condition consequences, impact cues, and aftermath sources are derived only after adjudication. | A long-running action that needs new world facts creates a new scheduled phase preparation. It may not silently absorb later state into the old snapshot. |
| R15 — Candidate enumeration | The engine produces a `CandidateQuerySpec`; the host returns candidates bound to the same query and scene revision. The host enumerates objective spatial candidates only. The engine decides capability, propagation, route, Concealment, Detection, and Reaction. | Mismatched query/scene revisions, duplicate candidate identities, or malformed spatial facts are invalid. Absence of candidates means no receivers for that query; the host may not provide pre-decided detection outcomes. |
| R16 — Persistent sources | Continuing phenomena are stored/queryable sources with identity, origin/area, active interval, profile, and revision. They produce cues only when queried at an authoritative time. | Continued existence emits no per-tick RuntimeEvent. Inactive sources produce no cue. Dividing an interval into subqueries must not alter state or emitted source intensity. |
| R17 — Campfire slice | Implement one persistent physical campfire source with reusable authored/test profile contributions for visible light, sound, heat, and smoke/scent where corresponding registered channels exist. It must demonstrate start/stop, query-on-demand, spatial candidate request, obstruction/environment input, and no event spam. | Do not add unregistered channels merely to satisfy this example. If the current registry lacks a required channel, use the existing supported subset and report the omitted demonstration rather than expanding SEN-1 without user approval. |
| R18 — Arrow slice | Route one real existing ranged/projectile action path through preparation, attack-range/path projection, phase-specific release/travel/impact composition, pre-resolution threat, Reaction preparation where applicable, adjudication, settlement, and impact/aftermath reporting. Routine use supplies no manual intensities. Skills inherit ordinary profiles unless they explicitly alter them. | If no real bow/arrow/projectile definition or caller exists, stop and ask whether to add canonical content or prove the slice with fixtures; do not fabricate a production consumer. Do not change damage rules to complete the slice. |
| R19 — Provenance and trace | Every projection records its contributing source, operation/policy, original value, relevant attenuation/adjustment, final value, warnings, binding/revision, and authorized override. | Traces remain JSON-safe, deterministic, concise, and audience-aware. Do not dump irrelevant world state or secret exact consequence data into player-visible output. |
| R20 — Migration | SEN-1's resolved-cue consumer remains permanent. Ordinary direct construction of action cues is transitional and must be migrated for all ECP-1 real callers, then internalized/deprecated at the narrowest safe boundary. An authorized GM/host adjustment remains permanent and traceable. | Do not maintain two permanent routine producer models or writable compatibility aliases. Do not remove a public caller without auditing and migrating it. |
| R21 — Engine boundary | All new production code remains pure, synchronous, deterministic for supplied inputs, immutable, JSON-safe where persisted, and free of Foundry/DOM/network/storage imports. | No hidden clocks, random rolls, global mutable world state, I/O, or environment-specific APIs. |

### 3.2 Required core shapes

Use repository naming conventions and existing id/binding types where present. Preserve the semantic contracts below; do not duplicate equivalent current types merely to match spelling.

```ts
type ActionPhase =
  | "preparation"
  | "release"
  | "travel"
  | "impact"
  | "aftermath";

interface ActionPhaseRef {
  readonly phase: ActionPhase;
  readonly stepId: string;
  readonly sequence: number;
  readonly occursAt: GameTimestamp;
  readonly origin?: SpatialPoint;
}

interface PreparedActionSnapshot {
  readonly actionId: ActionId;
  readonly proposalId: ActionProposalId;
  readonly phase: ActionPhaseRef;
  readonly declaredAt: GameTimestamp;
  readonly actor: PreparedParticipantRef;
  readonly targets: readonly PreparedTargetRef[];
  readonly implementation: PreparedActionImplementation;
  readonly stateBinding: ActionStateBinding;
  readonly spatial: ActionSpatialSnapshot;
  readonly environment: ActionEnvironmentSnapshot;
  readonly adjustments: readonly ActionProjectionAdjustment[];
}
```

```ts
interface CandidateQuerySpec {
  readonly queryId: string;
  readonly sceneId: string;
  readonly origin: SpatialPoint;
  readonly maximumDistanceM?: number;
  readonly area?: SpatialArea;
  readonly requiredRelationships:
    readonly CandidateRelationshipRequirement[];
  readonly sceneRevision: string;
}

interface CandidateQueryResult {
  readonly queryId: string;
  readonly sceneRevision: string;
  readonly candidates: readonly SpatialCandidate[];
}
```

```ts
interface PersistentPhenomenonSource {
  readonly id: string;
  readonly origin?: SpatialPoint;
  readonly area?: SpatialArea;
  readonly activeInterval: GameTimeInterval;
  readonly profileId: string;
  readonly stateRevision: string;
}
```

One of `origin` or `area` is required for a spatial persistent source. If the existing spatial vocabulary represents an area through origin plus shape, reuse it instead of preserving both fields.

### 3.3 Exact environment vocabulary

```ts
type IlluminationBand =
  | "absent"
  | "dim"
  | "normal"
  | "bright"
  | "overwhelming";

type AmbientNoiseBand =
  | "silent"
  | "quiet"
  | "ordinary"
  | "loud"
  | "overwhelming";

type VisibilityBand =
  | "clear"
  | "obscured"
  | "heavily-obscured"
  | "blocked";

type PrecipitationBand =
  | "none"
  | "light"
  | "heavy"
  | "extreme";

type WindBand = "calm" | "light" | "strong" | "extreme";

type WindRelationship =
  | "irrelevant"
  | "headwind"
  | "tailwind"
  | "crosswind";
```

Do not assign global modifiers to these bands. A channel/action profile may own validated attenuation entries. Tests must use exact explicit fixture tables rather than relying on unaccepted global balance values.

### 3.4 Exact threat vocabulary

| Severity | Meaning |
|---:|---|
| 1 | Discomfort, distraction, or negligible harm |
| 2 | Minor but meaningful harm |
| 3 | Serious injury or meaningful incapacitation |
| 4 | Critical injury or plausible death |
| 5 | Overwhelming, catastrophic, or reliably lethal consequence |

| Urgency | Meaning |
|---:|---|
| 0 | Latent or distant |
| 1 | Approaching; ordinary response time remains |
| 2 | Imminent; immediate response required |
| 3 | Resolving now |

| Commitment | Meaning |
|---:|---|
| 0 | Possible or conditional |
| 1 | Declared, armed, or actively developing |
| 2 | Released, triggered, or committed |

```ts
type ThreatConfidence = "conditional" | "probable" | "confirmed";
```

Threat dimensions are integers in the stated ranges. A valid threat resolves `danger` with the formula in R13. Confidence never changes the number.

### 3.5 Contribution and adjustment requirements

Reuse existing contribution/Effect/provenance primitives when they can express these requirements. Otherwise introduce the smallest discriminated data shapes needed to provide:

- source reference;
- phase/step applicability;
- subject and phenomenon;
- registered channel id;
- integer intensity 1–10;
- optional origin source;
- ordinary profile contribution versus authorized adjustment;
- adjustment operation `add | suppress | replace`;
- authorization and reason for host/GM adjustments.

No authored shape may contain executable functions. No generic resolver may branch on built-in Skill, Item, Sense, channel, Nen principle, or material ids.

### 3.6 Required decisions

None at ticket drafting. The accepted architecture and local rules are stated above. The executor must still pause under §5 if the live repository reveals a significant conflict, missing real arrow consumer, schema-breaking migration beyond ECP-1, or a required new canonical channel/balance table.

## 4. Implementation and coordination

Exact file paths below are proposed because the drafting environment could not audit the live repository. The executor must map them to existing ownership seams rather than manufacturing parallel directories.

| Unit | Existing seam / planned change | Owned files | Depends on | Validation |
|---|---|---|---|---|
| U0 — Audit and contract map | Map current lifecycle, action preparation, state bindings, profiles, Items/projectiles, range/spatial types, Reaction Gate, SEN-1 cue/routes, persistent runtime state, public exports, and real ranged callers. Record current baseline and conflicts. | Read-only repository audit; local audit note if useful | — | T0 |
| U1 — Shared composition contracts | Add/reuse phases, immutable prepared snapshot, narrow projection input contracts, environment vocabulary, contribution provenance, adjustments, and validation. | Proposed `packages/engine/src/gameplay/actions/composition/*` or nearest existing action-preparation owner; infrastructure only where truly shared | U0 | T1–T3 |
| U2 — Spatial/candidate boundary | Add host-neutral spatial/environment snapshot and two-stage candidate query/result binding. Reuse current distance/range/spatial vocabulary. | Existing gameplay spatial/range ownership; proposed composition spatial files | U1 | T4–T5 |
| U3 — Range/path projection | Separate exact distance, authored capability, feasibility, range result, and sensory propagation inputs; integrate the real ranged path. | Existing range/targeting/action implementation files | U1–U2 | T6 |
| U4 — Sensory source composer | Add phase-specific sourced emission profiles, maximum combination, authorized adjustments, and `ResolvedSensoryCue` output. No receiver or Detection logic. | Proposed action composition sensory files plus natural Item/Skill/Effect profile owners; do not place in SEN-1 receiver resolution | U1 | T7–T9 |
| U5 — Propagation and SEN-1 handoff | Apply explicit channel/profile attenuation from exact distance and environment facts, then call the existing SEN-1 route/Detection boundary. | Existing sensory cue-access seam plus proposed propagation projector | U2, U4 | T10–T11 |
| U6 — Threat projection | Add severity/urgency/commitment/confidence validation, danger formula, trace redaction, and Reaction preparation integration. | Existing attack/reaction preparation owner; proposed threat projector | U1, U3 | T12–T14 |
| U7 — Arrow vertical slice | Route one real existing bow/arrow or closest ranged projectile consumer end to end. Author reusable profiles at their natural existing definitions; migrate direct cue construction for this path. | Existing Item, action profile, Skill application, reaction, adjudication, settlement files | U3–U6 | T15–T18 |
| U8 — Persistent sources | Add queryable source/profile/lifecycle contracts and campfire slice; project only on demand. | Existing runtime/scene-neutral state owner or proposed `gameplay/phenomena/*`; avoid Foundry-shaped scene state | U1–U2, U4–U5 | T19–T22 |
| U9 — Migration/public wiring | Migrate affected real callers, internalize/deprecate unrestricted routine cue construction as safe, export public host contracts, add serialization/migration only where stored shapes changed. | Actual callers, package barrels, migrations, JSON validation | U7–U8 | T23–T25 |
| U10 — Architecture and verification | Add dependency guards, mutation coverage, final integration tests, and completion evidence. | Architecture tests and focused suites; shared production files only for fixes | U1–U9 | T26–T29 |

### 4.1 Required execution order

1. U0 audit and baseline.
2. Sequential contract lock for U1 and public/narrow ownership boundaries.
3. U2–U6 implementation in dependency order. Pure isolated validation/test work may overlap only after U1 compiles.
4. U7 arrow integration sequentially through real callers.
5. U8 persistent source and campfire integration.
6. U9 migration and exports after both slices prove the common abstractions.
7. Focused tests, architecture tests, mapped mutations, and U10 final gates.

Use the smallest coherent implementation. Do not build a registry, abstraction, or generic expression system merely because another future domain might use it. Generalize only behavior shared by the completed arrow and campfire slices or already required by a current public extension boundary.

### 4.2 Delegation

One primary integrator/writer owns all shared contracts, production integration, barrels, migrations, architecture guards, and final fixes. Parallel agents are permitted only as follows:

- After initial repository status is recorded, up to three read-only audits may run in parallel:
  - action/lifecycle/Item/Skill/real-arrow caller map;
  - SEN-1/cue/Reaction/Concealment ownership map;
  - spatial/range/environment/runtime persistence map.
- Give each audit agent only the relevant handoff excerpt and repository scope. Require a concise report of public types, real callers, ownership, conflicts, and proposed touched paths; forbid edits.
- After U1 contracts compile, bounded agents may add tests for isolated pure units only if they do not edit shared types, public barrels, fixtures used by other agents, integration callers, or architecture tests.
- Independent final reviewers may inspect behavioral coverage and dependency boundaries read-only. The primary integrator applies overlapping fixes.

Use the strongest available model/high reasoning for U1 contract lock, U7 integration, U9 migration, and conflict resolution. A capable mid/high model is sufficient for bounded read-only audits and isolated table/validation tests. Do not delegate trivial searches or spend parallel context on work the integrator already has loaded.

## 5. Decision and evidence discipline

Ask the user before choosing any significant missing behavior, numerical balance value, schema-breaking migration, public API tradeoff, destructive action, new dependency, scope expansion, or contradiction with the accepted design. Present the exact gap, concrete alternatives, recommendation, and affected units. Pause only the dependent work and continue independent authorized work.

In particular, stop and ask if:

- SEN-1 is incomplete or its live cue boundary materially differs from the ticket;
- no real existing ranged/projectile production caller can serve U7;
- completing the arrow requires inventing damage rules or canonical bow/arrow content;
- an initially demonstrated campfire channel is not registered and adding it would expand SEN-1;
- current public direct-cue callers cannot be migrated without a breaking release decision;
- current range or state-binding contracts contradict R2, R9, or R14;
- an environment effect requires an unaccepted numeric global modifier;
- a Foundry-shaped or Workbench-shaped dependency appears necessary inside the engine.

Ordinary internal file placement, private helper decomposition, and equivalent reuse of existing types may be chosen and briefly reported. Never invent APIs, files, evidence, baseline counts, permissions, passing results, or a real production caller.

## 6. Acceptance and test map

The executor must map each test to current or newly created focused suites after U0. Names below describe required behavior, not mandatory filenames.

| Test | Rule | Scenario and observable expected result | Smallest suite |
|---|---|---|---|
| T0 | Starting state | Current HEAD/status/scripts/SEN-1 public contracts and one real ranged caller are recorded; historical assumptions are not presented as current facts. | Audit/search only |
| T1 | R2–R4 | Valid prepared snapshot and all five phases round-trip; unknown phase, duplicate step identity, invalid sequence/time, and missing binding facts fail. | Composition contract tests |
| T2 | R3, R6 | Range, threat, and sensory projectors compile and test against narrowed inputs; forbidden same-tier/recursive imports fail architecture guards. | Architecture + type tests |
| T3 | R5, R19, R21 | Typed contribution/adjustment validation preserves provenance and JSON determinism; unknown ids, callback-like data, invalid intensity, and unauthorized adjustments fail. | Composition validation tests |
| T4 | R8, R10 | Every environment band validates and round-trips; negative/NaN/infinite distance and unknown bands fail; absent and blocked remain distinct. | Spatial/environment tests |
| T5 | R15 | Query/result ids and scene revisions bind exactly; duplicates/mismatches fail; candidate input contains spatial facts, not detection outcomes. | Candidate-query tests |
| T6 | R9 | A fixture at one exact distance can be within attack capability while visual/sound propagation resolves independently; blocked path differs from out-of-range. | Range/path projection tests |
| T7 | R4, R11 | One arrow action emits separate release, travel, and impact cues with correct origins/timing; omitted phases emit nothing. | Sensory composition tests |
| T8 | R12 | Two ordinary same-channel contributions resolve to maximum, not sum; different phase/origin/subject remains separate; suppression/removal and authorized replace/add clamp correctly. | Sensory composition tests |
| T9 | R5, R18 | Ordinary Skill inherits bow/arrow profiles; an explicit silent adjustment suppresses release sound without id-specific resolver logic. | Skill/Item integration tests |
| T10 | R8, R10–R11 | Explicit fixture attenuation changes received intensity once from exact distance/environment data while leaving source intensity unchanged. | Propagation tests |
| T11 | R11 | Propagated cue reaches current SEN-1 receiver/route path; composition never supplies receiver anatomy and still produces one best route/at most one roll. | Existing sensory integration + new handoff tests |
| T12 | R13 | All severity/urgency/commitment boundaries validate; `1+0+0=1`, `5+3+2=10`, and intermediate sums resolve exactly. | Threat projection tests |
| T13 | R13, R19 | Changing confidence changes trace/information classification but not danger intensity; player-facing output contains no exact projected damage. | Threat trace tests |
| T14 | R13–R14 | Danger is available before adjudication/Reaction and is unchanged by the later damage roll; non-threat emits no danger channel. | Reaction preparation tests |
| T15 | R1–R3, R18 | Real public arrow declaration reaches proposal/preparation through existing lifecycle and creates only demanded projections. | Real action integration test |
| T16 | R8–R14, R18 | Arrow slice uses real implementation, target, exact distance/path/environment, release/travel cues, danger, and Reaction binding without per-shot manual intensities. | Arrow vertical test |
| T17 | R14, R18 | Adjudication supplies actual impact facts; miss/hit produces appropriate impact/aftermath behavior without changing damage rules. | Arrow adjudication/settlement test |
| T18 | R2, R14 | Changing a bound actor, target, Item/ammunition, position/path, environment, scene, registry, or relevant state revision makes settlement stale as applicable; unrelated unbound state does not. | Existing stale-settlement + arrow tests |
| T19 | R16–R17 | Active campfire queried at an authoritative time produces supported multi-channel cues; before start/after end produces none. | Persistent-source tests |
| T20 | R7, R16–R17 | Advancing time without querying creates no cue/event; repeated identical queries are deterministic and do not mutate the source. | Persistent-source tests |
| T21 | R16 | One interval query and subdivided equivalent queries preserve the same source state/intensity; no accumulated per-tick behavior appears. | Time/subdivision tests |
| T22 | R8, R15–R17 | Campfire generates a candidate query; supplied obstruction/environment facts affect only owning propagation profiles; the host does not decide Detection. | Campfire integration test |
| T23 | R20 | All ECP-1 real callers use automatic composition; ordinary public direct construction is removed/internalized/deprecated according to the audited migration. Authorized host override still works and is traced. | Caller search + migration tests |
| T24 | R19–R21 | Snapshot, phase, candidate, threat, cue, adjustment, and persistent-source state round-trip through required JSON boundaries with stable ids/revisions. | Serialization tests |
| T25 | R1, R20 | Existing SEN-1, action, Reaction, range, Item, Skill, and settlement regressions remain green; no legacy compatibility alias becomes a second authority. | Existing focused integration suites |
| T26 | R5–R7, R11, R21 | Architecture guards prove no Foundry/DOM/I/O imports, no channel/Sense/Item/Skill id switches, no automatic producer inside sensory receiver code, and no RuntimeEvent authority. | Architecture tests |
| T27 | R7 | Instrumented/counting fixture proves an unrequested projection is not evaluated and an identical requested projection is resolved once per preparation. | Composition memoization tests |
| T28 | R19 | Traces deterministically identify every contribution, maximum selection, attenuation, adjustment, final result, phase, and state binding. | Trace/golden tests |
| T29 | All | Full engine tests/typecheck and applicable monorepo comparison pass after all mutations are restored. | Final gates |

### 6.1 Mutation map

Apply each mutation independently, run the mapped minimum suite, prove failure for the intended reason, and restore exact intended implementation content before continuing.

| Mutation | Incorrect change | Detecting test |
|---|---|---|
| M1 | Let `RuntimeEvent` feed authoritative action settlement | T25/T26 |
| M2 | Accept an unknown phase or merge release/travel/impact | T1/T7 |
| M3 | Give every projector the entire mutable snapshot | T2/T26 |
| M4 | Add ordinary same-channel intensities instead of taking maximum | T8 |
| M5 | Merge cues with different phase/origin/subject | T7/T8 |
| M6 | Apply propagation attenuation to source intensity as well as received intensity | T10 |
| M7 | Name a concrete receiving anatomical point in action composition | T11/T26 |
| M8 | Resolve one Detection roll per receiver/cue instead of preserving SEN-1 behavior | T11/T25 |
| M9 | Use final rolled damage to calculate prepared danger | T14 |
| M10 | Make confidence change danger intensity | T13 |
| M11 | Change danger formula or accept out-of-range threat values | T12 |
| M12 | Silently recompute changed position/environment at settlement | T18 |
| M13 | Accept candidate result with wrong scene revision/query id | T5 |
| M14 | Calculate an unrequested projection | T27 |
| M15 | Add a cross-action rules-result cache | T27/T26 |
| M16 | Emit one campfire event/cue per elapsed tick | T20/T21 |
| M17 | Make interval subdivision change persistent-source output/state | T21 |
| M18 | Branch on the canonical bow, arrow, campfire, Skill, Sense, or channel id in a generic resolver | T9/T26 |
| M19 | Allow an unauthorized `replace`, `suppress`, or `add` adjustment | T3 |
| M20 | Leave a real arrow caller on manual per-use cue intensities | T16/T23 |
| M21 | Import Foundry, DOM, storage, network, or clock APIs into the engine path | T26 |

If a mutation survives, strengthen the nearest behavioral or architecture test. Explain only genuinely redundant or unreachable mutations with concrete evidence; do not waive a reachable critical rule. Prefer an existing mutation harness. If none exists, use reversible patches and record pre/post hashes for mutated files so restoration never discards uncommitted implementation edits.

## 7. Execution and context budget

Audit with `rg`, `rg --files`, targeted symbol reads, and actual public callers. Batch the three independent read-only audits. Do not repeatedly reread full files after contracts are understood. Create one concise local contract/caller map and reuse it throughout the implementation.

Plan coherent edits before patching. Lock shared contracts once, then implement pure projectors before integration. Consolidate imports, tests, exports, and formatting per workstream. Avoid whole-file rewrites, repeated cosmetic edits, unrelated formatting, repeated full diffs, and verbose progress narration. Inspect one focused diff after U1, after the arrow slice, after the campfire slice, and before final verification.

Keep detailed command output in local logs where supported. Report exit codes, test counts, and relevant failure excerpts rather than pasting complete successful logs. Agents return only public seams, conflicts, paths, tests, and decisions—not raw file contents or full command transcripts.

### 7.1 Testing schedule

1. Audit package scripts and establish the missing current baseline once. If the full engine suite is expensive, one baseline run is sufficient for the unchanged starting tree.
2. After U1, run only contract/validation/typecheck tests needed to prove the shared surface compiles.
3. During U2–U6, run the smallest owning suite for each pure projector.
4. After U7, run the arrow, Reaction, sensory handoff, action lifecycle, Item/Skill, range, and stale-state suites once as a coherent group.
5. After U8, run persistent-source, time/subdivision, propagation, and candidate-query suites.
6. Run each mutation against only its mapped minimum suite; never use the full engine suite as the default mutation command.
7. After exact mutation restoration, run architecture tests, one final full engine suite, engine typecheck, applicable monorepo typecheck comparison, and diff/status checks.
8. If production code changes after the final full suite, rerun the affected focused suites and the final engine suite. Do not repeat identical root/workspace wrappers that execute the same tests.

This budget reduces redundant tool calls but never overrides correctness. A concrete new failure or dependency risk justifies an additional focused run.

## 8. Verified commands and completion

The following commands are historically used by the repository and must be checked against current package scripts during U0. Update only when the live repository proves a different canonical command.

| Gate | Exact command / working directory | Frequency |
|---|---|---|
| Focused tests | `npm test -w @nenworld/engine -- --run <mapped-test-files>` from repository root | After owning workstream + mapped mutations |
| Architecture tests | `npm test -w @nenworld/engine -- --run packages/engine/src/__tests__/architecture.test.ts` from repository root, corrected to actual runner path if current script expects package-relative paths | Contract lock as needed; final |
| Full engine tests | `npm test -w @nenworld/engine` from repository root | Baseline once if needed; final once |
| Engine typecheck | `npm run typecheck -w @nenworld/engine` from repository root | After broad contract changes if useful; final |
| Monorepo typecheck comparison | `npm run typecheck --workspaces --if-present` from repository root | Final; compare exact known-error identities, not count alone |
| Diff/whitespace | `git diff --check` from repository root | Final |
| Tree/status | `git status --short` and `git diff --stat` from repository root | Start and final |

Done means:

- R1–R21 are satisfied or an accepted repository-equivalent contract is documented;
- the real arrow path and campfire persistent source meet their vertical acceptance tests;
- automatic source composition, propagation, threat, candidate query, snapshot, and stale-state behavior are wired through real public callers;
- no ordinary ECP-1 caller requires per-use manual emission intensities;
- SEN-1 remains the sole owner of receiver/route/Detection behavior;
- no cross-action rules cache, continuous perception loop, Foundry dependency, universal event object, id-specific generic branch, or mutation residue remains;
- all tests and mutations are accounted for;
- serialized contracts, migrations, exports, traces, and architecture guards are complete;
- final gates and exact baseline differences are recorded;
- no Git push or remote write is performed; any local commit is created only when explicitly authorized.

Report concisely:

1. audit verdict, actual starting SHA/branch/status, and actual baseline;
2. final outcome and the exact arrow/campfire behavior;
3. changed files grouped by contracts, projectors, integrations, migrations, and tests;
4. public API and serialization changes;
5. focused/full tests, typechecks, and baseline differences;
6. every mutation, detecting test, survivor, and resolution;
7. authorized local commit SHA, if any, and remaining tree entries;
8. decisions requested, accepted deviations, and unresolved risks;
9. intentionally deferred producers and the recommended next migration slice.

Mark every unrun gate as not run. Do not claim exhaustive review or Foundry readiness from local engine tests alone.
