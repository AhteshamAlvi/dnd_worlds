# HAT-1 — Hatsu Conversion and Ability Boundary

## 1. Starting point

- Branch: `main`
- Commit: `0cbbaf9`
- Expected baseline: 135 engine test files / 5,554 tests passing
- Engine typecheck: clean
- Monorepo typecheck: 65 pre-existing Workbench errors

Preserve unrelated user changes. Do not commit or rewrite the existing ticket documents unless required by this ticket.

## 2. Objective

Replace Hatsu's obsolete universal effect multiplier with one upstream Aura-to-power conversion rule. Hatsu must answer how efficiently already-funded Aura becomes effective Nen Ability power; it must not multiply damage, range, duration, area, healing, or any other downstream property independently.

This ticket also establishes the personal-ability creation threshold and the rule that usable Nen Ability mastery cannot exceed effective Hatsu mastery. It does not build the general Nen Ability runtime.

## 3. Source-of-truth rules

### 3.1 Hatsu mastery profile

| Hatsu mastery | Conversion efficiency | Personal Nen Ability creation |
|---:|---:|---|
| I | 20% | No |
| II | 35% | No |
| III | 50% | Yes |
| IV | 60% | Yes |
| V | 70% | Yes |
| VI | 80% | Yes |
| VII | 85% | Yes |
| VIII | 90% | Yes |
| IX | 95% | Yes |
| X | 100% | Yes |

Hatsu I–II can support primitive training expressions. They cannot create a personal Nen Ability. Existing natural or externally granted Ability records remain exceptions to creation; do not delete or rewrite them.

### 3.2 Conversion

For one Ability resolution:

\[
P_{\text{Hatsu}}=A_{\text{funded}}\times E_{\text{Hatsu}}
\]

Where:

- `A_funded` is a finite, non-negative Aura amount already funded for this Ability resolution;
- `E_Hatsu` is the efficiency for the character's effective Hatsu mastery;
- `P_Hatsu` is the single effective-power budget the Ability may translate into its authored effects.

Do not round inside Hatsu. Zero Aura is valid and produces zero power.

“Funded Aura” is a hand-off, not a new Aura accounting mechanism. The calling Ability will eventually decide whether the amount came from an immediate expenditure, a standing commitment, or another legal funding route. Hatsu must not deduct Current Aura, create an allocation, enforce an Output limit, or charge upkeep a second time.

### 3.3 Ordering

Hatsu supplies exactly one upstream result:

\[
A_{\text{funded}} \rightarrow P_{\text{Hatsu}}
\]

Affinity, conditions/restrictions, vows, Ability mastery, targeting, and authored effect rules are downstream concerns. Do not add placeholder multipliers for them in this ticket.

Never apply Hatsu efficiency separately to several effect fields. An Ability may consume or apportion the one effective-power budget according to its own rules, but Hatsu does not multiply each result.

### 3.4 Ability mastery

Permanent Ability mastery and usable Ability mastery are distinct:

\[
M_{\text{Ability,effective}}
=
\min(M_{\text{Ability,stored}},M_{\text{Hatsu,effective}})
\]

- Effective Hatsu uses the existing Nen mastery resolver, including seals and reversion.
- Lowering effective Hatsu never erases stored Ability mastery.
- Suppression blocks deliberate Ability execution through the existing access/runtime rules; it does not rewrite mastery.
- Ability mastery must not add another universal power multiplier.

### 3.5 Hatsu is not an activity

There is no `startHatsu`, Hatsu duration, Hatsu upkeep, Hatsu Output commitment, or generic Hatsu runtime definition. Individual Nen Abilities own activation, duration, upkeep, Output, targeting, and effects.

## 4. Verified implementation delta

The current `foundation/nen/principles/hatsu.ts` still contains the discarded III–X `0.60` through `2.00` generic effect multiplier and an API that accepts an arbitrary numeric effect. It has no production consumer or direct test suite.

The progression graph already correctly makes Zetsu an unlock-only prerequisite for Hatsu and gives the four basic principles no attribute gates. Preserve that behavior.

The engine does not yet have a Nen Ability definition/runtime subsystem. Awakening stores natural and external Ability ids only. Do not invent that subsystem here.

This requires at least five edited or added files: the Hatsu principle, a character-facing adapter, its public export, a Hatsu test suite, and architecture guards. A ticket is therefore warranted.

## 5. Architecture

### 5.1 Pure principle

Rewrite `character/foundation/nen/principles/hatsu.ts` as the sole owner of:

- the I–X efficiency table;
- the Mastery III personal-ability creation threshold;
- pure conversion of funded Aura into Hatsu effective power;
- the pure `min(stored Ability mastery, effective Hatsu mastery)` ceiling.

It may import generic mastery, diagnostics, result, and trace vocabulary. It must not import Character, Aura state/funding, Nen runtime, Skills, combat, senses, or a future concrete Ability definition.

### 5.2 Character-facing adapter

Add `character/nen/hatsu.ts` as the only production adapter importing the Hatsu principle. It should:

- derive effective Hatsu mastery from `NenState` through `deriveEffectiveNenMastery`;
- resolve a conversion request using that effective mastery;
- expose the effective Ability-mastery cap using the same effective Hatsu reading;
- refuse conversion when effective Hatsu is 0 with a stable player-facing error;
- remain pure and perform no Aura mutation or runtime activation.

Do not make the adapter decide whether a personal, natural, or external Ability is legally possessed. That belongs to the future Ability subsystem.

### 5.3 Public surface

Export the character-facing Hatsu API and types from `character/nen/index.ts`. Do not export the low-level principle through a second package path if current package conventions keep principles internal.

Revise the existing architecture guard that bars every Hatsu import so exactly `character/nen/hatsu.ts` may import `principles/hatsu.ts`, matching the established Ren and Zetsu adapter pattern.

## 6. Required API behavior

Names may follow repository conventions, but the public surface must make these concepts explicit:

- `HATSU_MASTERY_PROFILES` or equivalent, with the exact table above;
- `HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY = 3` or equivalent;
- a pure profile/efficiency lookup;
- a pure conversion resolver returning funded Aura, efficiency, effective mastery, and effective power;
- a character-facing conversion resolver that accepts `NenState` and funded Aura;
- a pure or character-facing Ability-mastery ceiling returning `min(stored, effective Hatsu)`.

Use `MasteryValue` where 0 is a meaningful disabled result and `MasteryRank` where a learned rank is required. Reject NaN, infinities, negative Aura, fractional/invalid mastery, and malformed Nen state rather than silently normalizing them.

Traces must state the actual formula once. Do not retain `effectModifier`, `effectMultiplier`, `baseEffect`, `finalEffect`, or the old `nen.hatsu.effect` vocabulary as compatibility aliases.

## 7. Implementation work

1. Replace the old Hatsu profile with the exact I–X efficiency table.
2. Keep personal Ability creation locked at I–II and unlocked at III–X.
3. Replace arbitrary effect scaling with funded-Aura conversion.
4. Add the Ability-mastery ceiling without adding Ability storage.
5. Add the character-facing adapter using effective Hatsu mastery.
6. Export the adapter through the existing Nen public surface.
7. Update architecture guards to permit one Hatsu adapter and prohibit all other production imports.
8. Add a dedicated `nen-hatsu.test.ts` covering pure and character-facing behavior.
9. Remove stale comments, constants, APIs, and documentation inside production code that describe the old 0.60–2.00 universal multiplier.

Do not change `NEN_PROGRESSION_RULES`; its Hatsu unlock relationship is already correct.

## 8. Tests

At minimum, test:

- the exact efficiency at every rank I–X;
- 100 funded Aura producing 20, 35, 50, 60, 70, 80, 85, 90, 95, and 100 power;
- fractional and zero funded Aura without internal rounding;
- personal Ability creation false at I–II and true at III–X;
- Hatsu I–II conversion remaining available for primitive/exceptional consumers even though personal creation is locked;
- the character adapter using effective, not stored, Hatsu mastery;
- a seal reducing conversion and the effective Ability-mastery cap without changing stored ranks;
- reversion producing effective Hatsu 0 and refusing conversion;
- stored Ability mastery above, equal to, and below effective Hatsu resolving through `min`;
- malformed Aura, mastery, and Nen state being refused;
- input objects remaining immutable;
- traces containing the one conversion formula and resolved values;
- no Aura state, allocation, funding, runtime, or Current Aura mutation;
- the package export reaching the character-facing API;
- architecture restrictions described above.

Keep the existing Hatsu unlock-only progression tests passing.

## 9. Required mutation checks

Apply each mutation independently, prove tests fail, and revert it:

1. Hatsu I efficiency `0.20` → `0.25`.
2. Hatsu III efficiency `0.50` → `0.60`.
3. Hatsu X efficiency `1.00` → `2.00`.
4. Personal Ability creation begins at II or IV instead of III.
5. Conversion rounds its result.
6. Conversion multiplies an authored effect field rather than only funded Aura.
7. Character conversion uses stored Hatsu instead of effective Hatsu.
8. Ability mastery uses `max` or stored mastery alone instead of `min`.
9. A seal permanently lowers stored Ability mastery.
10. Reversion still permits Hatsu conversion.
11. A generic Hatsu runtime activity or `startHatsu` is introduced.
12. A second production file imports `principles/hatsu.ts`.
13. Any old universal-effect API or `effectMultiplier` vocabulary is restored in Hatsu.

If a mutation survives, strengthen the closest behavioral or architecture test before completion.

## 10. Out of scope

- Nen affinity/category efficiencies and their tables;
- conditions, restrictions, vows, and post-mortem amplification;
- concrete Nen Ability definitions, storage, acquisition, editing, or execution;
- Ability activation, cooldowns, targeting, ranges, areas, damage, healing, or duration;
- choosing whether a particular Ability uses expenditure, allocation, upkeep, or Output;
- Hatsu-specific Detection evidence, residue, signature identity, or Investigation findings;
- Ken, Gyō, and other intermediate/advanced principle mechanics;
- changing the Ten → Ren → Zetsu → Hatsu unlock chain.

These systems may consume Hatsu's effective-power result later; they must not cause Hatsu to grow a second conversion rule now.

## 11. Acceptance criteria

- The old 0.60–2.00 universal effect multiplier and arbitrary effect-scaling API are gone.
- The exact 20/35/50/60/70/80/85/90/95/100% curve has one producer.
- A funded Aura amount is converted exactly once into one effective-power amount.
- Hatsu III remains the personal Nen Ability creation threshold.
- Effective Ability mastery is capped by effective Hatsu mastery without destroying stored mastery.
- Hatsu is not represented as a runtime activity and performs no Aura accounting.
- Exactly one production adapter connects Nen state to the pure Hatsu principle.
- Existing progression, awakening, Aura, Ren, Ten, Zetsu, and DCI behavior remains unchanged.

## 12. Verification

Run and report:

```bash
npm test -w @nenworld/engine -- --run src/__tests__/nen-hatsu.test.ts src/__tests__/nen-prerequisites.test.ts src/__tests__/architecture.test.ts
npm test -w @nenworld/engine
npm run typecheck -w @nenworld/engine
npm run typecheck --workspaces --if-present
git diff --check
git status --short
```

Compare full-suite and monorepo typecheck results with the starting baseline. Do not count the 65 known Workbench errors as regressions unless the set changes.

## 13. Completion report

Report:

1. commit and branch;
2. concise description of the shipped Hatsu model;
3. files changed;
4. focused/full tests and typechecks;
5. each mutation and the test that caught it;
6. intentional deviations;
7. bugs found and whether fixed;
8. remaining risks/deferred work, especially affinity and the future Nen Ability funding contract;
9. working-tree and push status.
