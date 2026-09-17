# Detection, Concealment, and Investigation — AI Execution Plan

**Ticket ID:** DCI-1

**Starting point:** `24e13d3` on `main`, pushed

**Reported baseline:** 133 engine test files / 5,380 tests passing; engine typecheck clean; 65 unrelated Workbench typecheck errors

**Execution:** one integrated writer. Detection types, passive resolution, concealment state, Reaction Gate preparation, sensory exports, and Nen adapters overlap too heavily for independent writers.

## 1. Objective

Replace the current information-band Detection model with a binary detected/undetected model that feeds the existing Detection-based Reaction Gate. Preserve information bands for Perception and Investigation. Add retained, observer-relative Concealment; convert the amount by which Concealment defeats Passive Detection into one through four Reaction disadvantages; make active searching use the same Detection mechanic without the passive-failure penalty; and wire awakened Nen perception plus ordinary Zetsu's existing Aura Concealment contribution into the generic sensory route.

There must be no third “prompted Detection” step between Passive Detection and combat. A concealed threat is discovered in exactly one of these ways:

1. Passive Detection automatically defeats its established Concealment.
2. A rolled Detection check succeeds because the observer deliberately searched or because a declared threat reached the existing Reaction Gate.

Detection discovers a subject. Investigation analyzes evidence already obtained. Do not make Investigation another route for discovering an otherwise undetected attacker.

## 2. Verified starting point

The executing agent must confirm the repository still matches this description before editing:

- `character/foundation/senses/` already owns sensory scopes, signatures, access, profiles, Perception, Concealment, Detection, Investigation, information bands, validations, and public exports.
- Detection currently returns `none/minimal/partial/substantial/full`, and passive candidate sweeps group notifications by their best information band.
- Investigation independently uses those bands to reveal authored findings after evidence, Skill, and knowledge prerequisites are checked.
- Perception independently uses information bands for the quality of raw reception. Neither Perception nor Investigation should lose those bands.
- Concealment already supports passive, active, and established resolutions. Established Concealment retains supplied dice, but there is no runtime/lifecycle state recording which observers have broken it.
- Detection currently requires a perceived cue and a route-matching `ConcealmentRating`, opposes the Detection total against Concealment, and treats a margin below `1` as no information.
- The universal check system already represents net advantage as a signed integer. Positive keeps the highest die, negative keeps the lowest, and the caller must supply exactly `1 + abs(advantage)` d20s.
- Combat already creates Reaction opportunities and queues threatened combatants. It deliberately accepts the success/failure of an external Detection-based Reaction Gate; it does not resolve Detection itself.
- `resolveCharacter()` resolves a sensory profile but currently fails to pass the character's stored awakened Nen state through `nenAwakened`, even though `Character` now stores `NenState`.
- `resolveZetsuAuraConcealment()` already returns the running ordinary Zetsu activity, provenance, effective mastery, and accepted `+1/+1/+1/+2/+2/+3/+3/+4/+4/+5` modifier. No sensory consumer currently applies it.
- Forced and involuntary suppression deliberately receive no learned-Zetsu concealment contribution.
- Range, line of sight, sound propagation, and environmental transmission remain host-authored through supplied signatures and contextual advantage/disadvantage.

Before editing, find every public caller, export, and test for `DetectionResolution`, `DetectionNotification`, `resolvePassiveDetection`, `resolveDetectionCheck`, `resolvePassiveDetectionCandidates`, `InformationBandOverride` on Detection, `ConcealmentResolution`, `establishConcealment`, `shouldRerollEstablishedConcealment`, Reaction queues/gate success, `resolveSensoryProfile`, `nenAwakened`, and `resolveZetsuAuraConcealment`.

## 3. Source-of-truth rules

### 3.1 Concealment lifecycle

A deliberate hiding attempt resolves Concealment once. Its route ratings become established Concealment and remain retained until one of these occurs:

- an observer detects the concealed subject;
- the concealing source voluntarily ends it;
- its method materially changes and the caller establishes a new attempt;
- an action or effect explicitly reveals it;
- the original concealment becomes impossible.

An attack does not reveal its source merely because it occurred. A failed Reaction Detection leaves Concealment intact. Content may explicitly reveal its source as a special effect.

Concealment is observer-relative. Detection by one observer does not reveal the subject to every observer. Maintain stable subject, attempt, source, and observer identity; do not infer identity from display text or route strings.

One observer detecting the subject breaks the attempt against that observer as a whole for combat awareness. Do not require that observer to rediscover the same entity independently through sight, hearing, and every other route. Route specificity still determines which route can produce the successful Detection check and which modifiers apply.

### 3.2 Passive Detection

Passive Detection never rolls. For each valid route, compare the observer's resolved passive Detection total `P` with the established Concealment total `C`:

\[
P>C \Rightarrow \text{detected}
\]

A tie favors Concealment. If any valid route detects the subject, mark Concealment broken for that observer. Passive Detection returns a binary result plus totals, margin, winning route, provenance, and trace; it does not return an information band.

### 3.3 Concealment Lead and Reaction disadvantages

When Passive Detection does not break Concealment, compute:

\[
L=C-P
\]

`L` is the Concealment Lead for that observer and route. It is always non-negative after a passive failure.

| Concealment Lead | Reaction disadvantages |
|---:|---:|
| `0–4` | `1` |
| `5–9` | `2` |
| `10–14` | `3` |
| `15+` | `4` |

The authoritative formula is:

\[
D=\min\left(4,\ 1+\left\lfloor\frac{L}{5}\right\rfloor\right)
\]

Expose a pure derivation for this table. Reject non-finite totals; never silently coerce them.

The disadvantages must be calculated before runtime dice are requested. If the caller supplies other signed advantages/disadvantages `A`, the final signed advantage level is:

\[
A_{final}=A-D
\]

Pass `A_final` through the existing `projectCheckDice()` route so the supplied roll count is exactly `1 + abs(A_final)`. Do not receive a one-die check and then silently add disadvantages inside Detection.

Do not derive more disadvantages from the same margin elsewhere. Independent conditions—warning, darkness, distance, noise, sensory impairment, special equipment, or supernatural effects—may change `A`, but the same circumstance must not be counted twice.

### 3.4 Active Detection

A player may deliberately search. Active Detection rolls against the retained route-matching Concealment total and uses ties-fail:

\[
\text{Detection total}>C \Rightarrow \text{detected}
\]

The Concealment Lead penalty does not apply to active searching. It represents recognizing an unexpected attack quickly enough to react, not a focused search. Ordinary contextual advantages/disadvantages still apply.

Success breaks Concealment for that observer. Failure leaves it intact. The foundation resolver does not charge an Action or time; the gameplay caller supplies the already-authorized search and its dice.

### 3.5 Detection-based Reaction Gate

Every declared credible threat continues to use the existing Reaction opportunity and queue. Add one high-level sensory/combat adapter that resolves the Gate rather than teaching generic Combat about senses.

For a threat from a source already detected by the reacting combatant, resolve the ordinary Reaction Detection check without Concealment Lead disadvantages.

For a threat from a source still concealed from that combatant:

1. resolve the applicable retained Concealment and Passive Detection snapshot;
2. derive `D` from the Concealment Lead;
3. reconcile `D` with independent signed advantage before requesting/projecting dice;
4. roll Detection against the same established Concealment total, ties fail;
5. on success, queue the Reaction through the existing queue transition and atomically mark Concealment broken for that observer;
6. on failure, use the existing failed/declined Gate transition and leave Concealment intact.

A successful Gate occurs before attack settlement. Any benefit requiring the target to remain unaware does not apply against that target. A failed Gate opens no Reaction; concealment-dependent attack benefits may apply, but accuracy, interception, protection, Aura reinforcement, and damage still resolve normally.

For multiple threatened combatants, resolve each Gate independently in the queue's existing order. Their Passive Detection, routes, advantage, and concealment-broken state may differ. A warning is an independent advantage contribution, never automatic success.

### 3.6 Detection is binary; Perception and Investigation keep bands

Remove information bands and `informationOverride` from Detection requests, resolutions, passive candidate notifications, and exports. Detection returns at minimum:

- `detected: boolean`;
- Detection and Concealment totals;
- signed margin;
- route and mode;
- resolved check when a roll occurred;
- trace.

Preserve Perception's three outcomes (`inaccessible`, `not-perceived`, `perceived`) and its reception bands. A Detection attempt still requires an accessible/perceived cue through a matching route; this ticket does not make impossible senses usable.

Preserve Investigation's information bands and finding gates exactly. Investigation may oppose a fixed difficulty or informational Concealment and reveals only findings whose evidence, Skill, knowledge, and band requirements are satisfied.

### 3.7 Passive candidate sweeps

Migrate passive candidate sweeps to binary notifications rather than deleting their crowd-control value:

- each candidate keeps importance, routes, and optional grouping;
- a candidate is included when any valid route detects it;
- remove `minimumNotificationBand` and notification `band`;
- retain successful route results and the best positive margin for ordering/tracing;
- group candidates as today and sort by importance, then best margin;
- malformed candidates fail the sweep instead of being silently dropped.

### 3.8 Nen perception and Zetsu

Pass `isNenAwakened(character.nen)` into normal sensory-profile resolution. Preserve explicit grants and suppressions. Do not create a second awakening test inside the sensory foundation.

Wire the existing ordinary-Zetsu concealment contribution into a generic contextual Concealment modifier. It applies only when:

- ordinary learned Zetsu is actually running and legal;
- the route's phenomenon is `nen`;
- the subject is the character's Aura/supernatural presence (`entity` or `phenomenon`, as authored by the supplied signature);
- the route otherwise matches normally.

It never applies to `physical` phenomena, ordinary tracks, heat, sound, smell, sight of the body, or other physical evidence. Forced and involuntary suppression receive no learned modifier.

Keep signature production host-supplied in this ticket. Do not invent an Aura intensity/range table or decide that Nen must be perceived through one particular physical sense. The adapter consumes caller-supplied Nen signatures and live runtime/Nen state. A later Aura-signature authoring ticket may automate which signatures a particular Output state emits.

When current Aura presence is successfully detected, expose a stable generic evidence id for Investigation (for example a declared constant such as `nen.presence`). Do not author Hatsu-specific residue, affinity, technique-identity, or Output-estimation findings here.

## 4. Architecture

Keep `character/foundation/senses/` authoritative for pure sensory calculations. Recommended additions are:

- a pure Concealment lifecycle/state module for established attempt identity and per-observer broken state;
- a pure Detection outcome/lead module for binary comparison and disadvantage derivation;
- a character-facing sensory adapter that combines resolved character profiles, supplied signatures, runtime state, and Zetsu contributions;
- a combat-facing Reaction Gate adapter that prepares advantage before dice projection and then tells the existing Reaction queue success or failure.

Exact filenames may follow repository conventions discovered during implementation, but ownership must remain clear:

- generic checks know dice and modifiers, not concealment lifecycle;
- generic senses know routes, totals, binary Detection, and Investigation findings, not Nen principle ids;
- the Zetsu adapter remains the only producer of learned-Zetsu concealment;
- the character-facing adapter may call Zetsu and project a generic modifier;
- Combat consumes the resolved Gate outcome and must not import `zetsu.ts`, inspect mastery, or recompute a sensory score;
- Aura must not import the sensory domain;
- Investigation must not query scene state or invent evidence.

Do not keep compatibility aliases for removed band-shaped Detection APIs. Migrate all engine callers and tests in the same change so stale consumers fail at compile time.

## 5. Implementation work

### 5.1 Binary Detection migration

Rewrite Detection request/result types, passive resolution, active/reaction resolution, validation, traces, barrels, package exports, fixtures, and tests. Use explicit `detected` and retain signed `margin`; remove Detection-only information-band inputs and outputs.

Both passive and rolled Detection use ties-fail. Route mismatch and unavailable sense remain inspectable failures, not false Detection results.

### 5.2 Established Concealment state

Add immutable transitions to:

- establish one validated attempt from a resolved Concealment result;
- query whether it remains concealed from an observer;
- record Detection by one observer exactly once;
- voluntarily end it;
- replace/reroll it only when the caller declares a material change;
- reject duplicate ids, unknown observers/attempts, malformed routes, invalid totals, and temporal contradictions.

Do not mutate the retained roll when another observer checks it. Do not let one observer's success erase the state for everyone.

### 5.3 Passive comparison and lead preparation

Implement pure, traceable helpers for:

- passive binary comparison;
- best applicable route selection without duplicate rolls;
- Concealment Lead;
- the capped one-through-four disadvantage table;
- final signed advantage reconciliation.

Use the observer's best valid sensory route. Several valid senses are not several Detection rolls. Independent multi-sense benefits may arrive as authored/contextual advantage.

### 5.4 Active search

Provide a character-facing active-search resolver that consumes an authorized search request, supplied dice, the observer profile, candidate signatures, and established Concealment. It returns the Detection result, any generic evidence, and an updated immutable Concealment state.

Do not add an Action price inside the foundation. The action system or host remains responsible for authorizing and charging the search.

### 5.5 Reaction Gate integration

Add preparation and settlement as separate steps because dice are supplied externally:

- preparation returns the next Reaction opportunity, applicable route, Concealment total, Passive Detection total, lead, concealment disadvantages, independent advantage, final signed advantage, and required d20 count;
- settlement accepts exactly the required dice, resolves Detection, updates Concealment on success, and advances the existing Reaction queue through its canonical success/failure transition.

Both steps must bind to the same trigger, reacting combatant, concealment attempt, observer, source, and route so a prepared favorable check cannot be replayed against another threat. Refuse stale preparation if the queue, attempt, route, or observer state changed.

### 5.6 Passive sweep migration

Rewrite passive candidate aggregation around binary detections, preserving grouping, importance, route results, validation, deterministic order, and traces. Remove band thresholds from the public shape.

### 5.7 Investigation regression boundary

Keep Investigation's existing resolution and bands. Update imports/types only where Detection's removed band shape leaked into shared fixtures or exports. Add regression tests proving Detection no longer exposes bands while Investigation still resolves all five.

### 5.8 Nen and Zetsu integration

Update `resolveCharacter()` to project awakened Nen into the sensory profile. Add a character-facing conversion from `resolveZetsuAuraConcealment()` to one contextual `CheckModifierContribution` with exact Nen-presence scope and original provenance.

Apply that modifier through the universal check-modifier path; do not add it directly to a total. Confirm inactive, forced, involuntary, sealed-to-zero, and physically scoped routes receive no bonus.

Expose one generic Nen-presence evidence id on successful current-presence Detection. Keep all Hatsu-specific evidence and findings deferred.

### 5.9 Cleanup and documentation

Update the sensory README and public comments to describe the two Detection mechanisms, binary Detection, retained Investigation bands, Concealment Lead, and Reaction integration. Remove stale statements that Character lacks `NenState` or that Detection returns information bands.

Delete dead Detection band helpers/imports only when no Perception or Investigation consumer needs them. The shared `information.ts` remains because both still do.

## 6. Required tests

Create focused integration coverage and rewrite existing sensory tests to cover:

### Concealment lifecycle

- one concealment attempt retains its ratings across observers and attacks;
- one observer detects it without revealing it to another;
- an attack alone does not break it;
- explicit reveal/end breaks it as authored;
- a material change creates a new retained attempt; an immaterial change does not reroll;
- malformed, duplicate, stale, or mismatched identities refuse without mutation.

### Passive Detection and lead

- `P > C` detects automatically;
- `P === C` remains concealed;
- lead `0–4/5–9/10–14/15+` produces `1/2/3/4` disadvantages;
- lead above the final band remains capped at four;
- non-finite totals refuse;
- the best valid route detects once rather than rolling once per sense.

### Active Detection

- active search rolls against retained Concealment with ties failing;
- it does not inherit Concealment Lead disadvantages;
- contextual advantages/disadvantages still apply;
- success breaks Concealment only for that observer;
- failure preserves it.

### Reaction Gate

- preparation computes disadvantages before dice projection and reports the required count;
- net advantage equals independent advantage minus concealment disadvantages;
- wrong roll count refuses;
- success queues/opens the canonical Reaction path and atomically breaks Concealment;
- failure uses the canonical failed Gate path and preserves Concealment;
- an already-detected source receives no Concealment Lead penalty;
- multiple threatened characters resolve independently in queue order;
- stale preparation cannot be replayed against another trigger, observer, route, or attempt;
- warning advantage reconciles rather than granting automatic success;
- no third Detection check is created between declaration and the Gate.

### Binary migration and passive sweeps

- passive, active, and reaction Detection return `detected`, totals, margin, route, and trace with no band;
- passive sweeps include candidates detected through any route, group them, and sort by importance then margin;
- undetected candidates are omitted;
- malformed candidates fail rather than disappear;
- public exports contain no Detection notification-band threshold API.

### Investigation and Perception regressions

- Perception retains inaccessible/not-perceived/perceived and reception bands;
- Investigation retains none/minimal/partial/substantial/full;
- evidence, Skill, knowledge, and required-band gates remain intact;
- successful Detection can supply generic Nen-presence evidence;
- Investigation cannot manufacture missing evidence.

### Nen and Zetsu

- resolved awakened characters receive Nen perception through the real character-resolution route;
- unawakened characters do not unless an explicit grant supplies it;
- explicit suppression still removes it;
- all ten ordinary-Zetsu modifiers reach only matching Nen-presence Concealment;
- physical routes receive none;
- inactive, forced, and involuntary Zetsu receive none;
- seals update or remove the contribution through the existing runtime legality rules;
- Aura, Combat, and generic senses contain no principle-id branch.

## 7. Mutation checks

After ordinary tests pass, introduce each mutation, confirm the intended test fails, then revert it:

1. Let a passive tie detect the subject.
2. Change lead `5–9` from two disadvantages to one.
3. Remove the four-disadvantage cap.
4. Apply the passive-failure penalty to active searching.
5. Calculate disadvantages after dice were supplied.
6. Let a successful Reaction Gate open without breaking Concealment.
7. Let a failed Reaction Gate break Concealment because an attack occurred.
8. Reveal the subject to every observer when one observer succeeds.
9. Restore Detection information bands.
10. Remove Investigation information bands.
11. Let malformed passive candidates disappear silently.
12. Fail to project stored awakening into Nen perception.
13. Apply Zetsu's bonus to a physical route.
14. Give forced/involuntary suppression the learned-Zetsu bonus.
15. Let Combat or generic senses branch on/import Zetsu.
16. Permit a prepared Gate check to settle against a different trigger or concealment attempt.

Report the exact tests that catch each mutation. If a defensive branch is genuinely unreachable, demonstrate why and report it rather than manufacturing an invalid public path solely for mutation coverage.

## 8. Out of scope

- Automatic Aura signature intensity, range, or line-of-sight generation.
- A rule selecting one canonical physical sense for Nen perception.
- Hatsu-specific evidence, residue, affinity, technique identity, or Output estimation.
- Ken, Gyo, En, In, or other unfinished principle mechanics.
- New sneak-attack damage formulas; this ticket only supplies whether the target detected the threat and received a Reaction.
- General action pricing for active searches or Investigation.
- Workbench/Foundry UI except the smallest compile repair required by a changed public engine type.
- Rewriting universal advantage/disadvantage or runtime dice semantics.

## 9. Acceptance criteria

- Detection is binary everywhere; only Perception and Investigation retain information bands.
- Passive Detection automatically breaks Concealment only when `P > C`; ties remain concealed.
- A passive failure produces exactly one through four capped Reaction disadvantages from the accepted five-point table.
- Concealment disadvantages are included before dice projection and reconcile with independent signed advantage.
- Active searching does not inherit the passive-failure penalty.
- The existing combat Reaction Gate consumes the Detection result without learning sensory or Nen rules.
- Successful Reaction Detection opens the canonical Reaction path and breaks Concealment for that observer; failure does neither.
- Concealment persists across attacks and observers until actually broken or explicitly ended.
- Passive candidate sweeps remain useful but binary.
- Investigation findings and bands remain intact.
- Normal character resolution projects awakened Nen perception.
- Ordinary Zetsu's existing modifier reaches only matching Nen-presence Concealment through the universal modifier path.
- Forced/involuntary suppression receives no learned bonus.
- Generic checks, senses, Combat, runtime, and Aura remain principle-neutral.
- Focused suites, full engine tests, and engine typecheck pass; monorepo failures match the unrelated baseline.
- No compatibility alias, skipped test, `.only`, unresolved TODO, dead export, or unrelated refactor remains.

## 10. Verification

Run from the repository root, adapting focused filenames only after discovering exact suite names:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check

npm test -w @nenworld/engine -- \
  src/__tests__/senses-profile.test.ts \
  src/__tests__/senses-perception.test.ts \
  src/__tests__/senses-concealment.test.ts \
  src/__tests__/senses-detection.test.ts \
  src/__tests__/senses-investigation.test.ts \
  src/__tests__/senses-integration.test.ts \
  src/__tests__/nen-zetsu.test.ts \
  src/__tests__/combat-reaction.test.ts \
  src/__tests__/combat-reaction-queue.test.ts \
  src/__tests__/runtime-protocol.test.ts \
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

Capture before/after counts. Search for remaining Detection `band`, `informationOverride`, and `minimumNotificationBand` consumers and confirm each survivor belongs to Perception, Investigation, or another unrelated band system. Search all Zetsu imports and principle-id comparisons in senses and Combat. Commit to `main` only after engine gates pass. Do not push unless explicitly authorized.

## 11. Completion report

Return:

1. commit hash, branch, clean/dirty state, and push status;
2. final Concealment lifecycle and both Detection paths;
3. Reaction Gate integration and exact advantage calculation;
4. intentional deviations with evidence;
5. production/test files changed;
6. focused, full-engine, engine-typecheck, and monorepo results with exact counts;
7. every mutation and the test that caught it;
8. baseline comparison and any bugs discovered;
9. remaining risks or deferred work, especially automated Aura signatures and Hatsu evidence;
10. confirmation that Perception and Investigation bands, Zetsu runtime behavior, Aura, and generic Combat remained otherwise unchanged.

Do not call DCI-1 complete while an acceptance criterion, required mutation, focused suite, full engine suite, or engine typecheck is failing.
