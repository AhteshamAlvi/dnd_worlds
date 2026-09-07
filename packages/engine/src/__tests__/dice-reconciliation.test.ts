/*
 * The two dice layers, and the one road between them.
 *
 * Runtime validates that an OPERATION got the dice it required. Checks decide
 * which of the supplied numbers a character actually uses. Neither can do the
 * other's job, and there is deliberately no third die vocabulary sitting
 * between them — the tests at the bottom of this file enforce that, because a
 * middle layer is exactly what a future ticket would be tempted to add and
 * exactly what would give a wrong number three places to hide.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  expectedRollCount,
  resolveCheck,
  resolveCheckDice,
  resolveFixedCheck,
  resolveOpposedCheck,
} from "../checks/resolution";
import type { CheckRequest } from "../checks/types";
import { projectCheckDice } from "../runtime/check-dice";
import type { RuntimeRollSet } from "../runtime/dice";
import { errorCodesOf, payloadOf } from "./fixtures/result";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function attackRolls(values: readonly number[]): RuntimeRollSet {
  return { purpose: "attack", sides: 20, values };
}

function checkWith(rolls: readonly number[], advantage: number): CheckRequest {
  return {
    scope: { kind: "attribute", attribute: "agi" },
    dice: { advantage, rolls },
    baseContributions: [{ id: "standard", amount: 3 }],
    modifiers: [],
  };
}


describe("runtime dice project into a check exactly once", () => {
  it("carries one purpose's single roll through", () => {
    expect(payloadOf(projectCheckDice(attackRolls([14]), 0)))
      .toEqual({ advantage: 0, rolls: [14] });
  });

  it("carries an advantage pair through in rolled order", () => {
    expect(payloadOf(projectCheckDice(attackRolls([14, 3]), 1)))
      .toEqual({ advantage: 1, rolls: [14, 3] });
  });

  it("carries a disadvantage pair through in rolled order", () => {
    /*
     * The same two numbers as advantage. Which one is kept is the CHECK's
     * decision, made from the sign of the advantage level, not something the
     * runtime layer encoded into the dice.
     */
    expect(payloadOf(projectCheckDice(attackRolls([14, 3]), -1)))
      .toEqual({ advantage: -1, rolls: [14, 3] });
  });

  it("refuses a roll count the advantage level does not use", () => {
    expect(errorCodesOf(projectCheckDice(attackRolls([14]), 1)))
      .toContain("runtime.dice.check-projection.count.mismatch");

    expect(errorCodesOf(projectCheckDice(attackRolls([14, 3, 9]), 1)))
      .toContain("runtime.dice.check-projection.count.mismatch");
  });

  it("refuses dice that are not d20s", () => {
    expect(errorCodesOf(projectCheckDice(
      { purpose: "attack", sides: 12, values: [7] },
      0,
    ))).toContain("runtime.dice.check-projection.sides.invalid");
  });

  it("refuses an empty set and a fractional advantage", () => {
    expect(errorCodesOf(projectCheckDice(attackRolls([]), 0)))
      .toContain("runtime.dice.check-projection.empty");

    expect(errorCodesOf(projectCheckDice(attackRolls([7]), 0.5)))
      .toContain("runtime.dice.check-projection.advantage.invalid");
  });

  it("agrees with the checks layer about how many rolls are needed", () => {
    /*
     * Both sides read expectedRollCount(). They used to agree by coincidence,
     * with the rule written inline in one place and only in a comment in the
     * other.
     */
    for (const advantage of [-2, -1, 0, 1, 2]) {
      const values = Array.from(
        { length: expectedRollCount(advantage) },
        () => 10,
      );

      expect(payloadOf(projectCheckDice(attackRolls(values), advantage)).rolls)
        .toHaveLength(expectedRollCount(advantage));
    }
  });
});


describe("check dice resolve to a retained roll", () => {
  it("retains the only roll with no advantage", () => {
    const dice = payloadOf(resolveCheckDice({ advantage: 0, rolls: [13] }));

    expect(dice.retainedRoll).toBe(13);
    expect(dice.retainedIndex).toBe(0);
    expect(dice.mode).toBe("single");
  });

  it("retains the highest under advantage, and reports which one", () => {
    const dice = payloadOf(resolveCheckDice({ advantage: 1, rolls: [4, 17] }));

    expect(dice.retainedRoll).toBe(17);
    expect(dice.retainedIndex).toBe(1);
    expect(dice.mode).toBe("highest");
  });

  it("retains the lowest under disadvantage", () => {
    const dice = payloadOf(resolveCheckDice({ advantage: -1, rolls: [4, 17] }));

    expect(dice.retainedRoll).toBe(4);
    expect(dice.retainedIndex).toBe(0);
    expect(dice.mode).toBe("lowest");
  });

  it("retains the earliest of equal dice, so replay is deterministic", () => {
    expect(payloadOf(resolveCheckDice({ advantage: 1, rolls: [9, 9] })).retainedIndex)
      .toBe(0);
  });

  it("scales past a single level of advantage", () => {
    const dice = payloadOf(resolveCheckDice({ advantage: 2, rolls: [7, 16, 11] }));

    expect(dice.retainedRoll).toBe(16);
    expect(dice.retainedIndex).toBe(1);
  });
});


describe("invalid check dice fail rather than throw", () => {
  it("returns a failure for an empty pool", () => {
    /*
     * The specific regression: this threw a RangeError, which made "the host
     * supplied no dice" the one check input a caller had to wrap in a
     * try/catch instead of reading alongside every other diagnostic.
     */
    const empty = { advantage: 0, rolls: [] };

    expect(() => resolveCheckDice(empty)).not.toThrow();
    expect(errorCodesOf(resolveCheckDice(empty))).toContain("checks.dice.empty");
  });

  it("returns a failure for a roll that is not a d20 face", () => {
    expect(errorCodesOf(resolveCheckDice({ advantage: 0, rolls: [21] })))
      .toContain("checks.dice.roll.invalid");

    expect(errorCodesOf(resolveCheckDice({ advantage: 0, rolls: [0] })))
      .toContain("checks.dice.roll.invalid");

    expect(errorCodesOf(resolveCheckDice({ advantage: 0, rolls: [7.5] })))
      .toContain("checks.dice.roll.invalid");
  });

  it("returns a failure when the pool size contradicts the advantage", () => {
    expect(errorCodesOf(resolveCheckDice({ advantage: 1, rolls: [12] })))
      .toContain("checks.dice.count.mismatch");
  });

  it("returns a failure for a fractional advantage level", () => {
    expect(errorCodesOf(resolveCheckDice({ advantage: 0.5, rolls: [12] })))
      .toContain("checks.dice.advantage.invalid");
  });
});


describe("every check caller consumes the same envelope", () => {
  const badDice = checkWith([], 0);

  it("fails a plain check", () => {
    expect(errorCodesOf(resolveCheck(badDice))).toContain("checks.dice.empty");
  });

  it("fails a fixed check without inventing a difficulty comparison", () => {
    expect(errorCodesOf(resolveFixedCheck({ check: badDice, difficulty: 10 })))
      .toContain("checks.dice.empty");
  });

  it("fails an opposed check if either side's dice are bad", () => {
    const good = checkWith([11], 0);

    expect(errorCodesOf(resolveOpposedCheck({
      initiator: badDice,
      opponent: good,
      tiesFavor: "opponent",
    }))).toContain("checks.dice.empty");

    expect(errorCodesOf(resolveOpposedCheck({
      initiator: good,
      opponent: badDice,
      tiesFavor: "opponent",
    }))).toContain("checks.dice.empty");
  });

  it("still resolves a well-formed check to a total", () => {
    expect(payloadOf(resolveCheck(checkWith([11], 0))).total).toBe(14);
  });
});


/*
 * Source-level guards. Both of these describe a state the code is IN, and both
 * are the kind of thing a later ticket undoes by accident while doing
 * something else entirely.
 */
describe("the reconciliation holds at the source level", () => {
  function sourceFilesUnder(directory: string): readonly string[] {
    const files: string[] = [];

    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);

      if (statSync(path).isDirectory()) files.push(...sourceFilesUnder(path));
      else if (entry.endsWith(".ts")) files.push(path);
    }

    return files;
  }

  it("declares exactly two dice vocabularies, with no third between them", () => {
    /*
     * The rejected option was a shared "effective roll" structure sitting
     * between runtime and checks. It is rejected by name here so that
     * reintroducing it is a deliberate act with a failing test attached.
     */
    const everySource = sourceFilesUnder(SRC).filter(
      (path) => !path.includes("__tests__"),
    );

    const offenders = everySource.filter((path) =>
      /\b(?:interface|type|class)\s+EffectiveDieRoll\b/.test(
        readFileSync(path, "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves no ordinary invalid-dice path throwing", () => {
    /*
     * Two RangeErrors survive on purpose, both of the same kind: the PASSIVE
     * sensory resolvers refusing a non-passive request. That is engine code
     * calling the wrong function, not a caller supplying bad data, and turning
     * it into a value would let a dispatch bug be handled as though the
     * character had merely failed to perceive something.
     *
     * Anything else that throws in these domains is a regression.
     */
    const domains = [
      join(SRC, "checks"),
      join(SRC, "runtime"),
      join(SRC, "character", "foundation", "senses"),
    ];

    const throwing = domains
      .flatMap((directory) => sourceFilesUnder(directory))
      .filter((path) => /throw new RangeError/.test(readFileSync(path, "utf8")));

    expect(throwing.map((path) => path.slice(SRC.length)).sort()).toEqual([
      join("character", "foundation", "senses", "concealment", "passive.ts"),
      join("character", "foundation", "senses", "detection", "passive.ts"),
    ]);
  });
});
