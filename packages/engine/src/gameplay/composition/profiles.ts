/*
 * What each piece of content puts into the world, authored once and reused.
 *
 *
 * WHY THESE LIVE HERE AND NOT ON THE ITEM
 *
 * The obvious home for "how loud is a bow" is the bow. It is not available.
 * `character/` never imports `gameplay/` — the direction is one-way and
 * checked — so an `emissions` field on `ItemDefinition` would need the
 * contribution type, which needs the phase vocabulary and the sensory
 * channels, which would drag this whole domain downward into content and
 * reverse a layering the architecture tests enforce.
 *
 * So the profile is keyed BY the content instead of stored ON it. Composition
 * reaches down for "what does this source emit", which is the direction that
 * already works, and a Skill, an Item or a phenomenon all answer the same way.
 *
 * This is a lookup and deliberately not a branch. Nothing here says
 * `if (skillId === "fire-blast")`; a profile is selected by matching the
 * source reference it declares, exactly as R5 requires, which is why a host's
 * homebrew Skill gets emissions by registering a profile rather than by
 * being added to a switch nobody can see.
 *
 *
 * WHY A SKILL INHERITS ITS IMPLEMENT'S PROFILE
 *
 * Because that is what physically happens. An arrow does not become quiet
 * because a trained archer loosed it, and a Skill that says nothing about
 * sound is not a silent Skill — it is a Skill with no opinion, using
 * equipment that has one. `collectEmissionContributions` therefore gathers
 * from every source involved in the action, and a Skill overrides its
 * implement only by declaring something louder, or by carrying an authorized
 * adjustment that suppresses it outright.
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
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import {
  findExecutableDataIssues,
  findSensoryEmissionContributionIssues,
  type SensoryEmissionContribution,
} from "./contributions";
import {
  findChannelPropagationProfileIssues,
  type ChannelPropagationProfile,
} from "./propagation";
import type { ThreatSeverity } from "./threat";


/**
 * One contribution as an author writes it: everything but the provenance.
 *
 * `source` is stamped on by `collectEmissionContributions` from the profile's
 * own declaration, so an author cannot accidentally attribute their arrow's
 * noise to somebody else's bow, and every contribution in a trace is
 * guaranteed to name content that really declared it.
 */
export type AuthoredEmission = Omit<SensoryEmissionContribution, "source">;


export interface EmissionProfileDefinition extends Definition {
  /**
   * The content this speaks for.
   *
   * Matched on type and id. Instance ids are deliberately NOT matched: a
   * profile describes what a kind of thing does, and all three arrows in a
   * quiver sound the same.
   */
  readonly appliesTo: { readonly type: string; readonly id: string };

  readonly emissions: readonly AuthoredEmission[];

  /** How those emissions weaken on the way out. */
  readonly propagation?: readonly ChannelPropagationProfile[];

  /**
   * How bad it is for whatever it is pointed at.
   *
   * Content's to state, because only content knows. Urgency and commitment
   * are NOT here: those follow from how far through the action you are, which
   * is a fact about the moment rather than about the Skill — see
   * `urgencyForPhase` in action.ts.
   */
  readonly threatSeverity?: ThreatSeverity;
}


export function findEmissionProfileIssues(
  definition: EmissionProfileDefinition,
  path = "profile",
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findExecutableDataIssues(definition, path),
  ];

  const appliesTo = definition?.appliesTo;

  if (
    typeof appliesTo?.type !== "string" ||
    appliesTo.type.trim().length === 0 ||
    typeof appliesTo.id !== "string" ||
    appliesTo.id.trim().length === 0
  ) {
    errors.push({
      code: "composition.profile.applies-to.invalid",
      message: "An emission profile must name the content it speaks for.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.appliesTo` },
      required: "a type and an id",
      actual: describeDiagnosticValue(appliesTo),
    });
  }

  if (!Array.isArray(definition?.emissions) || definition.emissions.length === 0) {
    errors.push({
      code: "composition.profile.emissions.empty",
      message: "An emission profile must declare at least one emission.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.emissions` },
      required: "at least one emission",
      actual: describeDiagnosticValue(definition?.emissions),
    });
  } else {
    definition.emissions.forEach((emission, index) => {
      /*
       * Validated by stamping a placeholder source on, so authored emissions
       * and runtime contributions are judged by ONE function. A second,
       * source-less validator would be a second set of rules about the same
       * shape, free to drift.
       */
      errors.push(
        ...findSensoryEmissionContributionIssues(
          { ...emission, source: { type: "profile", id: definition.id } },
          `${path}.emissions[${index}]`,
        ),
      );
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

  if (
    definition?.threatSeverity !== undefined &&
    (!Number.isInteger(definition.threatSeverity) ||
      definition.threatSeverity < 1 ||
      definition.threatSeverity > 5)
  ) {
    errors.push({
      code: "composition.profile.severity.invalid",
      message: "An emission profile's threat severity must be a whole number from 1 to 5.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.threatSeverity` },
      required: "integer 1-5",
      actual: describeDiagnosticValue(definition.threatSeverity),
    });
  }

  return errors;
}


/** The registration barrier's view. See phenomena/profiles.ts for why. */
export function findEmissionProfileStructuralIssues(
  candidate: unknown,
): readonly string[] {
  if (typeof candidate !== "object" || candidate === null) {
    return ["An emission profile must be an object."];
  }

  return findEmissionProfileIssues(candidate as EmissionProfileDefinition)
    .map((error) => error.message);
}


export const EMISSION_PROFILE_DEFINITIONS = {
  /*
   * The one authored action profile, and the vertical slice this architecture
   * was proved against.
   *
   * Fire Blast was chosen because it is the engine's only real ranged
   * projectile: its own definition says the fire CROSSES the gap rather than
   * arriving instantly, which is what gives it a genuine travel phase and
   * therefore a genuine release-versus-impact distinction. A melee Skill would
   * have proved the phase vocabulary against an action that only ever has two
   * of the five.
   *
   * The intensities are ordinal positions on the 1-10 scale, relative to each
   * other rather than measured. Fire is loudest and brightest where it lands,
   * it is Nen the whole way (a second phenomenon on the same steps, which is
   * what proves cues do not merge across phenomena), and what it leaves behind
   * is smoke and warmth rather than a bang.
   */
  "fire-blast": {
    id: "fire-blast",
    name: "Fire Blast emissions",
    description: "What projecting fire offensively puts into the world.",

    appliesTo: { type: "skill", id: "fire-blast" },

    threatSeverity: 3,

    emissions: [
      /* Gathering it: visible at the bender, not yet a threat anywhere else. */
      { appliesTo: { phase: "preparation" }, subject: "action", phenomenon: "physical", channel: "visible-light", intensity: 4, anchor: "actor" },
      { appliesTo: { phase: "preparation" }, subject: "action", phenomenon: "nen", channel: "aura", intensity: 5, anchor: "actor" },

      /* The loose. Loud and bright, and it happens where the bender is. */
      { appliesTo: { phase: "release" }, subject: "action", phenomenon: "physical", channel: "visible-light", intensity: 7, anchor: "actor" },
      { appliesTo: { phase: "release" }, subject: "action", phenomenon: "physical", channel: "sound", intensity: 5, anchor: "actor" },
      { appliesTo: { phase: "release" }, subject: "action", phenomenon: "physical", channel: "thermal", intensity: 5, anchor: "actor" },
      { appliesTo: { phase: "release" }, subject: "action", phenomenon: "nen", channel: "aura", intensity: 6, anchor: "actor" },

      /* In flight: anchored to the step, which is where the blast has got to. */
      { appliesTo: { phase: "travel" }, subject: "action", phenomenon: "physical", channel: "visible-light", intensity: 6, anchor: "step" },
      { appliesTo: { phase: "travel" }, subject: "action", phenomenon: "physical", channel: "thermal", intensity: 4, anchor: "step" },
      { appliesTo: { phase: "travel" }, subject: "action", phenomenon: "nen", channel: "aura", intensity: 5, anchor: "step" },

      /* Arrival, at the far end. Different place, different cue. */
      { appliesTo: { phase: "impact" }, subject: "action", phenomenon: "physical", channel: "visible-light", intensity: 7, anchor: "target" },
      { appliesTo: { phase: "impact" }, subject: "action", phenomenon: "physical", channel: "sound", intensity: 6, anchor: "target" },
      { appliesTo: { phase: "impact" }, subject: "action", phenomenon: "physical", channel: "thermal", intensity: 7, anchor: "target" },

      /* What is left: scorch and smoke, and no longer an action. */
      { appliesTo: { phase: "aftermath" }, subject: "trace", phenomenon: "physical", channel: "thermal", intensity: 4, anchor: "target" },
      { appliesTo: { phase: "aftermath" }, subject: "trace", phenomenon: "physical", channel: "airborne-chemical", intensity: 5, anchor: "target" },
    ],

    propagation: [
      {
        channel: "sound",
        source: { type: "skill", id: "fire-blast" },
        distance: [
          { beyondMetres: 20, adjustBy: -1 },
          { beyondMetres: 60, adjustBy: -3 },
        ],
        environment: [
          { factor: "ambientNoise", band: "loud", adjustBy: -2 },
          { factor: "ambientNoise", band: "overwhelming", adjustBy: -3 },
        ],
      },
      {
        channel: "visible-light",
        source: { type: "skill", id: "fire-blast" },
        distance: [
          { beyondMetres: 50, adjustBy: -1 },
          { beyondMetres: 150, adjustBy: -2 },
        ],
        environment: [
          { factor: "illumination", band: "absent", adjustBy: 2 },
          { factor: "illumination", band: "overwhelming", adjustBy: -2 },
          /*
           * Blocked, not attenuated. A wall between you and a fireball is a
           * different fact from a hundred metres of air, and the two produce
           * different answers downstream: one leaves a faint route to fail a
           * roll against, the other leaves no route at all.
           */
          { factor: "visibility", band: "blocked", blocks: true },
        ],
      },
      {
        channel: "thermal",
        source: { type: "skill", id: "fire-blast" },
        distance: [
          { beyondMetres: 5, adjustBy: -2 },
          { beyondMetres: 20, adjustBy: -4 },
        ],
        environment: [{ factor: "visibility", band: "blocked", blocks: true }],
      },
    ],
  },
} as const satisfies Record<string, EmissionProfileDefinition>;


export type KnownEmissionProfileId = keyof typeof EMISSION_PROFILE_DEFINITIONS;


const EMISSION_PROFILE_REGISTRY = createRegistry<EmissionProfileDefinition>(
  "Emission Profile",
  EMISSION_PROFILE_DEFINITIONS,
  composeStructuralValidators(findEmissionProfileStructuralIssues),
);


export const emissionProfileRegistry = EMISSION_PROFILE_REGISTRY;


/**
 * Every contribution the sources involved in one action declare.
 *
 * Sources are asked in the order given and contributions come back in that
 * order, which is what makes the maximum rule's tie-break deterministic: the
 * caller's ordering is stable, so an equal-intensity tie resolves identically
 * on every host.
 *
 * A source with no profile contributes nothing and is not an error. Most
 * content is silent, and requiring a profile per Item would mean authoring
 * "this rock emits nothing" for every rock.
 */
export function collectEmissionContributions(
  sources: readonly ContributionSourceRef[],
  profiles: readonly EmissionProfileDefinition[],
): readonly SensoryEmissionContribution[] {
  const contributions: SensoryEmissionContribution[] = [];

  for (const source of sources) {
    for (const profile of profiles) {
      if (
        profile.appliesTo.type !== source.type ||
        profile.appliesTo.id !== source.id
      ) {
        continue;
      }

      for (const emission of profile.emissions) {
        contributions.push({ ...emission, source });
      }
    }
  }

  return contributions;
}


/** Every propagation rule the sources involved declare, deduplicated by channel. */
export function collectPropagationProfiles(
  sources: readonly ContributionSourceRef[],
  profiles: readonly EmissionProfileDefinition[],
): readonly ChannelPropagationProfile[] {
  const byChannel = new Map<string, ChannelPropagationProfile>();

  for (const source of sources) {
    for (const profile of profiles) {
      if (
        profile.appliesTo.type !== source.type ||
        profile.appliesTo.id !== source.id
      ) {
        continue;
      }

      for (const entry of profile.propagation ?? []) {
        /*
         * First declaration wins, matching the source order the caller gave.
         * A Skill listed before its Item therefore owns the falloff for a
         * channel they both describe, which is the same precedence the caller
         * already established — rather than a second, invisible one.
         */
        if (!byChannel.has(entry.channel)) byChannel.set(entry.channel, entry);
      }
    }
  }

  return [...byChannel.values()];
}


/** The severity the involved content declares, if any does. */
export function collectThreatSeverity(
  sources: readonly ContributionSourceRef[],
  profiles: readonly EmissionProfileDefinition[],
): ThreatSeverity | undefined {
  let severity: ThreatSeverity | undefined;

  for (const source of sources) {
    for (const profile of profiles) {
      if (
        profile.appliesTo.type !== source.type ||
        profile.appliesTo.id !== source.id ||
        profile.threatSeverity === undefined
      ) {
        continue;
      }

      /*
       * The worst wins. An arrow fired from a cursed bow is as dangerous as
       * the more dangerous of the two, not the average and not whichever
       * happened to be listed first.
       */
      if (severity === undefined || profile.threatSeverity > severity) {
        severity = profile.threatSeverity;
      }
    }
  }

  return severity;
}


/** Diagnostic helper: which profiles a set of sources actually matched. */
export function describeMatchedProfiles(
  sources: readonly ContributionSourceRef[],
  profiles: readonly EmissionProfileDefinition[],
): readonly string[] {
  return sources.flatMap((source) =>
    profiles
      .filter((profile) =>
        profile.appliesTo.type === source.type &&
        profile.appliesTo.id === source.id
      )
      .map((profile) => `${contributionSourceKey(source)} -> ${profile.id}`)
  );
}
