/*
 * The Human developmental curve.
 *
 * Scale is proportional height against the 165 cm mature reference, so each
 * anchor's height is simply 165 x scale: 50 cm at birth, 116 cm at six, 165 cm
 * at twenty, and about 5 cm lost again by eighty.
 *
 * Muscularity is force-relevant development rather than visible bulk, which is
 * why it lags scale through childhood and falls faster than height in old age.
 *
 * Bulk and adiposity carry the shape rather than the size. Children are
 * proportionally stockier and softer than a lean adult; adolescents lean out;
 * middle and old age put weight back on as fat while muscle recedes.
 *
 *
 * WHAT THIS CURVE RESOLVES TO
 *
 *   age   height     mass    STR
 *     0     50 cm    1.8 kg    5
 *     2     86 cm    8.9 kg    7
 *     6    116 cm   20.1 kg    8
 *    12    140 cm   37.7 kg    9
 *    16    160 cm   56.4 kg    9
 *    20    165 cm   62.0 kg   10
 *    40    165 cm   62.7 kg   10
 *    60    163 cm   59.4 kg    9
 *    80    160 cm   51.6 kg    9
 *
 * Nothing in that STR column is authored. It falls out of Scale squared and
 * the muscularity curve, which is the point: a six-year-old is weaker than an
 * adult because they are physically smaller and less developed, not because a
 * rule says children have low Strength.
 *
 *
 * KNOWN LIMITATION BELOW ABOUT AGE FOUR
 *
 * The infant end is too light. A newborn resolves to 1.8 kg against a real
 * 3.5 kg, and a two-year-old to 8.9 kg against 12 kg. Ages six and up land
 * within a few percent, and their BMI is sane across the whole range from
 * there.
 *
 * This is not a bad anchor, and no bulk or adiposity value fixes it. Mass goes
 * as Scale cubed, which assumes an infant is a scaled-down adult, and it is
 * not: a newborn's head is roughly a quarter of its body length against an
 * adult's eighth, and its limbs are far shorter in proportion. Correcting that
 * needs age LOCAL morphology — per-BodyPart length anchors giving the young a
 * proportionally large head and short limbs — which the Age Profile supports
 * and this curve does not yet use.
 *
 * Left undone deliberately. It is real content work, it only affects ages
 * nobody is likely to play, and inventing infant proportions is not something
 * a refactor should quietly decide.
 */

import type { SpeciesAgeProfile } from "./types";

export const HUMAN_AGE_PROFILE: SpeciesAgeProfile = {
  interpolation: "linear",
  anchors: [
    {
      age: 0,
      scale: 0.30,
      morphology: { muscularity: 0.40, bulk: 1.30, adiposity: 1.60 },
      lifeStage: "Infant",
    },
    {
      age: 2,
      scale: 0.52,
      morphology: { muscularity: 0.50, bulk: 1.22, adiposity: 1.40 },
      lifeStage: "Toddler",
    },
    {
      age: 6,
      scale: 0.70,
      morphology: { muscularity: 0.60, bulk: 1.10, adiposity: 1.18 },
      lifeStage: "Child",
    },
    {
      age: 12,
      scale: 0.85,
      morphology: { muscularity: 0.75, bulk: 1.08, adiposity: 1.12 },
      lifeStage: "Adolescent",
    },
    {
      age: 16,
      scale: 0.97,
      morphology: { muscularity: 0.92, bulk: 1.03, adiposity: 1.00 },
      lifeStage: "Youth",
    },
    {
      age: 20,
      scale: 1.00,
      morphology: { muscularity: 1.00, bulk: 1.00, adiposity: 1.00 },
      lifeStage: "Adult",
    },
    {
      age: 40,
      scale: 1.00,
      morphology: { muscularity: 1.00, bulk: 1.00, adiposity: 1.12 },
      lifeStage: "Middle Age",
    },
    {
      age: 60,
      scale: 0.99,
      morphology: { muscularity: 0.90, bulk: 1.00, adiposity: 1.25 },
      lifeStage: "Elder",
    },
    {
      age: 80,
      scale: 0.97,
      morphology: { muscularity: 0.75, bulk: 0.98, adiposity: 1.20 },
      lifeStage: "Venerable",
    },
  ],
};
