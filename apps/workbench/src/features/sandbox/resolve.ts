/*
 * Turning a half-filled form into typed engine arguments.
 *
 * The registry's type inference promises `invoke` receives fully-populated
 * args. This file is what makes that promise true at runtime: it walks the
 * params spec, collects values, and reports which fields are still missing.
 * The Sandbox keeps RUN disabled until `missing` is empty, so `invoke` is
 * never called with holes in it.
 */

import type { AnyField, FieldSpec, SandboxContext } from "./fields";

/*
 * Form state mirrors the params spec, but every leaf is optional and loosely
 * typed — it holds whatever the user has entered so far. `resolveArgs` is
 * the only thing that converts it into something the engine may see.
 */
export type FormState = { [key: string]: FormValue };
export type FormValue = string | number | boolean | undefined | FormState;

export type ResolveResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; missing: readonly string[] };

// Builds the starting form state for a function, applying each field's
// prefill so the form opens with sensible values instead of blanks.
export function initialFormState(
  params: FieldSpec,
  ctx: SandboxContext,
): FormState {
  const state: FormState = {};

  for (const [key, spec] of Object.entries(params)) {
    state[key] = initialFieldValue(spec, ctx);
  }

  return state;
}

function initialFieldValue(
  spec: AnyField,
  ctx: SandboxContext,
): FormValue {
  switch (spec.kind) {
    case "number":
    case "text":
      return spec.prefill?.(ctx);

    case "boolean":
      return false;

    case "select":
      return spec.options[0];

    case "characterRef": {
      // Stores the character *id*; the real Character is looked up at
      // resolve time so an edit to that sheet is picked up on the next run.
      const preferred =
        spec.defaultTo === "target" ? ctx.target : spec.defaultTo === "active" ? ctx.active : null;
      return preferred?.id;
    }

    case "group":
      return initialFormState(spec.fields, ctx);
  }
}

export function resolveArgs(
  params: FieldSpec,
  state: FormState,
  ctx: SandboxContext,
): ResolveResult {
  const missing: string[] = [];
  const args = resolveSpec(params, state, ctx, "", missing);

  return missing.length > 0 ? { ok: false, missing } : { ok: true, args };
}

function resolveSpec(
  params: FieldSpec,
  state: FormState,
  ctx: SandboxContext,
  prefix: string,
  missing: string[],
): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(params)) {
    const path = prefix ? `${prefix}.${key}` : key;
    args[key] = resolveField(spec, state[key], ctx, path, missing);
  }

  return args;
}

function resolveField(
  spec: AnyField,
  value: FormValue,
  ctx: SandboxContext,
  path: string,
  missing: string[],
): unknown {
  switch (spec.kind) {
    case "number": {
      // NaN is what an emptied number input produces, and it is never a
      // legitimate engine argument — treat it as absent, not as a value.
      if (typeof value !== "number" || Number.isNaN(value)) {
        missing.push(path);
        return undefined;
      }
      return value;
    }

    case "text": {
      if (typeof value !== "string" || value === "") {
        missing.push(path);
        return undefined;
      }
      return value;
    }

    case "boolean":
      return value === true;

    case "select": {
      if (typeof value !== "string" || !spec.options.includes(value)) {
        missing.push(path);
        return undefined;
      }
      return value;
    }

    case "characterRef": {
      const sheet = typeof value === "string" ? ctx.sheets[value] : undefined;
      if (!sheet) {
        missing.push(path);
        return undefined;
      }
      // Hands the engine its own Character type, untouched.
      return sheet.character;
    }

    case "group": {
      const nested =
        value && typeof value === "object" ? (value as FormState) : {};
      return resolveSpec(spec.fields, nested, ctx, path, missing);
    }
  }
}

// Reads/writes a single leaf in nested form state without mutating it.
export function setFormValue(
  state: FormState,
  path: readonly string[],
  value: FormValue,
): FormState {
  const [head, ...rest] = path;
  if (head === undefined) return state;

  if (rest.length === 0) {
    return { ...state, [head]: value };
  }

  const child = state[head];
  const nested = child && typeof child === "object" ? child : {};

  return { ...state, [head]: setFormValue(nested, rest, value) };
}
