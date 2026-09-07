# Nenworld Engine — Authoritative Incomplete-Mechanics Backlog

**This is the single authoritative list of what the engine does not yet do.** `ENGINE_SUMMARY.md`
and `ENGINE_HANDOFF.md` describe what exists, and
[`RUNTIME_PROTOCOL.md`](RUNTIME_PROTOCOL.md) describes who owns what state; when any of them needs
to say something is missing, it links here rather than keeping its own list. Two backlogs are two things to keep in step, and the
six-second Round survived in `attributes/speed.ts` for exactly as long as it did because three
documents each described the timing and none of them was the one that had to be right.

Last verified against the repository: Stage II Phase 1.1 close.
Suite at that point: **72 files, 2,044 tests, green.** `tsc --noEmit` clean for the engine.

---

## The five states

| State | Means |
|---|---|
| **Specified but absent** | The rule is decided somewhere — Rulebook, ticket, or decision log — and no code implements it. |
| **Partially implemented** | Some of the mechanic runs; a named part of it does not. |
| **Implemented but internal** | Finished and correct, unreachable from `@nenworld/engine`'s public barrel. |
| **Implemented but insufficiently tested** | Reachable and exercised, with a named gap in what the tests actually pin. |
| **Complete** | Implemented, exported where it should be, and tested against its contract. |

A mechanic can only be **Complete** if something would fail when it broke. Placeholder types and
unconsumed functions are not mechanics, and are never recorded as complete here.

---

## 1 · Movement and space

| Mechanic | State | Detail |
|---|---|---|
| **Canonical Speed → base movement** | Complete | Accelerating curve on the canonical integer Speed, two anchors, normalized inputs, two-significant-figure presentation. `attributes/speed.ts`. Decisions `movement.speed.round-denominated-accelerating-curve` + `movement.speed.canonical-score-owns-base-movement`. |
| **Standard Move allowance and expenditure ledger** | Complete | Snapshotted divisor, one shared capacity normalization, exact share accumulation, cap enforcement, refusal precedence, charged/uncharged grants. `attributes/movement.ts`. Decisions `movement.move.round-action-capacity-divisor` + `movement.ledger.one-allowance-two-spenders`. |
| **Locomotor integrity factor** | Complete | The existing whole-body locomotion fraction, bounded to `[0, 1]` at the movement boundary and reported as `integrityFactor`. It may reduce movement to nothing and may never grant any. |
| **Body-derived propulsion profiles** | **Specified but absent** | `propulsionFactor` is declared, fixed at 1 and reported. Nothing derives it. It needs per-part muscularity and suitability, which Body owns and movement must never reach for. |
| **Gait and limb-configuration resolution** | **Specified but absent** | `gaitFactor` is declared, fixed at 1 and reported. Limb count is an *input* to gait, not a modifier: a naturally tripedal creature has an efficient tripedal gait while a quadruped down to three legs has a disrupted one, so gait must compare against the creature's intended body plan. Decision `movement.resolution.mode-propulsion-gait-integrity`. |
| **Movement modes: Sprint, Crawl, Climb, Swim, Flight** | **Specified but absent** | `modeFactor` is declared, fixed at 1 and reported. No mode vocabulary, no rates, no Aura costs, no mode-legality rules. Deliberately out of Phase 0 and 0.1. |
| **Spatial and Range vocabulary** | **Specified but absent** | There is no position, distance, zone or reach type anywhere in the engine. Movement produces metres with nothing to spend them against, and `senses/access.ts` resolves sensory access with no distance term. This is the **highest-leverage movement gap**: modes, terrain, Range bands and targeting all need it and none of them can be written first. |
| **Terrain and environmental movement** | **Specified but absent** | No terrain vocabulary, no cost-per-metre, no pathfinding, no jumping or falling. Blocked on Spatial vocabulary. |
| **Encumbrance** | **Specified but absent** | `character/equipment/` tracks what is worn and carried but computes no load, no capacity and no penalty. Body owns mass; nothing converts carried mass into a movement or exertion cost. |
| **Locomotor injuries and conditions** | **Partially implemented** | `body/locomotion.ts` resolves a whole-body fraction from destroyed locomotor chains, and movement consumes it as integrity — tested. Absent: graded impairment for an injured but not destroyed limb, and Conditions that impair movement (the 11 Conditions carry zero Effects). |
| **Traits, Skills and techniques that modify movement** | **Specified but absent** | The extension points exist — a modifier on the Round allowance before it opens, a factor, or a grant during the Round — and nothing occupies them. This is also the only sanctioned route past the Speed 30 base-curve ceiling. |

## 2 · Endurance and exertion

| Mechanic | State | Detail |
|---|---|---|
| **Wakefulness** | Complete | Stored hours, sleep at 2:1, logarithmic maximum, validated at every entry point including `advanceAuraTime`. |
| **Fatigue** | **Partially implemented** | Derived correctly from wakefulness and Aura depletion (`endurance/fatigue.ts`, decision `body.fatigue.wakefulness-and-depletion`) and tested. It has **no consequences**: nothing reads a Fatigue level to penalise a check, an Attribute, movement or Action capacity. It is a number the sheet shows. |
| **Sustained activity load** | Complete | Five named levels plus a raw per-hour escape hatch, now enforced as alternatives that must agree. |
| **Combat Stamina expenditure** | **Specified but absent** | Decision `aura.endurance.single-reserve` fixes the formula — `MaxAura × 0.001 × Load × (10 / Stamina)` — and `aura/expenditure.ts` implements it for *sustained* activity. No Combat Action spends it. Blocked on combat resolution supplying an Exertion Load per Action, which Aura must never infer for itself. |

## 3 · Aura

| Mechanic | State | Detail |
|---|---|---|
| **Reserve, maximum, allocation** | Complete | |
| **Expenditure and recovery** | Complete | Regeneration, mode multipliers, suppression, provenance per segment. |
| **Continuous time resolution** | Complete | Calculated boundaries, interval invariance verified to 28,800 one-second steps, atomic simultaneous events, exact upkeep shutdown. Decisions `time.continuous-resolution.boundaries`, `time.upkeep.exact-shutdown`. |
| **Aura reinforcement** | **Partially implemented** | Unawakened pseudo-Chū is implemented, distributed by Volume, and tested (decision `aura.unawakened.pseudo-chu-from-current-aura`). Awakened reinforcement — Aura placed on the body reducing incoming damage — is absent, because it terminates in a damage model that does not exist. |
| **Nen authored profiles and prerequisites** | **Implemented but internal** | `foundation/nen/` (4,009 LOC) resolves the principle graph, mastery states, prerequisites and per-principle profiles for Ten, Ren, Zetsu and Hatsu. Finished and correct; **unexported and untested**. |
| **Active Nen runtime state** | **Specified but absent** | Nothing tracks whether a character currently *has* Ten up. `NenState` is mastery plus a bare `awakened` boolean — there is no active-principle state, no activation, no deactivation, and no per-Round cost. This is a different gap from the row above, which is why they are no longer one row: the infrastructure being written does not make the runtime partially written. |
| **Ten, Ren, Zetsu, Chū combat contracts** | **Partially implemented** | Ten, Ren and Zetsu have principle files with mastery profiles, CON requirements and output limits; Chū has none. All four lack a combat contract — what activating one costs per Round, what it does to incoming damage, and how two of them interact. 11 of 15 principles (shu, en, gyo, ken, chū, in, ko, ryu, yu, ju, fu) are graph nodes only. |

## 3b · Runtime protocol and deferred migrations

The shared protocol is complete and documented in
[`RUNTIME_PROTOCOL.md`](RUNTIME_PROTOCOL.md). What is built ON it is almost nothing yet, and this
section is the difference.

| Mechanic | State | Detail |
|---|---|---|
| **Runtime ownership and transition protocol** | Complete | Ownership matrix, `TransitionResult`, routing-only request base with `QuantitativeRequest` for amounts, discardable transaction draft, cumulative same-owner costs, simultaneous batch settlement, boundary validation, generic coordinator. `runtime/`. Exported. Dependency-tested to contain no gameplay. |
| **Aura cost-handler reference** | Complete | `aura/runtime.ts`. A domain owning a spendable resource others need. Stateless — it holds the resolution context, never the pool. |
| **Body recovery request reference** | Complete | `body/recovery/runtime.ts`. A domain asking another owner to change something. |
| **Active Nen runtime implementation** | **Specified but absent** | The `nen` runtime section exists and holds protocol-level `ActiveApplication`s. Nothing populates it: no activation, no deactivation, no Output level, no Chū allocation, no per-Round cost, no suspension rules. Ten, Ren, Zetsu and Chū combat contracts remain absent (§3). |
| **Transformation runtime implementation** | **Specified but absent** | The `transformations` section exists. Nothing projects a transformed Body from it, and no transformation is authored. The projection boundary is decided — project, never overwrite — and unimplemented. |
| **Injury transfer between forms** | **Specified but absent** | Explicitly not decided in Phase 1. When a character transforms with a broken arm, what happens to the Injury in the new form — carried, suppressed, remapped, or ignored — has no answer yet. It needs the transformation runtime and the anatomy-mapping question answered together. |
| **Runtime spatial state** | **Specified but absent** | The `spatial` section is a declared placeholder with no fields, because there is no spatial vocabulary in the engine to put in it (§1). |
| **Combat integration** | **Specified but absent** | `RuntimeState` has a generic Combat slot and `attachCombat`/`detachCombat` are tested. Nothing in `gameplay/combat/` uses either, and no Combat Action raises a cost request. |
| **Dynamic or multi-stage dice requests** | **Specified but absent** | Dice are validated once, up front, against a fixed requirement list. An operation that cannot know what it needs to roll until part-way through — a reroll, an escalating contest, a damage die whose size depends on the attack result — is not supported. |
| **Legacy transition migrations** | **Partially implemented** | Two references migrated. The remaining exported state-changing operations are listed below and migrate as their domains are developed, not in a repository-wide rewrite (decision `runtime.time.single-character-coordinator`). |

### Deferred migrations

Inventoried at Phase 1 close: **688 exports, 30 state-changing operations.**

| Operation(s) | Disposition |
|---|---|
| `spendActionAura` | **Migrated** — reference, via `aura/runtime.ts`. |
| `resolveRecovery` / `resolveValidatedRecovery` | **Migrated** — reference, via `body/recovery/runtime.ts`. |
| `advanceCharacterTime`, `projectCharacterAtTime` | **Already conforming.** Deterministic, atomic, immutable, interval-invariant, rejects stale and gapped intervals. Documented rather than reshaped — see `RUNTIME_PROTOCOL.md` §7. |
| `advanceAuraTime`, `settleAuraTransition` | **Already conforming.** Immutable, `EngineResult`, deterministic, atomic at a timestamp. No typed request surface yet because nothing cross-domain calls them. |
| `spendAura`, `spendPhysicalAura`, `drainAura` | **Deferred** to the Nen/Combat phases that will call them cross-domain. Behaviourally conforming today. |
| `upsertAuraAllocation`, `removeAuraAllocation`, `replaceAuraAllocations`, `clearAuraAllocations`, `reconcileAuraState` | **Deferred.** Allocation editing is caller-driven, not cross-domain. |
| `advanceWakefulness` | **Already conforming.** Validated, immutable, `EngineResult`. |
| `regenerateAnatomy`, `destroyContinuity` | **Deferred** to the injury/damage phase. |
| `beginRoundMovement`, `spendMove`, `grantMovement` | **Deferred** to Combat integration — the movement ledger will become a cost handler when a Combat Action spends a Move. |
| `grantStatPoints`, `spendStatPoints`, `grantGrowthPoints`, `spendGrowthPoints` | **Deferred** to a progression phase. |
| `advanceGameClock`, `advanceGameTime`, `advanceFromRealTime`, `setTimeScale` | **Not migrating.** Time owns the clock; these are its own boundary, not cross-domain transitions. |
| `registerDefinition`, `clearCustomDefinitions` | **Not migrating.** Catalog registration is host configuration, not gameplay state. |
| `applyAttributeModifiers`, `applyPhysicalScaleSteps`, `resolveMovement`, derived attributes, Speed curve | **Pure calculations.** No state owned, no migration owed (`RUNTIME_PROTOCOL.md` §2). |

## 4 · Combat

| Mechanic | State | Detail |
|---|---|---|
| **Round, Turn, Initiative, Action structure** | **Implemented but internal** | `gameplay/combat/` (~5,480 LOC) is unexported and has **zero tests**. It is structure only and references no Body, STR, BP or damage. |
| **Round Action Capacity** | Complete | Derived from Combat Ability, exported, integrated into `ResolvedCharacter.actionCapacity`, and the snapshotted divisor Move reads. |
| **Combat Action ↔ movement integration** | **Partially implemented** | The contract is complete on the movement side: the ledger takes a snapshotted capacity, refuses correctly, and shares one allowance between Moves and grants. Nothing in `gameplay/combat/` calls it — no Combat Action spends a Move, and the ledger is opened by tests and callers rather than by a Round starting. |
| **SP-to-BP damage conversion** | **Specified but absent** | Nothing defines how Strength Points become Body Point damage. Still the **highest-leverage hole in the engine**: it is what would validate `CONSTITUTION_DOUBLING_INTERVAL = 2` and the STR/CON durability parity the whole BP calibration rests on, and it blocks Aura reinforcement, Condition effects and every combat check below. |
| **Full combat resolution** | **Specified but absent** | No Guard, Strike, Evasion, attack rolls or death saves. |
| **Skill execution and Accuracy modification** | **Partially implemented** | `checks/` resolves d20 checks including opposed and fixed forms, and `Accuracy` is a Derived Attribute. Skills are authored and validated; nothing *executes* one. `ImprovisedSkillAttempt` is a type with no resolution. Most of `checks/` is also unexported (below). |
| **Perception and Reaction-gate integration** | **Specified but absent** | `gameplay/combat/reaction.ts` defines Reaction structure and `senses/` resolves a full sensory profile, and **nothing connects them**: no rule says whether a character perceived the trigger they are reacting to. Reaction Moves already share the Round allowance (`movement.ts`), which is the half of this that Phase 0 could settle. |

## 5 · Consumers

| Mechanic | State | Detail |
|---|---|---|
| **Workbench integration** | **Partially implemented** | `apps/workbench` is broken against the engine: **65 TypeScript errors, 49 of 97 tests failing**, verified at Phase 0 close. It never absorbed three migrations (`character.name` → `character.details.name`, `body.surfaceUnits` removed, `str` no longer a stored Attribute) plus the Body refactor. Pre-existing and out of scope for Phase 0. |
| **Foundry integration** | **Specified but absent** | `foundry_module/` is a planned consumer with no engine binding. |

## 6 · Reachability

Recounted per directory with `wc -l` at Phase 0.1 close. This replaces a "~9,400 LOC" estimate that
was wrong in both directions: it undercounted Combat and Nen, and counted all of `checks/` as
unreachable when most of it exports.

| Unreachable | LOC | Note |
|---|---|---|
| `gameplay/combat/*` | 5,482 | whole directory, zero tests |
| `character/foundation/nen/*` | 4,009 | whole tree incl. `principles/`, zero tests |
| `time/{validation,calendar,clock}` | 1,371 | unexported by design |
| `character/foundation/aura/control.ts` | 379 | |
| `checks/resolution.ts` | 261 | `resolveCheck` / `resolveFixedCheck` / `resolveOpposedCheck` |
| `infrastructure/{rounding,id}` | 108 | |
| `character/details.ts` | 77 | |
| `character/progression/index.ts` | 71 | superseded by direct barrel exports |
| **Total** | **11,758** | |

The other 1,090 LOC of `checks/` — scopes, matching, modifiers, types, validation, index — **is**
reachable through the barrel's Checks block and `character/rules/effects.ts`. Only the roll itself
is not.

## 7 · Test-coverage gaps in shipped code

| Area | Gap |
|---|---|
| Nen (4,009 LOC) | Zero tests. |
| Combat (~5,480 LOC) | Zero tests. |
| Time clock and calendar | Zero tests beyond the duration constants and interval arithmetic. |
| Equipment | Two demo items; no load, no capacity, no conflicts. |

## 8 · Open questions carried forward

1. `CONSTITUTION_DOUBLING_INTERVAL = 2` is a reasoned guess pending a damage model (`/3` is the alternative).
2. Ages below ~4 resolve too light (1.8 kg at birth vs. a real 3.5). Mass goes as scale³; the real fix is age-*local* morphology, which the profile format supports but does not use. Ages 6+ land within 3%.
3. Orphaned archive retention is "retain forever"; no deliberate purge operation exists.
4. Automatic STR-to-musculature coupling is not sufficiently specified. Body owns musculature and mass, and movement correctly consumes neither — but nothing yet says how training Strength changes the body that produces it. Recorded as **partial Body work**; the dependency boundary is correct and must not be worked around by inventing a second STR-to-mass formula inside movement.
5. DEX burden behaviour is unrevised and deliberately untouched by Phase 0.
