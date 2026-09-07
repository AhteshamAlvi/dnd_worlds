/*
 * Movement's contracts with the rest of the engine.
 *
 * The Speed curve and the Move division are exercised in phase9-model.test.ts,
 * against the resolved bodies that produce them. What is checked here is the
 * three things that had gone wrong and would go wrong again silently:
 *
 *   - Movement carrying its own idea of how long a Round is. It carried six
 *     for as long as the clock said two, and nothing compared them.
 *   - Speed reading Body directly, which would charge a large creature for its
 *     size twice — once through AGI and once through a stride term.
 *   - Speed reading the DISPLAYED Strength Stat, which is floored, so two
 *     characters 40% apart in Structural Capacity moved identically.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMBAT_ROUNDS_PER_HOUR,
  GAME_SECONDS_PER_HOUR,
  SECONDS_PER_COMBAT_ROUND,
} from "../time/duration";
import { COMBAT_ROUND_DURATION_SECONDS } from "../gameplay/combat/round";
import {
  REFERENCE_ROUND_MOVEMENT_METERS,
  presentMovementMeters,
  resolveMovement,
  resolveMovementRateMps,
  resolveRoundMovementMeters,
} from "../character/foundation/attributes/speed";
import {
  beginRoundMovement,
  beginRoundMovementFor,
  movesRemaining,
  normalizeRoundActionCapacity,
  resolveMoveShare,
  spendMove,
  totalDistanceTravelledMeters,
  grantMovement,
} from "../character/foundation/attributes/movement";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sourceFilesUnder(directory: string): readonly string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      files.push(...sourceFilesUnder(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

function moduleSpecifiers(path: string): readonly string[] {
  const source = readFileSync(path, "utf8");

  return [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((match) => match[1]!);
}

const MOVEMENT_SOURCES = [
  join(SRC, "character", "foundation", "attributes", "speed.ts"),
  join(SRC, "character", "foundation", "attributes", "movement.ts"),
];

/* Everything shipped, as opposed to the tests that describe it. */
const PRODUCTION_SOURCES = sourceFilesUnder(SRC).filter(
  (path) => !path.includes("__tests__"),
);


describe("one canonical Combat Round", () => {
  it("is exactly two seconds, under either name", () => {
    expect(SECONDS_PER_COMBAT_ROUND).toBe(2);
    expect(COMBAT_ROUND_DURATION_SECONDS).toBe(2);
    expect(COMBAT_ROUND_DURATION_SECONDS).toBe(SECONDS_PER_COMBAT_ROUND);
  });

  it("puts exactly 1,800 Rounds in an hour", () => {
    expect(COMBAT_ROUNDS_PER_HOUR).toBe(1800);
    expect(COMBAT_ROUNDS_PER_HOUR * SECONDS_PER_COMBAT_ROUND)
      .toBe(GAME_SECONDS_PER_HOUR);
  });

  /*
   * The check that would have caught the drift. Movement's velocity is its
   * Round allowance divided by the authoritative constant, so changing the
   * Round changes movement rather than leaving it behind.
   */
  it("is the divisor movement actually converts velocity with", () => {
    expect(resolveMovementRateMps(10))
      .toBeCloseTo(resolveRoundMovementMeters(10) / SECONDS_PER_COMBAT_ROUND, 12);

    expect(resolveMovementRateMps(23))
      .toBeCloseTo(resolveRoundMovementMeters(23) / SECONDS_PER_COMBAT_ROUND, 12);
  });

  it("is imported by movement rather than redeclared", () => {
    for (const path of MOVEMENT_SOURCES) {
      const source = readFileSync(path, "utf8");

      /* No local constant assignment of a Round length, under any name. */
      expect(source).not.toMatch(/ROUND_DURATION_SECONDS\s*=/);
      expect(source).not.toMatch(/SECONDS_PER_COMBAT_ROUND\s*=\s*\d/);
    }

    expect(moduleSpecifiers(MOVEMENT_SOURCES[0]!))
      .toContain("../../../time/duration");
  });

  /*
   * No production file may state a Round length of its own. The stale six
   * survived precisely because it was a second declaration nothing compared
   * against the first.
   */
  it("leaves no production source declaring a Round length", () => {
    const offenders = PRODUCTION_SOURCES.filter((path) => {
      if (path === join(SRC, "time", "duration.ts")) return false;

      return /\bROUND_DURATION_SECONDS\s*=\s*\d/.test(readFileSync(path, "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  /*
   * The old anchor, in either of the forms it was written in.
   *
   * decisions/log.ts is exempt and is the only file that is: recording what a
   * superseded rule USED to say is the entire purpose of that file, and a
   * decision entry that could not name the thing it replaced would be worth
   * less than no entry.
   */
  it("leaves no production source assuming a three-second Move", () => {
    const offenders = PRODUCTION_SOURCES.filter((path) => {
      if (path === join(SRC, "decisions", "log.ts")) return false;

      const source = readFileSync(path, "utf8");

      return /3-second Move|three-second Move|10 metres in 3 seconds/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});


describe("Speed consumes resolved Attributes and nothing else", () => {
  /*
   * The boundary, checked against the source text. Volume, Mass and morphology
   * reach movement through resolved AGI — attributes/physical.ts applies them
   * once — and Speed reapplying any of them would charge a Giant twice.
   */
  it("imports nothing from Body", () => {
    const offenders = MOVEMENT_SOURCES.filter((path) =>
      moduleSpecifiers(path).some((specifier) => specifier.includes("body")),
    );

    expect(offenders).toEqual([]);
  });

  it("names no Body quantity at all", () => {
    for (const path of MOVEMENT_SOURCES) {
      const code = readFileSync(path, "utf8")
        /* Prose explaining WHY the boundary exists is not a dependency. */
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(code).not.toMatch(
        /\bVolume\b|\bvolumeL\b|\bmassKg\b|muscularity|adiposity|\bstature\b/i,
      );
    }
  });

  it("is not imported by Body", () => {
    const bodyFiles = sourceFilesUnder(
      join(SRC, "character", "foundation", "body"),
    );

    expect(bodyFiles.length).toBeGreaterThan(20);

    const offenders = bodyFiles.filter((path) =>
      moduleSpecifiers(path).some(
        (specifier) =>
          specifier.endsWith("attributes/speed") ||
          specifier.endsWith("attributes/movement"),
      ),
    );

    expect(offenders).toEqual([]);
  });
});


describe("mass and size reach movement through resolved AGI, once", () => {
  const speedOf = (character: ReturnType<typeof createTestCharacter>) =>
    resolveTestCharacter(character).movement;

  /*
   * Two characters who reach one Speed by DIFFERENT Attribute splits. AGI 14
   * against the fixture's STR 10 averages to 12, and so does AGI 12 with the
   * two points moved elsewhere — the earlier version of this test compared two
   * identical characters, which proved only that the function was a function.
   */
  it("gives equal canonical Speed equal baseline movement", () => {
    const agile = speedOf(createTestCharacter({ attributes: { agi: 14 } }));
    const also = speedOf(createTestCharacter({ attributes: { agi: 14, dex: 6 } }));

    expect(agile.displayedSpeed).toBe(12);
    expect(also.displayedSpeed).toBe(12);

    expect(also.baselineRoundMovementMeters)
      .toBe(agile.baselineRoundMovementMeters);

    expect(agile.baselineRoundMovementMeters)
      .toBe(resolveRoundMovementMeters(12));
  });

  it("moves an agile character further than a clumsy one", () => {
    const agile = speedOf(createTestCharacter({ attributes: { agi: 16 } }));
    const clumsy = speedOf(createTestCharacter({ attributes: { agi: 6 } }));

    expect(agile.baselineRoundMovementMeters)
      .toBeGreaterThan(clumsy.baselineRoundMovementMeters);
  });

  /*
   * Invested AGI is a stored score; the Body adjustment is applied to it; the
   * result is what Speed reads. Raising the investment therefore compensates
   * for a burden rather than being erased by it, and lowering the burden later
   * returns the character to where their investment says they should be.
   */
  it("lets invested AGI compensate for a burden and survive it", () => {
    const burdened = resolveTestCharacter(
      createTestCharacter({ attributes: { agi: 10 } }),
    );

    const invested = resolveTestCharacter(
      createTestCharacter({ attributes: { agi: 14 } }),
    );

    expect(invested.attributes.stored.agi).toBe(14);
    expect(invested.movement.baselineRoundMovementMeters)
      .toBeGreaterThan(burdened.movement.baselineRoundMovementMeters);

    /* The stored score is never written to, so nothing can consume it. */
    expect(burdened.attributes.stored.agi).toBe(10);
  });

  /*
   * There is exactly one Speed, and movement does not reconstruct it.
   *
   * Neither movement module mentions STR, AGI or a Strength ladder position:
   * `derivedAttributes.speed` is resolved once in character/resolution.ts and
   * handed over. A second derivation here is precisely what let base movement
   * and the displayed Stat disagree.
   */
  it("does not rebuild Speed out of STR and AGI", () => {
    for (const path of MOVEMENT_SOURCES) {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(code).not.toMatch(/strengthPosition|\bagility\b|\.agi\b|\.str\b/);
    }
  });
});


describe("a Round's allowance is one allowance", () => {
  const human = () => resolveMovement(10, 1);

  it("hands a resolved character straight to a Round", () => {
    const round = beginRoundMovementFor(human(), 2);

    expect(round.allowance.roundMovementMeters)
      .toBeCloseTo(REFERENCE_ROUND_MOVEMENT_METERS, 10);

    expect(round.allowance.moveDistanceMeters).toBeCloseTo(3, 10);
  });

  /*
   * A Reaction Move is a Move. It draws on the same Round allowance as any
   * other, which is what stops a character doubling their ground by moving on
   * somebody else's Turn.
   */
  it("charges a Reaction Move to the same allowance as a Turn Move", () => {
    let state = beginRoundMovement(6, 2);

    const onTurn = spendMove(state);
    state = onTurn.state;

    const onReaction = spendMove(state);
    state = onReaction.state;

    expect(onTurn.distanceMeters).toBeCloseTo(3, 10);
    expect(onReaction.distanceMeters).toBeCloseTo(3, 10);
    expect(state.consumedMeters).toBe(6);
    expect(spendMove(state).refusal).toBe("allowance-spent");
  });

  /*
   * Accumulating a share at a time drifts, and the drift shows up as a
   * character who cannot quite reach a square they have exactly enough
   * movement for. Sevenths are the case that catches it.
   */
  it("accumulates awkward shares without drift", () => {
    for (const capacity of [3, 6, 7, 9, 11]) {
      let state = beginRoundMovement(6, capacity);

      for (let move = 0; move < capacity; move += 1) {
        state = spendMove(state).state;
      }

      expect(state.consumedMeters).toBe(6);
    }
  });

  it("reports uncharged grants outside the cap without inflating it", () => {
    const shoved = grantMovement(beginRoundMovement(6, 2), 12, {
      chargedAgainstCap: false,
    });

    expect(shoved.consumedMeters).toBe(0);
    expect(shoved.remainingMeters).toBe(6);
    expect(totalDistanceTravelledMeters(shoved)).toBe(12);
  });

  /* Presentation never touches what is stored. */
  it("keeps full precision behind a two-significant-figure display", () => {
    const state = beginRoundMovement(resolveRoundMovementMeters(23), 3);
    const spent = spendMove(state).state;

    expect(presentMovementMeters(spent.consumedMeters)).toBe(33);
    expect(spent.consumedMeters).toBeCloseTo(32.8652, 4);
    expect(spent.consumedMeters).not.toBe(33);
  });
});


/*
 * Moves and charged grants draw on ONE allowance.
 *
 * The ledger used to let a character whose whole Round had already been
 * consumed by a shove spend an Action on a Move anyway: `movesSpent` went up,
 * the refusal was null, and the reported distance was zero. A caller counting
 * successful Moves believed it, and the Action was spent either way.
 */
describe("charged grants and Moves share one allowance", () => {
  const round = () => beginRoundMovement(6, 2);

  it("refuses a Move when a charged grant took the whole Round", () => {
    const shoved = grantMovement(round(), 6, { chargedAgainstCap: true });

    expect(shoved.remainingMeters).toBe(0);
    expect(movesRemaining(shoved)).toBe(2);

    const attempt = spendMove(shoved);

    expect(attempt.refusal).toBe("allowance-spent");
    expect(attempt.distanceMeters).toBe(0);
  });

  /* The Action is not spent on nothing: the ledger is returned untouched. */
  it("does not spend the Action on a refused Move", () => {
    const shoved = grantMovement(round(), 6, { chargedAgainstCap: true });
    const attempt = spendMove(shoved);

    expect(attempt.state.movesSpent).toBe(0);
    expect(attempt.state).toBe(shoved);
    expect(movesRemaining(attempt.state)).toBe(2);
  });

  /*
   * Short is not refused. A partly consumed allowance still permits a Move,
   * which covers what is left and spends the Action, because the Move
   * happened — it just did not get far.
   */
  it("lets a Move cover only what a partial grant left", () => {
    const nudged = grantMovement(round(), 5, { chargedAgainstCap: true });

    expect(nudged.remainingMeters).toBeCloseTo(1, 10);

    const move = spendMove(nudged);

    expect(move.refusal).toBeNull();
    expect(move.distanceMeters).toBeCloseTo(1, 10);
    expect(move.state.movesSpent).toBe(1);
    expect(move.state.remainingMeters).toBe(0);

    /* And the next one has nothing left at all. */
    expect(spendMove(move.state).refusal).toBe("allowance-spent");
  });

  it("clamps a charged grant to the remaining allowance and records it clamped", () => {
    const shoved = grantMovement(round(), 100, { chargedAgainstCap: true });

    expect(shoved.consumedMeters).toBe(6);
    expect(shoved.grantedChargedMeters).toBe(6);
    expect(totalDistanceTravelledMeters(shoved)).toBe(6);
  });

  it("keeps charged and uncharged totals apart", () => {
    let state = grantMovement(round(), 2, { chargedAgainstCap: true });
    state = grantMovement(state, 9, { chargedAgainstCap: false });

    expect(state.grantedChargedMeters).toBeCloseTo(2, 10);
    expect(state.grantedUnchargedMeters).toBe(9);
    expect(state.consumedMeters).toBeCloseTo(2, 10);
    expect(state.remainingMeters).toBeCloseTo(4, 10);
    expect(totalDistanceTravelledMeters(state)).toBeCloseTo(11, 10);
  });

  it("never lets Moves and grants together exceed the cap", () => {
    let state = round();

    state = spendMove(state).state;
    state = grantMovement(state, 50, { chargedAgainstCap: true });
    state = spendMove(state).state;

    expect(state.consumedMeters).toBe(6);
    expect(state.remainingMeters).toBe(0);
  });

  /* Refusal precedence, all three cases, in order. */
  it("orders its refusals deterministically", () => {
    expect(spendMove(beginRoundMovement(6, 0)).refusal).toBe("no-round-actions");

    let spent = beginRoundMovement(6, 1);
    spent = spendMove(spent).state;
    expect(spendMove(spent).refusal).toBe("allowance-spent");

    const drained = grantMovement(round(), 6, { chargedAgainstCap: true });
    expect(movesRemaining(drained)).toBeGreaterThan(0);
    expect(spendMove(drained).refusal).toBe("allowance-spent");
  });
});


describe("Round Action capacity normalizes one way everywhere", () => {
  it.each([
    [2, 2],
    [2.5, 2],
    [2.999, 2],
    [1, 1],
    [0, 0],
    [-3, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("normalizes %s to %i", (given, expected) => {
    expect(normalizeRoundActionCapacity(given)).toBe(expected);
  });

  /*
   * Two normalizations that merely agree today are two that can disagree after
   * an edit, and a share the ledger cannot spend is the result.
   */
  it("floors identically in the share helper and the ledger", () => {
    for (const capacity of [2.5, 3.7, 0.9, -1, Number.NaN]) {
      const normalized = normalizeRoundActionCapacity(capacity);
      const opened = beginRoundMovement(6, capacity);

      expect(opened.allowance.roundActionCapacity).toBe(normalized);
      expect(resolveMoveShare(capacity))
        .toBe(opened.allowance.moveShare);
    }
  });

  it("gives no usable Move to a capacity that normalizes to zero", () => {
    for (const capacity of [0, -2, 0.4, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const opened = beginRoundMovement(6, capacity);

      expect(opened.allowance.moveShare).toBe(0);
      expect(opened.allowance.moveDistanceMeters).toBe(0);
      expect(spendMove(opened).refusal).toBe("no-round-actions");
    }
  });

  it("divides rather than multiplies as capacity rises", () => {
    expect(beginRoundMovement(6, 1).allowance.moveDistanceMeters).toBe(6);
    expect(beginRoundMovement(6, 2).allowance.moveDistanceMeters).toBe(3);
    expect(beginRoundMovement(6, 4).allowance.moveDistanceMeters).toBe(1.5);

    for (const capacity of [1, 2, 4, 6, 10]) {
      let state = beginRoundMovement(6, capacity);

      for (let move = 0; move < capacity; move += 1) {
        state = spendMove(state).state;
      }

      expect(state.consumedMeters).toBe(6);
    }
  });

  /* The snapshot survives whatever happens to the character afterwards. */
  it("keeps the capacity the ledger opened with", () => {
    const opened = beginRoundMovement(6, 4);
    const afterOne = spendMove(opened).state;

    expect(afterOne.allowance.roundActionCapacity).toBe(4);
    expect(afterOne.allowance.moveDistanceMeters).toBe(1.5);
    expect(movesRemaining(afterOne)).toBe(3);
  });
});
