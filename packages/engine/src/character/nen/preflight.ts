/*
 * What every awakening route checks before it does anything, and how all four
 * of them report the same facts.
 *
 * Lifted out of the standard/abrupt file the moment the instinctive and
 * exceptional routes needed it. The alternative was four copies of "is this
 * character already awakened", and the fourth copy is the one that forgets
 * that a reverted character may reawaken.
 *
 * Nothing here decides a route's own rules. It answers the questions that are
 * true of awakening as such: is the stored state readable, is the character in
 * a condition that can be awakened, does the hurdle belong, what did the
 * eligibility bundle conclude, and which events does a successful opening owe.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type { NonEmptyArray } from "../../infrastructure/result";
import type { TraceNode } from "../../infrastructure/trace";
import { isRuntimeOwnerRef } from "../../runtime/domains";
import type { RuntimeEvent } from "../../runtime/events";

import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import type {
  NenAwakeningRecord,
  NenAwakeningState,
} from "../foundation/nen/awakening/types";

import { unmetRequirements, type NenEligibilityReport } from "./eligibility";
import type {
  NenAwakeningChanges,
  NenAwakeningContext,
  NenAwakeningEvent,
  NenAwakeningTransitionResult,
} from "./protocol";
import {
  awakeningEvent,
  isReawakening,
  sequenceAwakeningEvents,
  type EmitContext,
} from "./settlement";


/** A refusal: no state changed, and the trace still says how far it got. */
export function failAwakening(
  root: TraceNode,
  errors: readonly EngineError[],
): NenAwakeningTransitionResult {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as readonly EngineError[] as NonEmptyArray<EngineError>,
  };
}


export function emitContextOf(context: NenAwakeningContext): EmitContext {
  return {
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    owner: context.owner,
  };
}


/*
 * Everything true of every route, checked before any route's own rules.
 *
 * The stored state is validated FIRST and unconditionally. A transition that
 * read a malformed awakening state would be deciding from a shape nobody has
 * checked — and would then write a new state built out of it, laundering the
 * corruption into something that looks engine-produced.
 */
export function findCommonAwakeningIssues(
  context: NenAwakeningContext,
  hurdleSupplied: boolean,
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findAwakeningStateIssues(context.nen.awakening),
  ];

  if (errors.length > 0) return errors;

  /*
   * WHOSE awakening, and which operation.
   *
   * Checked here rather than left to the coordinator, because every event and
   * request this transition emits is built from these three values. A
   * malformed owner produces a malformed request that is refused at dispatch —
   * after the state has already changed, which is exactly the ordering the
   * validate-before-mutate rule exists to prevent.
   */
  if (!isRuntimeOwnerRef(context.owner)) {
    errors.push({
      code: "nen.awakening.owner.invalid",
      message: "An awakening must name the owner it belongs to.",
      audience: "developer",
      required: "{ domain, id }",
      actual: String(context.owner),
    });
  }

  if (
    typeof context.operationId !== "string" ||
    context.operationId.trim().length === 0
  ) {
    errors.push({
      code: "nen.awakening.operation.invalid",
      message: "An awakening must belong to a named operation.",
      audience: "developer",
      required: "non-empty string",
      actual: String(context.operationId),
    });
  }

  if (!Number.isFinite(context.occurredAt)) {
    errors.push({
      code: "nen.awakening.timestamp.invalid",
      message: "An awakening must happen at a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: String(context.occurredAt),
    });
  }

  if (errors.length > 0) return errors;

  const state = context.nen.awakening;

  if (state.condition === "awakened") {
    errors.push({
      code: "nen.awakening.already-awakened",
      message: "This character's Nen is already awakened.",
      audience: "player",
      required: "an unawakened or reverted character",
      actual: state.condition,
    });
  }

  /*
   * A hurdle describes how hard it is to come BACK, so it is meaningless on a
   * first awakening and mandatory on a return. Defaulting a missing one would
   * be the engine choosing how hard a character's reawakening is, which is a
   * GM and content judgement.
   */
  const reawakening = isReawakening(state);

  if (reawakening && !hurdleSupplied) {
    errors.push({
      code: "nen.awakening.hurdle.required",
      message: "Reawakening a reverted character requires a stated hurdle.",
      audience: "developer",
      required: "ideal | minor | moderate | severe | critical | catastrophic",
      actual: "absent",
    });
  }

  if (!reawakening && hurdleSupplied) {
    errors.push({
      code: "nen.awakening.hurdle.unexpected",
      message: "A first awakening has no reawakening hurdle to apply.",
      audience: "developer",
      required: "no hurdle",
      actual: "a hurdle",
    });
  }

  return errors;
}


/*
 * Turn an eligibility verdict into a refusal, preserving `unresolved`.
 *
 * Two codes rather than one, because the remedies differ completely: an
 * unsatisfied threshold is something the character can go and train, and an
 * unresolved one is a sheet that has not recorded the Attributes being asked
 * about. A single "not eligible" would send a player to the gym over a data
 * entry problem.
 */
export function eligibilityIssues(
  report: NenEligibilityReport,
  required: string,
): readonly EngineError[] {
  if (report.disposition === "satisfied") return [];

  const unmet = unmetRequirements(report).map((resolution) => ({
    id: resolution.id,
    disposition: resolution.disposition,
    ...(resolution.summary === undefined ? {} : { summary: resolution.summary }),
  }));

  if (report.disposition === "unresolved") {
    return [{
      code: "nen.awakening.eligibility.unresolved",
      message:
        "Whether this character meets the awakening requirements cannot be established.",
      audience: "developer",
      required: "a requirement context recording the facts being checked",
      actual: unmet,
    }];
  }

  return [{
    code: "nen.awakening.eligibility.unsatisfied",
    message: "This character does not meet the awakening requirements.",
    audience: "player",
    required,
    actual: unmet,
  }];
}


/*
 * Whether this character was actually producing pseudo-Chu before the change.
 *
 * Asked rather than assumed, because a REawakening ends nothing — awakening
 * already ended it the first time and reversion did not give it back. An event
 * saying otherwise would be reporting a loss the character did not suffer.
 */
export function wasProducingPseudoChu(state: NenAwakeningState): boolean {
  return state.condition === "unawakened" && state.history.length === 0;
}


export interface AwakenedEventsInput {
  readonly emit: EmitContext;
  readonly record: NenAwakeningRecord;
  readonly pseudoChuEnded: boolean;
  readonly masteryGranted: NenAwakeningChanges["masteryGranted"];
  readonly leaking: boolean;
  readonly forcedStateIds: readonly string[];
  readonly naturalAbilityGranted: string | null;
  readonly nenTypeChanged: boolean;
}


/**
 * The events a successful awakening produces, in RULE order.
 *
 * The order is a fact about the mechanism rather than a formatting choice: the
 * nodes open, and the pseudo-Chu ends BECAUSE they opened; the forced Zetsu is
 * applied after the opening it is a reaction to; the leak starts last because
 * whether there is one depends on everything before it. A log that reported
 * them in another order would be describing a different mechanism.
 */
export function awakenedEvents(
  input: AwakenedEventsInput,
): readonly RuntimeEvent[] {
  const { emit, record } = input;

  const events: NenAwakeningEvent[] = [
    awakeningEvent(emit, "nen-awakened", record.id),
    awakeningEvent(emit, "nen-nodes-opened", record.id),
  ];

  if (input.pseudoChuEnded) {
    events.push(awakeningEvent(emit, "nen-pseudo-chu-ended", record.id));
  }

  for (const grant of input.masteryGranted) {
    events.push(
      awakeningEvent(
        emit,
        "nen-mastery-granted",
        `${grant.principleId}:${grant.rank}`,
      ),
    );
  }

  if (input.naturalAbilityGranted !== null) {
    events.push(
      awakeningEvent(
        emit,
        "nen-natural-ability-granted",
        input.naturalAbilityGranted,
      ),
    );
  }

  if (input.nenTypeChanged) {
    events.push(awakeningEvent(emit, "nen-type-changed", record.id));
  }

  for (const forcedId of input.forcedStateIds) {
    events.push(awakeningEvent(emit, "nen-forced-zetsu-applied", forcedId));
  }

  if (record.reawakening) {
    events.push(awakeningEvent(emit, "nen-reawakened", record.id));
  }

  if (input.leaking) {
    events.push(awakeningEvent(emit, "nen-leakage-started", record.id));
  }

  return sequenceAwakeningEvents(events);
}
