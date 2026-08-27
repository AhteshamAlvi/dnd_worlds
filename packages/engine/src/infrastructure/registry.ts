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
 */

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

    // Authored plus custom, in that order. What a picker should list.
    readonly all: () => readonly TDefinition[];

    readonly custom: () => readonly TDefinition[];

    readonly isKnownId: (id: string) => boolean;
    readonly get: (id: string) => TDefinition | undefined;

    readonly register: (definition: TDefinition) => RegistrationResult;
    readonly unregister: (id: string) => boolean;

    // Drops every custom entry. For a host reloading its catalog wholesale,
    // and for tests that must not leak registrations into each other.
    readonly clearCustom: () => void;

    // Development-time check of the catalog itself, as opposed to characters
    // that reference it. Covers custom entries too, since a malformed one
    // reaches the same UI.
    readonly findCatalogIssues: () => readonly string[];
}

export function createRegistry<TDefinition extends Definition>(
    label: string,
    authored: Readonly<Record<string, TDefinition>>,
): Registry<TDefinition> {
    // Insertion-ordered, so a picker lists custom entries in the order they
    // were registered rather than a hash order that changes between runs.
    const custom = new Map<string, TDefinition>();

    // hasOwnProperty rather than `id in authored`, so an id like "constructor"
    // or "toString" cannot resolve through the prototype chain.
    const isAuthoredId = (id: string): boolean =>
        Object.prototype.hasOwnProperty.call(authored, id);

    const get = (id: string): TDefinition | undefined =>
        isAuthoredId(id) ? authored[id] : custom.get(id);

    function checkDefinition(definition: TDefinition): string | null {
        if (!DEFINITION_ID_PATTERN.test(definition.id)) {
            return `${label} id "${definition.id}" must be lowercase letters, digits and single hyphens.`;
        }

        if (isAuthoredId(definition.id)) {
            return `${label} "${definition.id}" is defined by the engine and cannot be redefined.`;
        }

        if (definition.name.trim().length === 0) {
            return `${label} "${definition.id}" needs a name.`;
        }

        return null;
    }

    return {
        label,
        authored,

        all: () => [...Object.values(authored), ...custom.values()],
        custom: () => [...custom.values()],

        isKnownId: (id) => isAuthoredId(id) || custom.has(id),
        get,

        register: (definition) => {
            const problem = checkDefinition(definition);
            if (problem !== null) return { ok: false, reason: problem };

            // Re-registering an existing custom id replaces it: that is an
            // edit, not a collision.
            custom.set(definition.id, definition);
            return { ok: true };
        },

        unregister: (id) => custom.delete(id),
        clearCustom: () => custom.clear(),

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
