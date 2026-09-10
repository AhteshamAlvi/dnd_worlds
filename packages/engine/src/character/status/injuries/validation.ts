/*
 * Injury CATALOG validation — the content half.
 *
 * Two questions are asked of an authored Injury, and only one of them is
 * Body's:
 *
 *   ANATOMICAL   is the applicability declared, and is the recovery ceiling a
 *                usable fraction? Body's rules, checked by Body —
 *                findAnatomicalInjuryCatalogIssues.
 *
 *   CONTENT      is the registry entry well-formed, and are the Effects the
 *                definition carries valid? The catalog's own business, and
 *                this file's.
 *
 * findInjuryCatalogIssues composes both, so a caller checking the Injury
 * catalog gets one answer and neither half can be forgotten. The anatomical
 * half is delegated rather than reimplemented: a second copy of the ceiling
 * rule here is exactly how the two would come to disagree.
 *
 * Effect validity is deliberately NOT re-derived either. rules/validation.ts
 * owns what a malformed Effect is, and character/catalogs.ts already walks
 * every registered definition — including an Injury's `treatmentEffects` — 
 * through it. Checking Effects again here would be the same value judged in
 * two places.
 */

import { findAnatomicalInjuryCatalogIssues } from "../../foundation/body/injuries/validation";
import type { AnatomicalInjuryDefinition } from "../../foundation/body/injuries/types";

import { injuryRegistry } from "./definitions";

/**
 * Validate the authored Injury catalog, both halves.
 *
 * Registry/content issues are checked first, followed by the anatomical
 * applicability and recovery-contract rules Body owns.
 *
 * Whether selectors or Special Point references are compatible with a
 * particular character cannot be determined here, because anatomy and
 * BodyPartDefinitions are character/body-plan dependent — that is
 * foundation/body/injuries/validation.ts's findInjuryLocationIssues.
 */
export function findInjuryCatalogIssues(): readonly string[] {
  return injuryRegistry.findCatalogIssues();
}


/**
 * An Injury's own structure: its applicability and its recovery contract.
 *
 * Handed to the registry, so a malformed Injury is refused rather than stored.
 * Both halves are judged against the definition alone — whether its selectors
 * fit a PARTICULAR character's anatomy is a different question, and belongs to
 * foundation/body/injuries/validation.ts's findInjuryLocationIssues.
 */
export function findInjuryDefinitionStructuralIssues(
  definition: unknown,
): readonly string[] {
  if (typeof definition !== "object" || definition === null) return [];

  const injury = definition as AnatomicalInjuryDefinition;

  return findAnatomicalInjuryCatalogIssues([injury])
    .map((issue) => issue.replace(/^Injury "[^"]*" /, ""));
}
