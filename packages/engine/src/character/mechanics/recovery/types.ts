/*
 * Cross-domain Recovery types.
 *
 * Recovery sits between Body and Status without belonging to either:
 *
 * - Body owns `recoveryProgress` on BodyPart (foundation/body/anatomy/types.ts)
 *   and the whole-BP repair primitive that consumes it
 *   (foundation/body/body-points/recovery.ts), but knows nothing about
 *   Injuries, treatment, or Vitality.
 * - status/injuries.ts owns the authored Injury shapes — InjuryDefinition,
 *   CharacterInjury, InjuryTreatmentStatus, InjuryRecovery — but knows
 *   nothing about elapsed time or how natural healing actually proceeds.
 *
 * This file adds the types that only make sense once those two domains are
 * talking to each other: what one Recovery pass needs as input, what an
 * elapsed-time pass over damaged Anatomy produces, and how a GM decision
 * about overlapping Injuries is represented. The orchestration itself lives
 * in resolution.ts; cross-domain validation lives in validation.ts.
 */

import type { GameDuration } from "../../../time/types";

import type { BodyPartId } from "../../foundation/body/anatomy/types";

import type {
  CharacterInjuryId,
  InjuryId,
} from "../../status/injuries";


/* -------------------------------------------------------------------------- */
/* Pass input                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What one Recovery pass needs beyond the character's Body and Injuries:
 * how much game time elapsed, and the Vitality that determines the daily
 * recovery fraction.
 */
export interface RecoveryInput {
  readonly elapsed: GameDuration;
  readonly vit: number;
}


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
/* Overlapping Injuries                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The choices a GM is offered when a second Injury lands on a BodyPart that
 * already carries one.
 *
 * Injury application is never blocked on this decision — see
 * decisions/log.ts's "injury.overlap.recovery-progress-default" entry for why
 * "preserve" is the engine's own default when nobody decides.
 */
export type InjuryOverlapDecision =
  | "preserve"
  | "reset"
  | { readonly custom: number };


/**
 * Surfaced when a new Injury is recorded on a BodyPart that already carries
 * one, so a GM can decide what should happen to that BodyPart's partly-healed
 * structure instead of the engine silently picking for them.
 *
 * `recommendedDecision` is what applies if nobody looks at this flag — the
 * default documented at `decisionId`.
 */
export interface InjuryOverlapFlag {
  readonly bodyPartId: BodyPartId;

  readonly existingCharacterInjuryId: CharacterInjuryId;
  readonly newCharacterInjuryId: CharacterInjuryId;

  readonly integrityAtOverlap: number;

  readonly recommendedDecision: "preserve";
  readonly decisionId: "injury.overlap.recovery-progress-default";
}
