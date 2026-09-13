/*
 * The authoritative resolved Item: one identity, one Shū verdict, and every
 * surface a future whole-Item enhancement would ever reach.
 *
 *
 * WHY IDENTITY HAD TO BECOME AUTHORITATIVE
 *
 * `shuInteraction` has been a required field on `ItemDefinition` since Ticket
 * 4.6, and everything downstream of it read the verdict from wherever it
 * happened to be handed one. That is not the same as reading it from the Item.
 * A caller holding an `InventoryItemRef` and a compatibility string could
 * describe an Item that does not exist — an incompatible potion presented as
 * compatible, a definition id paired with another Item's surfaces — and
 * nothing in the path from there to a resolver could tell.
 *
 * So the verdict is resolved HERE, from the owned entry, through the entry's
 * own `itemId`, out of the supplied catalog, and from nowhere else. A caller
 * may choose which entry to resolve. It may not choose what that entry is.
 *
 *
 * BINARY, AND FOR THE WHOLE ITEM
 *
 * There are no enhancement channels and there will not be. A compatible Item
 * exposes every Item-originating surface at once — its attack fact and its
 * defense fact, its possessed, equipped, use and integrity-band Effects,
 * positive and negative alike — because "Shū reinforces the object" is one
 * claim about one object, not six claims about six systems. Per-channel
 * compatibility (`shu: { attack: true, defense: false }`) would make the
 * verdict a matrix nobody authored and every consumer would have to interpret;
 * architecture.test.ts refuses one by name.
 *
 * NEGATIVE surfaces are in deliberately. A cursed blade's penalty is something
 * the Item does, so a future enhancement that reinforces what the Item does
 * reinforces that too. The alternative — enhancing only what looks like a
 * benefit — would have the engine reading intent off the sign of a number,
 * which is the same invented rule `brokenBehavior` refuses in integrity.ts.
 *
 *
 * WHAT IS DELIBERATELY OUTSIDE IT
 *
 * Everything a Skill, Technique or Trait contributed. A matched
 * `ImplementConditionalRule` keeps its own `{type:"trait"|"technique"|"skill"}`
 * source precisely so the two stay separable, and this envelope carries only
 * sources that are this Item: `{ type: "item", id: <this definition>,
 * instanceId: <this entry> }`. A Trait's proficiency bonus that happened to
 * fire alongside the sword is the character's, and Shū does not reinforce the
 * character.
 *
 * And every FORMULA. This file establishes identity, source separation and the
 * complete list of timing surfaces. What an enhancement costs, how it is
 * allocated, and what it multiplies belong to the Shū mechanic when it is
 * built.
 */

import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import type { EngineError } from "../../infrastructure/diagnostics";
import { createTraceNode } from "../../infrastructure/trace";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";

import type { Effect } from "../rules/effects";

import type { ItemAttackContribution, ItemDefenseContribution } from "./actions";
import {
  currentIntegrityBand,
  resolveIntegrityState,
  type ItemIntegrityState,
} from "./integrity";
import {
  describeInventoryReferenceIssue,
  resolveInventoryItemRef,
  type InventoryItemRef,
} from "./references";
import type { CharacterItem, ItemDefinition, ItemDefinitionId, ShuInteraction } from "./types";
import {
  ITEM_DEFINITION_OUTCOME_CODES,
  describeItemDefinitionOutcome,
  findItemStructuralIssues,
  resolveItemDefinition,
  type ItemDefinitionLookup,
} from "./validation";


/** One Effect the ITEM contributed, carrying the Item's own provenance. */
export interface ItemOwnedEffect {
  readonly source: ContributionSourceRef;
  readonly effect: Effect;
}


/** One typed performance fact the Item declares, with its own Effects. */
export interface ItemOwnedContribution {
  readonly source: ContributionSourceRef;
  readonly slot: "attack" | "defense";
  readonly declared: ItemAttackContribution | ItemDefenseContribution;
  readonly effects: readonly ItemOwnedEffect[];
}


/**
 * Everything that IS this Item, resolved from the authoritative definition.
 *
 * The surfaces are kept distinguishable rather than merged into one list,
 * because they do not happen at the same time: possessed Effects apply while
 * it is owned, equipped ones while it is worn, use Effects once when it is
 * used, integrity-band Effects while it is in a band, and the performance
 * facts when a role selects it. A single flat list would lose the timing and
 * make a future enhancement unable to say what it is enhancing WHEN.
 */
export interface ResolvedItemEnvelope {
  readonly item: InventoryItemRef;
  readonly definitionId: ItemDefinitionId;

  /** Read from the definition. Never from an argument. */
  readonly shuInteraction: ShuInteraction;

  /** The entry's derived integrity state, for a durable Item. */
  readonly integrityState?: ItemIntegrityState;

  readonly attack: readonly ItemOwnedContribution[];
  readonly defense: readonly ItemOwnedContribution[];

  readonly possessedEffects: readonly ItemOwnedEffect[];
  readonly equippedEffects: readonly ItemOwnedEffect[];
  readonly useEffects: readonly ItemOwnedEffect[];
  readonly integrityEffects: readonly ItemOwnedEffect[];
}


/** Every surface an envelope carries, named once so nothing can quietly drop one. */
export const ITEM_OWNED_SURFACES = [
  "attack",
  "defense",
  "possessedEffects",
  "equippedEffects",
  "useEffects",
  "integrityEffects",
] as const;

export type ItemOwnedSurface = typeof ITEM_OWNED_SURFACES[number];


function owned(
  source: ContributionSourceRef,
  effects: readonly Effect[] | undefined,
): readonly ItemOwnedEffect[] {
  return (effects ?? []).map((effect) => ({ source, effect }));
}


function contributionOf(
  source: ContributionSourceRef,
  slot: "attack" | "defense",
  declared: ItemAttackContribution | ItemDefenseContribution | undefined,
): readonly ItemOwnedContribution[] {
  if (declared === undefined) return [];

  return [{ source, slot, declared, effects: owned(source, declared.effects) }];
}


/**
 * Whether every Effect in an envelope really is the Item's own.
 *
 * The invariant the separation rests on, exposed so a test can assert it
 * rather than restate it. Anything sourced to a Skill, Technique or Trait in
 * here would be a character bonus a future enhancement would silently
 * reinforce.
 */
export function envelopeIsItemOwned(envelope: ResolvedItemEnvelope): boolean {
  const isThisItem = (source: ContributionSourceRef): boolean =>
    source.type === "item" &&
    source.id === envelope.definitionId &&
    source.instanceId === envelope.item.entryId;

  const effects = [
    ...envelope.possessedEffects,
    ...envelope.equippedEffects,
    ...envelope.useEffects,
    ...envelope.integrityEffects,
    ...envelope.attack.flatMap((contribution) => contribution.effects),
    ...envelope.defense.flatMap((contribution) => contribution.effects),
  ];

  return [...envelope.attack, ...envelope.defense].every(
    (contribution) => isThisItem(contribution.source),
  ) && effects.every((entry) => isThisItem(entry.source));
}


/**
 * Resolve one owned entry into its authoritative Item envelope.
 *
 * Takes the entry REFERENCE rather than a definition, so the definition and
 * the Shū verdict come from the entry's own `itemId` and the supplied catalog.
 * A caller cannot substitute either, which is the whole point: an incompatible
 * Item cannot be made compatible by an argument.
 *
 * Availability is NOT this function's question. A broken sword still owns its
 * attack fact — whether it may currently contribute one is
 * `resolveItemFunctionality()`'s answer, asked by implement selection, by
 * contribution resolution and by the use resolver. Folding the two together
 * would make the envelope's contents depend on a moment rather than on the
 * Item, and a snapshot taken for a grenade mid-flight would then change
 * meaning as the world moved on.
 */
export function resolveItemEnvelope(
  characterId: string,
  item: InventoryItemRef,
  items: readonly CharacterItem[] | undefined,
  getItemDefinition: ItemDefinitionLookup,
): EngineResult<ResolvedItemEnvelope> {
  const trace = (output: string) => ({
    root: createTraceNode({
      id: "character.equipment.envelope",
      label: "Resolve Item envelope",
      formula:
        "the entry names the definition; the definition names the Shū verdict and every Item-owned surface",
      inputs: { entryId: { value: item?.entryId ?? "invalid" } },
      output,
    }),
  });

  const found = resolveInventoryItemRef(item, characterId, items);

  if (!found.ok) {
    return engineFailure(trace(found.issue), [{
      code: `equipment.envelope.${found.issue.replace(/-/g, "_")}`,
      message: describeInventoryReferenceIssue(found.issue),
      audience: "developer",
      required: "a resolvable inventory reference",
      actual: found.issue,
    }] as NonEmptyArray<EngineError>);
  }

  const entry = found.entry;
  const lookup = resolveItemDefinition(getItemDefinition, entry.itemId);

  if (!lookup.ok) {
    const code = ITEM_DEFINITION_OUTCOME_CODES[lookup.issue];

    return engineFailure(trace(code), [{
      code: `equipment.envelope.${code}`,
      message: describeItemDefinitionOutcome(lookup),
      audience: "developer",
      required: `the definition named by the entry ("${entry.itemId}")`,
      actual: entry.itemId,
    }] as NonEmptyArray<EngineError>);
  }

  const definition = lookup.definition;

  /*
   * Validated before it is read, with the SAME rules registration applies. An
   * Item reaching here through a host's own lookup must not describe surfaces
   * the catalog would have refused.
   */
  const issues = findItemStructuralIssues(definition);

  if (issues.length > 0) {
    return engineFailure(trace("definition_invalid"), [{
      code: "equipment.envelope.definition_invalid",
      message: `Item "${entry.itemId}" ${issues.join(" ")}`,
      audience: "developer",
      required: "a structurally sound Item definition",
      actual: issues[0] ?? "malformed",
    }] as NonEmptyArray<EngineError>);
  }

  return engineSuccess(
    buildItemEnvelope(characterId, entry, definition),
    trace("resolved"),
  );
}


/**
 * The envelope for an entry whose definition a caller has ALREADY resolved and
 * validated through the authoritative path.
 *
 * Internal to the equipment layer: `resolveItemUse()` has done both by the
 * time it needs a snapshot, and asking the catalog a second time would be a
 * second chance for the two answers to differ. Nothing outside this directory
 * calls it, and the exported entry point above is the one a caller gets.
 */
export function buildItemEnvelope(
  characterId: string,
  entry: CharacterItem,
  definition: ItemDefinition,
): ResolvedItemEnvelope {
  const source: ContributionSourceRef = {
    type: "item",
    id: entry.itemId,
    instanceId: entry.entryId,
  };

  const policy = definition.integrity;
  const integrity = policy === undefined
    ? undefined
    : entry.integrity ?? policy.maximum;

  return {
    item: { characterId, entryId: entry.entryId },
    definitionId: definition.id,
    shuInteraction: definition.shuInteraction,
    ...(policy === undefined || integrity === undefined
      ? {}
      : { integrityState: resolveIntegrityState(policy, integrity) }),
    attack: contributionOf(source, "attack", definition.attack),
    defense: contributionOf(source, "defense", definition.defense),
    possessedEffects: owned(source, definition.possessedEffects),
    equippedEffects: owned(source, definition.equippedEffects),
    useEffects: owned(source, definition.useEffects),
    integrityEffects: owned(
      source,
      policy === undefined || integrity === undefined
        ? []
        : currentIntegrityBand(policy, integrity)?.effects,
    ),
  };
}
