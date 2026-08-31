/*
 * Placeholder physical data for Body tests written before the physical model.
 *
 * These suites — anatomy structure, Body Points, damage, recovery, selectors —
 * predate Structural Capacity, Length/Size/Mass and Strength Points, and none
 * of them exercise those values. They only need their BodyPartDefinition and
 * Body fixtures to satisfy the type.
 *
 * The numbers below are therefore deliberately inert and deliberately NOT the
 * Human Standard: nothing here should be mistaken for calibration, and no test
 * should ever assert against them. The real reference data lives in
 * anatomy/body-parts.ts and is asserted by body-reference-standard.test.ts.
 *
 * As each suite is rewritten to cover the physical model, it should stop
 * spreading these and author the values its own case actually needs.
 */

import { NEUTRAL_MORPHOLOGY } from "../../character/foundation/body/types";

/** Spread into a BodyPartDefinition literal that predates the physical model. */
export const TEST_PART_PHYSICALS = {
  reference: {
    lengthCm: 10,
    sizeL: 1,
    massKg: 1,
    structuralCapacity: 10,
    intrinsicPhysicalForce: 1,
    heightContribution: 0,
      heightAxisSign: 1,
  },
  sensitivity: {
    bulkSize: 0,
    adipositySize: 0,
    muscularityMass: 0,
    muscularityStructural: 0,
    muscularityForce: 0,
  },
} as const;

/** Spread into a Body literal that predates Scale and the morphology layers. */
export const TEST_BODY_STATE = {
  characterScale: 1,
  globalMorphology: NEUTRAL_MORPHOLOGY,
  localMorphology: {},
  strengthDevelopmentMuscularity: 1,
} as const;
