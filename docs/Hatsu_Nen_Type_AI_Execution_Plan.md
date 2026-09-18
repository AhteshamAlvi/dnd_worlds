# HNT-1 — Finish Nen Type and Protect the Hatsu Boundary

## 1. Starting point

- Branch: `main`
- Commit: `a2f357d` (`added nen ability folder`)
- HAT-1: `9734481`
- Expected engine baseline: 136 test files / 5,645 tests passing
- Engine typecheck: clean
- Monorepo typecheck: 65 pre-existing Workbench errors
- `packages/engine/src/character/foundation/nen/ability/placeholder.ts` exists and is intentionally empty.

Start from the latest `main`, not an older local checkout. Preserve unrelated user changes.

## 2. Objective

Finish Nen Type as an independent affinity domain and preserve Hatsu as an independent funded-Aura conversion principle.

This ticket must:

1. replace the single stored Nen Type with a complete primary-plus-lean affinity;
2. move canonical affinity ownership out of awakening state and onto `NenState`;
3. implement pure affinity-profile resolution;
4. implement assignment and discovery transitions for relevant characters while continuing to allow unassigned NPCs;
5. migrate every supported legacy/current stored shape;
6. preserve HAT-1's exact conversion curve and enforce that Hatsu and Nen Type do not import or calculate one another;
7. leave the Nen Ability subsystem untouched.

Hatsu produces power. Nen Type produces affinity percentages. The future Nen Ability subsystem will compose them.

## 3. Domain boundary

The eventual pipeline is:

```text
funded Aura
  -> Hatsu effective power
  -> Nen Ability category allocation       [future]
  -> Nen Type affinity lookup
  -> Nen Ability governed effects          [future]
```

For this ticket:

- Hatsu must not read affinity.
- Nen Type must not read Hatsu mastery or power.
- Neither domain may import `foundation/nen/ability/`.
- `ability/placeholder.ts` must remain empty and no Ability production file may be added.

## 4. Hatsu source of truth

HAT-1 is already implemented. Preserve it unless a minimal migration-only edit is required by the Nen state shape.

### 4.1 Conversion

```text
effectivePower = fundedAura * Hatsu conversionEfficiency
```

| Hatsu mastery | Conversion efficiency | Power from 100 funded Aura | May create a personal Ability |
|---:|---:|---:|---|
| I | 20% | 20 | No |
| II | 35% | 35 | No |
| III | 50% | 50 | Yes |
| IV | 60% | 60 | Yes |
| V | 70% | 70 | Yes |
| VI | 80% | 80 | Yes |
| VII | 85% | 85 | Yes |
| VIII | 90% | 90 | Yes |
| IX | 95% | 95 | Yes |
| X | 100% | 100 | Yes |

The conversion:

- accepts finite non-negative Aura already funded elsewhere;
- permits zero and returns zero;
- never rounds;
- never deducts, allocates, commits, or charges Aura;
- never enforces Output;
- never applies category affinity;
- never multiplies individual effect fields;
- is not a runtime activity.

Effective Hatsu continues to respect seals and reversion. Suppression blocks future Ability execution, not Hatsu mastery. Hatsu I–II still convert for primitive, natural, or externally granted expressions; Mastery III remains the personal-Ability creation threshold.

The existing Ability-mastery ceiling may remain where HAT-1 placed it for now. Do not expand it. Its composition can move into the Ability subsystem when that subsystem is implemented.

## 5. Nen Type vocabulary

Keep the six closed category identifiers:

```ts
type NenType =
  | "enhancement"
  | "transmutation"
  | "conjuration"
  | "specialization"
  | "manipulation"
  | "emission";
```

Add the complete affinity identity:

```ts
type NenLeanPercent = 25 | 50;

interface NenAffinity {
  readonly primary: NenType;
  readonly leaning:
    | null
    | {
        readonly toward: NenType;
        readonly percent: NenLeanPercent;
      };
}
```

Affinity knowledge becomes:

```ts
type NenAffinityKnowledge =
  | {
      readonly status: "assigned";
      readonly affinity: NenAffinity;
      readonly known: boolean;
    }
  | {
      readonly status: "unassigned";
    };
```

`unassigned` is valid. Many NPCs do not need an authored affinity. It means the record has not assigned one, not that the person metaphysically lacks a Nen Type.

Unassigned characters may continue using mechanics that do not require category affinity, including the four basic principles and Hatsu conversion. A request for an actual category percentage must refuse an unassigned affinity rather than inventing a default.

Remove the old `NenTypeKnowledge` public vocabulary rather than keeping a compatibility alias. Stored compatibility belongs in migration.

## 6. Canonical state ownership

Move affinity from:

```text
character.nen.awakening.nenType
```

to:

```text
character.nen.affinity
```

`NenState` owns the required `affinity: NenAffinityKnowledge` field. Awakening state no longer stores current affinity and its constructors no longer require one.

Awakening and reversion histories may record an affinity change that happened during their transition, but that does not make current affinity part of awakening state.

`CharacterDetails` must continue to have no writable affinity field.

## 7. Pure affinity profiles

### 7.1 Ordinary Types

Specialization is skipped when calculating the five ordinary categories:

```text
enhancement <-> transmutation <-> conjuration
     ^                                  |
     |                                  v
emission     <->     manipulation
```

For every ordinary primary:

- primary = 100;
- its two adjacent ordinary categories = 80;
- the other two ordinary categories = 60;
- specialization = 0;
- total = 380.

| Primary | Enhancement | Transmutation | Conjuration | Specialization | Manipulation | Emission | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Enhancement | 100 | 80 | 60 | 0 | 60 | 80 | 380 |
| Transmutation | 80 | 100 | 80 | 0 | 60 | 60 | 380 |
| Conjuration | 60 | 80 | 100 | 0 | 80 | 60 | 380 |
| Manipulation | 60 | 60 | 80 | 0 | 100 | 80 | 380 |
| Emission | 80 | 60 | 60 | 0 | 80 | 100 | 380 |

### 7.2 Specialist

| Primary | Enhancement | Transmutation | Conjuration | Specialization | Manipulation | Emission | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Specialization | 40 | 60 | 80 | 100 | 80 | 60 | 420 |

Specialists intentionally have access to all six categories and a larger total. Non-Specialists always resolve Specialization to 0.

Declare the base profiles once. Do not restate the table in Hatsu, awakening, character adapters, or tests as another production constant.

## 8. Lean eligibility

Lean eligibility follows the complete Nen hexagon, not the abbreviated ordinary calculation ring:

```text
enhancement <-> transmutation <-> conjuration
     ^                                  |
     |                          specialization
     |                                  |
emission      <-> manipulation <--------+
```

Use this exact directed eligibility table:

| Primary | Legal lean targets |
|---|---|
| Enhancement | Transmutation, Emission |
| Transmutation | Enhancement, Conjuration |
| Conjuration | Transmutation only |
| Specialization | Conjuration, Manipulation |
| Manipulation | Emission only |
| Emission | Enhancement, Manipulation |

Consequently:

- Conjuration cannot lean Manipulation.
- Manipulation cannot lean Conjuration.
- No ordinary Type can lean Specialization.
- Specialist may lean Conjuration or Manipulation.
- A Type cannot lean toward itself.
- Only 25 and 50 are valid non-null lean percentages.

Keep numerical affinity adjacency and legal lean direction as separately named concepts so a future refactor cannot accidentally make Conjuration and Manipulation legal lean neighbors merely because Specialization is skipped in ordinary percentage calculation.

## 9. Lean calculation

```text
delta = 0 for no lean
delta = 5 for 25% lean
delta = 10 for 50% lean
```

### 9.1 Ordinary primary

- Primary remains 100.
- First ordinary category toward the lean gains `delta`.
- Second ordinary category toward the lean gains `delta`.
- First ordinary category away from the lean loses `delta`.
- Second ordinary category away from the lean loses `delta`.
- Specialization remains 0.
- Total remains 380.

Example, Transmutation leaning Conjuration:

| Category | Pure | 25% | 50% |
|---|---:|---:|---:|
| Enhancement | 80 | 75 | 70 |
| Transmutation | 100 | 100 | 100 |
| Conjuration | 80 | 85 | 90 |
| Specialization | 0 | 0 | 0 |
| Manipulation | 60 | 65 | 70 |
| Emission | 60 | 55 | 50 |
| Total | 380 | 380 | 380 |

### 9.2 Specialist primary

- Specialization remains 100.
- Leaning Conjuration raises Conjuration and Transmutation by `delta`, lowers Manipulation and Emission by `delta`, and leaves Enhancement at 40.
- Leaning Manipulation mirrors that rule.
- Total remains 420.

Example, Specialist leaning Conjuration:

| Category | Pure | 25% | 50% |
|---|---:|---:|---:|
| Enhancement | 40 | 40 | 40 |
| Transmutation | 60 | 65 | 70 |
| Conjuration | 80 | 85 | 90 |
| Specialization | 100 | 100 | 100 |
| Manipulation | 80 | 75 | 70 |
| Emission | 60 | 55 | 50 |
| Total | 420 | 420 | 420 |

Do not round. All valid authored inputs already produce integer results.

## 10. Required pure API

Names may follow repository conventions, but Nen Type must expose these concepts:

```ts
interface NenAffinityProfile {
  readonly affinity: NenAffinity;
  readonly efficiencies: Readonly<Record<NenType, number>>;
  readonly total: 380 | 420;
}
```

- a closed category validator;
- an affinity validator;
- a legal-lean-target query;
- a complete profile resolver;
- a single-category affinity lookup;
- assigned, unknown, and unassigned constructors/readers.

The pure profile resolver accepts `NenAffinity`, not an Ability, Character, Hatsu result, or category allocation.

The character/state-facing lookup refuses `unassigned` with a stable inspectable error. It may resolve the intrinsic profile when `known: false`; knowledge affects disclosure, not the character's actual affinity.

## 11. Assignment and discovery transitions

### 11.1 Assignment

Because unassigned NPCs are valid, provide an authorized transition from `unassigned` to an assigned affinity.

The request supplies:

- complete affinity;
- whether it is initially known;
- source/provenance;
- timestamp/operation identity following existing transition conventions.

Assignment must:

- validate the complete affinity;
- refuse reassignment of an already assigned affinity;
- return an immutable new state and an inspectable transition/event result;
- not awaken the character or change mastery.

An exceptional affinity rewrite is the path for changing an already assigned affinity.

### 11.2 Discovery

Provide an authorized transition from assigned/unknown to assigned/known.

Discovery must:

- preserve primary Type;
- preserve lean direction and percentage;
- refuse unassigned affinity;
- be idempotent or produce a stable already-known no-op according to existing transition conventions;
- accept source/provenance and timestamp/operation identity;
- not prescribe water divination, a check, an item, or a teacher. The host authorizes why discovery occurred.

## 12. Exceptional affinity changes

Replace Type-only changes with complete affinity changes. The recorded transition must preserve:

- previous complete affinity, or null when previously unassigned;
- next complete affinity;
- the resulting `known` value;
- cause/provenance;
- existing awakening/reversion history linkage.

Do not infer a new lean when the primary changes. The source supplies the entire next affinity.

Fix any existing path that accepts an override's `known` value but silently stores a different value. The resulting state and recorded change must agree.

Changing affinity must not change awakening condition, mastery, seals, Aura, Hatsu efficiency, or stored Ability identifiers.

## 13. Migration and serialization

Support every stored shape the current loader already accepts, plus the current pre-ticket form.

At minimum:

```ts
{ status: "assigned", type: "emission", known: true }
```

must migrate to:

```ts
{
  status: "assigned",
  affinity: { primary: "emission", leaning: null },
  known: true
}
```

Rules:

- existing assigned Types receive no lean;
- existing unassigned records remain unassigned;
- legacy `details.nenType` still folds through the one migration boundary;
- contradictory legacy and canonical values remain refused;
- already-current `nen.affinity` round-trips without rewriting;
- old `awakening.nenType` is removed after migration and never remains a second writable source;
- malformed lean directions and percentages are refused, not normalized;
- JSON round trips preserve primary, lean, knowledge, exceptional changes, source, and time exactly.

Do not retain writable aliases at both `nen.affinity` and `nen.awakening.nenType`.

## 14. Expected implementation surface

Audit exact callers before editing. Expected production touch points include:

- `character/foundation/nen/nen-type.ts`
- `character/foundation/nen/types.ts`
- `character/foundation/nen/nen.ts`
- `character/foundation/nen/awakening/types.ts`
- `character/foundation/nen/awakening/state.ts`
- `character/foundation/nen/awakening/validation.ts`
- `character/foundation/nen/awakening/migration.ts`
- `character/foundation/nen/awakening/serialization.ts`
- `character/nen/sources.ts`
- `character/nen/exceptional.ts`
- `character/nen/reversion.ts`
- `character/nen/settlement.ts`
- `character/nen/protocol.ts`
- `character/nen/preflight.ts` if its change flag must be renamed
- `character/details.ts`
- `character/nen/index.ts` and/or package `src/index.ts`
- fixtures and all affected Nen/awakening/reversion/migration tests
- `nen-type.test.ts`
- `architecture.test.ts`

Do not edit the Ability placeholder.

## 15. Architecture requirements

Add guards proving:

- current affinity is stored in exactly one production field: `NenState.affinity`;
- awakening state has no current-affinity field;
- `CharacterDetails` has no writable affinity;
- Hatsu imports neither `nen-type.ts` nor any affinity resolver;
- Nen Type imports neither Hatsu nor `foundation/nen/ability/`;
- the empty Ability placeholder remains untouched;
- pure affinity tables have exactly one production owner;
- ordinary percentage adjacency and legal lean adjacency are not represented by one accidentally interchangeable constant;
- no caller restates the Hatsu efficiency table;
- no `startHatsu`, Hatsu runtime definition, or Hatsu activity appears.

## 16. Required tests

### Hatsu regression

- exact I–X efficiency table;
- 100 funded Aura produces 20/35/50/60/70/80/85/90/95/100;
- zero and fractional Aura remain unrounded;
- effective mastery respects seals and reversion;
- Hatsu does not read assigned, unknown, or unassigned affinity;
- the same Hatsu input produces the same power for every affinity.

### Pure affinity profiles

- every pure row exactly matches the table;
- each ordinary total is 380;
- Specialist total is 420;
- every non-Specialist resolves Specialization to 0;
- Specialist Enhancement is 40;
- all legal 25% and 50% leans resolve exact expected profiles;
- reverse directions remain different;
- ordinary primaries remain 100 and totals remain 380;
- Specialist remains 100 and totals remain 420.

### Validation

- every legal direction is accepted;
- every illegal direction is refused, especially Conjuration/Manipulation in both directions and every ordinary-to-Specialization direction;
- self-leans are refused;
- 0, 5, 10, 20, 30, 40, 51, fractions, NaN, and infinities are refused as non-null lean percentages;
- malformed categories, missing fields, surplus contradictory unassigned fields, and invalid knowledge flags are refused;
- input objects remain immutable.

### Assignment/discovery

- unassigned NPC state remains valid;
- Hatsu works for unassigned NPCs;
- affinity lookup refuses unassigned;
- assignment creates the exact supplied affinity and knowledge state;
- reassignment is refused;
- discovery preserves affinity and changes only knowledge;
- discovery refuses unassigned;
- source/time/operation semantics follow project conventions and are subdivision/serialization safe where applicable.

### Migration/lifecycle

- every historical shape migrates;
- old assigned Types become pure affinities with no lean;
- old unassigned remains unassigned;
- duplicate/conflicting legacy values are refused;
- ordinary awakening preserves affinity;
- exceptional awakening and reversion can replace the full affinity;
- the override's requested `known` value is preserved;
- state and history report the same before/after affinity;
- JSON round trips the new state exactly;
- no old writable affinity path survives.

## 17. Required mutation checks

Apply each independently, prove tests fail, and revert:

1. One Hatsu efficiency changes, including Hatsu X `1.00 -> 2.00`.
2. Hatsu imports or applies affinity.
3. Enhancement's ordinary total changes from 380.
4. Transmutation's Manipulation affinity returns to 40.
5. A non-Specialist receives nonzero Specialization.
6. Specialist Enhancement changes from 40.
7. A 25% lean moves 10 points instead of 5.
8. A 50% lean moves 5 points instead of 10.
9. Lean lowers the primary below 100.
10. Conjuration may lean Manipulation.
11. Manipulation may lean Conjuration.
12. An ordinary Type may lean Specialization.
13. Specialist may not lean Conjuration or Manipulation.
14. Lean totals are not preserved.
15. Unknown affinity is treated as mechanically absent.
16. Unassigned silently defaults to Enhancement.
17. Assignment overwrites an assigned affinity.
18. Discovery changes or rerolls the affinity.
19. Migration invents a lean for an old character.
20. Affinity remains stored under awakening as a second source.
21. Exceptional override drops or forces its requested `known` value.
22. Nen Type imports the Ability placeholder or Hatsu.
23. A Hatsu activity or `startHatsu` is introduced.

If a mutation survives, strengthen the nearest behavioral or architecture test before completion.

## 18. Explicitly out of scope

- category composition on Nen Abilities;
- ten 10% category blocks;
- GM category adjudication;
- dominant/supporting categories;
- governed-dimension vocabulary and tier tables;
- dividing Hatsu power between categories;
- applying affinity to an Ability's category allocation;
- Ability definitions, applications, storage, mastery implementation, execution, runtime, funding, effects, restrictions, or vows;
- type-specific Detection or Investigation evidence;
- water-divination gameplay or check mechanics;
- Ken, Gyō, Chū, Shū, Kō, Ryū, En, In, Yū, Jū, or Fū mechanics.

The Ability placeholder must remain empty.

## 19. Acceptance criteria

- Hatsu retains the exact HAT-1 behavior and table.
- Nen Type has one complete primary-plus-lean model.
- Current affinity lives at `NenState.affinity`, not inside awakening.
- Unassigned affinity remains legal for irrelevant NPCs.
- Assigned affinity can be discovered without changing it.
- Only 25% and 50% leans exist.
- Every ordinary profile totals 380 and has 0 Specialization.
- Specialist totals 420 and has 40 Enhancement.
- Legal lean directions follow the full hexagon, including the Conjuration/Manipulation barrier.
- Pure profile resolution has no Hatsu or Ability dependency.
- Hatsu has no affinity dependency.
- Existing stored characters migrate without invented leans.
- No Nen Ability mechanics are added.

## 20. Verification

Run and report:

```bash
npm test -w @nenworld/engine -- --run \
  src/__tests__/nen-type.test.ts \
  src/__tests__/nen-hatsu.test.ts \
  src/__tests__/nen-awakening-state.test.ts \
  src/__tests__/nen-awakening-exceptional.test.ts \
  src/__tests__/nen-reversion.test.ts \
  src/__tests__/architecture.test.ts

npm test -w @nenworld/engine
npm run typecheck -w @nenworld/engine
npm run typecheck --workspaces --if-present
git diff --check
git status --short
```

Compare the full engine and monorepo typecheck results with the baseline. The 65 known Workbench errors are not regressions unless the error set changes.

## 21. Completion report

Report:

1. commit, branch, and push status;
2. final Hatsu and Nen Type behavior;
3. canonical stored state shape;
4. files changed;
5. focused and full test results;
6. engine and monorepo typechecks;
7. every required mutation and the test that caught it;
8. intentional deviations;
9. bugs found and whether fixed;
10. remaining deferred work, explicitly separating remaining Nen principles from Nen Ability;
11. working-tree state.
