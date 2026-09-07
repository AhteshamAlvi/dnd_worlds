import { resolveCheck } from "../../../../checks/resolution";
import type { CheckResolution } from "../../../../checks/types";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import {
  createTraceNode,
  type TraceNode,
} from "../../../../infrastructure/trace";
import { deriveStandardModifier } from "../../attributes/resolution";
import { resolveDerivedAttribute } from "../../attributes/derived/resolution";
import {
  missingSensoryDiceError,
  sensoryFailure,
} from "../diagnostics";
import type {
  ConcealmentRequest,
  ConcealmentResolution,
} from "./types";
import { resolvePassiveConcealment } from "./passive";

export function resolveConcealmentCheck(
  request: ConcealmentRequest,
): EngineResult<ConcealmentResolution> {
  if (request.mode === "passive") return resolvePassiveConcealment(request);

  const dice = request.dice;

  if (dice === undefined) {
    return sensoryFailure(
      `character.senses.concealment.${request.mode}`,
      `Resolve ${request.mode} Concealment`,
      missingSensoryDiceError("Active and established Concealment"),
    );
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

  const ratings: {
    route: ConcealmentRequest["routes"][number];
    mode: typeof request.mode;
    total: number;
    check: CheckResolution;
    trace: TraceNode;
  }[] = [];

  for (const route of request.routes) {
    const result = resolveCheck({
      scope: { kind: "concealment", mode: request.mode, ...route },
      dice,
      baseContributions,
      modifiers: request.modifiers ?? [],
    });

    /*
     * One bad pool fails the whole resolution rather than producing a partial
     * set of ratings. Every route shares the same supplied dice, so a pool
     * that is malformed for one route is malformed for all of them, and a
     * half-filled rating list would be a worse answer than none.
     */
    if (!result.success) return result;

    const check = result.payload;

    ratings.push({
      route,
      mode: request.mode,
      total: check.total,
      check,
      trace: check.trace,
    });
  }

  const trace = createTraceNode({
    id: `character.senses.concealment.${request.mode}`,
    label: `Resolve ${request.mode} Concealment`,
    formula: "one retained d20 shared across sensory routes; route modifiers resolve independently",
    output: ratings.length,
    children: ratings.map((rating) => rating.trace),
  });

  return engineSuccess({
    mode: request.mode,
    ratings,
    ...(ratings[0]?.check?.dice === undefined
      ? {}
      : { sharedDice: ratings[0].check.dice }),
    trace,
  }, { root: trace });
}
