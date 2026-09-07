/*
 * The one place a finalized action becomes a change to the world.
 *
 *
 * FINALIZE FIRST, THEN COMMIT ONCE
 *
 * Settlement takes an ALREADY adjudicated action. Nothing here rolls, decides
 * or asks the GM anything — by the time this runs, the check has been
 * resolved with the effective dice, the GM has accepted, modified or replaced
 * the result, and the costs are whatever the GM left standing. Settlement's
 * whole job is to route that decision through the coordinator exactly once.
 *
 * No dice are supplied to the coordinator, deliberately. The check happened
 * during adjudication; handing the dice down again would give the operation a
 * second opportunity to roll, and the two answers would eventually differ in
 * a way nothing could reconcile after the fact.
 *
 *
 * WHAT REFUSES TO SETTLE
 *
 * A definite refusal, and an unanswered question, both stop before anything
 * commits: ineligible, spatially-invalid and missing-facts do not proceed. A
 * GM who wants to settle anyway has a way to do it that leaves a record —
 * override the finding — and that is the point. Silently committing an action
 * with an unresolved Range question would spend Aura on something nobody
 * established could happen.
 *
 * A MISS is not one of these. A resolved failure is a settled outcome, and it
 * still pays what it cost.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode, type TraceNode } from "../infrastructure/trace";
import type { RuntimeOperationContext } from "../runtime/context";
import {
  runCoordinatedOperation,
  type CoordinatorHandlers,
  type OwnerStates,
} from "../runtime/coordinator";
import type { RuntimeEvent } from "../runtime/events";
import type {
  RuntimeRequest,
  RuntimeRequestOutcome,
} from "../runtime/requests";
import type { TargetRef } from "../targeting";
import type { Consequence, HostFacingConsequence } from "./consequences";
import type { ProposalDisposition } from "./proposal";
import type {
  AdjudicatedAction,
  GmActionView,
  PublicActionView,
} from "./visibility";


/** Dispositions that stop before anything is charged. */
const UNSETTLEABLE: readonly ProposalDisposition[] = [
  "ineligible",
  "spatially-invalid",
  "missing-facts",
];


export interface SettlementInput {
  readonly adjudicated: AdjudicatedAction;

  readonly context: RuntimeOperationContext;

  /** The starting state of every owner that participates. */
  readonly states: OwnerStates;

  readonly handlers: CoordinatorHandlers;

  /** What the action causes, built through consequences.ts. */
  readonly consequences?: readonly Consequence[];
}


export interface SettledAction {
  readonly operationId: string;

  /** THE answer. The coordinator's returned state, not a side channel. */
  readonly states: OwnerStates;

  readonly events: readonly RuntimeEvent[];
  readonly costOutcomes: readonly RuntimeRequestOutcome[];
  readonly effectOutcomes: readonly RuntimeRequestOutcome[];

  /**
   * Changes the engine does not own, described precisely and handed back.
   *
   * Present on a SUCCESSFUL settlement. The engine did its job; the floor is
   * simply not its floor.
   */
  readonly hostConsequences: readonly HostFacingConsequence[];

  /** Consequences nobody can route yet — SP damage, and anything like it. */
  readonly unresolved: readonly EngineError[];

  readonly narrative: readonly string[];

  /** What was declared. Never rewritten by what turned out to be affected. */
  readonly declaredTargets: readonly TargetRef[];

  /** Who it actually affected, collateral included. */
  readonly finalAffectedSubjects: readonly TargetRef[];

  readonly public: PublicActionView;
  readonly gm: GmActionView;
}


function refusal(
  code: string,
  message: string,
  required: string,
  actual: string,
): EngineError {
  return { code, message, audience: "gm", required, actual };
}


function settlementFailure(
  errors: NonEmptyArray<EngineError>,
  label: string,
): EngineResult<SettledAction> {
  return engineFailure(
    {
      root: createTraceNode({
        id: "actions.settlement",
        label: "Settle Action",
        formula: label,
        output: errors[0].code,
      }),
    },
    errors,
  );
}


export function settleAction(
  input: SettlementInput,
): EngineResult<SettledAction> {
  const { adjudicated } = input;
  const { gm } = adjudicated;

  if (input.context.operationId !== gm.operationId) {
    return settlementFailure([refusal(
      "actions.settlement.operation.mismatch",
      "This settlement names a different operation from its adjudication.",
      gm.operationId,
      input.context.operationId,
    )], "rejected before commitment");
  }

  if (UNSETTLEABLE.includes(gm.disposition)) {
    /*
     * Nothing is charged and nothing is applied. The GM has a recorded way to
     * proceed anyway — override the finding — which is better than a settle
     * that quietly ignores an open question.
     */
    return settlementFailure([refusal(
      "actions.settlement.not-settleable",
      `An action that is ${gm.disposition} does not commit.`,
      "a settleable disposition",
      gm.disposition,
    )], "rejected before commitment");
  }

  const consequences = input.consequences ?? [];

  const effectRequests: RuntimeRequest[] = [];
  const hostConsequences: HostFacingConsequence[] = [];
  const unresolved: EngineError[] = [];
  const narrative: string[] = [];
  const added: TargetRef[] = [];
  const removed: TargetRef[] = [];

  for (const consequence of consequences) {
    switch (consequence.channel) {
      case "runtime":
        effectRequests.push(consequence.request);
        break;

      case "host":
        hostConsequences.push(consequence.consequence);
        break;

      case "unresolved":
        unresolved.push(consequence.diagnostic);
        break;

      case "narrative":
        narrative.push(consequence.summary);
        break;

      case "subject":
        if (consequence.operation === "add") added.push(consequence.subject);
        else removed.push(consequence.subject);
        break;
    }
  }

  /*
   * One call. Costs price cumulatively against the running draft, every cost
   * and effect commits together or none does, and the state that comes back is
   * authoritative.
   */
  const outcome = runCoordinatedOperation<{
    readonly succeeded: boolean | undefined;
  }>({
    context: input.context,
    states: input.states,
    costs: gm.costRequests,
    resolve: () => ({
      result: { succeeded: gm.succeeded },
      requests: effectRequests,
    }),
  }, input.handlers);

  if (!outcome.success) {
    /*
     * The coordinator rolled the whole operation back, so nothing was charged
     * and nothing was applied. Its errors are returned as they are: they name
     * the request and the owner that refused, which is what a caller needs.
     */
    const [first, ...rest] = outcome.errors;

    return settlementFailure([first, ...rest], "rolled back; nothing committed");
  }

  const finalAffectedSubjects = [
    ...gm.affectedSubjects.filter((subject) =>
      !removed.some((one) => JSON.stringify(one) === JSON.stringify(subject))
    ),
    ...added,
  ];

  const trace: TraceNode = createTraceNode({
    id: "actions.settlement",
    label: "Settle Action",
    formula: "one finalized operation, committed once",
    inputs: {
      costs: { value: gm.costRequests.length },
      effects: { value: effectRequests.length },
      hostFacing: { value: hostConsequences.length },
      unresolved: { value: unresolved.length },
    },
    output: outcome.payload.events.length,
  });

  return engineSuccess({
    operationId: gm.operationId,
    states: outcome.payload.states,
    events: outcome.payload.events,
    costOutcomes: outcome.payload.costOutcomes,
    effectOutcomes: outcome.payload.effectOutcomes,
    hostConsequences,
    unresolved,
    narrative,

    /*
     * Declared targets are copied from the proposal untouched. Collateral
     * subjects are added to the AFFECTED list and never to this one: a
     * position-focused punch affects whoever was standing there, and it still
     * declared nobody.
     */
    declaredTargets: gm.proposal.declaredTargets,
    finalAffectedSubjects,

    public: adjudicated.public,
    gm,
  }, { root: trace });
}
