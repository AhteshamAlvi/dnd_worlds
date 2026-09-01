/*
 * Anatomical continuity — the persistent body, independent of any one form.
 *
 * A character's physical state used to live on BodyPart instances, and that
 * only worked while a character had exactly one body plan for life. The moment
 * anatomy can be destroyed, regrown, or carried through a transformation, an
 * instance is the wrong owner for anything that is supposed to outlive it:
 *
 *   sever an arm            the instance goes; the arm's history should not
 *   regrow it               a new instance appears; it is still THEIR arm
 *   become a wolf           different slots entirely; the same four limbs
 *   become human again      the wolf's leg damage is the human's arm damage
 *
 * So persistent state is keyed by continuity identity, and a BodyPart instance
 * becomes what it always should have been: a MANIFESTATION — how one identity
 * happens to be expressed in the form a character is currently wearing.
 *
 *   ContinuityStates    what is persistently true of this body
 *   ReferenceForm       how a body of this kind is arranged
 *   Anatomy             the two of them combined, for right now
 *
 * Anatomy is therefore derived and never stored. Storing it alongside the
 * state it is derived from is what let a transformed character keep anatomy
 * their new form does not have.
 *
 *
 * WHAT IS AND IS NOT HERE
 *
 * Individual morphology, integrity and destruction live here because they
 * belong to the character. BodyPart TYPE does not, and neither does topology:
 * those are facts about the form, and the same identity is legitimately a
 * different kind of part in different forms — that is the entire point of a
 * Wolf's foreleg being a Human's arm.
 */

import type { BodyMorphology } from "./types";
import type { ContinuityKey } from "./anatomy/types";


/*
 * What is persistently true of one anatomical identity.
 *
 * Everything is optional-with-a-default rather than required, so a body only
 * records identities something has actually happened to. An untouched
 * character stores nothing at all, and an identity that appears for the first
 * time in a new form needs no migration to work.
 */
export interface AnatomicalContinuityState {
  /*
   * What is unusual about THIS character's anatomy in this position.
   *
   * Keyed here rather than by slot so it survives a change of form: a Troll
   * whose right arm is 20% longer keeps that as a Wolf's front-right leg, and
   * gets it back on a regrown arm. Partial, because an individual is unusual
   * in specific ways rather than in all four dimensions at once.
   */
  readonly morphology?: Partial<BodyMorphology>;

  /*
   * How intact this anatomy is, as a FRACTION of whatever its current
   * manifestation's Maximum BP turns out to be.
   *
   * Fractional on purpose. Forms have different Maximum BP for the same
   * identity — a Dragon's foreleg is not a Human's arm — so carrying raw
   * missing BP across a transformation would either heal or maim a character
   * for changing shape. A fraction means "this badly hurt", which is the thing
   * that actually transfers.
   */
  readonly integrity?: number;

  /*
   * Whether this anatomy has been destroyed.
   *
   * Separate from integrity 0 because they are different facts: integrity is
   * how damaged something is, destruction is whether it is still attached.
   * Kept as history rather than as a deletion, so that regeneration has a
   * specific identity to restore and Injuries on it stay meaningful.
   */
  readonly destroyed?: boolean;
}


/*
 * Every identity this body has a record for. Sparse: absent means untouched.
 */
export type ContinuityStates = Readonly<
  Record<ContinuityKey, AnatomicalContinuityState>
>;


/** Full integrity, which is what anatomy nothing has happened to resolves at. */
export const INTACT_INTEGRITY = 1;


export function getContinuityState(
  states: ContinuityStates,
  key: ContinuityKey,
): AnatomicalContinuityState | undefined {
  return Object.prototype.hasOwnProperty.call(states, key)
    ? states[key]
    : undefined;
}


/*
 * How intact one identity currently is. Absent records are intact.
 */
export function continuityIntegrity(
  states: ContinuityStates,
  key: ContinuityKey,
): number {
  return getContinuityState(states, key)?.integrity ?? INTACT_INTEGRITY;
}


/*
 * Whether one identity's anatomy has been destroyed.
 */
export function isContinuityDestroyed(
  states: ContinuityStates,
  key: ContinuityKey,
): boolean {
  return getContinuityState(states, key)?.destroyed === true;
}


/*
 * This character's own morphology for one identity, if they have any.
 */
export function continuityMorphology(
  states: ContinuityStates,
  key: ContinuityKey,
): Partial<BodyMorphology> | undefined {
  return getContinuityState(states, key)?.morphology;
}


/*
 * The individual morphology layer, as the morphology resolver wants it.
 *
 * Extracted rather than passed as the whole state map, so the morphology
 * subsystem never has to know that integrity and destruction exist.
 */
export function individualMorphologyByContinuityKey(
  states: ContinuityStates,
): Readonly<Record<ContinuityKey, Partial<BodyMorphology>>> {
  const morphology: Record<ContinuityKey, Partial<BodyMorphology>> = {};

  for (const [rawKey, state] of Object.entries(states)) {
    const key = rawKey as ContinuityKey;

    if (state.morphology !== undefined) morphology[key] = state.morphology;
  }

  return morphology;
}


/*
 * Writes one identity's state, leaving every other identity untouched.
 *
 * Returns a new map: persistent Body state is treated as immutable everywhere
 * else in this subsystem and there is no reason for this to be the exception.
 */
export function setContinuityState(
  states: ContinuityStates,
  key: ContinuityKey,
  change: AnatomicalContinuityState,
): ContinuityStates {
  const existing = getContinuityState(states, key) ?? {};

  return { ...states, [key]: { ...existing, ...change } };
}


/*
 * Records damage against one identity.
 */
export function setContinuityIntegrity(
  states: ContinuityStates,
  key: ContinuityKey,
  integrity: number,
): ContinuityStates {
  return setContinuityState(states, key, { integrity });
}


/*
 * Records that one identity's anatomy has been destroyed.
 *
 * Integrity goes to 0 alongside it, matching the anatomy invariant that a part
 * which is not present carries no fraction — it is absent, not merely badly
 * hurt, and a stored fraction would invite a restoration mechanic to read it
 * as "how hurt was this when we lost it".
 */
export function destroyContinuity(
  states: ContinuityStates,
  key: ContinuityKey,
): ContinuityStates {
  return setContinuityState(states, key, { destroyed: true, integrity: 0 });
}


/*
 * Restores a destroyed identity to a living one.
 *
 * Regeneration, and deliberately the only way out of destruction. Note what it
 * does NOT touch: individual morphology stays exactly as it was, so the limb
 * that grows back is this character's own. Everything else about it — species
 * morphology, age, global Strength development — is reapplied at resolution
 * from the character's CURRENT state, so a limb regrown after a decade of
 * training comes back trained rather than as the limb that was lost.
 */
export function regenerateContinuity(
  states: ContinuityStates,
  key: ContinuityKey,
  integrity: number = INTACT_INTEGRITY,
): ContinuityStates {
  return setContinuityState(states, key, { destroyed: false, integrity });
}
