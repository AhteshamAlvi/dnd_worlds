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
 * ZERO IS AUTHORITATIVE, AND BANDS ARE A PARTITION
 *
 * Two rules added by the Phase 4 repair, and both are about content being
 * unable to talk its way out of a consequence.
 *
 * Zero integrity resolves to `zeroBehavior` and nothing else. A band claiming
 * `{ state: "intact", minimum: 0, maximum: 10 }` used to win by being
 * authored first, which made a broken Item report itself whole and kept every
 * downstream gate open. Bands narrow the range ABOVE zero; they never relabel
 * the bottom of it.
 *
 * Bands may not overlap, may not leave their Item's range, and may not repeat
 * a state. `resolveIntegrityState()` used to take the FIRST authored match,
 * so two bands claiming one figure made the derived state depend on the order
 * a list happened to be written in — a fact about the file rather than about
 * the object. With overlap refused, first-match and any-match are the same
 * answer, and the resolver picks the lowest matching minimum so that even
 * content that somehow evaded validation still resolves order-independently.
 *
 *
 * WHAT ZERO DOES TO THE ITEM
 *
 * `resolveItemFunctionality()` is the one place that answers it. A broken or
 * destroyed Item contributes nothing — it fills no implement role, offers no
 * attack or defense fact, cannot be used, and its possessed and equipped
 * Effects stop — unless its own `brokenBehavior` explicitly says otherwise.
 * The exception is authored per channel and never inferred: a curse that
 * outlives the idol it was carved into is a decision an author makes, and
 * reading "this Effect is negative, so it probably survives" off an amount's
 * sign would be the engine inventing a rule out of arithmetic.
 *
 *
 * WHAT THIS FILE DOES NOT DO
 *
 * It does not decide how much stress an attack deals — that is the owning
 * combat mechanic's question, handed to this file as an amount. It does not
 * remove a destroyed Item from the inventory: quantity is a separate fact,
 * and a destroyed sword is still a line on the sheet, at zero, contributing
 * whatever its `brokenBehavior` permits. And it does not implement Shū
 * protection: `mitigation` is a figure a caller already resolved, honoured
 * here and calculated nowhere in this file — the seam a future whole-Item
 * enhancement pays into, not the enhancement.
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
import {
  ITEM_DEFINITION_OUTCOME_CODES,
  describeItemDefinitionOutcome,
  resolveItemDefinition,
  type ItemDefinitionLookup,
} from "./validation";


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


/** Whether a derived state means the Item has stopped being a working object. */
export function isBrokenIntegrityState(state: ItemIntegrityState): boolean {
  return state === "broken" || state === "destroyed";
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
 *
 * Bands PARTITION the range: each must lie inside `[0, maximum]`, no two may
 * overlap, and no state may be claimed twice. See this file's header for why
 * a first-authored-match rule was not good enough.
 */
export interface ItemIntegrityBand {
  readonly state: ItemIntegrityState;
  readonly minimum: number;
  readonly maximum: number;
  readonly effects?: readonly Effect[];
}


/**
 * What a broken or destroyed Item is still allowed to do.
 *
 * Every flag defaults to FALSE and every omission means "stops". That
 * direction is the whole point: an Item that reached zero is not a working
 * object, and an author who wants one of its channels to outlive breakage has
 * to say which one. The alternative — persisting whatever looks like a
 * penalty — would make the engine read intent off the sign of a number.
 *
 * `persistentEffects` names CHANNELS rather than individual Effects because
 * an `Effect` has no identity to name: the vocabulary is `{ type, ... }` with
 * no id, so "this curse survives, that blessing does not" is expressible only
 * at the granularity the model actually has. An author who needs a finer
 * split writes two Items, or moves the surviving Effect to the channel that
 * survives.
 */
export interface BrokenItemBehavior {
  /** May still fill an authored implement role. */
  readonly selectableAsImplement?: boolean;

  /** Still contributes its `attack` fact when selected. */
  readonly attackAvailable?: boolean;

  /** Still contributes its `defense` fact when selected. */
  readonly defenseAvailable?: boolean;

  /** May still be used — its use gate, use Effects and consumption. */
  readonly useAvailable?: boolean;

  /** Which passive Effect channels keep applying. */
  readonly persistentEffects?: readonly ItemPassiveEffectChannel[];
}


export const ITEM_PASSIVE_EFFECT_CHANNELS = ["possessed", "equipped"] as const;

export type ItemPassiveEffectChannel =
  typeof ITEM_PASSIVE_EFFECT_CHANNELS[number];


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
   * Whether a `"destroyed"` Item sitting at zero may be restored after all.
   *
   * The explicit authored exception the terminal rule refers to. Absent or
   * false means gone is gone; true means this particular Item's contract says
   * a destroyed one can be rebuilt, and `repairable` still has to agree.
   */
  readonly restorableWhenDestroyed?: boolean;

  /**
   * Named ranges of integrity. Omitted means the only derived states are
   * "intact" (integrity > 0) and whatever `zeroBehavior` names (integrity
   * <= 0) — the two-band default every durable Item gets for free.
   */
  readonly bands?: readonly ItemIntegrityBand[];

  /**
   * What this Item still does once it is broken or destroyed. Omitted means
   * nothing — see `BrokenItemBehavior`.
   */
  readonly brokenBehavior?: BrokenItemBehavior;
}


/* -------------------------------------------------------------------------- */
/* Structural validation                                                      */
/* -------------------------------------------------------------------------- */

/*
 * A RECORD, and an array is not one.
 *
 * `[]` is `typeof "object"` and not null, so the old guard let an array
 * through as a well-formed object with none of the fields set — which read as
 * "an attack contribution that declares nothing", a perfectly legal thing to
 * author, rather than as the malformed value it is.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function integrityError(
  code: string,
  message: string,
  required: NonNullable<EngineError["required"]>,
  actual: unknown,
): EngineError {
  return {
    code,
    message,
    audience: "developer",
    required,
    actual: typeof actual === "string" ? actual : String(actual),
  };
}


/**
 * Everything wrong with one authored band.
 *
 * Takes `unknown` and proves the record before reading a field off it:
 * `bands: [null]` used to reach `band.state` and throw out of the validator
 * written to complain about it. `maximumIntegrity` is passed in so a band can
 * be checked against the range it is supposed to partition — a band ending at
 * 40 on an Item that tops out at 10 names integrity the Item can never hold.
 */
export function findItemIntegrityBandIssues(
  value: unknown,
  maximumIntegrity?: number,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [integrityError(
      "equipment.integrity.band.invalid",
      "An integrity band must be an object.",
      "an ItemIntegrityBand object",
      value,
    )];
  }

  const errors: EngineError[] = [];
  const band = value as Partial<Record<keyof ItemIntegrityBand, unknown>>;

  if (!isItemIntegrityState(band.state)) {
    errors.push(integrityError(
      "equipment.integrity.band.state.invalid",
      "An integrity band must name a known state.",
      [...ITEM_INTEGRITY_STATES],
      band.state,
    ));
  }

  const minimum = band.minimum;
  const maximum = band.maximum;

  const minimumIsFinite = typeof minimum === "number" && Number.isFinite(minimum);
  const maximumIsFinite = typeof maximum === "number" && Number.isFinite(maximum);

  if (!minimumIsFinite) {
    errors.push(integrityError(
      "equipment.integrity.band.minimum.invalid",
      "An integrity band's minimum must be a finite number.",
      "finite number",
      minimum,
    ));
  } else if (minimum < 0) {
    errors.push(integrityError(
      "equipment.integrity.band.minimum.negative",
      "An integrity band may not begin below zero.",
      ">= 0",
      minimum,
    ));
  }

  if (!maximumIsFinite) {
    errors.push(integrityError(
      "equipment.integrity.band.maximum.invalid",
      "An integrity band's maximum must be a finite number.",
      "finite number",
      maximum,
    ));
  } else {
    if (minimumIsFinite && maximum < minimum) {
      errors.push(integrityError(
        "equipment.integrity.band.inverted",
        "An integrity band's maximum is below its minimum.",
        `>= ${minimum}`,
        maximum,
      ));
    }

    if (
      maximumIntegrity !== undefined &&
      Number.isFinite(maximumIntegrity) &&
      maximum > maximumIntegrity
    ) {
      errors.push(integrityError(
        "equipment.integrity.band.out-of-range",
        "An integrity band reaches past the Item's maximum integrity.",
        `<= ${maximumIntegrity}`,
        maximum,
      ));
    }
  }

  if (band.effects !== undefined) {
    if (!Array.isArray(band.effects)) {
      errors.push(integrityError(
        "equipment.integrity.band.effects.invalid",
        "An integrity band's effects must be a list.",
        "array of Effects",
        band.effects,
      ));
    } else {
      for (const issue of findEffectsValidationIssues(band.effects, "effects")) {
        errors.push(integrityError(
          `equipment.integrity.band.effects.${issue.type}`,
          `An integrity band's Effect at ${issue.path} is malformed: ${issue.type}.`,
          "a well-formed Effect",
          issue.path,
        ));
      }
    }
  }

  return errors;
}


function findBrokenBehaviorIssues(value: unknown): readonly EngineError[] {
  if (value === undefined) return [];

  if (!isRecord(value)) {
    return [integrityError(
      "equipment.integrity.broken-behavior.invalid",
      "An Item's brokenBehavior must be an object.",
      "a BrokenItemBehavior object",
      value,
    )];
  }

  const errors: EngineError[] = [];
  const behavior = value as Partial<Record<keyof BrokenItemBehavior, unknown>>;

  for (const flag of [
    "selectableAsImplement",
    "attackAvailable",
    "defenseAvailable",
    "useAvailable",
  ] as const) {
    const declared = behavior[flag];

    if (declared !== undefined && typeof declared !== "boolean") {
      errors.push(integrityError(
        `equipment.integrity.broken-behavior.${flag}.invalid`,
        `A brokenBehavior's ${flag} must be true or false when present.`,
        "boolean, or omit the field",
        declared,
      ));
    }
  }

  const channels = behavior.persistentEffects;

  if (channels !== undefined) {
    if (!Array.isArray(channels)) {
      errors.push(integrityError(
        "equipment.integrity.broken-behavior.persistent-effects.invalid",
        "A brokenBehavior's persistentEffects must be a list of channels.",
        [...ITEM_PASSIVE_EFFECT_CHANNELS],
        channels,
      ));
    } else {
      const seen = new Set<string>();

      for (const channel of channels as readonly unknown[]) {
        if (
          typeof channel !== "string" ||
          !(ITEM_PASSIVE_EFFECT_CHANNELS as readonly string[]).includes(channel)
        ) {
          errors.push(integrityError(
            "equipment.integrity.broken-behavior.persistent-effects.unknown",
            "A brokenBehavior names an unknown passive Effect channel.",
            [...ITEM_PASSIVE_EFFECT_CHANNELS],
            channel,
          ));

          continue;
        }

        if (seen.has(channel)) {
          errors.push(integrityError(
            "equipment.integrity.broken-behavior.persistent-effects.duplicate",
            `A brokenBehavior names the "${channel}" channel more than once.`,
            "each channel named once",
            channel,
          ));

          continue;
        }

        seen.add(channel);
      }
    }
  }

  return errors;
}


/**
 * Every structural fault in one Item's integrity policy.
 *
 * Takes `unknown`, proves every compound field before reading it, and refuses
 * OVERLAP — which this validator used to permit on the theory that
 * `resolveIntegrityState()` would settle it by taking the first authored
 * match. That made the derived state a fact about list order. See the file
 * header.
 */
export function findItemIntegrityIssues(
  value: unknown,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [integrityError(
      "equipment.integrity.invalid",
      "An Item's integrity policy must be an object.",
      "an ItemIntegrityDefinition object",
      value,
    )];
  }

  const errors: EngineError[] = [];
  const definition = value as Partial<Record<keyof ItemIntegrityDefinition, unknown>>;

  const maximum = definition.maximum;
  const maximumIsSound =
    typeof maximum === "number" && Number.isFinite(maximum) && maximum > 0;

  if (!maximumIsSound) {
    errors.push(integrityError(
      "equipment.integrity.maximum.invalid",
      "An Item's maximum integrity must be a finite number greater than zero.",
      "finite number > 0",
      maximum,
    ));
  }

  if (typeof definition.repairable !== "boolean") {
    errors.push(integrityError(
      "equipment.integrity.repairable.invalid",
      "An Item's integrity policy must state repairable as true or false.",
      "boolean",
      definition.repairable,
    ));
  }

  if (
    definition.zeroBehavior !== "broken" &&
    definition.zeroBehavior !== "destroyed"
  ) {
    errors.push(integrityError(
      "equipment.integrity.zero-behavior.invalid",
      "An Item's zeroBehavior must be \"broken\" or \"destroyed\".",
      ["broken", "destroyed"],
      definition.zeroBehavior,
    ));
  }

  if (
    definition.restorableWhenDestroyed !== undefined &&
    typeof definition.restorableWhenDestroyed !== "boolean"
  ) {
    errors.push(integrityError(
      "equipment.integrity.restorable.invalid",
      "An Item's restorableWhenDestroyed must be true or false when present.",
      "boolean, or omit the field",
      definition.restorableWhenDestroyed,
    ));
  }

  errors.push(...findBrokenBehaviorIssues(definition.brokenBehavior));

  if (definition.bands !== undefined) {
    if (!Array.isArray(definition.bands)) {
      errors.push(integrityError(
        "equipment.integrity.bands.invalid",
        "An Item's integrity bands must be a list.",
        "array of ItemIntegrityBand",
        definition.bands,
      ));

      return errors;
    }

    const sound: ItemIntegrityBand[] = [];
    const states = new Set<string>();

    for (const candidate of definition.bands as readonly unknown[]) {
      const bandIssues = findItemIntegrityBandIssues(
        candidate,
        maximumIsSound ? maximum : undefined,
      );

      errors.push(...bandIssues);

      if (bandIssues.length > 0) continue;

      const band = candidate as ItemIntegrityBand;

      if (states.has(band.state)) {
        errors.push(integrityError(
          "equipment.integrity.band.state.duplicate",
          `Integrity state "${band.state}" is claimed by more than one band.`,
          "each state claimed by at most one band",
          band.state,
        ));
      }

      states.add(band.state);
      sound.push(band);
    }

    /*
     * Overlap is checked on the SOUND bands only — a band whose bounds are not
     * numbers has already been reported, and comparing it here would produce a
     * second complaint about the same fault in a vocabulary the author cannot
     * act on.
     */
    for (const [index, band] of sound.entries()) {
      for (const other of sound.slice(index + 1)) {
        if (band.minimum <= other.maximum && other.minimum <= band.maximum) {
          errors.push(integrityError(
            "equipment.integrity.bands.overlap",
            `Integrity bands "${band.state}" and "${other.state}" both claim the same integrity.`,
            "non-overlapping bands",
            `[${band.minimum}, ${band.maximum}] and [${other.minimum}, ${other.maximum}]`,
          ));
        }
      }
    }
  }

  return errors;
}


/**
 * The previous name, kept as the alias the rest of the engine already calls.
 *
 * One implementation, two names, and the second is going nowhere near a
 * second body: `findItemIntegrityDefinitionIssues` is what `validation.ts` and
 * the public barrel already import, and renaming every call site would be a
 * diff about spelling rather than about behaviour.
 */
export const findItemIntegrityDefinitionIssues = findItemIntegrityIssues;


/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The band governing a given figure, chosen without reference to list order.
 *
 * LOWEST matching minimum, then lowest maximum, rather than first authored.
 * Validation refuses overlap, so for sound content there is at most one match
 * and the tie-break never runs; it exists so that content which reached this
 * function some other way — a host's lookup, a partially-validated fixture —
 * still resolves to the same band whichever order its list happens to be in.
 */
export function currentIntegrityBand(
  definition: ItemIntegrityDefinition,
  integrity: number,
): ItemIntegrityBand | undefined {
  const matches = (definition.bands ?? []).filter(
    (band) => integrity >= band.minimum && integrity <= band.maximum,
  );

  if (matches.length === 0) return undefined;

  return [...matches].sort(
    (left, right) =>
      left.minimum - right.minimum || left.maximum - right.maximum,
  )[0];
}


/**
 * Which named state a given integrity figure falls in, for this Item.
 *
 * ZERO FIRST, and this is the rule bands cannot argue with: a non-positive
 * figure is whatever `zeroBehavior` names, whatever any band claims about the
 * bottom of the range. Above zero the governing band decides, and with none
 * matching the figure is "intact" — the two-state default every durable Item
 * gets with no bands written at all.
 */
export function resolveIntegrityState(
  definition: ItemIntegrityDefinition,
  integrity: number,
): ItemIntegrityState {
  if (!(integrity > 0)) return definition.zeroBehavior;

  return currentIntegrityBand(definition, integrity)?.state ?? "intact";
}


/**
 * What an Item can still do, at the integrity it currently has.
 *
 * The ONE answer to "does this broken sword still swing", asked by implement
 * selection, by contribution resolution, by the use resolver and by passive
 * Effect collection. A second copy of the rule in any of them is how an Item
 * ends up refused as an implement and still contributing an attack.
 *
 * A non-durable Item is fully functional by definition: it has no integrity
 * to lose, and answering anything else would make "declares no integrity
 * policy" mean "is permanently broken".
 */
export interface ItemFunctionality {
  readonly state: ItemIntegrityState;

  /** True once the derived state is "broken" or "destroyed". */
  readonly broken: boolean;

  readonly selectableAsImplement: boolean;
  readonly attackAvailable: boolean;
  readonly defenseAvailable: boolean;
  readonly useAvailable: boolean;
  readonly possessedEffectsApply: boolean;
  readonly equippedEffectsApply: boolean;
}


const FULLY_FUNCTIONAL: ItemFunctionality = {
  state: "intact",
  broken: false,
  selectableAsImplement: true,
  attackAvailable: true,
  defenseAvailable: true,
  useAvailable: true,
  possessedEffectsApply: true,
  equippedEffectsApply: true,
};


export function resolveItemFunctionality(
  definition: ItemDefinition,
  integrity: number | undefined,
): ItemFunctionality {
  const policy = definition.integrity;

  if (policy === undefined) return FULLY_FUNCTIONAL;

  const current = integrity ?? policy.maximum;
  const state = resolveIntegrityState(policy, current);

  if (!isBrokenIntegrityState(state)) {
    return { ...FULLY_FUNCTIONAL, state, broken: false };
  }

  const behavior = policy.brokenBehavior;
  const persistent = behavior?.persistentEffects ?? [];

  return {
    state,
    broken: true,
    selectableAsImplement: behavior?.selectableAsImplement === true,
    attackAvailable: behavior?.attackAvailable === true,
    defenseAvailable: behavior?.defenseAvailable === true,
    useAvailable: behavior?.useAvailable === true,
    possessedEffectsApply: persistent.includes("possessed"),
    equippedEffectsApply: persistent.includes("equipped"),
  };
}


/** The integrity an entry currently reads as, for a durable Item. */
export function currentEntryIntegrity(
  definition: ItemDefinition,
  entry: Pick<CharacterItem, "integrity">,
): number | undefined {
  return definition.integrity === undefined
    ? undefined
    : entry.integrity ?? definition.integrity.maximum;
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
       * figure is supplied, because a caller argument may not make an
       * incompatible Item compatible. `undefined` means no protection was
       * offered.
       */
      readonly mitigation?: number;
    }
  | { readonly type: "repair"; readonly amount: number };


export const ITEM_INTEGRITY_OPERATION_TYPES = ["stress", "repair"] as const;


/**
 * Everything wrong with one integrity operation.
 *
 * Takes `unknown`, and every rule here closes a way a malformed operation
 * used to become a real one. An unknown discriminant fell through to the
 * repair branch and skipped the repairability gate entirely. A negative
 * amount was normalised with `Math.abs()`, so "repair -5" quietly became
 * "repair 5" — a caller's sign error turned into free maintenance. A zero
 * amount reported an applied change in which nothing changed. And a
 * mitigation of `NaN` turned every effective stress into `NaN`, which then
 * clamped to a perfectly innocent-looking figure.
 */
export function findItemIntegrityOperationIssues(
  value: unknown,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [integrityError(
      "equipment.integrity.operation.invalid",
      "An integrity operation must be an object.",
      "an ItemIntegrityOperation object",
      value,
    )];
  }

  const operation = value as Partial<Record<"type" | "amount" | "mitigation", unknown>>;
  const errors: EngineError[] = [];

  if (
    operation.type !== "stress" &&
    operation.type !== "repair"
  ) {
    errors.push(integrityError(
      "equipment.integrity.operation.type.invalid",
      "An integrity operation must be a stress or a repair.",
      [...ITEM_INTEGRITY_OPERATION_TYPES],
      operation.type,
    ));
  }

  const amount = operation.amount;

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    errors.push(integrityError(
      "equipment.integrity.operation.amount.invalid",
      "An integrity operation's amount must be a finite number greater than zero.",
      "finite number > 0",
      amount,
    ));
  }

  const mitigation = operation.mitigation;

  if (mitigation !== undefined) {
    if (operation.type !== "stress") {
      errors.push(integrityError(
        "equipment.integrity.operation.mitigation.not-applicable",
        "Only a stress operation may carry mitigation.",
        "mitigation on a stress operation, or omit the field",
        operation.type,
      ));
    }

    if (
      typeof mitigation !== "number" ||
      !Number.isFinite(mitigation) ||
      mitigation < 0
    ) {
      errors.push(integrityError(
        "equipment.integrity.operation.mitigation.invalid",
        "An integrity operation's mitigation must be a finite, non-negative number.",
        "finite number >= 0, or omit the field",
        mitigation,
      ));
    }
  }

  return errors;
}


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

  /**
   * The stress this change was asked for and the stress it actually applied,
   * after mitigation — the seam a future whole-Item Shū enhancement pays
   * into, made observable rather than folded into `integrityAfter`.
   *
   * Present on a stress change only. `mitigated` is what the mitigation
   * actually removed, which is zero for an `"incompatible"` Item however much
   * was offered.
   */
  readonly stress?: {
    readonly requested: number;
    readonly mitigated: number;
    readonly effective: number;
  };
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
        "effective stress is max(0, amount - mitigation); stress subtracts, repair adds, clamped to [0, maximum]; state is derived from the result, never stored",
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
 *
 * Both figures are returned rather than only the difference, because the
 * subtraction is the observable seam: a trace, an event and a test all need
 * to see that protection was offered, whether it applied, and what it left.
 */
export function resolveEffectiveStress(
  shuInteraction: ItemDefinition["shuInteraction"],
  operation: { readonly amount: number; readonly mitigation?: number },
): { readonly requested: number; readonly mitigated: number; readonly effective: number } {
  const requested = operation.amount;

  if (shuInteraction !== "compatible" || operation.mitigation === undefined) {
    return { requested, mitigated: 0, effective: requested };
  }

  const effective = Math.max(0, requested - operation.mitigation);

  return { requested, mitigated: requested - effective, effective };
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
 * Whether this Item's policy permits a repair from the state it is in.
 *
 * Zero on a `"destroyed"` Item is terminal unless the contract explicitly
 * says otherwise — see `restorableWhenDestroyed`. Above zero, `repairable`
 * alone decides, which is what lets a "destroyed" blade be mended right up
 * until the moment it is finished off.
 */
export function permitsRepair(
  policy: ItemIntegrityDefinition,
  integrityBefore: number,
): boolean {
  if (!policy.repairable) return false;

  if (policy.zeroBehavior === "destroyed" && integrityBefore <= 0) {
    return policy.restorableWhenDestroyed === true;
  }

  return true;
}


/**
 * Resolve one stress or repair operation against one owned entry.
 *
 * Pure. The input Character and its inventory are never mutated. A refusal
 * — "not-durable", "not-repairable" — is a successful answer, exactly as
 * equip/use resolvers report their own refusals; a malformed reference,
 * entry, definition or OPERATION is an `EngineFailure`. The last was the gap:
 * an operation with an unknown discriminant used to fall through to the
 * repair branch and apply, and a negative amount was silently made positive.
 */
export function resolveItemIntegrityOperation(
  input: ItemIntegrityOperationInput,
  getItemDefinition: ItemDefinitionLookup,
): EngineResult<ItemIntegrityResolution> {
  const operationIssues = findItemIntegrityOperationIssues(input.operation);

  if (operationIssues.length > 0) {
    return engineFailure(
      traceOf({ operation: { value: String((input.operation as { type?: unknown })?.type) } }, "operation_invalid"),
      operationIssues as [EngineError, ...EngineError[]],
    );
  }

  const operation = input.operation;

  const inputs: TraceInputs = {
    operation: { value: operation.type },
    amount: { value: operation.amount },
  };

  if (operation.type === "stress" && operation.mitigation !== undefined) {
    inputs["mitigationOffered"] = { value: operation.mitigation };
  }

  const character = input.resolved.character;

  const found = resolveInventoryItemRef(input.item, character.id, character.items);

  if (!found.ok) {
    return engineFailure(traceOf(inputs, found.issue), [
      structuralError(REFERENCE_ERROR_CODES[found.issue], describeInventoryReferenceIssue(found.issue)),
    ]);
  }

  const entry = found.entry;

  inputs["entryId"] = { value: entry.entryId };

  const lookup = resolveItemDefinition(getItemDefinition, entry.itemId);

  if (!lookup.ok) {
    const code = ITEM_DEFINITION_OUTCOME_CODES[lookup.issue];

    return engineFailure(traceOf(inputs, code), [
      structuralError(
        `equipment.integrity.${code}`,
        describeItemDefinitionOutcome(lookup),
        { actual: entry.itemId },
      ),
    ]);
  }

  const definition = lookup.definition;

  const item: InventoryItemRef = { characterId: character.id, entryId: entry.entryId };

  if (definition.integrity === undefined) {
    return engineSuccess(
      { disposition: "not-durable", item },
      traceOf(inputs, "not-durable"),
    );
  }

  const policy = definition.integrity;

  const policyIssues = findItemIntegrityIssues(policy);

  if (policyIssues.length > 0) {
    return engineFailure(traceOf(inputs, "definition_invalid"), [
      structuralError(
        "equipment.integrity.definition_invalid",
        `Item "${entry.itemId}" declares an invalid integrity policy.`,
        { actual: policyIssues[0]!.code },
      ),
    ]);
  }

  const before = entry.integrity ?? policy.maximum;
  const stateBefore = resolveIntegrityState(policy, before);

  if (operation.type === "repair" && !permitsRepair(policy, before)) {
    return engineSuccess(
      { disposition: "not-repairable", item, stateBefore },
      traceOf(inputs, "not-repairable"),
    );
  }

  const stress = operation.type === "stress"
    ? resolveEffectiveStress(definition.shuInteraction, operation)
    : undefined;

  if (stress !== undefined) {
    inputs["mitigationApplied"] = { value: stress.mitigated };
    inputs["effectiveStress"] = { value: stress.effective };
  }

  const delta = stress === undefined ? operation.amount : -stress.effective;

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
    ...(stress === undefined ? {} : { stress }),
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


/* -------------------------------------------------------------------------- */
/* Simultaneous operations                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Several operations on ONE entry, settled against one pre-batch state.
 *
 * The runtime handler used to fold each request into a running Character and
 * re-resolve between them, which made the answer depend on the order the
 * batch happened to be walked in: two stresses of 6 against an Item at 10
 * with a repair of 4 came out at 0 or at 4 depending on where the repair sat.
 * Simultaneous consequences are not a sequence — they all describe the same
 * instant — so they combine ALGEBRAICALLY from the shared figure everybody
 * started from, and the clamp is applied once at the end.
 *
 * `honoured` says how much of each direction the clamp left room for, so a
 * caller reporting per-request outcomes can apportion them proportionally
 * rather than by position. Proportional, because any rule that paid out "in
 * order until the budget runs out" would put the ordering back.
 */
export interface ItemIntegrityAggregate {
  readonly integrityBefore: number;
  readonly integrityAfter: number;
  readonly stateBefore: ItemIntegrityState;
  readonly stateAfter: ItemIntegrityState;

  /** Effective stress and repair asked of this entry, summed. */
  readonly requestedStress: number;
  readonly requestedRepair: number;

  /** What the clamp left room for, of each. */
  readonly honouredStress: number;
  readonly honouredRepair: number;
}


export function aggregateItemIntegrity(
  policy: ItemIntegrityDefinition,
  integrityBefore: number,
  totals: { readonly stress: number; readonly repair: number },
): ItemIntegrityAggregate {
  const requestedStress = totals.stress;
  const requestedRepair = totals.repair;

  const integrityAfter = Math.max(
    0,
    Math.min(policy.maximum, integrityBefore - requestedStress + requestedRepair),
  );

  /*
   * The clamp can only bite in one direction at a time, so the shortfall
   * belongs to whichever side pushed past a bound. Everything else is
   * honoured in full.
   */
  const net = integrityAfter - integrityBefore;
  const requestedNet = requestedRepair - requestedStress;

  let honouredStress = requestedStress;
  let honouredRepair = requestedRepair;

  if (net > requestedNet) {
    /* Clamped at the floor: less stress landed than was asked for. */
    honouredStress = Math.max(0, requestedRepair - net);
  } else if (net < requestedNet) {
    /* Clamped at the ceiling: less repair landed than was asked for. */
    honouredRepair = Math.max(0, net + requestedStress);
  }

  return {
    integrityBefore,
    integrityAfter,
    stateBefore: resolveIntegrityState(policy, integrityBefore),
    stateAfter: resolveIntegrityState(policy, integrityAfter),
    requestedStress,
    requestedRepair,
    honouredStress,
    honouredRepair,
  };
}


/** One entry's integrity replaced, with nothing else about the Character touched. */
export function withEntryIntegrity(
  character: Character,
  entryId: string,
  integrity: number,
): Character {
  return withIntegrityReplaced(character, entryId, integrity);
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
