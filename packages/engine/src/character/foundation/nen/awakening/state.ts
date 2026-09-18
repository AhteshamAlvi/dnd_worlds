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

import { isSameContributionSource } from "../../../../infrastructure/contribution-source";

import type {
  NenAwakeningHistoryEntry,
  NenAwakeningRecord,
  NenAwakeningState,
  NenReversionRecord,
  NenSuppressionKind,
  NenSuppressionState,
} from "./types";


/**
 * The awakening state of somebody who has never awakened.
 *
 * A complete answer rather than a placeholder, exactly as
 * createUnawakenedNenState() is. An ordinary person HAS this state: half-open
 * nodes, an empty history, no Ability and no suppression.
 *
 * No affinity: that is NenState's, and createUnawakenedNenState() is the
 * constructor that requires one.
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
    suppression: [],
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


/* ── Suppression ────────────────────────────────────────────────────────── */

export function suppressionOfKind(
  state: NenAwakeningState,
  kind: NenSuppressionKind,
): readonly NenSuppressionState[] {
  return state.suppression.filter((held) => held.kind === kind);
}


/** Whether anything at all is currently holding this character's nodes shut. */
export function isSuppressed(state: NenAwakeningState): boolean {
  return state.suppression.length > 0;
}


export function isInForcedZetsu(state: NenAwakeningState): boolean {
  return state.suppression.some((held) => held.kind === "forced-zetsu");
}


export function isInInvoluntaryZetsu(state: NenAwakeningState): boolean {
  return state.suppression.some((held) => held.kind === "involuntary-zetsu");
}


export function findSuppression(
  state: NenAwakeningState,
  suppressionId: string,
): NenSuppressionState | null {
  return (
    state.suppression.find((held) => held.id === suppressionId) ?? null
  );
}


/**
 * Whether one Ability may function through one suppression instance.
 *
 * An involuntary Zetsu is always false: it carries no exemptions, because
 * nothing functions through the state a body puts itself in when it runs dry.
 *
 * For a forced Zetsu, all three bindings must match — the Ability, this exact
 * instance, and the source that granted the exemption. Checking only the
 * Ability id would be a GLOBAL ability-through-Zetsu exception: the same
 * Ability would work through any suppression it was never granted anything
 * against.
 */
export function abilityFunctionsThroughSuppression(
  held: NenSuppressionState,
  abilityId: string,
): boolean {
  if (held.kind !== "forced-zetsu") return false;

  return held.exemptions.some(
    (exemption) =>
      exemption.abilityId === abilityId &&
      exemption.suppressionId === held.id &&
      isSameContributionSource(exemption.source, held.source),
  );
}


/**
 * Whether an Ability functions at all given every suppression in play.
 *
 * A character under no suppression is not restricted by this rule and the
 * answer is true. One under several must have a matching exemption on EVERY
 * one of them, because two shut states are not less shut than one.
 */
export function abilityFunctionsDespiteSuppression(
  state: NenAwakeningState,
  abilityId: string,
): boolean {
  return state.suppression.every((held) =>
    abilityFunctionsThroughSuppression(held, abilityId),
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
