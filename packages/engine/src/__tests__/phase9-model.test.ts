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
  REFERENCE_MOVEMENT_RATE_MPS,
  resolveMovement,
  resolveMovementRateMps,
} from "../character/foundation/attributes/speed";
import { resolveDerivedAttributes } from "../character/foundation/attributes/derived/resolution";
import { deriveBaseRoundActionCapacity } from "../character/mechanics/actions/resolution";
import { COMBAT_ROUND_DURATION_SECONDS } from "../combat/round";
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
    movement: resolveMovement(
      (stats.str + stats.agi) / 2,
      body.payload.locomotion.fraction,
    ),
  };
}


describe("the Standard Human", () => {
  const human = resolve(1);

  it("carries no physical burden and keeps its stored scores", () => {
    expect(human.body.measurements.form.totalSizeL).toBeCloseTo(60, 6);
    expect(human.body.measurements.form.totalMassKg).toBeCloseTo(62, 6);

    expect(human.burden.rawBurden).toBe(0);
    expect(human.burden.steps).toBe(0);

    expect(human.stats.agi).toBe(10);
    expect(human.stats.dex).toBe(10);
    expect(human.stats.str).toBe(10);
  });

  it("moves 10 metres in a standard 3-second Move", () => {
    expect(human.derived.speed).toBe(10);
    expect(human.movement.baseMovementRateMps).toBeCloseTo(10 / 3, 10);
    expect(human.movement.moveDistanceMeters).toBeCloseTo(10, 10);
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
    expect(giant.body.measurements.form.totalSizeL).toBeCloseTo(60_000, 3);
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
   * Size and Mass reach these through AGI and DEX and are never reapplied.
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
  it("moves 12.6 metres per Move despite being clumsier", () => {
    expect(giant.derived.speed).toBe(11);
    expect(giant.movement.baseMovementRateMps).toBeCloseTo(4.1997, 4);
    expect(giant.movement.moveDistanceMeters).toBeCloseTo(12.599, 3);
  });
});


describe("Speed scaling", () => {
  it("doubles velocity every +3 and halves it every -3", () => {
    const base = resolveMovementRateMps(10);

    expect(base).toBeCloseTo(REFERENCE_MOVEMENT_RATE_MPS, 10);
    expect(resolveMovementRateMps(13)).toBeCloseTo(base * 2, 10);
    expect(resolveMovementRateMps(16)).toBeCloseTo(base * 4, 10);
    expect(resolveMovementRateMps(7)).toBeCloseTo(base / 2, 10);
  });

  /*
   * Actions per TURN slice the Round more finely; Actions per ROUND do not.
   * A creature with more Round Actions gets more opportunities to move, each
   * covering a full distance — not more, shorter ones.
   */
  it("divides a Move by Actions per Turn and not by Actions per Round", () => {
    const move = (actionsPerTurn: number) =>
      resolveMovement(10, 1, actionsPerTurn).moveDistanceMeters;

    expect(move(2)).toBeCloseTo(10, 10);
    expect(move(3)).toBeCloseTo(6.667, 3);
    expect(move(4)).toBeCloseTo(5, 10);
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
    expect(lost.movement.baseMovementRateMps).toBeCloseTo(10 / 3, 10);
    expect(lost.movement.currentMovementRateMps).toBe(0);
    expect(lost.movement.moveDistanceMeters).toBe(0);
  });

  it("halves movement when one of two chains is gone", () => {
    const lost = resolve(1, destroyed("lower-limb:left"));

    expect(lost.body.locomotion.fraction).toBe(0.5);
    expect(lost.movement.moveDistanceMeters).toBeCloseTo(5, 10);
  });

  /*
   * Losing an Arm must not slow anyone down. A whole-body measure could not
   * tell an Arm from a Leg, which is why locomotion resolves per chain.
   */
  it("ignores anatomy that does not carry the body", () => {
    const lost = resolve(1, destroyed("upper-limb:left", "upper-limb:right"));

    expect(lost.body.locomotion.fraction).toBe(1);
    expect(lost.movement.moveDistanceMeters).toBeCloseTo(10, 10);
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
  it("runs a six-second Round", () => {
    expect(COMBAT_ROUND_DURATION_SECONDS).toBe(6);
  });

  it.each([
    [4, 0], [5, 1], [7, 1], [8, 2], [12, 2], [13, 3], [14, 3],
    [15, 4], [17, 4], [18, 5], [19, 5], [20, 6], [22, 6],
    [23, 7], [24, 7], [25, 8], [27, 8], [28, 9], [29, 9], [30, 10],
  ])("gives Combat Ability %i a budget of %i Round Actions", (ca, actions) => {
    expect(deriveBaseRoundActionCapacity(ca)).toBe(actions);
  });
});
