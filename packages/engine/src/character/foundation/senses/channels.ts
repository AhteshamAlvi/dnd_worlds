/*
 * Sensory channels — WHAT is travelling, as opposed to who can receive it.
 *
 * A channel is a physical or metaphysical carrier: visible light, sound,
 * airborne chemistry, a magnetic field, a sense of danger. An emission states
 * how strongly it is putting energy into each channel; a Sense states which
 * channels it can receive. Those are the two halves of the model, and keeping
 * them apart is the whole point of this file existing separately from
 * definitions.ts.
 *
 *
 * A CHANNEL DOES NOT LIST ITS RECEIVERS
 *
 * The relation is owned in exactly one direction: `SenseDefinition.
 * receiveChannels`. A channel carrying its own list of receiving Senses would
 * be a second declaration of the same fact, and the first time a homebrew
 * Sense registered itself the two would disagree — the Sense would claim to
 * hear `ground-vibration` and the channel would not know about it, and which
 * of those two answers a resolver got would depend on which side it happened
 * to ask.
 *
 * So a channel knows what it IS and nothing about who notices it. Registering
 * a new Sense that receives an existing channel therefore requires no edit
 * here, which is the property §19 asks for by name.
 *
 *
 * WHY `propagation` IS THE ONE CLASSIFICATION
 *
 * Route resolution has to answer one question a channel id alone cannot: does
 * reaching a receiver require touching it. A taste needs a tongue in contact
 * with the thing; a smell does not need anything in contact with anything.
 * That distinction decides which receivers a caller's supplied exposure facts
 * are allowed to satisfy, so it is stored rather than inferred from a
 * hard-coded list of ids somewhere downstream.
 *
 * Everything else a UI might want — a medium, an icon, a grouping — is either
 * derivable from the description or is presentation, and neither belongs in a
 * field that validation would then be tempted to branch on.
 */

import {
  createRegistry,
  type Definition,
} from "../../../infrastructure/registry";


/*
 * An OPEN id, deliberately.
 *
 * `SensoryChannelId` is a string rather than a union of the built-ins, because
 * a host registering a `radio` channel and a Sense that receives it must not
 * require an engine edit. Validation happens against the registry at the
 * authored-content and request boundaries — never by an array `.includes()`
 * copied into a resolver, which is the failure mode the closed `SENSE_IDS`
 * union had.
 */
export type SensoryChannelId = string;


/*
 * How a channel reaches a receiver.
 *
 *   ambient  arrives through the intervening medium; any exposed receiver of
 *            that channel is a candidate
 *   contact  requires the receiver to be touching the source or the medium
 *            carrying it; the caller supplies the contact facts
 */
export const SENSORY_CHANNEL_PROPAGATIONS = ["ambient", "contact"] as const;

export type SensoryChannelPropagation =
  typeof SENSORY_CHANNEL_PROPAGATIONS[number];


export interface SensoryChannelDefinition extends Definition {
  readonly id: SensoryChannelId;
  readonly name: string;
  readonly description: string;
  readonly propagation: SensoryChannelPropagation;
}


/*
 * Intensity is a closed 1-10 scale and stays closed.
 *
 * Unlike ids, this is not a vocabulary a host extends: the scale is the
 * mechanic. Its midpoint is 5 and its modifier is `I - 5`, so widening it
 * would silently move where "ordinary" sits. Zero is absent rather than
 * silent — an emission that is not happening omits the channel.
 */
export type SensoryIntensity =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const MINIMUM_SENSORY_INTENSITY = 1;
export const MAXIMUM_SENSORY_INTENSITY = 10;

/*
 * The intensity that contributes nothing. Named rather than written as a bare
 * 5 in the one place the modifier is derived, so the reason the table is
 * centred where it is stays legible.
 */
export const NEUTRAL_SENSORY_INTENSITY = 5;


export function isSensoryIntensity(value: unknown): value is SensoryIntensity {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= MINIMUM_SENSORY_INTENSITY && value <= MAXIMUM_SENSORY_INTENSITY;
}


/**
 * What a received intensity is worth on the check.
 *
 * `I - 5`, and counted EXACTLY ONCE — see detection/passive.ts and
 * detection/resolution.ts, which are the only two callers. Perception does not
 * also add it; a cue that is easy to notice must not be easy twice.
 */
export function sensoryIntensityModifier(intensity: SensoryIntensity): number {
  return intensity - NEUTRAL_SENSORY_INTENSITY;
}


export const SENSORY_CHANNEL_DEFINITIONS = {
  /* ---- Electromagnetic ------------------------------------------------ */

  "visible-light": {
    id: "visible-light",
    name: "Visible Light",
    description: "Light reflected or emitted in the range ordinary eyes see.",
    propagation: "ambient",
  },

  thermal: {
    id: "thermal",
    name: "Thermal Radiation",
    description: "Heat radiating from a warmer body into a cooler surround.",
    propagation: "ambient",
  },

  /* ---- Mechanical ----------------------------------------------------- */

  sound: {
    id: "sound",
    name: "Sound",
    description: "Pressure waves travelling through air or water.",
    propagation: "ambient",
  },

  "reflected-sound": {
    id: "reflected-sound",
    name: "Reflected Sound",
    description:
      "The returning echo of a sound, carrying the shape it bounced off.",
    propagation: "ambient",
  },

  "air-displacement": {
    id: "air-displacement",
    name: "Air Displacement",
    description: "Moving air — a draught, a wingbeat, a blade passing close.",
    propagation: "ambient",
  },

  "surface-pressure": {
    id: "surface-pressure",
    name: "Surface Pressure",
    description: "Direct mechanical pressure against a receiving surface.",
    propagation: "contact",
  },

  "ground-vibration": {
    id: "ground-vibration",
    name: "Ground Vibration",
    description: "Tremor carried through the ground to whatever stands on it.",
    propagation: "contact",
  },

  "structural-vibration": {
    id: "structural-vibration",
    name: "Structural Vibration",
    description:
      "Tremor carried through a structure, web or surface being touched.",
    propagation: "contact",
  },

  /* ---- Chemical ------------------------------------------------------- */

  "airborne-chemical": {
    id: "airborne-chemical",
    name: "Airborne Chemistry",
    description: "Volatile compounds carried on the air.",
    propagation: "ambient",
  },

  "contact-chemical": {
    id: "contact-chemical",
    name: "Contact Chemistry",
    description: "Compounds sampled by direct contact with the substance.",
    propagation: "contact",
  },

  /* ---- Fields --------------------------------------------------------- */

  "electric-field": {
    id: "electric-field",
    name: "Electric Field",
    description: "The bioelectric or induced field around a body or device.",
    propagation: "ambient",
  },

  "magnetic-field": {
    id: "magnetic-field",
    name: "Magnetic Field",
    description: "Magnetic orientation and local distortions in it.",
    propagation: "ambient",
  },

  /* ---- Metaphysical --------------------------------------------------- */

  "life-presence": {
    id: "life-presence",
    name: "Life Presence",
    description: "The bare fact of a living thing being somewhere.",
    propagation: "ambient",
  },

  aura: {
    id: "aura",
    name: "Aura",
    description: "Live Nen, as something a receiver can register directly.",
    propagation: "ambient",
  },

  danger: {
    id: "danger",
    name: "Danger",
    description: "Imminent harm, as an impression arriving before its cause.",
    propagation: "ambient",
  },

  "hostile-intent": {
    id: "hostile-intent",
    name: "Hostile Intent",
    description: "Another mind's decision to do harm.",
    propagation: "ambient",
  },

  presence: {
    id: "presence",
    name: "Presence",
    description:
      "Something being there, without saying what it is or how it shows.",
    propagation: "ambient",
  },

  "metaphysical-anomaly": {
    id: "metaphysical-anomaly",
    name: "Metaphysical Anomaly",
    description: "A local wrongness in how reality is behaving.",
    propagation: "ambient",
  },

  "causal-disturbance": {
    id: "causal-disturbance",
    name: "Causal Disturbance",
    description:
      "A disruption in the ordinary order of cause and effect, such as a " +
      "future pressing backwards on the present.",
    propagation: "ambient",
  },
} as const satisfies Record<string, SensoryChannelDefinition>;


export type BuiltInSensoryChannelId = keyof typeof SENSORY_CHANNEL_DEFINITIONS;


/**
 * The shape rules a registered channel must satisfy.
 *
 * Id, name and description are the registry's own business and are checked
 * there. What is local to this domain is the propagation classification, which
 * route resolution reads and therefore cannot be absent or invented.
 */
export function findSensoryChannelStructuralIssues(
  definition: unknown,
): readonly string[] {
  if (typeof definition !== "object" || definition === null) return [];

  const channel = definition as { readonly propagation?: unknown };

  if (
    typeof channel.propagation !== "string" ||
    !(SENSORY_CHANNEL_PROPAGATIONS as readonly string[])
      .includes(channel.propagation)
  ) {
    return [
      `must declare how it propagates (${
        SENSORY_CHANNEL_PROPAGATIONS.join(" | ")
      }).`,
    ];
  }

  return [];
}


const CHANNEL_REGISTRY = createRegistry<SensoryChannelDefinition>(
  "Sensory Channel",
  SENSORY_CHANNEL_DEFINITIONS,
  findSensoryChannelStructuralIssues,
);


export const sensoryChannelRegistry = CHANNEL_REGISTRY;


export function getSensoryChannel(
  id: SensoryChannelId,
): SensoryChannelDefinition | undefined {
  return CHANNEL_REGISTRY.get(id);
}


/**
 * Whether an id names a channel this engine knows about RIGHT NOW.
 *
 * Registry-backed rather than an array check, so a host's registered channel
 * is as real as a built-in one the moment it is registered — and so that a
 * typo in authored content is refused rather than quietly producing a route
 * nothing can ever receive.
 */
export function isSensoryChannelId(value: unknown): value is SensoryChannelId {
  return typeof value === "string" && CHANNEL_REGISTRY.isKnownId(value);
}


export function listSensoryChannels(): readonly SensoryChannelDefinition[] {
  return CHANNEL_REGISTRY.all();
}


export function findSensoryChannelCatalogIssues(): readonly string[] {
  return CHANNEL_REGISTRY.findCatalogIssues();
}
