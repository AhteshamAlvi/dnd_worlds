import {
  createCheckModifierTraceNode,
  resolveCheckModifier,
} from "../../../../checks/modifiers";
import { createTraceNode } from "../../../../infrastructure/trace";
import type { ConcealmentRequest, ConcealmentResolution } from "./types";

/*
 * Passive Concealment: the permanent value an observer's passive Detection is
 * measured against, with no roll.
 *
 * The base is READ from the resolved profile rather than recomputed here. It
 * is DEX standard modifier + WIS standard modifier, and profile.ts is the one
 * place that says so. Route-specific persistent modifiers are layered on
 * afterward by the universal check-modifier system, so a Trait that hides you
 * from hearing but not from sight still lands on exactly the routes it names.
 */
export function resolvePassiveConcealment(
  request: ConcealmentRequest,
): ConcealmentResolution {
  if (request.mode !== "passive" || request.basis.kind !== "character") {
    throw new RangeError("Passive Concealment requires a character basis and passive mode.");
  }

  const baseContributions = [
    {
      id: "passiveConcealment.base",
      amount: request.basis.profile.passiveConcealmentBase,
    },
  ];

  const ratings = request.routes.map((route) => {
    const modifier = resolveCheckModifier(baseContributions, request.modifiers ?? [], {
      kind: "concealment",
      mode: "passive",
      ...route,
    });
    return {
      route,
      mode: "passive" as const,
      total: modifier.finalModifier,
      trace: createCheckModifierTraceNode(modifier),
    };
  });

  return {
    mode: "passive",
    ratings,
    trace: createTraceNode({
      id: "character.senses.concealment.passive",
      label: "Resolve passive Concealment",
      formula: "stored passive Concealment base + matching persistent modifiers",
      inputs: {
        passiveConcealmentBase: {
          value: request.basis.profile.passiveConcealmentBase,
        },
      },
      output: ratings.length,
      children: ratings.map((rating) => rating.trace),
    }),
  };
}
