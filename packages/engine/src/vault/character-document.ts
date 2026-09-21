/*
 * A character, as one file.
 *
 * `character.json` is the single current authority for who somebody is. Their
 * narrative, their mechanics, where they are and what art represents them all
 * live in it, and no second file restates any of it. A journal, a GM's private
 * notes and an audit log may sit beside it because those are distinct artifacts
 * with their own histories; a `gon.md` duplicating the biography would not be —
 * it would be the same fact in two places, and the day they disagree neither one
 * is wrong.
 *
 * Narrative is Markdown IN the JSON, as strings. That looks like the wrong way
 * round until you ask what the alternative costs: a separate `.md` per field
 * means a character is five files that must be kept in step, and the link between
 * them is a path — exactly the thing that breaks when somebody reorganizes a
 * folder. A Markdown string in a validated document moves with the character, and
 * a later Obsidian plugin renders it without needing to find anything.
 *
 * ── WHAT IS NOT IN HERE, AND WHY THAT IS ENFORCED ───────────────────────
 *
 * DERIVED VALUES. Maximum Aura, Aura output limit, whether an Item is possessed,
 * whether it is accessible, where the character effectively is: all of these
 * resolve from what IS stored, every one of them already has exactly one
 * function that computes it, and writing any of them down creates a second
 * answer that starts correct and goes stale silently. A stored maximum that
 * disagrees with the body it came from is worse than no stored maximum, because
 * a reader has no way to know which to trust.
 *
 * HOST NAMESPACES. There is no `workbench` block, no Foundry actor id, no
 * `$UserData` path, no scene coordinate, no placed-token state. A portable
 * character that carried one application's private state would stop being
 * portable the moment a second application opened it — and would quietly invite
 * that application to write its own block beside the first.
 *
 * Both rules are checked rather than documented, because a convention about what
 * not to store is undone by one convenient field, and the field always looks
 * reasonable at the time.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";
import { isJsonValue, type JsonObject } from "../infrastructure/json";

import { findPortableAssetIssues, type PortableAssetRef } from "./assets";
import { findVaultEnvelopeIssues, type VaultDocumentEnvelope } from "./document";
import type { LocationId } from "./placement";


/**
 * Where a character is, which is the only placement a character can have.
 *
 * No `character` parent and no `container` parent: people are not held, worn or
 * packed. Absent means the document has not said, which is distinct from
 * `unplaced` asserting they are nowhere — the same distinction Item placement
 * draws, for the same reason.
 */
export type CharacterPlacement =
  | { readonly parent: "location"; readonly locationId: LocationId }
  | { readonly parent: "unplaced" };


/*
 * Keys refused outright at the top level of a character document.
 *
 * Two families, refused for two different reasons.
 *
 * The DERIVED ones are values with exactly one resolver each, listed here so
 * that storing one is a validation failure rather than a slow divergence nobody
 * notices. `possessed`, `accessible` and `effectiveLocation` are on the list even
 * though they are Item questions, because a character document is precisely where
 * somebody would be tempted to cache an inventory view.
 *
 * The HOST ones are namespaces belonging to one application. `workbench` is named
 * explicitly because it is the one that actually exists: the current save format
 * keeps a writable `workbench` block, and this contract's whole point is that it
 * does not survive.
 */
const REFUSED_CHARACTER_KEYS: Readonly<Record<string, string>> = {
  workbench: "host application state does not belong in a portable character",
  foundry: "host application state does not belong in a portable character",
  obsidian: "host application state does not belong in a portable character",

  maximumAura: "Maximum Aura is derived from attributes, body and Nen state",
  auraOutputLimit: "the Aura output limit is derived",
  accessFraction: "the access fraction is derived from active Nen principle state",
  possessed: "possession is derived from the placement graph",
  accessible: "accessibility is derived from the placement graph",
  effectiveLocation: "effective location is derived by walking placement ancestry",
};


export interface CharacterDocument extends VaultDocumentEnvelope {
  readonly kind: "character";

  /**
   * Markdown-formatted prose, keyed by field.
   *
   * An open record rather than a fixed set of fields, because which prose a
   * setting wants — biography, appearance, goals, secrets, voice — is an authoring
   * decision this contract has no business fixing. Every value is a string; a
   * nested object here would be structure pretending to be prose.
   */
  readonly narrative?: Readonly<Record<string, string>>;

  /**
   * The engine's own character state, exactly as the engine defines it.
   *
   * Carried as a JSON object and handed to the engine's existing character
   * validation by the adapter, rather than re-typed here. Re-declaring the
   * character shape in this file would be a second definition of it, free to
   * drift from the one every rule actually resolves against — which is the exact
   * mistake the rest of this module exists to prevent.
   */
  readonly mechanics: JsonObject;

  readonly placement?: CharacterPlacement;

  /**
   * Portable art, keyed by role. `token` is the conventional one.
   *
   * Every path is bundle-relative: `assets/token.webp` resolves beside this file
   * and travels with it. Foundry's and Obsidian's own mappings are their business
   * and never appear here.
   */
  readonly assets?: Readonly<Record<string, PortableAssetRef>>;

  /**
   * When this document was last written, if the writer said.
   *
   * Retained because the current save format carries it and discarding a field
   * is not a thing this migration does quietly. It is host-neutral — an ISO
   * instant means the same thing everywhere — and it is metadata about the FILE
   * rather than about the character, which is why nothing mechanical reads it.
   */
  readonly updatedAt?: string;
}


export function findCharacterDocumentIssues(
  candidate: unknown,
  path = "character",
): readonly EngineError[] {
  const envelopeIssues = findVaultEnvelopeIssues(candidate, path);

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return envelopeIssues;
  }

  const errors: EngineError[] = [...envelopeIssues];
  const document = candidate as Record<string, unknown>;

  if (document.kind !== "character") {
    errors.push({
      code: "vault.character.kind.wrong",
      message: 'A character document must declare kind "character".',
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: "character",
      actual: describeDiagnosticValue(document.kind),
    });
  }

  for (const [key, why] of Object.entries(REFUSED_CHARACTER_KEYS)) {
    if (!Object.prototype.hasOwnProperty.call(document, key)) continue;

    errors.push({
      code: "vault.character.field.refused",
      message: `A character document must not store "${key}": ${why}.`,
      audience: "developer",
      subject: { kind: "field", id: `${path}.${key}` },
      required: "the field to be absent",
      actual: key,
    });
  }

  if (
    typeof document.mechanics !== "object" ||
    document.mechanics === null ||
    Array.isArray(document.mechanics) ||
    !isJsonValue(document.mechanics)
  ) {
    errors.push({
      code: "vault.character.mechanics.missing",
      message: "A character document must carry a JSON mechanics object.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.mechanics` },
      required: "a JSON object",
      actual: describeDiagnosticValue(document.mechanics),
    });
  }

  if (document.narrative !== undefined) {
    if (
      typeof document.narrative !== "object" ||
      document.narrative === null ||
      Array.isArray(document.narrative)
    ) {
      errors.push({
        code: "vault.character.narrative.malformed",
        message: "Narrative must be an object of Markdown strings.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.narrative` },
        required: "an object whose values are strings",
        actual: describeDiagnosticValue(document.narrative),
      });
    } else {
      for (const [field, value] of Object.entries(document.narrative)) {
        if (typeof value === "string") continue;

        errors.push({
          code: "vault.character.narrative.not-a-string",
          message: `Narrative field "${field}" must be a Markdown string.`,
          audience: "developer",
          subject: { kind: "field", id: `${path}.narrative.${field}` },
          required: "string",
          actual: describeDiagnosticValue(value),
        });
      }
    }
  }

  if (document.placement !== undefined) {
    errors.push(...findCharacterPlacementIssues(document.placement, `${path}.placement`));
  }

  if (document.assets !== undefined) {
    if (
      typeof document.assets !== "object" ||
      document.assets === null ||
      Array.isArray(document.assets)
    ) {
      errors.push({
        code: "vault.character.assets.malformed",
        message: "Assets must be an object of asset references keyed by role.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.assets` },
        required: "an object of asset references",
        actual: describeDiagnosticValue(document.assets),
      });
    } else {
      for (const [role, asset] of Object.entries(document.assets)) {
        errors.push(...findPortableAssetIssues(asset, `${path}.assets.${role}`));
      }
    }
  }

  if (document.updatedAt !== undefined && typeof document.updatedAt !== "string") {
    errors.push({
      code: "vault.character.updated-at.invalid",
      message: "updatedAt must be an ISO instant string.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.updatedAt` },
      required: "string",
      actual: describeDiagnosticValue(document.updatedAt),
    });
  }

  return errors;
}


export function findCharacterPlacementIssues(
  candidate: unknown,
  path: string,
): readonly EngineError[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [{
      code: "vault.character.placement.malformed",
      message: "A character placement must be an object.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: '{ parent: "location", locationId } or { parent: "unplaced" }',
      actual: describeDiagnosticValue(candidate),
    }];
  }

  const placement = candidate as Record<string, unknown>;

  if (placement.parent === "unplaced") {
    return Object.keys(placement).length === 1 ? [] : [{
      code: "vault.character.placement.field.unexpected",
      message: "An unplaced character placement carries no other field.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "parent only",
      actual: Object.keys(placement).sort(),
    }];
  }

  if (placement.parent !== "location") {
    return [{
      code: "vault.character.placement.parent.unsupported",
      message:
        "A character is at a location or unplaced. People are not held, worn or contained.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.parent` },
      required: ["location", "unplaced"],
      actual: describeDiagnosticValue(placement.parent),
    }];
  }

  const errors: EngineError[] = [];

  if (typeof placement.locationId !== "string" || placement.locationId.trim().length === 0) {
    errors.push({
      code: "vault.character.placement.location.invalid",
      message: "A located character placement needs a non-empty locationId.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.locationId` },
      required: "a non-empty id",
      actual: describeDiagnosticValue(placement.locationId),
    });
  }

  for (const key of Object.keys(placement)) {
    if (key === "parent" || key === "locationId") continue;

    errors.push({
      code: "vault.character.placement.field.unexpected",
      message: `A located character placement has no "${key}" field.`,
      audience: "developer",
      subject: { kind: "field", id: `${path}.${key}` },
      required: "parent and locationId",
      actual: key,
    });
  }

  return errors;
}


/** Where the placement graph reads a character's location from. */
export function characterLocationFact(
  document: CharacterDocument,
): { readonly status: "known"; readonly locationId: LocationId } | { readonly status: "unknown" } {
  return document.placement?.parent === "location"
    ? { status: "known", locationId: document.placement.locationId }
    : { status: "unknown" };
}
