/*
 * What a capability PERMITS, against what a player actually chose.
 *
 * A TargetSpecification belongs to the capability and says how many targets of
 * which kinds are legal. A TargetSelection is one concrete choice. They are
 * separate types because they have different lifetimes — a specification is
 * authored once, a selection is made every time — and because conflating them
 * is how "this Skill can hit up to three" turns into "this Skill is hitting
 * three".
 *
 * The evaluation result separates a MALFORMED question from an ordinary NO.
 * Choosing two targets for a one-target heal is a rule answer a GM can
 * override; a target that names no entity at all is a broken input that no
 * amount of GM authority should make resolvable. Callers that cannot tell
 * those apart end up either refusing overridable things or committing corrupt
 * ones.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { NonEmptyArray } from "../infrastructure/result";
import {
  findTargetCardinalityIssues,
  type TargetCardinality,
} from "./cardinality";
import {
  findTargetIssues,
  isTargetKind,
  type TargetKind,
  type TargetRef,
} from "./targets";


export interface TargetSpecification {
  readonly cardinality: TargetCardinality;

  /**
   * Which kinds of target are legal, or undefined for "any kind".
   *
   * Undefined rather than the full list so that an author who has no opinion
   * writes nothing, and so that adding a target kind later does not silently
   * exclude it from every profile that predates it.
   */
  readonly permittedKinds?: readonly TargetKind[];
}


/** One concrete choice. Flat, ordered, and allowed to be empty. */
export type TargetSelection = readonly TargetRef[];


export function findTargetSpecificationIssues(
  specification: TargetSpecification,
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findTargetCardinalityIssues(specification.cardinality),
  ];

  if (specification.permittedKinds !== undefined) {
    if (specification.permittedKinds.length === 0) {
      /*
       * An empty list says "no kind is legal", which is not the same as "any
       * kind" and is almost never what an author meant to write. A profile
       * that truly takes no targets says so with cardinality.
       */
      errors.push({
        code: "targeting.specification.permitted-kinds.empty",
        message:
          "An empty permitted-kinds list permits nothing; omit it to permit any kind.",
        audience: "developer",
        required: "one or more target kinds, or omit the field",
        actual: "empty list",
      });
    }

    for (const kind of specification.permittedKinds) {
      if (!isTargetKind(kind)) {
        errors.push({
          code: "targeting.specification.permitted-kinds.invalid",
          message: `"${String(kind)}" is not a known target kind.`,
          audience: "developer",
          required: "known target kind",
          actual: String(kind),
        });
      }
    }
  }

  return errors;
}


export type TargetSelectionEvaluation =
  | { readonly outcome: "satisfied" }
  | {
    readonly outcome: "too-few";
    readonly required: number;
    readonly supplied: number;
  }
  | {
    readonly outcome: "too-many";
    readonly permitted: number;
    readonly supplied: number;
  }
  | {
    readonly outcome: "kind-not-permitted";
    readonly index: number;
    readonly kind: TargetKind;
    readonly permitted: readonly TargetKind[];
  }
  | {
    readonly outcome: "invalid";
    readonly errors: NonEmptyArray<EngineError>;
  };


/**
 * Judge one selection against one specification.
 *
 * Structural problems are reported first and stop the evaluation, because
 * counting malformed targets answers a question nobody asked: "you chose two
 * targets and one of them is not a target" should not be reported as a
 * cardinality result.
 */
export function evaluateTargetSelection(
  specification: TargetSpecification,
  selection: TargetSelection,
): TargetSelectionEvaluation {
  const structural: EngineError[] = [
    ...findTargetSpecificationIssues(specification),
  ];

  for (const target of selection) {
    structural.push(...findTargetIssues(target));
  }

  const firstStructural = structural[0];

  if (firstStructural !== undefined) {
    return {
      outcome: "invalid",
      errors: [firstStructural, ...structural.slice(1)],
    };
  }

  const permitted = specification.permittedKinds;

  if (permitted !== undefined) {
    for (let index = 0; index < selection.length; index += 1) {
      const target = selection[index];

      if (target === undefined) continue;

      if (!permitted.includes(target.kind)) {
        return {
          outcome: "kind-not-permitted",
          index,
          kind: target.kind,
          permitted,
        };
      }
    }
  }

  const { minimum, maximum } = specification.cardinality;

  if (selection.length < minimum) {
    return {
      outcome: "too-few",
      required: minimum,
      supplied: selection.length,
    };
  }

  if (maximum !== null && selection.length > maximum) {
    return {
      outcome: "too-many",
      permitted: maximum,
      supplied: selection.length,
    };
  }

  return { outcome: "satisfied" };
}
