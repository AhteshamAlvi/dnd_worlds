/*
 * Awakening's side of the runtime protocol.
 *
 * Every shape a caller hands in, every shape they get back, and every fact or
 * piece of work the transitions emit. It holds no rules: the transitions do
 * the deciding, and this file exists so that all four routes speak one
 * vocabulary instead of four similar ones.
 *
 *
 * NO NEN-ONLY EVENT FRAMEWORK
 * ---------------------------
 *
 * The events here EXTEND RuntimeEvent and the requests EXTEND RuntimeRequest.
 * Awakening does not get its own bus, its own ordering rule or its own
 * envelope, and the reason is the same one that produced the shared protocol:
 * an operation in which somebody awakens and somebody else is hurt has to
 * produce one ordered event stream, and two frameworks cannot be merged into
 * one stream without a translation layer that is free to disagree with both.
 *
 * The domain on every one of them is `character`, not a new `nen` domain.
 * Awakening state IS permanent character data — condition, node state, history
 * and learned Mastery — and the state-ownership matrix already has an owner
 * for that. Adding a domain would mean every routing table, every batch key
 * and every architecture check learning a name for something that is not a new
 * kind of state.
 *
 *
 * WHAT AWAKENING REFUSES TO DECIDE
 * --------------------------------
 *
 *   Injuries       a failed abrupt attempt emits a SEVERITY to Body. Which rib
 *                  breaks is Body's, and choosing one here would put anatomy in
 *                  the Nen domain.
 *   Conditions     unconsciousness and the leaking state are Conditions, and
 *                  character-status owns them. Awakening asks.
 *   Aura           the pool is Aura's. Awakening never subtracts from it; the
 *                  leak it starts is resolved by the existing time solver.
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { RuntimeOwnerRef } from "../../runtime/domains";
import type { RuntimeEvent } from "../../runtime/events";
import type {
  QuantitativeRequest,
  RuntimeRequest,
} from "../../runtime/requests";
import type { RuntimeRollSet } from "../../runtime/dice";
import type { TransitionResult } from "../../runtime/transition";
import type { GameTimestamp } from "../../time/types";

import type {
  NenAppliedOverride,
  NenAwakeningCondition,
  NenAwakeningMethod,
  NenAwakeningResolution,
  NenAwakeningTraumaSeverity,
  NenReawakeningHurdle,
} from "../foundation/nen/awakening/types";
import type { NenTypeChange } from "../foundation/nen/nen-type";
import type { NenMasteryRank, NenPrincipleId, NenState } from "../foundation/nen/types";
import type { RequirementContext } from "../rules/resolution";

import type { NenEligibilityReport } from "./eligibility";
import type {
  NenAwakeningAuthorization,
  NenExceptionalAwakeningSource,
  NenExternalAwakeningActor,
} from "./sources";


/* ── Context ────────────────────────────────────────────────────────────── */

/*
 * Everything a transition is judged against.
 *
 * ONE requirement context, from which the Attributes are also read — see
 * eligibility.ts's AWAKENING_ATTRIBUTE_LAYER. Taking Attributes as a separate
 * argument would give a caller two chances to describe one character and no
 * way for the engine to notice they had described two.
 */
export interface NenAwakeningContext {
  /** Whose awakening. `character`, because this is permanent character data. */
  readonly owner: RuntimeOwnerRef;

  readonly operationId: string;
  readonly occurredAt: GameTimestamp;

  readonly nen: NenState;
  readonly requirements: RequirementContext;
}


/* ── Dice ───────────────────────────────────────────────────────────────── */

/*
 * The two purposes an abrupt attempt rolls for, and the die they use.
 *
 * Percentile, because both figures are probabilities and a d100 lets a player
 * read the result against the number they were quoted. The thresholds are the
 * probabilities times one hundred, rounded — so a 60% attempt succeeds on
 * 1-60, and the clamped extremes succeed on 1 and on 1-99 exactly.
 */
export const ABRUPT_AWAKENING_SUCCESS_PURPOSE = "nen.awakening.abrupt.success";
export const ABRUPT_AWAKENING_DEATH_PURPOSE = "nen.awakening.abrupt.death";
export const AWAKENING_DIE_SIDES = 100;


/* ── Requests ───────────────────────────────────────────────────────────── */

/*
 * The gradual, safe route.
 *
 * `trainingCompleted` is supplied rather than derived, because the training
 * itself is a content and GM workflow this domain has no window into. What
 * awakening enforces is that the claim was made: a standard awakening whose
 * training is not finished is refused, and nothing is changed.
 *
 * `baseTrainingDurationHours` is likewise supplied. There is NO universal
 * standard-awakening duration in the rules, so inventing one here would be
 * this file deciding a number that was deliberately left open. It is used only
 * to report the hurdle-adjusted duration of a REawakening.
 */
export interface StandardAwakeningRequest {
  readonly method: "standard";
  readonly trainingCompleted: boolean;

  /** The teacher or regimen, when there was one. Absent for unaided training. */
  readonly source?: ContributionSourceRef;

  /** Required when this is a reawakening; refused when it is not. */
  readonly hurdle?: NenReawakeningHurdle;

  readonly baseTrainingDurationHours?: number;
}


/*
 * The forced route.
 *
 * `actorContext` is the ACTOR's requirement context, deliberately separate
 * from the subject's in the shared context. An abrupt awakening is one
 * person's capability applied to another person's body.
 */
export interface AbruptAwakeningRequest {
  readonly method: "abrupt";
  readonly actor: NenExternalAwakeningActor;
  readonly actorContext: RequirementContext;

  /** Supplied, never generated. See runtime/dice.ts for why. */
  readonly rolls: readonly RuntimeRollSet[];

  readonly hurdle?: NenReawakeningHurdle;
}


/*
 * The authorized, rare route.
 *
 * Both fields are required and neither is derivable. The authorization is what
 * stops this being an automatic rarity roll, and the Ability is what the
 * awakening IS — an instinctive awakening that produced no Ability is a
 * character in a forced Zetsu for no reason.
 */
export interface InstinctiveAwakeningRequest {
  readonly method: "instinctive";
  readonly authorization: NenAwakeningAuthorization;
  readonly naturalAbilityId: string;
}


/*
 * The content-defined route.
 *
 * `naturalAbilityId` is honoured only when the source has not prohibited
 * natural Ability development — a source that declares both is contradictory
 * and is refused before anything is touched.
 */
export interface ExceptionalAwakeningRequest {
  readonly method: "exceptional";
  readonly source: NenExceptionalAwakeningSource;
  readonly naturalAbilityId?: string;
  readonly hurdle?: NenReawakeningHurdle;
}


export type NenAwakeningRequestInput =
  | StandardAwakeningRequest
  | AbruptAwakeningRequest
  | InstinctiveAwakeningRequest
  | ExceptionalAwakeningRequest;


/*
 * Undoing an awakening. Exceptional by definition, so the source is required.
 *
 * `targetedExternalAbilityIds` is how a source removes something that is NOT
 * the natural Ability. Reversion never touches an external Ability on its own,
 * and a source that wants one gone has to name it — which is the difference
 * between a rule and a side effect.
 */
export interface NenReversionRequest {
  readonly source: ContributionSourceRef;
  readonly reason: string;
  readonly nenTypeChange?: NenTypeChange;
  readonly targetedExternalAbilityIds?: readonly string[];
}


/* ── Changes ────────────────────────────────────────────────────────────── */

export interface NenMasteryGrant {
  readonly principleId: NenPrincipleId;
  readonly rank: NenMasteryRank;
}


/*
 * What one transition asked for against what it did.
 *
 * Every field is present on every transition, with the untouched ones at their
 * empty value, so a consumer never needs to know which route produced a result
 * in order to read it.
 */
export interface NenAwakeningChanges {
  readonly method: NenAwakeningMethod | null;

  readonly previousCondition: NenAwakeningCondition;
  readonly condition: NenAwakeningCondition;

  readonly nodesOpened: boolean;
  readonly nodesClosed: boolean;
  readonly pseudoChuEnded: boolean;

  readonly leakageStarted: boolean;
  readonly leakageStopped: boolean;

  readonly masteryGranted: readonly NenMasteryGrant[];

  /** Null when the route applies no eligibility bundle at all. */
  readonly eligibility: NenEligibilityReport | null;

  /** Every roll made, in the order the rules resolve them. */
  readonly resolutions: readonly NenAwakeningResolution[];

  readonly trauma: NenAwakeningTraumaSeverity;

  readonly forcedStatesApplied: readonly string[];
  readonly forcedStatesReleased: readonly string[];

  readonly naturalAbilityGranted: string | null;
  readonly naturalAbilityLost: string | null;
  readonly externalAbilitiesLost: readonly string[];

  readonly nenTypeChange: NenTypeChange | null;
  readonly appliedOverrides: readonly NenAppliedOverride[];

  readonly reawakening: boolean;
  readonly hurdle: NenReawakeningHurdle | null;

  /** Present only for a standard reawakening with a supplied base duration. */
  readonly adjustedTrainingDurationHours: number | null;

  readonly collapseRecoveryStarted: boolean;
  readonly collapseRecoveryCompleted: boolean;
}


/** The empty change set every transition starts from. */
export function noAwakeningChanges(
  previousCondition: NenAwakeningCondition,
): NenAwakeningChanges {
  return {
    method: null,
    previousCondition,
    condition: previousCondition,
    nodesOpened: false,
    nodesClosed: false,
    pseudoChuEnded: false,
    leakageStarted: false,
    leakageStopped: false,
    masteryGranted: [],
    eligibility: null,
    resolutions: [],
    trauma: "none",
    forcedStatesApplied: [],
    forcedStatesReleased: [],
    naturalAbilityGranted: null,
    naturalAbilityLost: null,
    externalAbilitiesLost: [],
    nenTypeChange: null,
    appliedOverrides: [],
    reawakening: false,
    hurdle: null,
    adjustedTrainingDurationHours: null,
    collapseRecoveryStarted: false,
    collapseRecoveryCompleted: false,
  };
}


/** What every awakening transition returns. */
export type NenAwakeningTransitionResult = TransitionResult<
  NenState,
  NenAwakeningChanges
>;


/* ── Events ─────────────────────────────────────────────────────────────── */

/*
 * The logical signals awakening produces.
 *
 * One kind per FACT rather than one per route, which is what makes them
 * useful: a consumer that wants to know when a character's nodes opened does
 * not care whether it was a standard awakening or an exceptional one, and
 * would otherwise have to enumerate the routes and keep that list current.
 */
export const NEN_AWAKENING_EVENT_KINDS = [
  "nen-awakened",
  "nen-awakening-failed",
  "nen-reawakened",
  "nen-reverted",
  "nen-nodes-opened",
  "nen-nodes-closed",
  "nen-pseudo-chu-ended",
  "nen-mastery-granted",
  "nen-leakage-started",
  "nen-leakage-stopped",
  "nen-trauma",
  "nen-fatal-trauma",
  "nen-collapse",
  "nen-collapse-recovery-started",
  "nen-collapse-recovery-completed",
  "nen-forced-zetsu-applied",
  "nen-forced-zetsu-released",
  "nen-natural-ability-granted",
  "nen-natural-ability-lost",
  "nen-type-changed",
] as const;

export type NenAwakeningEventKind = typeof NEN_AWAKENING_EVENT_KINDS[number];


/*
 * `sequence` is omitted because the coordinator assigns it in resolution
 * order. A domain that numbered its own events would be numbering them
 * relative to nothing, and two domains' streams could not be interleaved.
 */
export interface NenAwakeningEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: NenAwakeningEventKind;
  readonly domain: "character";

  /** Which awakening, forced state, principle or Ability. Empty for none. */
  readonly detail: string;
}


/* ── Requests raised ────────────────────────────────────────────────────── */

export const NEN_TRAUMA_REQUEST = "body.awakening-trauma";
export const NEN_AURA_RESTORE_REQUEST = "aura.restore-to-maximum";
export const NEN_CONDITION_APPLY_REQUEST = "character-status.apply-condition";
export const NEN_CONDITION_REMOVE_REQUEST = "character-status.remove-condition";


/*
 * Awakening telling Body how badly a forced opening went.
 *
 * A SEVERITY and nothing else. Body selects the anatomy, the Injury and the
 * Body Point loss, because Body owns all three — and because a severity is the
 * only part of it awakening actually knows.
 */
export interface NenAwakeningTraumaRequest extends RuntimeRequest {
  readonly kind: typeof NEN_TRAUMA_REQUEST;
  readonly severity: Exclude<NenAwakeningTraumaSeverity, "none">;

  /** The Danger Score behind it, so Body can scale within the severity. */
  readonly dangerScore: number;
}


/*
 * Awakening asking Character status for a Condition.
 *
 * Used for unconsciousness at a collapse and for the `leaking` Condition while
 * an uncontained character is bleeding Aura. Awakening never writes either: a
 * Condition applied from inside the Nen domain would be a second place the
 * Condition rules live.
 */
/*
 * Awakening asking Aura to put the reserve back to full.
 *
 * QUANTITATIVE, carrying the Maximum Aura the caller supplied, so a log can
 * show what was asked for against what Aura actually did. Awakening never
 * writes `current` itself: the pool is Aura's, the ceiling is derived from
 * Attributes Aura owns, and a Nen file setting the number would be a second
 * place the pool rules live.
 *
 * `allowPartial` is true because this is a RESTORE rather than a cost. Aura
 * clamping the result at a ceiling it derived differently is a legitimate
 * answer to this request, not a refusal of it.
 */
export interface NenAuraRestoreRequest extends QuantitativeRequest {
  readonly kind: typeof NEN_AURA_RESTORE_REQUEST;
}


export function auraRestoreRequest(
  context: {
    readonly operationId: string;
    readonly occurredAt: GameTimestamp;
    readonly owner: RuntimeOwnerRef;
  },
  maximumAura: number,
): NenAuraRestoreRequest {
  return {
    requestId: `${context.operationId}:restore-aura`,
    kind: NEN_AURA_RESTORE_REQUEST,
    phase: "effect",
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    from: { domain: "character", id: context.owner.id },
    to: { domain: "aura", id: context.owner.id },
    requested: maximumAura,
    allowPartial: true,
  };
}


export interface NenConditionRequest extends RuntimeRequest {
  readonly kind:
    | typeof NEN_CONDITION_APPLY_REQUEST
    | typeof NEN_CONDITION_REMOVE_REQUEST;

  readonly conditionId: string;
  readonly reason: string;
}
