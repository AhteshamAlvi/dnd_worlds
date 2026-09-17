/*
 * Several senses, one answer.
 *
 * A character watching a corridor has sight, hearing, smell and possibly Nen
 * perception all pointed at the same hider, and the tempting reading is that
 * each of them is a separate chance to notice. It is not. Four senses is not
 * four Detection rolls — it is one Detection, made with whichever sense is
 * doing best against this particular concealment, because rolling per sense
 * turns a character with more senses into a character who automatically
 * succeeds.
 *
 * Passive comparison is free (nothing is rolled), so every valid route is
 * compared and the best one wins. That best route is then the ONE route a
 * subsequent active search or Reaction Gate rolls through. Genuine multi-sense
 * benefits — two senses agreeing, a warning shouted from across the room —
 * arrive as contextual advantage on that single check, which is the channel
 * that already exists for "this circumstance made it easier".
 */

import type { CheckModifierContribution } from "../../../../checks/types";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import { sensoryFailure } from "../diagnostics";
import type { ConcealmentRating } from "../concealment";
import type { PerceivedCue } from "../signatures";
import type { ResolvedSensoryProfile } from "../types";
import { resolvePassiveDetection } from "./passive";
import type { DetectionResolution } from "./types";


/** One cue the observer has, with the Concealment standing against it. */
export interface DetectionRouteCandidate {
  readonly cue: PerceivedCue;
  readonly concealment: ConcealmentRating;
}


export interface PassiveDetectionSweep {
  /** True when ANY valid route's passive total beat its Concealment. */
  readonly detected: boolean;

  /**
   * The route to act through: the detecting one when there is a detection, and
   * otherwise the one that came closest — which is the route with the SMALLEST
   * Concealment Lead, and therefore the observer's best chance on a roll.
   */
  readonly best: DetectionResolution;

  readonly results: readonly DetectionResolution[];

  readonly trace: ReturnType<typeof createTraceNode>;
}


/**
 * Compare every supplied route passively and report the best of them.
 *
 * Routes whose sense is unavailable to this observer are dropped before
 * comparison rather than failing the sweep: a blindfolded character simply has
 * no sight route, which is an answer and not a malformed request. A sweep with
 * no usable route at all IS a failure, because "detected: false" would be
 * indistinguishable from a real comparison having happened.
 */
export function sweepPassiveDetectionRoutes(input: {
  readonly profile: ResolvedSensoryProfile;
  readonly routes: readonly DetectionRouteCandidate[];
  readonly modifiers?: readonly CheckModifierContribution[];
}): EngineResult<PassiveDetectionSweep> {
  const usable = input.routes.filter((candidate) =>
    input.profile.senses[candidate.cue.signature.sense]?.available === true
  );

  if (usable.length === 0) {
    return sensoryFailure(
      "character.senses.detection.routes",
      "Sweep passive Detection routes",
      {
        code: "character.senses.detection.routes.none",
        message:
          "Passive Detection requires at least one route the observer can actually sense through.",
        audience: "developer",
        required: "one or more available sensory routes",
        actual: String(input.routes.length),
      },
    );
  }

  const results: DetectionResolution[] = [];

  for (const candidate of usable) {
    const result = resolvePassiveDetection({
      mode: "passive",
      profile: input.profile,
      cue: candidate.cue,
      concealment: candidate.concealment,
      ...(input.modifiers === undefined ? {} : { modifiers: input.modifiers }),
    });

    if (!result.success) return result;

    results.push(result.payload);
  }

  /*
   * The largest margin, detected or not. When something was detected that is
   * the clearest detection; when nothing was, it is the narrowest failure and
   * therefore the smallest Concealment Lead — the same route either way, which
   * is why one comparison serves both.
   */
  const best = results.reduce((leader, candidate) =>
    candidate.margin > leader.margin ? candidate : leader
  );

  const trace = createTraceNode({
    id: "character.senses.detection.routes",
    label: "Sweep passive Detection routes",
    formula: "one Detection through the observer's best valid route, never one per sense",
    inputs: {
      supplied: { value: input.routes.length },
      usable: { value: usable.length },
    },
    output: {
      detected: best.detected,
      sense: best.route.sense,
      margin: best.margin,
    },
    children: results.map((result) => result.trace),
  });

  return engineSuccess({
    detected: best.detected,
    best,
    results,
    trace,
  }, { root: trace });
}
