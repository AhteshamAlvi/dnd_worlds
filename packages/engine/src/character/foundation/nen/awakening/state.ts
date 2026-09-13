/*
 * Reading the awakening state, and the few constructors that build one.
 *
 * Every question a consumer asks about awakening is answered here rather than
 * by comparing a field against a literal at the call site. That is not
 * ceremony: `condition === "awakened"` and `condition !== "unawakened"` are
 * both plausible spellings of "can this character use Nen", they disagree
 * about a reverted character, and the version scattered across twelve call
 * sites is the one that disagrees with itself.
 *
 * Nothing here mutates. The transitions that change an awakening state live
 * above Foundation, in character/nen/, because they need requirements — these
 * are the pure readings they and everybody else share.
 */

import { unknownNenType } from "../nen-type";

import type {
  NenAwakeningHistoryEntry,
  NenAwakeningRecord,
  NenAwakeningState,
  NenForcedState,
  NenForcedStateOrigin,
  NenReversionRecord,
} from "./types";


/**
 * The awakening state of somebody who has never awakened.
 *
 * A complete answer rather than a placeholder, exactly as
 * createUnawakenedNenState() is. An ordinary person HAS this state: half-open
 * nodes, an empty history, no Ability, no forced state, and a Nen Type nobody
 * has established.
 */
export function createUnawakenedAwakeningState(): NenAwakeningState {
  return {
    condition: "unawakened",
    nodes: "half-open",
    currentMethod: null,
    currentAwakeningId: null,
    history: [],
    naturalAbility: null,
    externalAbilities: [],
    forcedStates: [],
    nenType: unknownNenType(),
    collapseRecovery: null,
  };
}


/* ── Condition readings ─────────────────────────────────────────────────── */

/** Nodes open and Nen available in the ordinary way. */
export function isAwakened(state: NenAwakeningState): boolean {
  return state.condition === "awakened";
}


/**
 * Whether the character has EVER been awakened.
 *
 * The reading that governs retained Mastery. A reverted character is not
 * awakened and still legitimately knows Ten V, so validating stored Mastery
 * against `isAwakened` would refuse a state the rules explicitly create.
 */
export function hasEverAwakened(state: NenAwakeningState): boolean {
  return state.condition !== "unawakened" || state.history.some(isAwakeningRecord);
}


/**
 * Whether passive pseudo-Chu is being produced.
 *
 * ONLY while never awakened. Awakening ends it permanently: it does not come
 * back during a Zetsu, it does not come back after a collapse, and it does not
 * come back on reversion — which is the entire reason `reverted` is a third
 * condition instead of a return to `unawakened`.
 */
export function hasPseudoChu(state: NenAwakeningState): boolean {
  return state.condition === "unawakened" && !hasEverAwakened(state);
}


/** True once the character has been awakened and is not any more. */
export function isReverted(state: NenAwakeningState): boolean {
  return state.condition === "reverted";
}


/* ── History readings ───────────────────────────────────────────────────── */

export function isAwakeningRecord(
  entry: NenAwakeningHistoryEntry,
): entry is NenAwakeningRecord {
  return entry.kind === "awakening";
}


export function isReversionRecord(
  entry: NenAwakeningHistoryEntry,
): entry is NenReversionRecord {
  return entry.kind === "reversion";
}


export function awakeningRecords(
  state: NenAwakeningState,
): readonly NenAwakeningRecord[] {
  return state.history.filter(isAwakeningRecord);
}


/** The record the CURRENT condition came from, or null. */
export function currentAwakeningRecord(
  state: NenAwakeningState,
): NenAwakeningRecord | null {
  if (state.currentAwakeningId === null) return null;

  return (
    awakeningRecords(state).find(
      (record) => record.id === state.currentAwakeningId,
    ) ?? null
  );
}


/**
 * Whether a NEXT awakening would be a reawakening.
 *
 * Reads the history rather than the condition, because the two say different
 * things: a character who awakened, reverted and is now being awakened again
 * is reawakening whatever route they take, and a first-time character is not
 * even if somebody hands the transition a hurdle.
 */
export function wouldBeReawakening(state: NenAwakeningState): boolean {
  return awakeningRecords(state).length > 0;
}


/* ── Forced states ──────────────────────────────────────────────────────── */

export function forcedStatesOfOrigin(
  state: NenAwakeningState,
  origin: NenForcedStateOrigin,
): readonly NenForcedState[] {
  return state.forcedStates.filter((forced) => forced.origin === origin);
}


/** Whether any forced Zetsu is currently holding the character's nodes shut. */
export function isInForcedZetsu(state: NenAwakeningState): boolean {
  return state.forcedStates.some((forced) => forced.kind === "forced-zetsu");
}


export function findForcedState(
  state: NenAwakeningState,
  forcedStateId: string,
): NenForcedState | null {
  return (
    state.forcedStates.find((forced) => forced.id === forcedStateId) ?? null
  );
}


/**
 * Whether one Ability may function through one forced state.
 *
 * All three fields of the exemption must match, and the ability id must match
 * too. Checking only the ability id would be a GLOBAL ability-through-Zetsu
 * exception: the same Ability would work through a collapse Zetsu it was never
 * granted an exception for, and through a forced state applied by something
 * else entirely.
 */
export function abilityFunctionsThroughForcedState(
  forced: NenForcedState,
  abilityId: string,
): boolean {
  return forced.exemptions.some(
    (exemption) =>
      exemption.abilityId === abilityId &&
      exemption.forcedStateId === forced.id &&
      exemption.origin === forced.origin,
  );
}


/**
 * Whether an Ability functions at all given every forced state in play.
 *
 * A character in no forced state is not restricted by this rule and the answer
 * is true. A character in one or more must have a matching exemption on EVERY
 * one of them, because two shut states are not less shut than one.
 */
export function abilityFunctionsDespiteForcedStates(
  state: NenAwakeningState,
  abilityId: string,
): boolean {
  return state.forcedStates.every((forced) =>
    abilityFunctionsThroughForcedState(forced, abilityId),
  );
}


/* ── Abilities ──────────────────────────────────────────────────────────── */

/**
 * Whether this Ability is the one an awakening of this character produced.
 *
 * Provenance, not shape. Reversion removes the Ability this returns true for
 * and nothing else, so an Ability that merely LOOKS natural — same catalog
 * entry, granted by a teacher — survives, which is the rule.
 */
export function isProvenanceLinkedNaturalAbility(
  state: NenAwakeningState,
  abilityId: string,
): boolean {
  const natural = state.naturalAbility;

  if (natural === null || natural.abilityId !== abilityId) return false;

  return awakeningRecords(state).some(
    (record) => record.id === natural.grantedByAwakeningId,
  );
}


/* ── Collapse recovery ──────────────────────────────────────────────────── */

export function isCollapseRecoveryComplete(
  state: NenAwakeningState,
): boolean {
  const recovery = state.collapseRecovery;

  return recovery !== null && recovery.completedAt !== null;
}


/** Hours of qualifying sleep still owed. Zero once the recovery is complete. */
export function collapseRecoveryHoursRemaining(
  state: NenAwakeningState,
): number {
  const recovery = state.collapseRecovery;

  if (recovery === null) return 0;

  return Math.max(
    0,
    recovery.requiredSleepHours - recovery.accumulatedSleepHours,
  );
}
