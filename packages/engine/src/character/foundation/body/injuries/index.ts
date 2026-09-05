/*
 * Injuries — the ANATOMICAL half, owned by Body.
 *
 * An Injury is two things at once, and they live in two places:
 *
 *   here                        anatomy — where an Injury may sit, whether it
 *                               manifests, what ceiling it puts on recovery,
 *                               and the anatomical validation of all of it
 *
 *   character/status/injuries/  content — the Effects it contributes, the
 *                               extra ones treatment state adds, and the
 *                               authored catalog
 *
 * The anatomical half stays under Body because it IS Body's subject matter,
 * and because it is what lets foundation/body/recovery/ reduce a BodyPart's
 * active Injury caps to one ceiling without reaching upward.
 *
 * Nothing here imports the rules layer or the catalog. Every function that
 * needs a definition is handed AnatomicalInjuryDefinitions by its caller —
 * see types.ts for why the interface is split rather than the domain moved.
 */

export type {
  AnatomicalInjuryDefinition,
  CharacterInjury,
  CharacterInjuryId,
  InjuryApplicability,
  InjuryId,
  InjuryLocation,
  InjuryRecovery,
  InjuryTreatmentStatus,
} from "./types";

export { createInjuryDefinitionMap } from "./types";

export type { InjuryManifestation } from "./resolution";

export {
  resolveInjuryManifestation,
} from "./resolution";

export type {
  BodyInjuryValidationIssue,
  InjuryLocationValidationIssue,
  InjuryValidationIssue,
} from "./validation";

export {
  findAnatomicalInjuryCatalogIssues,
  findInjuryLocationApplicabilityIssues,
  findInjuryLocationIssues,
  findInjuryValidationIssues,
  findBodyInjuryValidationIssues,
} from "./validation";
