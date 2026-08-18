/*
 * Roster state: every character sheet the workbench currently knows about,
 * which one is active, which one (if any) is the target, and the event log.
 *
 * `rosterReducer` is a pure function — (state, operation) -> state — with no
 * I/O. Calling the engine from inside it is safe because the engine itself
 * is pure; every mutating operation recomputes that sheet's PipelineReport
 * and freezes a copy of it onto the resulting event, so clicking an old
 * event later shows the engine's reaction *at that moment*, not a
 * recomputation against however the sheet looks now.
 *
 * Nothing here touches the filesystem. Saving dirty sheets to disk via
 * characterStore is a side effect and belongs in a React effect once the UI
 * exists to drive it (step 3) — this file only tracks *which* sheets are
 * dirty, in `dirty`.
 */

import type {
  Attributes,
  AttributeKey,
  CharacterSpecies,
} from "@nenworld/engine";
import {
  createCharacterId,
  deriveMaximumAura,
  getDefinition,
  getMutationVariantDefinition,
  replenishAura,
} from "@nenworld/engine";

import {
  runSheetPipeline,
  singleStepReport,
  type PipelineReport,
} from "../adapters/sheetPipeline";
import {
  addFeature,
  FEATURE_DOMAINS,
  removeFeature,
} from "./features";
import type { FeatureDomain, Operation } from "./operations";
import {
  createDefaultCharacter,
  CURRENT_SHEET_SCHEMA_VERSION,
  DEFAULT_CHARACTER_NAME,
  defaultWorkbenchData,
  migrateSheet,
  type CharacterSheet,
} from "./sheet";

export interface WorkbenchEvent {
  readonly id: number;
  readonly timestamp: number;
  readonly operation: Operation;
  readonly label: string;
  readonly detail: string;

  // Which sheet's pipeline run is attached, if any — null for operations
  // that don't concern one character (e.g. a delete has nothing left to run).
  readonly characterId: string | null;

  // A frozen snapshot from when this event happened, not a live value.
  readonly report: PipelineReport | null;
}

export interface RosterState {
  readonly sheets: Readonly<Record<string, CharacterSheet>>;
  readonly order: readonly string[]; // display order == creation order
  readonly activeId: string | null;
  readonly targetId: string | null;

  /*
   * Generic Targets — scratch characters that exist only in memory.
   *
   * They're in `sheets` (so the pipeline, validity badges, and every engine
   * call work on them with no special casing) but deliberately NOT in
   * `order`, which is what drives the Character List. Being outside `order`
   * is also what keeps them off disk: persistence.ts saves whatever is in
   * `dirty` and deletes by diffing `order`, and an ephemeral is never in
   * either.
   */
  readonly ephemeralIds: readonly string[];

  // Sheet ids with unsaved changes. Step 3's UI drains this via characterStore.
  readonly dirty: ReadonlySet<string>;

  readonly events: readonly WorkbenchEvent[];
  readonly nextEventId: number;

  // Numbers only the *display name* — "Generic Target 3" — never identity.
  // Generic Targets get a real id from createCharacterId() like any other
  // character; this counter exists purely so their names stay readable and
  // distinct within a session.
  readonly nextGenericSeq: number;
}

// Roster starts empty — sheets are created from the workbench, not
// backfilled from anywhere.
export const initialRosterState: RosterState = {
  sheets: {},
  order: [],
  activeId: null,
  targetId: null,
  ephemeralIds: [],
  dirty: new Set(),
  events: [],
  nextEventId: 1,
  nextGenericSeq: 1,
};

// Replaces one attribute. Attributes is readonly, so this rebuilds the
// object; the intermediate Record is what lets a computed key type-check.
function withAttribute(
  attributes: Attributes,
  key: AttributeKey,
  value: number,
): Attributes {
  const next: Record<AttributeKey, number> = { ...attributes };
  next[key] = value;
  return next;
}

/*
 * Keeps Current Aura honest against the CON/VIT-derived Maximum Aura.
 *
 * Current Aura has no direct setter — the only ways it moves are
 * `replenish-aura` (up, engine-derived) and this clamp (down, forced by
 * physiology). Since nothing in the UI can type a value into it anymore,
 * this has to be the thing that guarantees it's always legal: floored at
 * zero, capped at whatever Maximum Aura now derives to. Run on every commit
 * and on hydrate, so an attribute edit that lowers CON/VIT — or a
 * hand-edited vault file — self-heals instead of getting stuck showing a
 * pool error nobody can act on.
 */
function clampAuraPool(sheet: CharacterSheet): CharacterSheet {
  const maximum = deriveMaximumAura(sheet.character.attributes);
  const current = sheet.workbench.auraPool.current;

  const clamped = Number.isFinite(current)
    ? Math.min(Math.max(current, 0), maximum)
    : maximum;

  if (clamped === current) return sheet;

  return {
    ...sheet,
    workbench: { ...sheet.workbench, auraPool: { current: clamped } },
  };
}

// Names a feature for the event log, falling back to the raw id if the
// definition has gone (a custom entry deleted while a sheet still used it).
function describeFeature(
  domain: FeatureDomain,
  featureId: string,
  variantId?: string,
): string {
  const name = getDefinition(domain, featureId)?.name ?? featureId;

  if (variantId === undefined) return name;

  const variant =
    getMutationVariantDefinition(featureId, variantId)?.name ?? variantId;

  return `${name} (${variant})`;
}

function describeAncestry(species: readonly CharacterSpecies[]): string {
  if (species.length === 0) return "(none)";

  return species
    .map(
      (entry) =>
        `${getDefinition("species", entry.speciesId)?.name ?? entry.speciesId} ${entry.percentage}%`,
    )
    .join(" · ");
}

// Appends an event and enforces the log cap. This is a dev tool's session
// history, not a permanent audit trail.
function appendEvent(
  state: RosterState,
  operation: Operation,
  label: string,
  detail: string,
  characterId: string | null,
  report: PipelineReport | null,
): RosterState {
  const event: WorkbenchEvent = {
    id: state.nextEventId,
    timestamp: Date.now(),
    operation,
    label,
    detail,
    characterId,
    report,
  };

  return {
    ...state,
    events: [event, ...state.events].slice(0, 200),
    nextEventId: state.nextEventId + 1,
  };
}

// Commits an already-mutated sheet: stamps updatedAt, reruns the pipeline,
// marks it dirty, and logs the event. Shared by every field-edit operation
// so each one only has to build the new sheet, not repeat this bookkeeping.
function commitSheetChange(
  state: RosterState,
  operation: Operation,
  sheet: CharacterSheet,
  label: string,
  detail: string,
): RosterState {
  const stamped: CharacterSheet = clampAuraPool({
    ...sheet,
    updatedAt: new Date().toISOString(),
  });

  const report = runSheetPipeline(stamped);

  // Editing a Generic Target must not queue a disk write. This is the guard
  // that makes "ephemeral" mean ephemeral even when the sheet is edited
  // through the normal Character Panel.
  const isEphemeral = state.ephemeralIds.includes(stamped.id);
  const dirty = isEphemeral
    ? state.dirty
    : new Set(state.dirty).add(stamped.id);

  return appendEvent(
    {
      ...state,
      sheets: { ...state.sheets, [stamped.id]: stamped },
      dirty,
    },
    operation,
    label,
    detail,
    stamped.id,
    report,
  );
}

// System-level state changes that are not user-chosen domain edits, so they
// stay out of the Operation vocabulary: a successful disk write, the initial
// load from disk, and clearing the session log. Handled by rosterReducer
// alongside Operation rather than through a second dispatch function, so the
// UI only ever needs one reducer.
export type RosterAction =
  | Operation
  | { kind: "hydrate"; sheets: readonly CharacterSheet[] }
  | { kind: "sheet-saved"; id: string; updatedAt: string }
  | { kind: "clear-events" };

export function rosterReducer(
  state: RosterState,
  operation: RosterAction,
): RosterState {
  switch (operation.kind) {
    case "hydrate": {
      const sheets: Record<string, CharacterSheet> = {};
      const order: string[] = [];

      // Every sheet is brought up to the current schema on the way in, so
      // nothing downstream has to know which shape it was written in. Also
      // clamped here — a hand-edited vault file is the one path that can
      // still hand this reducer an out-of-range Current Aura, and there's no
      // field left in the UI to fix it with.
      for (const raw of operation.sheets) {
        const sheet = clampAuraPool(migrateSheet(raw));
        sheets[sheet.id] = sheet;
        order.push(sheet.id);
      }

      // Random ids never need a "next" counter reconciled against what's on
      // disk — every id, generated or hand-authored, is already permanent
      // and collision-free on its own.
      return {
        ...initialRosterState,
        sheets,
        order,
      };
    }

    case "sheet-saved": {
      const sheet = state.sheets[operation.id];
      // Only clears dirty if nothing changed the sheet again since the save
      // started — otherwise a slow write could clobber a newer edit's flag.
      if (!sheet || sheet.updatedAt !== operation.updatedAt) return state;
      if (!state.dirty.has(operation.id)) return state;

      const dirty = new Set(state.dirty);
      dirty.delete(operation.id);
      return { ...state, dirty };
    }

    case "clear-events":
      return { ...state, events: [] };

    case "create-character": {
      const id = createCharacterId();
      const name = DEFAULT_CHARACTER_NAME;
      const character = createDefaultCharacter(id, name);

      const sheet: CharacterSheet = {
        schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
        id,
        name,
        character,
        // Current Aura starts full — the only ways it moves from here are
        // replenishment (up) and the CON/VIT clamp (down).
        workbench: {
          ...defaultWorkbenchData(),
          auraPool: { current: deriveMaximumAura(character.attributes) },
        },
        updatedAt: new Date().toISOString(),
      };

      const report = runSheetPipeline(sheet);

      return appendEvent(
        {
          ...state,
          sheets: { ...state.sheets, [id]: sheet },
          order: [...state.order, id],
          activeId: id,
          dirty: new Set(state.dirty).add(id),
        },
        operation,
        "Character created",
        name,
        id,
        report,
      );
    }

    case "create-generic-target": {
      // Generic Targets are temporary/test characters, but still characters
      // — they get a real id from the same generator as anything saved to
      // the vault. Only the label below is session-numbered.
      const id = createCharacterId();
      const name = `Generic Target ${state.nextGenericSeq}`;
      const character = createDefaultCharacter(id, name);

      const sheet: CharacterSheet = {
        schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
        id,
        name,
        character,
        workbench: {
          ...defaultWorkbenchData(),
          auraPool: { current: deriveMaximumAura(character.attributes) },
        },
        updatedAt: new Date().toISOString(),
      };

      /*
       * Note what's absent: no `order` entry (so it stays out of the
       * Character List) and no `dirty` entry (so it is never written to the
       * vault). Both omissions are the feature.
       */
      return appendEvent(
        {
          ...state,
          sheets: { ...state.sheets, [id]: sheet },
          ephemeralIds: [...state.ephemeralIds, id],
          targetId: id,
          nextGenericSeq: state.nextGenericSeq + 1,
        },
        operation,
        "Generic Target created",
        name,
        id,
        runSheetPipeline(sheet),
      );
    }

    case "delete-generic-target": {
      const removed = state.sheets[operation.id];
      if (!removed || !state.ephemeralIds.includes(operation.id)) return state;

      const { [operation.id]: _omit, ...remainingSheets } = state.sheets;

      return appendEvent(
        {
          ...state,
          sheets: remainingSheets,
          ephemeralIds: state.ephemeralIds.filter((id) => id !== operation.id),
          activeId: state.activeId === operation.id ? null : state.activeId,
          targetId: state.targetId === operation.id ? null : state.targetId,
        },
        operation,
        "Generic Target removed",
        removed.name,
        null,
        null,
      );
    }

    case "duplicate-character": {
      const source = state.sheets[operation.sourceId];
      if (!source) return state;

      const id = createCharacterId();
      const name = `${source.name} (copy)`;

      const sheet: CharacterSheet = {
        ...source,
        id,
        name,
        character: { ...source.character, id, name },
        workbench: { ...source.workbench },
        updatedAt: new Date().toISOString(),
      };

      const report = runSheetPipeline(sheet);

      return appendEvent(
        {
          ...state,
          sheets: { ...state.sheets, [id]: sheet },
          order: [...state.order, id],
          activeId: id,
          dirty: new Set(state.dirty).add(id),
        },
        operation,
        "Character duplicated",
        `${source.name} → ${name}`,
        id,
        report,
      );
    }

    case "delete-character": {
      const removed = state.sheets[operation.id];
      if (!removed) return state;

      const { [operation.id]: _omit, ...remainingSheets } = state.sheets;
      const dirty = new Set(state.dirty);
      dirty.delete(operation.id);

      return appendEvent(
        {
          ...state,
          sheets: remainingSheets,
          order: state.order.filter((id) => id !== operation.id),
          activeId: state.activeId === operation.id ? null : state.activeId,
          targetId: state.targetId === operation.id ? null : state.targetId,
          dirty,
        },
        operation,
        "Character deleted",
        removed.name,
        null,
        null,
      );
    }

    case "select-character": {
      const sheet = state.sheets[operation.id];
      if (!sheet) return state;

      return appendEvent(
        { ...state, activeId: operation.id },
        operation,
        "Character selected",
        sheet.name,
        operation.id,
        runSheetPipeline(sheet),
      );
    }

    case "select-target": {
      if (operation.id !== null && !state.sheets[operation.id]) return state;

      const sheet = operation.id ? state.sheets[operation.id] : undefined;

      return appendEvent(
        { ...state, targetId: operation.id },
        operation,
        "Target selected",
        sheet ? sheet.name : "(none)",
        operation.id,
        sheet ? runSheetPipeline(sheet) : null,
      );
    }

    case "rename-character": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const updated: CharacterSheet = {
        ...existing,
        name: operation.name,
        character: { ...existing.character, name: operation.name },
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        "Character renamed",
        `${existing.name} → ${operation.name}`,
      );
    }

    case "set-attribute": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const before = existing.character.attributes[operation.key];

      const updated: CharacterSheet = {
        ...existing,
        character: {
          ...existing.character,
          attributes: withAttribute(
            existing.character.attributes,
            operation.key,
            operation.value,
          ),
        },
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        "Attribute changed",
        `${operation.key.toUpperCase()} ${before} → ${operation.value}`,
      );
    }

    case "replenish-aura": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const attributes = existing.character.attributes;
      const pool = {
        current: existing.workbench.auraPool.current,
        maximum: deriveMaximumAura(attributes),
      };

      const result = replenishAura(pool, attributes, operation.hours);

      const report = singleStepReport(
        "aura.replenishment",
        "Replenish Aura",
        `Advancing ${operation.hours} hour(s) at the Regeneration rate derived from VIT.`,
        result,
      );

      if (!result.success) {
        // Nothing to apply — still log the attempt so the failing trace
        // (e.g. a negative hours value) is visible in the Event Log.
        return appendEvent(
          state,
          operation,
          "Aura replenishment rejected",
          existing.name,
          existing.id,
          report,
        );
      }

      const stamped: CharacterSheet = {
        ...existing,
        workbench: {
          ...existing.workbench,
          auraPool: { current: result.payload.current },
        },
        updatedAt: new Date().toISOString(),
      };

      const isEphemeral = state.ephemeralIds.includes(stamped.id);
      const dirty = isEphemeral
        ? state.dirty
        : new Set(state.dirty).add(stamped.id);

      return appendEvent(
        { ...state, sheets: { ...state.sheets, [stamped.id]: stamped }, dirty },
        operation,
        "Aura replenished",
        `${pool.current} → ${result.payload.current} (+${result.payload.current - pool.current})`,
        stamped.id,
        report,
      );
    }

    case "set-ren-access-fraction": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const before = existing.workbench.renAccessFraction;

      const updated: CharacterSheet = {
        ...existing,
        workbench: {
          ...existing.workbench,
          renAccessFraction: operation.fraction,
        },
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        "Ren Access Fraction changed",
        `${before} → ${operation.fraction}`,
      );
    }

    case "run-function":
      // Purely a record: the Sandbox already invoked the function and the
      // result arrived with the operation. No sheet changes, nothing to
      // recompute, nothing marked dirty.
      return appendEvent(
        state,
        operation,
        `Ran ${operation.functionName}`,
        operation.summary,
        operation.characterId,
        operation.report,
      );

    case "apply-palette-item": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const { attributes, auraCurrent, renAccessFraction } = operation.effect;

      /*
       * Effects are partial: an item states only the fields it changes, and
       * everything else on the sheet is left exactly as it was. That's what
       * makes packages composable — apply "Brute" then "Trained aura" and
       * neither undoes the other.
       */
      const updated: CharacterSheet = {
        ...existing,
        character: {
          ...existing.character,
          attributes: { ...existing.character.attributes, ...attributes },
        },
        workbench: {
          ...existing.workbench,
          ...(auraCurrent !== undefined
            ? { auraPool: { current: auraCurrent } }
            : {}),
          ...(renAccessFraction !== undefined ? { renAccessFraction } : {}),
        },
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        "Palette item applied",
        `${operation.itemName} → ${existing.name}`,
      );
    }

    case "add-feature": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const entry =
        operation.variantId === undefined
          ? { id: operation.featureId }
          : { id: operation.featureId, variantId: operation.variantId };

      const updated: CharacterSheet = {
        ...existing,
        character: addFeature(existing.character, operation.domain, entry),
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        `${FEATURE_DOMAINS[operation.domain].label} changed`,
        `+ ${describeFeature(operation.domain, operation.featureId, operation.variantId)}`,
      );
    }

    case "remove-feature": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const updated: CharacterSheet = {
        ...existing,
        character: removeFeature(
          existing.character,
          operation.domain,
          operation.featureId,
        ),
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        `${FEATURE_DOMAINS[operation.domain].label} changed`,
        `− ${describeFeature(operation.domain, operation.featureId)}`,
      );
    }

    case "set-species": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const updated: CharacterSheet = {
        ...existing,
        character: { ...existing.character, species: operation.species },
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        "Ancestry set",
        describeAncestry(operation.species),
      );
    }

    case "set-notes": {
      const existing = state.sheets[operation.id];
      if (!existing) return state;

      const updated: CharacterSheet = {
        ...existing,
        workbench: { ...existing.workbench, notes: operation.notes },
      };

      return commitSheetChange(
        state,
        operation,
        updated,
        "Notes edited",
        existing.name,
      );
    }
  }
}
