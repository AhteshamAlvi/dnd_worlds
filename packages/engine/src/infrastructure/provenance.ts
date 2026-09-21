/*
 * Where a definition came from — for developers, and only for developers.
 *
 * Two audiences ask "where did this come from" and they need different answers.
 *
 * A DEVELOPER debugging why Fire Blast has the wrong intensity needs the file:
 * which of the several places a definition could have come from actually
 * supplied this one. Without it, the answer to "why is this 5" is a search.
 *
 * A PLAYER reading a trace needs no such thing. A trace explaining that a shout
 * carried forty metres is about the world, and `World/Vault/Definitions/…` is
 * about somebody's checkout. Worse, a machine path is nobody's business: an
 * absolute one names a home directory, and traces get pasted into bug reports.
 *
 * So provenance is a developer-audience structure, paths are repository-relative
 * and validated to be, and nothing here is reachable from a player-facing
 * result. The architecture suite checks the second half of that claim, because a
 * convention about audiences is exactly the kind of thing one convenient
 * interpolation undoes.
 *
 * It lives in infrastructure because the registry needs it and the registry sits
 * beneath every domain. `kind` is a plain string for the same reason: this file
 * cannot know the vocabulary of document kinds without depending upward on the
 * domain that owns it. `vault/` narrows it where the narrower type is useful.
 */

import { describeDiagnosticValue, type EngineError } from "./diagnostics";


/**
 * Which source a definition arrived from.
 *
 * `vault` is a JSON file a loader read. `authored` is the engine's own frozen
 * catalog. `host` is something registered at runtime that came from neither — a
 * test fixture, or a host assembling a definition in memory.
 *
 * Kept distinct because "this came from a file you can edit" and "this is baked
 * into the engine" lead to different next actions, and a single `source: string`
 * would be a field everybody spells differently.
 */
export const DEFINITION_SOURCE_KINDS = ["vault", "authored", "host"] as const;

export type DefinitionSourceKind = typeof DEFINITION_SOURCE_KINDS[number];


export interface DefinitionProvenance {
    readonly source: DefinitionSourceKind;

    /** The document kind, as the owning domain spells it. */
    readonly kind: string;

    readonly id: string;
    readonly schemaVersion: number;

    /**
     * Repository-relative path, present only for `source: "vault"`.
     *
     * Absent for authored and host definitions because they have no file, and an
     * empty string there would be a path that looks like the repository root.
     */
    readonly path?: string;
}


/*
 * What disqualifies a path from appearing in provenance.
 *
 * A POSIX absolute path, a Windows drive path and a UNC path are all "absolute"
 * and none of them looks like the others, so all three are matched rather than
 * just the leading slash.
 */
const ABSOLUTE_PATH = /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/;


/**
 * Whether a path is safe to record as provenance.
 *
 * Relative, forward-slashed, and not climbing out of the repository. The `..`
 * rule is here for the obvious reason and one more: a provenance path is printed
 * in diagnostics, and `../../../../Users/someone/…` is an absolute path that got
 * in through the back door.
 */
export function isRepositoryRelativePath(value: unknown): value is string {
    if (typeof value !== "string" || value.trim().length === 0) return false;
    if (value.includes("\\")) return false;
    if (ABSOLUTE_PATH.test(value)) return false;

    return !value.split("/").includes("..");
}


export function findDefinitionProvenanceIssues(
    candidate: unknown,
    path = "provenance",
): readonly EngineError[] {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        return [{
            code: "provenance.malformed",
            message: "Provenance must be an object.",
            audience: "developer",
            subject: { kind: "field", id: path },
            required: "{ source, kind, id, schemaVersion }",
            actual: describeDiagnosticValue(candidate),
        }];
    }

    const errors: EngineError[] = [];
    const provenance = candidate as Record<string, unknown>;

    if (
        typeof provenance.source !== "string" ||
        !(DEFINITION_SOURCE_KINDS as readonly string[]).includes(provenance.source)
    ) {
        errors.push({
            code: "provenance.source.unknown",
            message: "Provenance must name where the definition came from.",
            audience: "developer",
            subject: { kind: "field", id: `${path}.source` },
            required: [...DEFINITION_SOURCE_KINDS],
            actual: describeDiagnosticValue(provenance.source),
        });
    }

    if (typeof provenance.kind !== "string" || provenance.kind.trim().length === 0) {
        errors.push({
            code: "provenance.kind.missing",
            message: "Provenance must name the document kind.",
            audience: "developer",
            subject: { kind: "field", id: `${path}.kind` },
            required: "a non-empty string",
            actual: describeDiagnosticValue(provenance.kind),
        });
    }

    if (typeof provenance.id !== "string" || provenance.id.trim().length === 0) {
        errors.push({
            code: "provenance.id.missing",
            message: "Provenance must name the definition id.",
            audience: "developer",
            subject: { kind: "field", id: `${path}.id` },
            required: "a non-empty string",
            actual: describeDiagnosticValue(provenance.id),
        });
    }

    if (
        typeof provenance.schemaVersion !== "number" ||
        !Number.isInteger(provenance.schemaVersion) ||
        provenance.schemaVersion < 1
    ) {
        errors.push({
            code: "provenance.version.invalid",
            message: "Provenance must record the schema version the definition was read at.",
            audience: "developer",
            subject: { kind: "field", id: `${path}.schemaVersion` },
            required: "a positive integer",
            actual: describeDiagnosticValue(provenance.schemaVersion),
        });
    }

    if (provenance.source === "vault" && !isRepositoryRelativePath(provenance.path)) {
        errors.push({
            code: "provenance.path.not-relative",
            message:
                "A Vault definition's provenance path must be repository-relative, with no absolute machine path.",
            audience: "developer",
            subject: { kind: "field", id: `${path}.path` },
            required: "a repository-relative path such as World/Vault/Definitions/Species/elf.json",
            actual: describeDiagnosticValue(provenance.path),
        });
    }

    /*
     * An authored or host definition carrying a path is refused rather than
     * ignored. It means somebody stamped a file onto a definition that did not
     * come from one, and a diagnostic pointing at an innocent file is worse than
     * none: it sends the next developer to read something irrelevant.
     */
    if (provenance.source !== "vault" && provenance.path !== undefined) {
        errors.push({
            code: "provenance.path.unexpected",
            message: `A ${String(provenance.source)} definition has no file and must not claim a path.`,
            audience: "developer",
            subject: { kind: "field", id: `${path}.path` },
            required: "no path",
            actual: describeDiagnosticValue(provenance.path),
        });
    }

    return errors;
}


/** Provenance rendered for a developer diagnostic. */
export function describeProvenance(provenance: DefinitionProvenance): string {
    const identity = `${provenance.kind}:${provenance.id} v${provenance.schemaVersion}`;

    return provenance.path === undefined
        ? `${identity} (${provenance.source})`
        : `${identity} (${provenance.source} ${provenance.path})`;
}
