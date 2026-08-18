/*
 * Field descriptors for Function Sandbox parameters.
 *
 * A field describes *the form control*, nothing more. It never describes an
 * engine type. That distinction is the whole point: a registry entry says
 * "render a number input here", and then calls the real engine function
 * directly — TypeScript checks that call, so the engine stays the source of
 * truth for its own signatures.
 *
 * The `ValueOf` / `ArgsOf` types below are what tie the two halves together:
 * they turn a params object into the argument type that `invoke` receives.
 * Get a param name or type wrong and `invoke` fails to compile.
 */

import type { Character } from "@nenworld/engine";
import type { CharacterSheet } from "../../state/sheet";

// What a field can read from when computing a prefill value. Deliberately
// small: the active character, the target, and the whole roster for lookups.
export interface SandboxContext {
  readonly active: CharacterSheet | null;
  readonly target: CharacterSheet | null;
  readonly sheets: Readonly<Record<string, CharacterSheet>>;

  // Saved characters, in Character List order.
  readonly order: readonly string[];

  // Memory-only Generic Targets. Listed separately so a characterRef can
  // offer them without implying they're real saved characters.
  readonly ephemeralIds: readonly string[];
}

/*
 * The explicit `| undefined` on every optional property below is required by
 * exactOptionalPropertyTypes: the builders construct these by spreading an
 * options object, so a property may legitimately arrive as undefined rather
 * than being absent.
 */
interface FieldBase {
  readonly label: string;
  readonly hint?: string | undefined;
}

export interface NumberField extends FieldBase {
  readonly kind: "number";
  readonly prefill?: ((ctx: SandboxContext) => number | undefined) | undefined;
}

export interface TextField extends FieldBase {
  readonly kind: "text";
  readonly prefill?: ((ctx: SandboxContext) => string | undefined) | undefined;
}

export interface BooleanField extends FieldBase {
  readonly kind: "boolean";
}

export interface SelectField<T extends string = string> extends FieldBase {
  readonly kind: "select";
  readonly options: readonly T[];
}

// Yields a whole engine Character, picked from the roster. Without this,
// running validateCharacter would mean typing ten attributes by hand.
export interface CharacterRefField extends FieldBase {
  readonly kind: "characterRef";
  readonly defaultTo?: "active" | "target" | undefined;
}

// Handles engine object types (AuraPool, AuraDistribution...) as a nested
// block of real inputs rather than a JSON blob.
export interface GroupField<S extends FieldSpec = FieldSpec> extends FieldBase {
  readonly kind: "group";
  readonly fields: S;
}

export type AnyField =
  | NumberField
  | TextField
  | BooleanField
  | SelectField
  | CharacterRefField
  // `any` here only to break the circular reference between AnyField and
  // FieldSpec; ValueOf below still infers the real shape via `infer S`.
  | GroupField<any>;

export type FieldSpec = { readonly [key: string]: AnyField };

// Maps one field descriptor to the value it produces.
export type ValueOf<F> = F extends NumberField
  ? number
  : F extends TextField
    ? string
    : F extends BooleanField
      ? boolean
      : F extends SelectField<infer T>
        ? T
        : F extends CharacterRefField
          ? Character
          : F extends GroupField<infer S>
            ? { [K in keyof S]: ValueOf<S[K]> }
            : never;

// The argument object `invoke` receives, derived from a params spec.
export type ArgsOf<S extends FieldSpec> = { [K in keyof S]: ValueOf<S[K]> };

/*
 * Builders.
 *
 * Each returns its concrete field interface (not the wide AnyField union),
 * which is what keeps inference precise: field.group("x", { a: field.number("A") })
 * is a GroupField<{ a: NumberField }>, so ValueOf yields { a: number }.
 */
export const field = {
  number(
    label: string,
    opts: { hint?: string; prefill?: NumberField["prefill"] } = {},
  ): NumberField {
    return { kind: "number", label, ...opts };
  },

  text(
    label: string,
    opts: { hint?: string; prefill?: TextField["prefill"] } = {},
  ): TextField {
    return { kind: "text", label, ...opts };
  },

  boolean(label: string, opts: { hint?: string } = {}): BooleanField {
    return { kind: "boolean", label, ...opts };
  },

  // `const T` preserves the literal option strings, so the value type is the
  // union of those literals rather than plain `string`.
  select<const T extends string>(
    label: string,
    options: readonly T[],
    opts: { hint?: string } = {},
  ): SelectField<T> {
    return { kind: "select", label, options, ...opts };
  },

  characterRef(
    label: string,
    opts: { hint?: string; defaultTo?: "active" | "target" } = {},
  ): CharacterRefField {
    return { kind: "characterRef", label, ...opts };
  },

  group<S extends FieldSpec>(
    label: string,
    fields: S,
    opts: { hint?: string } = {},
  ): GroupField<S> {
    return { kind: "group", label, fields, ...opts };
  },
};
