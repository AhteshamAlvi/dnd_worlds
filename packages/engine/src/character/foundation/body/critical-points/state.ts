/*
 * Persistent Anatomical Point state.
 *
 * Point INSTANCES are derived from anatomy — resolve a body and its Brain,
 * Shoulders and Wrists fall out of the parts it has. What has already HAPPENED
 * to those points is not derivable from anything, and so it is stored here.
 *
 * The same split BodyParts already have, for the same reason: what a body is
 * supposed to contain and what has become of it are different questions, and
 * conflating them is how damage starts editing anatomy.
 *
 *
 * WHY THIS MIRRORS LOST LIMBS EXACTLY
 *
 * A destroyed Eye is gone, and it is gone in the specific way a severed Arm is
 * gone: not merely absent, but absent AND recorded, so that extraordinary
 * regeneration has a particular structure to restore rather than a shrug. That
 * is why the states are the same three words rather than a bespoke pair, and
 * why a destroyed point keeps its entry forever instead of being deleted.
 *
 *
 * ABSENT MEANS ACTIVE
 *
 * A body stores entries only for points something has happened to. A character
 * who has never been hurt stores none, a regrown arm's new Shoulder needs no
 * entry to work, and a Species that gains anatomy mid-campaign does not need
 * its state map migrated. Storing "active" for all 27 Human points would be
 * 27 facts nobody asserted.
 *
 *
 * KEYS THAT NO LONGER RESOLVE ARE NOT ERRORS
 *
 * Sever an Arm and its Shoulder stops resolving, but the record of what
 * happened to that Shoulder stays. Validation deliberately does NOT reject
 * entries for points the current anatomy cannot produce, because that is the
 * archive working as intended rather than corruption — the same reason a
 * destroyed BodyPart stays in the tree.
 */

import type { BodyPartState } from "../anatomy/types";
import type {
  CriticalPointId,
  ResolvedCriticalPoints,
} from "./types";


/*
 * What has become of one Anatomical Point.
 *
 * Deliberately the same union as BodyPartState rather than a parallel one.
 * "active", "suppressed" and "archived-removed" mean exactly what they mean
 * for a BodyPart, and a second vocabulary saying the same three things would
 * be a second vocabulary to keep in sync.
 */
export type AnatomicalPointState = BodyPartState;

export const DEFAULT_ANATOMICAL_POINT_STATE: AnatomicalPointState = "active";


/*
 * Persistent point state, keyed by resolved point instance id.
 *
 * Sparse on purpose. See "absent means active" above.
 */
export type AnatomicalPointStates = Readonly<
  Record<CriticalPointId, AnatomicalPointState>
>;


export function getAnatomicalPointState(
  states: AnatomicalPointStates,
  pointId: CriticalPointId,
): AnatomicalPointState {
  return states[pointId] ?? DEFAULT_ANATOMICAL_POINT_STATE;
}


export function isAnatomicalPointActive(
  states: AnatomicalPointStates,
  pointId: CriticalPointId,
): boolean {
  return getAnatomicalPointState(states, pointId) === "active";
}


/*
 * Records what has become of one point.
 *
 * Returning to "active" DELETES the entry rather than storing the word,
 * keeping the map sparse and keeping "no entry" and "explicitly active"
 * from becoming two spellings of one fact that could drift apart.
 */
export function setAnatomicalPointState(
  states: AnatomicalPointStates,
  pointId: CriticalPointId,
  state: AnatomicalPointState,
): AnatomicalPointStates {
  if (state === DEFAULT_ANATOMICAL_POINT_STATE) {
    if (states[pointId] === undefined) return states;

    const next = { ...states };
    delete next[pointId];

    return next;
  }

  return { ...states, [pointId]: state };
}


/*
 * Every currently-resolvable Joint that has been destroyed.
 *
 * Filtered against the resolved points rather than read straight off the map,
 * so an archived record for anatomy the body no longer has cannot reach back
 * and affect a body that no longer contains it. Regrow an Arm and its new
 * Shoulder is intact, even though the old one's record survives.
 */
export function selectDestroyedJointPointIds(
  points: ResolvedCriticalPoints,
  states: AnatomicalPointStates,
): readonly CriticalPointId[] {
  return points.points
    .filter(
      (point) =>
        point.categories.includes("joint") &&
        !isAnatomicalPointActive(states, point.id),
    )
    .map((point) => point.id);
}


/*
 * Every currently-resolvable point that has been destroyed, of any category.
 */
export function selectDestroyedPointIds(
  points: ResolvedCriticalPoints,
  states: AnatomicalPointStates,
): readonly CriticalPointId[] {
  return points.points
    .filter((point) => !isAnatomicalPointActive(states, point.id))
    .map((point) => point.id);
}
