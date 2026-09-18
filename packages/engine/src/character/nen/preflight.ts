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

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { NonEmptyArray } from "../../infrastructure/result";
import type { TraceNode } from "../../infrastructure/trace";
import { isRuntimeOwnerRef } from "../../runtime/domains";
import { findRequirementContextIssues } from "../rules/resolution";
import { findNamedRequirementsValidationIssues } from "../rules/validation";
import type { RuntimeEvent } from "../../runtime/events";

import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import type {
  NenAwakeningMethod,
  NenAwakeningRecord,
  NenAwakeningState,
} from "../foundation/nen/awakening/types";

import { unmetRequirements, type NenEligibilityReport } from "./eligibility";
import { suppressionEventKind } from "./protocol";
import type {
  NenAwakeningChanges,
  NenAwakeningContext,
  NenAwakeningEvent,
  NenAwakeningTransitionResult,
  NenSuppressionRef,
} from "./protocol";
import {
  awakeningEvent,
  isReawakening,
  sequenceAwakeningEvents,
  type EmitContext,
} from "./settlement";


/*
 * The REQUEST, judged before a single field of it is read.
 *
 * Including by the trace. Every transition built its trace node from request
 * fields as its first statement — `request.hurdle ?? "none"`, `request.actor
 * ?.ref?.id` — so a null request threw before any validator ran, out of a
 * function whose contract is that it returns diagnostics. Optional chaining at
 * each read site would have papered over it one field at a time; this refuses
 * the request once, at the top, and the trace is only populated afterwards.
 *
 * `expectedMethod` checks the discriminant against the ROUTE that was called.
 * `awakenNenStandard(context, abruptRequest)` is a caller who has wired up the
 * wrong function, and honouring the shape while ignoring the label it carries
 * would resolve it as a standard awakening — silently, and with no roll.
 */
export function findAwakeningRequestIssues(
  request: unknown,
  expectedMethod: NenAwakeningMethod,
): readonly EngineError[] {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    return [{
      code: "nen.awakening.request.invalid",
      message: `A ${expectedMethod} awakening request must be a record.`,
      audience: "developer",
      required: `{ method: "${expectedMethod}", ... }`,
      actual: describeDiagnosticValue(request),
    }];
  }

  const method = (request as { method?: unknown }).method;

  if (method !== expectedMethod) {
    return [{
      code: "nen.awakening.request.method.mismatch",
      message:
        `This route resolves ${expectedMethod} awakenings; the request names a different one.`,
      audience: "developer",
      required: expectedMethod,
      actual: describeDiagnosticValue(method),
    }];
  }

  return [];
}


/** The same structural gate for a request that carries no method discriminant. */
export function findRequestShapeIssues(
  request: unknown,
  code: string,
  message: string,
  required: string,
): readonly EngineError[] {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    return [{
      code,
      message,
      audience: "developer",
      required,
      actual: describeDiagnosticValue(request),
    }];
  }

  return [];
}


/*
 * WHOSE state, which operation, and when.
 *
 * The three values every event and request in this domain is built from.
 * `emitContextOf` copies them straight onto an EmitContext, `awakeningEvent`
 * puts the owner on the event as its target, and the request builders read
 * `owner.id` — so a malformed owner either emits an event addressed to nothing
 * or throws out of a request builder, in both cases AFTER the state has
 * already changed.
 *
 * Extracted from the awakening preflight because it was only ever called
 * there: reversion, collapse settlement, recovery advancement and suppression
 * release all skipped it, and `revertNen` with `owner: null` committed a
 * reverted character and emitted events targeting null without a single error.
 */
export function findRoutingMetadataIssues(
  context: Pick<NenAwakeningContext, "owner" | "operationId" | "occurredAt">,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isRuntimeOwnerRef(context?.owner)) {
    errors.push({
      code: "nen.awakening.owner.invalid",
      message: "A Nen transition must name the owner it belongs to.",
      audience: "developer",
      required: "{ domain, id }",
      actual: describeDiagnosticValue(context?.owner),
    });
  }

  if (
    typeof context?.operationId !== "string" ||
    context.operationId.trim().length === 0
  ) {
    errors.push({
      code: "nen.awakening.operation.invalid",
      message: "A Nen transition must belong to a named operation.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(context?.operationId),
    });
  }

  if (!Number.isFinite(context?.occurredAt)) {
    errors.push({
      code: "nen.awakening.timestamp.invalid",
      message: "A Nen transition must happen at a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: describeDiagnosticValue(context?.occurredAt),
    });
  }

  return errors;
}


/*
 * A requirement context, judged by the engine's own validator before anything
 * reads a field off it.
 *
 * Phase 5 skipped this everywhere, and the consequence was not theoretical:
 * `awakeningAttributes()` is `context.attributes[layer]`, and every eligibility
 * resolver hands the context to `resolveRequirement`, which reads
 * `context.attributes.base`. A context of `{}` therefore threw a TypeError out
 * of a transition whose contract is that it returns diagnostics.
 *
 * `findRequirementContextIssues` is the canonical validator — it takes
 * `unknown`, never throws, and is what every other consumer of the requirement
 * vocabulary uses. A Nen-specific copy would be a second opinion about what a
 * valid context is.
 *
 * This is a STRUCTURAL gate and nothing more. A well-formed context that
 * simply has not recorded the Techniques somebody holds is not malformed, and
 * must still resolve to `unresolved` rather than being refused here — which is
 * why the three dispositions are untouched below.
 */
export function findAwakeningRequirementContextIssues(
  value: unknown,
  path: string,
): readonly EngineError[] {
  const issues = findRequirementContextIssues(value, path);

  if (issues.length === 0) return [];

  return [{
    code: "nen.awakening.requirement-context.invalid",
    message:
      "A Nen transition was handed a requirement context it cannot read.",
    audience: "developer",
    required: "a well-formed requirement context",
    actual: issues.map((issue) => ({
      path: issue.path,
      expected: issue.expected,
    })),
  }];
}


/*
 * Authored requirements, judged before they are evaluated.
 *
 * A capability list, an eligibility override or an added prerequisite arrives
 * from content and from a host's catalog, so a `null` entry or a nested
 * malformed node is ordinary hostile input rather than a caller's typo.
 * `findNamedRequirementsValidationIssues` is the existing validator for
 * exactly this and reports rather than dereferences.
 */
export function findAwakeningRequirementIssues(
  requirements: unknown,
  path: string,
  code: string,
  message: string,
): readonly EngineError[] {
  const issues = findNamedRequirementsValidationIssues(requirements, path);

  if (issues.length === 0) return [];

  return [{
    code,
    message,
    audience: "developer",
    required: "a list of well-formed named requirements",
    actual: issues.map((issue) => ({ type: issue.type, path: issue.path })),
  }];
}


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

  errors.push(...findRoutingMetadataIssues(context));
  errors.push(...findAwakeningRequirementContextIssues(
    context.requirements,
    "context.requirements",
  ));

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
  readonly suppressionApplied: readonly NenSuppressionRef[];
  readonly naturalAbilityGranted: string | null;
  readonly affinityChanged: boolean;
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

  if (input.affinityChanged) {
    events.push(awakeningEvent(emit, "nen-affinity-changed", record.id));
  }

  for (const held of input.suppressionApplied) {
    events.push(
      awakeningEvent(emit, suppressionEventKind(held.kind, "applied"), held.id),
    );
  }

  if (record.reawakening) {
    events.push(awakeningEvent(emit, "nen-reawakened", record.id));
  }

  if (input.leaking) {
    events.push(awakeningEvent(emit, "nen-leakage-started", record.id));
  }

  return sequenceAwakeningEvents(events);
}
