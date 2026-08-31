/*
 * Buying a point of Strength.
 *
 * Ordinary "+1 STR" means a real doubling of the character's base normalized
 * Strength Points:
 *
 *   TargetNormalizedBodySP = CurrentBaseNormalizedBodySP x 2
 *
 * Not the next displayed tier's minimum. A character sitting at 190 normalized
 * SP buys their way to 380, not to 200 — snapping to the tier would make the
 * same purchase worth wildly different amounts depending on where in a tier
 * someone happened to sit, and would let a character ratchet up cheaply by
 * always buying just below a threshold.
 *
 * And not the RESOLVED normalized SP. Advancement is priced against the intact
 * Base Reference Form, so that permanent physical development never becomes
 * cheaper or dearer because a character is currently injured, amputated,
 * suppressed, or temporarily transformed. A character with 400 base normalized
 * SP whose amputated body reads 247 still buys against 400 x 2 = 800.
 *
 *
 * WHY THIS NEEDS A SOLVER AT ALL
 *
 * Advancement changes exactly one persistent field —
 * `strengthDevelopmentMuscularity` — and the question is what value of it
 * doubles the body's Strength. There is no closed form. Each part contributes
 *
 *   refSC x (1 + (M - 1) x s) x 2^((M - 1) x s)
 *
 * a product of a linear and an exponential term, summed over parts with
 * different sensitivities. That has no algebraic inverse, so the value is
 * searched for numerically: expand a bracket upward until it contains the
 * target, then bisect it. Both steps are bounded, so this terminates whatever
 * anatomy it is handed.
 *
 * On the reference Human the answer is Muscularity ~= 1.5747, which carries
 * normalized SP from 100 to 200, total Structural Capacity from 100 to ~143.85,
 * and displayed Strength from 10 to 11. That the structural side rises only
 * ~44% while force doubles is the point of the separate force factor — see
 * strength/resolution.ts.
 */

import { createTraceNode } from "../../../../infrastructure/trace";
import { resolveMorphology } from "../morphology/resolution";
import { resolveBodyStrength } from "./resolution";
import { MAX_DISPLAYED_STRENGTH } from "./normalization";
import { validateStrengthAdvancementInputs } from "./validation";
import type { EngineResult } from "../../../../infrastructure/result";
import type { MorphologyResolutionInput } from "../morphology/types";
import type {
  ResolvedBodyStrength,
  StrengthPhysicalContext,
} from "./types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
  ReferenceForm,
} from "../anatomy/types";


/*
 * The solver's fixed guards.
 *
 * Every one of these exists so that no anatomy — including anatomy nobody has
 * authored yet — can make advancement hang. A refusal is recoverable; a loop
 * that never returns is not.
 *
 * 64 doublings of the bracket step covers a range no physical body approaches,
 * and 128 bisections drive any bracket below double precision long before they
 * run out. The tolerance is relative rather than absolute because normalized
 * SP spans from single digits to tens of thousands, and one absolute epsilon
 * cannot be right at both ends.
 */
export const MAX_BRACKET_EXPANSIONS = 64;
export const MAX_BINARY_SEARCH_ITERATIONS = 128;
export const RELATIVE_TARGET_TOLERANCE = 1e-9;


/*
 * Why a numerical solve stopped without an answer.
 */
export type SolveFailureReason =
  | "non-finite-evaluation"
  | "target-not-bracketed";


export type SolveOutcome =
  | { readonly solved: true; readonly value: number }
  | { readonly solved: false; readonly reason: SolveFailureReason };


/*
 * Finds the lowest input at or above `lowerBound` whose non-decreasing
 * `evaluate` REACHES `target` — at or above it, never just short of it.
 *
 * Deliberately generic arithmetic with no knowledge of bodies. Monotonicity is
 * a PRECONDITION, asserted by strength/validation.ts rather than checked here:
 * a bisection on a non-monotonic function does not fail, it converges on a
 * confident wrong answer, so the guarantee has to be established before the
 * search rather than detected during it.
 *
 * The bracket expands by a doubling step rather than by doubling the value
 * itself, so it behaves the same whether the lower bound is 0.01 or 1,000 —
 * multiplicative expansion from a near-zero start crawls.
 */
export function solveMonotonicTarget(
  evaluate: (value: number) => number,
  lowerBound: number,
  target: number,
): SolveOutcome {
  const atLowerBound = evaluate(lowerBound);

  if (!Number.isFinite(atLowerBound)) {
    return { solved: false, reason: "non-finite-evaluation" };
  }

  if (atLowerBound >= target) {
    return { solved: true, value: lowerBound };
  }

  let step = Math.max(Math.abs(lowerBound), 1);
  let upperBound = lowerBound;
  let bracketed = false;

  for (let expansion = 0; expansion < MAX_BRACKET_EXPANSIONS; expansion += 1) {
    upperBound = lowerBound + step;

    const value = evaluate(upperBound);

    if (!Number.isFinite(value)) {
      return { solved: false, reason: "non-finite-evaluation" };
    }

    if (value >= target) {
      bracketed = true;

      break;
    }

    step *= 2;
  }

  if (!bracketed) {
    return { solved: false, reason: "target-not-bracketed" };
  }

  let low = lowerBound;
  let high = upperBound;

  for (
    let iteration = 0;
    iteration < MAX_BINARY_SEARCH_ITERATIONS;
    iteration += 1
  ) {
    const middle = (low + high) / 2;

    /*
     * The bracket can collapse below what doubles can represent before the
     * value tolerance is met — a very flat response, or a target sitting in a
     * discontinuity. `high` is the converged answer there, and it must be
     * detected BEFORE the bounds are updated: checked afterwards, the midpoint
     * always equals whichever bound it was just assigned to, and the search
     * returns its initial upper bracket on the very first iteration.
     */
    if (middle === low || middle === high) {
      return { solved: true, value: high };
    }

    const value = evaluate(middle);

    if (!Number.isFinite(value)) {
      return { solved: false, reason: "non-finite-evaluation" };
    }

    if (value < target) {
      low = middle;

      continue;
    }

    high = middle;

    /*
     * Converged, and deliberately only ever from ABOVE. Every value this
     * function returns reaches the target; none of them merely comes close to
     * it from below.
     *
     * The distinction is worth an epsilon of extra work. Displayed Strength is
     * floor(10 + log2(SP / 100)), so a solve that lands at 199.9999999 instead
     * of 200 is a character who paid for their eleventh point of Strength and
     * is still shown ten. Undershooting is not a rounding artefact here; it is
     * a purchase that visibly did not happen.
     */
    if (value - target <= Math.abs(target) * RELATIVE_TARGET_TOLERANCE) {
      return { solved: true, value: middle };
    }
  }

  return { solved: true, value: high };
}


/*
 * Everything needed to price and apply one Strength advancement.
 *
 * `morphology` is the full layer stack, including the current
 * `strengthDevelopmentMuscularity` — which is both the value being solved for
 * and the value the search starts from. Advancement only ever searches UPWARD
 * from where a character already is.
 */
export interface StrengthAdvancementInput {
  readonly anatomy: Anatomy;
  readonly referenceForm: ReferenceForm;
  readonly definitions: readonly BodyPartDefinition[];

  readonly morphology: MorphologyResolutionInput;

  readonly effectiveScale: number;

  readonly intrinsicForceModifierByPartId?: Readonly<Record<BodyPartId, number>>;
}


/*
 * What one advancement did.
 *
 * Before and after are both reported because the only meaningful check on an
 * advancement is that the SP actually doubled — the displayed Strength moving
 * by one is a consequence, not the definition, and on an off-threshold body it
 * is possible for SP to double without the displayed number changing at all.
 */
export interface StrengthAdvancement {
  readonly previousStrengthDevelopmentMuscularity: number;
  readonly strengthDevelopmentMuscularity: number;

  readonly previousNormalizedBodySP: number;
  readonly normalizedBodySP: number;

  readonly previousDisplayedStrength: number;
  readonly displayedStrength: number;
}


/*
 * Base-mode Strength at one candidate development Muscularity.
 *
 * Rebuilds the morphology stack with the candidate substituted in, so the
 * candidate travels the exact same path the real value does: multiplied in as
 * its own layer, exactly once. A shortcut that scaled Muscularity directly
 * would quietly disagree with the resolver the moment any other layer became
 * non-neutral.
 *
 * This is also the solver's evaluation function, which is why it is the only
 * place a candidate is turned into a Strength: the number the search converges
 * on and the number finally reported come from the same code, and cannot drift
 * apart.
 */
function baseStrengthAt(
  input: StrengthAdvancementInput,
  strengthDevelopmentMuscularity: number,
): ResolvedBodyStrength {
  const partIds = input.referenceForm.parts.map((part) => part.id);

  const context: StrengthPhysicalContext = {
    morphologyByPartId: resolveMorphology(
      { ...input.morphology, strengthDevelopmentMuscularity },
      partIds,
    ),

    effectiveScale: input.effectiveScale,

    ...(input.intrinsicForceModifierByPartId !== undefined
      ? { intrinsicForceModifierByPartId: input.intrinsicForceModifierByPartId }
      : {}),
  };

  return resolveBodyStrength(
    {
      anatomy: input.anatomy,
      referenceForm: input.referenceForm,
      definitions: input.definitions,
      base: context,
    },
    { mode: "base" },
  );
}


/*
 * Buys one point of Strength.
 *
 * Returns an EngineResult rather than a plain value — the only operation in
 * the Body subsystem that does so before the trace layer lands — because this
 * is the one place that must be able to REFUSE. The internal resolvers all
 * answer questions and cannot fail; this one is a transaction, and the cap and
 * capability checks below are its preconditions.
 *
 * The cap is checked against BASE displayed Strength. A character at base 29
 * may buy one more advancement, carrying their position past 30 and displaying
 * 30; beyond that ordinary advancement is refused. Temporary or resolved-only
 * effects that reach 30 do not block anything while the base body is below the
 * cap — otherwise a buff would freeze a character's permanent progression for
 * as long as it lasted.
 *
 * Progression calls this rather than reimplementing the cap check.
 */
export function advanceStrength(
  input: StrengthAdvancementInput,
): EngineResult<StrengthAdvancement> {
  const previousMuscularity =
    input.morphology.strengthDevelopmentMuscularity;

  const traceNode = createTraceNode({
    id: "body.strength.advancement",
    label: "Advance Strength by one point",
    formula: "targetNormalizedBodySP = baseNormalizedBodySP x 2",
    inputs: {
      strengthDevelopmentMuscularity: { value: previousMuscularity },
      effectiveScale: { value: input.effectiveScale },
    },
  });

  const failure = (
    code: string,
    message: string,
    extra: {
      readonly required?: string | number;
      readonly actual?: string | number;
      readonly resolution?: string;
    } = {},
  ): EngineResult<StrengthAdvancement> => ({
    success: false,
    trace: { root: traceNode },
    warnings: [],
    errors: [
      {
        code,
        message,
        audience: "developer",
        ...extra,
      },
    ],
  });

  /*
   * Preconditions first, because a body that violates them makes every number
   * below meaningless — and because the solver's monotonicity guarantee has to
   * be established BEFORE the search rather than detected during it.
   */
  const preconditions = validateStrengthAdvancementInputs(
    input.referenceForm,
    input.definitions,
    resolveMorphology(
      input.morphology,
      input.referenceForm.parts.map((part) => part.id),
    ),
  );

  if (!preconditions.valid) {
    const first = preconditions.issues[0]!;

    return failure(
      `body.strength.advancement.${first.code.replace(/-/g, "_")}`,
      first.message,
      { resolution: "Correct the Reference Form or its BodyPart definitions." },
    );
  }

  const previous = baseStrengthAt(input, previousMuscularity);

  const previousNormalizedBodySP = previous.normalizedBodySP;

  if (previous.displayedStrength >= MAX_DISPLAYED_STRENGTH) {
    return failure(
      "body.strength.advancement.at_cap",
      "This character is already at the maximum ordinary Strength and " +
      "cannot buy further Strength advancement.",
      {
        required: `base displayed Strength below ${MAX_DISPLAYED_STRENGTH}`,
        actual: previous.displayedStrength,
      },
    );
  }

  const target = previousNormalizedBodySP * 2;

  const outcome = solveMonotonicTarget(
    (candidate) => baseStrengthAt(input, candidate).normalizedBodySP,
    previousMuscularity,
    target,
  );

  if (!outcome.solved) {
    return failure(
      `body.strength.advancement.${outcome.reason.replace(/-/g, "_")}`,
      outcome.reason === "non-finite-evaluation"
        ? "Solving for the next Strength advancement produced a non-finite " +
          "Strength value, so no development Muscularity could be chosen."
        : "Solving for the next Strength advancement could not bracket a " +
          "doubling of this body's Strength within the expansion ceiling.",
      {
        required: target,
        actual: previousNormalizedBodySP,
      },
    );
  }

  const advanced = baseStrengthAt(input, outcome.value);

  return {
    success: true,
    payload: {
      previousStrengthDevelopmentMuscularity: previousMuscularity,
      strengthDevelopmentMuscularity: outcome.value,

      previousNormalizedBodySP,
      normalizedBodySP: advanced.normalizedBodySP,

      previousDisplayedStrength: previous.displayedStrength,
      displayedStrength: advanced.displayedStrength,
    },
    trace: { root: traceNode },
    warnings: [],
  };
}
