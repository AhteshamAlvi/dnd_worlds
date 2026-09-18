/*
 * Assigning and discovering a character's affinity.
 *
 * Two transitions, and neither is an awakening. Both change `NenState.affinity`
 * and nothing else: no condition, no node state, no Mastery, no seal, no Aura
 * and no Ability identifier moves, whatever the character's condition is.
 *
 *
 * ASSIGNMENT: THE RECORD CATCHES UP WITH THE PERSON
 * -------------------------------------------------
 *
 * An unassigned affinity is legal — plenty of NPCs never need one — and a host
 * that later does need one assigns it here. That is a decision about the
 * RECORD, so it is allowed exactly once: an affinity already assigned is a fact
 * about the character, and overwriting it would be changing what they are.
 * That path exists, and it is an exceptional source's affinity change, which
 * records what the affinity was, what it became and why.
 *
 *
 * DISCOVERY: THE PERSON CATCHES UP WITH THE RECORD
 * ------------------------------------------------
 *
 * Discovery flips `known` and nothing else. The affinity is not rerolled,
 * re-derived or re-read from the request: the request does not even carry one,
 * so it cannot. HOW it was discovered — a water divination, a teacher, an item
 * — is the host's business, which is why the source is supplied rather than
 * checked. Nothing here prescribes a check.
 *
 * Discovering what is already known is a stable no-op: success, the same
 * state object back, no events. A replay of a discovery changes nothing.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import type { NonEmptyArray } from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { RuntimeOwnerRef } from "../../runtime/domains";
import {
  transitionOutcome,
  type TransitionResult,
} from "../../runtime/transition";
import type { GameTimestamp } from "../../time/types";

import { validateNenState } from "../foundation/nen/nen";
import {
  assignedNenAffinity,
  findNenAffinityIssues,
  type NenAffinity,
  type NenAffinityKnowledge,
} from "../foundation/nen/nen-type";
import type { NenState } from "../foundation/nen/types";

import { findRequestShapeIssues, findRoutingMetadataIssues } from "./preflight";
import { awakeningEvent, sequenceAwakeningEvents } from "./settlement";


/*
 * Whose affinity, which operation, and when. No requirement context: neither
 * transition has a threshold to judge.
 */
export interface NenAffinityContext {
  readonly owner: RuntimeOwnerRef;
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;
  readonly nen: NenState;
}


export interface NenAffinityAssignmentRequest {
  /** The complete affinity, lean included. `leaning: null` is a statement. */
  readonly affinity: NenAffinity;

  /** Whether the character knows it from the moment it is recorded. */
  readonly known: boolean;

  /** Who or what decided it. */
  readonly source: ContributionSourceRef;
  readonly reason: string;
}


export interface NenAffinityDiscoveryRequest {
  /** What established it: a divination, a teacher, an item. Never checked. */
  readonly source: ContributionSourceRef;
  readonly reason: string;
}


export interface NenAffinityChanges {
  readonly previous: NenAffinityKnowledge;
  readonly affinity: NenAffinityKnowledge;

  readonly assigned: boolean;
  readonly discovered: boolean;

  readonly source: ContributionSourceRef;
  readonly reason: string;
}


export type NenAffinityTransitionResult = TransitionResult<
  NenState,
  NenAffinityChanges
>;


function fail(
  root: TraceNode,
  errors: readonly EngineError[],
): NenAffinityTransitionResult {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


function provenanceIssues(
  request: { readonly source?: unknown; readonly reason?: unknown },
  code: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const source = request.source as Partial<ContributionSourceRef> | null | undefined;

  if (
    source === null ||
    typeof source !== "object" ||
    typeof source.type !== "string" ||
    source.type.trim().length === 0 ||
    typeof source.id !== "string" ||
    source.id.trim().length === 0
  ) {
    errors.push({
      code: `${code}.source.missing`,
      message: "An affinity transition must name the source that authorized it.",
      audience: "developer",
      required: "{ type, id }",
      actual: describeDiagnosticValue(request.source),
    });
  }

  if (typeof request.reason !== "string" || request.reason.trim().length === 0) {
    errors.push({
      code: `${code}.reason.missing`,
      message: "An affinity transition must record why it happened.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(request.reason),
    });
  }

  return errors;
}


/*
 * The checks both transitions share: a readable request, routing metadata,
 * provenance, and a stored state the rules accept. The state is judged before
 * anything reads it, as every Nen transition does.
 */
function commonIssues(
  context: NenAffinityContext,
  request: unknown,
  code: string,
  required: string,
): readonly EngineError[] {
  const shape = findRequestShapeIssues(
    request,
    `${code}.request.invalid`,
    "An affinity request must be a record.",
    required,
  );

  if (shape.length > 0) return shape;

  const errors: EngineError[] = [
    ...findRoutingMetadataIssues(context),
    ...provenanceIssues(request as Record<string, unknown>, code),
  ];

  if (errors.length > 0) return errors;

  const valid = validateNenState(context.nen);

  return valid.success ? [] : valid.errors;
}


/**
 * Record an affinity for a character whose record has none.
 *
 * Refuses an affinity that is already assigned, known or not. Does not awaken
 * anybody and touches no Mastery.
 */
export function assignNenAffinity(
  context: NenAffinityContext,
  request: NenAffinityAssignmentRequest,
): NenAffinityTransitionResult {
  const root = createTraceNode({
    id: "nen.affinity.assign",
    label: "Assign a Nen affinity",
    formula: "unassigned -> assigned { affinity, known }; an assigned affinity is never overwritten here",
    inputs: {
      status: { value: describeDiagnosticValue(context?.nen?.affinity?.status) },
    },
  });

  const common = commonIssues(
    context,
    request,
    "nen.affinity.assign",
    "{ affinity, known, source, reason }",
  );

  if (common.length > 0) return fail(root, common);

  const errors: EngineError[] = [
    ...findNenAffinityIssues(request.affinity, "request.affinity"),
  ];

  if (typeof request.known !== "boolean") {
    errors.push({
      code: "nen.affinity.assign.known.invalid",
      message: "An assignment must say whether the character knows the affinity.",
      audience: "developer",
      required: "boolean",
      actual: describeDiagnosticValue(request.known),
    });
  }

  if (context.nen.affinity.status === "assigned") {
    errors.push({
      code: "nen.affinity.assign.already-assigned",
      message:
        "This character already has an assigned affinity. Changing it takes an exceptional source.",
      audience: "developer",
      required: 'affinity status "unassigned"',
      actual: "assigned",
    });
  }

  if (errors.length > 0) return fail(root, errors);

  const affinity = assignedNenAffinity(request.affinity, request.known);
  const next: NenState = { ...context.nen, affinity };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return fail(root, validated.errors);

  const changes: NenAffinityChanges = {
    previous: context.nen.affinity,
    affinity,
    assigned: true,
    discovered: false,
    source: request.source,
    reason: request.reason,
  };

  root.output = {
    primary: request.affinity.primary,
    leaning: describeDiagnosticValue(request.affinity.leaning),
    known: request.known,
  };

  return {
    success: true,
    payload: transitionOutcome(
      next,
      changes,
      sequenceAwakeningEvents([
        awakeningEvent(
          context,
          "nen-affinity-assigned",
          contributionSourceKey(request.source),
        ),
      ]),
    ),
    trace: { root },
    warnings: [],
  };
}


/**
 * Establish an assigned affinity: `known` becomes true, and nothing else moves.
 *
 * Refuses an unassigned record — there is nothing to discover. Already known is
 * success with no change and no events.
 */
export function discoverNenAffinity(
  context: NenAffinityContext,
  request: NenAffinityDiscoveryRequest,
): NenAffinityTransitionResult {
  const root = createTraceNode({
    id: "nen.affinity.discover",
    label: "Discover a Nen affinity",
    formula: "assigned { known: false } -> assigned { known: true }; the affinity itself is untouched",
    inputs: {
      status: { value: describeDiagnosticValue(context?.nen?.affinity?.status) },
    },
  });

  const common = commonIssues(
    context,
    request,
    "nen.affinity.discover",
    "{ source, reason }",
  );

  if (common.length > 0) return fail(root, common);

  const current = context.nen.affinity;

  if (current.status !== "assigned") {
    return fail(root, [{
      code: "nen.affinity.discover.unassigned",
      message:
        "This character's record has no assigned affinity to discover. Assign one first.",
      audience: "developer",
      required: 'affinity status "assigned"',
      actual: "unassigned",
    }]);
  }

  if (current.known) {
    root.output = { discovered: false, reason: "already known" };

    return {
      success: true,
      payload: transitionOutcome(context.nen, {
        previous: current,
        affinity: current,
        assigned: false,
        discovered: false,
        source: request.source,
        reason: request.reason,
      }),
      trace: { root },
      warnings: [],
    };
  }

  /* The SAME affinity object, carried across. Only the flag is new. */
  const affinity = assignedNenAffinity(current.affinity, true);
  const next: NenState = { ...context.nen, affinity };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return fail(root, validated.errors);

  root.output = { discovered: true, primary: current.affinity.primary };

  return {
    success: true,
    payload: transitionOutcome(
      next,
      {
        previous: current,
        affinity,
        assigned: false,
        discovered: true,
        source: request.source,
        reason: request.reason,
      },
      sequenceAwakeningEvents([
        awakeningEvent(
          context,
          "nen-affinity-discovered",
          contributionSourceKey(request.source),
        ),
      ]),
    ),
    trace: { root },
    warnings: [],
  };
}
