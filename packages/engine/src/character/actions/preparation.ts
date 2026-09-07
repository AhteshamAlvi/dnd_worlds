/*
 * The seam between a Character and a neutral action.
 *
 * `actions/` deliberately has no idea what a Trait, a Mastery rank or a
 * standard modifier is, and it must not gain one: the moment neutral action
 * preparation can evaluate a Requirement, there are two requirement systems
 * and they will eventually disagree. But something has to turn a character
 * into the three things preparation and adjudication need, and until now that
 * something was "whatever the caller does", which is not a boundary, it is an
 * absence of one.
 *
 * This is the boundary, and it points one way:
 *
 *   character/rules + character/checks   →   this adapter   →   actions/
 *
 * It may import neutral `actions/`. Neutral `actions/` may never import it,
 * and nothing else under `character/` may import it either — that second rule
 * matters as much as the first, because a Character file reaching for the
 * adapter would pull the neutral vocabulary back down into the layer that is
 * supposed to sit below it. architecture.test.ts enforces all three.
 *
 *
 * WHAT IT WILL NOT SUPPLY
 *
 * Fixed difficulty, opposed-check tie policy, target-side contributions,
 * spatial facts and GM rulings are all absent by design. Every one of them
 * belongs to somebody else — the action mechanic, the target's own adapter,
 * the host, the GM — and a Character adapter that answered them would be
 * quietly deciding things the character has no standing to decide.
 *
 * For an OPPOSED check that means calling this once per participant and
 * combining the results above it. There is no two-sided entry point here on
 * purpose: a single call that took both characters would have to decide which
 * one is the initiator, and that is the calling mechanic's question.
 */

import type { CheckScope } from "../../checks/scopes";
import type {
  CheckBaseContribution,
  CheckModifierContribution,
} from "../../checks/types";
import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import type { EligibilityFinding } from "../../actions";

import {
  collectCharacterCheckModifiers,
  type CheckInvocation,
} from "../checks/invocation";
import type { Requirement } from "../rules/requirements";
import { meetsRequirement, type RequirementContext } from "../rules/resolution";
import type { ResolvedCharacter } from "../resolution";
import type { Character } from "../types";


/**
 * One Requirement, with the id its finding will carry.
 *
 * The id is supplied rather than derived from the Requirement, because a
 * finding id is what the GM overrides by name during adjudication and what a
 * host shows in a list. Deriving it from the requirement's shape would make it
 * change whenever the requirement was rephrased.
 */
export interface NamedRequirement {
  readonly id: string;
  readonly requirement: Requirement;

  /** Human-readable, for a GM reading a proposal. */
  readonly summary?: string;
}


export interface CharacterActionInputs {
  readonly resolved: ResolvedCharacter;

  /** What the action demands of the character. Evaluated, never invented. */
  readonly requirements?: readonly NamedRequirement[];

  /**
   * The scope of the action's check, when it has one.
   *
   * Only the governing contribution is read from it. Everything else about
   * the check — the difficulty, the tie policy, the opposing side — belongs to
   * the mechanic that owns the check.
   */
  readonly checkScope?: CheckScope;

  /** What the player selected for this check, and what the GM handed in. */
  readonly invocation?: CheckInvocation;
}


export interface CharacterActionContribution {
  /** Normalised, ready for ActionProposal.findings. */
  readonly eligibility: readonly EligibilityFinding[];

  /** The governing score's contribution, when a check scope was supplied. */
  readonly baseContributions: readonly CheckBaseContribution[];

  /** Persistent, invoked and contextual, through the one canonical path. */
  readonly modifiers: readonly CheckModifierContribution[];
}


/**
 * The sheet collection a Requirement reads, when that collection is absent.
 *
 * Used to tell "the character does not have it" from "the sheet does not
 * record it". Those are different answers: Character collections are optional
 * so a half-built sheet can still be resolved, and reporting an unrecorded
 * Trait list as "you lack that Trait" would refuse an action for a reason that
 * is not true yet.
 *
 * Read from the CHARACTER rather than from RequirementContext, because
 * buildRequirementContext() collapses every absent collection to an empty
 * array on the way in — so by the time a requirement is evaluated, "no traits
 * recorded" and "recorded, and none" are already the same value. That is fine
 * for a yes/no evaluator and not fine for a finding that a GM will read, so
 * the distinction is recovered here, at the only layer that reports it.
 */
function unrecordedCollection(
  requirement: Requirement,
  character: Character,
): string | undefined {
  switch (requirement.type) {
    case "hasSpecies":
    case "hasSubspecies":
      return character.species === undefined ? "species" : undefined;

    case "hasClan":
      return character.clans === undefined ? "clans" : undefined;

    case "hasTrait":
      return character.traits === undefined ? "traits" : undefined;

    case "hasSkill":
    case "skillMastery":
      return character.skills === undefined ? "skills" : undefined;

    case "hasTechnique":
    case "techniqueMastery":
      return character.techniques === undefined ? "techniques" : undefined;

    case "hasCondition":
      return character.conditions === undefined ? "conditions" : undefined;

    case "hasItem":
      return character.items === undefined ? "items" : undefined;

    /*
     * A compound requirement is unresolved when any child is. "any" is
     * arguably resolvable when a recorded child already passes, and is treated
     * the same way anyway: reporting a definite yes while part of the sheet is
     * missing would be right by luck rather than by evidence.
     */
    case "all":
    case "any":
      return requirement.requirements
        .map((child) => unrecordedCollection(child, character))
        .find((missing) => missing !== undefined);

    case "not":
      return unrecordedCollection(requirement.requirement, character);

    /* Attributes and Level are always present on a resolved character. */
    default:
      return undefined;
  }
}


function findingFor(
  named: NamedRequirement,
  character: Character,
  context: RequirementContext,
): EligibilityFinding {
  const unrecorded = unrecordedCollection(named.requirement, character);

  if (unrecorded !== undefined) {
    return {
      id: named.id,
      status: "unresolved",
      decidedBy: "character",
      summary: named.summary ??
        `This character's ${unrecorded} are not recorded yet.`,
      diagnostic: {
        code: "character.actions.requirement.unrecorded",
        message: `Cannot decide "${named.id}": the character's ${unrecorded} are not recorded.`,
        audience: "gm",
        required: `a recorded ${unrecorded} list`,
        actual: "absent",
      },
    };
  }

  const satisfied = meetsRequirement(named.requirement, context);

  return {
    id: named.id,
    status: satisfied ? "satisfied" : "unsatisfied",
    decidedBy: "character",
    ...(named.summary === undefined ? {} : { summary: named.summary }),
  };
}


/**
 * The governing contribution for one check scope.
 *
 * Attribute and Derived Attribute scopes are read straight off the resolved
 * character. Sensory scopes are refused: their governing score depends on the
 * sense, the route and the sensory profile, and the sensory resolvers already
 * compute it. Answering here would be a second source for the same number, and
 * the two would drift the first time a sense gained a modifier.
 */
function baseContributionFor(
  resolved: ResolvedCharacter,
  scope: CheckScope,
): EngineResult<readonly CheckBaseContribution[]> {
  const trace = {
    root: createTraceNode({
      id: "character.actions.governing-score",
      label: "Resolve governing score",
      formula: "resolved standard modifier for the check's scope",
      inputs: { scope: { value: scope.kind } },
      output: scope.kind,
    }),
  };

  if (scope.kind === "attribute") {
    const score = resolved.attributeScores[scope.attribute];

    return engineSuccess([{
      id: `${scope.attribute}.standardModifier`,
      amount: score.standardModifier,
    }], trace);
  }

  if (scope.kind === "derivedAttribute") {
    const score = resolved.derivedScores[scope.derivedAttribute];

    return engineSuccess([{
      id: `${scope.derivedAttribute}.standardModifier`,
      amount: score.standardModifier,
    }], trace);
  }

  const error: EngineError = {
    code: "character.actions.check-scope.not-owned",
    message: `A ${scope.kind} check's governing score belongs to the sensory mechanics, not to this adapter.`,
    audience: "developer",
    required: "an attribute or derivedAttribute scope",
    actual: scope.kind,
    resolution:
      "Resolve sensory checks through character/foundation/senses/, which knows the sense, the route and the profile.",
  };

  return engineFailure(trace, [error] as NonEmptyArray<EngineError>);
}


/**
 * Everything a Character owes one neutral action, and nothing else.
 *
 * Call it once per participant. For an opposed check, the two results are
 * combined by whatever owns the contest.
 */
export function prepareCharacterActionInputs(
  input: CharacterActionInputs,
): EngineResult<CharacterActionContribution> {
  const context = input.resolved.requirementContext;

  const eligibility = (input.requirements ?? []).map((named) =>
    findingFor(named, input.resolved.character, context)
  );

  const modifiers = collectCharacterCheckModifiers(
    input.resolved,
    input.invocation ?? {},
  );

  const scopeTraceInput = input.checkScope === undefined
    ? "none"
    : input.checkScope.kind;

  if (input.checkScope === undefined) {
    return engineSuccess({
      eligibility,
      baseContributions: [],
      modifiers,
    }, {
      root: createTraceNode({
        id: "character.actions.preparation",
        label: "Assemble Character inputs for an action",
        formula: "requirements become findings; modifiers assemble canonically",
        inputs: {
          requirements: { value: eligibility.length },
          modifiers: { value: modifiers.length },
          checkScope: { value: scopeTraceInput },
        },
        output: eligibility.length,
      }),
    });
  }

  const base = baseContributionFor(input.resolved, input.checkScope);

  if (!base.success) return base;

  return engineSuccess({
    eligibility,
    baseContributions: base.payload,
    modifiers,
  }, {
    root: createTraceNode({
      id: "character.actions.preparation",
      label: "Assemble Character inputs for an action",
      formula: "requirements become findings; modifiers assemble canonically",
      inputs: {
        requirements: { value: eligibility.length },
        modifiers: { value: modifiers.length },
        checkScope: { value: scopeTraceInput },
      },
      output: eligibility.length,
      children: [base.trace.root],
    }),
  });
}
