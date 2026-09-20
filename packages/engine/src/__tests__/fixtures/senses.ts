/*
 * Shared sensory fixtures.
 *
 * The stat line is deliberately asymmetric so that a formula which reads the
 * wrong attribute produces a different number instead of coincidentally the
 * right one, and every value divides exactly so no assertion here is really
 * testing the Derived Attribute rounding rule:
 *
 *   PER 16 -> +3     WIS 14 -> +2     DEX 12 -> +1     INT 18 -> +4
 *
 *   Detection      round((16 + 14) / 2) = 15  -> +2
 *   Concealment    round((12 + 14) / 2) = 13  -> +1
 *   Investigation  round((18 + 14 + 16) / 3) = 16  -> +3
 *
 *   passiveDetectionBase    (per sense) = sense +3 + WIS +2 = 5
 *   passiveConcealmentBase               = DEX +1 + WIS +2 = 3
 *
 *
 * ANATOMY IS REAL HERE, NOT STUBBED
 *
 * A Sense is available because the creature has the organs for it, so these
 * fixtures resolve an actual standard Human body and hand its Anatomical
 * Points and footprints to the profile. Granting the senses instead would have
 * been shorter and would have made every suite below test a code path no real
 * character takes — and in particular would have given every route a granted
 * receiver, which is the one receiver Sensory Gyō can never reach.
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { CheckDiceInput } from "../../checks/types";
import type { Attributes } from "../../character/foundation/attributes/types";
import {
  createCharacterStats,
  type CharacterStats,
} from "../../character/foundation/attributes/stats";
import { STANDARD_BODY } from "../../character/foundation/body/defaults";
import type { ResolvedBody } from "../../character/foundation/body/resolution";
import type { AnatomicalPointStates } from "../../character/foundation/body/critical-points/state";
import { createTestCharacter, resolveTestCharacter } from "./character";
import {
  EMPTY_SENSORY_EFFECTS,
  type ResolvedSensoryEffects,
} from "../../character/foundation/senses/modifiers";
import { resolveSensoryProfile } from "../../character/foundation/senses/profile";
import type {
  ResolveSensoryProfileOptions,
} from "../../character/foundation/senses/profile";
import type {
  ResolvedSensoryProfile,
} from "../../character/foundation/senses/types";
import type {
  ResolvedSensoryCue,
  SensoryEmissions,
  SensoryReception,
} from "../../character/foundation/senses/cues";
import { generateSensoryRoutes } from "../../character/foundation/senses/routes";
import type {
  GeneratedSensoryRoute,
  SensoryExposureFacts,
} from "../../character/foundation/senses/routes";
import type {
  DetectionSubject,
  PerceptionPhenomenon,
} from "../../character/foundation/senses/scopes";
import type { SensoryChannelId } from "../../character/foundation/senses/channels";
import type { ConcealmentRoute } from "../../character/foundation/senses/concealment";

export const SENSORY_ATTRIBUTES: Attributes = {
  agi: 10,
  dex: 12,
  con: 10,
  vit: 10,
  int: 18,
  wis: 14,
  per: 16,
  spi: 10,
  cha: 10,
};

export const PER_MODIFIER = 3;
export const WIS_MODIFIER = 2;
export const DEX_MODIFIER = 1;

/** PER standard modifier + WIS standard modifier. */
export const PASSIVE_DETECTION_BASE = PER_MODIFIER + WIS_MODIFIER;

/** DEX standard modifier + WIS standard modifier. */
export const PASSIVE_CONCEALMENT_BASE = DEX_MODIFIER + WIS_MODIFIER;

export function sensoryStats(
  overrides: Partial<Attributes> = {},
): CharacterStats {
  return createCharacterStats({ ...SENSORY_ATTRIBUTES, ...overrides }, 10);
}


/**
 * A resolved standard Human body, with every Anatomical Point it has.
 *
 * Routed through the ordinary character resolver rather than assembled by
 * hand, so these fixtures exercise the same Reference Form, morphology and
 * measurement path a real sheet does — and so a change to any of them shows up
 * here rather than being papered over by a private copy of the inputs.
 */
export function sensoryBody(
  pointStates: AnatomicalPointStates = {},
): ResolvedBody {
  return resolveTestCharacter(createTestCharacter({
    body: { ...STANDARD_BODY, anatomicalPoints: pointStates },
  })).body;
}


let intactBody: ResolvedBody | undefined;


/**
 * A profile with ordinary Human anatomy behind it.
 *
 * Options are merged over the anatomy rather than replacing it, so a suite can
 * add Effects or a grant without also having to rebuild a body.
 */
export function sensoryProfile(
  options: ResolveSensoryProfileOptions = {},
  attributes: Partial<Attributes> = {},
): ResolvedSensoryProfile {
  const pointStates = options.pointStates;
  const body = pointStates === undefined
    ? (intactBody ??= sensoryBody())
    : sensoryBody(pointStates);

  return resolveSensoryProfile(sensoryStats(attributes), {
    points: body.anatomicalPoints,
    pointStates: pointStates ?? {},
    footprints: body.sensoryFootprints,
    ...options,
  });
}


/** A profile with NO anatomy at all, for testing grants in isolation. */
export function bodilessProfile(
  options: ResolveSensoryProfileOptions = {},
  attributes: Partial<Attributes> = {},
): ResolvedSensoryProfile {
  return resolveSensoryProfile(sensoryStats(attributes), options);
}


/** One sensory Effect bundle, with every list the resolver expects. */
export function effects(
  overrides: Partial<ResolvedSensoryEffects> = {},
): ResolvedSensoryEffects {
  return { ...EMPTY_SENSORY_EFFECTS, ...overrides };
}


export function source(id: string, type = "trait"): ContributionSourceRef {
  return { type, id };
}

/** A single d20 roll with no advantage. */
export function roll(value: number): CheckDiceInput {
  return { advantage: 0, rolls: [value] };
}


/**
 * A resolved cue.
 *
 * Defaults to visible light at the neutral intensity 5, so an assertion that
 * does not care about loudness gets a zero intensity modifier and reads the
 * other numbers unaltered.
 */
export function cue(overrides: {
  readonly id?: string;
  readonly channel?: SensoryChannelId;
  readonly emissions?: SensoryEmissions;
  readonly phenomenon?: PerceptionPhenomenon;
  readonly subject?: DetectionSubject;
  readonly reception?: SensoryReception;
  readonly source?: ContributionSourceRef;
} = {}): ResolvedSensoryCue {
  return {
    id: overrides.id ?? "footstep",
    source: overrides.source ?? source("cue", "scene"),
    phenomenon: overrides.phenomenon ?? "physical",
    subject: overrides.subject ?? "entity",
    emissions: overrides.emissions ??
      { [overrides.channel ?? "visible-light"]: 5 },
    ...(overrides.reception === undefined
      ? {}
      : { reception: overrides.reception }),
  };
}


/**
 * The single route a cue opens onto a profile, for suites that want one.
 *
 * Throws rather than returning undefined when nothing generated: a fixture
 * that quietly produced no route would turn a broken setup into an assertion
 * about correctly not perceiving something.
 */
export function generatedRoute(
  profile: ResolvedSensoryProfile,
  overrides: Parameters<typeof cue>[0] = {},
  exposure?: SensoryExposureFacts,
): GeneratedSensoryRoute {
  const routes = generateSensoryRoutes({
    profile,
    cue: cue(overrides),
    ...(exposure === undefined ? {} : { exposure }),
  });

  const first = routes[0];

  if (first === undefined) {
    throw new Error("Sensory fixture generated no route for this cue.");
  }

  return first;
}


/** Every route a cue opens, in generation order. */
export function generatedRoutes(
  profile: ResolvedSensoryProfile,
  overrides: Parameters<typeof cue>[0] = {},
  exposure?: SensoryExposureFacts,
): readonly GeneratedSensoryRoute[] {
  return generateSensoryRoutes({
    profile,
    cue: cue(overrides),
    ...(exposure === undefined ? {} : { exposure }),
  });
}


export function route(
  overrides: Partial<ConcealmentRoute> = {},
): ConcealmentRoute {
  return {
    sense: "sight",
    channel: "visible-light",
    phenomenon: "physical",
    subject: "entity",
    ...overrides,
  };
}


/** The Concealment route matching one generated Detection route. */
export function routeOf(generated: GeneratedSensoryRoute): ConcealmentRoute {
  return {
    sense: generated.route.sense,
    channel: generated.route.channel,
    phenomenon: generated.route.phenomenon,
    subject: generated.route.subject,
  };
}
