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
import { sensoryRouteKey, type GeneratedSensoryRoute } from "../routes";
import type { PerceptionRequest, PerceptionResolution } from "./types";

/*
 * Raw reception: did the cue reach the character, and how much of it did they
 * make sense of.
 *
 * Access is settled first and separately. If no route exists the result is
 * "inaccessible" and nothing is rolled. Only once a route exists does the
 * authored reception decide whether a roll happens, and a roll that misses
 * returns "not-perceived" — a failed check, never an access failure.
 *
 *
 * PERCEPTION IS NOT A GATE IN FRONT OF DETECTION
 *
 * It used to produce a `PerceivedCue` that Detection then consumed, which
 * meant finding a hidden assassin cost two checks: an uncertain reception
 * nobody had authored a difficulty for, and then the Detection contest. A
 * concealed subject is now resolved through Detection alone, against a
 * generated route, and never passes through this file.
 *
 * What is left here is the question Perception was always for: an unconcealed
 * informational stimulus arrived, and how much did you understand of it.
 *
 *
 * INTENSITY IS NOT ADDED HERE
 *
 * `received - 5` is Detection's contribution and is named there. A cue's
 * authored reception difficulty already says how hard it is to read; adding
 * loudness on top would be the same circumstance priced twice, and the two
 * stages sharing one number is precisely the double-count the split exists to
 * prevent.
 */
export function resolvePerception(
  request: PerceptionRequest,
): EngineResult<PerceptionResolution> {
  const { profile, cue } = request;

  const access = resolveSensoryAccess({
    profile,
    cue,
    ...(request.exposure === undefined ? {} : { exposure: request.exposure }),
    ...(request.overrides === undefined ? {} : { overrides: request.overrides }),
  });

  if (!access.accessible) {
    const blockedTrace = createTraceNode({
      id: `character.senses.perception.${cue.id}.blocked`,
      label: "Resolve sensory access",
      inputs: {
        phenomenon: { value: cue.phenomenon },
        channels: { value: Object.keys(cue.emissions).sort().join(", ") },
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
      cue,
      reason: access.reason,
      trace: blockedTrace,
    }, { root: blockedTrace });
  }

  const best = bestPerceptionRoute(access.routes);
  const route = best.route;
  const reception = cue.reception ?? { kind: "automatic" as const };

  if (reception.kind === "automatic") {
    const band = reception.band ?? "full";
    const automaticTrace = createTraceNode({
      id: `character.senses.perception.${cue.id}.automatic`,
      label: "Automatically receive sensory cue",
      inputs: {
        sense: { value: route.sense },
        channel: { value: route.channel },
      },
      output: band,
    });

    return engineSuccess({
      status: "perceived",
      perceived: true,
      cue,
      route,
      band,
      trace: automaticTrace,
    }, { root: automaticTrace });
  }

  if (reception.kind === "impossible") {
    /* Unreachable: resolveSensoryAccess() rejects impossible reception above. */
    throw new Error("An impossible cue cannot pass sensory access resolution.");
  }

  if (request.dice === undefined) {
    return sensoryFailure(
      `character.senses.perception.${cue.id}`,
      "Resolve sensory reception",
      missingSensoryDiceError("Uncertain sensory reception"),
    );
  }

  const sense = profile.senses[route.sense];

  if (sense === undefined) {
    return sensoryFailure(
      `character.senses.perception.${cue.id}`,
      "Resolve sensory reception",
      {
        code: "character.senses.perception.sense.unresolved",
        message:
          "This observer has no resolved Sense for the route the cue arrived through.",
        audience: "developer",
        required: "a Sense present in the observer's profile",
        actual: route.sense,
      },
    );
  }

  const checkResult = resolveFixedCheck({
    check: {
      scope: {
        kind: "perception",
        sense: route.sense,
        channel: route.channel,
        phenomenon: cue.phenomenon,
      },
      dice: request.dice,
      baseContributions: [
        { id: `${route.sense}.standardModifier`, amount: sense.standardModifier },
      ],
      modifiers: request.modifiers ?? [],
    },
    difficulty: reception.difficulty,
    tiePolicy: "fails",
  });

  if (!checkResult.success) return checkResult;

  const check = checkResult.payload;
  const band = resolveInformationBand(check.margin, request.informationOverride);
  const trace = createTraceNode({
    id: `character.senses.perception.${cue.id}`,
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
      cue,
      route,
      band,
      check,
      trace,
    }, { root: trace });
  }

  return engineSuccess({
    status: "perceived",
    perceived: true,
    cue,
    route,
    band,
    check,
    trace,
  }, { root: trace });
}

/**
 * Which of several routes a standalone Perception is read through.
 *
 * The loudest, and a tie broken by route identity rather than by the order
 * generation happened to produce. One Perception per cue, not one per organ —
 * the same rule Detection's sweep enforces, for the same reason: more senses
 * must make a character better at noticing, not luckier.
 */
function bestPerceptionRoute(
  routes: readonly GeneratedSensoryRoute[],
): GeneratedSensoryRoute {
  return routes.reduce((leader, candidate) => {
    if (candidate.receivedIntensity !== leader.receivedIntensity) {
      return candidate.receivedIntensity > leader.receivedIntensity
        ? candidate
        : leader;
    }

    return sensoryRouteKey(candidate.route)
        .localeCompare(sensoryRouteKey(leader.route)) < 0
      ? candidate
      : leader;
  });
}
