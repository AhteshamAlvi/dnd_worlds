/*
 * Closed scope vocabulary for universal d20 checks.
 *
 * A CheckScope names one concrete check being resolved. A CheckScopeSelector
 * names the set of checks to which a modifier applies. Keeping those shapes
 * separate prevents a broad authored modifier such as "all hearing Detection"
 * from being mistaken for a concrete runtime check.
 */

import type { AttributeKey } from "../foundation/attributes/types";
import type { DerivedAttributeName } from "../foundation/attributes/derived/types";

export const SENSE_IDS = [
  "sight",
  "hearing",
  "smell",
  "taste",
  "touch",
  "extrasensory",
] as const;

export type SenseId = typeof SENSE_IDS[number];

export const PHYSICAL_SENSE_IDS = [
  "sight",
  "hearing",
  "smell",
  "taste",
  "touch",
] as const satisfies readonly SenseId[];

export const PERCEPTION_PHENOMENA = [
  "physical",
  "nen",
  "other-supernatural",
  "intent",
] as const;

export type PerceptionPhenomenon = typeof PERCEPTION_PHENOMENA[number];

export const DETECTION_MODES = [
  "passive",
  "active",
  "reaction",
] as const;

export type DetectionMode = typeof DETECTION_MODES[number];

export const CONCEALMENT_MODES = [
  "passive",
  "active",
  "established",
] as const;

export type ConcealmentMode = typeof CONCEALMENT_MODES[number];

export const DETECTION_SUBJECTS = [
  "entity",
  "object",
  "action",
  "threat",
  "trace",
  "environment",
  "phenomenon",
] as const;

export type DetectionSubject = typeof DETECTION_SUBJECTS[number];

export const INVESTIGATION_SUBJECTS = [
  "entity",
  "anatomy",
  "environment",
  "event",
  "evidence",
  "combat-style",
  "technique",
  "ability",
  "nen",
  "deception",
] as const;

export type InvestigationSubject = typeof INVESTIGATION_SUBJECTS[number];

export interface AttributeCheckScope {
  readonly kind: "attribute";
  readonly attribute: AttributeKey;
}

export interface DerivedAttributeCheckScope {
  readonly kind: "derivedAttribute";
  readonly derivedAttribute: DerivedAttributeName;
}

export interface PerceptionCheckScope {
  readonly kind: "perception";
  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;
}

export interface DetectionCheckScope {
  readonly kind: "detection";
  readonly mode: DetectionMode;
  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
}

export interface ConcealmentCheckScope {
  readonly kind: "concealment";
  readonly mode: ConcealmentMode;
  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
}

export interface InvestigationCheckScope {
  readonly kind: "investigation";
  readonly subject: InvestigationSubject;
  readonly sense?: SenseId;
  readonly phenomenon?: PerceptionPhenomenon;
}

export type CheckScope =
  | AttributeCheckScope
  | DerivedAttributeCheckScope
  | PerceptionCheckScope
  | DetectionCheckScope
  | ConcealmentCheckScope
  | InvestigationCheckScope;

export type SenseSelector =
  | { readonly kind: "all" }
  | { readonly kind: "all-physical" }
  | { readonly kind: "specific"; readonly sense: SenseId };

export type PhenomenonSelector =
  | { readonly kind: "all" }
  | {
      readonly kind: "specific";
      readonly phenomenon: PerceptionPhenomenon;
    };

export type DetectionModeSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly mode: DetectionMode };

export type ConcealmentModeSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly mode: ConcealmentMode };

export type DetectionSubjectSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly subject: DetectionSubject };

export type InvestigationSubjectSelector =
  | { readonly kind: "all" }
  | {
      readonly kind: "specific";
      readonly subject: InvestigationSubject;
    };

export interface PerceptionCheckScopeSelector {
  readonly kind: "perception";
  readonly sense?: SenseSelector;
  readonly phenomenon?: PhenomenonSelector;
}

export interface DetectionCheckScopeSelector {
  readonly kind: "detection";
  readonly mode?: DetectionModeSelector;
  readonly sense?: SenseSelector;
  readonly phenomenon?: PhenomenonSelector;
  readonly subject?: DetectionSubjectSelector;
}

export interface ConcealmentCheckScopeSelector {
  readonly kind: "concealment";
  readonly mode?: ConcealmentModeSelector;
  readonly sense?: SenseSelector;
  readonly phenomenon?: PhenomenonSelector;
  readonly subject?: DetectionSubjectSelector;
}

export interface InvestigationCheckScopeSelector {
  readonly kind: "investigation";
  readonly subject?: InvestigationSubjectSelector;
  readonly sense?: SenseSelector;
  readonly phenomenon?: PhenomenonSelector;
}

/* Attribute and Derived Attribute selectors are necessarily exact. */
export type CheckScopeSelector =
  | AttributeCheckScope
  | DerivedAttributeCheckScope
  | PerceptionCheckScopeSelector
  | DetectionCheckScopeSelector
  | ConcealmentCheckScopeSelector
  | InvestigationCheckScopeSelector;

