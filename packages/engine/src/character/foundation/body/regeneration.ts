/*
 * Regeneration — growing anatomy back.
 *
 * A regrown limb is a NEW manifestation of an old identity, and both halves of
 * that matter:
 *
 *   new manifestation   it is whole. Full integrity, working joints, nothing
 *                       carried over from the limb that was lost
 *   old identity        it is still THEIRS. Their own morphology, and every
 *                       point of Strength development bought while it was gone
 *
 * Getting the first half wrong is subtle and was the bug this module exists
 * for. Restoring the continuity record alone brought the limb back at full
 * integrity and left its Anatomical Points archived, so the arm was structurally
 * perfect and permanently unusable: destroyed Shoulder, destroyed Elbow,
 * everything downstream at a quarter effectiveness. Whole in every number
 * except the ones anyone would check.
 *
 * Point state belongs to a MANIFESTATION rather than to an identity — it
 * records what happened to the tissue that was standing there — so growing new
 * tissue clears it. The identity's own persistent state is what survives, and
 * that is deliberately a different list.
 *
 *
 * WHY IT CASCADES
 *
 * Destruction takes everything hanging off what it destroyed: losing an Arm
 * takes the Hand. Regeneration undoes exactly that, because the alternative is
 * an arm that grows back with no hand and a second, separate ritual needed to
 * finish the job. Symmetry with destruction is the least surprising rule, and
 * a caller who genuinely wants a partial restoration can regenerate the
 * identities one at a time.
 */

import { instantiateAnatomy } from "./anatomy/creation";
import { resolveCriticalPoints } from "./critical-points/resolution";
import { regenerateContinuity } from "./continuity";
import type { ContinuityStates } from "./continuity";
import type { AnatomicalPointStates } from "./critical-points/state";
import type { SpecialPointDefinition } from "./critical-points/types";
import type {
  BodyPartDefinition,
  ContinuityKey,
  ReferenceAnatomySlotId,
  ReferenceForm,
} from "./anatomy/types";


export interface RegenerationInput {
  /** The form deciding what the restored anatomy is and what hangs off it. */
  readonly referenceForm: ReferenceForm;

  readonly continuity: ContinuityStates;
  readonly anatomicalPoints: AnatomicalPointStates;

  readonly definitions: readonly BodyPartDefinition[];
  readonly specialPointDefinitions: readonly SpecialPointDefinition[];

  /** The anatomy to grow back. Anything the form hangs off it comes too. */
  readonly continuityKey: ContinuityKey;
}


export interface RegenerationOutcome {
  readonly continuity: ContinuityStates;
  readonly anatomicalPoints: AnatomicalPointStates;

  /** Every identity restored, the named one first. */
  readonly restored: readonly ContinuityKey[];

  /** Point records cleared, so a caller can say what came back. */
  readonly clearedPointIds: readonly string[];
}


/*
 * Grows one anatomical identity back, whole.
 *
 * Pure: returns new persistent state and writes nothing. What it does NOT
 * touch is the point — individual morphology stays exactly as it was, so the
 * limb is this character's own rather than a species-default one, and every
 * other layer is reapplied from their CURRENT state at resolution.
 */
export function regenerateAnatomy(
  input: RegenerationInput,
): RegenerationOutcome {
  const { referenceForm } = input;

  const slotOf = new Map<ContinuityKey, ReferenceAnatomySlotId>(
    referenceForm.parts.map((part) => [part.continuityKey, part.slotId]),
  );

  const childrenOf = new Map<ReferenceAnatomySlotId, ReferenceAnatomySlotId[]>();

  for (const part of referenceForm.parts) {
    if (part.attachment === null) continue;

    const siblings = childrenOf.get(part.attachment.parentSlotId) ?? [];

    siblings.push(part.slotId);
    childrenOf.set(part.attachment.parentSlotId, siblings);
  }

  const identityOf = new Map<ReferenceAnatomySlotId, ContinuityKey>(
    referenceForm.parts.map((part) => [part.slotId, part.continuityKey]),
  );

  /* The named identity, plus everything the blueprint hangs off it. */
  const restoredSlots: ReferenceAnatomySlotId[] = [];

  const collect = (slotId: ReferenceAnatomySlotId): void => {
    if (restoredSlots.includes(slotId)) return;

    restoredSlots.push(slotId);

    for (const child of childrenOf.get(slotId) ?? []) collect(child);
  };

  const rootSlot = slotOf.get(input.continuityKey);

  if (rootSlot !== undefined) collect(rootSlot);

  const restored: ContinuityKey[] = restoredSlots.flatMap((slotId) => {
    const key = identityOf.get(slotId);

    return key === undefined ? [] : [key];
  });

  /*
   * A form that does not express this identity restores it anyway. The record
   * stops saying destroyed, and the anatomy appears the moment a form that has
   * it does — which is what makes regenerating a Dragon's wing while human a
   * coherent thing to do rather than a silent no-op.
   */
  const keys = restored.length > 0 ? restored : [input.continuityKey];

  const continuity = keys.reduce(
    (states, key) => regenerateContinuity(states, key),
    input.continuity,
  );

  /* ---- clear the old manifestation's point records ---------------------- */

  const restoredPartIds = new Set(
    instantiateAnatomy(referenceForm, continuity).parts
      .filter((part) => restoredSlots.includes(part.referenceSlotId))
      .map((part) => part.id),
  );

  const points = resolveCriticalPoints(
    instantiateAnatomy(referenceForm, continuity),
    input.definitions,
    input.specialPointDefinitions,
  );

  const clearedPointIds = points.points
    .filter((point) => restoredPartIds.has(point.hostPartId))
    .map((point) => point.id)
    .filter((pointId) =>
      Object.prototype.hasOwnProperty.call(input.anatomicalPoints, pointId),
    );

  const anatomicalPoints = { ...input.anatomicalPoints };

  for (const pointId of clearedPointIds) delete anatomicalPoints[pointId];

  return {
    continuity,
    anatomicalPoints,
    restored: keys,
    clearedPointIds,
  };
}
