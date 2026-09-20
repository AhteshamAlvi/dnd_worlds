/*
 * What a continuing phenomenon puts into the world, authored once.
 *
 * A profile is the reusable half of a persistent source: every campfire in
 * every scene emits the same things, and only WHERE and WHEN differ. Splitting
 * them is what stops a host from having to restate "fires are bright and
 * smoky" per fire — and stops six fires from disagreeing about it.
 *
 *
 * THE NUMBERS BELOW ARE CONTENT
 *
 * Intensities and falloff tables are authored values, not derived ones, and
 * they live on the profile rather than in any resolver. That is the rule R10
 * exists to protect: there is no global "heavy rain costs 2" anywhere in the
 * engine, because such a rule would apply to scent, danger-sense and Aura
 * along with sight. The campfire declares what rain does to ITS smoke, and a
 * phenomenon that has no opinion about rain is unaffected by it.
 */

import {
  composeStructuralValidators,
  createRegistry,
  type Definition,
} from "../../infrastructure/registry";
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import {
  isSensoryChannelId,
  isSensoryIntensity,
  type SensoryChannelId,
  type SensoryIntensity,
} from "../../character/foundation/senses/channels";
import {
  isDetectionSubject,
  isPerceptionPhenomenon,
  type DetectionSubject,
  type PerceptionPhenomenon,
} from "../../character/foundation/senses/scopes";
import {
  findChannelPropagationProfileIssues,
  type ChannelPropagationProfile,
} from "../composition/propagation";
import { findExecutableDataIssues } from "../composition/contributions";


/** One channel a phenomenon emits on, at the source. */
export interface PhenomenonEmission {
  readonly channel: SensoryChannelId;
  readonly intensity: SensoryIntensity;
  readonly subject: DetectionSubject;
  readonly phenomenon: PerceptionPhenomenon;
}


export interface PhenomenonProfileDefinition extends Definition {
  readonly emissions: readonly PhenomenonEmission[];

  /** How each channel weakens on the way out. See composition/propagation.ts. */
  readonly propagation?: readonly ChannelPropagationProfile[];
}


export function findPhenomenonProfileIssues(
  definition: PhenomenonProfileDefinition,
  path = "profile",
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findExecutableDataIssues(definition, path),
  ];

  if (!Array.isArray(definition?.emissions) || definition.emissions.length === 0) {
    errors.push({
      code: "phenomena.profile.emissions.empty",
      message: "A phenomenon profile must emit on at least one channel.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.emissions` },
      required: "at least one emission",
      actual: describeDiagnosticValue(definition?.emissions),
    });
  } else {
    const seen = new Set<string>();

    definition.emissions.forEach((emission, index) => {
      const emissionPath = `${path}.emissions[${index}]`;

      if (!isSensoryChannelId(emission?.channel)) {
        errors.push({
          code: "phenomena.profile.channel.unknown",
          message: "A phenomenon may only emit on a registered sensory channel.",
          audience: "developer",
          subject: { kind: "field", id: `${emissionPath}.channel` },
          required: "a registered sensory channel id",
          actual: describeDiagnosticValue(emission?.channel),
        });
      } else if (seen.has(emission.channel)) {
        /*
         * Two intensities for one channel on one profile is an author
         * contradicting themselves, and no combination rule applies: these
         * are not competing sources, they are one source written twice.
         */
        errors.push({
          code: "phenomena.profile.channel.duplicate",
          message: "A phenomenon profile states two intensities for one channel.",
          audience: "developer",
          subject: { kind: "field", id: `${emissionPath}.channel` },
          required: "one emission per channel",
          actual: emission.channel,
        });
      } else {
        seen.add(emission.channel);
      }

      if (!isSensoryIntensity(emission?.intensity)) {
        errors.push({
          code: "phenomena.profile.intensity.invalid",
          message: "A phenomenon's intensity must be a whole number from 1 to 10.",
          audience: "developer",
          subject: { kind: "field", id: `${emissionPath}.intensity` },
          required: "integer 1-10",
          actual: describeDiagnosticValue(emission?.intensity),
        });
      }

      if (!isDetectionSubject(emission?.subject)) {
        errors.push({
          code: "phenomena.profile.subject.invalid",
          message: "A phenomenon emission must name what kind of thing it is.",
          audience: "developer",
          subject: { kind: "field", id: `${emissionPath}.subject` },
          required: "a known detection subject",
          actual: describeDiagnosticValue(emission?.subject),
        });
      }

      if (!isPerceptionPhenomenon(emission?.phenomenon)) {
        errors.push({
          code: "phenomena.profile.phenomenon.invalid",
          message: "A phenomenon emission must name the kind of phenomenon it is.",
          audience: "developer",
          subject: { kind: "field", id: `${emissionPath}.phenomenon` },
          required: "a known perception phenomenon",
          actual: describeDiagnosticValue(emission?.phenomenon),
        });
      }
    });
  }

  (definition?.propagation ?? []).forEach((profile, index) => {
    errors.push(
      ...findChannelPropagationProfileIssues(
        profile,
        `${path}.propagation[${index}]`,
      ),
    );
  });

  return errors;
}


/**
 * The registration barrier's view of the same rules.
 *
 * A separate function rather than a cast, because the barrier judges a
 * host's homebrew — which is `unknown` by construction and may not have the
 * fields at all — while `findPhenomenonProfileIssues` above is what typed
 * callers ask. Both walk the same checks, so a homebrew profile and an
 * authored one are refused for exactly the same reasons.
 */
export function findPhenomenonProfileStructuralIssues(
  candidate: unknown,
): readonly string[] {
  if (typeof candidate !== "object" || candidate === null) {
    return ["A phenomenon profile must be an object."];
  }

  return findPhenomenonProfileIssues(
    candidate as PhenomenonProfileDefinition,
  ).map((error) => error.message);
}


/** The provenance stamped onto every cue a profile produces. */
export function phenomenonSourceRef(
  profileId: string,
  sourceId: string,
): ContributionSourceRef {
  return { type: "phenomenon", id: profileId, instanceId: sourceId };
}


const CAMPFIRE_RULE: ContributionSourceRef = {
  type: "phenomenon",
  id: "campfire",
};


export const PHENOMENON_PROFILE_DEFINITIONS = {
  /*
   * One authored phenomenon, and the one the architecture was proved against.
   *
   * It emits on all four channels a fire physically occupies, which is the
   * point of choosing it: a fire is not a "light source" with some extras, it
   * is one event that a watcher, a listener, something cold and something with
   * a nose each perceive differently — and four channels from one source is
   * what makes route selection's "one best route" rule mean anything.
   *
   * The intensities are ordinal positions on the 1-10 scale whose ordinary
   * midpoint is 5, chosen relative to each other rather than measured:
   * a fire at night is the most conspicuous thing in view, its smoke carries
   * furthest and lingers, its warmth is noticeable well before it is
   * uncomfortable, and its actual crackle is the quietest thing about it.
   */
  campfire: {
    id: "campfire",
    name: "Campfire",
    description: "An open wood fire, burning down over an evening.",

    emissions: [
      { channel: "visible-light", intensity: 7, subject: "environment", phenomenon: "physical" },
      { channel: "airborne-chemical", intensity: 6, subject: "environment", phenomenon: "physical" },
      { channel: "thermal", intensity: 6, subject: "environment", phenomenon: "physical" },
      { channel: "sound", intensity: 3, subject: "environment", phenomenon: "physical" },
    ],

    propagation: [
      {
        channel: "visible-light",
        source: CAMPFIRE_RULE,
        /*
         * Light falls off with distance but a flame stays a flame: the bands
         * are gentle, because the thing that actually hides a fire is
         * something in the way rather than another fifty metres of air.
         */
        distance: [
          { beyondMetres: 30, adjustBy: -1 },
          { beyondMetres: 100, adjustBy: -2 },
        ],
        environment: [
          /*
           * The signed adjustment R10 exists for. Darkness does not dim a
           * fire — it makes it the only thing there is to look at — and a
           * global "darkness attenuates" rule would have got this backwards
           * for every light source in the game.
           */
          { factor: "illumination", band: "absent", adjustBy: 2 },
          { factor: "illumination", band: "bright", adjustBy: -2 },
          { factor: "illumination", band: "overwhelming", adjustBy: -3 },
          { factor: "visibility", band: "heavily-obscured", adjustBy: -2 },
          { factor: "visibility", band: "blocked", blocks: true },
        ],
      },
      {
        channel: "sound",
        source: CAMPFIRE_RULE,
        distance: [
          { beyondMetres: 10, adjustBy: -1 },
          { beyondMetres: 25, adjustBy: -2 },
        ],
        environment: [
          { factor: "ambientNoise", band: "loud", adjustBy: -2 },
          { factor: "ambientNoise", band: "overwhelming", adjustBy: -3 },
          { factor: "ambientNoise", band: "silent", adjustBy: 1 },
          /* Rain on a fire is loud in the wrong way: it masks the crackle. */
          { factor: "precipitation", band: "heavy", adjustBy: -1 },
        ],
      },
      {
        channel: "thermal",
        source: CAMPFIRE_RULE,
        /*
         * The steepest table of the four, and deliberately so. Radiant heat is
         * the one channel where standing twice as far away genuinely halves
         * what reaches you, which is why a fire is warm at arm's length and
         * irrelevant across a clearing.
         */
        distance: [
          { beyondMetres: 5, adjustBy: -2 },
          { beyondMetres: 15, adjustBy: -4 },
          /*
           * Far enough out it simply is not there. Attenuated below the floor
           * rather than `blocks: true`, and the difference is the point:
           * nothing stopped it, it ran out. A blocked channel says a wall is
           * in the way, which would be a claim about the terrain rather than
           * about how radiant heat behaves.
           */
          { beyondMetres: 40, adjustBy: -9 },
        ],
        environment: [
          { factor: "visibility", band: "blocked", blocks: true },
        ],
      },
      {
        channel: "airborne-chemical",
        source: CAMPFIRE_RULE,
        distance: [
          { beyondMetres: 50, adjustBy: -1 },
          { beyondMetres: 150, adjustBy: -2 },
        ],
        environment: [
          /*
           * Wind is the whole story for smoke, and it is the reason the
           * environment vocabulary carries a RELATIONSHIP as well as a
           * strength: the same gale that puts the smell in your face takes it
           * away from the person opposite you.
           */
          { factor: "windRelationship", band: "tailwind", adjustBy: 2 },
          { factor: "windRelationship", band: "headwind", adjustBy: -2 },
          { factor: "wind", band: "extreme", adjustBy: -2 },
          { factor: "precipitation", band: "heavy", adjustBy: -2 },
        ],
      },
    ],
  },
} as const satisfies Record<string, PhenomenonProfileDefinition>;


export type KnownPhenomenonProfileId =
  keyof typeof PHENOMENON_PROFILE_DEFINITIONS;


const PHENOMENON_PROFILE_REGISTRY = createRegistry<PhenomenonProfileDefinition>(
  "Phenomenon Profile",
  PHENOMENON_PROFILE_DEFINITIONS,
  composeStructuralValidators(findPhenomenonProfileStructuralIssues),
);


export const phenomenonProfileRegistry = PHENOMENON_PROFILE_REGISTRY;
