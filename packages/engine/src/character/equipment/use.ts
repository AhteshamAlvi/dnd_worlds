/*
 * Using an Item.
 *
 * One pure function answers what happens when a character uses one owned
 * object: whether they may, what the Item's use Effects resolve to, and the
 * Character they are left with afterwards. It is the third timing an Item's
 * Effects can have, and the only one that is an EVENT rather than a state.
 *
 *
 * THREE TIMINGS, KEPT OBSERVABLY APART
 *
 * possessedEffects apply while the thing is owned and equippedEffects while it
 * is held or worn. Both are passive, both are collected by
 * collectItemEffectSources(), and both appear on a resolved character without
 * anyone doing anything. useEffects are none of that. They are resolved here,
 * once per use, and appear in this function's result and nowhere else — not on
 * the sheet before the use, not on the sheet after it, and not because the Item
 * happens to be in a hand. Collecting them with the rest is how a Healing
 * Potion heals continuously for being in a bag.
 *
 * Quantity does not multiply a use. A stack of five potions drunk once is one
 * potion drunk, and a use that scaled with the stack would make grouping
 * change what happened — the failure inventoryMode exists to prevent.
 *
 *
 * WHAT "RESOLVED" MEANS HERE
 *
 * The declared Effects go through resolveRuleEffects() with the Item's full
 * provenance, definition id and entry id, so the answer is the engine's
 * canonical sourced output — the same shape every other rule source produces.
 * That is where this function stops. It does not rewrite a stored Attribute,
 * restore Body Points or change Body Strength, because each of those facts has
 * an owning mechanic, and a use resolver that edited them directly would be a
 * second implementation of every one of them. Routing a use's consequences to
 * their owners, and attaching the use to an action with a cost, targets and
 * adjudication, belongs to the action-intent work that follows; nothing here
 * produces an ActionProfile or an ActionIntent.
 *
 *
 * CONSUMPTION IS DECLARED, NEVER INFERRED
 *
 * A use removes a unit only because the Item says `consumesOnUse: true`. Not
 * because it is stackable — a whetstone is a count and survives a sharpening —
 * and not because of its use Effects, its name, its tags or its quantity.
 *
 * One successful use removes exactly one unit from the SELECTED entry, which
 * is identified by its entryId, so two entries naming the same potion are two
 * stacks and only the referenced one shrinks. A stack needs no concrete object
 * to be drawn from: the entry names the stack, and nobody asks which arrow. An
 * entry that reaches zero stays on the sheet — an emptied quiver is still a
 * quiver — and one that was held or worn returns to carried in the same
 * replacement, because an engaged entry must be exactly one object and zero is
 * none. Stacks are never split or merged, and there is no bulk use.
 *
 *
 * ATOMIC, AND TWO KINDS OF "NO"
 *
 * Requirements, Effects and the decrement are one answer. A refused or
 * unresolved use returns no Effects and no Character, so there is nothing a
 * caller could apply by mistake. As in the equip transition, a rule saying no
 * is a disposition inside a success — not-usable, quantity-unavailable,
 * requirements-unsatisfied, requirements-unresolved — and only a malformed
 * question is an EngineFailure addressed to a developer.
 */

import {
  createTraceNode,
  type EngineTrace,
  type TraceInputs,
} from "../../infrastructure/trace";
import type { EngineError } from "../../infrastructure/diagnostics";
import type { JsonValue } from "../../infrastructure/json";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";

import {
  namedRequirementDisposition,
  resolveNamedRequirements,
  resolveRuleEffects,
  type NamedRequirementResolution,
  type ResolvedRuleEffects,
} from "../rules/resolution";

import type { Character } from "../types";
import type { ResolvedCharacter } from "../resolution";

import {
  describeInventoryReferenceIssue,
  resolveInventoryItemRef,
  type InventoryItemRef,
} from "./references";
import { isEquippedItemState } from "./state";
import {
  describeItemDefinitionIssue,
  findItemUseDefinitionIssues,
  type ItemDefinitionLookup,
} from "./validation";
import { isActivelyUsableItem, type CharacterItem } from "./types";


/* -------------------------------------------------------------------------- */
/* Contract                                                                   */
/* -------------------------------------------------------------------------- */

export interface ItemUseInput {
  /**
   * The character as they stand BEFORE the use.
   *
   * Resolved rather than authored, because use requirements are asked of the
   * resolved view — a Trait granted by a Species satisfies a requirement for it
   * exactly as one taken directly does.
   */
  readonly resolved: ResolvedCharacter;

  /** Which owned entry. Never an index, never a bare itemId. */
  readonly item: InventoryItemRef;
}


/** What one use of one entry did, or — for a refusal — did not do. */
export interface ItemUse {
  /**
   * Both identities, as everywhere else in the Item domain: the definition is
   * what a player recognises and a requirement asks about, the instance is
   * which of two identical potions was drunk.
   */
  readonly source: ContributionSourceRef;

  readonly item: InventoryItemRef;
  readonly itemId: string;

  /**
   * FACTS, not a proposal. A refused use consumed nothing, so a refusal reports
   * `consumed: 0` and a `quantityAfter` equal to `quantityBefore` — a caller
   * that read "would consume one" off a refusal and applied it would be
   * decrementing a stack for a use that never happened.
   */
  readonly quantityBefore: number;
  readonly quantityAfter: number;
  readonly consumed: number;
}


export type ItemUseResolution =
  | {
      readonly disposition: "executed";
      readonly use: ItemUse;
      readonly requirements: readonly NamedRequirementResolution[];

      /** The declared useEffects, resolved exactly once, with Item provenance. */
      readonly effects: ResolvedRuleEffects;

      /**
       * The character after the use. The very Character supplied when nothing
       * stored changed — a reusable Item — and a replacement when a unit was
       * consumed. Never a mutation of the input either way.
       */
      readonly nextCharacter: Character;
    }
  | {
      /** The Item declares no use at all: no Effect, no gate, no consumption. */
      readonly disposition: "not-usable";
      readonly item: InventoryItemRef;
    }
  | {
      readonly disposition: "quantity-unavailable";
      readonly item: InventoryItemRef;
      readonly quantity: number;
    }
  | {
      readonly disposition: "requirements-unsatisfied";
      readonly use: ItemUse;
      readonly requirements: readonly NamedRequirementResolution[];
    }
  | {
      readonly disposition: "requirements-unresolved";
      readonly use: ItemUse;
      readonly requirements: readonly NamedRequirementResolution[];
    };


/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

function structuralError(
  code: string,
  message: string,
  extra: Partial<EngineError> = {},
): EngineError {
  return {
    code,
    message,
    /*
     * Developer, not player. Every one of these means the caller asked a
     * malformed question, and a player told "that entry is invalid" has been
     * handed someone else's bug.
     */
    audience: "developer",
    ...extra,
  };
}


/*
 * The four reference issues, each with its own code, for the reason the equip
 * transition keeps them apart: an object that is GONE and an object that is
 * CORRUPT lead to opposite fixes.
 */
const REFERENCE_ERROR_CODES = {
  "invalid-reference": "equipment.use.reference_invalid",
  "character-mismatch": "equipment.use.character_mismatch",
  "unknown-entry": "equipment.use.entry_unknown",
  "invalid-entry": "equipment.use.entry_invalid",
} as const;


/* -------------------------------------------------------------------------- */
/* Trace                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Assembled as facts become SAFE to state, for the reason the transition's
 * is: a trace is serialized into bug reports and golden snapshots, so nothing
 * the caller supplied goes into it before it has been validated.
 */
function traceOf(inputs: TraceInputs, output: JsonValue): EngineTrace {
  return {
    root: createTraceNode({
      id: "character.equipment.use",
      label: "Resolve Item Use",
      formula:
        "useRequirements gate the attempt against the pre-use character; useEffects resolve once with entry provenance; consumesOnUse removes one unit",
      inputs,
      output,
    }),
  };
}


function recordRequirements(
  inputs: TraceInputs,
  resolutions: readonly NamedRequirementResolution[],
): void {
  for (const resolution of resolutions) {
    inputs[`requirement.${resolution.id}`] = { value: resolution.disposition };
  }
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


/*
 * Whether the input carries a character this resolver can read.
 *
 * Checked field by field before anything is dereferenced, because
 * `input.resolved.character.id` is three reads into a value a host supplied.
 * The requirement context is included: resolving a use gate reads it, and a
 * resolved character without one would throw inside the evaluator rather than
 * fail here.
 */
function readableResolvedCharacter(
  input: unknown,
): ResolvedCharacter | undefined {
  if (!isRecord(input)) return undefined;

  const resolved = input["resolved"];

  if (!isRecord(resolved)) return undefined;

  const character = resolved["character"];

  if (!isRecord(character)) return undefined;

  const id = character["id"];

  if (typeof id !== "string" || id.trim().length === 0) return undefined;

  if (!isRecord(resolved["requirementContext"])) return undefined;

  return resolved as unknown as ResolvedCharacter;
}


/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What happens when a character uses one owned entry.
 *
 * Pure. The input Character, its inventory, the entry, the definition and the
 * resolved character are never mutated, and nothing here throws: every
 * malformed value produces an EngineFailure carrying a trace of how far the
 * resolution got.
 */
export function resolveItemUse(
  input: ItemUseInput,
  getItemDefinition: ItemDefinitionLookup,
): EngineResult<ItemUseResolution> {
  const inputs: TraceInputs = {};

  /* ---------------------------------------------------------------------- */
  /* 1. The input and the resolved character                                */
  /* ---------------------------------------------------------------------- */

  const resolved = readableResolvedCharacter(input);

  if (resolved === undefined) {
    return engineFailure(traceOf(inputs, "input_invalid"), [
      structuralError(
        "equipment.use.input_invalid",
        "No readable resolved character, with a requirement context, was supplied to the Item use.",
      ),
    ]);
  }

  const character = resolved.character;

  inputs["characterId"] = { value: character.id };

  /* ---------------------------------------------------------------------- */
  /* 2. The owned entry                                                     */
  /* ---------------------------------------------------------------------- */

  const found = resolveInventoryItemRef(
    input.item,
    character.id,
    character.items,
  );

  if (!found.ok) {
    return engineFailure(traceOf(inputs, found.issue), [
      structuralError(
        REFERENCE_ERROR_CODES[found.issue],
        describeInventoryReferenceIssue(found.issue),
      ),
    ]);
  }

  const entry = found.entry;

  /* The reference is well-formed by now, so naming it in the trace is safe. */
  const item: InventoryItemRef = {
    characterId: character.id,
    entryId: entry.entryId,
  };

  inputs["entryId"] = { value: entry.entryId };
  inputs["quantityBefore"] = { value: entry.quantity };

  /* ---------------------------------------------------------------------- */
  /* 3-4. The definition                                                    */
  /* ---------------------------------------------------------------------- */

  const definition = getItemDefinition(entry.itemId);

  if (definition === undefined) {
    return engineFailure(traceOf(inputs, "item_unknown"), [
      structuralError(
        "equipment.use.item_unknown",
        `The entry names Item "${entry.itemId}", which no catalog defines.`,
        { actual: entry.itemId },
      ),
    ]);
  }

  inputs["itemId"] = { value: entry.itemId };

  /*
   * The SAME use-surface rules registration applies. A definition the catalog
   * would refuse must not be usable through a lookup a host supplied, and the
   * only way to keep that true is for both to ask one set of rules.
   *
   * Use surface only. A malformed passive Effect is a fault in how the Item
   * behaves while carried, not in what happens when it is used, and refusing
   * the use over it would let an unrelated authoring mistake block a
   * resolution that never reads it.
   */
  const definitionIssues = findItemUseDefinitionIssues(definition);

  if (definitionIssues.length > 0) {
    const described = definitionIssues.map(describeItemDefinitionIssue);

    return engineFailure(traceOf(inputs, "definition_invalid"), [
      structuralError(
        "equipment.use.definition_invalid",
        `Item "${entry.itemId}" ${described.join("; ")}.`,
        { actual: described[0] ?? "malformed" },
      ),
    ]);
  }

  const source: ContributionSourceRef = {
    type: "item",
    id: entry.itemId,
    instanceId: entry.entryId,
  };

  inputs["source"] = { value: contributionSourceKey(source) };

  /* ---------------------------------------------------------------------- */
  /* 5. Whether there is a use at all                                       */
  /* ---------------------------------------------------------------------- */

  if (!isActivelyUsableItem(definition)) {
    /*
     * A sword is not a potion because it exists. Reporting an `executed` use
     * of an Item that declares nothing to do would tell a caller an event
     * happened in which nothing happened.
     */
    return engineSuccess(
      { disposition: "not-usable", item },
      traceOf(inputs, "not-usable"),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Something to use                                                    */
  /* ---------------------------------------------------------------------- */

  if (entry.quantity <= 0) {
    /*
     * An ordinary state of an inventory — the last potion is gone — rather
     * than an error, and asked before the gate: there is nothing for a
     * requirement to let the character use.
     */
    return engineSuccess(
      {
        disposition: "quantity-unavailable",
        item,
        quantity: entry.quantity,
      },
      traceOf(inputs, "quantity-unavailable"),
    );
  }

  const consumes = definition.consumesOnUse === true;

  inputs["consumesOnUse"] = { value: consumes };

  /*
   * What a refusal reports: the use that was attempted, with nothing consumed.
   * See ItemUse for why a refusal carries facts rather than a proposal.
   */
  const attempted: ItemUse = {
    source,
    item,
    itemId: entry.itemId,
    quantityBefore: entry.quantity,
    quantityAfter: entry.quantity,
    consumed: 0,
  };

  /* ---------------------------------------------------------------------- */
  /* 7-8. The gate                                                          */
  /* ---------------------------------------------------------------------- */

  const requirements = resolveNamedRequirements(
    definition.useRequirements ?? [],
    resolved.requirementContext,
  );

  recordRequirements(inputs, requirements);

  const gate = namedRequirementDisposition(requirements);

  if (gate === "unsatisfied") {
    return engineSuccess(
      { disposition: "requirements-unsatisfied", use: attempted, requirements },
      traceOf(inputs, "requirements-unsatisfied"),
    );
  }

  if (gate === "unresolved") {
    /*
     * Different from unsatisfied on purpose. "The character does not meet
     * this" and "the sheet does not record what this asks about" are
     * different facts with different fixes.
     */
    return engineSuccess(
      { disposition: "requirements-unresolved", use: attempted, requirements },
      traceOf(inputs, "requirements-unresolved"),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 9. The Effects, once                                                   */
  /* ---------------------------------------------------------------------- */

  /*
   * One source, one list, one call — never once per unit in the stack. The
   * canonical resolver rather than the authored array, so every Effect in the
   * answer carries the entry it came from.
   */
  const effects = resolveRuleEffects([
    {
      source,
      effects: definition.useEffects ?? [],
    },
  ]);

  inputs["effects"] = { value: effects.effects.length };

  /* ---------------------------------------------------------------------- */
  /* 10-11. The decrement, and the one answer                               */
  /* ---------------------------------------------------------------------- */

  const consumed = consumes ? 1 : 0;

  const use: ItemUse = {
    ...attempted,
    quantityAfter: entry.quantity - consumed,
    consumed,
  };

  inputs["quantityAfter"] = { value: use.quantityAfter };

  return engineSuccess(
    {
      disposition: "executed",
      use,
      requirements,
      effects,
      nextCharacter: consumes ? withOneUnitConsumed(character, entry) : character,
    },
    traceOf(inputs, "executed"),
  );
}


/**
 * The same character with one unit gone from one entry.
 *
 * Order is preserved and every other entry is the object it already was. The
 * selected entry keeps its id and its Item; only its quantity changes, and its
 * state too when it was engaged and is now empty.
 *
 * Matched by entryId, and only the FIRST match — the one the reference
 * resolved to. Mapping every entry with that id would decrement two stacks if
 * a corrupt inventory repeated one, and matching by itemId would find the wrong
 * potion whenever a character carries two stacks of the same one.
 */
function withOneUnitConsumed(
  character: Character,
  selected: CharacterItem,
): Character {
  let replaced = false;

  const nextItems: readonly CharacterItem[] = (character.items ?? []).map(
    (candidate: unknown) => {
      if (
        replaced ||
        !isRecord(candidate) ||
        candidate["entryId"] !== selected.entryId
      ) {
        return candidate as CharacterItem;
      }

      replaced = true;

      const quantity = selected.quantity - 1;

      /*
       * An engaged entry must be exactly one object, and an empty one is none.
       * Returning it to carried in the same replacement is what keeps the
       * Character this hands back a valid one.
       */
      return quantity === 0 && isEquippedItemState(selected.state)
        ? { ...selected, quantity, state: "carried" }
        : { ...selected, quantity };
    },
  );

  return { ...character, items: nextItems };
}
