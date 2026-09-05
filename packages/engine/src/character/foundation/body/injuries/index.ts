/*
 * Injuries — anatomical status entries, owned by Body.
 *
 * See types.ts for the domain model and why Injuries live here rather than
 * under status/: an Injury is fundamentally anatomical, and this is what
 * keeps foundation/body/recovery/ from having to reach upward into
 * character/status/ to reduce a BodyPart's active Injury caps to one
 * ceiling.
 *
 * What a manifested Injury CONTRIBUTES is a content question rather than an
 * anatomical one, so collectInjuryEffectSources lives in
 * character/status/resolution.ts alongside the Condition collector.
 */

export type {
  CharacterInjury,
  CharacterInjuryId,
  InjuryApplicability,
  InjuryDefinition,
  InjuryId,
  InjuryLocation,
  InjuryRecovery,
  InjuryTreatmentStatus,
} from "./types";

export {
  INJURY_DEFINITIONS,
  injuryRegistry,
  getInjuryDefinition,
  isKnownInjuryId,
} from "./definitions";
export type { KnownInjuryId } from "./definitions";

export {
  resolveInjuryManifestation,
} from "./resolution";

export type {
  BodyInjuryValidationIssue,
  InjuryLocationValidationIssue,
  InjuryValidationIssue,
} from "./validation";

export {
  findInjuryCatalogIssues,
  findInjuryLocationApplicabilityIssues,
  findInjuryLocationIssues,
  findInjuryValidationIssues,
  findBodyInjuryValidationIssues,
} from "./validation";
