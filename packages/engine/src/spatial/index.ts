/*
 * The spatial vocabulary: one metres-based model of space, shared by every
 * mechanic that cares where anything is.
 *
 * Nothing here knows what a Character, a Skill, a Combat or a VTT is, and
 * architecture.test.ts enforces that. Skills, Items, En, movement, areas and
 * projectiles compose these same primitives differently rather than each
 * carrying a private idea of "range".
 */

export type {
  SpatialContextId,
  SpatiallyContextual,
} from "./context";

export {
  isValidSpatialContextId,
  sameSpatialContext,
  spatialContextMismatchError,
} from "./context";

export type {
  Distance,
  DistanceComparison,
  DistanceInterval,
  DistanceKind,
  MeleeReach,
  RangeBand,
  RangeBandScale,
} from "./distance";

export {
  DISTANCE_KINDS,
  compareToDistanceInterval,
  directDistance,
  findDistanceIntervalIssues,
  findDistanceIssues,
  findMeleeReachIssues,
  findRangeBand,
  findRangeBandScaleIssues,
  isDistanceKind,
  meleeReachInterval,
  pathDistance,
} from "./distance";

export type {
  CoverDegree,
  CoverFact,
  DestinationReachFact,
  LineOfEffectFact,
  ObstructionFact,
  SpatialFacts,
} from "./facts";

export {
  COVER_DEGREES,
  MISSING_SPATIAL_FACT_CODE,
  findSpatialFactsIssues,
  isCoverDegree,
  isMissingSpatialFactError,
  missingSpatialFactError,
} from "./facts";

export type {
  Direction,
  HostPosition,
  MetricPosition,
  SpatialPosition,
} from "./positions";

export {
  directionMagnitude,
  findDirectionIssues,
  findPositionIssues,
  isHostPosition,
  isMetricPosition,
  isSamePosition,
  measureDirectDistance,
  normalizeDirection,
} from "./positions";

export type {
  BoxArea,
  ConeArea,
  CylinderArea,
  LineArea,
  SpatialArea,
  SphereArea,
} from "./areas";

export { areaContextId, findAreaIssues } from "./areas";

export type { SpatialPath } from "./paths";

export { findPathIssues, measurePathLength } from "./paths";

export type {
  InstantaneousTravel,
  SpatialTravel,
  SpeedTravel,
} from "./travel";

export {
  INSTANTANEOUS_TRAVEL,
  findTravelIssues,
  travelDuration,
} from "./travel";
