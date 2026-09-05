/*
 * Injuries — the CONTENT half.
 *
 * The authored catalog, the Effects an Injury contributes, and the validation
 * of both. The ANATOMICAL half — locations, applicability, manifestation,
 * recovery ceilings — is foundation/body/injuries/, and is where CharacterInjury
 * and AnatomicalInjuryDefinition are declared.
 *
 * The dependency runs one way only: this layer imports Body's anatomical
 * contracts and passes definitions down into it. Body never imports this.
 */

export type { InjuryDefinition } from "./types";

export {
  INJURY_DEFINITIONS,
  injuryRegistry,
  getInjuryDefinition,
  isKnownInjuryId,
  listInjuryDefinitions,
  listAnatomicalInjuryDefinitions,
} from "./definitions";
export type { KnownInjuryId } from "./definitions";

export { collectInjuryEffectSources } from "./effects";

export { findInjuryCatalogIssues } from "./validation";
