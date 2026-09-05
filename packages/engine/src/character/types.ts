/*
 * Character — the structured object the workbench sends to the engine.
 *
 * Details, attributes and body are required: together they establish the
 * individual character and the mechanical foundation the engine operates on.
 *
 * Most additional character data is optional because the workbench builds a
 * sheet incrementally. An engine that only accepts completely finished
 * characters cannot help anyone finish one. Validation is responsible for
 * reporting missing or incomplete information where appropriate.
 *
 * ── Authored, not derived ───────────────────────────────────────────────
 *
 * Everything here is something a person decided. Nothing that can be
 * recomputed from it is stored:
 *
 *   stored attributes        authored     →  base and resolved are derived
 *   traits                   authored     →  granted Traits are derived
 *   skills / techniques      authored     →  granted access is derived
 *
 * A Skill a character has only because a Trait grants it is deliberately
 * absent from this object. Writing it in would mean the sheet keeps the Skill
 * after the Trait is removed, and no amount of later cleanup reliably
 * unpicks that. See resolution.ts for the derived view.
 *
 * Equipment, progression and additional Nen statistics join as the mechanics
 * they feed are implemented.
 */

import type { CharacterDetails } from "./details";

import type { Attributes } from "./foundation/attributes/types";
import type { Body } from "./foundation/body/types";

import type { CharacterClan } from "./identity/clans";
import type { CharacterSpecies } from "./identity/species";
import type { CharacterTrait } from "./identity/traits";

import type { CharacterSkill } from "./capabilities/skills";
import type { CharacterTechnique } from "./capabilities/techniques";

import type { CharacterCondition } from "./status/conditions";
import type { CharacterInjury } from "./foundation/body/injuries";

import type { CharacterItem } from "./equipment/types";

import type { CharacterId } from "./id";


export interface Character {
  readonly id: CharacterId;

  /**
   * Basic personal and physical information about this individual character.
   *
   * Includes values such as name, age, gender, height, weight and Nen Type.
   */
  readonly details: CharacterDetails;


  /*
   * Stored attribute scores: the authored numbers, before any Trait,
   * Condition or Item has been applied.
   *
   * Progression writes these. Nothing else does — a Trait that costs the
   * character DEX lowers their Base score without touching what they rolled.
   *
   * See foundation/attributes/resolution.ts for the derived layers.
   */
  readonly attributes: Attributes;


  /*
   * Total experience earned over the character's life.
   *
   * Level is derived from this rather than stored beside it: two fields that
   * have to agree are two fields that eventually will not. See
   * progression/levels.ts for the thresholds.
   *
   * Absent means the character has not started earning yet, which resolves
   * to Level 1.
   */
  readonly lifetimeXp?: number;


  /*
   * The character's physical body representation.
   *
   * Additional interaction with details such as height and weight can be
   * integrated as the Body system is developed further.
   */
  readonly body: Body;


  /*
   * Species is ancestry rather than a single value.
   *
   * Species shares must total 100. See identity/species.ts for why a plain
   * human is represented as the one-entry case rather than by a different
   * data shape, and for how a Sub-species such as Firebender relates to the
   * Human it descends from.
   */
  readonly species?: readonly CharacterSpecies[];

  readonly clans?: readonly CharacterClan[];

  /*
   * Traits the character holds in their own right.
   *
   * Traits granted by a Species, another Trait, an Item or a Condition are
   * not listed here; they are resolved from their source.
   */
  readonly traits?: readonly CharacterTrait[];


  /*
   * Capabilities the character has actually trained, with the Mastery they
   * reached.
   *
   * Access granted by something else is resolved rather than stored, so a
   * character who trained Swordsmanship IV keeps IV when an Item that also
   * granted Swordsmanship is taken away.
   */
  readonly techniques?: readonly CharacterTechnique[];
  readonly skills?: readonly CharacterSkill[];


  /*
   * What the character is carrying, and what of it is worn.
   */
  readonly items?: readonly CharacterItem[];


  /*
   * Transient state, unlike the persistent character information above.
   *
   * Conditions may be present when the workbench is running a scenario
   * against the character and absent when the character is at rest.
   * Injuries are the same kind of thing with a longer clock.
   */
  readonly conditions?: readonly CharacterCondition[];
  readonly injuries?: readonly CharacterInjury[];
}
