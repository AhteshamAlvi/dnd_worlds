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
import type { NamedRequirement, Requirement } from "../rules/requirements";
import {
  resolveRequirement,
  type RequirementContext,
} from "../rules/resolution";
import type { ResolvedCharacter } from "../resolution";


/*
 * NamedRequirement is imported from the universal requirement vocabulary and
 * re-exported here, where callers of this adapter expect to find it.
 *
 * It was declared locally until the contract turned out to have three
 * structurally identical definitions across the engine — this one, a Skill's
 * ApplicationRequirement, and the one Item equip requirements were about to
 * need. The adapter may import downward from character/rules freely, so there
 * was never a layering reason for the copy.
 */
export type { NamedRequirement };


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
 * One Requirement, as a finding.
 *
 * The three statuses map one-to-one onto the rules layer's own
 * RequirementDisposition, and this adapter deliberately adds nothing to the
 * mapping. It used to inspect the Character itself to decide whether a
 * collection had been recorded, because the requirement context collapsed
 * absence into emptiness before the evaluator ever saw it. That collapse is
 * gone, so the second interpretation is gone with it — there is one source of
 * requirement semantics and this is not it.
 */
function findingFor(
  named: NamedRequirement,
  context: RequirementContext,
): EligibilityFinding {
  const disposition = resolveRequirement(named.requirement, context);

  if (disposition === "unresolved") {
    return {
      id: named.id,
      status: "unresolved",
      decidedBy: "character",
      summary: named.summary ??
        "This character does not record everything the requirement reads.",
      diagnostic: {
        code: "character.actions.requirement.unresolved",
        message: `Cannot decide "${named.id}": the character does not record everything this requirement reads.`,
        audience: "gm",
        required: "a recorded value for every collection the requirement reads",
        actual: "absent",
      },
    };
  }

  return {
    id: named.id,
    status: disposition,
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
    findingFor(named, context)
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
