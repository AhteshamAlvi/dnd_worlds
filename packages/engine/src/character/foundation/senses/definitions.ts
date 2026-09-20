/*
 * Sense definitions — WHO can receive what, and what their score is made of.
 *
 * A Sense is universal. Every registered Sense exists for every creature in
 * the setting; what differs between creatures is whether they have the anatomy
 * or the grant that makes it AVAILABLE, and at what score. Sight is not a
 * Human Sense that a bat lacks — it is a Sense the bat happens to have no
 * functional eyes for, which is a fact about the bat rather than about Sight.
 *
 * That universality is what lets one emission be matched against one registry
 * instead of against each observer's private list of what they can do.
 *
 *
 * THE THREE THINGS A DEFINITION OWNS
 *
 *   receiveChannels  the ONLY declaration of the channel relation. A channel
 *                    does not list its receivers; see channels.ts.
 *   scoreBasis       DATA, not a callback. A registered Sense arrives from a
 *                    host's JSON, and a JSON file cannot carry a function —
 *                    so the score has to be expressible as a shape the
 *                    resolver interprets generically, or custom content is
 *                    second-class by construction.
 *   availability     whether anatomy alone, a grant alone, or either one can
 *                    make it available.
 *
 *
 * NO RESOLVER MAY BRANCH ON AN ID HERE
 *
 * Not `esp`, not `sight`, not `touch`. Everything that reads as special about
 * a built-in — ESP's floor-averaged score, Touch's four channels, ESP being
 * grant-only — is stated in these fields and resolved by the same generic code
 * that resolves a host's homebrew. An `if (senseId === "esp")` anywhere
 * downstream would make that untrue for the next Sense somebody registers, and
 * architecture.test.ts fails on one.
 */

import {
  createRegistry,
  type Definition,
} from "../../../infrastructure/registry";
import type { CharacterStatKey } from "../attributes/stats";
import { isCharacterStatKey } from "../attributes/stats";
import {
  isSensoryChannelId,
  SENSORY_CHANNEL_DEFINITIONS,
  type SensoryChannelId,
} from "./channels";


/*
 * OPEN, for the same reason channel ids are.
 *
 * This replaces the closed six-member union the sensory domain used to have.
 * That union's real defect was not that six was too few — it was that adding a
 * seventh meant editing profile resolution, modifier matching, validation and
 * every `Record<SenseId, ...>` in the codebase, so "register a Sense" was
 * never something a host could do at all.
 */
export type SenseId = string;


export const SENSE_FAMILIES = ["basic", "special"] as const;
export type SenseFamily = typeof SENSE_FAMILIES[number];


export const SENSE_AVAILABILITY_KINDS = [
  "anatomical",
  "granted",
  "anatomical-or-granted",
] as const;

export type SenseAvailabilityKind = typeof SENSE_AVAILABILITY_KINDS[number];


/*
 * How a Sense's score is derived from the creature's stats.
 *
 * Three data shapes, deliberately few. Each one is something a host can write
 * in JSON and this engine can resolve without evaluating anything, which is
 * the property that makes registered Senses genuinely first-class rather than
 * "first-class as long as they look exactly like Sight".
 *
 * `attribute-average` floors ONCE, at the end of the complete expression —
 * see profile.ts. Flooring each attribute first and averaging the results is a
 * different function, and it is the wrong one: PER 7 / SPI 8 would give 7
 * instead of 7 only by coincidence, and PER 7 / SPI 6 would give 6 instead of
 * 6. The divergence shows up wherever support or modifiers are fractional.
 */
export type SenseScoreBasis =
  | { readonly kind: "attribute"; readonly attribute: CharacterStatKey }
  | {
      readonly kind: "attribute-average";
      readonly attributes: readonly CharacterStatKey[];
    }
  | { readonly kind: "fixed"; readonly score: number };


export interface SenseDefinition extends Definition {
  readonly id: SenseId;
  readonly name: string;
  readonly description: string;
  readonly family: SenseFamily;
  readonly receiveChannels: readonly SensoryChannelId[];
  readonly scoreBasis: SenseScoreBasis;
  readonly availability: SenseAvailabilityKind;
}


/** The one Sense the engine names in prose because ESP's rules mention it. */
export const EXTRASENSORY_PERCEPTION_SENSE_ID = "esp";


const PERCEPTION_BASIS: SenseScoreBasis = {
  kind: "attribute",
  attribute: "per",
};


export const SENSE_DEFINITIONS = {
  /* ---- Basic ---------------------------------------------------------- */

  sight: {
    id: "sight",
    name: "Sight",
    description: "Reception of visible light through functional eyes.",
    family: "basic",
    receiveChannels: ["visible-light"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  hearing: {
    id: "hearing",
    name: "Hearing",
    description: "Reception of sound through functional ears.",
    family: "basic",
    receiveChannels: ["sound"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  smell: {
    id: "smell",
    name: "Smell",
    description: "Reception of airborne chemistry through olfactory anatomy.",
    family: "basic",
    receiveChannels: ["airborne-chemical"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  taste: {
    id: "taste",
    name: "Taste",
    description: "Reception of chemistry sampled by direct contact.",
    family: "basic",
    receiveChannels: ["contact-chemical"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  /*
   * Four channels on one Sense, and they are genuinely one Sense.
   *
   * Pressure, a draught across the skin, a tremor through the floor and a
   * tremor through a wall all arrive at the same tactile anatomy and are all
   * read by the same acuity. Splitting them into four Senses would give a
   * character four independent Detection routes through one organ, which the
   * best-route rule exists to prevent.
   */
  touch: {
    id: "touch",
    name: "Touch",
    description:
      "Reception of pressure, air movement and vibration through the skin.",
    family: "basic",
    receiveChannels: [
      "surface-pressure",
      "air-displacement",
      "ground-vibration",
      "structural-vibration",
    ],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  /* ---- Special -------------------------------------------------------- */

  thermoreception: {
    id: "thermoreception",
    name: "Thermoreception",
    description: "Reception of radiated heat as a locating sense.",
    family: "special",
    receiveChannels: ["thermal"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  electroreception: {
    id: "electroreception",
    name: "Electroreception",
    description: "Reception of bioelectric and induced electric fields.",
    family: "special",
    receiveChannels: ["electric-field"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  magnetoreception: {
    id: "magnetoreception",
    name: "Magnetoreception",
    description: "Reception of magnetic orientation and local distortion.",
    family: "special",
    receiveChannels: ["magnetic-field"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  echolocation: {
    id: "echolocation",
    name: "Echolocation",
    description: "Reading the shape of a space from returning echoes.",
    family: "special",
    receiveChannels: ["reflected-sound"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  /*
   * Overlaps Touch on both vibration channels, on purpose.
   *
   * One tremor therefore produces a Touch candidate AND a Vibration Sense
   * candidate for a creature with both, through different receivers. That is
   * the multi-candidate case the route sweep is built for: both are compared,
   * the better one is acted through, and exactly one roll happens.
   */
  "vibration-sense": {
    id: "vibration-sense",
    name: "Vibration Sense",
    description:
      "Dedicated anatomy for reading tremor through ground and structure.",
    family: "special",
    receiveChannels: ["ground-vibration", "structural-vibration"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  "life-perception": {
    id: "life-perception",
    name: "Life Perception",
    description: "Registering living things as living, without seeing them.",
    family: "special",
    receiveChannels: ["life-presence"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  "aura-perception": {
    id: "aura-perception",
    name: "Aura Perception",
    description: "Registering live Nen directly, as an awakened user does.",
    family: "special",
    receiveChannels: ["aura"],
    scoreBasis: PERCEPTION_BASIS,
    availability: "anatomical-or-granted",
  },

  /*
   * ESP: GRANTED, and never unlocked by attributes.
   *
   * There used to be a rule that PER 22 and SPI 20 unlocked it on their own,
   * which meant every high-Perception character silently acquired precognition
   * at a threshold nobody chose and nothing on the sheet mentioned. It is gone
   * — `availability: "granted"` is the whole statement, and profile resolution
   * has no attribute test left to remove.
   *
   * SPI is in the score because the thing being received is not physical. The
   * average is floored once, after support and modifiers.
   */
  [EXTRASENSORY_PERCEPTION_SENSE_ID]: {
    id: EXTRASENSORY_PERCEPTION_SENSE_ID,
    name: "Extrasensory Perception",
    description:
      "Direct apprehension of danger, intent, presence and the abnormal, " +
      "through no physical channel at all.",
    family: "special",
    receiveChannels: [
      "danger",
      "hostile-intent",
      "presence",
      "metaphysical-anomaly",
      "causal-disturbance",
    ],
    scoreBasis: { kind: "attribute-average", attributes: ["per", "spi"] },
    availability: "granted",
  },
} as const satisfies Record<string, SenseDefinition>;


export type BuiltInSenseId = keyof typeof SENSE_DEFINITIONS;


function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((one) => typeof one === "string" && one.trim().length > 0);
}


/**
 * Everything that can be wrong with a Sense definition's own rules.
 *
 * Every channel it claims to receive must EXIST. A Sense receiving a channel
 * nothing emits is merely useless; a Sense receiving a channel that is not
 * registered is a route generator that will never match anything and will
 * never say why, which is the failure this refuses at registration time.
 */
export function findSenseStructuralIssues(
  definition: unknown,
): readonly string[] {
  if (typeof definition !== "object" || definition === null) return [];

  const sense = definition as {
    readonly family?: unknown;
    readonly receiveChannels?: unknown;
    readonly scoreBasis?: unknown;
    readonly availability?: unknown;
  };

  const issues: string[] = [];

  if (
    typeof sense.family !== "string" ||
    !(SENSE_FAMILIES as readonly string[]).includes(sense.family)
  ) {
    issues.push(`must declare a family (${SENSE_FAMILIES.join(" | ")}).`);
  }

  if (
    typeof sense.availability !== "string" ||
    !(SENSE_AVAILABILITY_KINDS as readonly string[])
      .includes(sense.availability)
  ) {
    issues.push(
      `must declare availability (${SENSE_AVAILABILITY_KINDS.join(" | ")}).`,
    );
  }

  if (!isNonEmptyStringArray(sense.receiveChannels)) {
    issues.push("must receive at least one channel.");
  } else {
    const seen = new Set<string>();

    for (const channel of sense.receiveChannels) {
      if (seen.has(channel)) {
        issues.push(`receives channel "${channel}" twice.`);

        continue;
      }

      seen.add(channel);

      if (!isSensoryChannelId(channel)) {
        issues.push(`receives unregistered channel "${channel}".`);
      }
    }
  }

  issues.push(...findScoreBasisIssues(sense.scoreBasis));

  return issues;
}


function findScoreBasisIssues(basis: unknown): readonly string[] {
  if (typeof basis !== "object" || basis === null) {
    return ["must declare a score basis."];
  }

  const shape = basis as {
    readonly kind?: unknown;
    readonly attribute?: unknown;
    readonly attributes?: unknown;
    readonly score?: unknown;
  };

  if (shape.kind === "attribute") {
    return typeof shape.attribute === "string" &&
        isCharacterStatKey(shape.attribute)
      ? []
      : [`names no real attribute in its score basis.`];
  }

  if (shape.kind === "attribute-average") {
    if (!isNonEmptyStringArray(shape.attributes)) {
      return ["must average at least one attribute."];
    }

    const bad = shape.attributes.filter((one) => !isCharacterStatKey(one));

    return bad.length === 0
      ? []
      : [`averages unknown attributes: ${bad.join(", ")}.`];
  }

  if (shape.kind === "fixed") {
    return typeof shape.score === "number" && Number.isFinite(shape.score)
      ? []
      : ["must declare a finite fixed score."];
  }

  return ["must declare a score basis of attribute, attribute-average or fixed."];
}


const SENSE_REGISTRY = createRegistry<SenseDefinition>(
  "Sense",
  SENSE_DEFINITIONS,
  findSenseStructuralIssues,
);


export const senseRegistry = SENSE_REGISTRY;


export function getSenseDefinition(id: SenseId): SenseDefinition | undefined {
  return SENSE_REGISTRY.get(id);
}


export function isSenseId(value: unknown): value is SenseId {
  return typeof value === "string" && SENSE_REGISTRY.isKnownId(value);
}


export function listSenses(): readonly SenseDefinition[] {
  return SENSE_REGISTRY.all();
}


/**
 * Every registered Sense that can receive one channel.
 *
 * The one place the channel-to-Sense direction is computed, and it is computed
 * by asking the Senses rather than by consulting a stored reverse index that
 * could fall out of date the moment a Sense is registered or unregistered.
 */
export function sensesReceiving(
  channel: SensoryChannelId,
): readonly SenseDefinition[] {
  return SENSE_REGISTRY.all().filter((sense) =>
    sense.receiveChannels.includes(channel)
  );
}


export function senseReceivesChannel(
  sense: SenseDefinition,
  channel: SensoryChannelId,
): boolean {
  return sense.receiveChannels.includes(channel);
}


/**
 * Catalog issues, including the cross-cutting one no single definition can see.
 *
 * A built-in channel with no receiver at all is a channel the engine ships
 * that nothing in the engine could ever notice — content that is dead on
 * arrival rather than merely unused. Custom channels are exempt: a host may
 * legitimately register a channel now and the Sense that reads it next.
 */
export function findSenseCatalogIssues(): readonly string[] {
  const issues = [...SENSE_REGISTRY.findCatalogIssues()];

  for (const channel of Object.keys(SENSORY_CHANNEL_DEFINITIONS)) {
    if (sensesReceiving(channel).length === 0) {
      issues.push(
        `Built-in channel "${channel}" is received by no registered Sense, ` +
        `so nothing in the engine could ever notice it.`,
      );
    }
  }

  return issues;
}
