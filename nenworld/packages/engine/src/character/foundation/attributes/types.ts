/*
 * The ten character attributes.
 *
 * Source: Rulebook "01 Core Rules/Attributes". The legal range lives in
 * base.ts and is enforced in validation.ts, not by these types — a number out
 * of range is a validation error the player can see and fix, not a compile
 * error in the workbench.
 */

// The ten attribute scores every character carries.
export interface Attributes {
  readonly str: number;
  readonly agi: number;
  readonly dex: number;
  readonly con: number;
  readonly vit: number;
  readonly int: number;
  readonly wis: number;
  readonly per: number;
  readonly spi: number;
  readonly cha: number;
}

// The name of any one attribute.
export type AttributeKey = keyof Attributes;
