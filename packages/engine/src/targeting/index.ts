/*
 * The targeting vocabulary: who or what an action is pointed at, and how many
 * of them are legal.
 *
 * Sits above Body — it reuses BodyPartId and CriticalPointId — and below
 * actions. It knows nothing about Characters, Skills, Items or Combat.
 */

export type { TargetCardinality } from "./cardinality";

export {
  ANY_NUMBER_OF_TARGETS,
  EXACTLY_ONE_TARGET,
  NO_TARGETS,
  ONE_OR_MORE_TARGETS,
  OPTIONAL_TARGET,
  findTargetCardinalityIssues,
  permitsNoTargets,
  requiresTargets,
} from "./cardinality";

export type {
  AnatomicalPointTarget,
  AreaTarget,
  BodyPartTarget,
  EntityTarget,
  ObjectTarget,
  PositionTarget,
  SelfTarget,
  TargetEntityId,
  TargetKind,
  TargetObjectId,
  TargetRef,
} from "./targets";

export {
  TARGET_KINDS,
  findTargetIssues,
  isTargetKind,
  targetBodyOwnerId,
} from "./targets";

export type {
  TargetSelection,
  TargetSelectionEvaluation,
  TargetSpecification,
} from "./selection";

export {
  evaluateTargetSelection,
  findTargetSpecificationIssues,
} from "./selection";
