import { resolveFixedCheck } from "../../../../checks/resolution";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import { resolveSensoryAccess } from "../access";
import {
  missingSensoryDiceError,
  sensoryFailure,
} from "../diagnostics";
import { resolveInformationBand } from "../information";
import type { PerceptionRequest, PerceptionResolution } from "./types";

/*
 * Raw reception: did the cue reach the character at all.
 *
 * Access is settled first and separately. If no route exists the result is
 * "inaccessible" and nothing is rolled. Only once a route exists does the
 * authored reception decide whether a roll happens, and a roll that misses
 * returns "not-perceived" — a failed check, never an access failure.
 *
 * findPerceptionRequestIssues() rejects every input that would make this
 * function throw, so a validated request cannot reach either throw below.
 */
export function resolvePerception(
  request: PerceptionRequest,
): EngineResult<PerceptionResolution> {
  const { profile, signature } = request;
  const access = resolveSensoryAccess(profile, signature);

  if (!access.accessible) {
    const blockedTrace = createTraceNode({
      id: `character.senses.perception.${signature.id}.blocked`,
      label: "Resolve sensory access",
      inputs: {
        sense: { value: signature.sense },
        phenomenon: { value: signature.phenomenon },
      },
      output: access.reason,
    });

    /*
     * Inaccessible is a successful RESOLUTION of an unsuccessful perception.
     * The character genuinely could not have perceived this, which is an
     * answer; it is not the engine failing to work out what happened.
     */
    return engineSuccess({
      status: "inaccessible",
      perceived: false,
      signature,
      reason: access.reason,
      trace: blockedTrace,
    }, { root: blockedTrace });
  }

  if (signature.reception.kind === "automatic") {
    const band = signature.reception.band ?? "full";
    const automaticTrace = createTraceNode({
      id: `character.senses.perception.${signature.id}.automatic`,
      label: "Automatically receive sensory cue",
      inputs: { sense: { value: signature.sense } },
      output: band,
    });

    return engineSuccess({
      status: "perceived",
      perceived: true,
      signature,
      band,
      cue: { signature, perceptionBand: band },
      trace: automaticTrace,
    }, { root: automaticTrace });
  }

  if (signature.reception.kind === "impossible") {
    /* Unreachable: resolveSensoryAccess() rejects impossible reception above. */
    throw new Error("An impossible signature cannot pass sensory access resolution.");
  }

  if (request.dice === undefined) {
    return sensoryFailure(
      `character.senses.perception.${signature.id}`,
      "Resolve sensory reception",
      missingSensoryDiceError("Uncertain sensory reception"),
    );
  }

  const sense = profile.senses[signature.sense];
  const checkResult = resolveFixedCheck({
    check: {
      scope: {
        kind: "perception",
        sense: signature.sense,
        phenomenon: signature.phenomenon,
      },
      dice: request.dice,
      baseContributions: [
        { id: `${signature.sense}.standardModifier`, amount: sense.standardModifier },
      ],
      modifiers: request.modifiers ?? [],
    },
    difficulty: signature.reception.difficulty,
    tiePolicy: "fails",
  });

  if (!checkResult.success) return checkResult;

  const check = checkResult.payload;
  const band = resolveInformationBand(check.margin, request.informationOverride);
  const trace = createTraceNode({
    id: `character.senses.perception.${signature.id}`,
    label: "Resolve sensory reception",
    formula: "information margin = Perception total - sensory difficulty",
    inputs: { margin: { value: check.margin } },
    output: band,
    children: [check.trace],
  });

  if (band === "none") {
    return engineSuccess({
      status: "not-perceived",
      perceived: false,
      signature,
      band,
      check,
      trace,
    }, { root: trace });
  }

  return engineSuccess({
    status: "perceived",
    perceived: true,
    signature,
    band,
    cue: { signature, perceptionBand: band },
    check,
    trace,
  }, { root: trace });
}
