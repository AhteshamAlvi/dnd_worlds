/*
 * Injuries — lasting wounds.
 *
 * An injury is mechanically a Condition that heals: it applies while it is
 * present, contributes the same universal Effects, and expires. It gets its
 * own catalog rather than sharing the Condition one because the two are asked
 * about separately — "what is wrong with this character right now" and "what
 * are they recovering from" are different questions on a sheet, and a healing
 * track only belongs to one of them.
 *
 * Injuries share Conditions' stage/severity/expiry vocabulary — see
 * status/stage.ts — since "worsens, stacks, eventually heals" is exactly the
 * same shape as a Condition's lifecycle. Severity in particular is the
 * concrete case that vocabulary was built for: two broken ribs are not one
 * broken rib, and nothing here decides what that means numerically — the
 * Workbench author does, per-injury, the same as every other Effect.
 *
 * The authored catalog is deliberately empty. The d10 injury table (Battered,
 * Deep wound, Broken, Severe, Maiming) and Strain's 5-point collapse are
 * balance work from Rulebook "04 Combat/Injury Recovery and Conditions.md",
 * not refactor work; the shape they will be authored into is what this file
 * establishes. A host may register its own in the meantime, exactly as with
 * any other domain.
 */

import {
  createRegistry,
  scanReferences,
} from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";
import {
  findStagedEntryValidationIssues,
  findStageTrackIssues,
  type StagedCharacterEntry,
  type StagedContent,
  type StagedEntryValidationIssue,
} from "./stage";

export type InjuryId = string;

export interface InjuryDefinition extends EffectfulDefinition, StagedContent {}

/**
 * An injury a character currently carries.
 */
export interface CharacterInjury extends StagedCharacterEntry {
  readonly injuryId: InjuryId;
}

export const INJURY_DEFINITIONS = {} as const satisfies Record<
  string,
  InjuryDefinition
>;

const INJURY_REGISTRY = createRegistry<InjuryDefinition>(
  "Injury",
  INJURY_DEFINITIONS,
);

export type KnownInjuryId = keyof typeof INJURY_DEFINITIONS;

export function isKnownInjuryId(injuryId: InjuryId): boolean {
  return INJURY_REGISTRY.isKnownId(injuryId);
}

export function getInjuryDefinition(
  injuryId: InjuryId,
): InjuryDefinition | undefined {
  return INJURY_REGISTRY.get(injuryId);
}

export type InjuryValidationIssue =
  | {
      readonly type: "unknown-injury";
      readonly injuryId: InjuryId;
    }
  | {
      readonly type: "duplicate-injury";
      readonly injuryId: InjuryId;
    }
  | {
      readonly type: "invalid-injury-lifecycle";
      readonly injuryId: InjuryId;
      readonly issue: StagedEntryValidationIssue;
    };

export function findInjuryValidationIssues(
  injuries: readonly CharacterInjury[],
): readonly InjuryValidationIssue[] {
  const issues: InjuryValidationIssue[] = scanReferences(
    injuries.map((injury) => injury.injuryId),
    isKnownInjuryId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-injury" : "duplicate-injury",
    injuryId: issue.id,
  }));

  const unknown = new Set(
    issues
      .filter((issue) => issue.type === "unknown-injury")
      .map((issue) => issue.injuryId),
  );

  const checked = new Set<InjuryId>();

  for (const injury of injuries) {
    if (unknown.has(injury.injuryId) || checked.has(injury.injuryId)) {
      continue;
    }

    checked.add(injury.injuryId);

    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;

    for (const lifecycleIssue of findStagedEntryValidationIssues(
      definition,
      injury,
    )) {
      issues.push({
        type: "invalid-injury-lifecycle",
        injuryId: injury.injuryId,
        issue: lifecycleIssue,
      });
    }
  }

  return issues;
}

export function findInjuryCatalogIssues(): readonly string[] {
  const issues = [...INJURY_REGISTRY.findCatalogIssues()];

  for (const injury of INJURY_REGISTRY.all()) {
    issues.push(...findStageTrackIssues("Injury", injury.id, injury));
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const injuryRegistry = INJURY_REGISTRY;
