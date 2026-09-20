/*
 * What the world is doing, as bands the host reports and nobody scores.
 *
 *
 * WHY BANDS AND NOT NUMBERS
 *
 * A host knows it is raining. It does not know what rain is worth, and it must
 * not have to: "heavy rain" is a fact about the weather, while "-2 to spot
 * things" is a rule about one channel in one system. A host that had to supply
 * the modifier would be authoring the mechanic, and six hosts would author six
 * different ones.
 *
 * So these are vocabularies and nothing else. There is deliberately no
 * `illuminationModifier(band)` anywhere in this domain, because a global
 * modifier attached to a band is the exact thing that makes darkness affect
 * hearing, scent and danger-sense along with sight. Each owning projection
 * asks whether a band matters TO IT — see propagation.ts, where a channel's
 * own profile declares which bands attenuate it and by how much — and a band
 * nothing declares an interest in contributes nothing at all.
 *
 *
 * WHY "ABSENT" AND "BLOCKED" ARE NOT THE SAME AS THE BAND BELOW THEM
 *
 * `absent` illumination is not very dim light and `blocked` visibility is not
 * very obscured. The distinction is load-bearing at exactly the point these
 * are consumed: a channel can be attenuated to nothing by degrees, or it can
 * be stopped, and those produce different sensory outcomes — the first leaves
 * a faint route to fail a roll against, the second leaves no route at all. A
 * scale that merged them would quietly convert every wall into thick fog.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";


/** How much light there is to see by. */
export const ILLUMINATION_BANDS = [
  "absent",
  "dim",
  "normal",
  "bright",
  "overwhelming",
] as const;

export type IlluminationBand = typeof ILLUMINATION_BANDS[number];


/** How much noise a new sound has to be heard over. */
export const AMBIENT_NOISE_BANDS = [
  "silent",
  "quiet",
  "ordinary",
  "loud",
  "overwhelming",
] as const;

export type AmbientNoiseBand = typeof AMBIENT_NOISE_BANDS[number];


/**
 * How much of the way is seeable through.
 *
 * Distinct from cover (spatial/facts.ts), which is about being shielded rather
 * than being hidden: total cover and blocked visibility often coincide and are
 * not the same claim, and a mechanic that read one for the other would make
 * smoke stop arrows.
 */
export const VISIBILITY_BANDS = [
  "clear",
  "obscured",
  "heavily-obscured",
  "blocked",
] as const;

export type VisibilityBand = typeof VISIBILITY_BANDS[number];


export const PRECIPITATION_BANDS = ["none", "light", "heavy", "extreme"] as const;

export type PrecipitationBand = typeof PRECIPITATION_BANDS[number];


export const WIND_BANDS = ["calm", "light", "strong", "extreme"] as const;

export type WindBand = typeof WIND_BANDS[number];


/**
 * Which way the wind is blowing relative to the question being asked.
 *
 * Separate from strength because the same gale helps an arrow one way and
 * ruins it the other, and carries a scent one way and not the other.
 * `irrelevant` is the honest answer for anything the direction does not bear
 * on, and is not a synonym for calm.
 */
export const WIND_RELATIONSHIPS = [
  "irrelevant",
  "headwind",
  "tailwind",
  "crosswind",
] as const;

export type WindRelationship = typeof WIND_RELATIONSHIPS[number];


export function isIlluminationBand(value: unknown): value is IlluminationBand {
  return typeof value === "string" &&
    (ILLUMINATION_BANDS as readonly string[]).includes(value);
}

export function isAmbientNoiseBand(value: unknown): value is AmbientNoiseBand {
  return typeof value === "string" &&
    (AMBIENT_NOISE_BANDS as readonly string[]).includes(value);
}

export function isVisibilityBand(value: unknown): value is VisibilityBand {
  return typeof value === "string" &&
    (VISIBILITY_BANDS as readonly string[]).includes(value);
}

export function isPrecipitationBand(value: unknown): value is PrecipitationBand {
  return typeof value === "string" &&
    (PRECIPITATION_BANDS as readonly string[]).includes(value);
}

export function isWindBand(value: unknown): value is WindBand {
  return typeof value === "string" &&
    (WIND_BANDS as readonly string[]).includes(value);
}

export function isWindRelationship(value: unknown): value is WindRelationship {
  return typeof value === "string" &&
    (WIND_RELATIONSHIPS as readonly string[]).includes(value);
}


/**
 * Everything the host is prepared to say about conditions where this happens.
 *
 * Every field is optional and absent means "not reported", which is NOT the
 * same as the neutral band. A projection that needs a band it was not given
 * refuses rather than assuming `normal`, because a defaulted band is a fact
 * the engine invented and then attributed to the host.
 */
export interface ActionEnvironmentSnapshot {
  readonly illumination?: IlluminationBand;
  readonly ambientNoise?: AmbientNoiseBand;
  readonly visibility?: VisibilityBand;
  readonly precipitation?: PrecipitationBand;
  readonly wind?: WindBand;
  readonly windRelationship?: WindRelationship;

  /**
   * A local interference the host is asserting without explaining.
   *
   * Free text, never parsed, carried into traces so a GM's "the ward eats
   * sound in here" survives to the explanation. It decides nothing on its own;
   * only a sourced adjustment can change a number.
   */
  readonly interference?: string;
}


export function findActionEnvironmentIssues(
  environment: ActionEnvironmentSnapshot,
  path = "environment",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const bands: readonly [
    keyof ActionEnvironmentSnapshot,
    (value: unknown) => boolean,
    readonly string[],
  ][] = [
    ["illumination", isIlluminationBand, ILLUMINATION_BANDS],
    ["ambientNoise", isAmbientNoiseBand, AMBIENT_NOISE_BANDS],
    ["visibility", isVisibilityBand, VISIBILITY_BANDS],
    ["precipitation", isPrecipitationBand, PRECIPITATION_BANDS],
    ["wind", isWindBand, WIND_BANDS],
    ["windRelationship", isWindRelationship, WIND_RELATIONSHIPS],
  ];

  for (const [field, guard, vocabulary] of bands) {
    const value = environment[field];

    if (value !== undefined && !guard(value)) {
      errors.push({
        code: `composition.environment.${String(field)}.invalid`,
        message: `An environment snapshot's ${String(field)} must name a known band.`,
        audience: "developer",
        subject: { kind: "field", id: `${path}.${String(field)}` },
        required: [...vocabulary],
        actual: describeDiagnosticValue(value),
      });
    }
  }

  if (
    environment.interference !== undefined &&
    typeof environment.interference !== "string"
  ) {
    errors.push({
      code: "composition.environment.interference.invalid",
      message: "An environment snapshot's interference note must be text.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.interference` },
      required: "string",
      actual: describeDiagnosticValue(environment.interference),
    });
  }

  return errors;
}
