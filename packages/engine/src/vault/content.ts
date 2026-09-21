/*
 * Turning validated JSON into the definitions the engine already resolves against.
 *
 * This is the whole seam that makes "adding content is editing a file" true. Each
 * function here takes a parsed document and returns the domain definition the
 * registry has always held — the same `EmissionProfileDefinition`, the same
 * `SpeciesDefinition` — so nothing downstream learns that content moved out of
 * TypeScript. Composition asks the emission profile registry what Fire Blast
 * emits and gets the answer it always got.
 *
 * Nothing here reads a file. It converts values somebody else parsed, which is
 * what lets the conversion be tested against an object literal and lets the
 * engine stay free of I/O.
 *
 * ── THE SHARED PROPAGATION PRESET ───────────────────────────────────────
 *
 * Fire Blast and an ordinary shout are loud in exactly the same way. Both used to
 * carry their own copy of the sound falloff table — identical distance bands,
 * identical ambient-noise adjustments — differing in one field: whose rule it is.
 *
 * Two copies of one physical fact is a bug with a delay on it. The day somebody
 * retunes how far sound carries, they retune it for one of the two, and a shout
 * and a blast begin obeying different physics for no authored reason. Worse, the
 * table had to live somewhere, and "under Fire Blast" would make the general
 * behaviour of sound a detail of one fire Skill.
 *
 * So the table is its own document, `ordinary-sound`, and it does NOT name a
 * source — because it is not anybody's rule, it is how air works. Each profile
 * REFERENCES it, and the source is stamped on at resolution from the profile's own
 * `appliesTo`.
 *
 * That stamping is not a new idea; it is the one `collectEmissionContributions`
 * already uses for emissions, and for the same reason. An author cannot attribute
 * their arrow's falloff to somebody else's bow, because they never write the
 * attribution — the profile that declared the reference owns it by construction.
 *
 * A source-specific falloff still goes inline. Fire Blast's light and heat are its
 * own: nothing else in the world attenuates like a fireball, and a preset with one
 * consumer would be indirection with no sharing underneath it.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode } from "../infrastructure/trace";

import {
  findEmissionProfileIssues,
  findEmissionProfileStructuralIssues,
  type AuthoredEmission,
  type EmissionProfileDefinition,
} from "../gameplay/composition/profiles";
import {
  findChannelPropagationProfileIssues,
  type ChannelPropagationProfile,
} from "../gameplay/composition/propagation";
import type { ThreatSeverity } from "../gameplay/composition/threat";
import {
  findSpeciesDefinitionStructuralIssues,
  type SpeciesDefinition,
} from "../character/identity/species";
import { findItemStructuralIssues } from "../character/equipment/validation";
import { findItemActionSurfaceIssues } from "../character/equipment/actions";
import { findContentStructuralIssues } from "../character/rules/definitions";
import type { ItemDefinition } from "../character/equipment/types";

import {
  composeStructuralValidators,
  type StructuralValidator,
} from "../infrastructure/registry";

import { findVaultEnvelopeIssues, type VaultDocumentEnvelope } from "./document";
import { findVaultReferenceIssues, type VaultReference } from "./references";


/**
 * A propagation rule with no owner.
 *
 * `source` is deliberately absent — see the header. A preset that named a source
 * would be one content's rule that other content borrowed, and the borrowed
 * attribution would show up in the second consumer's trace as the first
 * consumer's name.
 */
export type SourcelessPropagation = Omit<ChannelPropagationProfile, "source">;


export interface PropagationPresetDocument extends VaultDocumentEnvelope, SourcelessPropagation {
  readonly kind: "propagation-preset";
  readonly description: string;
}


export interface EmissionProfileDocument extends VaultDocumentEnvelope {
  readonly kind: "emission-profile";
  readonly description: string;

  readonly appliesTo: { readonly type: string; readonly id: string };
  readonly emissions: readonly AuthoredEmission[];

  /** Shared falloff, by reference. Expanded and stamped at resolution. */
  readonly propagationPresets?: readonly VaultReference<"propagation-preset">[];

  /** Falloff that is genuinely this content's own. Also stamped at resolution. */
  readonly propagation?: readonly SourcelessPropagation[];

  readonly threatSeverity?: number;
}


export interface ItemDefinitionDocument extends VaultDocumentEnvelope {
  readonly kind: "item-definition";
  readonly description: string;
}


export interface SpeciesDocument extends VaultDocumentEnvelope {
  readonly kind: "species";
  readonly description: string;

  readonly parentSpeciesId?: string;
  readonly effects?: SpeciesDefinition["effects"];
  readonly body?: SpeciesDefinition["body"];
}


/* -------------------------------------------------------------------------- */
/* Propagation presets                                                        */
/* -------------------------------------------------------------------------- */

export function findPropagationPresetIssues(
  candidate: unknown,
  path = "propagation-preset",
): readonly EngineError[] {
  const errors: EngineError[] = [...findVaultEnvelopeIssues(candidate, path)];

  if (typeof candidate !== "object" || candidate === null) return errors;

  const preset = candidate as Record<string, unknown>;

  if (preset.kind !== "propagation-preset") {
    errors.push({
      code: "vault.propagation-preset.kind.wrong",
      message: 'A propagation preset must declare kind "propagation-preset".',
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: "propagation-preset",
      actual: describeDiagnosticValue(preset.kind),
    });
  }

  if (typeof preset.description !== "string" || preset.description.trim().length === 0) {
    errors.push({
      code: "vault.propagation-preset.description.missing",
      message: "A propagation preset needs a description.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.description` },
      required: "a non-empty string",
      actual: describeDiagnosticValue(preset.description),
    });
  }

  /*
   * A preset must NOT carry a source. Refused rather than stripped, because a
   * source in a shared table is somebody's misunderstanding of what the table is
   * — and silently removing it would let the misunderstanding persist in the
   * file while the engine did something else.
   */
  if (preset.source !== undefined) {
    errors.push({
      code: "vault.propagation-preset.source.present",
      message:
        "A shared propagation preset must not name a source. The source is stamped on from whichever profile references it.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.source` },
      required: "no source",
      actual: describeDiagnosticValue(preset.source),
    });
  }

  /*
   * The channel, distance and environment rules are the composition domain's, so
   * they are checked by the composition domain's validator rather than restated
   * here. A placeholder source is stamped on for the duration of the check for
   * exactly the reason findEmissionProfileIssues does the same thing: one set of
   * rules about one shape, rather than a second set free to drift from it.
   */
  errors.push(
    ...findChannelIssuesWithPlaceholderSource(preset, `${path}`),
  );

  return errors;
}


function findChannelIssuesWithPlaceholderSource(
  sourceless: Record<string, unknown>,
  path: string,
): readonly EngineError[] {
  return findChannelPropagationProfileIssues(
    {
      ...(sourceless as unknown as SourcelessPropagation),
      source: { type: "propagation-preset", id: String(sourceless.id ?? "preset") },
    } as ChannelPropagationProfile,
    path,
  );
}


/* -------------------------------------------------------------------------- */
/* Emission profiles                                                          */
/* -------------------------------------------------------------------------- */

export function findEmissionProfileDocumentIssues(
  candidate: unknown,
  path = "emission-profile",
): readonly EngineError[] {
  const errors: EngineError[] = [...findVaultEnvelopeIssues(candidate, path)];

  if (typeof candidate !== "object" || candidate === null) return errors;

  const document = candidate as Record<string, unknown>;

  if (document.kind !== "emission-profile") {
    errors.push({
      code: "vault.emission-profile.kind.wrong",
      message: 'An emission profile must declare kind "emission-profile".',
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: "emission-profile",
      actual: describeDiagnosticValue(document.kind),
    });
  }

  (Array.isArray(document.propagationPresets) ? document.propagationPresets : []).forEach(
    (reference, index) => {
      errors.push(
        ...findVaultReferenceIssues(
          reference,
          "propagation-preset",
          `${path}.propagationPresets[${index}]`,
        ),
      );
    },
  );

  if (
    document.propagationPresets !== undefined &&
    !Array.isArray(document.propagationPresets)
  ) {
    errors.push({
      code: "vault.emission-profile.presets.malformed",
      message: "propagationPresets must be an array of references.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.propagationPresets` },
      required: "an array",
      actual: describeDiagnosticValue(document.propagationPresets),
    });
  }

  /*
   * An inline propagation entry must not name a source either, for the same
   * reason a preset must not: the profile that declared it owns it, and writing
   * the attribution by hand is how content ends up crediting somebody else.
   */
  (Array.isArray(document.propagation) ? document.propagation : []).forEach(
    (entry, index) => {
      if (
        typeof entry === "object" && entry !== null &&
        (entry as Record<string, unknown>).source !== undefined
      ) {
        errors.push({
          code: "vault.emission-profile.propagation.source.present",
          message:
            "An inline propagation entry must not name a source. It is stamped on from this profile's appliesTo.",
          audience: "developer",
          subject: { kind: "field", id: `${path}.propagation[${index}].source` },
          required: "no source",
          actual: describeDiagnosticValue((entry as Record<string, unknown>).source),
        });
      }
    },
  );

  return errors;
}


/**
 * A document plus its presets, as the definition the composition domain reads.
 *
 * The preset expansion happens here and only here. Every propagation entry in the
 * result carries this profile's own `appliesTo` as its source, whether it came
 * from a preset or was written inline, so a trace names the content that declared
 * the reference rather than the table it borrowed.
 *
 * An unresolved preset reference REFUSES. A profile silently missing its sound
 * falloff would still resolve, still emit, and be audible at any distance — a
 * failure that looks like a balance problem rather than a missing file.
 */
export function resolveEmissionProfileDocument(
  document: EmissionProfileDocument,
  presets: readonly PropagationPresetDocument[],
): EngineResult<EmissionProfileDefinition> {
  const trace = {
    root: createTraceNode({
      id: `vault.emission-profile.${document.id}`,
      label: "Emission profile hydration",
      inputs: { id: { value: document.id } },
    }),
  };

  const errors: EngineError[] = [
    ...findEmissionProfileDocumentIssues(document, "emission-profile"),
  ];

  const source = document.appliesTo;
  const propagation: ChannelPropagationProfile[] = [];

  for (const [index, reference] of (document.propagationPresets ?? []).entries()) {
    const preset = presets.find((candidate) => candidate.id === reference.id);

    if (preset === undefined) {
      errors.push({
        code: "vault.emission-profile.preset.unresolved",
        message:
          `Emission profile "${document.id}" references the propagation preset "${reference.id}", which is not loaded.`,
        audience: "developer",
        subject: { kind: "field", id: `emission-profile.propagationPresets[${index}]` },
        required: "a loaded propagation preset",
        actual: reference.id,
      });
      continue;
    }

    const { schemaVersion, kind, id, name, description, ...rule } = preset;

    propagation.push({ ...(rule as SourcelessPropagation), source });
  }

  for (const entry of document.propagation ?? []) {
    propagation.push({ ...entry, source });
  }

  /*
   * Assembled in two steps rather than with a conditional spread, because
   * `exactOptionalPropertyTypes` distinguishes "absent" from "present and
   * undefined" and a spread of `{}` widens the field to include undefined. An
   * emission profile with no declared severity must not carry the key at all —
   * see `collectThreatSeverity`, which reads `!== undefined` to decide whether
   * content had an opinion.
   */
  const withoutSeverity = {
    id: document.id,
    name: document.name,
    description: document.description,
    appliesTo: document.appliesTo,
    emissions: document.emissions,
    ...(propagation.length === 0 ? {} : { propagation }),
  };

  const definition: EmissionProfileDefinition = document.threatSeverity === undefined
    ? withoutSeverity
    : { ...withoutSeverity, threatSeverity: document.threatSeverity as ThreatSeverity };

  /*
   * The composition domain's own validator, run on the ASSEMBLED definition
   * rather than on the document. The document is not what gameplay resolves
   * against, so validating it alone would leave the expansion itself unchecked —
   * and the expansion is the part this file wrote.
   */
  errors.push(...findEmissionProfileIssues(definition, "emission-profile"));

  const [first, ...rest] = errors;

  return first === undefined
    ? engineSuccess(definition, trace)
    : engineFailure(trace, [first, ...rest] as NonEmptyArray<EngineError>);
}


/* -------------------------------------------------------------------------- */
/* Species                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A Species document as the Species registry's definition.
 *
 * A near-identity conversion, and it stays explicit rather than becoming a cast.
 * The envelope fields — `schemaVersion`, `kind` — are storage concerns and have no
 * place in a definition the rules resolve against, and a spread would carry them
 * straight in.
 */
export function speciesDefinitionFrom(document: SpeciesDocument): SpeciesDefinition {
  return {
    id: document.id,
    name: document.name,
    description: document.description,
    ...(document.parentSpeciesId === undefined
      ? {}
      : { parentSpeciesId: document.parentSpeciesId }),
    ...(document.effects === undefined ? {} : { effects: document.effects }),
    ...(document.body === undefined ? {} : { body: document.body }),
  };
}


export function findSpeciesDocumentIssues(
  candidate: unknown,
  path = "species",
): readonly EngineError[] {
  const errors: EngineError[] = [...findVaultEnvelopeIssues(candidate, path)];

  if (typeof candidate !== "object" || candidate === null) return errors;

  const document = candidate as Record<string, unknown>;

  if (document.kind !== "species") {
    errors.push({
      code: "vault.species.kind.wrong",
      message: 'A Species document must declare kind "species".',
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: "species",
      actual: describeDiagnosticValue(document.kind),
    });
  }

  if (typeof document.description !== "string" || document.description.trim().length === 0) {
    errors.push({
      code: "vault.species.description.missing",
      message: "A Species needs a description.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.description` },
      required: "a non-empty string",
      actual: describeDiagnosticValue(document.description),
    });
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* Item definitions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * An Item document as the Item registry's definition.
 *
 * The envelope fields come off and everything else goes through, because an Item
 * definition's surface is wide — inventory mode, Shū verdict, families, integrity,
 * three Effect lists, a use application, an attack and a defense — and a converter
 * that named each field would be a second declaration of `ItemDefinition`, silently
 * dropping whatever the real one gained since it was written.
 *
 * The rules are then checked by the equipment domain's own three validators rather
 * than restated here, which is the same delegation emission profiles use: one set
 * of rules about one shape.
 */
export function itemDefinitionFrom(document: ItemDefinitionDocument): ItemDefinition {
  const { schemaVersion, kind, ...definition } = document;

  return definition as unknown as ItemDefinition;
}


export function findItemDefinitionDocumentIssues(
  candidate: unknown,
  path = "item-definition",
): readonly EngineError[] {
  const errors: EngineError[] = [...findVaultEnvelopeIssues(candidate, path)];

  if (typeof candidate !== "object" || candidate === null) return errors;

  const document = candidate as Record<string, unknown>;

  if (document.kind !== "item-definition") {
    errors.push({
      code: "vault.item-definition.kind.wrong",
      message: 'An Item definition must declare kind "item-definition".',
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: "item-definition",
      actual: describeDiagnosticValue(document.kind),
    });
  }

  if (typeof document.description !== "string" || document.description.trim().length === 0) {
    errors.push({
      code: "vault.item-definition.description.missing",
      message: "An Item definition needs a description.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.description` },
      required: "a non-empty string",
      actual: describeDiagnosticValue(document.description),
    });
  }

  /*
   * The equipment domain's rules, on the ASSEMBLED definition. Run on the document
   * instead they would judge an object still carrying `schemaVersion` and `kind`,
   * which is not the shape any of them were written against.
   */
  const definition = itemDefinitionFrom(document as unknown as ItemDefinitionDocument);

  for (const issue of [
    ...findContentStructuralIssues(definition),
    ...findItemStructuralIssues(definition),
    ...findItemActionSurfaceIssues(definition),
  ]) {
    errors.push({
      code: "vault.item-definition.invalid",
      message: `This Item definition ${issue}`,
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "a structurally valid Item definition",
      actual: issue,
    });
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* Snapshot validators                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The structural rules each hydratable kind is held to, by the domain that owns them.
 *
 * `createDefinitionSnapshot` requires a validator, and this is where the loader gets
 * the right one. It matters that these are the SAME functions the authored catalogs
 * are checked with: a snapshot validated by anything weaker would let a JSON
 * definition into a registry that the equivalent TypeScript definition could not
 * have entered, which would make "content moved to JSON" also mean "content is
 * checked less".
 *
 * Passing a no-op here instead would type-check and pass every test, because the
 * loader already validates each document on the way in. It would also be the single
 * place a future kind could arrive unchecked — the validation would be happening
 * somewhere else, by convention, and conventions are what this map replaces.
 */
export const DEFINITION_STRUCTURAL_VALIDATORS: Readonly<Record<
  "species" | "item-definition" | "emission-profile",
  StructuralValidator
>> = {
  species: composeStructuralValidators(
    findContentStructuralIssues,
    findSpeciesDefinitionStructuralIssues,
  ),

  "item-definition": composeStructuralValidators(
    findContentStructuralIssues,
    findItemStructuralIssues,
    findItemActionSurfaceIssues,
  ),

  "emission-profile": composeStructuralValidators(findEmissionProfileStructuralIssues),
};
