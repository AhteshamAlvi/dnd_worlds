/*
 * The Nen awakening domain's surface.
 *
 * One import for a caller who wants to awaken, revert, reawaken, settle a
 * collapse or release a forced state — and deliberately NOT a re-export of the
 * stored-state vocabulary, which lives in foundation/nen/awakening/ and is
 * imported from there. A barrel that re-exported both would give every type
 * two import paths, and the architecture tests would then be checking one of
 * them while callers used the other.
 */

export {
  AWAKENING_ATTRIBUTE_LAYER,
  INSTINCTIVE_AWAKENING_REQUIREMENTS,
  STANDARD_AWAKENING_REQUIREMENTS,
  awakeningAttributes,
  bypassedEligibility,
  resolveInstinctiveAwakeningEligibility,
  resolveNenEligibility,
  resolveStandardAwakeningEligibility,
  unmetRequirements,
} from "./eligibility";

export type { NenEligibilityReport } from "./eligibility";

export {
  NEN_SUPPRESSION_ACCESS_SOURCE,
  isNenUncontained,
  nenAuraAccessInput,
  withPassiveNen,
  withPassiveReinforcement,
  withTenCoating,
} from "./access";

export type { UncoatedAuraAccessInput } from "./access";

export {
  NEN_ABILITY_SOURCE_TYPE,
  NEN_COLLAPSE_RECOVERY_SOURCE,
  NEN_FORCED_SUPPRESSION_SOURCE,
  NEN_INVOLUNTARY_SUPPRESSION_SOURCE,
  findNenStoredSuppressionIssues,
  nenCollapseRecoveryClock,
  nenQualifyingUnconsciousness,
  nenStoredSuppression,
  nenStoredSuppressionExemptsSource,
  nenStoredSuppressionPolicy,
} from "./suppression";

export { projectNenUpkeep } from "./upkeep";

export type {
  NenUpkeepProjection,
  NenUpkeepProjectionInput,
} from "./upkeep";

export {
  REN_ACTIVITY_DEFINITION,
  REN_ACTIVITY_DEFINITION_ID,
  REN_OUTWARD_FLOW_SOURCE,
  activeRenActivity,
  adjustRen,
  isRenActivity,
  renOutwardFlow,
  renStopCauseFor,
  resolveRenAttackContribution,
  startRen,
  withRenAccess,
} from "./ren";

export type {
  AdjustRenRequest,
  RenAttackContribution,
  RenAttackRequest,
  StartRenInput,
  StartRenRequest,
} from "./ren";

export {
  ZETSU_ACTIVITY_DEFINITION,
  ZETSU_ACTIVITY_DEFINITION_ID,
  ZETSU_AURA_CONCEALMENT_SCOPE,
  ZETSU_SUPPRESSION_SOURCE,
  activeZetsuActivity,
  isZetsuActivity,
  resolveZetsuAuraConcealment,
  startZetsu,
  stopZetsu,
  withZetsuAccess,
  zetsuStopCauseFor,
  zetsuSuppression,
} from "./zetsu";

export type {
  StartZetsuRequest,
  StopZetsuRequest,
  ZetsuAuraConcealmentContribution,
} from "./zetsu";

export {
  appliedOverrides,
  declaredOverrideFields,
  findExceptionalSourceIssues,
  resolveActorCapability,
} from "./sources";

export type {
  NenActorCapabilityReport,
  NenAwakeningAuthorization,
  NenEligibilityOverride,
  NenExceptionalAwakeningSource,
  NenExceptionalOverrides,
  NenExternalAwakeningActor,
  NenMasteryGrantOverride,
  NenNaturalAbilityOverride,
  NenPrerequisiteOverride,
  NenProgressionOverride,
  NenTypeOverride,
} from "./sources";

export {
  ABRUPT_AWAKENING_DEATH_PURPOSE,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  AWAKENING_DIE_SIDES,
  NEN_AURA_RESTORE_REQUEST,
  NEN_AWAKENING_EVENT_KINDS,
  NEN_CONDITION_APPLY_REQUEST,
  NEN_CONDITION_REMOVE_REQUEST,
  NEN_TRAUMA_REQUEST,
  auraRestoreRequest,
  noAwakeningChanges,
  suppressionEventKind,
} from "./protocol";

export type {
  AbruptAwakeningRequest,
  ExceptionalAwakeningRequest,
  InstinctiveAwakeningRequest,
  NenAuraRestoreRequest,
  NenAwakeningChanges,
  NenAwakeningContext,
  NenAwakeningEvent,
  NenAwakeningEventKind,
  NenAwakeningRequestInput,
  NenAwakeningTraumaRequest,
  NenAwakeningTransitionResult,
  NenConditionRequest,
  NenMasteryGrant,
  NenReversionRequest,
  NenSuppressionRef,
  StandardAwakeningRequest,
} from "./protocol";

export {
  LEAKING_CONDITION_ID,
  UNCONSCIOUS_CONDITION_ID,
} from "./settlement";

export {
  abruptAwakeningDiceRequirements,
  awakenNenAbrupt,
  awakenNenStandard,
} from "./transitions";

export {
  awakenNenExceptional,
  awakenNenInstinctive,
} from "./exceptional";

export {
  advanceNenCollapseRecovery,
  hasAwakeningHistory,
  involuntaryZetsuStates,
  releaseForcedZetsu,
  releaseInvoluntaryZetsu,
  settleNenCollapse,
} from "./collapse";

export type {
  NenCollapseRecoveryRequest,
  NenCollapseRequest,
  NenForcedZetsuReleaseRequest,
  NenSuppressionReleaseRequest,
} from "./collapse";

export {
  masteryFullyRestored,
  projectAbruptReawakeningOdds,
  projectStandardReawakeningDuration,
  retainedMasteryRanks,
  revertNen,
} from "./reversion";

export type { RetainedNenMastery } from "./reversion";
