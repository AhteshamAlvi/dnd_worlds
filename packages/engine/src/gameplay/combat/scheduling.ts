/*
 * Scheduling a neutral action inside Combat.
 *
 * This is the whole of what the encounter layer adds. A neutral action
 * already knows what it is, what it costs, who it points at, how far it
 * reaches and what decides it. None of that becomes Combat's when a fight
 * starts. What Combat adds is: whose turn it is, whether this actor may act
 * right now, what the Action economy charges, and who was endangered enough
 * to be offered a Reaction.
 *
 * So a CombatAction REFERENCES the intent rather than copying it. Combat
 * stores an intent id, a cost and a threat list, and asks the neutral layer
 * for everything else. Copying the targets in was the old design, and it is
 * what made Combat the second authority on who an action affects.
 *
 *
 * WHY A THREAT LIST AND NOT A TARGET LIST
 *
 * The replaced rule was "you may react to an Action that targets you". It is
 * wrong in both directions. A heal names a recipient and endangers nobody,
 * so being named is not enough; and a hazard endangers whoever is under it
 * while naming nobody, so being named is not necessary either.
 *
 * The profile declares whether using it threatens what it points at. This
 * module maps those declared targets onto participating Combatants and hands
 * Combat a list of who was actually endangered. Everything else — the
 * Detection gate, the miss, the collateral damage — happens downstream of
 * that list and cannot change it.
 */

import {
  profileThreatensDeclaredTargets,
  structuredActionCostFor,
  type ActionIntent,
  type ActionProfile,
} from "../../actions";
import type { TargetRef } from "../../targeting";

import { isValidActionCost } from "./actions";
import type {
  CombatAction,
  CombatActionId,
  CombatActionSource,
  CombatantId,
  CombatRound,
} from "./types";
import { activeStateCombatantId } from "./actions";


export const ACTION_SCHEDULE_FAILURE_REASONS = [
  "no-active-state",
  "not-the-active-combatant",
  "execution-context-not-structured",
  "timing-mismatch",
  "timing-not-permitted",
  "invalid-action-cost",
  "threat-not-permitted",
] as const;

export type ActionScheduleFailureReason =
  typeof ACTION_SCHEDULE_FAILURE_REASONS[number];


export interface ActionScheduleSuccess {
  readonly success: true;

  readonly action: CombatAction;
}


export interface ActionScheduleFailure {
  readonly success: false;

  readonly reason: ActionScheduleFailureReason;

  readonly combatantId?: CombatantId;
}


export type ActionScheduleResult =
  | ActionScheduleSuccess
  | ActionScheduleFailure;


export interface ScheduleNeutralActionInput {
  readonly actionId: CombatActionId;

  readonly profile: ActionProfile;

  readonly intent: ActionIntent;

  /** Which participating Combatant is performing this. */
  readonly actorCombatantId: CombatantId;

  /*
   * Which Combatant a declared target refers to, if any.
   *
   * Supplied by the host, because the mapping between a neutral target and a
   * participant is host bookkeeping: a target may be an object, a place, or
   * a creature that is not in this fight, and Combat has no way to tell.
   */
  readonly resolveCombatant: (
    target: TargetRef,
  ) => CombatantId | undefined;

  /*
   * Combatants a threatening action endangers WITHOUT having declared them.
   *
   * This is how a position-focused action threatens anybody: the punch at
   * the ground declares nothing, and whoever was standing on that ground is
   * named here by whatever worked that out. Only a profile that already
   * declares itself threatening may carry these — a harmless capability
   * cannot be made dangerous by supplying a list.
   */
  readonly additionalThreatenedCombatantIds?: readonly CombatantId[];

  /*
   * How the Action is recorded. Defaults to the profile's own source.
   */
  readonly source?: CombatActionSource;
}


function uniqueIds(
  ids: readonly CombatantId[],
): readonly CombatantId[] {
  return Array.from(new Set(ids));
}


/*
 * Resolves who this action threatens.
 *
 * Exported because a caller preparing a Reaction opportunity before
 * scheduling needs the same answer, and two implementations of "who is
 * endangered" is exactly the duplication this ticket removes.
 */
export function resolveThreatenedCombatants(
  profile: ActionProfile,
  intent: ActionIntent,
  resolveCombatant: (target: TargetRef) => CombatantId | undefined,
  additionalThreatenedCombatantIds: readonly CombatantId[] = [],
): readonly CombatantId[] {
  if (!profileThreatensDeclaredTargets(profile)) return [];

  const declared = intent.targets
    .map((target) => resolveCombatant(target))
    .filter((id): id is CombatantId => id !== undefined);

  return uniqueIds([
    ...declared,
    ...additionalThreatenedCombatantIds,
  ]);
}


/*
 * Turns one neutral intent into the Combat Action that schedules it.
 *
 * Authorization only. Whether the Skill exists, whether its requirements are
 * met, whether the target is in Range and whether the check succeeds are all
 * settled before this is called and are none of Combat's business.
 */
export function scheduleNeutralAction(
  round: CombatRound,
  input: ScheduleNeutralActionInput,
): ActionScheduleResult {
  const state = round.activeState;

  if (state === null) {
    return { success: false, reason: "no-active-state" };
  }

  const activeCombatantId = activeStateCombatantId(state);

  if (input.actorCombatantId !== activeCombatantId) {
    return {
      success: false,
      reason: "not-the-active-combatant",
      combatantId: input.actorCombatantId,
    };
  }

  const context = input.intent.executionContext;

  if (context.kind !== "structured") {
    /*
     * The same intent is perfectly resolvable outside Combat; it simply is
     * not the thing being scheduled here. An unstructured context reaching
     * this function means the caller built the intent for one world and
     * handed it to the other.
     */
    return {
      success: false,
      reason: "execution-context-not-structured",
      combatantId: input.actorCombatantId,
    };
  }

  const expectedTiming = state.kind === "turn" ? "action" : "reaction";

  if (context.timing !== expectedTiming) {
    return {
      success: false,
      reason: "timing-mismatch",
      combatantId: input.actorCombatantId,
    };
  }

  if (!input.profile.allowedTimings.includes(expectedTiming)) {
    return {
      success: false,
      reason: "timing-not-permitted",
      combatantId: input.actorCombatantId,
    };
  }

  const additional = input.additionalThreatenedCombatantIds ?? [];

  if (
    additional.length > 0 &&
    !profileThreatensDeclaredTargets(input.profile)
  ) {
    return {
      success: false,
      reason: "threat-not-permitted",
      combatantId: input.actorCombatantId,
    };
  }

  /*
   * Charged through the neutral accessor, so the "only inside structured
   * time" rule has one implementation rather than a Combat-shaped copy.
   */
  const actionCost = structuredActionCostFor(input.profile, context).actions;

  if (!isValidActionCost(actionCost)) {
    return {
      success: false,
      reason: "invalid-action-cost",
      combatantId: input.actorCombatantId,
    };
  }

  return {
    success: true,

    action: {
      id: input.actionId,
      actorCombatantId: input.actorCombatantId,
      actionCost,
      source: input.source ?? {
        kind: "skill",
        skillId: input.profile.source.id,
      },
      intentId: input.intent.id,
      threatenedCombatantIds: resolveThreatenedCombatants(
        input.profile,
        input.intent,
        input.resolveCombatant,
        additional,
      ),
    },
  };
}
