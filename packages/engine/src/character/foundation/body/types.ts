/*
 * Core Body-domain value shapes.
 *
 * Body represents the character's persistent physical organism.
 *
 * Height, mass, and build are stored physical morphology values.
 * Anatomy is also persistent character state and represents the body parts
 * the character currently physically possesses.
 *
 * Derived values such as resolved Body Points, Current BP, morphology
 * multipliers, and Critical Point instances are not stored here.
 */

import type { Anatomy } from "./anatomy/types";


/*
 * Physical build composition relative to the standard reference body.
 *
 * A value of 1 represents the reference amount of that component.
 *
 * Examples:
 *
 * muscularity = 1
 * adiposity   = 1
 * → reference build
 *
 * muscularity = 1.5
 * → greater muscular development than the reference build
 *
 * adiposity = 2
 * → greater adipose mass than the reference build
 *
 * Muscularity and adiposity are independent dimensions. They are not combined
 * into a single generic "build" score because different body compositions
 * affect anatomy differently.
 */
export interface BodyBuild {
  readonly muscularity: number;
  readonly adiposity: number;
}


/*
 * Persistent physical state of a character.
 *
 * Reference humanoid morphology:
 *
 * heightCm: 165
 * massKg:   62
 *
 * build:
 *   muscularity: 1
 *   adiposity:   1
 *
 * CON is not part of Body. It is an Attribute consumed later during
 * Body-Point resolution.
 */
export interface Body {
  readonly heightCm: number;
  readonly massKg: number;

  readonly build: BodyBuild;

  readonly anatomy: Anatomy;
}