import {
  INFORMATION_BANDS,
  type InformationBandOverride,
  type InformationThresholds,
} from "./information";
import { isSensoryChannelId, type SensoryChannelId } from "./channels";
import {
  isPerceptionPhenomenon,
  isSenseId,
  type PhenomenonSelector,
  type SenseSelector,
  type SensoryChannelSelector,
} from "./scopes";
import { SENSE_FAMILIES } from "./definitions";

export type SensoryValidationIssue =
  | { readonly type: "identifier-missing"; readonly path: string }
  | { readonly type: "sense-invalid"; readonly path: string }
  | { readonly type: "channel-invalid"; readonly path: string }
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

  if (selector.kind === "all") return true;

  if (selector.kind === "family") {
    return typeof selector.family === "string" &&
      (SENSE_FAMILIES as readonly string[]).includes(selector.family);
  }

  /*
   * A channel selector's channel must be REGISTERED, while a specific
   * selector's Sense must be too. Both are registry questions rather than
   * union questions now, which is what makes a host's own Sense addressable by
   * authored content without an engine edit.
   */
  if (selector.kind === "channel") return isSensoryChannelId(selector.channel);

  return selector.kind === "specific" && isSenseId(selector.sense);
}


export function isValidSensoryChannelSelector(
  value: unknown,
): value is SensoryChannelSelector {
  if (typeof value !== "object" || value === null) return false;

  const selector = value as Record<string, unknown>;

  return selector.kind === "all" ||
    (selector.kind === "specific" && isSensoryChannelId(selector.channel));
}


export function isValidSensoryChannelId(
  value: unknown,
): value is SensoryChannelId {
  return isSensoryChannelId(value);
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
