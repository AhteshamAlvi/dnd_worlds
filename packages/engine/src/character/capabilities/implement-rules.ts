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
 *   the Skill currently being invoked, when THIS function finds it available;
 *   every Technique the character actually holds;
 *   every Trait the character actually has.
 *
 *
 * THE SKILL IS RESOLVED HERE, NOT ACCEPTED
 *
 * This function used to take a `ResolvedSkillApplication` and read
 * `disposition === "available"` off it. That is the same mistake one level in:
 * a caller holding a plain object could write `{ skillId: "forbidden-art",
 * disposition: "available" }` and authorize a Skill the character has never
 * learned, whose execution requirements nobody evaluated. The branded output
 * would then certify it.
 *
 * So the caller names the Skill and nothing else. This function resolves the
 * character, resolves the definition through the supplied catalogs, checks
 * that the definition answers to the id it was asked for, and resolves the
 * application against the character's own capabilities and requirement
 * context. A disposition it did not produce is not evidence.
 *
 *
 * AND ALL THREE CATALOG LOOKUPS ARE PROVED, NOT JUST THE SKILL'S
 *
 * The identity check above arrived on the Skill branch alone, which left the
 * other two reading whatever a `CharacterContentCatalogs` handed back. A Trait
 * lookup answering with a DIFFERENT Trait had that Trait's rules collected,
 * branded authorized, and sourced to the Trait the character actually
 * possesses; one answering `null` threw. `resolveContentDefinition()` is the
 * one boundary all three now cross, and a lookup that cannot answer for an id
 * the resolved character HAS is a failure rather than a silent absence — see
 * `contentLookupError()`.
 *
 * Identity is not soundness, and the Skill needs both. A matching id says
 * WHICH Skill answered and nothing about whether it is one anybody can use:
 * `{ id: "measured-art", application: 42 }` passed the boundary, had its
 * nonsense application refused downstream, collected nothing, and returned an
 * ordinary empty SUCCESS — a broken catalog reading as a character with no
 * bonuses. So the Skill definition is validated with the same rules
 * registration applies before its application is read, which also lets the
 * application be passed explicitly rather than spread conditionally: a `null`
 * one used to make `resolveSkillApplication()` fall back to the ENGINE's own
 * registry, so availability came from the global catalog while the rules came
 * from the caller's.
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

import { findContentStructuralIssues } from "../rules/definitions";

import { getResolvedTechniqueIds } from "./resolution";
import {
  findSkillDefinitionStructuralIssues,
  getSkillDefinition,
  type SkillDefinition,
  type SkillId,
} from "./skills";
import { getTechniqueDefinition, type TechniqueDefinition } from "./techniques";
import { resolveSkillApplication } from "./application-resolution";


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


/* -------------------------------------------------------------------------- */
/* The catalog lookup boundary                                                */
/* -------------------------------------------------------------------------- */

/**
 * What one content lookup answered with, keeping every way it can be wrong
 * apart.
 *
 * The exact shape `resolveItemDefinition()` returns on the equipment side, and
 * it is here for the same reason. A `CharacterContentCatalogs` is three
 * functions a HOST wrote. Their signatures say `Definition | undefined` and
 * nothing obliges them to keep that promise.
 *
 * The Skill branch grew an identity check and the other two did not, which is
 * the same "a rule one caller enforces is a rule the others do not have"
 * failure the Item lookup had — one revision later and one layer up. A Trait
 * lookup answering with a DIFFERENT Trait had its rules collected, branded
 * authorized, and sourced to the Trait the character actually possesses; a
 * lookup answering `null` threw from `definition.implementConditionalRules`,
 * out of a function whose whole contract is to return an `EngineResult`.
 *
 * unknown    — the catalog holds no definition for an id the character's own
 *              resolution says they have (or, for the invoked Skill, for the
 *              id the caller named).
 * malformed  — the answer is not a definition object at all.
 * mismatched — a real definition answering to somebody else's id.
 */
type ContentLookupOutcome<D> =
  | { readonly ok: true; readonly definition: D }
  | {
      readonly ok: false;
      readonly issue: "unknown" | "malformed" | "mismatched";
      readonly actualId?: unknown;
    };


function resolveContentDefinition<D extends { readonly id: string }>(
  lookup: (id: string) => D | undefined,
  id: string,
): ContentLookupOutcome<D> {
  const candidate: unknown = lookup(id);

  if (candidate === undefined) return { ok: false, issue: "unknown" };

  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return { ok: false, issue: "malformed" };
  }

  const actualId = (candidate as { readonly id?: unknown }).id;

  if (actualId !== id) return { ok: false, issue: "mismatched", actualId };

  return { ok: true, definition: candidate as D };
}


/**
 * One refused lookup, as a diagnostic.
 *
 * A FAILURE in all three cases, and for all three kinds of content, rather
 * than a silent skip. Skipping would mean a character quietly losing a bonus
 * their sheet says they have — the same reasoning `take()` already applies to
 * malformed authored rules — and for a mismatch it would mean the catalog and
 * the resolved character disagreeing about what the character has, with
 * nobody told. The engine's own `characterContentCatalogs()` cannot produce
 * any of these: resolution and the collector read the same registries.
 */
function contentLookupError(
  kind: "Skill" | "Technique" | "Trait",
  id: string,
  outcome: Extract<ContentLookupOutcome<never>, { readonly ok: false }>,
): EngineError {
  const codes = {
    unknown: "unknown",
    malformed: "definition_invalid",
    mismatched: "definition_mismatch",
  } as const;

  const messages = {
    unknown: `No catalog defines ${kind} "${id}".`,
    malformed:
      `The catalog answered ${kind} "${id}" with something that is not a definition.`,
    mismatched:
      `The catalog answered ${kind} "${id}" with definition "${String(outcome.actualId)}".`,
  } as const;

  return {
    code: `capabilities.implement-rules.${kind.toLowerCase()}.${codes[outcome.issue]}`,
    message: messages[outcome.issue],
    audience: "developer",
    required: `a definition answering to "${id}"`,
    actual: outcome.issue === "mismatched" ? String(outcome.actualId) : outcome.issue,
  };
}


/**
 * Every implement-conditional rule this character may bring to this attempt.
 *
 * `invokedSkillId` names the Skill being used, not a resolved verdict about
 * it — see this file's header for why a caller's `disposition` is not
 * evidence. `undefined` means no Skill is being invoked, which is the ordinary
 * case for an Item's own use or a bare attack.
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
  invokedSkillId: SkillId | undefined,
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
   * The Skill being invoked, resolved rather than taken on trust, and only
   * when THIS function finds it invocable. A Skill the character does not
   * hold, or whose execution requirements are unsatisfied or unresolved, is
   * not a Skill they are using — reading its rules anyway would hand them a
   * bonus for an attempt they cannot make.
   */
  let invokedSkill: "available" | "unavailable" | "absent" = "absent";

  if (invokedSkillId !== undefined) {
    invokedSkill = "unavailable";

    /* Shape and identity first, through the boundary all three lookups share. */
    const lookup = resolveContentDefinition(
      (id) => catalogs.getSkillDefinition(id),
      invokedSkillId,
    );

    if (!lookup.ok) {
      errors.push(contentLookupError("Skill", invokedSkillId, lookup));
    } else {
      /*
       * The identity check proves WHICH Skill answered. It proves nothing
       * about whether the answer is a Skill anyone can use, and
       * `{ id: "measured-art", application: 42 }` passed it: the id matched,
       * so the branch proceeded, `resolveSkillApplication()` refused the
       * nonsense application, no rules were collected, and the collector
       * returned a perfectly ordinary EMPTY SUCCESS. A broken catalog read as
       * a character who simply had no bonuses.
       *
       * `application: null` was worse than useless — it split the authority.
       * `resolveSkillApplication()` resolves the effective application as
       * `input.definition ?? getSkillDefinition(skillId)?.application`, so a
       * null supplied definition FELL BACK to the engine's own registry:
       * availability came from the global catalog while the rules were read
       * off the caller's. Two catalogs, one attempt, and nothing said so.
       *
       * So the definition is validated with the SAME rules registration
       * applies, before anything is read off it, and the application is then
       * passed EXPLICITLY. Validation guarantees it is present — a Skill with
       * no application is refused by `findSkillDefinitionStructuralIssues()` —
       * which is what lets the conditional spread go, and with it the fallback
       * it was hiding.
       */
      const definitionIssues = [
        ...findContentStructuralIssues(lookup.definition),
        ...findSkillDefinitionStructuralIssues(lookup.definition),
      ];

      if (definitionIssues.length > 0) {
        errors.push(...definitionIssues.map((message): EngineError => ({
          code: "capabilities.implement-rules.skill.definition_invalid",
          message: `Skill "${invokedSkillId}": ${message}`,
          audience: "developer",
          required: "a structurally sound Skill definition",
          actual: message,
        })));
      } else {
        const definition = lookup.definition;

        const application = resolveSkillApplication({
          skillId: invokedSkillId,
          capabilities: resolved.capabilities,
          context: resolved.requirementContext,
          definition: definition.application,
        });

        if (application.success && application.payload.disposition === "available") {
          invokedSkill = "available";

          take(
            `Skill "${invokedSkillId}" application`,
            { type: "skill", id: invokedSkillId },
            definition.application.implementConditionalRules,
          );
        }
      }
    }
  }

  /*
   * Every possessed Technique and Trait, through the SAME boundary. These two
   * loops read their ids off the RESOLVED character, so a catalog that cannot
   * answer for one of them is a catalog disagreeing with the sheet — which is
   * a fault worth reporting rather than a bonus worth losing quietly.
   */
  for (const techniqueId of [...getResolvedTechniqueIds(resolved.capabilities)].sort()) {
    const lookup = resolveContentDefinition(
      (id) => catalogs.getTechniqueDefinition(id),
      techniqueId,
    );

    if (!lookup.ok) {
      errors.push(contentLookupError("Technique", techniqueId, lookup));

      continue;
    }

    take(
      `Technique "${techniqueId}"`,
      { type: "technique", id: techniqueId },
      lookup.definition.implementConditionalRules,
    );
  }

  for (const traitId of [...resolvedTraitIds(resolved.traits)].sort()) {
    const lookup = resolveContentDefinition(
      (id) => catalogs.getTraitDefinition(id),
      traitId,
    );

    if (!lookup.ok) {
      errors.push(contentLookupError("Trait", traitId, lookup));

      continue;
    }

    take(
      `Trait "${traitId}"`,
      { type: "trait", id: traitId },
      lookup.definition.implementConditionalRules,
    );
  }

  const trace = {
    root: createTraceNode({
      id: "character.capabilities.implement-rules",
      label: "Collect implement-conditional rules",
      formula:
        "the invoked Skill's application, every held Technique, every possessed Trait — each rule sourced to the content that declared it",
      inputs: {
        skill: { value: invokedSkillId ?? "none" },
        skillDisposition: { value: invokedSkill },
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
