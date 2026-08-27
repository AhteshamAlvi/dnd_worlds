/*
 * Recovery resolution — the main orchestrator that turns "this much game
 * time passed" into updated persistent Anatomy and any Injuries that have
 * fully healed.
 *
 * Mirrors foundation/body/damage.ts's relationship to the rest of Body: this
 * is the seam between Body and Status, and it is the only file in the engine
 * that is allowed to know about both a BodyPart's recoveryProgress and an
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
 * 5. Detect any Injury whose full location (every BodyPart it occupies) has
 *    reached Maximum BP after this pass, and report it for removal.
 *
 * This module does not mutate `character.injuries` — it reports which
 * CharacterInjuryIds are now fully healed and leaves removing them to the
 * caller, the same way foundation/body/damage.ts reports destroyed/removed
 * BodyPart ids without reaching into Character itself.
 *
 * A treatment-required Injury with no recorded treatmentStatus is treated as
 * untreated for cap purposes — the same conservative default
 * status/resolution.ts uses for its Effects, and the state every
 * treatment-required Injury starts in.
 */

import {
  toDays,
} from "../../../time/duration";
import type {
  GameDuration,
} from "../../../time/types";

import {
  applyBodyPartRecovery,
} from "../../foundation/body/body-points/recovery";
import {
  resolveMorphology,
} from "../../foundation/body/body-points/morphology";
import {
  resolveBodyPoints,
} from "../../foundation/body/body-points/resolution";
import type {
  BodyPointModifier,
  ResolvedBodyPoints,
} from "../../foundation/body/body-points/types";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
} from "../../foundation/body/anatomy/types";
import type {
  Body,
} from "../../foundation/body/types";

import {
  getInjuryDefinition,
  type CharacterInjury,
} from "../../status/injuries";

import type {
  ActiveRecoveryCap,
  BodyPartRecoveryCeiling,
  BodyPartRecoveryOutcome,
  InjuryOverlapFlag,
  RecoveredInjuryRemoval,
} from "./types";


/* -------------------------------------------------------------------------- */
/* VIT -> daily recovery fraction                                            */
/* -------------------------------------------------------------------------- */

/*
 * Reference Vitality for natural BP recovery.
 *
 * At VIT 10, each damaged BodyPart recovers 10% of its Maximum BP per 24
 * hours. Every +5 VIT doubles the daily fraction, mirroring
 * body-points/resolution.ts's Constitution-to-BP ladder exactly (same
 * reference of 10, same doubling interval of 5, same "every mechanic reads
 * its own attribute the same way" shape).
 */
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
export function deriveDailyRecoveryFraction(vit: number): number {
  return (
    REFERENCE_DAILY_RECOVERY_FRACTION *
    Math.pow(
      2,
      (vit - VIT_RECOVERY_REFERENCE) / VIT_RECOVERY_DOUBLING_INTERVAL,
    )
  );
}


/* -------------------------------------------------------------------------- */
/* Recovery ceilings                                                         */
/* -------------------------------------------------------------------------- */

function groupInjuriesByBodyPart(
  injuries: readonly CharacterInjury[],
): ReadonlyMap<BodyPartId, readonly CharacterInjury[]> {
  const map = new Map<BodyPartId, CharacterInjury[]>();

  for (const injury of injuries) {
    for (const partId of injury.location.bodyPartIds) {
      const existing = map.get(partId);

      if (existing === undefined) {
        map.set(partId, [injury]);
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
      ceilingBP: Math.floor(
        definition.recovery.bpRecoveryCeilingFraction * maximumBP,
      ),
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

export interface ResolveRecoveryInput {
  readonly body: Body;
  readonly constitution: number;

  readonly bodyPartDefinitions: readonly BodyPartDefinition[];
  readonly bodyPointModifiers?: readonly BodyPointModifier[];

  readonly injuries: readonly CharacterInjury[];

  readonly elapsed: GameDuration;
  readonly vit: number;
}

export interface ResolveRecoveryOutcome {
  // New persistent state — the caller stores this back onto Body.anatomy.
  readonly anatomy: Anatomy;

  readonly parts: readonly BodyPartRecoveryOutcome[];

  // The caller removes these from character.injuries; see the file header.
  readonly removedInjuries: readonly RecoveredInjuryRemoval[];

  readonly bodyPointsAfterRecovery: ResolvedBodyPoints;
}

/*
 * Runs one Recovery pass over a character's damaged Anatomy.
 *
 * This function assumes its inputs have already passed validation (see
 * validation.ts) — it does not itself check that Injury locations exist or
 * that treatment state matches each Injury's definition, matching
 * body-points/resolution.ts's own "assumes valid input" convention.
 */
export function resolveRecovery(
  input: ResolveRecoveryInput,
): ResolveRecoveryOutcome {
  const anatomy = input.body.anatomy;
  const bodyPointModifiers = input.bodyPointModifiers ?? [];

  const morphology = resolveMorphology(
    input.body,
    anatomy,
    input.bodyPartDefinitions,
  );

  const bodyPoints = resolveBodyPoints(
    anatomy,
    morphology,
    input.constitution,
    input.bodyPartDefinitions,
    bodyPointModifiers,
  );

  const maximumBPByPart = new Map(
    bodyPoints.parts.map((part) => [part.partId, part.maximumBP]),
  );

  const dailyFraction = deriveDailyRecoveryFraction(input.vit);
  const elapsedDays = toDays(input.elapsed);

  const injuriesByPart = groupInjuriesByBodyPart(input.injuries);

  const partOutcomes: BodyPartRecoveryOutcome[] = [];

  const updatedParts: readonly BodyPart[] = anatomy.parts.map((part) => {
    if (part.damage <= 0) return part;

    const maximumBP = maximumBPByPart.get(part.id);

    if (maximumBP === undefined) return part;

    const { ceiling } = resolveBodyPartRecoveryCeiling(
      part.id,
      maximumBP,
      injuriesByPart.get(part.id) ?? [],
    );

    const rawRecoveryAmount = dailyFraction * maximumBP * elapsedDays;

    const result = applyBodyPartRecovery({
      damage: part.damage,
      recoveryProgress: part.recoveryProgress,
      maximumBP,
      maximumPermittedCurrentBP: ceiling,
      rawRecoveryAmount,
    });

    partOutcomes.push({
      partId: part.id,
      damageBefore: part.damage,
      damageAfter: result.damage,
      recoveryProgressBefore: part.recoveryProgress,
      recoveryProgressAfter: result.recoveryProgress,
      wholeBPRestored: result.wholeBPRestored,
      ceiling,
    });

    return {
      ...part,
      damage: result.damage,
      recoveryProgress: result.recoveryProgress,
    };
  });

  const newAnatomy: Anatomy = { parts: updatedParts };

  const damageByPartAfter = new Map(
    updatedParts.map((part) => [part.id, part.damage]),
  );

  const removedInjuries: RecoveredInjuryRemoval[] = [];

  for (const injury of input.injuries) {
    const fullyHealed = injury.location.bodyPartIds.every((partId) => {
      const damage = damageByPartAfter.get(partId);
      return damage !== undefined && damage <= 0;
    });

    if (fullyHealed) {
      removedInjuries.push({
        characterInjuryId: injury.id,
        injuryId: injury.injuryId,
      });
    }
  }

  const bodyPointsAfterRecovery = resolveBodyPoints(
    newAnatomy,
    morphology,
    input.constitution,
    input.bodyPartDefinitions,
    bodyPointModifiers,
  );

  return {
    anatomy: newAnatomy,
    parts: partOutcomes,
    removedInjuries,
    bodyPointsAfterRecovery,
  };
}


/* -------------------------------------------------------------------------- */
/* Overlapping Injuries                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Detects a new Injury landing on a BodyPart that already carries one.
 *
 * This never blocks recording the new Injury — it only surfaces a decision
 * opportunity, defaulting to "preserve" the BodyPart's existing
 * recoveryProgress (see decisions/log.ts's
 * "injury.overlap.recovery-progress-default" entry for why). One flag is
 * produced per (already-carried Injury, shared BodyPart) pair; a location
 * spanning several BodyParts, or several prior Injuries on the same part,
 * can therefore produce more than one flag.
 */
export function detectInjuryOverlap(
  anatomy: Anatomy,
  existingInjuries: readonly CharacterInjury[],
  newInjury: CharacterInjury,
): readonly InjuryOverlapFlag[] {
  const partsById = new Map(
    anatomy.parts.map((part) => [part.id, part]),
  );

  const flags: InjuryOverlapFlag[] = [];

  for (const bodyPartId of newInjury.location.bodyPartIds) {
    for (const existing of existingInjuries) {
      if (existing.id === newInjury.id) continue;
      if (!existing.location.bodyPartIds.includes(bodyPartId)) continue;

      flags.push({
        bodyPartId,
        existingCharacterInjuryId: existing.id,
        newCharacterInjuryId: newInjury.id,
        recoveryProgressAtOverlap:
          partsById.get(bodyPartId)?.recoveryProgress ?? 0,
        recommendedDecision: "preserve",
        decisionId: "injury.overlap.recovery-progress-default",
      });
    }
  }

  return flags;
}
