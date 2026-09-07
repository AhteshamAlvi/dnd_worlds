/*
 * The neutral action vocabulary.
 *
 * An ActionProfile says what a capability permits; an ActionIntent is one
 * concrete attempt at it. Neither knows what a Skill, an Item, a Character or
 * a Combat is, which is what lets the same two shapes describe a Skill used in
 * a duel, a rock thrown at a door, an En expansion in a corridor, and a punch
 * into the ground with nobody targeted at all.
 *
 * Depends on targeting/, spatial/, checks/, time/, runtime/ and infrastructure.
 * Never on Combat, Skill catalogs, Item catalogs, or Character rules —
 * architecture.test.ts enforces it.
 */

export type {
  ActionProfileId,
  ActionIntentId,
  ActionSourceRef,
  ActorRef,
} from "./identity";

export {
  actorKey,
  findActionSourceIssues,
  findActorIssues,
  isSameActor,
} from "./identity";

export type {
  ActionTiming,
  ExecutionContext,
  StructuredExecutionContext,
  UnstructuredExecutionContext,
} from "./timing";

export {
  ACTION_TIMINGS,
  UNSTRUCTURED_EXECUTION,
  findAllowedTimingsIssues,
  findExecutionContextIssues,
  isActionTiming,
  isStructuredExecution,
} from "./timing";

export type { StructuredActionCost } from "./cost";

export {
  NO_STRUCTURED_ACTION_COST,
  ONE_ACTION,
  findStructuredActionCostIssues,
} from "./cost";

export type {
  ActionFocus,
  ActionFocusKind,
  AreaFocus,
  DirectionFocus,
  NoFocus,
  PathFocus,
  PositionFocus,
} from "./focus";

export {
  ACTION_FOCUS_KINDS,
  NO_FOCUS,
  findActionFocusIssues,
  isActionFocusKind,
} from "./focus";

export type {
  EligibilityFinding,
  EligibilityStatus,
} from "./eligibility";

export {
  ELIGIBILITY_STATUSES,
  findEligibilityFindingIssues,
  isEligibilityStatus,
  summarizeEligibility,
} from "./eligibility";

export type {
  ActionCheckProfile,
  ActionProfile,
  ThreatDeclaration,
} from "./profile";

export {
  THREAT_DECLARATIONS,
  findActionProfileIssues,
  isThreatDeclaration,
  profilePermitsFocusKind,
  profilePermitsTiming,
  profileThreatensDeclaredTargets,
} from "./profile";

export type { ResolutionApproach } from "./approach";

export {
  RESOLUTION_APPROACHES,
  findResolutionApproachIssues,
  isResolutionApproach,
  requiresAdjudication,
} from "./approach";

export type {
  ActionConsequenceSuggestion,
  ActionOutputFact,
  ActionProposal,
  AffectedSubjectSuggestion,
  ProposalDisposition,
} from "./proposal";

export {
  PROPOSAL_DISPOSITIONS,
  UNEVALUATED_AFFECTED_SUBJECTS,
} from "./proposal";

export type {
  ActionPreparationInput,
  ActionSpatialInput,
  ActionTargetPlacement,
} from "./preparation";

export { prepareAction } from "./preparation";

export type {
  AdjudicatedAction,
  AdjudicatedRoll,
  AdjudicationOverrideRecord,
  GmActionView,
  PublicActionView,
  RevealChoices,
  RevealedDetailLevel,
} from "./visibility";

export {
  REVEALED_DETAIL_LEVELS,
  isRevealedDetailLevel,
  revealsAtLeast,
} from "./visibility";

export type {
  AdjudicationCheckInputs,
  AdjudicationDecision,
  AdjudicationInput,
  AdjudicationKind,
  CostOverride,
  DiceOverride,
  FindingOverride,
  OutcomeOverride,
} from "./adjudication";

export { ADJUDICATION_KINDS, adjudicateAction } from "./adjudication";

export type {
  Consequence,
  ConsequenceContext,
  HostFacingConsequence,
} from "./consequences";

export {
  affectedSubjectConsequence,
  auraExpenditureConsequence,
  auraRestorationConsequence,
  bodyDamageConsequence,
  bodyRecoveryConsequence,
  conditionApplicationConsequence,
  conditionRemovalConsequence,
  displacementConsequence,
  informationalConsequence,
  narrativeConsequence,
  staminaDamageConsequence,
  worldChangeConsequence,
} from "./consequences";

export type {
  AuthorizeActionInput,
  ScheduledActionAuthorization,
} from "./authorization";

export {
  authorizeScheduledAction,
  findAuthorizationIssues,
} from "./authorization";

export type { StructuredActionCostOverride } from "./adjudication";

export type { SettledAction, SettlementInput } from "./settlement";

export { settleAction } from "./settlement";

export type { ActionIntent, ActionIntentEvaluation } from "./intent";

export {
  evaluateActionIntent,
  findActionIntentIssues,
  structuredActionCostFor,
} from "./intent";
