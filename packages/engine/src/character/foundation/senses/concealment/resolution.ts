import { resolveCheck } from "../../../../checks/resolution";
import { createTraceNode } from "../../../../infrastructure/trace";
import { deriveStandardModifier } from "../../attributes/resolution";
import { resolveDerivedAttribute } from "../../attributes/derived/resolution";
import type {
  ConcealmentRequest,
  ConcealmentResolution,
} from "./types";
import { resolvePassiveConcealment } from "./passive";

export function resolveConcealmentCheck(
  request: ConcealmentRequest,
): ConcealmentResolution {
  if (request.mode === "passive") return resolvePassiveConcealment(request);
  if (request.dice === undefined) {
    throw new RangeError("Active and established Concealment require supplied d20 dice.");
  }

  const baseContributions = request.basis.kind === "character"
    ? [{
        id: "concealment.standardModifier",
        amount: deriveStandardModifier(
          resolveDerivedAttribute("concealment", request.basis.stats),
        ),
      }]
    : [
        { id: "authored.baseModifier", amount: request.basis.baseModifier },
        ...(request.basis.factors ?? []).map((factor) => ({
          id: `${factor.kind}:${factor.sourceId}`,
          amount: factor.amount,
        })),
      ];

  const ratings = request.routes.map((route) => {
    const check = resolveCheck({
      scope: { kind: "concealment", mode: request.mode, ...route },
      dice: request.dice!,
      baseContributions,
      modifiers: request.modifiers ?? [],
    });
    return {
      route,
      mode: request.mode,
      total: check.total,
      check,
      trace: check.trace,
    };
  });

  return {
    mode: request.mode,
    ratings,
    ...(ratings[0]?.check?.dice === undefined
      ? {}
      : { sharedDice: ratings[0].check.dice }),
    trace: createTraceNode({
      id: `character.senses.concealment.${request.mode}`,
      label: `Resolve ${request.mode} Concealment`,
      formula: "one retained d20 shared across sensory routes; route modifiers resolve independently",
      output: ratings.length,
      children: ratings.map((rating) => rating.trace),
    }),
  };
}
