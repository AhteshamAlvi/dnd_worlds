/*
 * Intent in, proposal out. Nothing happens.
 *
 * This is the only pipeline in `actions/`, and it is pure by construction: it
 * reads its inputs, asks the domains that own each question what they think,
 * and returns a description. It does not spend Aura or Actions, consume Items
 * or ammunition, damage a Body, apply a Condition, move anything, advance the
 * clock, emit a committed event, mutate anything it was handed, or call the
 * coordinator. Preparing the same intent twice returns the same answer and
 * leaves the world exactly as it was.
 *
 * That is worth stating as loudly as this because a "preview" that quietly
 * charges something is the single most expensive bug this design can have: it
 * would fire every time a GM looked at an option and decided against it.
 *
 *
 * WHAT THIS FILE OWNS, AND WHAT IT ONLY CARRIES
 *
 * It owns: the intent-versus-profile check, the Range measurement, the dice
 * requirement, the travel arithmetic, and the disposition it computes from
 * everything else.
 *
 * It only carries: Character eligibility, resource costs, output magnitudes,
 * suggested subjects and suggested consequences. Those arrive as findings and
 * requests already decided by the domains that own them. `actions/` does not
 * import Character rules and has no idea what a Trait or a Mastery rank is —
 * a Character-aware adapter evaluates requirements and hands normalised
 * findings in. architecture.test.ts enforces the missing import.
 */

import type { EngineError, Warning } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode, type TraceNode } from "../infrastructure/trace";
import { expectedRollCount } from "../checks/resolution";
import type { RuntimeDieRequirement } from "../runtime/dice";
import type { RuntimeRequest } from "../runtime/requests";
import {
  compareToDistanceInterval,
  isMissingSpatialFactError,
  measureDirectDistance,
  travelDuration,
  type Distance,
  type SpatialFacts,
  type SpatialPosition,
} from "../spatial";
import type { TargetRef } from "../targeting";
import {
  findResolutionApproachIssues,
  requiresAdjudication,
  type ResolutionApproach,
} from "./approach";
import type { EligibilityFinding } from "./eligibility";
import {
  findActionIntentIssues,
  evaluateActionIntent,
  structuredActionCostFor,
  type ActionIntent,
} from "./intent";
import { findActionProfileIssues, type ActionProfile } from "./profile";
import {
  UNEVALUATED_AFFECTED_SUBJECTS,
  type ActionConsequenceSuggestion,
  type AffectedSubjectSuggestion,
  type ActionOutputFact,
  type ActionProposal,
  type ProposalDisposition,
} from "./proposal";


/**
 * Where the host says one declared target actually is.
 *
 * Addressed by index into the declared selection, because a target is not
 * required to have an identity the host can key on — a position target is a
 * place, and two of them can be identical.
 */
export interface ActionTargetPlacement {
  readonly targetIndex: number;
  readonly position: SpatialPosition;
}


export interface ActionSpatialInput {
  /** Where the actor is acting from. Without it, Range cannot be measured. */
  readonly origin?: SpatialPosition;

  readonly placements?: readonly ActionTargetPlacement[];

  /** Host-supplied geometry for this question. See spatial/facts.ts. */
  readonly facts?: SpatialFacts;
}


export interface ActionPreparationInput {
  /** The operation a later commit would run under. Supplied, never generated. */
  readonly operationId: string;

  readonly profile: ActionProfile;
  readonly intent: ActionIntent;
  readonly approach: ResolutionApproach;

  /**
   * Findings from the domains that own them — Character rules, resources, the
   * host. Normalised before they arrive; see eligibility.ts.
   */
  readonly eligibility?: readonly EligibilityFinding[];

  readonly spatial?: ActionSpatialInput;

  /** Priced by their owning domains, sent by nobody. */
  readonly costRequests?: readonly RuntimeRequest[];

  /**
   * The advantage level the check would be rolled at.
   *
   * Supplied rather than derived, because advantage comes from the character
   * and the situation, and neither is this module's business. It is here at
   * all so the dice REQUIREMENT can state the right roll count.
   */
  readonly checkAdvantage?: number;

  readonly outputs?: readonly ActionOutputFact[];

  /**
   * Who the host says would be caught, if the host evaluated occupancy at all.
   *
   * Omitting it means nobody looked, which is why it defaults to the
   * unevaluated form rather than to an empty list. See proposal.ts.
   */
  readonly suggestedAffectedSubjects?: AffectedSubjectSuggestion;
  readonly suggestedConsequences?: readonly ActionConsequenceSuggestion[];
  readonly warnings?: readonly Warning[];
}


function structuralIssues(
  input: ActionPreparationInput,
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findResolutionApproachIssues(input.approach),
    ...findActionProfileIssues(input.profile),
    ...findActionIntentIssues(input.intent),
  ];

  if (
    typeof input.operationId !== "string" ||
    input.operationId.trim().length === 0
  ) {
    errors.push({
      code: "actions.preparation.operation.missing",
      message: "An action proposal must belong to an identified operation.",
      audience: "developer",
      required: "non-empty operation id",
      actual: String(input.operationId),
    });
  }

  if (
    input.checkAdvantage !== undefined &&
    !Number.isInteger(input.checkAdvantage)
  ) {
    errors.push({
      code: "actions.preparation.advantage.invalid",
      message: "A check's advantage level must be a whole number.",
      audience: "developer",
      required: "integer",
      actual: String(input.checkAdvantage),
    });
  }

  const affected = input.suggestedAffectedSubjects;

  if (
    affected !== undefined &&
    affected.evaluated === false &&
    affected.subjects.length > 0
  ) {
    /*
     * Subjects that nobody evaluated cannot exist. Allowing the contradiction
     * would put a list on the proposal that settlement is entitled to act on
     * while the flag says it is not an answer, and one of the two would be
     * silently believed.
     */
    errors.push({
      code: "actions.preparation.affected-subjects.contradictory",
      message:
        "Affected subjects were supplied on a suggestion marked as not evaluated.",
      audience: "developer",
      required: "evaluated: true when subjects are named",
      actual: `${affected.subjects.length} subjects, evaluated: false`,
    });
  }

  for (const placement of input.spatial?.placements ?? []) {
    if (
      !Number.isInteger(placement.targetIndex) ||
      placement.targetIndex < 0 ||
      placement.targetIndex >= input.intent.targets.length
    ) {
      errors.push({
        code: "actions.preparation.placement.index.invalid",
        message: "A placement names a declared target that does not exist.",
        audience: "developer",
        required: `0..${input.intent.targets.length - 1}`,
        actual: String(placement.targetIndex),
      });
    }
  }

  return errors;
}


/**
 * Findings produced by evaluating the intent against its own profile.
 *
 * Timing, focus and target-count refusals are ordinary rule answers a GM may
 * overrule later, so they become findings rather than failures. A malformed
 * intent is a different thing entirely and never gets this far.
 */
function intentFindings(
  profile: ActionProfile,
  intent: ActionIntent,
): readonly EligibilityFinding[] {
  const evaluation = evaluateActionIntent(profile, intent);

  switch (evaluation.outcome) {
    case "well-formed":
      return [];

    case "timing-not-permitted":
      return [{
        id: "actions.timing",
        status: "unsatisfied",
        decidedBy: "actions",
        summary: `This cannot be used as a ${evaluation.timing}.`,
      }];

    case "focus-not-permitted":
      return [{
        id: "actions.focus",
        status: "unsatisfied",
        decidedBy: "actions",
        summary: `This cannot be aimed by ${evaluation.kind}.`,
      }];

    case "targets-rejected":
      return [{
        id: "targeting.selection",
        status: "unsatisfied",
        decidedBy: "targeting",
        summary: `The declared targets are not a legal selection (${evaluation.evaluation.outcome}).`,
      }];

    /*
     * "invalid" and "profile-mismatch" are unreachable here: both are caught
     * as structural failures before preparation gets this far. Returning
     * nothing rather than inventing a finding keeps the unreachable branch
     * from silently becoming a rule answer if that ever changes.
     */
    default:
      return [];
  }
}


interface SpatialOutcome {
  readonly findings: readonly EligibilityFinding[];
  readonly unresolved: readonly EngineError[];
  readonly measuredDistance?: Distance;
}


function prepareSpatial(
  profile: ActionProfile,
  intent: ActionIntent,
  spatial: ActionSpatialInput | undefined,
): SpatialOutcome {
  const range = profile.range;

  /* No Range on the profile means distance is not a question this action asks. */
  if (range === undefined) return { findings: [], unresolved: [] };

  const subjects: readonly {
    readonly id: string;
    readonly position: SpatialPosition | undefined;
  }[] =
    intent.targets.length > 0
      ? intent.targets.map((_target, index) => ({
        id: `target.${index}`,
        position: spatial?.placements
          ?.find((placement) => placement.targetIndex === index)?.position,
      }))
      : intent.focus.kind === "position"
        ? [{ id: "focus", position: intent.focus.position }]
        : [];

  /*
   * Nothing to measure to. A targetless, unaimed action with a Range is not
   * out of Range — there is simply no subject, and saying "out of Range" would
   * be inventing a refusal.
   */
  if (subjects.length === 0) return { findings: [], unresolved: [] };

  const origin = spatial?.origin;

  if (origin === undefined) {
    const diagnostic: EngineError = {
      code: "actions.preparation.origin.missing",
      message: "Range cannot be measured without the actor's position.",
      audience: "developer",
      required: "spatial.origin",
      actual: "absent",
    };

    return {
      findings: [{
        id: "spatial.range",
        status: "unresolved",
        decidedBy: "spatial",
        summary: "Nobody said where the actor is.",
        diagnostic,
      }],
      unresolved: [diagnostic],
    };
  }

  const findings: EligibilityFinding[] = [];
  const unresolved: EngineError[] = [];
  const measured: Distance[] = [];

  for (const subject of subjects) {
    if (subject.position === undefined) {
      const diagnostic: EngineError = {
        code: "actions.preparation.placement.missing",
        message: `Nobody said where ${subject.id} is.`,
        audience: "developer",
        required: "a placement for every declared target",
        actual: "absent",
      };

      findings.push({
        id: `spatial.range.${subject.id}`,
        status: "unresolved",
        decidedBy: "spatial",
        summary: "The host has not placed this subject.",
        diagnostic,
      });

      unresolved.push(diagnostic);

      continue;
    }

    const measurement = measureDirectDistance(
      origin,
      subject.position,
      spatial?.facts ?? {},
    );

    if (!measurement.success) {
      const [diagnostic] = measurement.errors;

      /*
       * A missing host fact and a malformed position are both "no answer", and
       * they are NOT the same answer. The first is a question somebody can
       * still resolve; the second is broken data. Both are unresolved here
       * rather than fabricated, and the code tells them apart.
       */
      findings.push({
        id: `spatial.range.${subject.id}`,
        status: "unresolved",
        decidedBy: "spatial",
        summary: isMissingSpatialFactError(diagnostic)
          ? "The host has not supplied the geometry this needs."
          : "This subject's position could not be used.",
        diagnostic,
      });

      unresolved.push(diagnostic);

      continue;
    }

    const distance = measurement.payload;

    measured.push(distance);

    const comparison = compareToDistanceInterval(range, distance);

    if (comparison.outcome === "within") {
      findings.push({
        id: `spatial.range.${subject.id}`,
        status: "satisfied",
        decidedBy: "spatial",
        summary: `${distance.metres} m, within Range.`,
      });

      continue;
    }

    if (comparison.outcome === "incomparable") {
      findings.push({
        id: `spatial.range.${subject.id}`,
        status: "unresolved",
        decidedBy: "spatial",
        summary: "This distance cannot be compared against this Range.",
        diagnostic: comparison.error,
      });

      unresolved.push(comparison.error);

      continue;
    }

    findings.push({
      id: `spatial.range.${subject.id}`,
      status: "unsatisfied",
      decidedBy: "spatial",
      summary: comparison.outcome === "below-minimum"
        ? `${comparison.shortfallMetres} m too close.`
        : `${comparison.excessMetres} m too far.`,
    });
  }

  const only = measured.length === 1 ? measured[0] : undefined;

  return {
    findings,
    unresolved,
    ...(only === undefined ? {} : { measuredDistance: only }),
  };
}


/**
 * The dice this action would need, in the runtime model.
 *
 * One purpose, named for the profile, at the roll count the advantage level
 * implies — read from the same helper the check resolver reads, so a proposal
 * cannot promise a roll count the check would reject.
 */
function diceRequirements(
  profile: ActionProfile,
  advantage: number,
): readonly RuntimeDieRequirement[] {
  if (profile.check === undefined) return [];

  return [{
    purpose: `check:${profile.id}`,
    sides: 20,
    count: expectedRollCount(advantage),
  }];
}


/**
 * The six answers, in the order they take precedence.
 *
 * A definite refusal outranks a missing fact, for the same reason an
 * unsatisfied eligibility finding outranks an unresolved one: the attempt is
 * blocked either way, and answering the open question would not have helped.
 *
 * Among refusals, the LEAST recoverable one is the headline. A character who
 * lacks the Mastery reads "ineligible" even when they are also out of Range,
 * because telling them to move would waste the move. That makes
 * "spatially-invalid" mean something precise and useful — the only thing wrong
 * is where you are standing — rather than merely "something spatial was among
 * the problems". Every finding is on the proposal either way; this only
 * decides which one leads.
 */
export function resolveDisposition(
  approach: ResolutionApproach,
  hasCheck: boolean,
  findings: readonly EligibilityFinding[],
): ProposalDisposition {
  const unsatisfied = findings.filter(
    (finding) => finding.status === "unsatisfied",
  );

  if (unsatisfied.some((finding) => finding.decidedBy !== "spatial")) {
    return "ineligible";
  }

  if (unsatisfied.length > 0) return "spatially-invalid";

  if (findings.some((finding) => finding.status === "unresolved")) {
    return "missing-facts";
  }

  if (requiresAdjudication(approach)) return "requires-adjudication";

  return hasCheck ? "check-dependent" : "resolvable";
}


function proposalTrace(
  input: ActionPreparationInput,
  disposition: ProposalDisposition,
  children: readonly TraceNode[],
): TraceNode {
  /*
   * Inputs only, and only safe ones. No rolled value can appear here because
   * nothing has been rolled — and the adjudication ticket relies on this trace
   * staying free of anything a player must not see.
   */
  return createTraceNode({
    id: "actions.preparation",
    label: "Prepare Action",
    formula: "aggregate owner-domain findings; nothing is committed",
    inputs: {
      profile: { value: input.profile.id },
      intent: { value: input.intent.id },
      actor: { value: `${input.intent.actor.type}:${input.intent.actor.id}` },
      approach: { value: input.approach },
      declaredTargets: { value: input.intent.targets.length },
      focus: { value: input.intent.focus.kind },
    },
    output: disposition,
    children: [...children],
  });
}


export function prepareAction(
  input: ActionPreparationInput,
): EngineResult<ActionProposal> {
  const structural = structuralIssues(input);
  const [firstStructural, ...restStructural] = structural;

  if (firstStructural !== undefined) {
    return engineFailure(
      {
        root: createTraceNode({
          id: "actions.preparation",
          label: "Prepare Action",
          formula: "rejected before preparation",
          output: firstStructural.code,
        }),
      },
      [firstStructural, ...restStructural] as NonEmptyArray<EngineError>,
    );
  }

  const { profile, intent } = input;

  const spatial = prepareSpatial(profile, intent, input.spatial);

  const findings: readonly EligibilityFinding[] = [
    ...(input.eligibility ?? []),
    ...intentFindings(profile, intent),
    ...spatial.findings,
  ];

  const advantage = input.checkAdvantage ?? 0;
  const disposition = resolveDisposition(
    input.approach,
    profile.check !== undefined,
    findings,
  );

  const travelChildren: TraceNode[] = [];
  let travel: number | undefined;

  if (profile.travel !== undefined && spatial.measuredDistance !== undefined) {
    const duration = travelDuration(profile.travel, spatial.measuredDistance);

    if (duration.success) {
      travel = duration.payload;
      travelChildren.push(duration.trace.root);
    }
  }

  const proposal: ActionProposal = {
    operationId: input.operationId,
    intentId: intent.id,
    profileId: profile.id,
    actor: intent.actor,
    source: profile.source,

    ...(intent.declaredGoal === undefined
      ? {}
      : { declaredGoal: intent.declaredGoal }),
    declaredTargets: [...intent.targets],
    focus: intent.focus,

    approach: input.approach,
    executionContext: intent.executionContext,
    disposition,

    structuredActionCost: structuredActionCostFor(
      profile,
      intent.executionContext,
    ),
    costRequests: [...(input.costRequests ?? [])],

    ...(profile.check === undefined ? {} : { check: profile.check }),
    requiredDice: diceRequirements(profile, advantage),

    executionDuration: profile.executionDuration,
    ...(travel === undefined ? {} : { travelDuration: travel }),
    ...(spatial.measuredDistance === undefined
      ? {}
      : { measuredDistance: spatial.measuredDistance }),

    findings,

    outputs: [...(input.outputs ?? [])],
    suggestedAffectedSubjects: input.suggestedAffectedSubjects === undefined
      ? UNEVALUATED_AFFECTED_SUBJECTS
      : {
        evaluated: input.suggestedAffectedSubjects.evaluated,
        subjects: [...input.suggestedAffectedSubjects.subjects],
      },
    suggestedConsequences: [...(input.suggestedConsequences ?? [])],

    unresolved: [...spatial.unresolved],
    warnings: [...(input.warnings ?? [])],

    trace: proposalTrace(input, disposition, travelChildren),
  };

  return engineSuccess(proposal, { root: proposal.trace }, [
    ...(input.warnings ?? []),
  ]);
}
