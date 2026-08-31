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
 *   age   height      mass     size    BMI   normSP   STR
 *     0    49.5 cm    1.76 kg   2.3 L   7.2     3.79     5
 *     2    85.8 cm    8.86 kg  10.7 L  12.0    13.37     7
 *     6   115.5 cm   20.13 kg  23.1 L  15.1    28.21     8
 *    12   146.9 cm   43.01 kg  46.2 L  19.9    56.62     9
 *    16   160.1 cm   56.37 kg  56.2 L  22.0    84.75     9
 *    20   165.0 cm   62.00 kg  60.0 L  22.8   100.00    10
 *    40   165.0 cm   62.68 kg  61.2 L  23.0   100.00    10
 *    60   163.4 cm   59.36 kg  60.7 L  22.2    85.97     9
 *    80   160.1 cm   51.61 kg  55.7 L  20.1    67.25     9
 *
 * Every column is generated — height, mass and size by
 * measurements/resolution.ts, normalized Strength Points and STR by
 * strength/resolution.ts — from this curve and the Basic Human Standard.
 * Nothing in the table is authored and nothing is hand-computed. The
 * twenty-year-old row is the reference body itself, which is what makes this a
 * check on the curve rather than a restatement of it.
 *
 * The STR column in particular is authored nowhere. It falls out of Scale
 * squared and the muscularity curve, which is the point: a six-year-old is
 * weaker than an adult because they are physically smaller and less developed,
 * not because a rule says children have low Strength. A six-year-old at Scale
 * 0.70 and Muscularity 0.60 has about 28% of an adult's force, which is a
 * little under two doublings below them — STR 8.
 *
 * The twelve-year-old is the one row worth arguing about. Scale 0.89 puts them
 * at 147 cm against a real ~149, and mass follows to 43.0 kg against a real
 * ~40 — around 7% heavy, at BMI 19.9 where a real twelve-year-old is nearer
 * 18. The alternative, scale 0.85, lands the height at 140 cm and forces bulk
 * to RISE from 1.10 at six to 1.13 to reach a believable mass, making a
 * twelve-year-old stockier than a six-year-old. Slightly heavy at a correct
 * height beats correct weight at a wrong one, and keeps the bulk curve
 * monotonic through childhood.
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
      scale: 0.89,
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
