# Zetsu Finishing — AI Execution Plan

**Ticket ID:** ZET-1

**Starting point:** `8bfe6db` on `main`, pushed

**Baseline:** 128 engine test files / 5,251 tests passing; engine typecheck clean; 65 unrelated Workbench typecheck errors

**Execution:** one integrated writer; runtime, access, and character-time files overlap

## 1. Objective

Finish ordinary voluntary Zetsu as a real maintained Nen activity. Preserve the existing pure Zetsu rules, Aura recovery matrix, forced/involuntary suppression mechanics, and progression system while adding validated start/stop transitions, generic suppression projection, exact character-time behavior, and runtime-backed Aura Concealment.

Entering Zetsu is a deliberate shutdown. It permanently ends Ren and every other running activity that requires deliberate Aura access. Those activities do not resume when Zetsu ends. Leaving Zetsu restores only the character's ordinary passive state—normally Ten, when legal.

## 2. Verified starting point

The executing agent must confirm the repository still matches this description before editing:

- `foundation/nen/principles/zetsu.ts` already owns the pure Mastery I–X profiles, zero-Output suppression calculation, indefinite-maintenance result, and Aura Concealment modifier.
- Zetsu has no attribute requirement. NPR-1 makes Ren an unlock-only prerequisite; Ren mastery does not cap Zetsu.
- Every Zetsu rank suppresses Active Aura Output to zero.
- Mastery currently affects only Aura Concealment: I–III `+1`, IV–V `+2`, VI–VII `+3`, VIII–IX `+4`, X `+5`.
- Aura already supports a generic suppressed access override and voluntary suppression recovery, but callers currently supply `{ source: "zetsu", forced: false }` manually.
- Voluntary suppressed recovery is activity-dependent: ordinary `3R`, physical `R`, rest `4R`, sleep `4R`. Physical consumption remains `2R/hour`.
- Zetsu mastery does not modify recovery.
- Forced and involuntary Zetsu are stored suppression states owned by awakening/collapse mechanics. They are not learned Zetsu and never grant its mastery or concealment bonus.
- The generic maintained-activity runtime exists, but there is no `character/nen/zetsu.ts`, no ordinary Zetsu activity definition, and no validated start/stop route.
- Character time currently special-cases no principle ids, but its active-Nen calculation would incorrectly count a newly added Zetsu activity unless Zetsu projects a generic suppression contribution that can be excluded.
- The Detection/Concealment contest pipeline is unfinished; Zetsu's modifier is currently a pure value rather than a wired check contribution.

Before editing, find every caller/export/test for `resolveZetsu`, `resolveZetsuSuppression`, `deriveZetsuAuraConcealmentModifier`, voluntary `AuraSuppression`, `activeNenUse`, `deliberate-access`, runtime replacement relations, and all forced/involuntary Zetsu state transitions.

## 3. Source-of-truth rules

### 3.1 Eligibility and lifecycle

Ordinary Zetsu may start only when the character:

- is awakened;
- has effective Zetsu Mastery I or higher;
- is not already in ordinary Zetsu;
- is not currently under forced or involuntary suppression;
- supplies a structurally valid runtime, timestamp, source, and Nen state.

Zetsu has no Aura funding requirement, activation expenditure, upkeep, duration, Stamina cost, or direct Fatigue cost. It may remain active at zero Current Aura because it does not project or consume Aura. Aura depletion continues to affect Fatigue through the existing depletion rules.

Zetsu ends at the exact timestamp of:

- voluntary cancellation by the source that started it;
- effective Zetsu Mastery falling below I;
- reversion or other loss of awakened access;
- forced or involuntary suppression taking ownership of the closed-node state;
- another explicit generic invalidation.

An ordinary Zetsu stopped for any reason is ended, not resumably suspended. Nothing except passive Ten returns automatically afterward.

### 3.2 Activation is atomic replacement

Starting Zetsu must atomically:

1. validate the entire request and Zetsu eligibility;
2. identify every active runtime activity requiring the generic `deliberate-access` constraint;
3. end each identified activity at the activation timestamp with cause `replaced`, zero committed funding, and no resume permission;
4. create the ordinary Zetsu activity at the same timestamp;
5. project suppressed access from that instant onward.

If any validation fails, no activity stops, no commitment is released, no Zetsu starts, and every input remains unchanged. Do not encode a hard-coded list of techniques to stop. Activities explicitly authored to function without deliberate Aura access may remain; this is the extension point for exceptional skills.

### 3.3 Aura and recovery

While ordinary Zetsu is active:

- Active Aura Output is `0`.
- Access fraction is `0`.
- Deliberate internal and external Aura access are unavailable.
- Ten coating and Ten residual leakage do not apply.
- Half-open and uncontained leakage do not apply.
- Raw Ren attack Output is unavailable because Ren has ended.
- Zetsu itself does not set ordinary `activeNenUse`; it supplies voluntary suppression instead.

| Activity | Gross recovery | Leakage | Physical consumption | Net per hour |
|---|---:|---:|---:|---:|
| Ordinary activity | `3R` | `0` | `0` | `+3R` |
| Physical activity | `R` | `0` | `2R` | `-R` |
| Intentional rest | `4R` | `0` | `0` | `+4R` |
| Sleep | `4R` | `0` | `0` | `+4R` |

Actual sleep continues to receive the existing eight-hour completion top-off. Zetsu alone does not count as sleep and does not receive that top-off.

### 3.4 Mastery and concealment

Preserve the existing table exactly:

| Mastery | Aura Concealment modifier |
|---:|---:|
| I | `+1` |
| II | `+1` |
| III | `+1` |
| IV | `+2` |
| V | `+2` |
| VI | `+3` |
| VII | `+3` |
| VIII | `+4` |
| IX | `+4` |
| X | `+5` |

The modifier is available only while ordinary learned Zetsu is active. It applies only to Aura/supernatural-presence concealment and never changes the stored Concealment score or concealment against ordinary sight, hearing, smell, heat, tracks, touch, or other physical evidence.

Do not invent the unfinished Detection contest. Add a typed, runtime-backed projection that returns the active modifier and provenance for a future Detection consumer. Forced and involuntary Zetsu return no learned-Zetsu concealment contribution.

### 3.5 Suppression kinds remain separate

Do not add ordinary Zetsu to `NenAwakeningState.suppression`. Ordinary Zetsu is scene/runtime state; forced and involuntary Zetsu remain stored suppression states with their existing release authorities and collapse links.

Do not reuse forced-Zetsu exemptions as a general voluntary-Zetsu bypass. A skill specifically authored to function through ordinary Zetsu must express that by not requiring deliberate Aura access or through another explicit generic capability; default activities stop.

## 4. Architecture

Create `packages/engine/src/character/nen/zetsu.ts` as the only principle-specific adapter between learned Zetsu, the generic activity runtime, and generic Aura suppression. It should own, at minimum:

- the ordinary Zetsu activity definition and definition id;
- `isZetsuActivity` and `activeZetsuActivity` queries;
- eligibility/stop-cause resolution from `NenState`;
- `startZetsu` and `stopZetsu`;
- projection of an active Zetsu into a generic voluntary-suppression contribution;
- the runtime-backed Aura Concealment contribution;
- an instantaneous access projection for profile/budget callers.

The Zetsu activity should request and commit zero Aura, create no allocation, carry no upkeep, and have no duration. Its activity definition must not include `deliberate-access`, because closing deliberate access is its own effect and must not self-terminate.

If the runtime cannot atomically replace activities selected by a generic constraint, minimally generalize the runtime transition vocabulary. The generic runtime may match constraints or authored relations, but it must not compare a definition id with `"zetsu"`, import the Zetsu adapter, or learn Zetsu semantics.

The Zetsu adapter should project a generic contribution containing enough information for character time to:

- pass voluntary suppression to Aura;
- apply a suppressed access override;
- exclude the Zetsu activity itself from the generic active-Nen-use fact;
- retain the activity id and source for tracing and exact stops.

Character time may call the adapter, as it already calls the Ren adapter, but must not reproduce Zetsu rules or branch directly on the activity definition id. Aura must remain principle-neutral and must not import any Nen principle file.

## 5. Implementation work

### 5.1 Pure foundation

Review `foundation/nen/principles/zetsu.ts` and preserve its authoritative formulas. Remove stale comments only where the new runtime makes them inaccurate. Keep recovery out of this file.

### 5.2 Runtime adapter

Implement the new Zetsu adapter and public exports. Start and stop requests must validate hostile inputs before mutation and use existing runtime transition/event vocabulary. Starting a second ordinary Zetsu must refuse rather than create duplicates.

Use the current effective Zetsu mastery when projecting concealment. If a seal reduces effective mastery to zero, end Zetsu at the first coordinator boundary with cause `sealed`. If the character reverts, end it with `access-lost`. If forced or involuntary suppression is present, end it with `suppressed`; releasing that external suppression must not restart ordinary Zetsu.

### 5.3 Character-time integration

Update the real character-time path so an active Zetsu automatically supplies voluntary suppression. Callers must no longer manually restate Zetsu through `activity.initial.suppression`.

Reject contradictory input when the caller manually supplies another voluntary suppression while runtime Zetsu is already the source, unless the existing timeline contract has a principled generic merge. External forced/involuntary suppression takes precedence and ends ordinary Zetsu rather than stacking two owners of the same node state.

Ensure Zetsu is excluded from `activeNenUse`; other remaining active activities continue to determine that fact normally. Resolve exact interval rates from the projected suppression and return the updated runtime at the same timestamp as Aura and wakefulness.

### 5.4 Instantaneous access and concealment

Provide a runtime-aware access projection for callers resolving a character at an instant. While Zetsu is active it must show closed/suppressed access, zero usable Output, no coating, and no deliberate allocation authority.

Expose a typed concealment contribution without implementing Detection rolls. It must identify the activity/source, effective mastery, and modifier so a future contest resolver can consume it without re-deriving Zetsu.

### 5.5 Cleanup and boundaries

Update barrels and package exports only where the new public adapter requires them. Preserve forced/involuntary Zetsu APIs. Remove manual ordinary-Zetsu fixtures where a real runtime activity should now be used, while retaining low-level Aura tests that intentionally test generic voluntary suppression in isolation.

Add architecture guards ensuring:

- Aura never imports `zetsu.ts`;
- generic runtime never imports the adapter or branches on `"zetsu"`;
- the principle adapter is the only producer of ordinary learned-Zetsu suppression;
- character time consumes the generic contribution rather than recreating mastery, concealment, or suppression formulas;
- forced/involuntary suppression remains separate from ordinary Zetsu activity state.

## 6. Required tests

Create a focused `nen-zetsu.test.ts` and extend integration suites to cover:

### Activation and shutdown

- awakened character with effective Zetsu I can start Zetsu;
- unawakened, reverted, sealed-to-zero, forced-suppressed, and involuntary-suppressed characters cannot start it;
- malformed runtime, timestamps, source, Nen state, and mastery refuse before mutation;
- start costs zero Aura, commits zero Output, creates no allocation/upkeep/duration, and works at zero Current Aura when no other rule has already imposed collapse;
- starting Zetsu while Ren runs ends Ren at the same timestamp with cause `replaced` and no resume permission;
- every active activity carrying `deliberate-access` ends atomically;
- an explicitly authored activity without deliberate access may remain;
- a failed Zetsu start leaves all existing activities and commitments unchanged;
- a second Zetsu activation refuses;
- only the starting source may voluntarily cancel it;
- cancellation restores passive Ten when legal but never restarts Ren or another replaced activity.

### Access and time

- active Zetsu resolves zero Output, no Ten coating, no leakage, and no deliberate access;
- Zetsu itself does not zero recovery through `activeNenUse`;
- table-drive ordinary, physical, rest, and sleep through the real character-time route and assert recovery, leakage, physical consumption, net, pool, and provenance separately;
- eight-hour sleep top-off still requires sleep and fires once; waking Zetsu alone never triggers it;
- one long advance equals equivalent subdivisions in Aura, wakefulness, Fatigue, runtime, access, and absolute-timestamp events;
- ending Zetsu between advances changes rates at that timestamp and restores ordinary access;
- sealing, reversion, or external suppression ends Zetsu without automatic resumption;
- low-level generic suppression tests remain principle-neutral.

### Mastery and concealment

- pin all ten concealment values;
- active ordinary Zetsu returns the value for current effective mastery;
- inactive Zetsu returns no contribution;
- forced and involuntary Zetsu return no learned-Zetsu modifier;
- seals that leave mastery above zero lower the active modifier; a seal to zero ends the activity;
- no modifier reaches ordinary physical concealment.

### Regression and architecture

- NPR-1's unlock-only Ren → Zetsu progression remains intact;
- Zetsu mastery remains independent of Ren mastery;
- forced/involuntary release authority and collapse recovery remain unchanged;
- Ren, Ten, Aura recovery, sleep completion, and generic runtime suites remain green;
- architecture guards fail when Aura imports Zetsu, runtime branches on its id, or character time restates its mastery table.

## 7. Mutation checks

After ordinary tests pass, introduce each mutation, confirm the intended test fails, then revert it:

1. Count Zetsu as ordinary active Nen and reduce recovery to zero.
2. Leave Ten coating active during Zetsu.
3. Allow leakage during Zetsu.
4. Suspend Ren with automatic resumption instead of ending it.
5. Restart Ren when Zetsu ends.
6. Add Aura upkeep or a duration to Zetsu.
7. Change physical consumption from `2R` to `R`.
8. Apply the concealment bonus while Zetsu is inactive.
9. Give forced/involuntary Zetsu the learned concealment bonus.
10. Let generic runtime or Aura branch on/import Zetsu.

Report the exact tests that caught every mutation.

## 8. Out of scope

- A complete Detection/Concealment contest system.
- Action-economy cost or animation/timing for entering and leaving Zetsu.
- New mastery benefits or changes to the accepted concealment table.
- Changes to the recovery matrix, `R`, physical consumption, sleep completion, or Fatigue thresholds.
- Redesign of forced or involuntary Zetsu.
- Active mechanics for other unfinished principles.
- The deferred repeated `sleep-completed` event bug.
- Workbench changes unless a public engine migration directly requires the smallest caller repair.

## 9. Acceptance criteria

- Ordinary Zetsu is a validated generic runtime activity with start and stop transitions.
- It costs no Aura, commits no Output, has no upkeep, and has no duration.
- Starting it atomically ends all deliberate-access activities with no automatic resumption.
- Active Zetsu produces generic voluntary suppression, zero Output, no Ten coating, and no leakage.
- Zetsu does not count as ordinary active Nen for recovery.
- The accepted suppressed recovery matrix runs through the real character-time path.
- Leaving Zetsu restores only ordinary passive access, normally Ten.
- Its Aura Concealment contribution exists only while learned ordinary Zetsu is active and matches the accepted table.
- Forced and involuntary suppression remain distinct and grant no learned-Zetsu modifier.
- Aura and generic runtime remain principle-neutral.
- Focused suites, full engine tests, and engine typecheck pass; monorepo failures match the unrelated baseline.
- No compatibility alias, skipped test, `.only`, unresolved TODO, dead export, or unrelated refactor remains.

## 10. Verification

Run from the repository root, adapting the focused filenames only after discovering the exact suite names:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check

npm test -w @nenworld/engine -- \
  src/__tests__/nen-zetsu.test.ts \
  src/__tests__/nen-prerequisites.test.ts \
  src/__tests__/nen-ren.test.ts \
  src/__tests__/nen-suppression.test.ts \
  src/__tests__/nen-awakening-collapse.test.ts \
  src/__tests__/aura-access.test.ts \
  src/__tests__/aura-recovery.test.ts \
  src/__tests__/aura-time.test.ts \
  src/__tests__/aura-interval-invariance.test.ts \
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

Capture before/after counts, inspect all remaining `zetsu` suppression literals, and confirm each is either an intentional low-level generic-Aura fixture or migrated to the real runtime adapter. Commit to `main` only after all engine gates pass. Do not push unless explicitly authorized.

## 11. Completion report

Return:

1. commit hash, branch, clean/dirty state, and push status;
2. implemented Zetsu behavior;
3. intentional deviations with evidence;
4. production/test files changed;
5. focused, full-engine, engine-typecheck, and monorepo results with exact counts;
6. every mutation and the test that caught it;
7. baseline comparison and any bugs discovered;
8. remaining risks or deferred work, especially Detection integration;
9. confirmation that forced/involuntary Zetsu behavior remained unchanged.

Do not call ZET-1 complete while an acceptance criterion, required mutation, focused suite, full engine suite, or engine typecheck is failing.
