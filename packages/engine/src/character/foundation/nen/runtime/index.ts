/*
 * Active-Nen runtime state: what a character is DOING with their Nen.
 *
 * Structural vocabulary and validation only. The transitions that act on it
 * live in character/nen/runtime/, because deciding what may happen to an
 * activity is a rules question — the same split Phase 5 made between
 * foundation/nen/awakening/ and character/nen/.
 */

export {
  NEN_ACTIVITY_CONDITIONS,
  NEN_ACTIVITY_CONSTRAINT_KINDS,
  NEN_ACTIVITY_RELATIONS,
  NEN_ACTIVITY_STOP_CAUSES,
} from "./types";

export type {
  NenActivity,
  NenActivityCondition,
  NenActivityConfiguration,
  NenActivityConstraint,
  NenActivityConstraintKind,
  NenActivityDefinition,
  NenActivityFunding,
  NenActivityProgress,
  NenActivityRelation,
  NenActivityRelationKind,
  NenActivityResumePermission,
  NenActivityRuntime,
  NenActivityStop,
  NenActivityStopCause,
  NenActivitySuppression,
  NenSuppressionExemptions,
  NenSuppressionPolicy,
} from "./types";

export {
  activeNenActivities,
  committedNenOutput,
  emptyNenActivityRuntime,
  findNenActivity,
  findNenActivityDefinitionIssues,
  findNenActivityConfigurationIssues,
  findNenActivityIssues,
  findNenActivityRuntimeIssues,
  findNenSuppressionPolicyIssues,
  isNenActivityCondition,
  nenActivityExertionLoad,
  nenActivityExpiryAt,
  nenActivityPermittedUnderSuppression,
  nenActivityProgressAt,
  nenActivityRunsUntil,
  nenSuppressionImposed,
  orderNenActivities,
  revokedNenConstraintKinds,
  wasNenActivityRunningAt,
} from "./state";
