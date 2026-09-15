# Ten Correction — AI Execution Ticket

## Objective

Correct the existing Ten implementation so `ten.ts` is the authoritative source for Ten availability and coating strength. Ten is passive, automatic once usable, indefinitely maintained, and costs no Aura. It prevents uncontained leakage and evenly coats the whole bodily surface with the greater of Ten’s Mastery share of Ren-accessible Output or 5% of Physiological Output.

## Verified starting point

Work from `main` at or after commit `2577fe8`. The repository already has the correct surrounding infrastructure:

- `aura/access.ts` activates baseline Ten at effective Mastery I+, but hard-codes every rank to a 5% coating.
- `aura/budget.ts` creates the automatic `baseline-ten` whole-body surface allocation and correctly treats allocation as non-consuming.
- `aura/distribution.ts` distributes whole-body surface Aura proportionally by surface area, producing equal density.
- `aura/leakage.ts`, `aura/time.ts`, and the Nen collapse runtime already handle uncontained leakage, exhaustion, blackout, involuntary Zetsu, recovery, and renewed leakage after unsafe release.
- `nen/principles/ten.ts` contains the I–X Mastery/DEX table, but incorrectly calculates containment directly from Physiological Output and models imperfect Ten as consuming Regeneration Capacity through passive leakage.

## Canonical contract

For effective Ten Mastery `T` and effective Ren Mastery/access `R`:

```text
renAccessibleOutput = physiologicalOutput * renAccessFraction
masteryCoating      = renAccessibleOutput * tenContainmentFraction
minimumCoating      = physiologicalOutput * 0.05
intendedTenCoating  = max(masteryCoating, minimumCoating)
```

Ten I–X retains its existing 10%–100% containment fractions and DEX gates. If Ren is unavailable, treat `renAccessFraction` as zero; the 5% floor still applies. Runtime funding may cap the resolved coating by usable Output and Current Aura, but allocation never deducts Current Aura.

Example: Physiological Output 20, Ren I access 10%, Ten I containment 10%:

```text
renAccessibleOutput = 2
masteryCoating      = 0.2
minimumCoating      = 1
intendedTenCoating  = 1
```

Invariants:

- Functional Ten means `uncontained = false`.
- Ten has no activation cost, upkeep, duration, passive leakage, or regeneration penalty.
- Ten’s automatic allocation is whole-body and surface-only.
- Ten does not own Body surface calculations, density arithmetic, reinforcement, damage, defense, Fatigue, Stamina, physical expenditure, recovery, reserve mutation, or collapse settlement.
- Ren increases accessible Output; it does not replace or independently calculate Ten’s coating.

## Implementation ticket

1. Refactor `packages/engine/src/character/foundation/nen/principles/ten.ts`:
   - Keep the Mastery profiles, containment fractions, DEX requirements, validation, and trace behavior.
   - Add a pure resolved-coating calculation accepting plain numeric `physiologicalOutput`, `renAccessibleOutput` or `renAccessFraction`, and effective Ten Mastery.
   - Return the floor amount, Mastery-derived amount, intended coating, and provenance needed by Aura.
   - Move the canonical 5% minimum constant here.
   - Remove `passiveLeakageFractionOfRegeneration`, `TenPassiveContainment`, `resolveTenPassiveContainment`, `deriveTenReplenishmentMultiplier`, and all claims that functioning Ten consumes regeneration or leaks passively.
   - Replace the old `physiologicalOutput * containmentFraction` containment result with the canonical formula above. Do not retain two competing public Ten calculations.

2. Integrate the Ten result through `aura/access.ts` and `aura/budget.ts`:
   - Remove the hard-coded Ten coating rule from generic Aura access.
   - Preserve the existing default-state behavior: awakened + effective Ten I or higher automatically resolves Ten; effective Ten 0 remains uncontained.
   - When an Output-access override represents Ren, use its resolved access fraction when calculating Ten’s Mastery-derived coating.
   - Have the Aura budget consume Ten’s resolved coating instead of manufacturing an independent fixed 5% rule.
   - Preserve the existing `baseline-ten` automatic whole-body surface allocation and shared distribution path.
   - Maintain a one-way dependency without introducing an Aura↔Nen import cycle. If the architecture rules reject a direct import, add the smallest principle-to-Aura projection/adapter in the existing `character/nen` integration layer rather than duplicating the formula.

3. Update affected exports, comments, fixtures, and tests. Remove stale APIs rather than keeping compatibility aliases that preserve the incorrect model. Do not redesign Ren or any downstream reinforcement system.

## Required tests

- Ten I + Ren I + Physiological Output 20 resolves a 1-Aura coating.
- Ten X + Ren I + Physiological Output 20 resolves a 2-Aura coating.
- Ten I + Ren X + Physiological Output 20 resolves a 2-Aura coating.
- Ten X + Ren X + Physiological Output 20 resolves a 20-Aura coating.
- Ten without Ren still resolves the 5% floor.
- Every Ten rank remains automatic, whole-body, surface-only, and non-consuming.
- Surface distribution remains equal-density across differently sized Body Parts.
- Ten produces zero upkeep, zero passive leakage, and no regeneration reduction.
- Effective Ten 0 still enters the existing uncontained leakage path; functioning Ten never does.
- Zetsu/suppression still removes the coating and stops leakage by closing the nodes.
- Physical Aura expenditure, Fatigue, Stamina, pseudo-Chū, recovery, collapse, and involuntary-Zetsu tests remain unchanged and green.
- Invalid numeric inputs and Mastery ranks return structured `EngineError`s with trace output.

## Scope exclusions

Do not implement or rebalance Ren endurance/upkeep, Gyō, Shū, Ken, Chū, pseudo-Chū, Ryū, Kō, reinforcement strength, damage, defense, physical expenditure, Fatigue, Stamina, recovery, or collapse behavior. Only change shared code where necessary to consume the corrected Ten result.

## Verification and completion gate

Run the engine’s focused Ten/Aura/access/budget/distribution/leakage tests, then the complete engine test suite and engine TypeScript check. Inspect architecture tests for dependency-boundary violations. Report changed files, removed stale APIs, exact test/typecheck results, and any pre-existing failures separately. The work is complete only when one authoritative Ten formula drives the resolved automatic coating and no functioning-Ten path consumes Aura or Regeneration Capacity.
