/*
 * Registry — the shared machinery behind every authored catalog.
 *
 * Species, Clans, Mutations, Traits, Abilities, Techniques, Skills and
 * Conditions are all the same thing structurally: a map of definitions keyed
 * by a stable semantic id, a way to ask whether an id is one of them, and a
 * way to fetch one. Each of those domains used to spell that out by hand,
 * which meant eight near-identical copies of the same lookup drifting apart
 * one edit at a time.
 *
 * The same is true of the two questions character validation asks about any
 * list of references — "does this id exist" and "was it listed twice" — which
 * is what scanReferences answers once for all of them.
 *
 * ── Authored vs custom ──────────────────────────────────────────────────
 *
 * A registry holds two layers. The *authored* layer is the frozen catalog in
 * the engine's own source: canon, present on every boot, and never removable.
 * The *custom* layer is whatever the host registered at runtime — the
 * workbench loading a GM's own Species and Traits from disk.
 *
 * Custom entries are additive only. They can never shadow an authored id,
 * because a character sheet referencing "human" must mean the same thing in
 * every session; letting a local file redefine canon is how two people end up
 * computing different numbers from the same sheet. Registering an id that
 * already exists in the authored layer is refused, and refused loudly enough
 * for the host to show it.
 *
 * The host is responsible for registering before it validates. A character
 * referencing a custom Species the engine has not been told about is not a
 * character with a rare Species; it is a character referencing something that
 * does not exist, and the engine will say so.
 *
 * ── The third layer: hydrated ───────────────────────────────────────────
 *
 * There is now a layer between those two, and it exists because the authored
 * layer was the wrong home for production content.
 *
 * "Canon lives in the engine's source" means adding a Species is a TypeScript
 * edit, a rebuild and a release — for a world whose content a GM is supposed to
 * author. So production definitions move to validated JSON in the Vault, and
 * arrive here as a HYDRATED snapshot: immutable, ordered canonically, and
 * carrying provenance for every entry.
 *
 * Hydrated content is production, which means it behaves like authored content
 * in the one respect that matters: custom entries cannot shadow it. A character
 * sheet referencing "elf" must mean the same thing in every session whether Elf
 * came from a TypeScript object or from `Definitions/Species/elf.json`.
 *
 * It replaces rather than accumulating. Hydrating twice is a host reloading its
 * Vault, not a host adding to it, so the second snapshot is the catalog — an
 * additive hydrate would leave definitions behind from a file somebody deleted.
 */

import { describeDiagnosticValue, type EngineError } from "./diagnostics";
import {
    findDefinitionProvenanceIssues,
    type DefinitionProvenance,
} from "./provenance";

// The minimum every definition carries. Domains extend it with the fields
// their rules actually need (Trait modifiers, Mutation variants, Skill
// timings) rather than pushing those into this shape.
export interface Definition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
}

// Custom ids are constrained to the same shape as an authored one: lowercase,
// digits and hyphens. Authored ids follow this convention already; enforcing
// it on custom ones keeps a hand-written id usable as a filename component,
// a URL segment and a JSON key without escaping.
export const DEFINITION_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type RegistrationResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string };

// A catalog plus the operations every consumer needs from it.
export interface Registry<TDefinition extends Definition> {
    // Human-readable domain name, used in registration and catalog messages.
    readonly label: string;

    // The engine's own frozen catalog, without anything registered at runtime.
    readonly authored: Readonly<Record<string, TDefinition>>;

    // Authored, hydrated, then custom. What a picker should list.
    readonly all: () => readonly TDefinition[];

    readonly custom: () => readonly TDefinition[];

    // Production definitions supplied from the Vault, in canonical id order.
    readonly hydrated: () => readonly TDefinition[];

    readonly isKnownId: (id: string) => boolean;
    readonly get: (id: string) => TDefinition | undefined;

    readonly register: (definition: TDefinition) => RegistrationResult;
    readonly unregister: (id: string) => boolean;

    /*
     * Install a validated snapshot as this registry's production content.
     *
     * REPLACES whatever was hydrated before. Refused when a snapshot id collides
     * with an authored one, because that would be a JSON file quietly redefining
     * something the engine ships — the same rule custom registration obeys, for
     * the same reason.
     *
     * Note what is NOT a parameter: a path, a directory, a filename. The snapshot
     * arrives already parsed and already validated. The engine does no I/O, so
     * "load the Vault" is something the loader package does and then hands over.
     */
    readonly hydrate: (
        snapshot: DefinitionSnapshot<TDefinition>,
    ) => RegistrationResult;

    // Where one entry came from: which file, at which schema version.
    readonly provenanceOf: (id: string) => DefinitionProvenance | undefined;

    // Drops every custom entry. For a host reloading its catalog wholesale,
    // and for tests that must not leak registrations into each other.
    readonly clearCustom: () => void;

    // Drops the hydrated snapshot. For a test that must not leak a Vault into
    // the next one, and for a host closing a vault without opening another.
    readonly clearHydrated: () => void;

    // Development-time check of the catalog itself, as opposed to characters
    // that reference it. Covers custom entries too, since a malformed one
    // reaches the same UI.
    readonly findCatalogIssues: () => readonly string[];
}

/*
 * What a domain knows about its own definitions that infrastructure cannot.
 *
 * Injected rather than imported, because this file sits below every domain and
 * depends on nothing above infrastructure — the whole reason provenance and
 * registries live here. A registry cannot ask character/rules whether an Effect
 * is well formed, so the domain hands it a function that can.
 *
 * REQUIRED, not optional. An optional structural check is one every new
 * registry starts life without, and the failure is silent: the catalog accepts
 * malformed content and the fault surfaces somewhere else entirely. Making it
 * a parameter means a domain that has nothing to check has to say so — see
 * `declaresNoRules` — rather than simply never noticing the question.
 *
 * Takes `unknown` because a host's registered definition is exactly that. It
 * returns human-readable strings rather than typed issues, because the caller
 * that needs them is a registration refusal a person reads.
 */
export type StructuralValidator =
    (definition: unknown) => readonly string[];


/*
 * For a domain whose definitions carry no Effects, Requirements or other rule
 * content — BodyParts, Reference Forms, Special Points.
 *
 * A named export rather than an inline `() => []`, so that "this domain has no
 * rules to check" is a claim someone made on purpose and can be searched for,
 * instead of an empty function that reads as an oversight.
 */
export const declaresNoRules: StructuralValidator = () => [];


/**
 * One validator from several.
 *
 * Domains have more than one kind of local invariant — a Skill has universal
 * Effects AND a Mastery track AND an application contract — and the
 * alternative to composing is a bespoke wrapper per domain that has to
 * remember to call all of them. Every issue is collected rather than
 * short-circuiting on the first, because an author fixing homebrew should
 * learn about all of its faults in one pass.
 */
export function composeStructuralValidators(
    ...validators: readonly StructuralValidator[]
): StructuralValidator {
    return (definition) =>
        validators.flatMap((validate) => validate(definition));
}


/* -------------------------------------------------------------------------- */
/* Snapshots                                                                  */
/* -------------------------------------------------------------------------- */

/** One definition in a snapshot, with the file it came from. */
export interface DefinitionSnapshotEntry<TDefinition extends Definition> {
    readonly definition: TDefinition;
    readonly provenance: DefinitionProvenance;
}


/**
 * An immutable, canonically ordered set of production definitions.
 *
 * IMMUTABLE, because a registry's production content changing under a resolver
 * mid-calculation is a class of bug nobody can reproduce. The entries array is
 * frozen and the lookups read a map built once at construction.
 *
 * CANONICALLY ORDERED, and this is the part that is easy to get wrong. The order
 * must not depend on how the definitions arrived, because they arrive from a
 * directory walk — and `readdir` order is filesystem- and platform-dependent. A
 * snapshot ordered by arrival would make `entries` differ between two checkouts
 * of identical content, which makes every downstream artifact built from it,
 * including generated indexes, differ too.
 *
 * So entries are sorted by id, by UTF-16 code unit, with no locale involved.
 * `localeCompare` is the obvious call and the wrong one: it is locale-sensitive,
 * so the same content would sort differently for a developer with a different
 * system locale, which is exactly the nondeterminism being ruled out.
 */
export interface DefinitionSnapshot<TDefinition extends Definition> {
    readonly label: string;

    /** Sorted by id. Frozen. */
    readonly entries: readonly DefinitionSnapshotEntry<TDefinition>[];

    readonly ids: readonly string[];

    readonly get: (id: string) => TDefinition | undefined;
    readonly provenanceOf: (id: string) => DefinitionProvenance | undefined;
}


export type SnapshotResult<TDefinition extends Definition> =
    | { readonly ok: true; readonly snapshot: DefinitionSnapshot<TDefinition> }
    | { readonly ok: false; readonly errors: readonly EngineError[] };


/** Code-unit ordering, so two machines agree. See DefinitionSnapshot. */
function byId(left: { id: string }, right: { id: string }): number {
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}


/**
 * Build a snapshot, or refuse with everything wrong with the input.
 *
 * REFUSES rather than skipping bad entries. A snapshot that dropped the two
 * definitions it could not parse and returned the other forty would let a
 * gameplay resolution proceed against a Vault that is not the Vault on disk —
 * and the two missing definitions would surface later as unresolved references
 * pointing at documents that do exist.
 *
 * Every problem is collected before refusing, because somebody fixing a Vault
 * should learn about all of its faults in one pass rather than one per run.
 */
export function createDefinitionSnapshot<TDefinition extends Definition>(
    label: string,
    entries: readonly DefinitionSnapshotEntry<TDefinition>[],
    findStructuralIssues: StructuralValidator,
): SnapshotResult<TDefinition> {
    const errors: EngineError[] = [];
    const firstClaim = new Map<string, DefinitionProvenance>();

    for (const entry of entries) {
        const definition = entry.definition as { id?: unknown } | null | undefined;
        const id = typeof definition?.id === "string" ? definition.id : undefined;

        errors.push(
            ...findDefinitionProvenanceIssues(entry.provenance, `${label} provenance`),
        );

        if (id === undefined || !DEFINITION_ID_PATTERN.test(id)) {
            errors.push({
                code: "registry.snapshot.id.invalid",
                message: `${label} snapshot entries must carry an id of lowercase letters, digits and single hyphens.`,
                audience: "developer",
                subject: { kind: "definition", id: String(id) },
                required: "lowercase letters, digits and single hyphens",
                actual: describeDiagnosticValue(definition?.id),
            });
            continue;
        }

        /*
         * The provenance id and the definition id must agree. They are written in
         * two places by the loader, and a mismatch makes `get()` and every
         * diagnostic disagree about which file a definition came from — which is
         * invisible until somebody debugs a message pointing at the wrong file.
         */
        if (entry.provenance.id !== id) {
            errors.push({
                code: "registry.snapshot.provenance.id-mismatch",
                message: `${label} "${id}" carries provenance for "${entry.provenance.id}".`,
                audience: "developer",
                subject: { kind: "definition", id },
                required: id,
                actual: entry.provenance.id,
            });
        }

        const incumbent = firstClaim.get(id);

        if (incumbent !== undefined) {
            /*
             * Never last-write-wins. Two definitions claiming one id may differ in
             * any field, so picking one makes the catalog depend on the order a
             * filesystem enumerated a directory in — which is to say, on nothing.
             */
            errors.push({
                code: "registry.snapshot.id.duplicate",
                message: `${label} "${id}" is defined twice: ${incumbent.path ?? incumbent.source} and ${entry.provenance.path ?? entry.provenance.source}.`,
                audience: "developer",
                subject: { kind: "definition", id },
                required: "one definition per id",
                actual: [incumbent.path ?? incumbent.source, entry.provenance.path ?? entry.provenance.source],
            });
            continue;
        }

        firstClaim.set(id, entry.provenance);

        for (const issue of findStructuralIssues(entry.definition)) {
            errors.push({
                code: "registry.snapshot.definition.invalid",
                message: `${label} "${id}" ${issue}`,
                audience: "developer",
                subject: { kind: "definition", id },
                required: "a structurally valid definition",
                actual: issue,
                ...(entry.provenance.path === undefined
                    ? {}
                    : { resolution: `See ${entry.provenance.path}.` }),
            });
        }
    }

    if (errors.length > 0) return { ok: false, errors };

    const sorted = Object.freeze(
        [...entries].sort((left, right) => byId(left.definition, right.definition)),
    );

    const definitions = new Map(sorted.map((entry) => [entry.definition.id, entry.definition]));
    const provenance = new Map(sorted.map((entry) => [entry.definition.id, entry.provenance]));

    return {
        ok: true,
        snapshot: {
            label,
            entries: sorted,
            ids: Object.freeze(sorted.map((entry) => entry.definition.id)),
            get: (id) => definitions.get(id),
            provenanceOf: (id) => provenance.get(id),
        },
    };
}


/** An empty snapshot, for a registry whose Vault holds nothing of its kind. */
export function emptyDefinitionSnapshot<TDefinition extends Definition>(
    label: string,
): DefinitionSnapshot<TDefinition> {
    return {
        label,
        entries: Object.freeze([]),
        ids: Object.freeze([]),
        get: () => undefined,
        provenanceOf: () => undefined,
    };
}


export function createRegistry<TDefinition extends Definition>(
    label: string,
    authored: Readonly<Record<string, TDefinition>>,
    findStructuralIssues: StructuralValidator,
): Registry<TDefinition> {
    // Insertion-ordered, so a picker lists custom entries in the order they
    // were registered rather than a hash order that changes between runs.
    const custom = new Map<string, TDefinition>();

    // The installed snapshot, or nothing. Replaced wholesale by hydrate().
    let hydrated: DefinitionSnapshot<TDefinition> | undefined;

    // hasOwnProperty rather than `id in authored`, so an id like "constructor"
    // or "toString" cannot resolve through the prototype chain.
    const isAuthoredId = (id: string): boolean =>
        Object.prototype.hasOwnProperty.call(authored, id);

    /*
     * Authored and hydrated together: the two production layers.
     *
     * Asked wherever the question is "may a host define this id", because both
     * answers are no for the same reason. A sheet referencing "elf" must mean one
     * thing everywhere, and which of the two production layers Elf happens to
     * live in this release is not the host's business.
     */
    const isProductionId = (id: string): boolean =>
        isAuthoredId(id) || hydrated?.get(id) !== undefined;

    /*
     * Authored, then hydrated, then custom.
     *
     * Authored first so the engine's own content cannot be displaced by a Vault
     * file — the same precedence custom already obeyed, extended to the layer
     * between them. In practice the two never collide, because hydrate() refuses
     * a snapshot that would make them.
     */
    const get = (id: string): TDefinition | undefined =>
        isAuthoredId(id) ? authored[id] : hydrated?.get(id) ?? custom.get(id);

    /*
     * Everything wrong with a definition offered for registration.
     *
     * Identity and naming first, then the domain's own structural rules. The
     * order matters for the message rather than the verdict: a definition with
     * no usable id produces a complaint nobody can act on if it also lists
     * three malformed Effects, and the id is the thing to fix first.
     *
     * Reads through `unknown` rather than off TDefinition, because a host
     * calling register() from JavaScript, or from TypeScript with a cast, can
     * hand this anything at all — and a validator that trusted its parameter
     * type would throw on the first field it read.
     */
    function findRegistrationIssues(candidate: unknown): readonly string[] {
        if (typeof candidate !== "object" || candidate === null) {
            return [`${label} definitions must be objects.`];
        }

        const definition = candidate as {
            readonly id?: unknown;
            readonly name?: unknown;
            readonly description?: unknown;
        };

        if (
            typeof definition.id !== "string" ||
            !DEFINITION_ID_PATTERN.test(definition.id)
        ) {
            return [
                `${label} id ${JSON.stringify(definition.id) ?? "undefined"} must be lowercase letters, digits and single hyphens.`,
            ];
        }

        if (isAuthoredId(definition.id)) {
            return [
                `${label} "${definition.id}" is defined by the engine and cannot be redefined.`,
            ];
        }

        if (hydrated?.get(definition.id) !== undefined) {
            return [
                `${label} "${definition.id}" is production content loaded from the Vault and cannot be redefined. Edit ${hydrated.provenanceOf(definition.id)?.path ?? "the Vault document"} instead.`,
            ];
        }

        if (
            typeof definition.name !== "string" ||
            definition.name.trim().length === 0
        ) {
            return [`${label} "${definition.id}" needs a name.`];
        }

        /*
         * Checked here as well as in findCatalogIssues, because the two ask at
         * different moments and only one of them can still say no. A
         * description arriving blank from a host is content nobody can pick
         * out of a list, and reporting it later — after it is already in the
         * catalog and referenced by a character — is a complaint about
         * something that has already happened.
         */
        if (
            typeof definition.description !== "string" ||
            definition.description.trim().length === 0
        ) {
            return [`${label} "${definition.id}" needs a description.`];
        }

        /*
         * The domain's rules run last and are reported TOGETHER, not one at a
         * time. An author fixing a homebrew Item should learn about all four
         * of its malformed Effects in one pass rather than four.
         */
        return findStructuralIssues(candidate).map(
            (issue) => `${label} "${definition.id}" ${issue}`,
        );
    }

    return {
        label,
        authored,

        all: () => [
            ...Object.values(authored),
            ...(hydrated?.entries ?? []).map((entry) => entry.definition),
            ...custom.values(),
        ],
        custom: () => [...custom.values()],
        hydrated: () => (hydrated?.entries ?? []).map((entry) => entry.definition),

        isKnownId: (id) => isProductionId(id) || custom.has(id),
        get,

        register: (definition) => {
            /*
             * VALIDATED BEFORE ANYTHING IS STORED, which is what makes a
             * refusal atomic.
             *
             * Re-registering an existing custom id replaces it — that is an
             * edit, not a collision — so a check performed after the write, or
             * a write performed before a later check failed, would let a
             * malformed replacement delete a working definition and leave the
             * catalog with neither. A host correcting a typo would lose the
             * entry it was correcting.
             */
            const problems = findRegistrationIssues(definition);
            const firstProblem = problems[0];

            if (firstProblem !== undefined) {
                return { ok: false, reason: problems.join(" ") };
            }

            custom.set(definition.id, definition);
            return { ok: true };
        },

        unregister: (id) => custom.delete(id),
        clearCustom: () => custom.clear(),

        hydrate: (snapshot) => {
            /*
             * Checked before anything is installed, so a refusal leaves the
             * registry exactly as it was. A partial hydrate — some of a snapshot
             * in, the rest rejected — would be a catalog that matches no Vault.
             */
            const collisions = snapshot.ids.filter(isAuthoredId);
            const firstCollision = collisions[0];

            if (firstCollision !== undefined) {
                return {
                    ok: false,
                    reason: `${label} ${collisions.map((id) => `"${id}"`).join(", ")} ${collisions.length === 1 ? "is" : "are"} defined by the engine and cannot be supplied from the Vault.`,
                };
            }

            hydrated = snapshot;
            return { ok: true };
        },

        provenanceOf: (id) =>
            isAuthoredId(id)
                ? { source: "authored", kind: label, id, schemaVersion: 1 }
                : hydrated?.provenanceOf(id) ??
                    (custom.has(id)
                        ? { source: "host", kind: label, id, schemaVersion: 1 }
                        : undefined),

        clearHydrated: () => {
            hydrated = undefined;
        },

        findCatalogIssues: () => {
            const issues: string[] = [];

            for (const [key, definition] of Object.entries(authored)) {
                // A key/id mismatch makes get() and the id printed in
                // diagnostics disagree, which is invisible until someone
                // debugs a wrong-looking error message.
                if (definition.id !== key) {
                    issues.push(
                        `${label} catalog key "${key}" does not match definition id "${definition.id}".`,
                    );
                }
            }

            for (const definition of [
                ...Object.values(authored),
                ...(hydrated?.entries ?? []).map((entry) => entry.definition),
                ...custom.values(),
            ]) {
                if (definition.name.trim().length === 0) {
                    issues.push(`${label} "${definition.id}" has an empty name.`);
                }

                if (definition.description.trim().length === 0) {
                    issues.push(
                        `${label} "${definition.id}" has an empty description.`,
                    );
                }

                /*
                 * The same structural rules the registration barrier applies,
                 * run here so AUTHORED content is held to them too. Nothing
                 * registers the engine's own catalog, so it would otherwise be
                 * the one body of content nobody checked.
                 */
                for (const issue of findStructuralIssues(definition)) {
                    issues.push(`${label} "${definition.id}" ${issue}`);
                }
            }

            return issues;
        },
    };
}

// What can be wrong with one entry in a character's list of references.
export type ReferenceIssueKind = "unknown" | "duplicate";

export interface ReferenceIssue {
    readonly kind: ReferenceIssueKind;
    readonly id: string;
}

/*
 * Walks a character's referenced ids once, reporting unknown ones and repeats.
 *
 * An unknown id is reported and then skipped: listing "not-real" twice is two
 * unknown-reference problems, not an unknown one plus a duplicate one, and
 * the second message would only be noise pointing at the same fix.
 */
export function scanReferences(
    ids: readonly string[],
    isKnownId: (id: string) => boolean,
): readonly ReferenceIssue[] {
    const issues: ReferenceIssue[] = [];
    const seen = new Set<string>();

    for (const id of ids) {
        if (!isKnownId(id)) {
            issues.push({ kind: "unknown", id });
            continue;
        }

        if (seen.has(id)) {
            issues.push({ kind: "duplicate", id });
            continue;
        }

        seen.add(id);
    }

    return issues;
}
