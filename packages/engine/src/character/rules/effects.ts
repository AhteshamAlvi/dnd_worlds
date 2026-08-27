/*
 * Universal character effects.
 *
 * Effects are data-driven instructions describing what a piece of game
 * content changes or grants.
 *
 * They may be declared by any content system that supports effects, including:
 *
 * - Species and Sub-species;
 * - Traits and Sub-traits;
 * - Skills;
 * - Techniques;
 * - Items and equipment;
 * - Conditions and injuries;
 * - transformations;
 * - future content types.
 *
 * This file defines effect DATA only.
 *
 * It does not:
 *
 * - determine whether an effect is currently active;
 * - resolve prerequisites;
 * - apply effects to a character;
 * - mutate stored character state;
 * - resolve granted content;
 * - perform catalog lookups.
 *
 * Those responsibilities belong to the rules resolution and validation layers.
 *
 *
 * ATTRIBUTE EFFECTS
 * -----------------
 *
 * Attribute effects deliberately distinguish between Base and Resolved
 * attributes.
 *
 * Stored attributes are the character's underlying authored values.
 *
 *   Stored
 *      ↓ permanent effects
 *   Base
 *      ↓ active / temporary effects
 *   Resolved
 *
 * Example:
 *
 *   Stored DEX: 16
 *
 *   Trait:
 *     modifyBaseAttribute DEX -2
 *
 *   Base DEX: 14
 *
 *   Condition:
 *     modifyResolvedAttribute DEX -3
 *
 *   Resolved DEX: 11
 *
 * The original stored DEX 16 is never destroyed by either effect.
 *
 *
 * GRANT EFFECTS
 * -------------
 *
 * Grant effects provide access to character content without requiring the
 * source definition to contain custom TypeScript behavior.
 *
 * Examples:
 *
 *   Spider Mutation
 *     → grantTrait "superstrength"
 *     → grantTrait "spider-sense"
 *     → grantSkill "wall-sticking"
 *
 *   Swordsmanship Mastery II
 *     → grantSkill "vertical-slash"
 *
 * The resolver will eventually track where each grant came from so removing
 * or disabling a source can also remove only the access supplied by that
 * source.
 */

import type { AttributeKey } from "../foundation/attributes/types";


/**
 * Permanently changes the character's Base value for one Attribute.
 *
 * The underlying stored/original Attribute remains unchanged.
 *
 * Typical sources:
 *
 * - Traits;
 * - Sub-traits;
 * - Species/Sub-species effects;
 * - permanent transformations;
 * - permanent item effects.
 */
export interface ModifyBaseAttributeEffect {
  readonly type: "modifyBaseAttribute";
  readonly attribute: AttributeKey;
  readonly amount: number;
}


/**
 * Temporarily or conditionally changes the value currently used by the
 * character without changing either the stored or Base Attribute.
 *
 * Typical sources:
 *
 * - Conditions;
 * - injuries;
 * - equipped items;
 * - temporary buffs/debuffs;
 * - conditional effects.
 */
export interface ModifyResolvedAttributeEffect {
  readonly type: "modifyResolvedAttribute";
  readonly attribute: AttributeKey;
  readonly amount: number;
}


/**
 * Grants a Trait while the source of this effect is applicable.
 *
 * Sub-traits use the same Trait system, so this effect is also used when a
 * parent Trait grants one of its Sub-traits.
 */
export interface GrantTraitEffect {
  readonly type: "grantTrait";
  readonly traitId: string;
}


/**
 * Grants a Skill while the source of this effect is applicable.
 *
 * Examples include:
 *
 * - a Trait granting an innate Skill;
 * - Technique Mastery granting one of the Technique's associated Skills;
 * - an Item temporarily granting a Skill.
 */
export interface GrantSkillEffect {
  readonly type: "grantSkill";
  readonly skillId: string;
}


/**
 * Grants a Technique while the source of this effect is applicable.
 *
 * This supports content such as Traits, Items, transformations, or other
 * Techniques unlocking access to a broader discipline.
 */
export interface GrantTechniqueEffect {
  readonly type: "grantTechnique";
  readonly techniqueId: string;
}


/**
 * Every universal effect currently understood by the character rules layer.
 *
 * Add a new member to this union only when the ENGINE gains a genuinely new
 * reusable kind of mechanic.
 *
 * Creating a new Trait, Skill, Technique, Item, or Condition should normally
 * use these existing effects rather than require a new TypeScript type.
 */
export type Effect =
  | ModifyBaseAttributeEffect
  | ModifyResolvedAttributeEffect
  | GrantTraitEffect
  | GrantSkillEffect
  | GrantTechniqueEffect;


/**
 * The discriminant values understood by the Effect system.
 *
 * Useful to the Workbench for building effect-type selectors without
 * hard-coding a second independent list.
 */
export const EFFECT_TYPES = [
  "modifyBaseAttribute",
  "modifyResolvedAttribute",
  "grantTrait",
  "grantSkill",
  "grantTechnique",
] as const satisfies readonly Effect["type"][];


/**
 * Any valid Effect discriminant.
 */
export type EffectType = Effect["type"];