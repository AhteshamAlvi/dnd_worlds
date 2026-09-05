/*
 * The closed sensory vocabulary — declared here and nowhere else.
 *
 * Senses, perception phenomena, Detection and Concealment modes, Detection and
 * Investigation subjects, the four sensory check scopes, their selectors, and
 * sense/phenomenon selector matching all live in this file. checks/scopes.ts
 * imports them to compose CheckScope and re-exports them; checks/matching.ts
 * imports the matchers rather than reimplementing them.
 *
 * It reads backwards at first that the universal check module depends on a
 * Foundation domain, but that is the direction that already holds: scopes.ts
 * imports AttributeKey and DerivedAttributeName the same way. A check is
 * something you make AGAINST a capability, so the capability names the terms.
 *
 * The rule this file exists to keep: exactly one declaration per closed list.
 * A second structurally identical copy type-checks perfectly against this one,
 * which means divergence between them is silent — a seventh sense added here
 * and not there would leave modifier matching and profile resolution quietly
 * disagreeing. architecture.test.ts fails if a duplicate reappears.
 */

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

export const DETECTION_MODES = ["passive", "active", "reaction"] as const;
export type DetectionMode = typeof DETECTION_MODES[number];

export const CONCEALMENT_MODES = ["passive", "active", "established"] as const;
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

export type SenseSelector =
  | { readonly kind: "all" }
  | { readonly kind: "all-physical" }
  | { readonly kind: "specific"; readonly sense: SenseId };

export type PhenomenonSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly phenomenon: PerceptionPhenomenon };

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
  | { readonly kind: "specific"; readonly subject: InvestigationSubject };

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

export type SensoryCheckScope =
  | PerceptionCheckScope
  | DetectionCheckScope
  | ConcealmentCheckScope
  | InvestigationCheckScope;

export type SensoryCheckScopeSelector =
  | PerceptionCheckScopeSelector
  | DetectionCheckScopeSelector
  | ConcealmentCheckScopeSelector
  | InvestigationCheckScopeSelector;

export function isSenseId(value: unknown): value is SenseId {
  return typeof value === "string" && (SENSE_IDS as readonly string[]).includes(value);
}

export function isPerceptionPhenomenon(value: unknown): value is PerceptionPhenomenon {
  return typeof value === "string" &&
    (PERCEPTION_PHENOMENA as readonly string[]).includes(value);
}

export function matchesSenseSelector(selector: SenseSelector, sense: SenseId): boolean {
  if (selector.kind === "all") return true;
  if (selector.kind === "all-physical") {
    return (PHYSICAL_SENSE_IDS as readonly SenseId[]).includes(sense);
  }
  return selector.sense === sense;
}

export function matchesPhenomenonSelector(
  selector: PhenomenonSelector,
  phenomenon: PerceptionPhenomenon,
): boolean {
  return selector.kind === "all" || selector.phenomenon === phenomenon;
}
