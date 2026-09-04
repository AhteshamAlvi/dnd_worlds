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

import type { BodyPartSelector } from "../foundation/body/selectors";
import type { CheckScopeSelector } from "../../checks/scopes";
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
/*
 * The scope vocabulary is owned by the top-level checks/ module and re-exported
 * here.
 *
 * One definition rather than a second copy: an authored modifier and the check
 * it eventually applies to have to be talking about the same thing, and two
 * unions that merely look alike are two things that will drift. Same reasoning
 * as the Body-facing vocabulary in foundation/body/effects.ts.
 */
export type {
  CheckScope,
  CheckScopeSelector,
} from "../../checks/scopes";


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
  /*
   * A SELECTOR, not one concrete check.
   *
   * Content says which SET of checks it touches — "applicable AGI checks",
   * "all hearing Detection" — and the set is matched against the concrete
   * scope at the moment a check is resolved. Authoring a concrete scope would
   * mean a Trait could only ever modify one exact combination of sense,
   * phenomenon and subject.
   */
  readonly check: CheckScopeSelector;
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


/* ========================================================================== */
/* BODY EFFECTS                                                               */
/* ========================================================================== */

/*
 * Body effects come in Base and Resolved flavours for the same reason
 * Attribute effects do, and the distinction carries more weight here.
 *
 *   Base      permanent physical fact about this body
 *   Resolved  what is true of it right now
 *
 * Strength advancement is priced against the BASE body, so a character does
 * not get cheaper Strength for being temporarily enlarged, nor dearer for
 * being temporarily shrunk. Base is also what a Reference Form change means:
 * a permanent mutation genuinely alters what anatomy this body is supposed to
 * contain, while a transformation only alters what it currently has.
 *
 * There is exactly one resolver behind both, taking a mode — never two
 * implementations that could drift.
 *
 *
 * TRAITS SHOULD MODIFY THE MOST FUNDAMENTAL PROPERTY AVAILABLE
 *
 * The vocabulary is deliberately physical rather than convenient. Reaching for
 * the lowest applicable property is what makes consequences propagate on their
 * own:
 *
 *   Powerful Build            -> Bulk
 *   Highly Developed Muscles  -> Muscularity
 *   Long Arms                 -> Arm Length
 *   Stone Body                -> Destruction Resistance
 *   Supernatural strength
 *     without the muscle      -> Intrinsic Physical Force
 *
 * A Trait that "grants +2 STR" has no representation here, and that absence is
 * the point: Strength is derived from physics, so something physical has to
 * change for it to move.
 */


/*
 * The Body-facing vocabulary — owned by Body, re-exported here.
 *
 * These four types describe anatomy, morphology and force, which is Body's
 * subject matter and not the rules layer's. They live in
 * foundation/body/effects.ts alongside the code that applies them, so that
 * there is one definition rather than a copy here that has to be kept in step
 * by hand, and so the dependency runs one way: rules reads Body's vocabulary,
 * Body never reads rules.
 */
import type {
  BodyMorphologyProperty,
  BodyAnatomyOperation,
  BaseBodyAnatomyOperation,
} from "../foundation/body/effects";

export type {
  BodyMorphologyProperty,
  BodyEffectTarget,
  BodyAnatomyOperation,
  BaseBodyAnatomyOperation,
} from "../foundation/body/effects";


/*
 * Scale — how large this body fundamentally is.
 *
 * Multiplicative, because Scale composes: a Species standard scale, an age
 * curve and an enlargement effect are three independent claims about size and
 * multiply rather than adding.
 */
export interface ModifyBaseBodyScaleEffect {
  readonly type: "modifyBaseBodyScale";
  readonly multiplier: number;
}

export interface ModifyResolvedBodyScaleEffect {
  readonly type: "modifyResolvedBodyScale";
  readonly multiplier: number;
}


/*
 * Morphology — length, bulk, muscularity, adiposity.
 *
 * One property per effect rather than a bundle, so that a Trait making a
 * character broad says only that, and two Traits touching different
 * dimensions never have to be merged before they can be applied.
 */
export interface ModifyBaseBodyMorphologyEffect {
  readonly type: "modifyBaseBodyMorphology";
  readonly property: BodyMorphologyProperty;
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}

export interface ModifyResolvedBodyMorphologyEffect {
  readonly type: "modifyResolvedBodyMorphology";
  readonly property: BodyMorphologyProperty;
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}


/*
 * Anatomy — what parts this body has, or is supposed to have.
 */
export interface ModifyBaseBodyAnatomyEffect {
  readonly type: "modifyBaseBodyAnatomy";
  readonly operation: BaseBodyAnatomyOperation;
}

export interface ModifyResolvedBodyAnatomyEffect {
  readonly type: "modifyResolvedBodyAnatomy";
  readonly operation: BodyAnatomyOperation;
}


/*
 * Intrinsic physical force — force production beyond what Scale and
 * Muscularity already explain.
 *
 * Reserved for genuine physiology: unusual Species biology, supernatural
 * strength without the muscle to show for it, a permanent physical alteration.
 * Situational Skills, Techniques, manoeuvres, equipment leverage and action
 * bonuses do NOT belong here — they apply later, to action resolution, and
 * folding them in would make a character permanently stronger for holding a
 * lever.
 */
export interface ModifyBaseIntrinsicPhysicalForceEffect {
  readonly type: "modifyBaseIntrinsicPhysicalForce";
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}

export interface ModifyResolvedIntrinsicPhysicalForceEffect {
  readonly type: "modifyResolvedIntrinsicPhysicalForce";
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}


/*
 * Destruction resistance — how hard existing structure is to break, WITHOUT
 * changing the structure.
 *
 * The narrow exception in an otherwise physical vocabulary. If an effect is
 * naturally a matter of being bigger, thicker or better muscled it should say
 * that instead and let Structural Capacity carry it into Body Points,
 * Strength, Mass and Size together. Stone skin is the case this exists for:
 * the body is no larger and no stronger, it is simply harder to destroy.
 */
export interface ModifyBaseDestructionResistanceEffect {
  readonly type: "modifyBaseDestructionResistance";
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}

export interface ModifyResolvedDestructionResistanceEffect {
  readonly type: "modifyResolvedDestructionResistance";
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}


/** Every Body-facing effect, in either flavour. */
export type BodyEffect =
  | ModifyBaseBodyScaleEffect
  | ModifyResolvedBodyScaleEffect
  | ModifyBaseBodyMorphologyEffect
  | ModifyResolvedBodyMorphologyEffect
  | ModifyBaseBodyAnatomyEffect
  | ModifyResolvedBodyAnatomyEffect
  | ModifyBaseIntrinsicPhysicalForceEffect
  | ModifyResolvedIntrinsicPhysicalForceEffect
  | ModifyBaseDestructionResistanceEffect
  | ModifyResolvedDestructionResistanceEffect;


export type Effect =
  | ModifyBaseAttributeEffect
  | ModifyResolvedAttributeEffect
  | ModifyCheckEffect
  | GrantTraitEffect
  | GrantSkillEffect
  | GrantTechniqueEffect
  | BodyEffect;


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

  "modifyBaseBodyScale",
  "modifyResolvedBodyScale",
  "modifyBaseBodyMorphology",
  "modifyResolvedBodyMorphology",
  "modifyBaseBodyAnatomy",
  "modifyResolvedBodyAnatomy",
  "modifyBaseIntrinsicPhysicalForce",
  "modifyResolvedIntrinsicPhysicalForce",
  "modifyBaseDestructionResistance",
  "modifyResolvedDestructionResistance",
] as const satisfies readonly Effect["type"][];


/**
 * Any valid Effect discriminant.
 */
export type EffectType = Effect["type"];