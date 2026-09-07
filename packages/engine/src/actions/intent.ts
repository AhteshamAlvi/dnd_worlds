/*
 * One concrete attempt.
 *
 * An intent is what a player declared: this actor, using this profile, aiming
 * here, at these targets, for this stated reason, in this kind of time. It is
 * not a result, it commits nothing, and it is separate from the profile
 * because a profile is authored once and an intent happens every time.
 *
 *
 * THE FIVE THINGS THIS PHASE REFUSES TO MERGE
 *
 * declared goal — what the player says they are trying to achieve
 * declared targets — the subjects they picked
 * action focus — where it is aimed
 * suggested affected subjects — who the rules think it will touch
 * final affected subjects — who it actually touched
 *
 * Only the first three exist at intent time; the last two are produced by
 * preparation and settlement. They are listed here because merging any two of
 * them is the mistake this vocabulary is built to prevent, and the comment
 * belongs where the first three are declared.
 *
 *
 * THE GOAL IS NOT MECHANICS
 *
 * `declaredGoal` is narrative context — "tear up the ground between us", "pin
 * it against the wall". Nothing parses it, nothing dispatches on it, and no
 * mechanic reads it. It exists so a GM adjudicating an unusual attempt can see
 * what the player meant, which is exactly the information a rules engine
 * normally throws away and a GM normally needs.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { NonEmptyArray } from "../infrastructure/result";
import {
  evaluateTargetSelection,
  type TargetSelection,
  type TargetSelectionEvaluation,
} from "../targeting";
import {
  findActorIssues,
  type ActionIntentId,
  type ActionProfileId,
  type ActorRef,
} from "./identity";
import {
  findExecutionContextIssues,
  isStructuredExecution,
  type ActionTiming,
  type ExecutionContext,
} from "./timing";
import {
  NO_STRUCTURED_ACTION_COST,
  type StructuredActionCost,
} from "./cost";
import {
  findActionFocusIssues,
  type ActionFocus,
  type ActionFocusKind,
} from "./focus";
import {
  profilePermitsFocusKind,
  profilePermitsTiming,
  findActionProfileIssues,
  type ActionProfile,
} from "./profile";


export interface ActionIntent {
  readonly id: ActionIntentId;

  readonly profileId: ActionProfileId;

  readonly actor: ActorRef;

  /** Narrative only. Never parsed. See the header. */
  readonly declaredGoal?: string;

  /** May be empty whenever the profile permits it. */
  readonly targets: TargetSelection;

  readonly focus: ActionFocus;

  readonly executionContext: ExecutionContext;
}


export function findActionIntentIssues(
  intent: ActionIntent,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof intent.id !== "string" || intent.id.trim().length === 0) {
    errors.push({
      code: "actions.intent.id.missing",
      message: "An action intent must be identified.",
      audience: "developer",
      required: "non-empty intent id",
      actual: String(intent.id),
    });
  }

  if (
    typeof intent.profileId !== "string" ||
    intent.profileId.trim().length === 0
  ) {
    errors.push({
      code: "actions.intent.profile.missing",
      message: "An action intent must name the profile it is an attempt at.",
      audience: "developer",
      required: "non-empty profile id",
      actual: String(intent.profileId),
    });
  }

  errors.push(...findActorIssues(intent.actor));
  errors.push(...findActionFocusIssues(intent.focus));
  errors.push(...findExecutionContextIssues(intent.executionContext));

  if (
    intent.declaredGoal !== undefined &&
    typeof intent.declaredGoal !== "string"
  ) {
    errors.push({
      code: "actions.intent.goal.invalid",
      message: "A declared goal must be text when it is present at all.",
      audience: "developer",
      required: "string, or omitted",
      actual: String(intent.declaredGoal),
    });
  }

  return errors;
}


/**
 * How an intent stands against its profile, before anything is prepared.
 *
 * The union separates a broken input from an ordinary refusal for the same
 * reason target selection does: a GM may reasonably overrule "that is out of
 * the permitted timings", and may not reasonably overrule "this intent has no
 * actor".
 */
export type ActionIntentEvaluation =
  | { readonly outcome: "well-formed" }
  | {
    readonly outcome: "invalid";
    readonly errors: NonEmptyArray<EngineError>;
  }
  | {
    readonly outcome: "profile-mismatch";
    readonly expected: ActionProfileId;
    readonly declared: ActionProfileId;
  }
  | {
    readonly outcome: "timing-not-permitted";
    readonly timing: ActionTiming;
    readonly permitted: readonly ActionTiming[];
  }
  | {
    readonly outcome: "focus-not-permitted";
    readonly kind: ActionFocusKind;
    readonly permitted: readonly ActionFocusKind[];
  }
  | {
    readonly outcome: "targets-rejected";
    readonly evaluation: TargetSelectionEvaluation;
  };


export function evaluateActionIntent(
  profile: ActionProfile,
  intent: ActionIntent,
): ActionIntentEvaluation {
  const structural: EngineError[] = [
    ...findActionProfileIssues(profile),
    ...findActionIntentIssues(intent),
  ];

  const firstStructural = structural[0];

  if (firstStructural !== undefined) {
    return {
      outcome: "invalid",
      errors: [firstStructural, ...structural.slice(1)],
    };
  }

  if (profile.id !== intent.profileId) {
    return {
      outcome: "profile-mismatch",
      expected: profile.id,
      declared: intent.profileId,
    };
  }

  if (
    isStructuredExecution(intent.executionContext) &&
    !profilePermitsTiming(profile, intent.executionContext.timing)
  ) {
    return {
      outcome: "timing-not-permitted",
      timing: intent.executionContext.timing,
      permitted: profile.allowedTimings,
    };
  }

  if (!profilePermitsFocusKind(profile, intent.focus.kind)) {
    return {
      outcome: "focus-not-permitted",
      kind: intent.focus.kind,
      permitted: profile.permittedFocusKinds ?? [],
    };
  }

  const targets = evaluateTargetSelection(profile.targets, intent.targets);

  if (targets.outcome !== "satisfied") {
    return { outcome: "targets-rejected", evaluation: targets };
  }

  return { outcome: "well-formed" };
}


/**
 * What the Action economy is charged for this attempt.
 *
 * Zero outside structured time — not because the act is cheaper, but because
 * there is no Round to charge. The profile keeps its cost either way, so the
 * same intent moved into Combat costs what it always did. Mechanical costs are
 * unaffected by any of this; see cost.ts.
 */
export function structuredActionCostFor(
  profile: ActionProfile,
  context: ExecutionContext,
): StructuredActionCost {
  return isStructuredExecution(context)
    ? profile.structuredActionCost
    : NO_STRUCTURED_ACTION_COST;
}
