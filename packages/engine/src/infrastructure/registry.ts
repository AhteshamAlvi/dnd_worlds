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

/*
 * What a domain knows about its own definitions that infrastructure cannot.
 *
 * Injected rather than imported, because this file sits below everything and
 * imports nothing — the whole reason provenance and registries live here. A
 * registry cannot ask character/rules whether an Effect is well formed, so the
 * domain hands it a function that can.
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


export function createRegistry<TDefinition extends Definition>(
    label: string,
    authored: Readonly<Record<string, TDefinition>>,
    findStructuralIssues: StructuralValidator,
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

        if (
            typeof definition.name !== "string" ||
            definition.name.trim().length === 0
        ) {
            return [`${label} "${definition.id}" needs a name.`];
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

        all: () => [...Object.values(authored), ...custom.values()],
        custom: () => [...custom.values()],

        isKnownId: (id) => isAuthoredId(id) || custom.has(id),
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
