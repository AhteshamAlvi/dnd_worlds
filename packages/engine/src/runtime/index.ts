/*
 * The shared runtime and transition protocol.
 *
 * What every state-changing operation in the engine has in common: who owns
 * what, how a change is returned, how one domain asks another to change
 * something, how costs commit, and how dice arrive.
 *
 * It contains no gameplay. There is no Ren here, no damage, no Condition and
 * no movement mode — those live in the domains that own them, and this layer
 * exists so they can cooperate without merging. RUNTIME_PROTOCOL.md is the
 * ownership matrix and the reasoning; this is the part the type system holds.
 */

export {
  findOperationContextIssues,
} from "./context";
export type { RuntimeOperationContext } from "./context";

export {
  RUNTIME_DOMAINS,
  isRuntimeDomain,
  isRuntimeOwnerRef,
  ownerKey,
  sameOwner,
} from "./domains";
export type { RuntimeDomain, RuntimeOwnerRef } from "./domains";

export {
  compareRuntimeEvents,
  wasPrevented,
  wasReduced,
} from "./events";
export type { RuntimeEvent, RuntimeValueChange } from "./events";

export {
  RUNTIME_REQUEST_PHASES,
  compareRuntimeRequests,
  effectiveTimeOf,
  findRequestIssues,
  groupSimultaneousRequests,
  isQuantitativeRequest,
  orderRuntimeRequests,
} from "./requests";
export type {
  QuantitativeRequest,
  RuntimeRequest,
  RuntimeRequestOutcome,
  RuntimeRequestPhase,
} from "./requests";

export { transitionOutcome } from "./transition";
export type { TransitionOutcome, TransitionResult } from "./transition";

export { dieFor, findDiceIssues } from "./dice";
export type { RuntimeDieRequirement, RuntimeDieRoll } from "./dice";

export {
  activeApplications,
  attachCombat,
  detachCombat,
  emptyRuntimeState,
  isInCombat,
} from "./state";
export type {
  ActiveApplication,
  ActivityRuntimeSection,
  NenRuntimeSection,
  RuntimeState,
  SpatialRuntimeSection,
  TransformationRuntimeSection,
} from "./state";

export {
  MAXIMUM_CONSEQUENCE_DEPTH,
  runCoordinatedOperation,
} from "./coordinator";
export type {
  CoordinatedOperation,
  CoordinatedOutcome,
  CoordinatorHandlers,
  CostCommitResult,
  CostHandler,
  OwnerStates,
  EffectBatchResult,
  EffectHandler,
  PreparedCost,
} from "./coordinator";
