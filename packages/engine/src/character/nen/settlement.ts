/*
 * The shared machinery every awakening route settles through.
 *
 * Four routes, one settlement. Standard, abrupt, instinctive and exceptional
 * awakenings differ in what they REQUIRE and in what they GRANT; they do not
 * differ in what opening a character's nodes means, and four implementations
 * of that would be four chances to forget the pseudo-Chu, the history entry or
 * the node state.
 *
 *
 * ATOMICITY IS A DRAFT, NOT A ROLLBACK
 * ------------------------------------
 *
 * Nothing here mutates anything. Each step takes a state and returns a new
 * one, so a transition builds a DRAFT and either returns it or throws it away.
 * There is no partially-applied state to undo, and a refusal at the last step
 * leaves the caller holding precisely the object they passed in — the same
 * guarantee the Aura transitions make and for the same reason.
 *
 * That is also why the Mastery grant is validated against the DRAFT rather
 * than against the original. `validateNenAdvancement` refuses an unawakened
 * character, and a standard awakening has to commit the awakening and Ten I
 * TOGETHER; validating the grant before opening the nodes would refuse every
 * legitimate standard awakening, and committing the awakening first so the
 * grant could pass would be the non-atomic version this exists to avoid.
 *
 *
 * IDS ARE DERIVED FROM THE OPERATION
 * ----------------------------------
 *
 * `${operationId}:awakening` rather than a random id, because a replay of one
 * operation must produce the same history entry, the same forced-state id and
 * therefore the same exemption. A random id would make two runs of the same
 * inputs compare unequal while being identical in every way that matters.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { RuntimeOwnerRef } from "../../runtime/domains";
import type { RuntimeEvent } from "../../runtime/events";
import type { GameTimestamp } from "../../time/types";

import { validateNenAdvancement } from "../foundation/nen/nen";
import { awakeningRecords } from "../foundation/nen/awakening/state";
import type {
  NenAwakeningRecord,
  NenAwakeningResolution,
  NenAwakeningState,
  NenForcedState,
  NenForcedStateOrigin,
  NenNaturalAbilityRecord,
  NenReversionRecord,
} from "../foundation/nen/awakening/types";
import type { NenTypeChange, NenTypeKnowledge } from "../foundation/nen/nen-type";
import type {
  NenMasteryRank,
  NenMasteryState,
  NenPrincipleId,
  NenState,
} from "../foundation/nen/types";

import {
  ABRUPT_AWAKENING_DEATH_PURPOSE,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  AWAKENING_DIE_SIDES,
  NEN_CONDITION_APPLY_REQUEST,
  NEN_CONDITION_REMOVE_REQUEST,
  NEN_TRAUMA_REQUEST,
  type NenAwakeningEvent,
  type NenAwakeningEventKind,
  type NenAwakeningTraumaRequest,
  type NenConditionRequest,
  type NenMasteryGrant,
} from "./protocol";


/* ── Identity ───────────────────────────────────────────────────────────── */

export function awakeningRecordId(operationId: string): string {
  return `${operationId}:awakening`;
}

export function reversionRecordId(operationId: string): string {
  return `${operationId}:reversion`;
}

export function forcedStateId(
  operationId: string,
  origin: NenForcedStateOrigin,
): string {
  return `${operationId}:forced-zetsu:${origin}`;
}

export function collapseRecoveryId(operationId: string): string {
  return `${operationId}:collapse-recovery`;
}


/* ── The Condition ids awakening asks for ───────────────────────────────── */

/*
 * The catalog's `leaking` Condition — "the fresh-awakener state" — which
 * predates this phase and is exactly what an uncontained character is in.
 * Named as a constant rather than spelled at four call sites, so the day it is
 * renamed there is one place that has to change.
 */
export const LEAKING_CONDITION_ID = "leaking";

/*
 * Unconsciousness after a collapse.
 *
 * The Condition catalog carries no `unconscious` entry today — the engine's
 * only unconsciousness is the Fatigue 10 blackout state, which is derived and
 * cannot be applied. So this is raised as a REQUEST naming the Condition, and
 * character-status decides what it does with it. Awakening must not add the
 * Condition itself: the catalog is content, it sits above Foundation, and a
 * Nen file writing an entry into it would be the layering violation the
 * request protocol exists to prevent.
 */
export const UNCONSCIOUS_CONDITION_ID = "unconscious";


/* ── Percentile resolution ──────────────────────────────────────────────── */

/*
 * A probability and a d100, turned into a recorded resolution.
 *
 * The threshold is the probability times a hundred, ROUNDED, which is what
 * makes the quoted number and the rolled number the same number: 60% succeeds
 * on 1-60, the 1% clamp succeeds only on a 1, and the 99% clamp fails only on
 * a 100. It never rolls; the face arrives from the caller.
 */
export function resolvePercentile(
  purpose: string,
  probability: number,
  roll: number,
): NenAwakeningResolution {
  const threshold = Math.round(probability * AWAKENING_DIE_SIDES);

  return {
    purpose,
    probability,
    roll,
    sides: AWAKENING_DIE_SIDES,
    succeeded: roll <= threshold,
  };
}

export {
  ABRUPT_AWAKENING_DEATH_PURPOSE,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
};


/* ── Awakening the state ────────────────────────────────────────────────── */

export interface OpenNodesInput {
  readonly state: NenAwakeningState;
  readonly record: NenAwakeningRecord;
  readonly naturalAbility: NenNaturalAbilityRecord | null;
  readonly nenType: NenTypeKnowledge;
}


/**
 * Move an awakening state into the awakened condition.
 *
 * Does all four things at once, because all four ARE the awakening and a
 * caller that did three of them would produce a state validation refuses:
 * the condition, the node state, the history entry and the current-awakening
 * pointer. Pseudo-Chu needs no step — it is derived from the condition and the
 * history, so it ends the instant this returns.
 */
export function openNodes(input: OpenNodesInput): NenAwakeningState {
  const { state, record } = input;

  return {
    ...state,
    condition: "awakened",
    nodes: "open",
    currentMethod: record.method,
    currentAwakeningId: record.id,
    history: [...state.history, record],
    naturalAbility: input.naturalAbility ?? state.naturalAbility,
    nenType: input.nenType,
  };
}


/**
 * Move an awakening state into the reverted condition.
 *
 * Keeps the history and the external Abilities. Drops the natural Ability only
 * when the caller has established, through provenance, that there is one to
 * drop — this function does not decide that.
 */
export function closeNodes(input: {
  readonly state: NenAwakeningState;
  readonly record: NenReversionRecord;
  readonly removeNaturalAbility: boolean;
  readonly remainingExternalAbilityIds: readonly string[];
  readonly nenType: NenTypeKnowledge;
}): NenAwakeningState {
  const { state } = input;

  return {
    ...state,
    condition: "reverted",
    nodes: "half-open",
    currentMethod: null,
    currentAwakeningId: null,
    history: [...state.history, input.record],
    naturalAbility: input.removeNaturalAbility ? null : state.naturalAbility,
    externalAbilities: state.externalAbilities.filter((external) =>
      input.remainingExternalAbilityIds.includes(external.abilityId),
    ),

    /*
     * Awakening-owned forced states stop. A reverted character's nodes are
     * half-open by the reversion itself, so a forced Zetsu holding them shut
     * is describing a state that no longer exists — and leaving it would make
     * the release transition able to "reopen" a character who is not open.
     */
    forcedStates: [],
    collapseRecovery: null,
    nenType: input.nenType,
  };
}


export function applyForcedState(
  state: NenAwakeningState,
  forced: NenForcedState,
): NenAwakeningState {
  return { ...state, forcedStates: [...state.forcedStates, forced] };
}


export function releaseForcedState(
  state: NenAwakeningState,
  id: string,
): NenAwakeningState {
  return {
    ...state,
    forcedStates: state.forcedStates.filter((forced) => forced.id !== id),
  };
}


/* ── Mastery, through the existing path ─────────────────────────────────── */

export interface MasteryGrantOutcome {
  readonly mastery: NenMasteryState;
  readonly granted: readonly NenMasteryGrant[];
  readonly errors: readonly EngineError[];
}


/**
 * Grant Mastery through validateNenAdvancement, one rank at a time.
 *
 * NOT by writing the rank in. The Nen graph decides what a character may hold,
 * and an awakening that set `mastery.ten = 1` directly would be a second route
 * into the mastery system with none of its checks — which is exactly how an
 * exceptional source would end up granting Hatsu to somebody with no Ten.
 *
 * ALREADY-HELD MASTERY IS LEFT ALONE. A reawakening whose character retained
 * Ten V does not get Ten I granted "again": advancing them would fail (V is
 * not one rank past V) and writing I in would be a downgrade of mastery the
 * rules say is retained. So a grant at or below the held rank is a no-op and
 * is not reported as granted, because nothing was.
 */
export function grantNenMastery(
  draft: NenState,
  grants: readonly NenMasteryGrant[],
): MasteryGrantOutcome {
  let mastery: NenMasteryState = draft.mastery;
  const granted: NenMasteryGrant[] = [];
  const errors: EngineError[] = [];

  for (const grant of grants) {
    const held = mastery[grant.principleId];

    if (held >= grant.rank) continue;

    for (let rank = held + 1; rank <= grant.rank; rank += 1) {
      const step = rank as NenMasteryRank;

      const advancement = validateNenAdvancement(
        { ...draft, mastery },
        grant.principleId,
        step,
      );

      if (!advancement.success) {
        errors.push(...advancement.errors);

        return { mastery: draft.mastery, granted: [], errors };
      }

      mastery = { ...mastery, [grant.principleId]: step };
    }

    granted.push({ principleId: grant.principleId, rank: grant.rank });
  }

  return { mastery, granted, errors };
}


/** The one grant a standard awakening makes. */
export const STANDARD_AWAKENING_MASTERY_GRANTS: readonly NenMasteryGrant[] = [
  { principleId: "ten" satisfies NenPrincipleId, rank: 1 },
];


/* ── Event and request builders ─────────────────────────────────────────── */

export interface EmitContext {
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;
  readonly owner: RuntimeOwnerRef;
  readonly source?: ContributionSourceRef;
}


/**
 * One fact, addressed to the owner it happened to.
 *
 * `sequence` is deliberately absent: the coordinator assigns it in resolution
 * order, and a domain numbering its own events numbers them against nothing.
 */
export function awakeningEvent(
  context: EmitContext,
  kind: NenAwakeningEventKind,
  detail: string,
): NenAwakeningEvent {
  return {
    kind,
    domain: "character",
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    target: context.owner,
    detail,
  };
}


/*
 * Number a domain's events in the order the rules produced them.
 *
 * The coordinator assigns `sequence` for events it commits, because within a
 * coordinated operation several domains' streams have to interleave. A
 * transition called on its own has no coordinator, and TransitionOutcome
 * requires the field — so the events are numbered here, in RULE order, which
 * is the order they are built in. Two runs of one operation therefore produce
 * identical sequences, which is what a replay comparison needs.
 */
export function sequenceAwakeningEvents(
  events: readonly NenAwakeningEvent[],
): readonly RuntimeEvent[] {
  return events.map((event, index) => ({ ...event, sequence: index }));
}


export function traumaRequest(
  context: EmitContext,
  severity: "severe" | "fatal",
  dangerScore: number,
): NenAwakeningTraumaRequest {
  return {
    requestId: `${context.operationId}:awakening-trauma`,
    kind: NEN_TRAUMA_REQUEST,
    phase: "effect",
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    from: { domain: "character", id: context.owner.id },
    to: { domain: "body", id: context.owner.id },
    severity,
    dangerScore,
  };
}


export function conditionRequest(
  context: EmitContext,
  apply: boolean,
  conditionId: string,
  reason: string,
): NenConditionRequest {
  return {
    requestId:
      `${context.operationId}:${apply ? "apply" : "remove"}-${conditionId}`,
    kind: apply ? NEN_CONDITION_APPLY_REQUEST : NEN_CONDITION_REMOVE_REQUEST,
    phase: "effect",
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    from: { domain: "character", id: context.owner.id },
    to: { domain: "character-status", id: context.owner.id },
    conditionId,
    reason,
  };
}


/* ── Records ────────────────────────────────────────────────────────────── */

/** Whether a NEXT awakening of this character would be a reawakening. */
export function isReawakening(state: NenAwakeningState): boolean {
  return awakeningRecords(state).length > 0;
}


export function naturalAbilityRecord(input: {
  readonly abilityId: string;
  readonly grantedAt: GameTimestamp;
  readonly awakeningId: string;
  readonly method: NenAwakeningRecord["method"];
}): NenNaturalAbilityRecord {
  return {
    abilityId: input.abilityId,
    grantedAt: input.grantedAt,
    grantedByAwakeningId: input.awakeningId,
    origin: input.method,
  };
}


/** The Nen Type reading after an optional, explicit change. */
export function applyNenTypeChange(
  current: NenTypeKnowledge,
  change: NenTypeChange | undefined,
): NenTypeKnowledge {
  if (change === undefined) return current;

  return { type: change.next, known: true };
}
