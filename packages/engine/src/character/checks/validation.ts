/*
 * Is this a real check scope, and is this a real selector for one?
 *
 * Lives beside the vocabulary rather than beside the resolver, because it is
 * the vocabulary's own rule: what a scope may say is decided by the closed
 * lists in scopes.ts, and anything validating against a second copy of those
 * lists would be a second answer to the same question.
 *
 * Both directions are needed and they are not the same check. A SCOPE names one
 * concrete check and must be fully specified; a SELECTOR names a set and may
 * leave any dimension open. "All hearing Detection" is a valid selector and not
 * a check anyone can roll.
 */

import { ATTRIBUTE_KEYS } from "../foundation/attributes/base";
import { DERIVED_ATTRIBUTE_NAMES } from "../foundation/attributes/derived/types";
import {
  CONCEALMENT_MODES,
  DETECTION_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
  PERCEPTION_PHENOMENA,
  SENSE_IDS,
  type CheckScope,
  type CheckScopeSelector,
  type ConcealmentMode,
  type DetectionMode,
  type DetectionSubject,
  type InvestigationSubject,
  type PerceptionPhenomenon,
  type SenseId,
} from "./scopes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isSense(value: unknown): value is SenseId {
  return includes(SENSE_IDS, value);
}

function isPhenomenon(value: unknown): value is PerceptionPhenomenon {
  return includes(PERCEPTION_PHENOMENA, value);
}

function isDetectionMode(value: unknown): value is DetectionMode {
  return includes(DETECTION_MODES, value);
}

function isConcealmentMode(value: unknown): value is ConcealmentMode {
  return includes(CONCEALMENT_MODES, value);
}

function isDetectionSubject(value: unknown): value is DetectionSubject {
  return includes(DETECTION_SUBJECTS, value);
}

function isInvestigationSubject(value: unknown): value is InvestigationSubject {
  return includes(INVESTIGATION_SUBJECTS, value);
}

function isSenseSelector(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all" || value.kind === "all-physical") return true;
  return value.kind === "specific" && isSense(value.sense);
}

function isPhenomenonSelector(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all") return true;
  return value.kind === "specific" && isPhenomenon(value.phenomenon);
}

function isModeSelector(
  value: unknown,
  modeGuard: (mode: unknown) => boolean,
): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all") return true;
  return value.kind === "specific" && modeGuard(value.mode);
}

function isSubjectSelector(
  value: unknown,
  subjectGuard: (subject: unknown) => boolean,
): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all") return true;
  return value.kind === "specific" && subjectGuard(value.subject);
}

export function isValidCheckScope(value: unknown): value is CheckScope {
  if (!isRecord(value)) return false;

  switch (value.kind) {
    case "attribute":
      return includes(ATTRIBUTE_KEYS, value.attribute);
    case "derivedAttribute":
      return includes(DERIVED_ATTRIBUTE_NAMES, value.derivedAttribute);
    case "perception":
      return isSense(value.sense) && isPhenomenon(value.phenomenon);
    case "detection":
      return isDetectionMode(value.mode) && isSense(value.sense) &&
        isPhenomenon(value.phenomenon) && isDetectionSubject(value.subject);
    case "concealment":
      return isConcealmentMode(value.mode) && isSense(value.sense) &&
        isPhenomenon(value.phenomenon) && isDetectionSubject(value.subject);
    case "investigation":
      return isInvestigationSubject(value.subject) &&
        (value.sense === undefined || isSense(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenon(value.phenomenon));
    default:
      return false;
  }
}

export function isValidCheckScopeSelector(
  value: unknown,
): value is CheckScopeSelector {
  if (!isRecord(value)) return false;

  switch (value.kind) {
    case "attribute":
      return includes(ATTRIBUTE_KEYS, value.attribute);
    case "derivedAttribute":
      return includes(DERIVED_ATTRIBUTE_NAMES, value.derivedAttribute);
    case "perception":
      return (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon));
    case "detection":
      return (value.mode === undefined ||
          isModeSelector(value.mode, isDetectionMode)) &&
        (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon)) &&
        (value.subject === undefined ||
          isSubjectSelector(value.subject, isDetectionSubject));
    case "concealment":
      return (value.mode === undefined ||
          isModeSelector(value.mode, isConcealmentMode)) &&
        (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon)) &&
        (value.subject === undefined ||
          isSubjectSelector(value.subject, isDetectionSubject));
    case "investigation":
      return (value.subject === undefined ||
          isSubjectSelector(value.subject, isInvestigationSubject)) &&
        (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon));
    default:
      return false;
  }
}

