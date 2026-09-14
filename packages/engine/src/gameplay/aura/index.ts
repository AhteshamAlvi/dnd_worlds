/*
 * Aura placement: where funded Aura goes once a Target is involved.
 *
 * The composition layer above Aura, Targeting and Spatial. None of those three
 * may import the others — Character in particular may not reach up into
 * targeting/ or spatial/ — so the module that joins them sits above all three,
 * the same shape as gameplay/combat composing neutral actions with targeting.
 */

export {
  AURA_PLACEMENT_CHANNELS,
  placementOf,
  resolveAuraPlacement,
} from "./placement";

export type {
  AuraPlacementBody,
  AuraPlacementChannel,
  AuraPlacementChannelKind,
  AuraPlacementRequest,
  AuraPlacementSite,
  AuraPlacementTarget,
  DifferentialBodyChannel,
  ItemSurfaceChannel,
  ProjectedSpatialChannel,
  ResolvedAuraPlacement,
  UniformBodyChannel,
} from "./placement";

export {
  AURA_MEASURE_UNITS,
  deriveAreaVolumeLitres,
  findMeasureIssues,
  measureUnitFor,
} from "./measures";

export type { AuraMeasureUnit, AuraPlacementMeasure } from "./measures";
