/*
 * Access: could this cue have reached this observer at all.
 *
 * Settled first and separately from everything else, because "you could not
 * possibly have noticed that" and "you failed to notice that" are different
 * answers and only one of them is worth a roll.
 *
 * The test is now entirely about CHANNELS. It used to be a short list of
 * hard-coded phenomenon rules — Nen needs Nen perception, intent needs
 * Extrasensory — which meant the set of things a creature could perceive was
 * decided by an if-chain in this file rather than by what the creature has.
 * A homebrew Sense for reading intent was unreachable no matter what it
 * declared, because the branch tested for one built-in id.
 *
 * What replaced it is one question: did any route generate. A creature
 * perceives Nen because it has an available Sense receiving the `aura`
 * channel, through a receiver something is not blocking — and that is the same
 * sentence for `visible-light`, for `danger` and for anything a host
 * registers tomorrow.
 */

import { generateSensoryRoutes, type GeneratedSensoryRoute } from "./routes";
import type { ResolvedSensoryCue } from "./cues";
import type { SensoryExposureFacts } from "./routes";
import type { ResolvedSensoryProfile } from "./types";


export type SensoryAccessFailureReason =
  | "no-compatible-route"
  | "authored-impossible";


export type SensoryAccessResolution =
  | {
      readonly accessible: true;
      readonly routes: readonly GeneratedSensoryRoute[];
    }
  | {
      readonly accessible: false;
      readonly reason: SensoryAccessFailureReason;
      readonly detail?: string;
    };


export interface ResolveSensoryAccessInput {
  readonly profile: ResolvedSensoryProfile;
  readonly cue: ResolvedSensoryCue;
  readonly exposure?: SensoryExposureFacts;
  readonly overrides?: readonly GeneratedSensoryRoute[];
}


/**
 * Resolve access, and hand back the routes that made it accessible.
 *
 * Returning the routes rather than a bare boolean is deliberate: every caller
 * that asks whether access exists immediately needs to know THROUGH WHAT, and
 * generating them twice would be two chances to generate them differently.
 *
 * Range, facing, line of sight and occlusion are still the caller's to supply
 * through the exposure facts. This engine has no geometry for them, and
 * inventing one here would be a second spatial system living in the sensory
 * domain.
 */
export function resolveSensoryAccess(
  input: ResolveSensoryAccessInput,
): SensoryAccessResolution {
  const reception = input.cue.reception;

  /*
   * Checked before routes are generated. An authored impossibility is a
   * statement that no amount of anatomy helps, and spending the derivation to
   * find routes that will be thrown away would invite somebody to start using
   * them.
   */
  if (reception?.kind === "impossible") {
    return {
      accessible: false,
      reason: "authored-impossible",
      ...(reception.reason === undefined ? {} : { detail: reception.reason }),
    };
  }

  const routes = generateSensoryRoutes({
    profile: input.profile,
    cue: input.cue,
    ...(input.exposure === undefined ? {} : { exposure: input.exposure }),
    ...(input.overrides === undefined ? {} : { overrides: input.overrides }),
  });

  return routes.length === 0
    ? { accessible: false, reason: "no-compatible-route" }
    : { accessible: true, routes };
}
