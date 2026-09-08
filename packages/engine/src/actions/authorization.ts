/*
 * What a scheduler is allowed to be told.
 *
 * Combat used to be handed a raw ActionProfile and ActionIntent and asked to
 * work out for itself whether they were usable. Three things were wrong with
 * that, and they compound.
 *
 * It re-checked rules that had already been decided, so a GM who overruled
 * "you cannot use that as a Reaction" watched Combat overrule them back.
 * It had no evidence that preparation or adjudication had happened at all —
 * a caller could skip both and schedule anything. And handing over the whole
 * profile and intent meant handing over the goal, the focus, the check and
 * the consequences, none of which a scheduler has any business reading.
 *
 * A ScheduledActionAuthorization is the narrow answer: the finalized facts a
 * scheduler needs and nothing else. It is produced HERE, from an adjudicated
 * action, because only this layer knows what the GM settled.
 *
 *
 * WHAT IT IS AND IS NOT
 *
 * It is VALIDATED DATA, not unforgeable evidence. It is a plain readonly
 * object so it can cross a serialization boundary — a host may persist one,
 * send it over a wire, and hand it back — and anything a caller can build by
 * hand, a caller can build wrong. Producing one through this function is
 * therefore not a proof that adjudication ran; it is a proof that whatever
 * arrived here was internally consistent when it did.
 *
 * That is why the consumer validates too. The scheduler re-checks the
 * authorization's identifiers, actor, timing, cost, targets and threat
 * declaration at its own boundary rather than trusting the type. Two
 * independent checks on a mutable record is the honest arrangement; a single
 * check plus a comment claiming the object cannot be forged is not.
 *
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No secret rolls, no GM reasoning, no private diagnostics, no consequences,
 * no Character data, no runtime owner state. A scheduler that cannot see
 * those cannot leak them, and the visibility work in the adjudication ticket
 * is worth nothing if the next layer down is handed the private view.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode } from "../infrastructure/trace";
import { findTargetIssues, type TargetRef } from "../targeting";

import {
  findStructuredActionCostIssues,
  type StructuredActionCost,
} from "./cost";
import type {
  ActionIntentId,
  ActionProfileId,
  ActorRef,
} from "./identity";
import { findActorIssues } from "./identity";
import {
  THREAT_DECLARATIONS,
  isThreatDeclaration,
  type ThreatDeclaration,
} from "./profile";
import type { ProposalDisposition } from "./proposal";
import { isActionTiming, type ActionTiming } from "./timing";
import type { AdjudicatedAction } from "./visibility";


/*
 * Dispositions that cannot be scheduled.
 *
 * The same three settlement refuses, and for the same reason: a definite
 * refusal and an unanswered question both stop before anything is spent. A
 * GM who wants to schedule anyway overrides the finding, which leaves a
 * record.
 */
const UNSCHEDULABLE: readonly ProposalDisposition[] = [
  "ineligible",
  "spatially-invalid",
  "missing-facts",
];


export interface ScheduledActionAuthorization {
  readonly operationId: string;

  readonly intentId: ActionIntentId;
  readonly profileId: ActionProfileId;

  /** Who acts. A scheduler maps this to its own participant, not the reverse. */
  readonly actor: ActorRef;

  /** The timing the GM left standing. Not re-derived from the profile. */
  readonly timing: ActionTiming;

  /** What the Action economy charges. Not re-read from the profile. */
  readonly structuredActionCost: StructuredActionCost;

  /**
   * The subjects the intent declared.
   *
   * Carried so a scheduler can map them onto its own participants — which is
   * the only reason it needs them. They are NOT a licence to invent more:
   * see `threatens`.
   */
  readonly declaredTargets: readonly TargetRef[];

  /**
   * Whether using this endangers those declared targets.
   *
   * The whole of the action-side threat rule. "none" means no Reaction
   * opportunity arises from this action however it turns out, and
   * "declared-targets" means exactly the subjects above and no others.
   * Anything a scheduler adds to that would be a threat nobody authored.
   */
  readonly threatens: ThreatDeclaration;
}


export interface AuthorizeActionInput {
  readonly adjudicated: AdjudicatedAction;

  /** Must match the adjudication's. A mismatch is corruption, not a ruling. */
  readonly operationId: string;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}


function identifierIssue(
  value: unknown,
  code: string,
  what: string,
): EngineError | undefined {
  if (nonEmpty(value)) return undefined;

  return {
    code,
    message: `${what} must be identified.`,
    audience: "developer",
    required: "non-empty identifier",
    actual: value === undefined ? "absent" : String(value),
  };
}


/**
 * Everything wrong with an authorization, if anything is.
 *
 * Takes `unknown` on purpose. An authorization is ordinary serializable data
 * — a host may persist one and hand it back — so what arrives at a consumer
 * may be null, a string, a partially-populated object, or a record whose
 * actor is null. A validator that assumed the declared shape would throw on
 * exactly the inputs it exists to reject, and a thrown error at a scheduling
 * boundary is worse than a refusal: it escapes the result type every other
 * failure travels in.
 *
 * So every field is reached defensively and every problem comes back as a
 * diagnostic.
 */
export function findAuthorizationIssues(
  authorization: unknown,
): readonly EngineError[] {
  if (!isRecord(authorization)) {
    return [{
      code: "actions.authorization.malformed",
      message: "An authorization must be an object.",
      audience: "developer",
      required: "a ScheduledActionAuthorization",
      actual: authorization === null ? "null" : typeof authorization,
    }];
  }

  const errors: EngineError[] = [];

  for (
    const [key, code, what] of [
      ["operationId", "actions.authorization.operation.missing", "An authorization's operation"],
      ["intentId", "actions.authorization.intent.missing", "The intent"],
      ["profileId", "actions.authorization.profile.missing", "The profile"],
    ] as const
  ) {
    const issue = identifierIssue(authorization[key], code, what);

    if (issue !== undefined) errors.push(issue);
  }

  const actor = authorization["actor"];

  if (!isRecord(actor)) {
    errors.push({
      code: "actions.authorization.actor.malformed",
      message: "An authorization must carry an actor.",
      audience: "developer",
      required: "an actor reference",
      actual: actor === null ? "null" : typeof actor,
    });
  } else {
    errors.push(...findActorIssues(actor as unknown as ActorRef));
  }

  if (!isActionTiming(authorization["timing"])) {
    errors.push({
      code: "actions.authorization.timing.invalid",
      message: "The finalized timing is not a known Action timing.",
      audience: "developer",
      required: "action or reaction",
      actual: String(authorization["timing"]),
    });
  }

  const cost = authorization["structuredActionCost"];

  if (!isRecord(cost)) {
    errors.push({
      code: "actions.authorization.cost.invalid",
      message: "An authorization must carry a structured Action cost.",
      audience: "developer",
      required: "a structured Action cost",
      actual: cost === null ? "null" : typeof cost,
    });
  } else {
    errors.push(...findStructuredActionCostIssues(
      cost as unknown as StructuredActionCost,
    ).map((issue) => ({
      ...issue,
      code: "actions.authorization.cost.invalid",
    })));
  }

  if (!isThreatDeclaration(authorization["threatens"])) {
    errors.push({
      code: "actions.authorization.threatens.invalid",
      message: "The finalized threat declaration is not a known one.",
      audience: "developer",
      required: [...THREAT_DECLARATIONS],
      actual: String(authorization["threatens"]),
    });
  }

  const targets = authorization["declaredTargets"];

  if (!Array.isArray(targets)) {
    errors.push({
      code: "actions.authorization.targets.invalid",
      message: "An authorization's declared targets must be a list.",
      audience: "developer",
      required: "an array of targets",
      actual: targets === null ? "null" : typeof targets,
    });

    return errors;
  }

  /*
   * Handed straight through as `unknown`. findTargetIssues() guards its own
   * structure and every nested position, area and direction below it, so
   * nothing here casts an unverified record into a trusted shape on the way
   * past — which is how a null centre used to reach a dereference.
   */
  for (const target of targets) {
    errors.push(...findTargetIssues(target));
  }

  return errors;
}


/**
 * Narrow an adjudicated action down to what a scheduler may see.
 *
 * Refuses technical-invalid input rather than passing it on: an
 * authorization is evidence, and evidence that might be malformed is worth
 * less than none.
 */
export function authorizeScheduledAction(
  input: AuthorizeActionInput,
): EngineResult<ScheduledActionAuthorization> {
  const { gm } = input.adjudicated;
  const { proposal } = gm;

  const errors: EngineError[] = [];

  for (
    const [value, code, what] of [
      [input.operationId, "actions.authorization.operation.missing", "An authorization's operation"],
      [proposal.intentId, "actions.authorization.intent.missing", "The intent"],
      [proposal.profileId, "actions.authorization.profile.missing", "The profile"],
    ] as const
  ) {
    const issue = identifierIssue(value, code, what);

    if (issue !== undefined) errors.push(issue);
  }

  if (
    nonEmpty(input.operationId) &&
    input.operationId !== proposal.operationId
  ) {
    errors.push({
      code: "actions.authorization.operation.mismatch",
      message: "This authorization names a different operation from its adjudication.",
      audience: "developer",
      required: proposal.operationId,
      actual: input.operationId,
    });
  }

  errors.push(...findActorIssues(proposal.actor));

  /*
   * The operation id has to be the same everywhere it appears. The proposal,
   * the GM view and the public view are assembled separately, and a
   * disagreement between them means one of the three describes a different
   * operation than the caller believes.
   */
  for (
    const [value, where] of [
      [gm.operationId, "the GM view"],
      [input.adjudicated.public.operationId, "the public view"],
    ] as const
  ) {
    if (value !== proposal.operationId) {
      errors.push({
        code: "actions.authorization.operation.mismatch",
        message: `The operation on ${where} does not match the proposal's.`,
        audience: "developer",
        required: proposal.operationId,
        actual: String(value),
      });
    }
  }

  /*
   * The timing has to be structured, because scheduling IS the structured
   * case. An intent prepared for unstructured time is perfectly valid and
   * simply is not the thing being scheduled.
   */
  const context = proposal.executionContext;

  if (context.kind !== "structured") {
    errors.push({
      code: "actions.authorization.timing.unstructured",
      message: "Only an action prepared for structured time can be scheduled.",
      audience: "developer",
      required: "a structured execution context",
      actual: context.kind,
    });
  } else if (!isActionTiming(context.timing)) {
    errors.push({
      code: "actions.authorization.timing.invalid",
      message: "The finalized timing is not a known Action timing.",
      audience: "developer",
      required: "action or reaction",
      actual: String(context.timing),
    });
  }

  errors.push(...findStructuredActionCostIssues(gm.structuredActionCost).map(
    (issue) => ({
      ...issue,
      code: "actions.authorization.cost.invalid",
    }),
  ));

  const threatens = proposal.threatens ?? "none";

  if (!isThreatDeclaration(threatens)) {
    errors.push({
      code: "actions.authorization.threatens.invalid",
      message: "The finalized threat declaration is not a known one.",
      audience: "developer",
      required: [...THREAT_DECLARATIONS],
      actual: String(threatens),
    });
  }

  if (UNSCHEDULABLE.includes(gm.disposition)) {
    errors.push({
      code: "actions.authorization.disposition.not-schedulable",
      message: `An action that is ${gm.disposition} cannot be scheduled.`,
      audience: "gm",
      required: "a schedulable disposition",
      actual: gm.disposition,
    });
  }

  const [first, ...rest] = errors;

  const trace = {
    root: createTraceNode({
      id: "actions.authorization",
      label: "Authorize a scheduled action",
      formula: "finalized facts only; nothing private crosses",
      inputs: {
        intent: { value: String(proposal.intentId) },
        profile: { value: String(proposal.profileId) },
        disposition: { value: gm.disposition },
      },
      output: first === undefined ? "authorized" : first.code,
    }),
  };

  if (first !== undefined) {
    return engineFailure(trace, [first, ...rest] as NonEmptyArray<EngineError>);
  }

  return engineSuccess({
    operationId: proposal.operationId,
    intentId: proposal.intentId,
    profileId: proposal.profileId,
    actor: proposal.actor,
    timing: (context as { readonly timing: ActionTiming }).timing,
    structuredActionCost: gm.structuredActionCost,
    declaredTargets: [...proposal.declaredTargets],
    threatens,
  }, trace);
}
