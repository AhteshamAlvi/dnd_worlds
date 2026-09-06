# Nenworld Engine — Authoritative Incomplete-Mechanics Backlog

**This is the single authoritative list of what the engine does not yet do.** `ENGINE_SUMMARY.md`
and `ENGINE_HANDOFF.md` describe what exists; when either needs to say something is missing, it
links here rather than keeping its own list. Two backlogs are two things to keep in step, and the
six-second Round survived in `attributes/speed.ts` for exactly as long as it did because three
documents each described the timing and none of them was the one that had to be right.

Last verified against the repository: Phase 0 close.
Suite at that point: **70 files, 1,936 tests, green.** `tsc --noEmit` clean for the engine.

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
| **Speed → Round movement** | Complete | Accelerating curve, two anchors, continuous STR/AGI, two-significant-figure presentation. `attributes/speed.ts`. Decision `movement.speed.round-denominated-accelerating-curve`. |
| **Move and the Round allowance** | Complete | Snapshotted divisor, exact share accumulation, cap enforcement, declared grants. `attributes/movement.ts`. Decision `movement.move.round-action-capacity-divisor`. |
| **Spatial and Range vocabulary** | **Specified but absent** | There is no position, distance, zone or reach type anywhere in the engine. Movement now produces metres with nothing to spend them against, and `senses/access.ts` resolves sensory access with no distance term. This is the **highest-leverage movement gap**: terrain, Range bands, opportunity attacks and targeting all need it and none of them can be written first. |
| **Terrain and paths** | **Specified but absent** | No terrain vocabulary, no cost-per-metre, no pathfinding. The extension point exists — terrain is a modifier to the Round allowance handed to `beginRoundMovement` — and nothing occupies it. Blocked on Spatial vocabulary. |
| **Encumbrance** | **Specified but absent** | `character/equipment/` tracks what is worn and carried but computes no load, no capacity and no penalty. Body owns mass; nothing converts carried mass into a movement or exertion cost. |
| **Sprint** | **Specified but absent** | No Sprint Action, no burst multiplier, no Aura cost, no cooldown. Deliberately out of Phase 0. It is the first mechanic that will exercise "a modifier to the Round allowance" as a real extension rather than a documented one. |
| **Locomotor injuries and conditions** | **Partially implemented** | `body/locomotion.ts` resolves a whole-body fraction from destroyed locomotor chains, and movement consumes it — tested. What is absent is graded impairment: an injured but not destroyed leg, a Condition that halves movement, a prone or grappled state. The 11 Conditions carry zero Effects. |

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
| **Runtime Nen states** | **Implemented but internal** | `foundation/nen/` (~3,970 LOC) resolves mastery, prerequisites and per-principle profiles, and is **unexported and untested**. Nothing tracks whether a character currently *has* Ten up: `NenState` is mastery and a bare `awakened` boolean, with no active-principle runtime state. |
| **Ten, Ren, Zetsu, Chū combat contracts** | **Partially implemented** | Ten, Ren and Zetsu have principle files with mastery profiles, CON requirements and output limits; Chū has none. All four lack a combat contract — what activating one costs per Round, what it does to incoming damage, and how two of them interact. 11 of 15 principles (shu, en, gyo, ken, chū, in, ko, ryu, yu, ju, fu) are graph nodes only. |

## 4 · Combat

| Mechanic | State | Detail |
|---|---|---|
| **Round, Turn, Initiative, Action structure** | **Implemented but internal** | `gameplay/combat/` (~5,480 LOC) is unexported and has **zero tests**. It is structure only and references no Body, STR, BP or damage. |
| **Round Action Capacity** | Complete | Derived from Combat Ability, exported, integrated into `ResolvedCharacter.actionCapacity`, and now the snapshotted divisor Move reads. |
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

**~9,400 LOC of finished code is unreachable from the public barrel**, most of it also untested:

`gameplay/combat/*` (~5,480) · `foundation/nen/*` (~3,970) · most of `checks/*` (~1,150 —
`resolveCheck`, `resolveFixedCheck`, `resolveOpposedCheck` and `CheckRequest` are not exported;
the scope vocabulary and the roll-free modifier helpers are) · `foundation/aura/control.ts` ·
`character/details.ts` · `time/{validation,calendar,clock}` · `infrastructure/{rounding,id}` ·
`character/progression/index`.

## 7 · Test-coverage gaps in shipped code

| Area | Gap |
|---|---|
| Nen (~3,970 LOC) | Zero tests. |
| Combat (~5,480 LOC) | Zero tests. |
| Time clock and calendar | Zero tests beyond the duration constants and interval arithmetic. |
| Equipment | Two demo items; no load, no capacity, no conflicts. |

## 8 · Open questions carried forward

1. `CONSTITUTION_DOUBLING_INTERVAL = 2` is a reasoned guess pending a damage model (`/3` is the alternative).
2. Ages below ~4 resolve too light (1.8 kg at birth vs. a real 3.5). Mass goes as scale³; the real fix is age-*local* morphology, which the profile format supports but does not use. Ages 6+ land within 3%.
3. Orphaned archive retention is "retain forever"; no deliberate purge operation exists.
4. Automatic STR-to-musculature coupling is not sufficiently specified. Body owns musculature and mass, and movement correctly consumes neither — but nothing yet says how training Strength changes the body that produces it. Recorded as **partial Body work**; the dependency boundary is correct and must not be worked around by inventing a second STR-to-mass formula inside movement.
5. DEX burden behaviour is unrevised and deliberately untouched by Phase 0.
