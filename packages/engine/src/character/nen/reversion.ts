/*
 * Undoing an awakening, and coming back from it.
 *
 * Reversion is EXCEPTIONAL. There is no ordinary un-awakening, no training
 * that reverses training, and no natural decay — so every reversion names the
 * source that caused it, and a reversion with no source is refused.
 *
 *
 * WHAT REVERSION TAKES, AND WHAT IT CONSPICUOUSLY DOES NOT
 * --------------------------------------------------------
 *
 * TAKEN:
 *   deliberate Nen access   the nodes go back to half-open
 *   the natural Ability     the one whose PROVENANCE says an awakening of this
 *                           character produced it, and no other
 *   forced states           they described a set of open nodes that no longer
 *                           exist
 *
 * KEPT:
 *   every Mastery rank      Ten V stays Ten V. The character cannot reach it,
 *                           and they have not forgotten it.
 *   the whole history       including the awakening being undone
 *   external Abilities      anything a teacher, an Item or another character
 *                           granted. The reverting source may name one to
 *                           remove; it never takes one by implication.
 *   pseudo-Chu's absence    awakening ended it permanently. A reverted
 *                           character does not get it back, which is why
 *                           `reverted` is a third condition and not a return
 *                           to `unawakened`.
 *
 * "Removes the natural Ability" is not "removes the Ability that looks
 * natural". Two characters can hold the same catalog entry, one because they
 * awakened and one because somebody taught them, and only the first loses it.
 * The provenance link is what tells them apart, and it is checked rather than
 * assumed.
 *
 *
 * REAWAKENING RESTORES ACCESS, IT DOES NOT REBUILD ANYTHING
 * ---------------------------------------------------------
 *
 * A reverted character who reawakens can use the Mastery they already had, at
 * the ranks they already had. Nothing is relearned, nothing is duplicated,
 * nothing is reset — the ranks were never removed, so the reawakening does not
 * touch them, and the Ten I a standard awakening grants is skipped outright
 * for somebody who already holds Ten.
 *
 * The reawakening ROUTES live in transitions.ts and exceptional.ts, because a
 * reawakening is an awakening: the same four functions, with a hurdle. What
 * lives here is the reversion, the hurdle arithmetic a caller needs to quote a
 * duration or an odds figure before committing, and the check that access
 * really did come back.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import { createTraceNode } from "../../infrastructure/trace";
import { transitionOutcome } from "../../runtime/transition";

import {
  deriveAbruptReawakeningOdds,
  reawakeningStandardDuration,
  type AbruptAwakeningOdds,
} from "../foundation/nen/awakening/calculations";
import {
  isAwakened,
  isProvenanceLinkedNaturalAbility,
} from "../foundation/nen/awakening/state";
import type {
  NenReawakeningHurdle,
  NenReversionRecord,
} from "../foundation/nen/awakening/types";
import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import { deriveEffectiveNenMastery, validateNenState } from "../foundation/nen/nen";
import { NEN_PRINCIPLE_IDS } from "../foundation/nen/nen";
import type { NenMasteryRank, NenPrincipleId, NenState } from "../foundation/nen/types";
import { isNenType } from "../foundation/nen/nen-type";
import type { Attributes } from "../foundation/attributes/types";

import { isNenUncontained } from "./access";
import { emitContextOf, failAwakening } from "./preflight";
import {
  noAwakeningChanges,
  type NenAwakeningChanges,
  type NenAwakeningContext,
  type NenAwakeningEvent,
  type NenAwakeningTransitionResult,
  type NenReversionRequest,
} from "./protocol";
import {
  applyNenTypeChange,
  awakeningEvent,
  closeNodes,
  conditionRequest,
  LEAKING_CONDITION_ID,
  reversionRecordId,
  sequenceAwakeningEvents,
} from "./settlement";


/* ── Reversion ──────────────────────────────────────────────────────────── */

function sourceIssues(
  source: ContributionSourceRef | undefined,
): readonly EngineError[] {
  if (
    source !== undefined &&
    typeof source.type === "string" &&
    source.type.trim().length > 0 &&
    typeof source.id === "string" &&
    source.id.trim().length > 0
  ) {
    return [];
  }

  return [{
    code: "nen.reversion.source.missing",
    message:
      "Reversion is exceptional and must name the source that caused it.",
    audience: "developer",
    required: "{ type, id }",
    actual: source === undefined ? "absent" : String(source),
  }];
}


/**
 * Revert an awakened character: half-open, no access, everything else kept.
 *
 * Atomic like every other transition here. The Ability removal, the node
 * closure, the forced-state teardown and the history entry are one value, so a
 * refusal at validation leaves the caller holding exactly what they passed in
 * rather than a character who lost an Ability and stayed awakened.
 */
export function revertNen(
  context: NenAwakeningContext,
  request: NenReversionRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const root = createTraceNode({
    id: "nen.reversion",
    label: "Revert an awakened character",
    formula:
      "reverted + half-open + no normal access; Mastery, history and external Abilities retained",
    inputs: {
      condition: { value: state.condition },
      source: { value: request.source?.id ?? "absent" },
      reason: { value: request.reason ?? "absent" },
    },
  });

  const issues: EngineError[] = [
    ...findAwakeningStateIssues(state),
  ];

  if (issues.length > 0) return failAwakening(root, issues);

  issues.push(...sourceIssues(request.source));

  if (typeof request.reason !== "string" || request.reason.trim().length === 0) {
    issues.push({
      code: "nen.reversion.reason.missing",
      message: "A reversion must record why it happened.",
      audience: "developer",
      required: "non-empty string",
      actual: String(request.reason),
    });
  }

  if (!isAwakened(state)) {
    issues.push({
      code: "nen.reversion.not-awakened",
      message: "Only an awakened character can be reverted.",
      audience: "player",
      required: "an awakened character",
      actual: state.condition,
    });
  }

  /*
   * A Nen Type change is EXPLICIT or absent. A reversion that silently
   * shuffled a character's affinity would be the kind of side effect the
   * field-scoped override contract exists to make impossible.
   */
  const typeChange = request.nenTypeChange;

  if (typeChange !== undefined) {
    if (!isNenType(typeChange.next)) {
      issues.push({
        code: "nen.reversion.type-change.invalid",
        message: "A Nen Type change must name one of the six Nen Types.",
        audience: "developer",
        required: "a Nen Type",
        actual: String(typeChange.next),
      });
    }

    if (
      typeof typeChange.cause !== "string" ||
      typeChange.cause.trim().length === 0
    ) {
      issues.push({
        code: "nen.reversion.type-change.unexplained",
        message: "A Nen Type change must record what caused it.",
        audience: "developer",
        required: "non-empty string",
        actual: String(typeChange.cause),
      });
    }

    /*
     * The "previous" it records has to be the type the character actually had.
     * A source that names a different one is describing somebody else, and the
     * record would be a false account of the change.
     */
    if (
      typeChange.previous !== undefined &&
      typeChange.previous !== state.nenType.type
    ) {
      issues.push({
        code: "nen.reversion.type-change.previous.mismatch",
        message:
          "A Nen Type change records a previous type this character did not have.",
        audience: "developer",
        required: String(state.nenType.type),
        actual: String(typeChange.previous),
      });
    }
  }

  if (issues.length > 0) return failAwakening(root, issues);

  /*
   * PROVENANCE, not resemblance. The Ability is removed only when its record
   * names an awakening that is in this character's own history.
   */
  const natural = state.naturalAbility;

  const removesNatural =
    natural !== null &&
    isProvenanceLinkedNaturalAbility(state, natural.abilityId);

  /*
   * External Abilities survive unless the source NAMED them. An id that is not
   * on the character is refused rather than ignored: a source that thinks it is
   * removing something must not be told it succeeded.
   */
  const targeted = request.targetedExternalAbilityIds ?? [];
  const heldExternalIds = state.externalAbilities.map((one) => one.abilityId);

  const unknownTargets = targeted.filter((id) => !heldExternalIds.includes(id));

  if (unknownTargets.length > 0) {
    return failAwakening(root, [{
      code: "nen.reversion.targeted-ability.unknown",
      message:
        "A reverting source targeted an external Ability this character does not have.",
      audience: "developer",
      required: "an Ability held by this character",
      actual: unknownTargets,
    }]);
  }

  const remainingExternalIds = heldExternalIds.filter(
    (id) => !targeted.includes(id),
  );

  const record: NenReversionRecord = {
    kind: "reversion",
    id: reversionRecordId(context.operationId),
    occurredAt: context.occurredAt,
    source: request.source,
    removedNaturalAbilityId: removesNatural ? natural.abilityId : null,
    ...(typeChange === undefined ? {} : { nenTypeChange: typeChange }),
  };

  const releasedForcedStateIds = state.forcedStates.map((forced) => forced.id);

  const next: NenState = {
    ...context.nen,

    /*
     * The Mastery record is passed through UNTOUCHED — not filtered, not
     * zeroed, not recomputed. What changes is reachability, and that is
     * derived: deriveEffectiveNenMastery returns 0 for a reverted character
     * while deriveMaximumNenMastery still returns what they trained for.
     */
    awakening: closeNodes({
      state,
      record,
      removeNaturalAbility: removesNatural,
      remainingExternalAbilityIds: remainingExternalIds,
      nenType: applyNenTypeChange(state.nenType, typeChange),
    }),
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = emitContextOf(context);

  /*
   * Reported as a STOP only if there was a leak to stop.
   *
   * A character reverted out of a forced Zetsu, or one who had learned Ten,
   * was not leaking, and saying their leak stopped would be reporting an event
   * that did not happen.
   */
  const wasLeaking = isNenUncontained(context.nen);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    condition: "reverted",
    nodesClosed: true,
    leakageStopped: wasLeaking,
    forcedStatesReleased: releasedForcedStateIds,
    naturalAbilityLost: removesNatural ? natural.abilityId : null,
    externalAbilitiesLost: targeted,
    nenTypeChange: typeChange ?? null,
  };

  root.output = {
    condition: "reverted",
    naturalAbilityLost: changes.naturalAbilityLost,
    externalAbilitiesLost: targeted.length,
    masteryRetained: retainedMasteryRanks(next).length,
  };

  const events: NenAwakeningEvent[] = [
    awakeningEvent(emit, "nen-reverted", record.id),
    awakeningEvent(emit, "nen-nodes-closed", record.id),
  ];

  for (const forcedId of releasedForcedStateIds) {
    events.push(awakeningEvent(emit, "nen-forced-zetsu-released", forcedId));
  }

  if (wasLeaking) {
    events.push(awakeningEvent(emit, "nen-leakage-stopped", record.id));
  }

  if (changes.naturalAbilityLost !== null) {
    events.push(
      awakeningEvent(
        emit,
        "nen-natural-ability-lost",
        changes.naturalAbilityLost,
      ),
    );
  }

  if (typeChange !== undefined) {
    events.push(awakeningEvent(emit, "nen-type-changed", typeChange.next));
  }

  return {
    success: true,
    payload: transitionOutcome(
      next,
      changes,
      sequenceAwakeningEvents(events),
      wasLeaking
        ? [conditionRequest(
          emit,
          false,
          LEAKING_CONDITION_ID,
          "Reverted: the nodes are half-open again.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}


/* ── Retained mastery ───────────────────────────────────────────────────── */

export interface RetainedNenMastery {
  readonly principleId: NenPrincipleId;

  /** What the character permanently knows. Unchanged by reversion. */
  readonly rank: NenMasteryRank;

  /** What they can use right now. Zero for as long as they stay reverted. */
  readonly usable: NenMasteryRank;
}


/**
 * Every principle the character permanently holds, with what they can use.
 *
 * The pair is the entire point. A reverted character reads as rank V, usable
 * 0; the same character after reawakening reads V and V, with nothing having
 * been written to the Mastery record in between — which is what "restores
 * access without relearning, duplicating or resetting" means when you look at
 * the actual data.
 */
export function retainedMasteryRanks(
  nen: NenState,
): readonly RetainedNenMastery[] {
  const retained: RetainedNenMastery[] = [];

  for (const principleId of NEN_PRINCIPLE_IDS) {
    const rank = nen.mastery[principleId];

    if (rank === 0) continue;

    retained.push({
      principleId,
      rank,
      usable: deriveEffectiveNenMastery(nen, principleId),
    });
  }

  return retained;
}


/**
 * Whether a reawakening actually gave the character their Mastery back.
 *
 * A check rather than a claim: it compares what they permanently hold against
 * what they can now use, principle by principle. If a reawakening had reset or
 * duplicated anything, these two would stop agreeing.
 */
export function masteryFullyRestored(nen: NenState): boolean {
  return retainedMasteryRanks(nen).every(
    (entry) => entry.usable === entry.rank,
  );
}


/* ── Hurdle arithmetic a caller needs before committing ─────────────────── */

/**
 * How long a standard reawakening takes, from a supplied base duration.
 *
 * The BASE is supplied because there is no universal standard-awakening
 * duration in the rules — it is a training outcome the content and GM workflow
 * produce — and a constant here would be the engine deciding a number that was
 * deliberately left open. An ideal hurdle is exactly a tenth of whatever was
 * supplied.
 */
export function projectStandardReawakeningDuration(
  baseDurationHours: number,
  hurdle: NenReawakeningHurdle,
): number {
  return reawakeningStandardDuration(baseDurationHours, hurdle);
}


/**
 * The odds and probability an abrupt reawakening would face.
 *
 * Quotable before anything is committed, and identical to what the transition
 * will compute — it calls the same function. At exactly the standard
 * thresholds with an ideal hurdle this is odds 1.5 x 2 = 3, which is 75%.
 */
export function projectAbruptReawakeningOdds(
  attributes: Attributes,
  hurdle: NenReawakeningHurdle,
): AbruptAwakeningOdds {
  return deriveAbruptReawakeningOdds(attributes, hurdle);
}
