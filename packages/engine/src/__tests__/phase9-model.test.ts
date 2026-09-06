/*
 * The Phase 9 model, end to end.
 *
 * Three separations are being defended here, and each was a conflation before:
 *
 *   STR            what an intact form can produce, never what is left of it
 *   AGI / DEX      stored ability minus what being large actually costs
 *   Speed          an intact capability; locomotion is what you can use of it
 *
 * The goldens are the Standard Human and a proportional Scale-10 Giant,
 * because those two are the whole calibration: one defines the reference and
 * the other is ten times it in every linear dimension.
 */

import { describe, expect, it } from "vitest";

import { listDefinitions } from "../character/catalogs";
import { STANDARD_HUMANOID_FORM } from "../character/foundation/body/anatomy/reference-forms";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { destroyContinuity } from "../character/foundation/body/continuity";
import type { ContinuityStates } from "../character/foundation/body/continuity";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { HUMAN_BODY_PROFILE } from "../character/foundation/body/human-profile";
import { resolveBody } from "../character/foundation/body/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import {
  applyPhysicalScaleSteps,
  resolvePhysicalScaleBurden,
} from "../character/foundation/attributes/physical";
import { resolveStrength } from "../character/foundation/attributes/strength";
import { createCharacterStats } from "../character/foundation/attributes/stats";
import {
  REFERENCE_ROUND_MOVEMENT_METERS,
  REFERENCE_SPEED_OF_SOUND_MPS,
  presentMovementMeters,
  resolveMovement,
  resolveMovementRateMps,
  resolveRoundMovementMeters,
  resolveSpeedPosition,
} from "../character/foundation/attributes/speed";
import {
  beginRoundMovement,
  beginRoundMovementFor,
  grantMovement,
  movesRemaining,
  spendMove,
} from "../character/foundation/attributes/movement";
import { resolveDerivedAttributes } from "../character/foundation/attributes/derived/resolution";
import { deriveBaseRoundActionCapacity } from "../character/foundation/actions/resolution";
import { COMBAT_ROUND_DURATION_SECONDS } from "../gameplay/combat/round";
import type { Anatomy } from "../character/foundation/body/anatomy/types";

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

const STORED = {
  agi: 10, dex: 10, con: 10, vit: 10,
  int: 10, wis: 10, per: 10, spi: 10, cha: 10,
};

function resolve(scale: number, continuity: ContinuityStates = {}) {
  const body = resolveBody({
    referenceForm: STANDARD_HUMANOID_FORM,
    continuity,
    definitions: listDefinitions("body-part"),
    specialPointDefinitions: listDefinitions("special-point"),
    morphology: {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      individual: {},
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    speciesStandardScale: scale,
    ageScale: 1,
    characterScale: 1,
    constitution: 10,
    adiposeTissueDensityKgPerL: HUMAN_BODY_PROFILE.adiposeTissueDensityKgPerL,
  });

  if (!body.success) throw new Error("body resolution failed");

  const burden = resolvePhysicalScaleBurden(body.payload.measurements.form);
  const strength = resolveStrength(body.payload.strength.normalizedBodySP);

  const stats = createCharacterStats(
    {
      ...STORED,
      agi: applyPhysicalScaleSteps(STORED.agi, burden.steps),
      dex: applyPhysicalScaleSteps(STORED.dex, burden.steps),
    },
    strength.displayed,
  );

  const derived = resolveDerivedAttributes(stats);

  return {
    body: body.payload,
    burden,
    stats,
    derived,
    strength,
    movement: resolveMovement(
      resolveSpeedPosition(strength.position ?? 0, stats.agi),
      body.payload.locomotion.fraction,
    ),
  };
}


describe("the Standard Human", () => {
  const human = resolve(1);

  it("carries no physical burden and keeps its stored scores", () => {
    expect(human.body.measurements.form.totalVolumeL).toBeCloseTo(60, 6);
    expect(human.body.measurements.form.totalMassKg).toBeCloseTo(62, 6);

    expect(human.burden.rawBurden).toBe(0);
    expect(human.burden.steps).toBe(0);

    expect(human.stats.agi).toBe(10);
    expect(human.stats.dex).toBe(10);
    expect(human.stats.str).toBe(10);
  });

  it("covers 6 metres in a two-second Round, which is 3 m/s", () => {
    expect(human.derived.speed).toBe(10);
    expect(human.movement.speedPosition).toBeCloseTo(10, 10);
    expect(human.movement.baselineRoundMovementMeters).toBeCloseTo(6, 10);
    expect(human.movement.baselineMovementRateMps).toBeCloseTo(3, 10);
  });

  it("resolves every derived attribute to 10", () => {
    for (const value of Object.values(human.derived)) {
      expect(value).toBe(10);
    }
  });
});


describe("the Scale-10 Giant", () => {
  const giant = resolve(10);

  /*
   * 16.5 m, 60,000 L, 62,000 kg. The burden is exactly log2(10) x 1.25.
   */
  it("is charged four whole physical scale steps", () => {
    expect(giant.body.measurements.form.totalVolumeL).toBeCloseTo(60_000, 3);
    expect(giant.body.measurements.form.totalMassKg).toBeCloseTo(62_000, 3);

    expect(giant.burden.linearSizeRatio).toBeCloseTo(10, 10);
    expect(giant.burden.rawBurden).toBeCloseTo(4.1524, 4);
    expect(giant.burden.steps).toBe(4);
  });

  it("resolves STR 16, AGI 6, DEX 6", () => {
    expect(giant.stats.str).toBe(16);
    expect(giant.stats.agi).toBe(6);
    expect(giant.stats.dex).toBe(6);
  });

  /*
   * Volume and Mass reach these through AGI and DEX and are never reapplied.
   * Charging a large creature twice for being large is the failure this
   * propagation exists to avoid.
   */
  it("propagates the burden into every derived stat that reads AGI or DEX", () => {
    expect(giant.derived.acrobatics).toBe(6);   // (6 + 6) / 2
    expect(giant.derived.accuracy).toBe(8);     // (6 + 10) / 2
    expect(giant.derived.concealment).toBe(8);  // (6 + 10) / 2
    expect(giant.derived.combatAbility).toBe(10); // (16+6+6+10+10)/5 = 9.6
  });

  /*
   * Less agile than a Human and still faster in a straight line, because
   * Strength carries it. Speed 11 = (16 + 6) / 2.
   */
  it("covers 7.6 metres a Round despite being clumsier", () => {
    expect(giant.derived.speed).toBe(11);

    /*
     * The displayed Speed is 11 and the position it MOVES on is 11.32,
     * because Strength arrives continuous: the Giant's 16.64 ladder position
     * is worth a third of a point of Speed that flooring would have thrown
     * away. Movement is one of the few consumers that needs the difference.
     */
    expect(giant.strength.position).toBeCloseTo(16.6439, 4);
    expect(giant.movement.speedPosition).toBeCloseTo(11.3219, 4);

    expect(giant.movement.baselineRoundMovementMeters).toBeCloseTo(7.5874, 4);
    expect(giant.movement.baselineMovementRateMps).toBeCloseTo(3.7937, 4);
  });
});


/*
 * The burden is DERIVED from the present measurements every resolve, never
 * banked against the stored score. That is what makes a body change
 * reversible: a character who grows and shrinks back is where they started,
 * and a character who invested in AGI to carry the burden still has the
 * investment when the burden lifts.
 */
describe("a body change is reversible and never consumes invested AGI", () => {
  const small = resolve(1);
  const large = resolve(10);
  const smallAgain = resolve(1);

  it("charges the large form and returns the small one intact", () => {
    expect(large.burden.steps).toBe(4);
    expect(large.stats.agi).toBe(6);

    expect(smallAgain.burden.steps).toBe(0);
    expect(smallAgain.stats.agi).toBe(10);
    expect(smallAgain.stats.agi).toBe(small.stats.agi);
  });

  it("returns movement to exactly where it started", () => {
    expect(large.movement.baselineRoundMovementMeters)
      .not.toBeCloseTo(small.movement.baselineRoundMovementMeters, 6);

    expect(smallAgain.movement.speedPosition)
      .toBe(small.movement.speedPosition);

    expect(smallAgain.movement.baselineRoundMovementMeters)
      .toBe(small.movement.baselineRoundMovementMeters);
  });

  /*
   * The Giant is SLOWER in AGI and FASTER overall, because Strength carries
   * it. Both halves reach movement through the resolved scores and neither is
   * applied twice — Speed never sees Volume or Mass at all.
   */
  it("lets Strength outrun the agility the size cost", () => {
    expect(large.stats.agi).toBeLessThan(small.stats.agi);

    expect(large.movement.baselineRoundMovementMeters)
      .toBeGreaterThan(small.movement.baselineRoundMovementMeters);
  });
});


describe("the Speed curve", () => {
  /* The two locked anchors. Everything else is the curve between them. */
  it("puts Speed 10 at exactly 6 metres a Round and 3 m/s", () => {
    expect(resolveRoundMovementMeters(10)).toBeCloseTo(6, 10);
    expect(resolveRoundMovementMeters(10))
      .toBeCloseTo(REFERENCE_ROUND_MOVEMENT_METERS, 10);
    expect(resolveMovementRateMps(10)).toBeCloseTo(3, 10);
  });

  it("puts Speed 30 at 700 metres a Round and 350 m/s", () => {
    expect(resolveRoundMovementMeters(30)).toBeCloseTo(700, 6);
    expect(resolveMovementRateMps(30)).toBeCloseTo(350, 6);
  });

  /*
   * The top of the ladder is meant to sit just past the sound barrier — near
   * enough that breaking it is a landmark rather than an afterthought.
   */
  it("leaves Speed 30 barely past the reference speed of sound", () => {
    expect(resolveMovementRateMps(30))
      .toBeGreaterThan(REFERENCE_SPEED_OF_SOUND_MPS);

    expect(resolveMovementRateMps(29))
      .toBeLessThan(REFERENCE_SPEED_OF_SOUND_MPS);
  });

  it("stays finite, positive and monotonic across Speed 1 to 30", () => {
    let previous = 0;

    for (let speed = 1; speed <= 30; speed += 0.25) {
      const movement = resolveRoundMovementMeters(speed);

      expect(Number.isFinite(movement)).toBe(true);
      expect(movement).toBeGreaterThan(0);
      expect(movement).toBeGreaterThan(previous);

      previous = movement;
    }
  });

  /*
   * The property the quadratic term exists for. A constant-doubling curve
   * would make every one of these ratios identical, and the last points of
   * the ladder would buy no more than the first.
   */
  it("makes each point of Speed buy proportionally more than the last", () => {
    const growth = (speed: number) =>
      resolveRoundMovementMeters(speed + 1) / resolveRoundMovementMeters(speed);

    for (let speed = 1; speed < 29; speed += 1) {
      expect(growth(speed + 1)).toBeGreaterThan(growth(speed));
    }
  });

  /* Flooring before converting is what this replaces. */
  it("moves a fractional Speed position differently from a whole one", () => {
    expect(resolveRoundMovementMeters(10.5))
      .toBeGreaterThan(resolveRoundMovementMeters(10));

    expect(resolveRoundMovementMeters(10.5))
      .toBeLessThan(resolveRoundMovementMeters(11));
  });

  it("averages the two resolved Attributes it is built from", () => {
    expect(resolveSpeedPosition(16.643856189774723, 6))
      .toBeCloseTo(11.321928094887362, 12);
  });

  /*
   * Safe rather than refused: these are pure derivations with no EngineResult
   * to fail into, and a NaN distance on a sheet names nothing.
   */
  it("resolves a non-finite input to zero instead of propagating it", () => {
    expect(resolveRoundMovementMeters(Number.NaN)).toBe(0);
    expect(resolveRoundMovementMeters(Number.POSITIVE_INFINITY)).toBe(0);
    expect(resolveSpeedPosition(Number.NaN, 10)).toBe(0);
    expect(resolveSpeedPosition(10, Number.NaN)).toBe(0);
  });
});


describe("movement presentation", () => {
  it("presents two significant figures", () => {
    expect(presentMovementMeters(6)).toBe(6);
    expect(presentMovementMeters(resolveRoundMovementMeters(13))).toBe(10);
    expect(presentMovementMeters(resolveRoundMovementMeters(16))).toBe(19);
    expect(presentMovementMeters(resolveRoundMovementMeters(25))).toBe(170);
    expect(presentMovementMeters(resolveRoundMovementMeters(30))).toBe(700);
  });

  /*
   * The rounding is a display concern and nothing downstream consumes it.
   * Rounding a Move share before it accumulates is precisely how a character
   * ends a Round having travelled slightly more or less than their allowance.
   */
  it("does not disturb the value it was derived from", () => {
    const exact = resolveRoundMovementMeters(16);

    presentMovementMeters(exact);

    expect(exact).toBeCloseTo(19.0659, 4);
    expect(exact).not.toBe(presentMovementMeters(exact));
  });

  it("does not alter the Round movement cap", () => {
    const round = beginRoundMovement(resolveRoundMovementMeters(16), 4);

    expect(round.allowance.roundMovementMeters).toBeCloseTo(19.0659, 4);
    expect(presentMovementMeters(round.allowance.moveDistanceMeters)).toBe(4.8);
    expect(round.allowance.moveDistanceMeters).not.toBe(4.8);
  });
});


/*
 * A Round holds ONE allowance. Round Actions decide how finely it divides,
 * never how much of it there is.
 */
describe("Move divides one Round allowance", () => {
  const humanRound = (capacity: number) => beginRoundMovement(6, capacity);

  it.each([
    [1, 6],
    [2, 3],
    [3, 2],
    [4, 1.5],
    [6, 1],
    [10, 0.6],
  ])("gives %i Round Actions a %s metre Move", (capacity, expected) => {
    expect(humanRound(capacity).allowance.moveDistanceMeters)
      .toBeCloseTo(expected, 10);
  });

  it("reaches exactly the cap when every Action is spent on Move", () => {
    for (const capacity of [1, 2, 3, 4, 6, 7, 10]) {
      let state = humanRound(capacity);

      for (let move = 0; move < capacity; move += 1) {
        state = spendMove(state).state;
      }

      /* Exactly, not approximately: seven sevenths of 6 must be 6. */
      expect(state.consumedMeters).toBe(6);
      expect(state.remainingMeters).toBe(0);
    }
  });

  it("refuses a Move once the allowance is spent", () => {
    let state = humanRound(2);

    state = spendMove(state).state;
    state = spendMove(state).state;

    const extra = spendMove(state);

    expect(extra.distanceMeters).toBe(0);
    expect(extra.refusal).toBe("allowance-spent");
    expect(extra.state.consumedMeters).toBe(6);
  });

  it("cannot Move at all on zero Round Actions", () => {
    const none = beginRoundMovement(6, 0);

    expect(none.allowance.moveShare).toBe(0);
    expect(none.allowance.moveDistanceMeters).toBe(0);

    const attempt = spendMove(none);

    expect(attempt.distanceMeters).toBe(0);
    expect(attempt.refusal).toBe("no-round-actions");
  });

  /*
   * The divisor is a snapshot. Re-dividing as the capacity moved would let an
   * effect that never mentioned movement rob a character of ground they had
   * already banked, or hand them ground they had not.
   */
  it("keeps the divisor a character opened the Round with", () => {
    const opened = humanRound(2);
    const afterOneMove = spendMove(opened).state;

    expect(afterOneMove.consumedMeters).toBeCloseTo(3, 10);

    /* An Action lost mid-Round: the snapshot, and the banked half, survive. */
    expect(afterOneMove.allowance.roundActionCapacity).toBe(2);
    expect(afterOneMove.allowance.moveDistanceMeters).toBeCloseTo(3, 10);
    expect(movesRemaining(afterOneMove)).toBe(1);
  });

  /*
   * Actions per TURN are a sequencing rule. They decide when a character may
   * act, not how far they travel, and appear in neither formula.
   */
  it("is unaffected by how the Round's Actions are spread across Turns", () => {
    const twoTurnsOfOne = humanRound(2);
    const oneTurnOfTwo = humanRound(2);

    expect(twoTurnsOfOne.allowance.moveDistanceMeters)
      .toBe(oneTurnOfTwo.allowance.moveDistanceMeters);
  });

  /* A Speed 30 character with two Actions: 350 m per Move, 700 m per Round. */
  it("moves a Speed 30 character 350 metres a Move and 700 a Round", () => {
    let state = beginRoundMovement(resolveRoundMovementMeters(30), 2);

    expect(state.allowance.moveDistanceMeters).toBeCloseTo(350, 6);

    state = spendMove(state).state;
    state = spendMove(state).state;

    expect(state.consumedMeters).toBeCloseTo(700, 6);
    expect(presentMovementMeters(state.consumedMeters)).toBe(700);
  });

  /*
   * Granted movement must say whether it draws on the Round allowance.
   * Neither answer is safe to assume: a free step that ignored the cap is a
   * movement bonus, and a shove that consumed it punishes the victim.
   */
  it("charges granted movement against the cap only when told to", () => {
    const charged = grantMovement(humanRound(2), 2, {
      chargedAgainstCap: true,
    });

    expect(charged.consumedMeters).toBeCloseTo(2, 10);
    expect(charged.remainingMeters).toBeCloseTo(4, 10);

    const free = grantMovement(humanRound(2), 2, {
      chargedAgainstCap: false,
    });

    expect(free.consumedMeters).toBe(0);
    expect(free.remainingMeters).toBe(6);
    expect(free.grantedUnchargedMeters).toBe(2);
  });

  it("never lets charged grants push consumption past the cap", () => {
    const shoved = grantMovement(humanRound(2), 100, {
      chargedAgainstCap: true,
    });

    expect(shoved.consumedMeters).toBe(6);
    expect(shoved.remainingMeters).toBe(0);
  });
});


describe("locomotion gates movement, never Speed", () => {
  /*
   * Destruction is recorded against IDENTITY now, and instantiation cascades:
   * destroying a Leg takes the Foot hanging off it, so only the limbs
   * themselves are named here.
   */
  const destroyed = (...keys: readonly string[]): ContinuityStates =>
    keys.reduce(
      (states, key) => destroyContinuity(states, continuityKey(key)),
      {} as ContinuityStates,
    );

  const legless = () => destroyed("lower-limb:left", "lower-limb:right");

  /*
   * The gap this closes. Strength describes the intact form and AGI reads
   * intact-form measurements, so a legless character keeps Speed 10 — and
   * would have kept full movement too, which is obviously wrong. Locomotion is
   * where losing your legs is felt.
   */
  it("leaves Speed alone and takes the movement", () => {
    const lost = resolve(1, legless());

    expect(lost.stats.str).toBe(10);
    expect(lost.stats.agi).toBe(10);
    expect(lost.derived.speed).toBe(10);

    expect(lost.body.locomotion.fraction).toBe(0);
    expect(lost.movement.baselineRoundMovementMeters).toBeCloseTo(6, 10);
    expect(lost.movement.currentRoundMovementMeters).toBe(0);

    const round = beginRoundMovementFor(lost.movement, 2);

    expect(round.allowance.moveDistanceMeters).toBe(0);
  });

  it("halves movement when one of two chains is gone", () => {
    const lost = resolve(1, destroyed("lower-limb:left"));

    expect(lost.body.locomotion.fraction).toBe(0.5);
    expect(lost.movement.currentRoundMovementMeters).toBeCloseTo(3, 10);

    expect(beginRoundMovementFor(lost.movement, 2).allowance.moveDistanceMeters)
      .toBeCloseTo(1.5, 10);
  });

  /*
   * Losing an Arm must not slow anyone down. A whole-body measure could not
   * tell an Arm from a Leg, which is why locomotion resolves per chain.
   */
  it("ignores anatomy that does not carry the body", () => {
    const lost = resolve(1, destroyed("upper-limb:left", "upper-limb:right"));

    expect(lost.body.locomotion.fraction).toBe(1);
    expect(lost.movement.currentRoundMovementMeters).toBeCloseTo(6, 10);
  });

  it("finds two chains on a humanoid, each a Leg and its Foot", () => {
    const { chains } = resolve(1).body.locomotion;

    expect(chains).toHaveLength(2);
    expect(chains.map((chain) => chain.partIds.slice().sort())).toEqual([
      ["foot-1", "leg-1"],
      ["foot-2", "leg-2"],
    ]);
  });
});


describe("the action economy", () => {
  it("runs a two-second Round", () => {
    expect(COMBAT_ROUND_DURATION_SECONDS).toBe(2);
  });

  it.each([
    [4, 0], [5, 1], [7, 1], [8, 2], [12, 2], [13, 3], [14, 3],
    [15, 4], [17, 4], [18, 5], [19, 5], [20, 6], [22, 6],
    [23, 7], [24, 7], [25, 8], [27, 8], [28, 9], [29, 9], [30, 10],
  ])("gives Combat Ability %i a budget of %i Round Actions", (ca, actions) => {
    expect(deriveBaseRoundActionCapacity(ca)).toBe(actions);
  });
});
