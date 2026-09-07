/*
 * Scheduling an already-authorized neutral action inside Combat.
 *
 * This is the whole of what the encounter layer adds. A neutral action
 * already knows what it is, what it costs, who it points at, how far it
 * reaches, what decides it, and what the GM ruled about all of that. None of
 * it becomes Combat's when a fight starts. Combat adds: whose turn it is,
 * whether this actor may act right now, what the Action economy charges, and
 * who was endangered enough to be offered a Reaction.
 *
 *
 * WHY AN AUTHORIZATION AND NOT A PROFILE
 *
 * Combat used to take the raw profile and intent and re-check them. That
 * meant a GM who overruled "you cannot use that as a Reaction" was overruled
 * back by the scheduler, and it meant nothing anywhere proved that
 * preparation or adjudication had happened at all.
 *
 * It now takes a ScheduledActionAuthorization, which is evidence: it exists
 * only because adjudication produced it, it carries the FINALIZED timing and
 * cost rather than the authored ones, and it carries nothing private. So
 * this module checks only Combat-owned facts — is there an active state, is
 * this the combatant whose state it is, does the finalized timing match it,
 * and does the finalized cost fit the economy. Neutral eligibility and
 * allowedTimings are settled upstream and are not re-litigated here.
 *
 *
 * WHY THREATS COME ONLY FROM DECLARED TARGETS
 *
 * The replaced rule was "you may react to an Action that targets you", wrong
 * in both directions: a heal names a recipient and endangers nobody, and a
 * hazard endangers whoever is under it while naming nobody.
 *
 * The authorization declares whether using this endangers the subjects it
 * declared. This module maps exactly those onto participating Combatants.
 * There is deliberately no way for a caller to add anybody else — an earlier
 * version had one, and it was an unauthored threat rule wearing a parameter.
 * An action that endangers subjects it did not declare needs an authored
 * threat rule, which is a rules ticket rather than a caller's argument.
 * Hazards with no actor go through CredibleThreat instead.
 */

import {
  findAuthorizationIssues,
  type ActorRef,
  type ScheduledActionAuthorization,
} from "../../actions";
import type { TargetRef } from "../../targeting";

import type { EngineError } from "../../infrastructure/diagnostics";

import { activeStateCombatantId, isValidActionCost } from "./actions";
import type {
  CombatActionId,
  CombatantId,
  CombatRound,
  NeutralCombatAction,
} from "./types";


export const ACTION_SCHEDULE_FAILURE_REASONS = [
  "authorization-invalid",
  "no-active-state",
  "combat-action-id-missing",
  "operation-mismatch",
  "actor-not-resolvable",
  "actor-not-a-participant",
  "not-the-active-combatant",
  "timing-mismatch",
  "invalid-action-cost",
  "threatened-combatant-unknown",
] as const;

export type ActionScheduleFailureReason =
  typeof ACTION_SCHEDULE_FAILURE_REASONS[number];


export interface ActionScheduleSuccess {
  readonly success: true;

  readonly action: NeutralCombatAction;
}


export interface ActionScheduleFailure {
  readonly success: false;

  readonly reason: ActionScheduleFailureReason;

  readonly combatantId?: CombatantId;

  /** Present when the authorization itself did not hold up. */
  readonly authorizationIssues?: readonly EngineError[];
}


export type ActionScheduleResult =
  | ActionScheduleSuccess
  | ActionScheduleFailure;


export interface ScheduleNeutralActionInput {
  readonly actionId: CombatActionId;

  /** Produced by actions/ after adjudication. See authorization.ts. */
  readonly authorization: ScheduledActionAuthorization;

  /**
   * Which participant is performing this.
   *
   * Supplied rather than asserted. The old input took an actorCombatantId
   * beside the intent and never checked that the two described the same
   * creature, so a caller could schedule Gon's punch as Killua's. Combat
   * cannot map an actor itself — an actor may be a Character, an Item, a
   * summon or a construct, and Combat imports none of those — so the host
   * that owns the mapping states it and Combat verifies the result.
   */
  readonly resolveActorCombatant: (
    actor: ActorRef,
  ) => CombatantId | undefined;

  /**
   * Which participant a declared target refers to, if any.
   *
   * A target may be an object, a place, or a creature not in this fight, so
   * "not a participant" is an ordinary answer rather than an error.
   */
  readonly resolveCombatant: (
    target: TargetRef,
  ) => CombatantId | undefined;

  /** Verifies that a mapping named somebody actually in the Round. */
  readonly operationId: string;
}


function isParticipant(
  round: CombatRound,
  combatantId: CombatantId,
): boolean {
  return round.combatants.some(
    (combatant) => combatant.combatantId === combatantId,
  );
}


/*
 * Resolves who this action threatens.
 *
 * Declared targets only, and only when the authorization says using it
 * endangers them. Deduplicated, because one creature may be declared twice
 * — through itself and through one of its Body Parts — and two opportunities
 * for one Reaction is a second Gate nobody triggered.
 */
export function resolveThreatenedCombatants(
  authorization: ScheduledActionAuthorization,
  resolveCombatant: (target: TargetRef) => CombatantId | undefined,
): readonly CombatantId[] {
  if (authorization.threatens !== "declared-targets") return [];

  const declared = authorization.declaredTargets
    .map((target) => resolveCombatant(target))
    .filter((id): id is CombatantId => id !== undefined && id.trim().length > 0);

  return Array.from(new Set(declared));
}


/*
 * Turns one authorized action into the Combat Action that schedules it.
 *
 * Authorization only, and Combat-owned facts only. Whether the Skill exists,
 * whether its requirements are met, whether the target is in Range, whether
 * the check succeeded and whether the GM overruled any of it are all settled
 * before this is called.
 */
export function scheduleNeutralAction(
  round: CombatRound,
  input: ScheduleNeutralActionInput,
): ActionScheduleResult {
  const { authorization } = input;

  if (
    typeof input.actionId !== "string" ||
    input.actionId.trim().length === 0
  ) {
    return { success: false, reason: "combat-action-id-missing" };
  }

  /*
   * Re-validated here rather than trusted.
   *
   * An authorization is a plain readonly object so it can be serialized,
   * persisted and handed back — which means anything a caller can construct,
   * a caller can construct wrong, and a type is not a proof. Checking it at
   * both boundaries is the honest arrangement for a mutable record; treating
   * it as unforgeable because it has a name is not.
   */
  const authorizationIssues = findAuthorizationIssues(authorization);

  if (authorizationIssues.length > 0) {
    return {
      success: false,
      reason: "authorization-invalid",
      authorizationIssues,
    };
  }

  if (input.operationId !== authorization.operationId) {
    return { success: false, reason: "operation-mismatch" };
  }

  const state = round.activeState;

  if (state === null) {
    return { success: false, reason: "no-active-state" };
  }

  const actorCombatantId = input.resolveActorCombatant(authorization.actor);

  if (
    actorCombatantId === undefined ||
    actorCombatantId.trim().length === 0
  ) {
    return { success: false, reason: "actor-not-resolvable" };
  }

  if (!isParticipant(round, actorCombatantId)) {
    return {
      success: false,
      reason: "actor-not-a-participant",
      combatantId: actorCombatantId,
    };
  }

  if (actorCombatantId !== activeStateCombatantId(state)) {
    return {
      success: false,
      reason: "not-the-active-combatant",
      combatantId: actorCombatantId,
    };
  }

  /*
   * The one timing rule Combat owns: a Reaction-timed action belongs in a
   * Reaction and an Action-timed one in a Turn. Whether the capability was
   * ALLOWED at that timing was decided upstream and may have been overruled;
   * re-deciding it here is what overrode the GM.
   */
  const expectedTiming = state.kind === "turn" ? "action" : "reaction";

  if (authorization.timing !== expectedTiming) {
    return {
      success: false,
      reason: "timing-mismatch",
      combatantId: actorCombatantId,
    };
  }

  const actionCost = authorization.structuredActionCost.actions;

  if (!isValidActionCost(actionCost)) {
    return {
      success: false,
      reason: "invalid-action-cost",
      combatantId: actorCombatantId,
    };
  }

  const threatenedCombatantIds = resolveThreatenedCombatants(
    authorization,
    input.resolveCombatant,
  );

  const unknown = threatenedCombatantIds.find(
    (combatantId) => !isParticipant(round, combatantId),
  );

  if (unknown !== undefined) {
    return {
      success: false,
      reason: "threatened-combatant-unknown",
      combatantId: unknown,
    };
  }

  return {
    success: true,

    action: {
      kind: "neutral",
      id: input.actionId,
      actorCombatantId,
      actionCost,
      intentId: authorization.intentId,
      threatenedCombatantIds,
    },
  };
}
