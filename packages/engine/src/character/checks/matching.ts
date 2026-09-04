/* Directional matching from an authored modifier selector to a concrete check. */

import {
  PHYSICAL_SENSE_IDS,
  type CheckScope,
  type CheckScopeSelector,
  type ConcealmentMode,
  type ConcealmentModeSelector,
  type DetectionMode,
  type DetectionModeSelector,
  type DetectionSubject,
  type DetectionSubjectSelector,
  type InvestigationSubject,
  type InvestigationSubjectSelector,
  type PerceptionPhenomenon,
  type PhenomenonSelector,
  type SenseId,
  type SenseSelector,
} from "./scopes";

export function matchesSenseSelector(
  selector: SenseSelector,
  sense: SenseId,
): boolean {
  switch (selector.kind) {
    case "all":
      return true;
    case "all-physical":
      return (PHYSICAL_SENSE_IDS as readonly SenseId[]).includes(sense);
    case "specific":
      return selector.sense === sense;
  }
}

export function matchesPhenomenonSelector(
  selector: PhenomenonSelector,
  phenomenon: PerceptionPhenomenon,
): boolean {
  return selector.kind === "all" || selector.phenomenon === phenomenon;
}

function matchesDetectionModeSelector(
  selector: DetectionModeSelector,
  mode: DetectionMode,
): boolean {
  return selector.kind === "all" || selector.mode === mode;
}

function matchesConcealmentModeSelector(
  selector: ConcealmentModeSelector,
  mode: ConcealmentMode,
): boolean {
  return selector.kind === "all" || selector.mode === mode;
}

function matchesDetectionSubjectSelector(
  selector: DetectionSubjectSelector,
  subject: DetectionSubject,
): boolean {
  return selector.kind === "all" || selector.subject === subject;
}

function matchesInvestigationSubjectSelector(
  selector: InvestigationSubjectSelector,
  subject: InvestigationSubject,
): boolean {
  return selector.kind === "all" || selector.subject === subject;
}

export function matchesCheckScope(
  selector: CheckScopeSelector,
  scope: CheckScope,
): boolean {
  if (selector.kind !== scope.kind) return false;

  switch (selector.kind) {
    case "attribute":
      return scope.kind === "attribute" && selector.attribute === scope.attribute;

    case "derivedAttribute":
      return scope.kind === "derivedAttribute" &&
        selector.derivedAttribute === scope.derivedAttribute;

    case "perception":
      return scope.kind === "perception" &&
        (selector.sense === undefined ||
          matchesSenseSelector(selector.sense, scope.sense)) &&
        (selector.phenomenon === undefined ||
          matchesPhenomenonSelector(selector.phenomenon, scope.phenomenon));

    case "detection":
      return scope.kind === "detection" &&
        (selector.mode === undefined ||
          matchesDetectionModeSelector(selector.mode, scope.mode)) &&
        (selector.sense === undefined ||
          matchesSenseSelector(selector.sense, scope.sense)) &&
        (selector.phenomenon === undefined ||
          matchesPhenomenonSelector(selector.phenomenon, scope.phenomenon)) &&
        (selector.subject === undefined ||
          matchesDetectionSubjectSelector(selector.subject, scope.subject));

    case "concealment":
      return scope.kind === "concealment" &&
        (selector.mode === undefined ||
          matchesConcealmentModeSelector(selector.mode, scope.mode)) &&
        (selector.sense === undefined ||
          matchesSenseSelector(selector.sense, scope.sense)) &&
        (selector.phenomenon === undefined ||
          matchesPhenomenonSelector(selector.phenomenon, scope.phenomenon)) &&
        (selector.subject === undefined ||
          matchesDetectionSubjectSelector(selector.subject, scope.subject));

    case "investigation":
      return scope.kind === "investigation" &&
        (selector.subject === undefined ||
          matchesInvestigationSubjectSelector(selector.subject, scope.subject)) &&
        (selector.sense === undefined ||
          (scope.sense !== undefined &&
            matchesSenseSelector(selector.sense, scope.sense))) &&
        (selector.phenomenon === undefined ||
          (scope.phenomenon !== undefined &&
            matchesPhenomenonSelector(selector.phenomenon, scope.phenomenon)));
  }
}

export function isSameCheckScope(
  left: CheckScope,
  right: CheckScope,
): boolean {
  if (left.kind !== right.kind) return false;

  switch (left.kind) {
    case "attribute":
      return right.kind === "attribute" && left.attribute === right.attribute;
    case "derivedAttribute":
      return right.kind === "derivedAttribute" &&
        left.derivedAttribute === right.derivedAttribute;
    case "perception":
      return right.kind === "perception" &&
        left.sense === right.sense && left.phenomenon === right.phenomenon;
    case "detection":
      return right.kind === "detection" && left.mode === right.mode &&
        left.sense === right.sense && left.phenomenon === right.phenomenon &&
        left.subject === right.subject;
    case "concealment":
      return right.kind === "concealment" && left.mode === right.mode &&
        left.sense === right.sense && left.phenomenon === right.phenomenon &&
        left.subject === right.subject;
    case "investigation":
      return right.kind === "investigation" && left.subject === right.subject &&
        left.sense === right.sense && left.phenomenon === right.phenomenon;
  }
}

