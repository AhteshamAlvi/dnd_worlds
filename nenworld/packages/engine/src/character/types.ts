/*
 * Character — the structured object the workbench sends to the engine.
 *
 * Identity, attributes and body are required: a character without them is not
 * a character. Everything else is optional and absent means "none yet",
 * because the workbench builds a sheet incrementally and an engine that only
 * accepts finished characters cannot help anyone finish one. Validation is
 * what reports incompleteness, as warnings rather than errors.
 *
 * Equipment, progression and Nen statistics join as the mechanics they feed
 * are implemented.
 */

import type { Attributes } from "./foundation/attributes/types";
import type { Body } from "./foundation/body/types";

import type { CharacterClan } from "./identity/clans";
import type { CharacterMutation } from "./identity/mutations";
import type { CharacterSpecies } from "./identity/species";
import type { CharacterTrait } from "./identity/traits";

import type { CharacterAbility } from "./capabilities/abilities";
import type { CharacterSkill } from "./capabilities/skills";
import type { CharacterTechnique } from "./capabilities/techniques";

import type { CharacterCondition } from "./status/conditions";

import type { CharacterId } from "./id";

export interface Character {
  readonly id: CharacterId;
  readonly name: string;

  // Stored scores, before Traits and status are applied. See
  // foundation/attributes/resolution.ts for the resolved figures.
  readonly attributes: Attributes;
  readonly body: Body;

  // An ancestry, not a single value: the shares must total 100. See
  // identity/species.ts for why a plain human is the one-entry case rather
  // than a different shape.
  readonly species?: readonly CharacterSpecies[];

  readonly clans?: readonly CharacterClan[];
  readonly mutations?: readonly CharacterMutation[];
  readonly traits?: readonly CharacterTrait[];

  readonly abilities?: readonly CharacterAbility[];
  readonly techniques?: readonly CharacterTechnique[];
  readonly skills?: readonly CharacterSkill[];

  // Transient, unlike everything above it. Present on a sheet the workbench
  // is running a scenario against; absent on one at rest.
  readonly conditions?: readonly CharacterCondition[];
}
