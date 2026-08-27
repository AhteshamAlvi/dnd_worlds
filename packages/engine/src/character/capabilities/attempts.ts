/*
 * What a character is trying to do, when the outcome is uncertain.
 *
 * An Attempt is not a Skill check. It is the broader thing: an action whose
 * result has to be resolved rather than simply happening. A Defined Skill
 * attempt is the case where the character has a trained answer for it; an
 * improvised attempt is the case where they are making it up, which the
 * Rulebook allows and the engine has to be able to represent.
 *
 * That distinction is why this file survived the capability refactor
 * unchanged in substance. It describes the *question* being put to a
 * resolver, not the capability being used, so redesigning Skills around
 * Mastery did not change what an Attempt is.
 *
 * Resolution of the check and DC behind either kind is not implemented yet;
 * this is the shape the resolver will consume. When it arrives, an Attempt
 * will also be able to carry the resolved Mastery of the Skill being used —
 * depth is what a check should be reading — but adding that field before
 * anything rolls would be guessing at the resolver's signature.
 */

import type { SkillId } from "./skills";

/**
 * An attempt to use a Skill the character has access to.
 *
 * Access, not authorship: a Skill granted by a Trait or an Item is as usable
 * as one the character trained, so this names the Skill and lets capability
 * resolution answer whether they have it.
 */
export interface DefinedSkillAttempt {
  readonly type: "defined";
  readonly skillId: SkillId;
}

/**
 * An action conceived by the player that no Skill covers.
 */
export interface ImprovisedSkillAttempt {
  readonly type: "improvised";
  readonly description: string;
}

export type SkillAttempt = DefinedSkillAttempt | ImprovisedSkillAttempt;
