/*
 * Closed scope vocabulary for universal d20 checks.
 *
 * A CheckScope names one concrete check being resolved. A CheckScopeSelector
 * names the set of checks to which a modifier applies. Keeping those shapes
 * separate prevents a broad authored modifier such as "all hearing Detection"
 * from being mistaken for a concrete runtime check.
 *
 * The SENSORY half of that vocabulary is not declared here. Senses, phenomena,
 * Detection and Concealment modes, Detection and Investigation subjects, and
 * the four sensory scopes and their selectors are owned by
 * character/foundation/senses/scopes.ts, which is where the mechanics that
 * give them meaning live. This module composes them into CheckScope and
 * re-exports them so a caller reaching for the check vocabulary still finds
 * one coherent surface.
 *
 * They used to be declared in both places. Because the two declarations were
 * structurally identical TypeScript accepted every assignment between them, so
 * adding a seventh sense to one list and not the other would have compiled
 * cleanly and left modifier matching disagreeing with profile resolution at
 * runtime. A closed vocabulary has to have exactly one declaration for
 * "closed" to mean anything; architecture.test.ts now enforces that.
 */

import type { AttributeKey } from "../character/foundation/attributes/types";
import type { DerivedAttributeName } from "../character/foundation/attributes/derived/types";
import type {
  ConcealmentCheckScope,
  ConcealmentCheckScopeSelector,
  DetectionCheckScope,
  DetectionCheckScopeSelector,
  InvestigationCheckScope,
  InvestigationCheckScopeSelector,
  PerceptionCheckScope,
  PerceptionCheckScopeSelector,
} from "../character/foundation/senses/scopes";

/* The sensory vocabulary, re-exported from its single owner. */
export {
  SENSE_IDS,
  PHYSICAL_SENSE_IDS,
  PERCEPTION_PHENOMENA,
  DETECTION_MODES,
  CONCEALMENT_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
} from "../character/foundation/senses/scopes";

export type {
  SenseId,
  PerceptionPhenomenon,
  DetectionMode,
  ConcealmentMode,
  DetectionSubject,
  InvestigationSubject,
  SenseSelector,
  PhenomenonSelector,
  DetectionModeSelector,
  ConcealmentModeSelector,
  DetectionSubjectSelector,
  InvestigationSubjectSelector,
  PerceptionCheckScope,
  DetectionCheckScope,
  ConcealmentCheckScope,
  InvestigationCheckScope,
  PerceptionCheckScopeSelector,
  DetectionCheckScopeSelector,
  ConcealmentCheckScopeSelector,
  InvestigationCheckScopeSelector,
  SensoryCheckScope,
  SensoryCheckScopeSelector,
} from "../character/foundation/senses/scopes";

export interface AttributeCheckScope {
  readonly kind: "attribute";
  readonly attribute: AttributeKey;
}

export interface DerivedAttributeCheckScope {
  readonly kind: "derivedAttribute";
  readonly derivedAttribute: DerivedAttributeName;
}

export type CheckScope =
  | AttributeCheckScope
  | DerivedAttributeCheckScope
  | PerceptionCheckScope
  | DetectionCheckScope
  | ConcealmentCheckScope
  | InvestigationCheckScope;

/* Attribute and Derived Attribute selectors are necessarily exact. */
export type CheckScopeSelector =
  | AttributeCheckScope
  | DerivedAttributeCheckScope
  | PerceptionCheckScopeSelector
  | DetectionCheckScopeSelector
  | ConcealmentCheckScopeSelector
  | InvestigationCheckScopeSelector;
