import {
  INFORMATION_BANDS,
  type InformationBandOverride,
  type InformationThresholds,
} from "./information";
import {
  isPerceptionPhenomenon,
  isSenseId,
  type PhenomenonSelector,
  type SenseSelector,
} from "./scopes";
import type { SensorySignature } from "./signatures";

export type SensoryValidationIssue =
  | { readonly type: "identifier-missing"; readonly path: string }
  | { readonly type: "sense-invalid"; readonly path: string }
  | { readonly type: "phenomenon-invalid"; readonly path: string }
  | { readonly type: "difficulty-invalid"; readonly path: string; readonly actual: number }
  | { readonly type: "thresholds-invalid"; readonly path: string }
  | { readonly type: "band-invalid"; readonly path: string };

/*
 * Selector guards for the sensory vocabulary.
 *
 * checks/validation.ts imports these rather than declaring its own, so content
 * validation and sensory validation cannot disagree about what a well-formed
 * sense or phenomenon selector is.
 */
export function isValidSenseSelector(value: unknown): value is SenseSelector {
  if (typeof value !== "object" || value === null) return false;
  const selector = value as Record<string, unknown>;
  return selector.kind === "all" || selector.kind === "all-physical" ||
    (selector.kind === "specific" && isSenseId(selector.sense));
}

export function isValidPhenomenonSelector(
  value: unknown,
): value is PhenomenonSelector {
  if (typeof value !== "object" || value === null) return false;
  const selector = value as Record<string, unknown>;
  return selector.kind === "all" ||
    (selector.kind === "specific" && isPerceptionPhenomenon(selector.phenomenon));
}

export function isValidInformationThresholds(
  value: InformationThresholds,
): boolean {
  return Number.isFinite(value.minimal) &&
    value.minimal < value.partial &&
    value.partial < value.substantial &&
    value.substantial < value.full;
}

export function findInformationOverrideIssues(
  override: InformationBandOverride,
  path = "information",
): readonly SensoryValidationIssue[] {
  const issues: SensoryValidationIssue[] = [];
  if (override.thresholds !== undefined && !isValidInformationThresholds(override.thresholds)) {
    issues.push({ type: "thresholds-invalid", path: `${path}.thresholds` });
  }
  for (const [field, band] of [["floor", override.floor], ["cap", override.cap]] as const) {
    if (band !== undefined && !(INFORMATION_BANDS as readonly unknown[]).includes(band)) {
      issues.push({ type: "band-invalid", path: `${path}.${field}` });
    }
  }
  return issues;
}

export function findSensorySignatureIssues(
  signature: SensorySignature,
  path = "signature",
): readonly SensoryValidationIssue[] {
  const issues: SensoryValidationIssue[] = [];
  if (signature.id.trim().length === 0) {
    issues.push({ type: "identifier-missing", path: `${path}.id` });
  }
  if (!isSenseId(signature.sense)) {
    issues.push({ type: "sense-invalid", path: `${path}.sense` });
  }
  if (!isPerceptionPhenomenon(signature.phenomenon)) {
    issues.push({ type: "phenomenon-invalid", path: `${path}.phenomenon` });
  }
  if (
    signature.reception.kind === "uncertain" &&
    (!Number.isInteger(signature.reception.difficulty) ||
      signature.reception.difficulty < 1 ||
      signature.reception.difficulty > 20)
  ) {
    issues.push({
      type: "difficulty-invalid",
      path: `${path}.reception.difficulty`,
      actual: signature.reception.difficulty,
    });
  }
  return issues;
}
