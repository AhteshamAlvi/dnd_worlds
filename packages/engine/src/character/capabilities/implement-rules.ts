/*
 * Which implement-conditional rules are actually in play, derived by the
 * engine from content the character actually has.
 *
 *
 * WHY THIS FILE EXISTS
 *
 * `equipment/conditions.ts` evaluates a rule against the resolved implements
 * and routes its single output to a check modifier or to an Item performance
 * contribution. It deliberately knows nothing about Skills, Techniques or
 * Traits, and it should not — a condition is tested against implement facts,
 * and teaching equipment what a Trait is would put the dependency the wrong
 * way round.
 *
 * Assembling the list was therefore left to "the caller", which turned out to
 * mean anybody: a host, a UI or a test could hand preparation a rule sourced
 * to `{ type: "trait", id: "iron-grip" }` for a Trait the character has never
 * had, and the resulting check modifier stacked with the real ones and traced
 * identically to them. Provenance a caller asserts is not provenance; it is a
 * field.
 *
 * So the derivation lives HERE, above both layers, and it is the only thing
 * that can produce the branded collection those matchers accept. It reads
 * three sources and no others:
 *
 *   the Skill application currently being invoked, when it is available;
 *   every Technique the character actually holds;
 *   every Trait the character actually has.
 *
 * "Actually" is the resolved reading in each case — held, not merely unlocked,
 * and granted content counts exactly as authored content does. A merely
 * OFFERED Trait contributes nothing, because an offer is permission to acquire
 * rather than possession, and a rule firing off one would be a bonus from a
 * Trait the character declined.
 *
 *
 * WHAT IT DOES NOT DECIDE
 *
 * Whether a rule MATCHES. Collection asks only "may this rule be considered at
 * all", which is a question about the character; the condition itself is
 * tested against the selected implements by conditions.ts, which is where the
 * Item facts are. Splitting it the other way — filtering by condition here —
 * would put two halves of one decision in two files.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";

import {
  authorizeImplementConditionalRules,
  findImplementConditionalRulesIssues,
  type AuthorizedImplementConditionalRules,
  type ImplementConditionalRule,
  type SourcedImplementConditionalRule,
} from "../equipment/conditions";

import { getTraitDefinition, resolvedTraitIds, type TraitDefinition } from "../identity/traits";
import { resolveCharacter } from "../resolution";
import type { Character } from "../types";

import { getResolvedTechniqueIds } from "./resolution";
import { getSkillDefinition, type SkillDefinition } from "./skills";
import { getTechniqueDefinition, type TechniqueDefinition } from "./techniques";
import type { ResolvedSkillApplication } from "./application-resolution";


/**
 * How this module is told what the catalogs contain.
 *
 * Handed in rather than imported for the reason every other unbound lookup in
 * this engine is: a host resolving against content it registered must get the
 * same answer the engine's own catalog gives, and a collector that reached for
 * a global would silently see a different world than the resolver beside it.
 * `characterContentCatalogs()` supplies the engine's own.
 */
export interface CharacterContentCatalogs {
  readonly getTraitDefinition: (traitId: string) => TraitDefinition | undefined;
  readonly getTechniqueDefinition: (
    techniqueId: string,
  ) => TechniqueDefinition | undefined;
  readonly getSkillDefinition: (skillId: string) => SkillDefinition | undefined;
}


/** The engine's own catalogs, for a caller with no reason to substitute any. */
export function characterContentCatalogs(): CharacterContentCatalogs {
  return { getTraitDefinition, getTechniqueDefinition, getSkillDefinition };
}


function ruleSourceError(
  where: string,
  issue: EngineError,
): EngineError {
  return {
    ...issue,
    message: `${where}: ${issue.message}`,
  };
}


/**
 * Every implement-conditional rule this character may bring to this attempt.
 *
 * Returns the BRANDED collection rather than a bare array, because the brand
 * is the whole mechanism: `collectMatchedCheckModifiers()` and
 * `collectMatchedPerformanceEffects()` accept nothing else, and this function
 * is the only thing in the engine that can make one. The rules themselves are
 * on the payload's `rules`, in a stable order — Skill first, then Techniques,
 * then Traits, each in resolved-id order — so two runs against one character
 * produce byte-identical output.
 *
 * FAILS on malformed authored content rather than skipping it. A Trait whose
 * `implementConditionalRules` is not a list is a registration-barrier fault
 * that reached here anyway (a host's unchecked JSON, a definition registered
 * before the barrier covered the field), and quietly dropping it would let a
 * character silently lose a bonus their sheet says they have.
 */
export function collectImplementConditionalRules(
  character: Character,
  application: ResolvedSkillApplication | undefined,
  catalogs: CharacterContentCatalogs,
): EngineResult<AuthorizedImplementConditionalRules> {
  const resolvedResult = resolveCharacter(character);

  if (!resolvedResult.success) return resolvedResult;

  const resolved = resolvedResult.payload;

  const errors: EngineError[] = [];
  const collected: SourcedImplementConditionalRule[] = [];

  function take(
    where: string,
    source: ContributionSourceRef,
    declared: unknown,
  ): void {
    const issues = findImplementConditionalRulesIssues(declared);

    if (issues.length > 0) {
      errors.push(...issues.map((issue) => ruleSourceError(where, issue)));

      return;
    }

    for (const rule of (declared ?? []) as readonly ImplementConditionalRule[]) {
      collected.push({ source, rule });
    }
  }

  /*
   * The Skill being invoked, and only when it is actually invocable. A Skill
   * the character does not hold, or whose execution requirements are refused,
   * is not a Skill they are using — reading its rules anyway would hand them a
   * bonus for an attempt they cannot make.
   */
  if (application !== undefined && application.disposition === "available") {
    const definition = catalogs.getSkillDefinition(application.skillId);

    if (definition !== undefined) {
      take(
        `Skill "${application.skillId}" application`,
        { type: "skill", id: application.skillId },
        definition.application?.implementConditionalRules,
      );
    }
  }

  for (const techniqueId of [...getResolvedTechniqueIds(resolved.capabilities)].sort()) {
    const definition = catalogs.getTechniqueDefinition(techniqueId);

    if (definition === undefined) continue;

    take(
      `Technique "${techniqueId}"`,
      { type: "technique", id: techniqueId },
      definition.implementConditionalRules,
    );
  }

  for (const traitId of [...resolvedTraitIds(resolved.traits)].sort()) {
    const definition = catalogs.getTraitDefinition(traitId);

    if (definition === undefined) continue;

    take(
      `Trait "${traitId}"`,
      { type: "trait", id: traitId },
      definition.implementConditionalRules,
    );
  }

  const trace = {
    root: createTraceNode({
      id: "character.capabilities.implement-rules",
      label: "Collect implement-conditional rules",
      formula:
        "the invoked Skill's application, every held Technique, every possessed Trait — each rule sourced to the content that declared it",
      inputs: {
        skill: { value: application?.skillId ?? "none" },
        rules: { value: collected.length },
      },
      output: collected.length,
    }),
  };

  if (errors.length > 0) {
    return engineFailure(trace, errors as NonEmptyArray<EngineError>);
  }

  return engineSuccess(authorizeImplementConditionalRules(collected), trace);
}
