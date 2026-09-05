/*
 * Recovery resolution — the main orchestrator that turns "this much game
 * time passed" into updated persistent Anatomy and any Injuries that have
 * fully healed.
 *
 * Mirrors foundation/body/damage.ts's relationship to the rest of Body: this
 * is the seam between Body and Injuries, and it is the only file in the
 * engine that is allowed to know about both a BodyPart's integrity and an
 * Injury's treatment state at the same time.
 *
 * Pipeline, per Recovery pass:
 *
 * 1. Resolve Body Points once, for Maximum BP on every part (both damaged
 *    parts, which need it to compute this tick's raw recovery, and healthy
 *    ones, which are needed to tell whether an Injury's *other* BodyParts
 *    have already reached Maximum BP).
 * 2. Derive the daily recovery fraction from VIT, and the raw BP that
 *    fraction represents for each damaged part over the elapsed time.
 * 3. For each damaged BodyPart, find the Injuries occupying it and reduce
 *    their currently-active untreated caps to one effective ceiling — the
 *    lowest one, since caps only ever restrict, never extend, recovery.
 * 4. Call body-points/recovery.ts once per damaged part with that ceiling.
 * 5. Detect any Injury whose full location has reached Maximum BP after this
 *    pass, and report it for removal.
 *
 * ── Only active anatomy participates ────────────────────────────────────
 *
 * Every step above reads the CURRENT manifestation, and only the parts of it
 * that are actually there. A suppressed, removed, destroyed or archived
 * BodyPart receives no natural Recovery, does not count as manifested when an
 * Injury is evaluated, and cannot make an Injury look fully healed. An Injury
 * is removable only when EVERY continuity identity in its location is both
 * actively manifested and at Maximum BP — absence is not recovery, and a
 * severed limb is not a healed one.
 *
 * This module does not mutate `character.injuries` — it reports which
 * CharacterInjuryIds are now fully healed and leaves removing them to the
 * caller, the same way foundation/body/damage.ts reports destroyed/removed
 * BodyPart ids without reaching into Character itself.
 *
 * A treatment-required Injury with no recorded treatmentStatus is treated as
 * untreated for cap purposes — the same conservative default
 * character/status/resolution.ts uses for its Effects, and the state every
 * treatment-required Injury starts in.
 *
 * ── Inputs are assumed valid ────────────────────────────────────────────
 *
 * resolveRecovery does not check its own inputs, matching
 * body-points/resolution.ts's convention. That is safe for callers inside the
 * engine's pipeline and unsafe for a host supplying its own elapsed time and
 * Vitality, so validation.ts owns the guarded entry point
 * (resolveValidatedRecovery) and the reasons it refuses.
 */

import {
  toDays,
} from "../../../../time/duration";

import {
  applyBodyPartRecovery,
} from "../body-points/recovery";
import { setContinuityIntegrity } from "../continuity";
import type { ContinuityKey } from "../anatomy/types";
import {
  resolveBodyPoints,
} from "../body-points/resolution";
import type {
  Anatomy,
  BodyPart,
  BodyPartId,
} from "../anatomy/types";

import {
  getInjuryDefinition,
} from "../injuries/definitions";
import type {
  CharacterInjury,
} from "../injuries/types";

import type {
  ActiveRecoveryCap,
  BodyPartRecoveryCeiling,
  BodyPartRecoveryOutcome,
  RecoveredInjuryRemoval,
  ResolveRecoveryInput,
  ResolveRecoveryOutcome,
} from "./types";


/* -------------------------------------------------------------------------- */
/* VIT -> daily recovery fraction                                            */
/* -------------------------------------------------------------------------- */

/*
 * Reference Vitality for natural BP recovery.
 *
 * At VIT 10, each damaged BodyPart recovers 10% of its Maximum BP per 24
 * hours, and every +5 VIT doubles the daily fraction.
 *
 * This ladder USED to be described as mirroring the Constitution-to-BP ladder
 * exactly. It no longer does, and should not: Constitution's interval moved
 * from 5 to 2 when Body Points began consuming Structural Capacity, calibrated
 * against what a point of Strength buys. Following it here would be
 * catastrophic rather than consistent — at interval 2, VIT 20 would restore
 * 2^5 = 32 times the daily fraction, which is 320% of a part's Maximum BP per
 * day.
 *
 * What the two ladders share is the SHAPE, not the numbers: every mechanic
 * reads its own attribute against its own reference with its own doubling
 * interval, chosen for what that mechanic is calibrated against. Durability
 * and healing rate are different questions and are allowed different answers.
 *
 * Not touched by this ticket — a later balance-review item, not mixed into
 * this structural relocation.
 */
/* One of four independent baseline-10 anchors; see
 * attributes/resolution.ts's STANDARD_MODIFIER_REFERENCE_SCORE. */
export const VIT_RECOVERY_REFERENCE = 10;
export const VIT_RECOVERY_DOUBLING_INTERVAL = 5;
export const REFERENCE_DAILY_RECOVERY_FRACTION = 0.10;

/*
 * Resolves the fraction of Maximum BP a damaged BodyPart recovers per 24
 * game hours at the supplied Vitality.
 *
 * Formula:
 *
 * 0.10 × 2 ^ ((VIT - 10) / 5)
 */
export function deriveDailyRecoveryFraction(vitality: number): number {
  return (
    REFERENCE_DAILY_RECOVERY_FRACTION *
    Math.pow(
      2,
      (vitality - VIT_RECOVERY_REFERENCE) / VIT_RECOVERY_DOUBLING_INTERVAL,
    )
  );
}


/* -------------------------------------------------------------------------- */
/* Recovery ceilings                                                         */
/* -------------------------------------------------------------------------- */

function groupInjuriesByContinuity(
  injuries: readonly CharacterInjury[],
): ReadonlyMap<ContinuityKey, readonly CharacterInjury[]> {
  const map = new Map<ContinuityKey, CharacterInjury[]>();

  for (const injury of injuries) {
    for (const key of injury.location.continuityKeys) {
      const existing = map.get(key);

      if (existing === undefined) {
        map.set(key, [injury]);
      } else {
        existing.push(injury);
      }
    }
  }

  return map;
}

/*
 * Reduces the Injuries occupying one BodyPart to the single ceiling that
 * currently restricts its recovery.
 *
 * Only treatment-required Injuries that are not recorded "treated"
 * contribute a cap — a treated Injury's cap is gone even though the Injury
 * itself may still be active (its BodyParts have not reached Maximum BP
 * yet), and a no-treatment Injury never had one.
 */
export function resolveBodyPartRecoveryCeiling(
  partId: BodyPartId,
  maximumBP: number,
  injuriesOnPart: readonly CharacterInjury[],
): BodyPartRecoveryCeiling {
  const activeCaps: ActiveRecoveryCap[] = [];

  for (const injury of injuriesOnPart) {
    if (injury.treatmentStatus === "treated") continue;

    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined || !definition.recovery.treatmentRequired) {
      continue;
    }

    activeCaps.push({
      characterInjuryId: injury.id,
      injuryId: injury.injuryId,

      /*
       * Not floored. Recovery and integrity are continuous values all the way
       * through — integrity is a fraction, and body-points/recovery.ts already
       * owns whatever whole-BP presentation a sheet wants. Flooring here threw
       * away part of an authored ceiling before anything had a chance to use
       * it: a 0.33 ceiling on a 14 Maximum BP part is 4.62 BP, and rounding it
       * to 4 silently makes every Injury a little more crippling than it was
       * written to be — worse on small parts, where the lost fraction is a
       * larger share of the whole.
       */
      ceilingBP:
        definition.recovery.bpRecoveryCeilingFraction * maximumBP,
    });
  }

  const ceiling =
    activeCaps.length === 0
      ? maximumBP
      : Math.min(maximumBP, ...activeCaps.map((cap) => cap.ceilingBP));

  return { partId, activeCaps, ceiling };
}


/* -------------------------------------------------------------------------- */
/* Recovery pass                                                             */
/* -------------------------------------------------------------------------- */

/*
 * Runs one Recovery pass over a character's damaged Anatomy.
 *
 * This function assumes its inputs have already passed validation — it does
 * not itself check elapsed time, Vitality, Effective Scale, Injury locations
 * or treatment state, matching body-points/resolution.ts's own "assumes valid
 * input" convention. recovery/validation.ts's resolveValidatedRecovery is the
 * entry point for anything crossing a host boundary.
 */
export function resolveRecovery(
  input: ResolveRecoveryInput,
): ResolveRecoveryOutcome {
  const anatomy = input.anatomy;
  const bodyPointModifiers = input.bodyPointModifiers ?? [];

  const resolveBP = (target: Anatomy) =>
    resolveBodyPoints({
      anatomy: target,
      definitions: input.bodyPartDefinitions,
      morphologyByPartId: input.morphologyByPartId,
      effectiveScale: input.effectiveScale,
      constitution: input.constitution,
      modifiers: bodyPointModifiers,
    });

  const bodyPoints = resolveBP(anatomy);

  const maximumBPByPart = new Map(
    bodyPoints.parts.map((part) => [part.partId, part.maximumBP]),
  );

  const dailyFraction = deriveDailyRecoveryFraction(input.vitality);
  const elapsedDays = toDays(input.elapsed);

  const injuriesByContinuity = groupInjuriesByContinuity(input.injuries);

  const partOutcomes: BodyPartRecoveryOutcome[] = [];

  /*
   * Recovery reads the current manifestation and writes the persistent
   * identity. A part heals because it is the anatomy that is there; what
   * healed is the identity, which is what survives the instance.
   */
  let continuity = input.continuity;

  const updatedParts: readonly BodyPart[] = anatomy.parts.map((part: BodyPart) => {
    /*
     * Undamaged parts and departed ones are both skipped, and for different
     * reasons: the first has nothing to restore, the second is not there to
     * restore anything to. Ordinary recovery never regrows anatomy.
     */
    if (part.state !== "active" || part.integrity >= 1) return part;

    const maximumBP = maximumBPByPart.get(part.id);

    if (maximumBP === undefined) return part;

    const { ceiling } = resolveBodyPartRecoveryCeiling(
      part.id,
      maximumBP,
      injuriesByContinuity.get(part.continuityKey) ?? [],
    );

    const recoveryAmountBP = dailyFraction * maximumBP * elapsedDays;

    const result = applyBodyPartRecovery({
      integrity: part.integrity,
      maximumBP,
      maximumPermittedCurrentBP: ceiling,
      recoveryAmountBP,
    });

    partOutcomes.push({
      partId: part.id,
      integrityBefore: part.integrity,
      integrityAfter: result.integrity,
      bpRestored: result.bpRestored,
      ceiling,
    });

    continuity = setContinuityIntegrity(
      continuity,
      part.continuityKey,
      result.integrity,
    );

    return { ...part, integrity: result.integrity };
  });

  const newAnatomy: Anatomy = { parts: updatedParts };

  /*
   * Only ACTIVE anatomy counts as manifested.
   *
   * A suppressed, removed, destroyed or archived BodyPart is not there to
   * heal, and an identity standing in one of those states is not being
   * expressed by this form at all. Building this lookup from every part —
   * which is what used to happen — made an absent limb answer for its own
   * integrity, so an Injury on it could be reported fully healed and
   * removable while the anatomy it occupied was still gone.
   *
   * The same map is what the removal check below reads, so "did not heal" and
   * "does not count as manifested" cannot disagree.
   */
  const integrityByContinuityAfter = new Map(
    updatedParts
      .filter((part) => part.state === "active")
      .map((part) => [part.continuityKey, part.integrity]),
  );

  const removedInjuries: RecoveredInjuryRemoval[] = [];

  for (const injury of input.injuries) {
    /*
     * An Injury may only be REMOVED when every continuity identity in its
     * location is actively manifested and fully healed.
     *
     * Both halves matter, and a multi-location Injury is where that shows. A
     * fracture across an Upper and a Lower Arm is not healed because the
     * Upper Arm reached Maximum BP; and it is certainly not healed because the
     * Lower Arm was severed and stopped reporting damage. Absence is not
     * recovery.
     */
    const manifested = injury.location.continuityKeys.filter((key) =>
      integrityByContinuityAfter.has(key),
    );

    const fullyHealed =
      manifested.length === injury.location.continuityKeys.length &&
      manifested.every((key) => (integrityByContinuityAfter.get(key) ?? 0) >= 1);

    if (fullyHealed) {
      removedInjuries.push({
        characterInjuryId: injury.id,
        injuryId: injury.injuryId,
      });
    }
  }

  const bodyPointsAfterRecovery = resolveBP(newAnatomy);

  return {
    continuity,
    anatomy: newAnatomy,
    parts: partOutcomes,
    removedInjuries,
    bodyPointsAfterRecovery,
  };
}
