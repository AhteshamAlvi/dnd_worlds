/*
 * The ten character attributes, and the three stages a score passes through.
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

/*
 * The three stages, as aliases rather than distinct structures.
 *
 * They are the same ten numbers throughout; what differs is how much has been
 * applied to them. Naming the stages costs nothing and makes a signature say
 * which one it wants, but branding them would force conversions at every step
 * of a pipeline whose whole job is to move between them.
 *
 *   Stored
 *      ↓ permanent effects   (modifyBaseAttribute)
 *   Base
 *      ↓ active effects      (modifyResolvedAttribute)
 *   Resolved
 */

/** The player's authored scores. Progression writes these; nothing else does. */
export type StoredAttributes = Attributes;

/** Stored plus permanent effects — what the sheet shows as the character's score. */
export type BaseAttributes = Attributes;

/** Base plus whatever is currently true — what a check actually rolls against. */
export type ResolvedAttributes = Attributes;

/**
 * All three stages together.
 *
 * Returned as a set because a sheet showing "DEX 14 (11)" needs two of them at
 * once, and an explanation of how 16 became 11 needs all three.
 */
export interface AttributeLayers {
  readonly stored: StoredAttributes;
  readonly base: BaseAttributes;
  readonly resolved: ResolvedAttributes;
}


/**
 * One score together with the standard modifier derived from it.
 *
 * The shape a sheet renders, and deliberately the SAME shape for an
 * Attribute and for a Derived Attribute: AGI and Acrobatics differ in where
 * their number came from, not in how they are displayed or rolled, so a sheet
 * should not need two code paths to show them side by side.
 *
 * `score` is the resolved score — Resolved for an Attribute, the calculated
 * value for a Derived Attribute. `standardModifier` is
 * deriveStandardModifier(score); see attributes/resolution.ts for the one
 * implementation of that ladder.
 *
 * Situational modifiers are deliberately absent. A Skill's "+3 to applicable
 * AGI checks" is not part of the character's AGI — it exists only for the
 * check it applies to, and is added by rules/resolution.ts's
 * resolveCheckModifier at that moment.
 */
export interface ResolvedScore {
  readonly score: number;
  readonly standardModifier: number;
}
