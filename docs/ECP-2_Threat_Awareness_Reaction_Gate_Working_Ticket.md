# ECP-2 — Bind Threat Awareness to Reaction Gates and Deliberate Warnings

## 1. Starting state and authority

- Repository / workspace: `dnd_worlds`, expected engine package under `packages/engine`; verify the actual checkout and package layout at execution.
- Target branch / expected base SHA: `main` at or after `c3657d4`; verify actual branch, HEAD, ancestry, and relevant drift before editing.
- Evidence:
  - User-reported ECP-1 completion commit: `c3657d4`.
  - User-reported ECP-1 behavior: Fire Blast passes through the real action lifecycle and produces phase-specific danger; campfire persistent projection is query-driven; composition is the only automatic `ResolvedSensoryCue` producer.
  - Accepted design authority: `ECP-2_Threat_Awareness_Reaction_and_Warning_Rules.md`.
  - Known existing seam reported by the user: `gameplay/senses/reaction-gate.ts`; verify its current path, API, and ownership.
- Baseline: user-reported at ECP-1 completion: 158 engine test files / 6,584 tests passing and engine typecheck clean. Workbench had 65 byte-identical pre-existing type errors involving `Character.name` / `Attributes.str`. These facts are historical and must be re-established or explicitly classified at execution.
- Existing user changes: the ECP-1 executor reported three pre-existing untracked documentation files and preserved them. Inspect the actual tree and preserve every unrelated tracked or untracked change.
- Authorization: implement the bounded ECP-2 scope. Local commit is not authorized by this ticket; ask the user before committing or leave the verified changes uncommitted. External writes: none.
- Remote rule: do not push, publish, open a pull request, or otherwise modify GitHub or another remote repository. The user performs all pushes manually.

Read applicable repository instructions. Verify actual HEAD, branch, status, package scripts, and relevant post-`c3657d4` drift before editing. A newer HEAD is not automatically a blocker. Stop for overlapping user edits or material conflicts with the accepted rules; do not reset the tree, switch branches, delete untracked files, or overwrite work to match this ticket.

The executor must audit these three seams before locking contracts:

1. How the engine currently represents group, team, ally, side, or encounter relationships. Reuse the authoritative relationship fact; do not create a parallel group system.
2. Which existing initiative roll and ordering contract applies when eligible reactions share an authoritative timestamp. Reuse it. If no authoritative formula exists, pause and ask rather than inventing one.
3. Whether the neutral action vocabulary already represents communication and authoritative action duration/effect timing. Reuse it. If an ordinary warning needs a new duration or numeric balance value, pause and ask rather than selecting one.

## 2. Outcome and scope

Connect ECP-1 prepared, subject-specific danger projections to SEN-1 reception and Detection and then to the existing Reaction Gate lifecycle. A threatened subject must receive at most one gate for one unchanged threat, while later action phases may retry only after earlier Detection failure. The earliest detecting eligible allied observer may receive one intervention gate, spend one ordinary Action to communicate a real sensory warning, and thereby inform group members who actually detect that communication. Authoritative timestamps and action effect points determine whether warning and defense occur before impact.

In scope: stable threat identity; per-subject awareness; direct danger reception and Detection; multi-phase retry and deduplication; earliest allied-observer selection; initiative ordering for exact ties; intervention and defensive gate bindings; ordinary warning Action; warning sensory composition, propagation, reception, interception, and provenance; threat-scoped concealment-awareness relief; effect-point timing; stale revalidation; Fire Blast end-to-end integration; tests, traces, serialization, public exports, and architecture guards required by these behaviors.

Out of scope: redesigning SEN-1, Reaction Gate, initiative, group membership, the shared Turn action economy, general communication rules beyond the warning vertical slice, full Item/inventory development, damage/defense mathematics, Foundry integration, continuous projectile or sound simulation, a global perception matrix, an independent reaction pool, automatic party telepathy, or making `RuntimeEvent` authoritative.

Preserve: ECP-1 composition ownership; SEN-1 ownership of receiver eligibility, route resolution, Concealment, and Detection; neutral action ownership; reactions paid from the shared Turn Action pool; atomic settlement; revision-based stale rejection; direct authorized host/GM cue consumption; deterministic replay and traces; all unrelated engine and Workbench behavior.

## 3. Normative contract

| Rule | Required behavior | Boundary / error behavior |
|---|---|---|
| R1 | A threat has a stable identity bound to the prepared action, implementation/revision, source, endangered subject, phase/step context, expected consequence, timing, and spatial binding. | A redirected target, secondary consequence, or independently persistent hazard may require a new threat identity. Do not silently reuse an identity across a materially changed threat. |
| R2 | Danger is projected and resolved separately for every mechanically endangered subject. Area and path threats may endanger undeclared subjects when the authoritative threat projection says so. | Never replace per-subject results with one group-level Detection or gate. Declared-target status alone is insufficient if the real projector identifies additional endangered subjects. |
| R3 | A danger cue reveals threat existence, urgency, relevant timing, and coarse direction only. | It does not reveal attacker identity, exact Skill/Item, hidden source, exact trajectory, damage, or full consequence unless another detected route or explicit mechanic supplies that information. |
| R4 | Each endangered subject resolves the prepared cue through the real SEN-1 receiver, route, propagation, Concealment, and Detection path. | Reaction code must not infer awareness directly from source intensity, danger score, declared-target status, or host candidate membership. |
| R5 | An unchanged multi-phase threat may retry Detection at later eligible phases only while the subject has not successfully detected it. | After first success, gate opening, decline, expenditure, expiration, or unusability, later phases do not manufacture another gate for that subject. |
| R6 | Multiple sensory routes for the same subject and unchanged threat consolidate into one awareness result and at most one defensive gate. Preserve route provenance in the trace. | Sight, sound, danger, aura, or other corroborating routes never multiply gates. |
| R7 | First successful direct Detection may open a defensive Reaction Gate only for an actually endangered subject. | Gate opening does not make a response legal, free, timely, or successful. Existing policy still validates response, costs, resources, and availability. |
| R8 | A non-endangered eligible ally who independently detects the threat may be considered for one allied intervention gate. Only the earliest detecting eligible allied observer receives it. | Other observers remain aware and may act on ordinary turns, but receive no additional off-turn intervention gate from that unchanged threat. |
| R9 | Detection time is the primary ordering key. Exact simultaneous detections form one cohort and use the engine's authoritative initiative rule. Among tied allied observers, initiative selects the one intervention-gate observer. | Do not invent a new initiative formula. Endangered subjects retain their own possible defensive gates; selecting the allied observer does not erase them. |
| R10 | Initiative orders simultaneous gates; it does not award the entire threat to one participant. After each response settles, revalidate later gates against the resulting threat and remaining time. | If an earlier response cancels, redirects, delays, or otherwise changes the threat, later gates may become stale, unnecessary, or require a new threat identity. |
| R11 | There is no automatic group alert. A detecting character must deliberately perform a warning Action. An ordinary warning costs one Action from the shared Turn action pool and may be declared through a legal intervention gate. | Do not create free speech actions, a separate warning resource, or an automatic party broadcast. Special authored methods may override cost or timing through existing extension mechanisms. |
| R12 | A warning references one threat identity and becomes its own action/sensory source with declared communication method, activation/effect timing, propagation, receivers, Detection results, and provenance. | Do not pass awareness directly between characters or mutate recipients as aware without resolving the communication. |
| R13 | Group membership adds no group-specific distance cap inside the same scene/encounter, but it also grants no perception. Every recipient must be reached by and detect the selected communication method. | A shout, gesture, radio, telepathy, or coded signal follows its own channel and access rules. Missing relationship or communication facts must refuse or remain unavailable, not default to success. |
| R14 | Anyone capable of detecting the communication channel may intercept an ordinary warning. Intended group members may interpret it as trusted threat information. Privacy requires an explicit mechanic. | The caller cannot mark an ordinary detectable communication private without authorization from content/rules. |
| R15 | A non-endangered warning recipient receives information only and no Reaction Gate. An endangered recipient who detects the timely warning may use it to establish the awareness necessary for that subject's single defensive gate. | A warning cannot create a second gate if the endangered recipient already succeeded through another route. |
| R16 | A detected warning removes only awareness/Detection disadvantage caused by concealment for the referenced threat. | It does not reveal invisibility, remove targeting disadvantage, remove cover/obstruction, reveal exact location/identity, cancel unrelated concealment, or guarantee later tracking. |
| R17 | Warnings do not recursively rebroadcast. A recipient must deliberately perform and pay for a new communication Action to warn another subject. | Never create an automatic warning chain or transitive party propagation. |
| R18 | Timing uses authoritative `releaseAt`, `impactAt`, `detectedAt`, `startedAt`, `effectiveAt`, and, where applicable, `receivedAt`. Default Action effect time is its authoritative completion time unless existing authored content provides another effect point. | Do not add tick simulation, frame polling, or per-distance microsteps. Do not invent a numeric warning duration if the current action contract does not provide one. |
| R19 | A response affects the threat when `effectiveAt < impactAt`; it is too late when `effectiveAt > impactAt`; equality is a simultaneous event resolved through authoritative initiative ordering. | Declaration before impact is insufficient if the response's relevant effect becomes active afterward. |
| R20 | Warnings may work before or after release. A post-release chain is valid only if warning production, reception/Detection, gate opening, and the selected defense's effect point occur in time. | Never apply a categorical “post-launch warnings fail” rule or retroactively change an already settled impact. Late information may be recorded without altering the past. |
| R21 | Ordinary communication does not require continuous speed-of-sound simulation. Use the existing communication/sensory propagation contract; absent an authored nonzero delay, the warning becomes receivable at its effect point for candidates whose route succeeds. | If current repository rules define propagation timing differently, surface the conflict before changing accepted behavior. |
| R22 | Gates, warnings, and responses bind to the prepared threat and relevant state, registry, action, scene, and timing revisions. Validate before authorization and settlement. | Reject stale bindings atomically; do not silently recompute against a changed world or partially charge a rejected response. |
| R23 | Trace and serialized results must explain the threat, subject, phases attempted, routes, Detection times, selected allied observer, initiative tie, warning Action/cost, intended and intercepting recipients, concealment relief, gate timing, response effect time, and failure/stale/late reason. | Traces report authoritative decisions but must not become a parallel resolver or source of state. |
| R24 | ECP-1 composition remains the only automatic producer of resolved sensory cues. SEN-1 remains the consumer/receiver owner; Reaction Gate consumes awareness bindings. | Do not move emission composition into receiver or reaction code, and do not make `RuntimeEvent` authoritative. |

Migration: add the minimum threat-awareness and warning bindings required by real public callers. Route Fire Blast's prepared danger through the new bridge. Preserve existing serialized data unless an audited schema requires migration; if persisted schema changes, provide explicit versioning/migration and refuse malformed legacy data rather than guessing. Do not deprecate the permanent authorized host/GM resolved-cue boundary.

Required decisions: none in the accepted rule system. Repository-dependent pauses remain mandatory if the audit finds no authoritative ally/group relationship, initiative formula, Action duration/effect contract, or communication action seam. For each gap, show the exact missing contract, alternatives, recommendation, and affected units before continuing.

## 4. Implementation and coordination

Paths below are planned ownership areas, not verified filenames except where identified as user-reported. U0 must replace them with verified paths before edits.

| Unit | Existing seam / planned change | Owned files | Depends on | Validation |
|---|---|---|---|---|
| U0 | Audit current threat projection, prepared snapshot, SEN-1 Detection result, Reaction Gate, reaction queue/scheduler, initiative, relationship/group facts, neutral Action duration/cost, Fire Blast, serialization, and exports. Record exact seams and commands. | Read-only audit; no production edits | — | T1 |
| U1 | Lock stable threat/subject awareness identity, phase-attempt state, first-success deduplication, provenance, serialization, and stale bindings using existing ECP-1 identities where possible. | Verified ECP-1 composition/preparation and runtime binding paths | U0 | T2–T5 |
| U2 | Add or expose the minimum generic effect-point timing needed to compare response effectiveness with impact, preserving existing action scheduling and units. | Verified neutral action/timing/scheduler paths | U0 | T6–T7 |
| U3 | Connect prepared per-subject danger through SEN-1 to subject defensive Reaction Gates. No intensity shortcut. | Verified composition integration, SEN-1 public boundary, user-reported `gameplay/senses/reaction-gate.ts` or current equivalent | U1, U2 | T8–T12 |
| U4 | Select the earliest eligible allied observer, resolve exact Detection-time ties through existing initiative, create one intervention gate, and preserve later ordinary awareness. | Verified relationships, Detection ordering, reaction queue/initiative paths | U1, U3 | T13–T16 |
| U5 | Implement the ordinary warning as a real neutral Action paid from the shared Turn pool, tied to a communication profile and source cue. Reuse existing communication/action contracts. | Verified action/profile, cost/settlement, sensory composition paths | U2, U4 | T17–T20 |
| U6 | Resolve intended recipients and interceptors through SEN-1; apply threat-scoped awareness/Detection concealment relief; open a gate only for a timely endangered recipient; prevent recursive propagation. | Verified SEN-1, Concealment, Detection, relationship/runtime paths | U5 | T21–T25 |
| U7 | Revalidate and settle gates in Detection-time/initiative order; handle cancellation, redirection, new threat identities, exact-time ties, late effects, and atomic rejection. | Verified scheduler, Reaction Gate, coordinator/settlement paths | U2–U6 | T26–T29 |
| U8 | Wire Fire Blast through the complete production path; add architectural guards, exports, and focused/full regressions. | Verified Fire Blast/action-lifecycle tests, package exports, architecture tests | U3–U7 | T30–T33 |

Execution order: U0 audit → contract lock for U1/U2 → U3 direct subject bridge → U4 allied selection → U5 warning Action → U6 reception/concealment → U7 ordering/revalidation → U8 production integration → focused tests → mapped mutations → final gates.

One writer is the default. Delegation is not authorized by this ticket. If the user separately authorizes agents, lock shared contracts first, give disjoint units explicit file ownership, and keep U3/U7/U8 with one integrator because they touch shared lifecycle seams.

Use the smallest coherent implementation. Extend existing identities and scheduling structures instead of introducing a universal event object, second reaction queue, parallel initiative system, generic rules language, or cross-action cache.

## 5. Decision and evidence discipline

Ask the user before choosing any significant missing behavior, numerical duration/intensity, group schema, initiative formula, persisted-schema migration, public API break, destructive action, new dependency, scope expansion, or contradiction with the accepted design. In particular, do not choose a warning duration or invent an out-of-combat initiative roll if the repository supplies neither.

Continue independent authorized work when possible, but pause any dependent unit. Ordinary naming, file placement consistent with existing architecture, private helper design, and equivalent internal algorithms may be chosen and reported briefly.

Classify evidence in the completion report:

- verified now from repository/tests;
- user-reported historical baseline;
- accepted rule decision from this ticket;
- executor-chosen internal implementation detail;
- unresolved or not run.

## 6. Acceptance and test map

Replace planned suite paths with audited real paths. Reuse existing Fire Blast, action lifecycle, sensory, reaction, runtime, and architecture suites rather than creating isolated duplicate harnesses.

| Test | Rule | Scenario and observable expected result | Smallest suite |
|---|---|---|---|
| T1 | R24 | Architecture audit proves current ownership/import direction and records exact public seams without production change. | Existing architecture tests + targeted search |
| T2 | R1 | Same prepared Fire Blast retains one threat identity across eligible phases; redirect/secondary consequence does not silently alias it. | Threat/composition focused suite |
| T3 | R2 | Area fixture with multiple endangered subjects creates independent subject bindings and outcomes. | Threat/composition focused suite |
| T4 | R5 | Failed early Detection retries later; first success prevents every later duplicate attempt/gate. | Awareness focused suite |
| T5 | R6 | Several successful sensory routes preserve provenance but yield one awareness result and gate. | SEN-1 integration suite |
| T6 | R18 | Default response effect equals authoritative Action completion; authored override uses its declared effect point. | Action timing focused suite |
| T7 | R19 | Before, after, and exact-equality impact comparisons yield timely, late, and initiative-ordered outcomes. | Scheduler/reaction focused suite |
| T8 | R3–R4 | Fire Blast danger passes through real SEN-1 resolution and discloses only threat, urgency, timing, and coarse direction. | Fire Blast + sensory integration suite |
| T9 | R4 | Broken/incompatible receiver or failed route cannot open a gate despite high danger intensity. | SEN-1 + reaction focused suite |
| T10 | R7 | Successful endangered-subject Detection opens one bound gate but does not bypass legality or Action cost. | Reaction Gate suite |
| T11 | R5 | Declined, expired, spent, or unusable first gate does not reopen on later phase. | Reaction Gate lifecycle suite |
| T12 | R22 | Changed bound revision rejects authorization/settlement atomically without resource charge. | Runtime/action settlement suite |
| T13 | R8 | Earliest detecting eligible allied observer alone receives the intervention gate; later observers remain aware only. | Allied-observer focused suite |
| T14 | R9 | Simultaneous allied observers use authoritative initiative; highest becomes the sole intervention observer. | Initiative/reaction suite |
| T15 | R9–R10 | Simultaneous target and selected observer are ordered by initiative, and both retain gates while the unchanged threat/time permits. | Reaction ordering suite |
| T16 | R10 | First response cancels or redirects threat; later gate is revalidated and becomes stale/updated rather than settling against old facts. | Reaction settlement suite |
| T17 | R11 | Warning declared through intervention gate charges exactly one shared Turn Action and no independent reaction resource. | Action-cost/reaction suite |
| T18 | R11 | Insufficient shared Actions rejects warning atomically. | Action-cost suite |
| T19 | R12 | Warning produces a separate traced communication cue referencing the originating threat; no direct awareness mutation occurs. | Communication/sensory integration suite |
| T20 | R13 | Same-scene group member is only a candidate; failed communication route/Detection yields no information. | Communication reception suite |
| T21 | R14 | Ordinary warning is detectable by an unintended compatible observer; explicit private method excludes unauthorized recipients. | Sensory interception suite |
| T22 | R15 | Non-endangered recipient detects warning, receives information, and receives no Reaction Gate. | Warning/reaction integration suite |
| T23 | R15 | Endangered unaware recipient detects a timely warning and receives their one defensive gate; pre-existing direct success prevents duplication. | Warning/reaction integration suite |
| T24 | R16 | Warning removes only threat-scoped awareness/Detection disadvantage; invisibility, targeting, cover, and unrelated concealment remain. | Concealment integration suite |
| T25 | R17 | Warning recipient does not automatically emit a second warning; a second transmission requires another paid Action. | Communication lifecycle suite |
| T26 | R20 | Pre-release warning chain may complete and enable defense before launch/impact. | Fire Blast timing E2E |
| T27 | R18–R20 | Distant post-release threat permits warning and defense when both effect points precede impact. | Fire Blast timing E2E |
| T28 | R18–R20 | Close/fast threat reaches impact first; late warning may inform but cannot retroactively authorize an effective defense. | Fire Blast timing E2E |
| T29 | R19 | Response and impact at equal timestamp use initiative and settle deterministically. | Scheduler/reaction suite |
| T30 | R1–R24 | Real Fire Blast path runs preparation → per-subject danger → SEN-1 → ordered gate(s) → optional warning → recipient Detection → response timing → atomic settlement. | Fire Blast production integration suite |
| T31 | R23 | Trace/serialization round-trip preserves required identities, ordering evidence, timing, and reasons without becoming authoritative input. | Serialization/trace suite |
| T32 | R24 | Architecture guards reject automatic cue production in SEN-1/Reaction Gate and reject `RuntimeEvent` authority or forbidden imports. | Architecture suite |
| T33 | Preserve | Existing ECP-1, SEN-1, action, item/skill, reaction, runtime, and campfire behaviors remain green. | Affected suites + final engine suite |

Mutation map:

- M1: permit a later phase to reopen a gate after first success → T4/T11 must fail.
- M2: create one group-level danger result instead of per-subject bindings → T3 must fail.
- M3: open a gate directly from danger intensity without SEN-1 → T9 must fail.
- M4: create one gate per successful sensory route → T5 must fail.
- M5: select the latest allied observer instead of earliest → T13 must fail.
- M6: allow all simultaneous allied observers to receive intervention gates → T14 must fail.
- M7: let observer selection erase the endangered subject's gate → T15 must fail.
- M8: make the warning free or charge an independent reaction pool → T17/T18 must fail.
- M9: transfer awareness directly without a communication cue and Detection → T19/T20 must fail.
- M10: restrict ordinary warning visibility to intended group members → T21 must fail.
- M11: give a non-endangered warning recipient a Reaction Gate → T22 must fail.
- M12: allow timely warning to create a second gate for an already-aware endangered subject → T23 must fail.
- M13: clear targeting/invisibility disadvantage together with awareness disadvantage → T24 must fail.
- M14: recursively rebroadcast detected warnings without another Action → T25 must fail.
- M15: validate reaction declaration time instead of effect time → T28 must fail.
- M16: treat `effectiveAt === impactAt` automatically as success without initiative → T29 must fail.
- M17: settle a later gate against pre-reaction threat state after redirect/cancellation → T16 must fail.
- M18: accept a stale revision and partially charge resources → T12 must fail.
- M19: make warning timing or sensory results authoritative through `RuntimeEvent` → T32 must fail.

Apply, test, and restore mutations separately. Use each mutation's smallest mapped suite. Verify exact restoration, including uncommitted ECP-2 changes, before final gates. Investigate every survivor; strengthen the relevant test or document true redundancy/unreachability. Do not count syntax failures as killed behavioral mutations.

## 7. Execution and context budget

Audit with `rg`, `rg --files`, package manifests, and bounded reads. Start from the real Fire Blast call path and Reaction Gate consumer rather than searching the whole repository indiscriminately. Record a concise seam map once and reuse it.

Plan shared contracts before patching. Keep identity/timing contracts, direct bridge, allied selection, warning action, reception/concealment, and E2E integration as coherent workstreams. Avoid repeated import churn and cosmetic whole-file rewrites. Inspect one focused diff after each completed workstream.

Testing schedule:

1. Inspect package scripts and establish current engine baseline once if the current tree/environment differs from the trustworthy ECP-1 report. Record exact pre-existing failures by identity.
2. After U1/U2, run identity, serialization, action-timing, and typecheck-focused checks.
3. After U3/U4, run SEN-1, Reaction Gate, initiative, action lifecycle, and Fire Blast preparation suites.
4. After U5/U6, run communication, Concealment, Detection, cost, interception, and warning integration suites.
5. After U7/U8, run Fire Blast E2E, runtime/settlement, architecture, and all affected regression suites.
6. Run every mutation only against its mapped minimum suite and restore immediately.
7. After all restoration, run one final full engine suite, engine typecheck, any nonduplicative required root/monorepo gate, and whitespace/diff checks. If Workbench still fails, compare exact error identities with baseline rather than counts alone.

Do not run both a package suite and a root wrapper that merely invokes the same suite. Do not repeatedly paste successful logs. Preserve focused failure excerpts and full exit codes locally where supported.

## 8. Verified commands and completion

Exact commands could not be independently audited in the ticket-authoring workspace. U0 must read the current manifests and replace each placeholder below in the execution notes before implementation. Do not guess package-manager commands from history.

| Gate | Exact command / working directory | Frequency |
|---|---|---|
| Focused tests | Verify current engine test runner and pass audited focused paths/patterns from T1–T33 | After affected units + mapped mutations |
| Full engine tests | Verify the nonduplicative engine package test command | Baseline if required; mandatory final |
| Engine typecheck | Verify the engine package typecheck command | After broad contracts; mandatory final |
| Root/monorepo typecheck | Verify whether it adds coverage beyond engine typecheck | Baseline comparison and final only if applicable |
| Lint/build | Run only scripts required by current repository instructions/manifests | Risk-based; final if required |
| Diff/whitespace | `git diff --check` from repository root, plus status/diff review | Mandatory final |

Done means R1–R24 are satisfied through real public callers; T1–T33 are accounted for; M1–M19 are killed for their intended reasons or any true redundancy is explicitly demonstrated; all mutation residue is removed; Fire Blast proves the full lifecycle; no automatic group knowledge, duplicate gate, free warning, unauthorized concealment removal, stale settlement, or timing shortcut remains; and final applicable gates are recorded.

Do not commit unless the user separately authorizes a local commit. Never push or modify a remote repository.

Completion report:

- outcome and any deviations from R1–R24;
- branch and HEAD; local commit SHA only if separately authorized;
- exact working-tree leftovers, including preserved user files;
- changed files grouped by purpose;
- verified seam choices for relationships, initiative, communication, and timing;
- baseline and final test counts/commands;
- focused, full, typecheck, lint/build, and diff results;
- M1–M19 results and any survivor investigation;
- pre-existing failures compared by exact identity;
- executor-chosen internal details;
- unresolved risks and every unrun check;
- explicit statement that no push or remote write occurred and pushing is left to the user.
