/*
 * Operation — every way the workbench is allowed to change state.
 *
 * Nothing in the UI is permitted to mutate a character sheet's fields
 * directly. Every edit — renaming, adjusting an attribute, changing an aura
 * value — goes through one of these instead. That is what lets a single
 * reducer (roster.ts) log a readable event for every change, attach the
 * engine's reaction to it, and mark the right sheet dirty for saving.
 *
 * This list is deliberately limited to what the engine and the roster can
 * actually do today. Palette items will add a case here once the Build
 * Palette exists — this is not a place to pre-declare operations for systems
 * that don't exist yet.
 */

import type { AttributeKey, CharacterSpecies } from "@nenworld/engine";
import type { PipelineReport } from "../adapters/sheetPipeline";
import type { PaletteEffect } from "../features/palette/items";

/*
 * The catalogs a character holds a plain list of.
 *
 * Species is absent on purpose. Every other feature is present or not, so
 * add/remove is the whole vocabulary; ancestry is a set of shares that has to
 * total 100, which means it is only ever edited as a unit. Giving it its own
 * operation is what stops "add a Species" from being able to leave a sheet in
 * a state the engine considers broken.
 */
export type FeatureDomain =
  | "clan"
  | "mutation"
  | "trait"
  | "ability"
  | "technique"
  | "skill"
  | "condition";

export type Operation =
  | { kind: "create-character" }
  /*
   * Generic Targets: scratch characters for combat and sandbox testing.
   * They live in the roster so every engine call works on them unchanged,
   * but they are memory-only and must never reach worldbuilding/character-vault/.
   * See `ephemeralIds` in roster.ts for how that's enforced.
   */
  | { kind: "create-generic-target" }
  | { kind: "delete-generic-target"; id: string }
  | { kind: "duplicate-character"; sourceId: string }
  | { kind: "delete-character"; id: string }
  | { kind: "select-character"; id: string }
  | { kind: "select-target"; id: string | null }
  | { kind: "rename-character"; id: string; name: string }
  | { kind: "set-attribute"; id: string; key: AttributeKey; value: number }
  /*
   * The workbench stand-in for the Nen/Ren system: how much of the
   * physiological Output Limit this character can currently access
   * consciously. Aura Output itself has no setter — it's derived from this,
   * CON, and Current Aura. See aura/output.ts's own docstring for why the
   * engine takes this as an external input rather than deriving it.
   */
  | { kind: "set-ren-access-fraction"; id: string; fraction: number }
  /*
   * Advances Aura Regeneration by a number of hours and folds the result
   * into Current Aura. Unlike every other field-edit operation this one
   * doesn't carry the new value directly — the reducer asks the engine's
   * own `replenishAura` to compute it, and the amount actually recovered is
   * whatever that call returns.
   */
  | { kind: "replenish-aura"; id: string; hours: number }
  | { kind: "set-notes"; id: string; notes: string }
  /*
   * Feature list edits. `variantId` only means anything for Mutations, which
   * are the one domain with subtypes (Bender → Fire), and removal is by
   * feature id alone since a character cannot hold the same Mutation twice.
   */
  | {
      kind: "add-feature";
      id: string;
      domain: FeatureDomain;
      featureId: string;
      variantId?: string;
    }
  | { kind: "remove-feature"; id: string; domain: FeatureDomain; featureId: string }
  /*
   * The whole ancestry at once — the "lock it in" step of the species mixer.
   * The UI does not let a mix that fails the engine's 100% rule get this far,
   * so this is a commit, not a proposal.
   */
  | { kind: "set-species"; id: string; species: readonly CharacterSpecies[] }
  /*
   * A Build Palette item applied to a character. The effect travels with the
   * operation rather than just an item id, so the reducer never has to import
   * the palette — same layering rule as run-function. One operation means one
   * event and one pipeline run, however many fields the item touches.
   */
  | {
      kind: "apply-palette-item";
      id: string;
      itemName: string;
      effect: PaletteEffect;
    }
  /*
   * A Function Sandbox run. Unlike every other operation, this one carries a
   * finished result rather than instructions to produce one — the Sandbox
   * invokes the registry entry itself and hands over what came back.
   *
   * That keeps rosterReducer from having to import the registry (a state/ →
   * features/ dependency, backwards from how the rest of the app is layered)
   * and leaves the reducer a pure recorder. Running a function changes no
   * character, so there is nothing for the reducer to compute anyway.
   */
  | {
      kind: "run-function";
      functionId: string;
      functionName: string;
      summary: string;
      characterId: string | null;
      report: PipelineReport;
    };
