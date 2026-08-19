/*
 * Universal character requirements.
 *
 * Requirements are data-driven rules describing what must already be true
 * about a character before some piece of content or action is available.
 *
 * They may be declared by any system that needs prerequisites, including:
 *
 * - Species and Sub-species;
 * - Traits and Sub-traits;
 * - Skills;
 * - Techniques;
 * - Technique evolution/combination;
 * - Items and equipment;
 * - Conditions;
 * - transformations;
 * - future content types.
 *
 * This file defines requirement DATA only.
 *
 * It does not:
 *
 * - inspect a character;
 * - resolve Attributes;
 * - perform catalog lookups;
 * - decide whether a requirement passes;
 * - spend Growth Points;
 * - grant anything after requirements are satisfied.
 *
 * Those responsibilities belong to the rules resolution and validation
 * layers.
 *
 *
 * REQUIREMENT COMPOSITION
 * -----------------------
 *
 * Most content will simply provide multiple requirements that must all pass.
 *
 * Compound requirements also allow more complicated rules:
 *
 *   all
 *     ├── Technique Mastery: Swordsmanship V
 *     └── Attribute: DEX Base >= 16
 *
 *   any
 *     ├── Trait: Fire Affinity
 *     └── Trait: Dragon Flame
 *
 *   not
 *     └── Condition: Aura Sealed
 */

import type { AttributeKey } from "../foundation/attributes/types";


/**
 * Which stage of an Attribute should be checked.
 *
 * stored:
 *   The underlying authored/original score before permanent or temporary
 *   external modifiers.
 *
 * base:
 *   The permanent score after Base-changing effects such as Traits.
 *
 * resolved:
 *   The score currently being used after temporary/conditional modifiers.
 *
 * Most permanent acquisition requirements will normally check `base`.
 * Immediate action requirements may sometimes need `resolved`.
 */
export type AttributeRequirementLayer =
  | "stored"
  | "base"
  | "resolved";


/**
 * Requires an Attribute to meet or exceed a particular value.
 */
export interface AttributeMinimumRequirement {
  readonly type: "attributeMinimum";
  readonly attribute: AttributeKey;
  readonly layer: AttributeRequirementLayer;
  readonly minimum: number;
}


/**
 * Requires the character's actual Level to meet or exceed a value.
 *
 * Post-cap progression is not represented as additional character Levels,
 * so this requirement should continue to use the real Level value.
 */
export interface LevelMinimumRequirement {
  readonly type: "levelMinimum";
  readonly minimum: number;
}


/**
 * Requires the character to belong to a particular Species.
 */
export interface HasSpeciesRequirement {
  readonly type: "hasSpecies";
  readonly speciesId: string;
}


/**
 * Requires the character to possess a particular Sub-species.
 */
export interface HasSubspeciesRequirement {
  readonly type: "hasSubspecies";
  readonly subspeciesId: string;
}


/**
 * Requires membership in a particular Clan.
 */
export interface HasClanRequirement {
  readonly type: "hasClan";
  readonly clanId: string;
}


/**
 * Requires a particular Trait to be present.
 *
 * Sub-traits use the same Trait system and are therefore checked through the
 * same requirement type.
 */
export interface HasTraitRequirement {
  readonly type: "hasTrait";
  readonly traitId: string;
}


/**
 * Requires access to a particular Skill, regardless of its exact Mastery.
 *
 * If a specific Mastery is required, use SkillMasteryRequirement instead.
 */
export interface HasSkillRequirement {
  readonly type: "hasSkill";
  readonly skillId: string;
}


/**
 * Requires a Skill to have reached at least a particular Mastery rank.
 *
 * Mastery is stored numerically by the engine even though it is displayed
 * using Roman numerals.
 *
 * Example:
 *
 *   minimumMastery: 3
 *
 * displays conceptually as:
 *
 *   Mastery III
 *
 * capabilities/mastery.ts will own the legal Mastery range and Roman-numeral
 * conversion.
 */
export interface SkillMasteryRequirement {
  readonly type: "skillMastery";
  readonly skillId: string;
  readonly minimumMastery: number;
}


/**
 * Requires access to a particular Technique, regardless of its exact
 * Mastery.
 */
export interface HasTechniqueRequirement {
  readonly type: "hasTechnique";
  readonly techniqueId: string;
}


/**
 * Requires a Technique to have reached at least a particular Mastery rank.
 *
 * This is one of the primary building blocks for:
 *
 * - advanced Skill acquisition;
 * - Technique evolution;
 * - Technique specialization;
 * - combining multiple Techniques into another Technique.
 */
export interface TechniqueMasteryRequirement {
  readonly type: "techniqueMastery";
  readonly techniqueId: string;
  readonly minimumMastery: number;
}


/**
 * Requires a particular Condition to currently be active.
 */
export interface HasConditionRequirement {
  readonly type: "hasCondition";
  readonly conditionId: string;
}


/**
 * The state in which an Item must exist for an Item requirement.
 *
 * possessed:
 *   The character has access to the Item, including if it is equipped.
 *
 * equipped:
 *   The Item must specifically be equipped and active.
 */
export type ItemRequirementState =
  | "possessed"
  | "equipped";


/**
 * Requires the character to possess or equip a particular Item.
 */
export interface HasItemRequirement {
  readonly type: "hasItem";
  readonly itemId: string;
  readonly state: ItemRequirementState;
}


/**
 * Requires every nested requirement to pass.
 *
 * Example:
 *
 *   Swordsmanship V
 *   AND
 *   DEX Base >= 16
 */
export interface AllRequirements {
  readonly type: "all";
  readonly requirements: readonly Requirement[];
}


/**
 * Requires at least one nested requirement to pass.
 *
 * Example:
 *
 *   Fire Affinity
 *   OR
 *   Dragon Flame
 */
export interface AnyRequirement {
  readonly type: "any";
  readonly requirements: readonly Requirement[];
}


/**
 * Requires the nested requirement to fail.
 *
 * Example:
 *
 *   NOT Aura Sealed
 */
export interface NotRequirement {
  readonly type: "not";
  readonly requirement: Requirement;
}


/**
 * Every universal prerequisite currently understood by the character rules
 * layer.
 *
 * Add a new member only when the ENGINE gains a genuinely new reusable kind
 * of prerequisite.
 *
 * Creating a new Skill, Technique, Trait, Item, Condition, Species, or other
 * piece of content should normally compose these existing requirements rather
 * than require new TypeScript code.
 */
export type Requirement =
  | AttributeMinimumRequirement
  | LevelMinimumRequirement
  | HasSpeciesRequirement
  | HasSubspeciesRequirement
  | HasClanRequirement
  | HasTraitRequirement
  | HasSkillRequirement
  | SkillMasteryRequirement
  | HasTechniqueRequirement
  | TechniqueMasteryRequirement
  | HasConditionRequirement
  | HasItemRequirement
  | AllRequirements
  | AnyRequirement
  | NotRequirement;


/**
 * The discriminant values understood by the Requirement system.
 *
 * The Workbench can use this when presenting the available requirement
 * building blocks.
 */
export const REQUIREMENT_TYPES = [
  "attributeMinimum",
  "levelMinimum",
  "hasSpecies",
  "hasSubspecies",
  "hasClan",
  "hasTrait",
  "hasSkill",
  "skillMastery",
  "hasTechnique",
  "techniqueMastery",
  "hasCondition",
  "hasItem",
  "all",
  "any",
  "not",
] as const satisfies readonly Requirement["type"][];


/**
 * Any valid Requirement discriminant.
 */
export type RequirementType = Requirement["type"];