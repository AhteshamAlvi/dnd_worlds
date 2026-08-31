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
import type {
  DerivedAttributeName,
} from "../foundation/attributes/derived/types";


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
 * What kind of check a situational modifier applies to.
 *
 * Two variants, both closed:
 *
 *   attribute        → "+3 to applicable AGI checks"
 *   derivedAttribute → "+2 to Acrobatics checks"
 *
 * A free-string "tag" variant was considered and deliberately rejected. The
 * catalog layer can confirm a traitId names something real because Traits
 * have a registry; it could never confirm a tag. A typo would validate
 * clean, resolve clean, appear in the resolved check modifiers, and then
 * silently match nothing — an authored bonus that quietly does not exist is
 * the worst failure this content system can produce.
 *
 * Every other open vocabulary in this engine is a closed `as const satisfies`
 * list for the same reason. The one exception, RuleSourceRef.type, is safe
 * precisely because it only ever labels a source; it never decides whether a
 * rule applies. A check scope does.
 *
 * A third variant is a one-line addition when something needs it — a
 * sense-scoped modifier would be `{kind: "sense"; sense: DetectionSenseId}`
 * against an already-closed list. Adding a variant later is easy; removing
 * an escape hatch that content has started depending on is not.
 */
export type CheckScope =
  | {
      readonly kind: "attribute";
      readonly attribute: AttributeKey;
    }
  | {
      readonly kind: "derivedAttribute";
      readonly derivedAttribute: DerivedAttributeName;
    };


/**
 * Adds to the modifier of one kind of check, without touching any score.
 *
 * This is the third sense of the word "modifier" in this engine, and the
 * distinction is the whole point of the effect existing:
 *
 *   modifyBaseAttribute / modifyResolvedAttribute
 *   → change the SCORE. Flexible's "+2 AGI" makes the character's AGI 19,
 *     which changes the AGI standard modifier and every Derived Attribute
 *     calculated from AGI.
 *
 *   modifyCheck
 *   → change one RESOLUTION. Contort's "+3 to applicable AGI checks" never
 *     appears on the sheet; AGI stays 19 and its standard modifier stays +4.
 *     The +3 exists only while an applicable check is being resolved.
 *
 * Traits, equipment, Conditions and injuries typically alter scores; Skills
 * and Techniques typically contribute check modifiers. Neither is enforced —
 * a Trait granting a check modifier (Keen Eyes, for a specific sense) is
 * perfectly ordinary content.
 *
 * Whether a given check is "applicable" is not decided here. This effect
 * declares the scope it belongs to; the mechanic resolving a check asks
 * rules/resolution.ts for the modifiers matching the scope it is resolving.
 */
export interface ModifyCheckEffect {
  readonly type: "modifyCheck";
  readonly check: CheckScope;
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
  | ModifyCheckEffect
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
  "modifyCheck",
  "grantTrait",
  "grantSkill",
  "grantTechnique",
] as const satisfies readonly Effect["type"][];


/**
 * Any valid Effect discriminant.
 */
export type EffectType = Effect["type"];