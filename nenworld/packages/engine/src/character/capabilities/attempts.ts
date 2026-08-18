/*
 * What a character can try to do, defined or otherwise.
 *
 * Resolution of the check and DC behind either kind of attempt is not
 * implemented yet; this is the shape the resolver will consume.
 */

import type { SkillId } from "./skills";

/**
 * An attempt to use a Defined Skill already known by the character.
 */
export interface DefinedSkillAttempt {
  readonly type: "defined";
  readonly skillId: SkillId;
}

/**
 * An action conceived by the player that does not exist as a Defined Skill
 * the character possesses.
 */
export interface ImprovisedSkillAttempt {
  readonly type: "improvised";
  readonly description: string;
}

export type SkillAttempt = DefinedSkillAttempt | ImprovisedSkillAttempt;
