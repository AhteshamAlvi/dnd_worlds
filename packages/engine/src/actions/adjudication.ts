/*
 * The GM's authority over a proposal, in one place.
 *
 *
 * WHY ONE LAYER AND NOT AN `override?` ON EVERYTHING
 *
 * The tempting design is a nullable override beside every field that a GM
 * might want to change: on the check, on the requirement, on the Range test,
 * on the cost, on the Body call. It fails three ways at once. Every domain
 * grows a second code path that only fires when a person intervened, and those
 * paths are the least tested code in the system. Nothing can answer "what did
 * the GM change" without walking the whole object graph. And the private
 * reasoning ends up scattered across a dozen structures that were designed to
 * be public.
 *
 * So authority lives here, over the finished proposal, and every domain below
 * stays a pure rules engine that has never heard of a GM.
 *
 *
 * THE ONE RULE THAT IS NOT NEGOTIABLE
 *
 * A secretly overridden original roll must never enter check resolution, a
 * public result, an event, a diagnostic, or any trace a player can reach.
 *
 * That is enforced by ORDER, not by filtering. The override is applied while
 * building the effective roll set, and the effective set is what gets
 * projected into CheckDiceInput. The check resolver is never handed the
 * original, so no amount of tracing inside it can expose one — there is
 * nothing there to expose. The original exists in exactly one place: the
 * AdjudicatedRoll on the GM's view.
 *
 *
 * WHAT THE GM MAY NOT DO
 *
 * Rule-level authority is total: success, margin, requirements, Range, costs,
 * durations, who was affected, what happened. Technical integrity is absolute:
 * no invalid identifiers, no non-finite numbers, no contradictory operation
 * ids, no die face that does not exist on the die, no override naming a
 * finding or a request that is not there. The line is not "how much power does
 * the GM have" — it is total — but "can the engine still describe the result
 * without lying", and a NaN margin or a cost override for a request nobody
 * made is not a ruling, it is corruption.
 */

import type { EngineError, Warning } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode, type TraceNode } from "../infrastructure/trace";
import { resolveCheck, resolveFixedCheck } from "../checks/resolution";
import type {
  CheckBaseContribution,
  CheckModifierContribution,
  FixedCheckTiePolicy,
} from "../checks/types";
import { projectCheckDice } from "../runtime/check-dice";
import { findDiceIssues, rollsFor, type RuntimeRollSet } from "../runtime/dice";
import type { RuntimeRequest } from "../runtime/requests";
import { isQuantitativeRequest } from "../runtime/requests";
import type { TargetRef } from "../targeting";
import type { ResolutionApproach } from "./approach";
import type { EligibilityFinding, EligibilityStatus } from "./eligibility";
import { isEligibilityStatus } from "./eligibility";
import { resolveDisposition } from "./preparation";
import type {
  ActionConsequenceSuggestion,
  ActionProposal,
} from "./proposal";
import {
  revealsAtLeast,
  type AdjudicatedAction,
  type AdjudicatedRoll,
  type AdjudicationOverrideRecord,
  type GmActionView,
  type PublicActionView,
  type RevealChoices,
  type RevealedDetailLevel,
} from "./visibility";


/** Replace what one die says. The original is kept, privately, regardless. */
export interface DiceOverride {
  readonly purpose: string;
  readonly index: number;
  readonly effectiveValue: number;

  /** The GM's note. Never leaves the GM view. */
  readonly reason?: string;
}


export interface FindingOverride {
  readonly id: string;
  readonly status: EligibilityStatus;
  readonly reason?: string;
}


export interface CostOverride {
  readonly requestId: string;

  /** A new amount, for a request that has one. */
  readonly requested?: number;

  /** Remove the cost entirely, before anything is charged. */
  readonly waived?: boolean;

  readonly reason?: string;
}


export interface OutcomeOverride {
  readonly succeeded?: boolean;
  readonly total?: number;
  readonly margin?: number;
  readonly tier?: string;
  readonly reason?: string;
}


export const ADJUDICATION_KINDS = [
  /* The proposal stands. The rules resolve it. */
  "accept",

  /* Named things change; everything else stands. */
  "modify",

  /* The GM supplies the outcome. No check is rolled. */
  "replace",
] as const;

export type AdjudicationKind = typeof ADJUDICATION_KINDS[number];


export interface AdjudicationDecision {
  readonly kind: AdjudicationKind;

  readonly dice?: readonly DiceOverride[];
  readonly findings?: readonly FindingOverride[];
  readonly costs?: readonly CostOverride[];
  readonly outcome?: OutcomeOverride;

  readonly executionDuration?: number;
  readonly travelDuration?: number;

  /** The final word on who was affected, replacing the suggestion. */
  readonly affectedSubjects?: readonly TargetRef[];

  readonly consequences?: readonly ActionConsequenceSuggestion[];

  readonly reveal?: RevealChoices;
}


/** The parts of a check that come from the character, supplied by the caller. */
export interface AdjudicationCheckInputs {
  readonly baseContributions: readonly CheckBaseContribution[];
  readonly modifiers: readonly CheckModifierContribution[];
  readonly difficulty?: number;
  readonly tiePolicy?: FixedCheckTiePolicy;
}


export interface AdjudicationInput {
  /** Must match the proposal's. A mismatch is corruption, not a ruling. */
  readonly operationId: string;

  readonly proposal: ActionProposal;
  readonly approach: ResolutionApproach;
  readonly decision: AdjudicationDecision;

  /** What was actually rolled, in the runtime model. */
  readonly dice?: readonly RuntimeRollSet[];

  readonly checkAdvantage?: number;
  readonly checkInputs?: AdjudicationCheckInputs;

  readonly warnings?: readonly Warning[];
}


function finiteIssue(
  value: number | undefined,
  code: string,
  what: string,
): EngineError | undefined {
  if (value === undefined || Number.isFinite(value)) return undefined;

  return {
    code,
    message: `${what} must be a finite number.`,
    audience: "developer",
    required: "finite number",
    actual: String(value),
  };
}


function integrityIssues(
  input: AdjudicationInput,
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const { proposal, decision } = input;

  if (
    typeof input.operationId !== "string" ||
    input.operationId.trim().length === 0
  ) {
    errors.push({
      code: "actions.adjudication.operation.missing",
      message: "An adjudication must name the operation it belongs to.",
      audience: "developer",
      required: "non-empty operation id",
      actual: String(input.operationId),
    });
  } else if (input.operationId !== proposal.operationId) {
    errors.push({
      code: "actions.adjudication.operation.mismatch",
      message: "This adjudication names a different operation from its proposal.",
      audience: "developer",
      required: proposal.operationId,
      actual: input.operationId,
    });
  }

  if (!(ADJUDICATION_KINDS as readonly string[]).includes(decision.kind)) {
    errors.push({
      code: "actions.adjudication.kind.invalid",
      message: "An adjudication must accept, modify, or replace.",
      audience: "developer",
      required: [...ADJUDICATION_KINDS],
      actual: String(decision.kind),
    });

    return errors;
  }

  /*
   * "Accept" has to mean accept. A decision that says accept and then changes
   * four things would record the GM as having changed nothing, which is the
   * one thing the provenance is for.
   */
  if (decision.kind === "accept") {
    const changes = [
      decision.dice,
      decision.findings,
      decision.costs,
      decision.affectedSubjects,
      decision.consequences,
    ].some((change) => change !== undefined && change.length > 0);

    if (
      changes ||
      decision.outcome !== undefined ||
      decision.executionDuration !== undefined ||
      decision.travelDuration !== undefined
    ) {
      errors.push({
        code: "actions.adjudication.accept.carries-changes",
        message: "An accepted proposal cannot also carry overrides; use modify.",
        audience: "developer",
        required: "no overrides on an accept",
        actual: "overrides supplied",
      });
    }
  }

  if (decision.kind === "replace" && decision.outcome === undefined) {
    errors.push({
      code: "actions.adjudication.replace.outcome-missing",
      message: "A replaced result must supply the outcome it replaces it with.",
      audience: "developer",
      required: "an outcome",
      actual: "absent",
    });
  }

  const numeric: readonly (readonly [number | undefined, string, string])[] = [
    [decision.outcome?.total, "actions.adjudication.outcome.total.invalid", "An overridden total"],
    [decision.outcome?.margin, "actions.adjudication.outcome.margin.invalid", "An overridden margin"],
    [decision.executionDuration, "actions.adjudication.duration.invalid", "An overridden execution duration"],
    [decision.travelDuration, "actions.adjudication.travel.invalid", "An overridden travel duration"],
  ];

  for (const [value, code, what] of numeric) {
    const issue = finiteIssue(value, code, what);

    if (issue !== undefined) errors.push(issue);
  }

  for (const override of decision.findings ?? []) {
    if (!isEligibilityStatus(override.status)) {
      errors.push({
        code: "actions.adjudication.finding.status.invalid",
        message: `"${String(override.status)}" is not a finding status.`,
        audience: "developer",
        required: "satisfied, unsatisfied, or unresolved",
        actual: String(override.status),
      });
    }

    if (!proposal.findings.some((finding) => finding.id === override.id)) {
      errors.push({
        code: "actions.adjudication.finding.unknown",
        message: `This proposal has no finding "${override.id}" to override.`,
        audience: "developer",
        required: proposal.findings.map((finding) => finding.id).join(", ") ||
          "no findings",
        actual: String(override.id),
      });
    }
  }

  for (const override of decision.costs ?? []) {
    const request = proposal.costRequests.find(
      (candidate) => candidate.requestId === override.requestId,
    );

    if (request === undefined) {
      errors.push({
        code: "actions.adjudication.cost.unknown",
        message: `This proposal has no cost request "${override.requestId}".`,
        audience: "developer",
        required: proposal.costRequests.map((one) => one.requestId).join(", ") ||
          "no cost requests",
        actual: String(override.requestId),
      });

      continue;
    }

    const issue = finiteIssue(
      override.requested,
      "actions.adjudication.cost.amount.invalid",
      "An overridden cost",
    );

    if (issue !== undefined) errors.push(issue);
    else if (override.requested !== undefined && override.requested < 0) {
      errors.push({
        code: "actions.adjudication.cost.amount.invalid",
        message: "An overridden cost cannot be negative.",
        audience: "developer",
        required: "amount >= 0",
        actual: String(override.requested),
      });
    }

    if (override.requested !== undefined && !isQuantitativeRequest(request)) {
      errors.push({
        code: "actions.adjudication.cost.not-quantitative",
        message: `Cost request "${override.requestId}" has no amount to change.`,
        audience: "developer",
        required: "a quantitative request",
        actual: request.kind,
      });
    }
  }

  return errors;
}


function diceIntegrityIssues(
  input: AdjudicationInput,
): readonly EngineError[] {
  const { proposal, decision } = input;
  const supplied = input.dice ?? [];
  const errors: EngineError[] = [];

  const needsDice = proposal.requiredDice.length > 0 &&
    decision.kind !== "replace";

  if (needsDice || supplied.length > 0) {
    /*
     * Validated with the SAME function the coordinator uses. A GM may say the
     * attack hit; a GM may not say a d20 rolled 40, because that is not a
     * ruling, it is a corrupt die.
     */
    errors.push(...findDiceIssues(supplied, proposal.requiredDice));
  }

  for (const override of decision.dice ?? []) {
    const rolls = rollsFor(supplied, override.purpose);

    if (rolls === undefined) {
      errors.push({
        code: "actions.adjudication.dice.purpose.unknown",
        message: `Nothing was rolled for "${override.purpose}".`,
        audience: "developer",
        required: supplied.map((set) => set.purpose).join(", ") || "no rolls",
        actual: String(override.purpose),
      });

      continue;
    }

    if (
      !Number.isInteger(override.index) ||
      override.index < 0 ||
      override.index >= rolls.values.length
    ) {
      errors.push({
        code: "actions.adjudication.dice.index.invalid",
        message: `"${override.purpose}" has no roll at that position.`,
        audience: "developer",
        required: `0..${rolls.values.length - 1}`,
        actual: String(override.index),
      });

      continue;
    }

    if (
      !Number.isInteger(override.effectiveValue) ||
      override.effectiveValue < 1 ||
      override.effectiveValue > rolls.sides
    ) {
      /*
       * A GM who wants a result better than the die can show should say so on
       * the total or the outcome, both of which are theirs to set. A face the
       * die does not have would be rejected by the check resolver anyway; it
       * is caught here so the diagnostic names the override rather than the
       * dice.
       */
      errors.push({
        code: "actions.adjudication.dice.face.invalid",
        message: `A d${rolls.sides} has no face ${String(override.effectiveValue)}.`,
        audience: "developer",
        required: `1..${rolls.sides}`,
        actual: String(override.effectiveValue),
      });
    }
  }

  return errors;
}


interface AdjudicatedDice {
  readonly rolls: readonly AdjudicatedRoll[];
  readonly effective: readonly RuntimeRollSet[];
  readonly records: readonly AdjudicationOverrideRecord[];
}


/**
 * Split what was rolled from what the check will be told.
 *
 * This function is the reason the guarantee holds: `effective` is built here
 * and is the only thing that travels onward, while `rolls` keeps both numbers
 * and goes only into the GM's view.
 */
function adjudicateDice(
  supplied: readonly RuntimeRollSet[],
  overrides: readonly DiceOverride[],
): AdjudicatedDice {
  const rolls: AdjudicatedRoll[] = [];
  const effective: RuntimeRollSet[] = [];
  const records: AdjudicationOverrideRecord[] = [];

  for (const set of supplied) {
    const values: number[] = [];

    set.values.forEach((rolledValue, index) => {
      const override = overrides.find(
        (candidate) =>
          candidate.purpose === set.purpose && candidate.index === index,
      );

      const effectiveValue = override?.effectiveValue ?? rolledValue;

      values.push(effectiveValue);

      rolls.push({
        purpose: set.purpose,
        index,
        rolledValue,
        effectiveValue,
        overridden: override !== undefined,
        ...(override?.reason === undefined ? {} : { reason: override.reason }),
      });

      if (override !== undefined) {
        records.push({
          subject: "dice",
          id: `${set.purpose}[${index}]`,
          from: String(rolledValue),
          to: String(effectiveValue),
          ...(override.reason === undefined ? {} : { reason: override.reason }),
        });
      }
    });

    effective.push({ purpose: set.purpose, sides: set.sides, values });
  }

  return { rolls, effective, records };
}


interface CheckOutcome {
  readonly total?: number;
  readonly margin?: number;
  readonly succeeded?: boolean;
  readonly retainedRoll?: number;
  readonly trace?: TraceNode;
  readonly errors: readonly EngineError[];
}


function resolveAdjudicatedCheck(
  input: AdjudicationInput,
  effective: readonly RuntimeRollSet[],
): CheckOutcome {
  const { proposal, checkInputs } = input;

  if (
    proposal.check === undefined ||
    checkInputs === undefined ||
    input.decision.kind === "replace"
  ) {
    return { errors: [] };
  }

  const purpose = proposal.requiredDice[0]?.purpose;
  const rolls = purpose === undefined ? undefined : rollsFor(effective, purpose);

  if (rolls === undefined) return { errors: [] };

  /* Effective values only, from here down. The original is not in scope. */
  const projected = projectCheckDice(rolls, input.checkAdvantage ?? 0);

  if (!projected.success) return { errors: projected.errors };

  const request = {
    scope: proposal.check.scope,
    dice: projected.payload,
    baseContributions: checkInputs.baseContributions,
    modifiers: checkInputs.modifiers,
  };

  if (checkInputs.difficulty === undefined) {
    const resolved = resolveCheck(request);

    if (!resolved.success) return { errors: resolved.errors };

    return {
      total: resolved.payload.total,
      retainedRoll: resolved.payload.dice.retainedRoll,
      trace: resolved.payload.trace,
      errors: [],
    };
  }

  const resolved = resolveFixedCheck({
    check: request,
    difficulty: checkInputs.difficulty,
    ...(checkInputs.tiePolicy === undefined
      ? {}
      : { tiePolicy: checkInputs.tiePolicy }),
  });

  if (!resolved.success) return { errors: resolved.errors };

  return {
    total: resolved.payload.check.total,
    margin: resolved.payload.margin,
    succeeded: resolved.payload.success,
    retainedRoll: resolved.payload.check.dice.retainedRoll,
    trace: resolved.payload.trace,
    errors: [],
  };
}


function overriddenFindings(
  proposal: ActionProposal,
  overrides: readonly FindingOverride[],
): {
  readonly findings: readonly EligibilityFinding[];
  readonly records: readonly AdjudicationOverrideRecord[];
} {
  if (overrides.length === 0) {
    return { findings: proposal.findings, records: [] };
  }

  const records: AdjudicationOverrideRecord[] = [];

  const findings = proposal.findings.map((finding) => {
    const override = overrides.find(
      (candidate) => candidate.id === finding.id,
    );

    if (override === undefined) return finding;

    records.push({
      subject: finding.decidedBy === "spatial" ? "range" : "eligibility",
      id: finding.id,
      from: finding.status,
      to: override.status,
      ...(override.reason === undefined ? {} : { reason: override.reason }),
    });

    const summary = override.reason ?? finding.summary;

    return {
      ...finding,
      status: override.status,
      ...(summary === undefined ? {} : { summary }),
    };
  });

  return { findings, records };
}


function overriddenCosts(
  proposal: ActionProposal,
  overrides: readonly CostOverride[],
): {
  readonly costRequests: readonly RuntimeRequest[];
  readonly records: readonly AdjudicationOverrideRecord[];
} {
  if (overrides.length === 0) {
    return { costRequests: proposal.costRequests, records: [] };
  }

  const records: AdjudicationOverrideRecord[] = [];
  const costRequests: RuntimeRequest[] = [];

  for (const request of proposal.costRequests) {
    const override = overrides.find(
      (candidate) => candidate.requestId === request.requestId,
    );

    if (override === undefined) {
      costRequests.push(request);

      continue;
    }

    if (override.waived === true) {
      records.push({
        subject: "cost",
        id: request.requestId,
        from: "charged",
        to: "waived",
        ...(override.reason === undefined ? {} : { reason: override.reason }),
      });

      continue;
    }

    if (override.requested !== undefined && isQuantitativeRequest(request)) {
      records.push({
        subject: "cost",
        id: request.requestId,
        from: String(request.requested),
        to: String(override.requested),
        ...(override.reason === undefined ? {} : { reason: override.reason }),
      });

      const repriced: RuntimeRequest & { requested: number } = {
        ...request,
        requested: override.requested,
      };

      costRequests.push(repriced);

      continue;
    }

    costRequests.push(request);
  }

  return { costRequests, records };
}


export function adjudicateAction(
  input: AdjudicationInput,
): EngineResult<AdjudicatedAction> {
  const issues = [...integrityIssues(input), ...diceIntegrityIssues(input)];
  const [firstIssue, ...restIssues] = issues;

  if (firstIssue !== undefined) {
    return engineFailure(
      {
        root: createTraceNode({
          id: "actions.adjudication",
          label: "Adjudicate Action",
          formula: "rejected on technical integrity",
          output: firstIssue.code,
        }),
      },
      [firstIssue, ...restIssues] as NonEmptyArray<EngineError>,
    );
  }

  const { proposal, decision } = input;

  const dice = adjudicateDice(input.dice ?? [], decision.dice ?? []);
  const check = resolveAdjudicatedCheck(input, dice.effective);

  const [firstCheckError, ...restCheckErrors] = check.errors;

  if (firstCheckError !== undefined) {
    return engineFailure(
      {
        root: createTraceNode({
          id: "actions.adjudication",
          label: "Adjudicate Action",
          formula: "the adjudicated check could not be resolved",
          output: firstCheckError.code,
        }),
      },
      [firstCheckError, ...restCheckErrors] as NonEmptyArray<EngineError>,
    );
  }

  const findings = overriddenFindings(proposal, decision.findings ?? []);
  const costs = overriddenCosts(proposal, decision.costs ?? []);

  const outcomeRecords: AdjudicationOverrideRecord[] = [];
  const override = decision.outcome;

  if (override !== undefined) {
    outcomeRecords.push({
      subject: decision.kind === "replace" ? "outcome.replaced" : "outcome",
      ...(override.succeeded === undefined
        ? {}
        : {
          from: String(check.succeeded),
          to: String(override.succeeded),
        }),
      ...(override.reason === undefined ? {} : { reason: override.reason }),
    });
  }

  const succeeded = override?.succeeded ?? check.succeeded;
  const total = override?.total ?? check.total;
  const margin = override?.margin ?? check.margin;

  const affectedSubjects = decision.affectedSubjects ??
    proposal.suggestedAffectedSubjects.subjects;

  const consequences = decision.consequences ?? proposal.suggestedConsequences;

  const reveal: RevealChoices = decision.reveal ?? {};
  const detail: RevealedDetailLevel = reveal.detail ?? "outcome";

  const records = [
    ...dice.records,
    ...findings.records,
    ...costs.records,
    ...outcomeRecords,
  ];

  /*
   * Two traces, built separately. The public one is composed from the values
   * this view already exposes; it is not the private one with fields removed,
   * because "remove the secret afterwards" is the pattern that leaks the first
   * time somebody adds a field.
   */
  const publicTrace = createTraceNode({
    id: "actions.adjudication.public",
    label: "Adjudicated Action",
    formula: "revealed detail only",
    inputs: {
      detail: { value: detail },
      ...(succeeded === undefined || !revealsAtLeast(detail, "outcome")
        ? {}
        : { succeeded: { value: succeeded } }),
      ...(total === undefined || !revealsAtLeast(detail, "total")
        ? {}
        : { total: { value: total } }),
      ...(check.retainedRoll === undefined || !revealsAtLeast(detail, "roll")
        ? {}
        : { retainedRoll: { value: check.retainedRoll } }),
    },
    output: reveal.narration ?? detail,
  });

  const gmTrace = createTraceNode({
    id: "actions.adjudication",
    label: "Adjudicate Action",
    formula: "GM authority over rule-level results; integrity enforced",
    inputs: {
      kind: { value: decision.kind },
      overrides: { value: records.length },
    },
    output: decision.kind,
    children: [
      proposal.trace,
      ...(check.trace === undefined ? [] : [check.trace]),
    ],
  });

  const publicView: PublicActionView = {
    operationId: proposal.operationId,
    intentId: proposal.intentId,
    actorId: `${proposal.actor.type}:${proposal.actor.id}`,
    ...(reveal.narration === undefined ? {} : { narration: reveal.narration }),
    ...(succeeded === undefined || !revealsAtLeast(detail, "outcome")
      ? {}
      : { succeeded }),
    ...(total === undefined || !revealsAtLeast(detail, "total")
      ? {}
      : { total }),
    ...(margin === undefined || !revealsAtLeast(detail, "total")
      ? {}
      : { margin }),
    ...(check.retainedRoll === undefined || !revealsAtLeast(detail, "roll")
      ? {}
      : { retainedRoll: check.retainedRoll }),
    targets: reveal.targets === true ? [...proposal.declaredTargets] : [],
    affectedSubjects: [...(reveal.affectedSubjects ?? [])],
    consequences: consequences
      .filter((consequence) =>
        (reveal.consequenceIds ?? []).includes(consequence.id)
      )
      .map((consequence) => consequence.summary),
    trace: publicTrace,
  };

  const gmView: GmActionView = {
    operationId: proposal.operationId,
    proposal,
    rolls: dice.rolls,
    findings: findings.findings,
    costRequests: costs.costRequests,
    disposition: resolveDisposition(
      input.approach,
      proposal.check !== undefined,
      findings.findings,
    ),
    overrides: records,
    ...(succeeded === undefined ? {} : { succeeded }),
    ...(total === undefined ? {} : { total }),
    ...(margin === undefined ? {} : { margin }),
    ...(override?.tier === undefined ? {} : { tier: override.tier }),
    affectedSubjects: [...affectedSubjects],
    reveal,
    warnings: [...(input.warnings ?? [])],
    trace: gmTrace,
  };

  /*
   * The parent trace is the PUBLIC one. An EngineResult's trace is the thing
   * most likely to be rendered without anybody thinking about audience, so it
   * must not be the place the private half lives.
   */
  return engineSuccess(
    { public: publicView, gm: gmView },
    { root: publicTrace },
    [...(input.warnings ?? [])],
  );
}
