/*
 * Integrity: how much a durable Item can take before it degrades, breaks, or
 * is gone for good — kept entirely apart from stack quantity and consumption.
 *
 *
 * DEFINITION POLICY, INSTANCE STATE
 *
 * `ItemIntegrityDefinition` is authored once and never changes: how much
 * integrity the Item has at full health, whether it can ever be repaired, and
 * what hitting zero MEANS for it. `CharacterItem.integrity` is the one number
 * that changes per owned object. The split matters because a sword and the
 * scratch on THIS sword are different kinds of fact — one is a rule, the
 * other is history — and conflating them is how "how much can this take" and
 * "how much has this taken" end up being the same field, unrepresentable the
 * moment two identical swords take different damage.
 *
 *
 * QUANTITY IS NOT INTEGRITY
 *
 * A broken sword is still quantity one; a consumed stack may reach quantity
 * zero. Neither fact stands in for the other, and a STACKABLE Item may not
 * declare integrity at all — see `equipment/validation.ts`'s
 * `stackable-durable` issue. A stack sharing one integrity value could not
 * say which of its members took the hit, which is the exact ambiguity
 * `inventoryMode` was introduced to close for passive Effects; the fix here
 * is the same shape: pick individual entries, or declare the stack
 * non-durable.
 *
 *
 * STATE IS DERIVED, NEVER STORED REDUNDANTLY
 *
 * Intact, degraded, broken, destroyed — none of these is a flag anywhere.
 * `resolveIntegrityState()` derives the current one from the stored number
 * and the authored bands (or, with none authored, from zero alone), so a
 * character's sheet cannot say "broken" while its integrity reads positive.
 *
 *
 * WHAT THIS FILE DOES NOT DO
 *
 * It does not decide how much stress an attack deals — that is the owning
 * combat mechanic's question, handed to this file as an amount. It does not
 * remove a destroyed Item from the inventory: quantity is a separate fact,
 * and a destroyed sword is still a line on the sheet, at zero, contributing
 * whatever its "destroyed" band says it contributes. And it does not
 * implement Shū protection: a future compatible whole-Item enhancement may
 * mitigate incoming stress before it reaches this resolver, but nothing here
 * calculates that mitigation.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";
import { createTraceNode, type TraceInputs } from "../../infrastructure/trace";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";

import type { Character } from "../types";
import type { ItemDefinition } from "./types";
import type { ResolvedCharacter } from "../resolution";
import { findEffectsValidationIssues } from "../rules/validation";
import type { Effect } from "../rules/effects";

import {
  describeInventoryReferenceIssue,
  resolveInventoryItemRef,
  type InventoryItemRef,
} from "./references";
import type { CharacterItem } from "./types";
import type { ItemDefinitionLookup } from "./validation";


/* -------------------------------------------------------------------------- */
/* Definition policy                                                          */
/* -------------------------------------------------------------------------- */

export const ITEM_INTEGRITY_STATES = [
  "intact",
  "degraded",
  "broken",
  "destroyed",
] as const;

export type ItemIntegrityState = typeof ITEM_INTEGRITY_STATES[number];

export function isItemIntegrityState(value: unknown): value is ItemIntegrityState {
  return typeof value === "string" &&
    (ITEM_INTEGRITY_STATES as readonly string[]).includes(value);
}


/**
 * One named band of integrity, and what it means while current integrity
 * falls inside it — both bounds inclusive.
 *
 * `effects` are what contribution resolution applies while this band is
 * current (see `contributions.ts`) — a degraded blade might subtract from an
 * attack's Effects, exactly as any other sourced Effect list would. Absent or
 * empty means the band changes the Item's classification without changing
 * what it contributes.
 */
export interface ItemIntegrityBand {
  readonly state: ItemIntegrityState;
  readonly minimum: number;
  readonly maximum: number;
  readonly effects?: readonly Effect[];
}


/**
 * Per-Item policy: how much it can take, whether it comes back, and what
 * zero means for it.
 */
export interface ItemIntegrityDefinition {
  readonly maximum: number;
  readonly repairable: boolean;

  /**
   * What hitting zero integrity means for this Item.
   *
   * "broken" — a damaged object, eligible for repair when `repairable` is
   * true. "destroyed" — a terminal state: repair never applies again once
   * integrity reaches zero, regardless of `repairable`, because a destroyed
   * object is gone in a way a broken one is not. `repairable` still governs
   * every repair attempt ABOVE zero either way — a "destroyed" Item that
   * partially degrades before it is finished off may still be mended up to
   * that point.
   */
  readonly zeroBehavior: "broken" | "destroyed";

  /**
   * Named ranges of integrity. Omitted means the only derived states are
   * "intact" (integrity > 0) and whatever `zeroBehavior` names (integrity
   * <= 0) — the two-band default every durable Item gets for free.
   */
  readonly bands?: readonly ItemIntegrityBand[];
}


export function findItemIntegrityBandIssues(
  band: ItemIntegrityBand,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isItemIntegrityState(band.state)) {
    errors.push({
      code: "equipment.integrity.band.state.invalid",
      message: "An integrity band must name a known state.",
      audience: "developer",
      required: [...ITEM_INTEGRITY_STATES],
      actual: String(band.state),
    });
  }

  if (!Number.isFinite(band.minimum)) {
    errors.push({
      code: "equipment.integrity.band.minimum.invalid",
      message: "An integrity band's minimum must be a finite number.",
      audience: "developer",
      required: "finite number",
      actual: String(band.minimum),
    });
  }

  if (!Number.isFinite(band.maximum)) {
    errors.push({
      code: "equipment.integrity.band.maximum.invalid",
      message: "An integrity band's maximum must be a finite number.",
      audience: "developer",
      required: "finite number",
      actual: String(band.maximum),
    });
  } else if (Number.isFinite(band.minimum) && band.maximum < band.minimum) {
    errors.push({
      code: "equipment.integrity.band.inverted",
      message: "An integrity band's maximum is below its minimum.",
      audience: "developer",
      required: `>= ${band.minimum}`,
      actual: String(band.maximum),
    });
  }

  if (band.effects !== undefined) {
    if (!Array.isArray(band.effects)) {
      errors.push({
        code: "equipment.integrity.band.effects.invalid",
        message: "An integrity band's effects must be a list.",
        audience: "developer",
        required: "array of Effects",
        actual: String(band.effects),
      });
    } else {
      for (const issue of findEffectsValidationIssues(band.effects, "effects")) {
        errors.push({
          code: `equipment.integrity.band.effects.${issue.type}`,
          message: `An integrity band's Effect at ${issue.path} is malformed: ${issue.type}.`,
          audience: "developer",
          required: "a well-formed Effect",
          actual: issue.path,
        });
      }
    }
  }

  return errors;
}


/**
 * Every structural fault in one Item's integrity policy.
 *
 * Overlap between bands is deliberately NOT refused: two bands claiming the
 * same value is an authoring ambiguity `resolveIntegrityState()` resolves by
 * taking the FIRST authored match, same as every other first-match list in
 * this engine, rather than a reason to refuse an otherwise sound definition.
 */
export function findItemIntegrityDefinitionIssues(
  definition: ItemIntegrityDefinition,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!Number.isFinite(definition.maximum) || definition.maximum <= 0) {
    errors.push({
      code: "equipment.integrity.maximum.invalid",
      message: "An Item's maximum integrity must be a finite number greater than zero.",
      audience: "developer",
      required: "finite number > 0",
      actual: String(definition.maximum),
    });
  }

  if (typeof definition.repairable !== "boolean") {
    errors.push({
      code: "equipment.integrity.repairable.invalid",
      message: "An Item's integrity policy must state repairable as true or false.",
      audience: "developer",
      required: "boolean",
      actual: String(definition.repairable),
    });
  }

  if (definition.zeroBehavior !== "broken" && definition.zeroBehavior !== "destroyed") {
    errors.push({
      code: "equipment.integrity.zero-behavior.invalid",
      message: "An Item's zeroBehavior must be \"broken\" or \"destroyed\".",
      audience: "developer",
      required: ["broken", "destroyed"],
      actual: String(definition.zeroBehavior),
    });
  }

  if (definition.bands !== undefined) {
    if (!Array.isArray(definition.bands)) {
      errors.push({
        code: "equipment.integrity.bands.invalid",
        message: "An Item's integrity bands must be a list.",
        audience: "developer",
        required: "array of ItemIntegrityBand",
        actual: String(definition.bands),
      });
    } else {
      for (const band of definition.bands) {
        errors.push(...findItemIntegrityBandIssues(band));
      }
    }
  }

  return errors;
}


/**
 * Which named state a given integrity figure falls in, for this Item.
 *
 * Authored bands are checked first, in authored order, first match wins.
 * With none authored (or none matching), a positive figure is "intact" and a
 * non-positive one is whatever `zeroBehavior` names — the two-state default
 * every durable Item gets even with no bands written.
 */
export function resolveIntegrityState(
  definition: ItemIntegrityDefinition,
  integrity: number,
): ItemIntegrityState {
  for (const band of definition.bands ?? []) {
    if (integrity >= band.minimum && integrity <= band.maximum) {
      return band.state;
    }
  }

  return integrity > 0 ? "intact" : definition.zeroBehavior;
}


/** The authored band currently governing contribution resolution, if any. */
export function currentIntegrityBand(
  definition: ItemIntegrityDefinition,
  integrity: number,
): ItemIntegrityBand | undefined {
  return (definition.bands ?? []).find(
    (band) => integrity >= band.minimum && integrity <= band.maximum,
  );
}


/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

export type ItemIntegrityOperation =
  | {
      readonly type: "stress";
      readonly amount: number;

      /**
       * A pre-computed reduction from a future whole-Item Shū enhancement,
       * for a caller that already has one to offer. This resolver performs
       * NO Shū calculation and imports no Aura or Nen module — it only
       * respects the boundary: mitigation is honoured for a `"compatible"`
       * Item and IGNORED outright for an `"incompatible"` one, whatever
       * figure is supplied. `undefined` means no protection was offered.
       */
      readonly mitigation?: number;
    }
  | { readonly type: "repair"; readonly amount: number };


export interface ItemIntegrityOperationInput {
  /** The character as they stand BEFORE the operation. */
  readonly resolved: ResolvedCharacter;
  readonly item: InventoryItemRef;
  readonly operation: ItemIntegrityOperation;
}


/** What one integrity change did, or — for a refusal — did not do. */
export interface ItemIntegrityChange {
  readonly source: ContributionSourceRef;
  readonly item: InventoryItemRef;
  readonly itemId: string;

  readonly integrityBefore: number;
  readonly integrityAfter: number;

  readonly stateBefore: ItemIntegrityState;
  readonly stateAfter: ItemIntegrityState;
}


export type ItemIntegrityResolution =
  | {
      readonly disposition: "applied";
      readonly change: ItemIntegrityChange;
      readonly nextCharacter: Character;
    }
  | {
      /** The Item's definition declares no integrity policy at all. */
      readonly disposition: "not-durable";
      readonly item: InventoryItemRef;
    }
  | {
      /** A repair was attempted and this Item's policy refuses it. */
      readonly disposition: "not-repairable";
      readonly item: InventoryItemRef;
      readonly stateBefore: ItemIntegrityState;
    };


function structuralError(code: string, message: string, extra: Partial<EngineError> = {}): EngineError {
  return { code, message, audience: "developer", ...extra };
}


const REFERENCE_ERROR_CODES = {
  "invalid-reference": "equipment.integrity.reference_invalid",
  "character-mismatch": "equipment.integrity.character_mismatch",
  "unknown-entry": "equipment.integrity.entry_unknown",
  "invalid-entry": "equipment.integrity.entry_invalid",
} as const;


function traceOf(inputs: TraceInputs, output: string) {
  return {
    root: createTraceNode({
      id: "character.equipment.integrity",
      label: "Resolve Item Integrity Operation",
      formula:
        "stress subtracts, repair adds, clamped to [0, maximum]; state is derived from the result, never stored",
      inputs,
      output,
    }),
  };
}


/**
 * The stress an Item actually takes, after whatever mitigation a caller
 * offered — respecting Shū compatibility without calculating Shū.
 *
 * `"incompatible"` Items ignore any offered mitigation outright: a future
 * whole-Item enhancement never applies to them, so a caller passing one
 * anyway must not quietly reduce the damage. `"compatible"` Items honour it,
 * clamped so mitigation can reduce stress to zero and never reverse it into
 * a repair.
 */
function stressAfterMitigation(
  shuInteraction: ItemDefinition["shuInteraction"],
  operation: { readonly amount: number; readonly mitigation?: number },
): number {
  const raw = Math.abs(operation.amount);

  if (shuInteraction !== "compatible" || operation.mitigation === undefined) {
    return raw;
  }

  return Math.max(0, raw - Math.abs(operation.mitigation));
}


function withIntegrityReplaced(
  character: Character,
  entryId: string,
  integrity: number,
): Character {
  const nextItems: readonly CharacterItem[] = (character.items ?? []).map(
    (item) => item.entryId === entryId ? { ...item, integrity } : item,
  );

  return { ...character, items: nextItems };
}


/**
 * Resolve one stress or repair operation against one owned entry.
 *
 * Pure. The input Character and its inventory are never mutated. A refusal
 * — "not-durable", "not-repairable" — is a successful answer, exactly as
 * equip/use resolvers report their own refusals; a malformed reference or
 * entry is an `EngineFailure`.
 */
export function resolveItemIntegrityOperation(
  input: ItemIntegrityOperationInput,
  getItemDefinition: ItemDefinitionLookup,
): EngineResult<ItemIntegrityResolution> {
  const inputs: TraceInputs = {
    operation: { value: input.operation.type },
    amount: { value: input.operation.amount },
  };

  const character = input.resolved.character;

  const found = resolveInventoryItemRef(input.item, character.id, character.items);

  if (!found.ok) {
    return engineFailure(traceOf(inputs, found.issue), [
      structuralError(REFERENCE_ERROR_CODES[found.issue], describeInventoryReferenceIssue(found.issue)),
    ]);
  }

  const entry = found.entry;

  inputs["entryId"] = { value: entry.entryId };

  const definition = getItemDefinition(entry.itemId);

  if (definition === undefined) {
    return engineFailure(traceOf(inputs, "item_unknown"), [
      structuralError(
        "equipment.integrity.item_unknown",
        `The entry names Item "${entry.itemId}", which no catalog defines.`,
        { actual: entry.itemId },
      ),
    ]);
  }

  const item: InventoryItemRef = { characterId: character.id, entryId: entry.entryId };

  if (definition.integrity === undefined) {
    return engineSuccess(
      { disposition: "not-durable", item },
      traceOf(inputs, "not-durable"),
    );
  }

  const policy = definition.integrity;

  if (
    !Number.isFinite(policy.maximum) || policy.maximum <= 0
  ) {
    return engineFailure(traceOf(inputs, "definition_invalid"), [
      structuralError(
        "equipment.integrity.definition_invalid",
        `Item "${entry.itemId}" declares an invalid integrity policy.`,
      ),
    ]);
  }

  const before = entry.integrity ?? policy.maximum;
  const stateBefore = resolveIntegrityState(policy, before);

  if (input.operation.type === "repair") {
    const terminal = policy.zeroBehavior === "destroyed" && before <= 0;

    if (!policy.repairable || terminal) {
      return engineSuccess(
        { disposition: "not-repairable", item, stateBefore },
        traceOf(inputs, "not-repairable"),
      );
    }
  }

  const delta = input.operation.type === "stress"
    ? -Math.max(0, stressAfterMitigation(definition.shuInteraction, input.operation))
    : Math.abs(input.operation.amount);

  const after = Math.max(0, Math.min(policy.maximum, before + delta));
  const stateAfter = resolveIntegrityState(policy, after);

  const source: ContributionSourceRef = {
    type: "item",
    id: entry.itemId,
    instanceId: entry.entryId,
  };

  inputs["source"] = { value: contributionSourceKey(source) };
  inputs["integrityBefore"] = { value: before };
  inputs["integrityAfter"] = { value: after };

  const change: ItemIntegrityChange = {
    source,
    item,
    itemId: entry.itemId,
    integrityBefore: before,
    integrityAfter: after,
    stateBefore,
    stateAfter,
  };

  return engineSuccess(
    {
      disposition: "applied",
      change,
      nextCharacter: withIntegrityReplaced(character, entry.entryId, after),
    },
    traceOf(inputs, "applied"),
  );
}


/*
 * The runtime side of integrity — the `character`-domain EFFECT handler and
 * request builder — lives in runtime.ts, not here. This file is imported by
 * `equipment/validation.ts` (for `findItemIntegrityDefinitionIssues`), and
 * the runtime handler needs `resolveCharacter()` from `character/resolution.ts`,
 * which itself depends on the equipment catalog — putting both in one file
 * would close a value-import cycle through validation.ts that a type-only
 * boundary cannot break. See runtime.ts's own header.
 */
