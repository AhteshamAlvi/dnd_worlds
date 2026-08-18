/*
 * The Function Sandbox registry.
 *
 * A hand-authored list of engine entry points, not an automatic reflection of
 * everything the engine exports. That's deliberate: the registry should show
 * the calls worth making by hand, described and categorised, rather than
 * every internal helper that happens to be public.
 *
 * ── Adding a function ────────────────────────────────────────────────────
 *
 * Import the real engine function and call it in `invoke`. `params` only
 * describes the form; the argument type of `invoke` is inferred from it, so
 * a wrong name or type is a compile error rather than a runtime surprise.
 *
 *   import { calculateAuraDensity } from "@nenworld/engine";
 *   import { defineEngineFunction, field } from "./registry";
 *
 *   defineEngineFunction({
 *     id: "calculateAuraDensity",
 *     name: "Aura density",
 *     category: "aura",
 *     description: "Aura divided by Surface Units.",
 *
 *     params: {
 *       distribution: field.group("Distribution", {
 *         aura: field.number("Aura", {
 *           prefill: (ctx) => ctx.active?.workbench.auraOutput,
 *         }),
 *         surfaceUnits: field.number("Surface Units", {
 *           prefill: (ctx) => ctx.active?.character.body.surfaceUnits,
 *         }),
 *       }),
 *     },
 *
 *     // `distribution` is inferred as { aura: number; surfaceUnits: number }
 *     invoke: ({ distribution }) => calculateAuraDensity(distribution),
 *   })
 *
 * For anything taking a whole Character, use field.characterRef — it yields
 * the real engine object straight from the roster:
 *
 *   params: { character: field.characterRef("Character", { defaultTo: "active" }) },
 *   invoke: ({ character }) => validateCharacter(character),
 */

import type { EngineResult } from "@nenworld/engine";
import type { ArgsOf, FieldSpec } from "./fields";

export { field } from "./fields";

export type FunctionCategory =
  | "character"
  | "aura"
  | "body"
  | "combat"
  | "nen"
  | "other";

// Display order for the category headings in the Sandbox list.
export const FUNCTION_CATEGORIES: readonly FunctionCategory[] = [
  "character",
  "aura",
  "body",
  "nen",
  "combat",
  "other",
];

/*
 * A registered function as the *UI* sees it: uniform, non-generic, iterable.
 * Authors never write this type directly — they write the generic form in
 * defineEngineFunction and get inference.
 */
export interface RegisteredFunction {
  readonly id: string;
  readonly name: string;
  readonly category: FunctionCategory;
  readonly description: string;
  readonly params: FieldSpec;
  readonly invoke: (args: Record<string, unknown>) => EngineResult<unknown>;
}

/*
 * Declares one entry.
 *
 * Generic over the params shape so `invoke` receives a precisely typed args
 * object, then stored as the uniform RegisteredFunction the list can iterate.
 * Bridging those two requires exactly one cast — and this is the only place
 * in the codebase that needs it. Nobody adding a function ever writes `as`.
 */
export function defineEngineFunction<S extends FieldSpec>(definition: {
  id: string;
  name: string;
  category: FunctionCategory;
  description: string;
  params: S;
  invoke: (args: ArgsOf<S>) => EngineResult<unknown>;
}): RegisteredFunction {
  return definition as unknown as RegisteredFunction;
}

/*
 * The registry. Empty by design — the machinery ships first, the entries get
 * added as the engine grows. See the worked example at the top of this file.
 */
export const FUNCTIONS: readonly RegisteredFunction[] = [];

export function findFunction(id: string): RegisteredFunction | undefined {
  return FUNCTIONS.find((entry) => entry.id === id);
}
