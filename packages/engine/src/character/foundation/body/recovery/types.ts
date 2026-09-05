/*
 * Recovery types — the shapes that only make sense once Body and Injuries
 * are talking to each other.
 *
 * Body owns `integrity` on BodyPart (foundation/body/anatomy/types.ts) and the
 * whole-BP repair primitive that restores it (body-points/recovery.ts), but
 * knows nothing about Injuries, treatment, or Vitality. injuries/types.ts owns
 * the authored Injury shapes — InjuryDefinition, CharacterInjury,
 * InjuryTreatmentStatus, InjuryRecovery — but knows nothing about elapsed
 * time or how natural healing actually proceeds. This file adds what one
 * Recovery pass needs as input and what an elapsed-time pass over damaged
 * Anatomy produces; the orchestration itself lives in resolution.ts.
 */

import type { GameDuration } from "../../../../time/types";

import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import type { ContinuityStates } from "../continuity";
import type { BodyMorphology } from "../types";
import type {
  BodyPointModifier,
  ResolvedBodyPoints,
} from "../body-points/types";

import type {
  CharacterInjury,
  CharacterInjuryId,
  InjuryId,
} from "../injuries/types";


/* -------------------------------------------------------------------------- */
/* Recovery ceilings                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One untreated Injury cap currently restricting a BodyPart's recovery.
 */
export interface ActiveRecoveryCap {
  readonly characterInjuryId: CharacterInjuryId;
  readonly injuryId: InjuryId;

  /** The authored fraction, already resolved against this part's Maximum BP. */
  readonly ceilingBP: number;
}


/**
 * The untreated Injury caps found on one BodyPart, reduced to the single
 * ceiling that actually restricts it.
 *
 * `ceiling` is that BodyPart's Maximum BP when `activeCaps` is empty —
 * Current BP is then bounded only by Maximum BP, same as any undamaged part.
 * Caps may be treated or removed in any order; whichever remain active
 * contribute their ceilingBP, and the lowest one wins.
 */
export interface BodyPartRecoveryCeiling {
  readonly partId: BodyPartId;

  readonly activeCaps: readonly ActiveRecoveryCap[];
  readonly ceiling: number;
}


/* -------------------------------------------------------------------------- */
/* Pass outcome                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One BodyPart's natural-recovery outcome for one Recovery pass.
 */
export interface BodyPartRecoveryOutcome {
  readonly partId: BodyPartId;

  readonly integrityBefore: number;
  readonly integrityAfter: number;

  /** Exact BP actually restored — below the tick's full amount at the ceiling. */
  readonly bpRestored: number;

  /** The ceiling this part's recovery was actually resolved against. */
  readonly ceiling: number;
}


/**
 * An Injury whose full anatomical location reached Maximum BP during this
 * pass, and was therefore removed.
 *
 * This is a report, not a mutation — see resolution.ts's own comment for why
 * applying the removal is the caller's job.
 */
export interface RecoveredInjuryRemoval {
  readonly characterInjuryId: CharacterInjuryId;
  readonly injuryId: InjuryId;
}


/* -------------------------------------------------------------------------- */
/* Recovery pass                                                             */
/* -------------------------------------------------------------------------- */

export interface ResolveRecoveryInput {
  /** The current manifestation — what is there to heal. */
  readonly anatomy: Anatomy;

  /** The persistent state healing is recorded against. */
  readonly continuity: ContinuityStates;

  /** Determines Maximum BP. */
  readonly constitution: number;

  /** Determines the natural recovery rate — see deriveDailyRecoveryFraction. */
  readonly vitality: number;

  readonly bodyPartDefinitions: readonly BodyPartDefinition[];
  readonly bodyPointModifiers?: readonly BodyPointModifier[];

  /*
   * The resolved physical context Body Points need, supplied rather than
   * derived — same reason and same shape as body/damage.ts. Body owns Character
   * Scale and the character's own morphology; Species and Age own the rest, and
   * Body must never ask what Species a character is.
   */
  readonly morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>;
  readonly effectiveScale: number;

  readonly injuries: readonly CharacterInjury[];

  readonly elapsed: GameDuration;
}

export interface ResolveRecoveryOutcome {
  /*
   * New persistent state — the caller stores this back onto Body.continuity.
   *
   * Recovery reads a manifestation and writes an identity, so a limb that
   * heals stays healed through regeneration and through a change of form.
   */
  readonly continuity: ContinuityStates;

  /** The healed anatomy, for a caller that wants to show it. */
  readonly anatomy: Anatomy;

  readonly parts: readonly BodyPartRecoveryOutcome[];

  // The caller removes these from character.injuries; see the file header.
  readonly removedInjuries: readonly RecoveredInjuryRemoval[];

  readonly bodyPointsAfterRecovery: ResolvedBodyPoints;
}
