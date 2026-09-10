/*
 * Putting an Item on, and taking it off.
 *
 * One pure function answers both, because they are the same question asked of
 * different destinations: `held` and `worn` are equip, `carried` is unequip,
 * and every legal pair of states is one of those two. Writing equip() and
 * unequip() separately would have produced two places that look up an entry,
 * two that validate a destination, and eventually two answers to what
 * `held → worn` means — which is an equip, and is exactly the transition a
 * pair of separate functions has no obvious home for.
 *
 *
 * REQUIREMENTS ARE ASKED AT THE TRANSITION AND NEVER AGAIN
 *
 * This is the load-bearing decision in the file, and the tempting alternative
 * is wrong in a way that is hard to see.
 *
 * It would be easy to re-evaluate `equipRequirements` during character
 * resolution: an Item whose gate no longer holds would stop contributing, or
 * quietly revert to carried, and the sheet would always be "correct". That
 * makes resolveCharacter() a function that WRITES — a read that changes stored
 * state — and it makes a character's equipment depend on the order in which
 * facts were entered. Lose the Trait for one round to a Condition and the
 * armour falls off; regain it and the character is somehow still undressed,
 * because nothing put it back.
 *
 * So the gate is a moment, not a condition. Losing a requirement afterwards
 * leaves the Item held and its equippedEffects live, and only the NEXT equip
 * attempt is refused. An Item that must keep requiring something in order to
 * FUNCTION is describing a different mechanic — a use requirement, or an
 * active contribution rule — and should say so rather than borrowing this one.
 *
 *
 * WHAT THIS RETURNS
 *
 * Two different kinds of "no", kept apart deliberately.
 *
 * A rule refusing the attempt is a successful answer: the engine was asked
 * whether the character may put the sword in their hand, it worked out that
 * they may not, and that is the result. Those are DISPOSITIONS inside an
 * EngineSuccess — already-in-state, not-concrete-object, requirements-
 * unsatisfied, requirements-unresolved — and a caller renders them to a
 * player.
 *
 * A malformed input is a failure: a destination that is not a state, a
 * reference to nothing, a corrupt entry. Those are EngineErrors, they are
 * addressed to a developer, and collapsing them into a disposition would tell
 * a player "you cannot equip that" when the truth is that the host asked the
 * wrong question.
 *
 *
 * WHAT IT DOES NOT DO
 *
 * It does not touch Effects. The transition changes one stored field and hands
 * back a new Character; equippedEffects appear and disappear because
 * resolveCharacter() reads the new state, exactly as they would if a host had
 * edited the sheet by hand. A transition that added or removed modifiers
 * itself would be a second implementation of effect resolution, and the two
 * would disagree the first time an Item's Effects changed.
 *
 * It also does not commit anything. There is no Action cost, no runtime
 * request, no coordinator, and no persistence: the caller receives a
 * replacement Character and decides what to do with it. Slots, hands,
 * conflicts, dual-wielding and replacement policies are all absent, so
 * equipping a second sword is currently permitted — that is an honest gap
 * rather than a rule, and the mechanic that closes it does not exist yet.
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
  type NamedRequirementResolution,
} from "../rules/resolution";
import { findNamedRequirementsValidationIssues } from "../rules/validation";

import type { Character } from "../types";
import type { ResolvedCharacter } from "../resolution";

import { resolveInventoryItemRef, type InventoryItemRef } from "./references";
import { isConcreteInventoryObject, isEquippedItemState, isItemEquipmentState, type ItemEquipmentState } from "./state";
import { isItemInventoryMode, type CharacterItem, type ItemDefinition } from "./types";


/* -------------------------------------------------------------------------- */
/* Contract                                                                   */
/* -------------------------------------------------------------------------- */

export interface EquipmentTransitionInput {
  /**
   * The character as they stand BEFORE the transition.
   *
   * Resolved rather than authored, because equip requirements are asked of the
   * resolved view — a Trait granted by a Species satisfies a requirement for
   * it exactly as one taken directly does — and because the caller almost
   * always has a resolved character already.
   */
  readonly resolved: ResolvedCharacter;

  /** Which owned object. Never an index, never a bare itemId. */
  readonly item: InventoryItemRef;

  readonly destination: ItemEquipmentState;
}


/** What a permitted transition would be. */
export interface EquipmentTransition {
  /**
   * Both identities, as everywhere else in the Item domain: the definition is
   * what a player recognises and a requirement asks about, the instance is
   * which of two identical swords this is.
   */
  readonly source: ContributionSourceRef;

  readonly item: InventoryItemRef;
  readonly itemId: string;

  readonly from: ItemEquipmentState;
  readonly to: ItemEquipmentState;

  readonly kind: EquipmentTransitionKind;
}


export const EQUIPMENT_TRANSITION_KINDS = ["equip", "unequip"] as const;

export type EquipmentTransitionKind =
  typeof EQUIPMENT_TRANSITION_KINDS[number];


/**
 * Which of the two a destination describes.
 *
 * Read off the DESTINATION alone, never off the pair. `held → worn` and
 * `carried → worn` are both equips and are gated identically, because what
 * makes a transition an equip is that the character ends up wearing the thing
 * — not that they were not wearing something before. A rule derived from the
 * pair would have to enumerate six cases and would get `held → worn` wrong the
 * first time somebody wrote it out.
 */
export function equipmentTransitionKind(
  destination: ItemEquipmentState,
): EquipmentTransitionKind {
  return isEquippedItemState(destination) ? "equip" : "unequip";
}


export type EquipmentTransitionResolution =
  | {
      readonly disposition: "available";
      readonly transition: EquipmentTransition;
      readonly requirements: readonly NamedRequirementResolution[];
      readonly nextCharacter: Character;
    }
  | {
      readonly disposition: "already-in-state";
      readonly item: InventoryItemRef;
      readonly state: ItemEquipmentState;
    }
  | {
      readonly disposition: "not-concrete-object";
      readonly item: InventoryItemRef;
      readonly quantity: number;
    }
  | {
      readonly disposition: "requirements-unsatisfied";
      readonly transition: EquipmentTransition;
      readonly requirements: readonly NamedRequirementResolution[];
    }
  | {
      readonly disposition: "requirements-unresolved";
      readonly transition: EquipmentTransition;
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
 * The reference issues from 4.1, each with its own code.
 *
 * `entry_unknown` and `entry_invalid` stay separate all the way out to the
 * diagnostic, because the object being GONE and the object being CORRUPT lead
 * to opposite fixes — drop the line, or repair it — and one code would invite
 * the wrong one.
 */
const REFERENCE_ERROR_CODES = {
  "invalid-reference": "equipment.transition.reference_invalid",
  "character-mismatch": "equipment.transition.character_mismatch",
  "unknown-entry": "equipment.transition.entry_unknown",
  "invalid-entry": "equipment.transition.entry_invalid",
} as const;

const REFERENCE_ERROR_MESSAGES = {
  "invalid-reference":
    "The inventory reference is not a well-formed { characterId, entryId }.",
  "character-mismatch":
    "The inventory reference names a different character than the one supplied.",
  "unknown-entry":
    "The character owns no inventory entry with that id.",
  "invalid-entry":
    "The named inventory entry is present but structurally invalid.",
} as const;


/* -------------------------------------------------------------------------- */
/* Trace                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The trace is assembled as facts become SAFE to state.
 *
 * Nothing is recorded before it has been validated, which is the whole reason
 * this is a mutable bag rather than one object literal at the end: a trace
 * built up front would have to put the caller's unvalidated destination and
 * entry id into it, and a trace is precisely the thing that gets serialized
 * into a bug report and a golden snapshot. A malformed value reaching it is a
 * malformed value reaching every consumer downstream.
 */
function traceOf(inputs: TraceInputs, output: JsonValue): EngineTrace {
  return {
    root: createTraceNode({
      id: "character.equipment.transition",
      label: "Resolve Equipment Transition",
      formula:
        "destination decides equip or unequip; equip evaluates equipRequirements at transition time",
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


/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether a character may move one owned object into a given state, and the
 * Character they would have if they did.
 *
 * Pure. The input Character and its inventory are never mutated, and nothing
 * here throws: every malformed value produces an EngineFailure carrying a
 * trace of how far the resolution got.
 */
export function resolveEquipmentTransition(
  input: EquipmentTransitionInput,
  getItemDefinition: (itemId: string) => ItemDefinition | undefined,
): EngineResult<EquipmentTransitionResolution> {
  const inputs: TraceInputs = {};

  /* ---------------------------------------------------------------------- */
  /* 0. The input itself                                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * Guarded before anything is read off it. `input.resolved.character` is
   * three dereferences into a value a host supplied, and a validator that
   * checked the destination first would have thrown on the way to the check.
   */
  const resolved = (input ?? {}).resolved as ResolvedCharacter | undefined;
  const character = resolved?.character;

  if (
    resolved === undefined ||
    typeof character !== "object" ||
    character === null ||
    typeof character.id !== "string"
  ) {
    return engineFailure(traceOf(inputs, "definition_invalid"), [
      structuralError(
        "equipment.transition.definition_invalid",
        "No resolved character was supplied to the transition.",
      ),
    ]);
  }

  inputs["characterId"] = { value: character.id };

  /* ---------------------------------------------------------------------- */
  /* 1. Destination                                                         */
  /* ---------------------------------------------------------------------- */

  const destination = input.destination;

  if (!isItemEquipmentState(destination)) {
    return engineFailure(traceOf(inputs, "destination_invalid"), [
      structuralError(
        "equipment.transition.destination_invalid",
        "The requested destination is not an equipment state.",
        {
          required: "carried, held or worn",
          actual: describeValue(destination),
        },
      ),
    ]);
  }

  inputs["destination"] = { value: destination };

  /* ---------------------------------------------------------------------- */
  /* 2-3. The owned object                                                  */
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
        REFERENCE_ERROR_MESSAGES[found.issue],
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
  inputs["from"] = { value: entry.state };

  /* ---------------------------------------------------------------------- */
  /* 4-5. The definition                                                    */
  /* ---------------------------------------------------------------------- */

  const definition = getItemDefinition(entry.itemId);

  if (definition === undefined) {
    return engineFailure(traceOf(inputs, "item_unknown"), [
      structuralError(
        "equipment.transition.item_unknown",
        `The entry names Item "${entry.itemId}", which no catalog defines.`,
        { actual: entry.itemId },
      ),
    ]);
  }

  inputs["itemId"] = { value: definition.id };

  /*
   * A definition whose own equip gate is malformed cannot be evaluated, and
   * guessing past it would be the engine deciding a rule the author did not
   * write. Reported as a structural failure rather than a refusal, because the
   * character has done nothing wrong.
   */
  const definitionIssues = [
    ...(isItemInventoryMode(definition.inventoryMode)
      ? []
      : ["inventoryMode"]),
    ...findNamedRequirementsValidationIssues(
      definition.equipRequirements,
      "equipRequirements",
    ).map((issue) => `${issue.type} at ${issue.path}`),
  ];

  const firstDefinitionIssue = definitionIssues[0];

  if (firstDefinitionIssue !== undefined) {
    return engineFailure(traceOf(inputs, "definition_invalid"), [
      structuralError(
        "equipment.transition.definition_invalid",
        `Item "${definition.id}" is malformed: ${definitionIssues.join("; ")}.`,
        { actual: firstDefinitionIssue },
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
  /* 6. Already there                                                       */
  /* ---------------------------------------------------------------------- */

  if (entry.state === destination) {
    /*
     * A disposition rather than a failure or a silent success. Nothing is
     * wrong and nothing needs doing, and returning the unchanged Character as
     * `available` would let a caller spend an Action on a no-op.
     */
    return engineSuccess(
      { disposition: "already-in-state", item, state: destination },
      traceOf(inputs, "already-in-state"),
    );
  }

  const kind = equipmentTransitionKind(destination);

  inputs["kind"] = { value: kind };

  const transition: EquipmentTransition = {
    source,
    item,
    itemId: entry.itemId,
    from: entry.state,
    to: destination,
    kind,
  };

  /* ---------------------------------------------------------------------- */
  /* 7. One object, or none                                                 */
  /* ---------------------------------------------------------------------- */

  if (kind === "equip" && !isConcreteInventoryObject(entry)) {
    /*
     * A stack of three arrows cannot be "the arrow in the hand", and an
     * emptied entry is nothing to hold at all. Both are ordinary states of an
     * inventory rather than errors, so both are dispositions — and both are
     * answered by the same rule, since the quantity that makes an entry an
     * object is exactly one.
     */
    return engineSuccess(
      {
        disposition: "not-concrete-object",
        item,
        quantity: entry.quantity,
      },
      traceOf(inputs, "not-concrete-object"),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 8-9. The gate                                                          */
  /* ---------------------------------------------------------------------- */

  /*
   * Unequipping asks nothing. A character who no longer meets the requirement
   * that let them put the armour on must still be able to take it off, and a
   * gate on the way out would trap them in it.
   */
  const requirements = kind === "equip"
    ? resolveNamedRequirements(
        definition.equipRequirements ?? [],
        resolved.requirementContext,
      )
    : [];

  recordRequirements(inputs, requirements);

  const gate = namedRequirementDisposition(requirements);

  if (gate === "unsatisfied") {
    return engineSuccess(
      { disposition: "requirements-unsatisfied", transition, requirements },
      traceOf(inputs, "requirements-unsatisfied"),
    );
  }

  if (gate === "unresolved") {
    /*
     * Different from unsatisfied on purpose. "The character does not meet this"
     * and "the sheet does not record what this asks about" are different facts
     * with different fixes, and reporting the second as the first tells a
     * player they failed a test nobody ran.
     */
    return engineSuccess(
      { disposition: "requirements-unresolved", transition, requirements },
      traceOf(inputs, "requirements-unresolved"),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 10. The replacement character                                          */
  /* ---------------------------------------------------------------------- */

  return engineSuccess(
    {
      disposition: "available",
      transition,
      requirements,
      nextCharacter: withEntryState(character, entry.entryId, destination),
    },
    traceOf(inputs, "available"),
  );
}


/**
 * The same character with one entry in a new state.
 *
 * Order is preserved, every other entry is the object it already was, and the
 * selected entry keeps its id, its Item and its quantity — a transition moves
 * an object between states and is not a place for anything else to change.
 * Mapping rather than splicing is what keeps another entry of the SAME Item
 * untouched: two gauntlets differ only by entryId, and any lookup by itemId
 * would have found the wrong one.
 */
function withEntryState(
  character: Character,
  entryId: string,
  destination: ItemEquipmentState,
): Character {
  const nextItems: readonly CharacterItem[] = (character.items ?? []).map(
    (candidate) =>
      candidate.entryId === entryId
        ? { ...candidate, state: destination }
        : candidate,
  );

  return { ...character, items: nextItems };
}


/**
 * Renders a value that was not the type it should have been.
 *
 * A diagnostic's `actual` is JsonValue and reaches a bug report, so an object,
 * a NaN and an undefined have to arrive as something distinguishable rather
 * than as three spellings of nothing.
 */
function describeValue(value: unknown): JsonValue {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (value === null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (value === undefined) return "undefined";

  return Array.isArray(value) ? "a list" : "a value of the wrong kind";
}
