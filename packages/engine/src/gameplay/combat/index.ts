/*
 * Public surface for the Combat domain.
 *
 * Combat is the runtime encounter layer of the engine.
 *
 * It owns:
 *
 * - Combat Actions
 * - Round runtime state
 * - Turn state
 * - Reaction opportunities and Reaction state
 * - Initiative ordering and rotation
 * - runtime Action expenditure
 * - Combat state transitions
 * - Combat structural validation
 *
 * Combat does NOT determine a character's inherent Action capacities.
 *
 * Values such as:
 *
 * - Actions per Round
 * - Actions per Turn
 * - Actions per Reaction
 *
 * are resolved by Character mechanics and supplied to Combat.
 *
 * Combat also does not classify Skills as attacks, defenses, movement, or
 * similar categories. A Combat Action normally references the Skill being
 * used, while the capability itself owns its meaning and check mechanics.
 *
 * Likewise, Skill checks, Detection, Stamina, and other character mechanics
 * remain outside the Combat domain. Combat consumes their results where
 * necessary.
 */


// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export {
  COMBAT_STATE_KINDS,
  COMBAT_NATIVE_ACTION_KINDS,
} from "./types";

export type {
  CombatantId,
  CombatActionId,

  CombatStateKind,

  CombatAction,
  NeutralCombatAction,
  CombatNativeAction,
  CombatNativeActionKind,

  CombatActionCapacity,
  CombatantRoundState,

  InitiativeEntry,
  InitiativeOrder,

  TurnState,

  ReactionTrigger,
  ReactionOpportunity,
  ReactionState,

  ActiveCombatState,

  CombatRound,
  Combat,
} from "./types";


// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export {
  INACTION_ACTION_COST,
  HESITATION_ACTION_COST,

  ACTION_SPEND_FAILURE_REASONS,

  activeStateCombatantId,
  actionsSpentInState,
  remainingStateActions,
  hasReachedStateActionCap,

  hasExhaustedRoundActions,
  canAffordRoundActionCost,

  isValidActionCost,
  findActionSpendFailure,
  canSpendCombatAction,

  spendCombatAction,

  createInactionAction,
  spendInaction,

  createHesitationAction,
  spendHesitation,
} from "./actions";

export type {
  ActionSpendFailureReason,

  ActionSpendSuccess,
  ActionSpendFailure,
  ActionSpendResult,
} from "./actions";


// ---------------------------------------------------------------------------
// Neutral-action scheduling
// ---------------------------------------------------------------------------

export {
  ACTION_SCHEDULE_FAILURE_REASONS,
  resolveThreatenedCombatants,
  scheduleNeutralAction,
} from "./scheduling";

export type {
  ActionScheduleFailureReason,
  ActionScheduleFailure,
  ActionScheduleSuccess,
  ActionScheduleResult,
  ScheduleNeutralActionInput,
} from "./scheduling";


// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

export {
  INITIATIVE_ISSUE_CODES,

  findInitiativeEntryIssues,

  findInitiativeTies,
  findInitiativeTieIssues,

  resolveInitiativeOrder,

  findInitiativeEntry,
  findInitiativeIndex,

  isInitiativeEligible,
  hasInitiativeEligibleCombatant,

  findFirstEligibleInitiativeIndex,
  findNextEligibleInitiativeIndex,
  findNextEligibleInitiativeEntry,
} from "./initiative";

export type {
  InitiativeIssueCode,
  InitiativeIssue,

  InitiativeResolutionSuccess,
  InitiativeResolutionFailure,
  InitiativeResolution,
} from "./initiative";


// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

export {
  TURN_DECISION_LIMIT_SECONDS,

  TURN_END_REASONS,
  TURN_START_FAILURE_REASONS,

  isValidTurnActionCap,

  startTurn,

  canContinueTurn,
  availableTurnActions,

  findAutomaticTurnEndReason,

  endTurnVoluntarily,
  endTurnAtActionCap,
  endTurnForRoundExhaustion,
  endTurnForReaction,

  resolveAutomaticTurnEnd,
} from "./turn";

export type {
  TurnEndReason,

  TurnStartFailureReason,
  TurnStartSuccess,
  TurnStartFailure,
  TurnStartResult,

  TurnEnd,
} from "./turn";


// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export {
  REACTION_QUEUE_FAILURE_REASONS,

  continueReactionQueue,
  nextReactionOpportunity,
  openNextQueuedReaction,
  openReactionQueue,
  queueReactionAfterGateSuccess,
  skipReactionOpportunity,
} from "./reaction-queue";

export type {
  ReactionQueue,
  ReactionQueueFailure,
  ReactionQueueFailureReason,
  ReactionQueueOpened,
  ReactionQueueResult,
  ReactionQueueContinued,
  ReactionQueueContinueResult,
  QueuedReactionOpened,
  QueuedReactionOpenResult,
} from "./reaction-queue";

export {
  REACTION_DECISION_LIMIT_SECONDS,

  REACTION_OPPORTUNITY_FAILURE_REASONS,
  REACTION_START_FAILURE_REASONS,
  REACTION_END_REASONS,

  createReactionOpportunity,
  createEventReactionOpportunity,
  buildQueuedReaction,

  isValidReactionActionCap,

  openReactionAfterGateSuccess,

  canContinueReaction,
  availableReactionActions,

  findAutomaticReactionEndReason,

  endReactionVoluntarily,
  endReactionAtActionCap,
  endReactionForRoundExhaustion,

  resolveAutomaticReactionEnd,
} from "./reaction";

export type {
  CredibleThreat,

  ReactionOpportunityFailureReason,

  ReactionOpportunitySuccess,
  ReactionOpportunityFailure,
  ReactionOpportunityResult,

  ReactionStartFailureReason,
  ReactionStartSuccess,
  ReactionStartFailure,
  ReactionStartResult,

  ReactionEndReason,
  ReactionEnd,
} from "./reaction";


// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export {
  COMBAT_ROUND_DURATION_SECONDS,

  isValidRoundNumber,
  isValidRoundActionCapacity,
  isValidTurnActionCapacity,
  isValidReactionActionCapacity,

  createCombatantRoundState,
  createCombatantRoundStates,

  findRoundCombatant,
  replaceRoundCombatant,

  setRoundActiveState,
  applyActionSpendToRound,

  isRoundComplete,
  countRoundEligibleCombatants,

  currentInitiativeEntry,
  currentInitiativeCombatantId,

  startRound,

  advanceToNextTurn,
  continueAfterTurn,

  activateReaction,
  continueAfterReaction,

  setInitiativePositionForCombatant,

  nextRoundNumber,
} from "./round";

export type {
  RoundCombatantInput,

  RoundStartFailureReason,
  RoundStartFailure,
  RoundStartSuccess,
  RoundStartResult,

  RoundContinues,
  RoundComplete,
  RoundProgressResult,
} from "./round";


// ---------------------------------------------------------------------------
// Combat resolution / state transitions
// ---------------------------------------------------------------------------

export {
  COMBAT_RESOLUTION_FAILURE_REASONS,

  findActiveCombatant,
  mustEndActiveState,

  resolveCombatAction,

  settleActiveStateAfterAction,

  resolveSuccessfulReactionGate,
  continueAfterNoReaction,

  resolveVoluntaryTurnEnd,
  resolveVoluntaryReactionEnd,

  didRoundComplete,
} from "./resolution";

export type {
  CombatResolutionFailureReason,
  CombatResolutionFailure,

  CombatActionResolutionSuccess,
  CombatActionResolution,

  CombatStateSettlementSuccess,
  CombatStateSettlementResult,

  CombatReactionOpenSuccess,
  CombatReactionOpenResult,

  VoluntaryTurnEndSuccess,
  VoluntaryTurnEndResult,

  VoluntaryReactionEndSuccess,
  VoluntaryReactionEndResult,
} from "./resolution";


// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export {
  COMBAT_VALIDATION_ISSUE_CODES,

  findCombatantRoundStateValidationIssues,

  isInitiativeOrderSorted,
  findInitiativeValidationIssues,

  findTurnStateValidationIssues,
  findReactionStateValidationIssues,
  findActiveCombatStateValidationIssues,

  findCombatRoundValidationIssues,
  findCombatValidationIssues,

  isCombatRoundValid,
  isCombatValid,
} from "./validation";

export type {
  CombatValidationIssueCode,
  CombatValidationIssue,
} from "./validation";