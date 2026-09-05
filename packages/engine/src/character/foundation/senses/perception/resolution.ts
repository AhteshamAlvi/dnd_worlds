import { resolveFixedCheck } from "../../../../checks/resolution";
import { createTraceNode } from "../../../../infrastructure/trace";
import { resolveSensoryAccess } from "../access";
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
export function resolvePerception(request: PerceptionRequest): PerceptionResolution {
  const { profile, signature } = request;
  const access = resolveSensoryAccess(profile, signature);

  if (!access.accessible) {
    return {
      status: "inaccessible",
      perceived: false,
      signature,
      reason: access.reason,
      trace: createTraceNode({
        id: `character.senses.perception.${signature.id}.blocked`,
        label: "Resolve sensory access",
        inputs: {
          sense: { value: signature.sense },
          phenomenon: { value: signature.phenomenon },
        },
        output: access.reason,
      }),
    };
  }

  if (signature.reception.kind === "automatic") {
    const band = signature.reception.band ?? "full";
    return {
      status: "perceived",
      perceived: true,
      signature,
      band,
      cue: { signature, perceptionBand: band },
      trace: createTraceNode({
        id: `character.senses.perception.${signature.id}.automatic`,
        label: "Automatically receive sensory cue",
        inputs: { sense: { value: signature.sense } },
        output: band,
      }),
    };
  }

  if (signature.reception.kind === "impossible") {
    /* Unreachable: resolveSensoryAccess() rejects impossible reception above. */
    throw new Error("An impossible signature cannot pass sensory access resolution.");
  }

  if (request.dice === undefined) {
    throw new RangeError("Uncertain sensory reception requires supplied d20 dice.");
  }

  const sense = profile.senses[signature.sense];
  const check = resolveFixedCheck({
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
    return {
      status: "not-perceived",
      perceived: false,
      signature,
      band,
      check,
      trace,
    };
  }

  return {
    status: "perceived",
    perceived: true,
    signature,
    band,
    cue: { signature, perceptionBand: band },
    check,
    trace,
  };
}
