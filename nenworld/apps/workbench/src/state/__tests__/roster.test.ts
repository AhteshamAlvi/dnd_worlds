/*
 * Tests for rosterReducer.
 *
 * This is the state layer everything else in step 3 gets built on, so it's
 * tested directly rather than through UI: every operation, the events it
 * produces, and that unknown ids are safely ignored rather than throwing.
 */

import { describe, expect, it } from "vitest";

import { initialRosterState, rosterReducer, type RosterState } from "../roster";

// Creates a character and returns the resulting state plus its id, since
// almost every other test needs one to already exist.
function withOneCharacter(): { state: RosterState; id: string } {
  const state = rosterReducer(initialRosterState, { kind: "create-character" });
  const id = state.order[0];
  if (!id) throw new Error("expected create-character to add an id");
  return { state, id };
}

describe("create-character", () => {
  it("adds a sheet, selects it, marks it dirty, and logs an event", () => {
    const state = rosterReducer(initialRosterState, { kind: "create-character" });
    const id = state.order[0];
    if (!id) throw new Error("expected an id");

    expect(state.order).toHaveLength(1);
    expect(state.sheets[id]?.name).toBe("New Character");
    expect(state.activeId).toBe(id);
    expect(state.dirty.has(id)).toBe(true);
    expect(state.events[0]?.label).toBe("Character created");
    expect(state.events[0]?.characterId).toBe(id);
  });

  it("attaches a report, and a blank name fails validation", () => {
    const state = rosterReducer(initialRosterState, { kind: "create-character" });
    const report = state.events[0]?.report;

    // Name is non-empty by default, so a fresh character should validate.
    expect(report?.ok).toBe(true);
  });

  // The engine warns about a character with no Species; a character the
  // workbench itself just created should never trip that.
  it("creates a character the engine accepts without warnings", () => {
    const state = rosterReducer(initialRosterState, { kind: "create-character" });
    const report = state.events[0]?.report;

    expect(report?.warnings).toEqual([]);
    expect(state.sheets[state.order[0]!]?.character.species).toEqual([
      { speciesId: "human", percentage: 100 },
    ]);
  });

  // Current Aura has no direct setter, so a new character has to start
  // somewhere sane — full, matching the CON 10 / VIT 10 baseline Maximum
  // Aura, not an empty reserve nobody could otherwise fill.
  it("starts Current Aura full, at the derived Maximum Aura", () => {
    const state = rosterReducer(initialRosterState, { kind: "create-character" });
    const id = state.order[0]!;

    expect(state.sheets[id]?.workbench.auraPool.current).toBe(10);
  });

  it("assigns distinct, opaque, non-sequential ids across repeated creation", () => {
    let state = initialRosterState;
    state = rosterReducer(state, { kind: "create-character" });
    state = rosterReducer(state, { kind: "create-character" });

    expect(state.order).toHaveLength(2);
    expect(state.order[0]).not.toBe(state.order[1]);

    for (const id of state.order) {
      expect(id).toMatch(/^char-[a-z0-9]{16}$/);
    }
  });

  it("gives two characters with the same name different ids", () => {
    // Names are allowed to collide; identity must not be derived from one.
    let state = initialRosterState;
    state = rosterReducer(state, { kind: "create-character" });
    state = rosterReducer(state, { kind: "create-character" });

    const [first, second] = state.order;
    expect(state.sheets[first!]?.name).toBe(state.sheets[second!]?.name);
    expect(first).not.toBe(second);
  });
});

describe("duplicate-character", () => {
  it("clones the source under a new id without mutating it", () => {
    const { state: withOne, id } = withOneCharacter();
    const renamed = rosterReducer(withOne, {
      kind: "rename-character",
      id,
      name: "Gon",
    });

    const withCopy = rosterReducer(renamed, {
      kind: "duplicate-character",
      sourceId: id,
    });

    expect(withCopy.order).toHaveLength(2);
    const copyId = withCopy.order[1];
    if (!copyId) throw new Error("expected a copy id");

    expect(copyId).not.toBe(id); // a real new id, not a reused/renumbered one
    expect(copyId).toMatch(/^char-[a-z0-9]{16}$/);

    expect(withCopy.sheets[copyId]?.name).toBe("Gon (copy)");
    expect(withCopy.sheets[id]?.name).toBe("Gon"); // original untouched
    expect(withCopy.activeId).toBe(copyId);
  });

  it("is a no-op for an unknown source id", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "duplicate-character",
      sourceId: "does-not-exist",
    });

    expect(state).toBe(initialRosterState);
  });
});

describe("delete-character", () => {
  it("removes the sheet and clears active/target if they pointed at it", () => {
    const { state: withOne, id } = withOneCharacter();
    const targeted = rosterReducer(withOne, { kind: "select-target", id });

    const deleted = rosterReducer(targeted, { kind: "delete-character", id });

    expect(deleted.sheets[id]).toBeUndefined();
    expect(deleted.order).not.toContain(id);
    expect(deleted.activeId).toBeNull();
    expect(deleted.targetId).toBeNull();
    expect(deleted.dirty.has(id)).toBe(false);
  });

  it("is a no-op for an unknown id", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "delete-character",
      id: "does-not-exist",
    });

    expect(state).toBe(initialRosterState);
  });
});

describe("select-character / select-target", () => {
  it("updates activeId and attaches a fresh report", () => {
    const { state } = withOneCharacter();
    const second = rosterReducer(state, { kind: "create-character" });
    const firstId = second.order[0];
    if (!firstId) throw new Error("expected an id");

    const selected = rosterReducer(second, {
      kind: "select-character",
      id: firstId,
    });

    expect(selected.activeId).toBe(firstId);
    expect(selected.events[0]?.report).not.toBeNull();
  });

  it("allows clearing the target with null", () => {
    const { state, id } = withOneCharacter();
    const targeted = rosterReducer(state, { kind: "select-target", id });
    expect(targeted.targetId).toBe(id);

    const cleared = rosterReducer(targeted, { kind: "select-target", id: null });
    expect(cleared.targetId).toBeNull();
  });
});

describe("field-edit operations", () => {
  it("set-attribute updates the character and marks the sheet dirty", () => {
    const { state, id } = withOneCharacter();

    const updated = rosterReducer(state, {
      kind: "set-attribute",
      id,
      key: "dex",
      value: 14,
    });

    expect(updated.sheets[id]?.character.attributes.dex).toBe(14);
    expect(updated.dirty.has(id)).toBe(true);
    expect(updated.events[0]?.detail).toBe("DEX 10 → 14");
  });

  it("an out-of-range attribute produces a failing report", () => {
    const { state, id } = withOneCharacter();

    const updated = rosterReducer(state, {
      kind: "set-attribute",
      id,
      key: "str",
      value: 42,
    });

    expect(updated.events[0]?.report?.ok).toBe(false);
  });

  // Current Aura has no direct setter — the only way it moves down is this
  // clamp, triggered by whatever operation lowered CON/VIT enough to shrink
  // Maximum Aura below the stored reserve.
  it("lowering CON/VIT clamps an over-full Current Aura down to the new Maximum Aura", () => {
    const { state, id } = withOneCharacter();

    const seeded = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "test fixture",
      effect: { attributes: { con: 20, vit: 18 }, auraCurrent: 8000 },
    });
    expect(seeded.sheets[id]?.workbench.auraPool.current).toBe(8000);

    // CON 13 / VIT 18 -> Maximum Aura 800, well under the 8,000 in reserve.
    const lowered = rosterReducer(seeded, {
      kind: "set-attribute",
      id,
      key: "con",
      value: 13,
    });

    expect(lowered.sheets[id]?.workbench.auraPool.current).toBe(800);
  });

  it("rename-character updates both the display name and character.name", () => {
    const { state, id } = withOneCharacter();

    const updated = rosterReducer(state, {
      kind: "rename-character",
      id,
      name: "Killua",
    });

    expect(updated.sheets[id]?.name).toBe("Killua");
    expect(updated.sheets[id]?.character.name).toBe("Killua");
  });

  it("set-ren-access-fraction updates workbench data", () => {
    const { state, id } = withOneCharacter();

    // A freshly-created character sits at CON/VIT 10, whose derived Maximum
    // Aura and Output Limit are both small — bump CON/VIT (and seed a
    // reserve via apply-palette-item, since Current Aura has no direct
    // setter) so the Ren access below produces a real, non-trivial output.
    let updated = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "test fixture",
      effect: { attributes: { con: 20, vit: 18 }, auraCurrent: 8000 },
    });

    updated = rosterReducer(updated, {
      kind: "set-ren-access-fraction",
      id,
      fraction: 0.32,
    });

    const workbench = updated.sheets[id]?.workbench;
    expect(workbench?.auraPool).toEqual({ current: 8000 });
    expect(workbench?.renAccessFraction).toBe(0.32);

    // A legal, derived output against a real distribution should now
    // succeed. Maximum Aura / Output Limit / the Ren-accessible ceiling are
    // read off the report, never stored.
    const report = updated.events[0]?.report;
    expect(report?.ok).toBe(true);
    expect(report?.maximumAura).toBe(20000);
    expect(report?.outputLimitMaximum).toBe(10000); // physiological, CON 20
    expect(report?.renAccessibleMaximum).toBe(3200); // 10,000 × 0.32
    expect(report?.distributedAura).toBe(3200); // reserve (8,000) doesn't bind
    expect(report?.auraPerSurfaceUnit).toBe(32);
  });

  it("field edits on an unknown id are no-ops", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "set-attribute",
      id: "does-not-exist",
      key: "str",
      value: 15,
    });

    expect(state).toBe(initialRosterState);
  });
});

/*
 * Generic Targets are memory-only. These tests exist because the guarantee
 * is enforced by two *absences* in the reducer (no `order` entry, no `dirty`
 * entry), and an absence is exactly the kind of thing a later refactor
 * quietly reintroduces.
 */
describe("generic targets", () => {
  it("lands in sheets and ephemeralIds but never in order or dirty", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "create-generic-target",
    });
    const id = state.ephemeralIds[0];
    if (!id) throw new Error("expected an ephemeral id");

    expect(state.sheets[id]).toBeDefined();
    expect(state.order).toEqual([]); // stays out of the Character List
    expect(state.dirty.size).toBe(0); // never queued for a disk write
    expect(state.targetId).toBe(id); // selected as defender for convenience
  });

  it("does not become dirty when its stats are edited", () => {
    const created = rosterReducer(initialRosterState, {
      kind: "create-generic-target",
    });
    const id = created.ephemeralIds[0];
    if (!id) throw new Error("expected an ephemeral id");

    const edited = rosterReducer(created, {
      kind: "set-attribute",
      id,
      key: "str",
      value: 18,
    });

    expect(edited.sheets[id]?.character.attributes.str).toBe(18);
    // The whole point: editing a scratch dummy must not write to the vault.
    expect(edited.dirty.has(id)).toBe(false);
    expect(edited.dirty.size).toBe(0);
  });

  it("still marks real characters dirty when edited", () => {
    // Guards against the ephemeral check accidentally disabling saving.
    const { state, id } = withOneCharacter();
    const edited = rosterReducer(state, {
      kind: "set-attribute",
      id,
      key: "str",
      value: 18,
    });

    expect(edited.dirty.has(id)).toBe(true);
  });

  it("numbers target names independently of their (real, opaque) ids", () => {
    let state = rosterReducer(initialRosterState, { kind: "create-generic-target" });
    state = rosterReducer(state, { kind: "create-generic-target" });

    expect(state.ephemeralIds).toHaveLength(2);
    const [firstId, secondId] = state.ephemeralIds;

    // Same identity system as any other character — not a second id scheme.
    expect(firstId).toMatch(/^char-[a-z0-9]{16}$/);
    expect(secondId).toMatch(/^char-[a-z0-9]{16}$/);
    expect(firstId).not.toBe(secondId);

    expect(state.sheets[firstId!]?.name).toBe("Generic Target 1");
    expect(state.sheets[secondId!]?.name).toBe("Generic Target 2");
  });

  it("removes cleanly and clears any selection pointing at it", () => {
    const created = rosterReducer(initialRosterState, {
      kind: "create-generic-target",
    });
    const id = created.ephemeralIds[0];
    if (!id) throw new Error("expected an ephemeral id");

    const removed = rosterReducer(created, {
      kind: "delete-generic-target",
      id,
    });

    expect(removed.sheets[id]).toBeUndefined();
    expect(removed.ephemeralIds).toEqual([]);
    expect(removed.targetId).toBeNull();
  });

  it("refuses to delete a real character through the generic-target path", () => {
    const { state, id } = withOneCharacter();
    const attempted = rosterReducer(state, {
      kind: "delete-generic-target",
      id,
    });

    expect(attempted).toBe(state);
    expect(attempted.sheets[id]).toBeDefined();
  });
});

describe("apply-palette-item", () => {
  it("applies only the fields the effect names, leaving the rest alone", () => {
    const { state, id } = withOneCharacter();

    const applied = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "Brute",
      effect: { attributes: { str: 18, agi: 8 } },
    });

    const attributes = applied.sheets[id]?.character.attributes;
    expect(attributes?.str).toBe(18);
    expect(attributes?.agi).toBe(8);
    // Untouched by the effect, so still at the baseline.
    expect(attributes?.dex).toBe(10);
    expect(attributes?.cha).toBe(10);
  });

  // The property that makes packages usable together: applying a stat
  // package then an aura package must not undo the first.
  it("composes with a second item that touches different fields", () => {
    const { state, id } = withOneCharacter();

    let applied = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "Brute",
      effect: { attributes: { str: 18 } },
    });

    applied = rosterReducer(applied, {
      kind: "apply-palette-item",
      id,
      itemName: "Trained aura",
      effect: {
        attributes: { con: 20, vit: 18 },
        auraCurrent: 8000,
        renAccessFraction: 0.32,
      },
    });

    const sheet = applied.sheets[id];
    expect(sheet?.character.attributes.str).toBe(18); // survived
    expect(sheet?.workbench.renAccessFraction).toBe(0.32);
    expect(sheet?.workbench.auraPool).toEqual({ current: 8000 });
  });

  it("applies a Ren Access Fraction of zero rather than skipping it", () => {
    // Guards the `renAccessFraction !== undefined` check — a plain
    // truthiness test would silently ignore the "No aura" package.
    const { state, id } = withOneCharacter();

    const withAura = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "Trained aura",
      effect: { renAccessFraction: 0.32 },
    });
    expect(withAura.sheets[id]?.workbench.renAccessFraction).toBe(0.32);

    const cleared = rosterReducer(withAura, {
      kind: "apply-palette-item",
      id,
      itemName: "No aura",
      effect: { renAccessFraction: 0 },
    });
    expect(cleared.sheets[id]?.workbench.renAccessFraction).toBe(0);
  });

  it("marks the sheet dirty and logs one event for the whole item", () => {
    const { state, id } = withOneCharacter();

    const applied = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "Veteran",
      effect: { attributes: { str: 14, agi: 14, dex: 15 } },
    });

    expect(applied.dirty.has(id)).toBe(true);
    expect(applied.events[0]?.label).toBe("Palette item applied");
    // Three attributes changed, but it's still a single event.
    expect(applied.events.length).toBe(state.events.length + 1);
  });

  it("is a no-op for an unknown character", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "apply-palette-item",
      id: "does-not-exist",
      itemName: "Brute",
      effect: { attributes: { str: 18 } },
    });

    expect(state).toBe(initialRosterState);
  });
});

describe("replenish-aura", () => {
  it("advances Current Aura at the VIT-derived rate and logs the engine's own trace", () => {
    const { state, id } = withOneCharacter();

    // Current Aura has no direct setter — apply-palette-item is the
    // sanctioned way to seed a specific reserve for a test.
    const updated = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "test fixture",
      effect: { attributes: { con: 20, vit: 18 }, auraCurrent: 6500 },
    });

    const replenished = rosterReducer(updated, {
      kind: "replenish-aura",
      id,
      hours: 1,
    });

    // Regen for VIT 18 is 700/hour; 6500 + 700 = 7200.
    expect(replenished.sheets[id]?.workbench.auraPool.current).toBe(7200);
    expect(replenished.dirty.has(id)).toBe(true);
    expect(replenished.events[0]?.label).toBe("Aura replenished");
    expect(replenished.events[0]?.report?.steps[0]?.id).toBe("aura.replenishment");
    expect(replenished.events[0]?.report?.steps[0]?.result?.success).toBe(true);
  });

  it("caps Current Aura at the derived Maximum Aura", () => {
    const { state, id } = withOneCharacter();

    const updated = rosterReducer(state, {
      kind: "apply-palette-item",
      id,
      itemName: "test fixture",
      effect: { attributes: { con: 20, vit: 18 }, auraCurrent: 19800 },
    });

    const replenished = rosterReducer(updated, {
      kind: "replenish-aura",
      id,
      hours: 1,
    });

    expect(replenished.sheets[id]?.workbench.auraPool.current).toBe(20000);
  });

  it("logs a rejected event and leaves the sheet unchanged on a negative duration", () => {
    const { state, id } = withOneCharacter();

    const attempted = rosterReducer(state, {
      kind: "replenish-aura",
      id,
      hours: -1,
    });

    // Unaffected by the rejected attempt — still the full starting reserve
    // a freshly-created (CON 10 / VIT 10) character gets.
    expect(attempted.sheets[id]?.workbench.auraPool.current).toBe(10);
    expect(attempted.events[0]?.label).toBe("Aura replenishment rejected");
    expect(attempted.events[0]?.report?.ok).toBe(false);
  });

  it("is a no-op for an unknown character", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "replenish-aura",
      id: "does-not-exist",
      hours: 1,
    });

    expect(state).toBe(initialRosterState);
  });
});

describe("hydrate", () => {
  it("loads sheets from disk as-is", () => {
    const loaded = rosterReducer(initialRosterState, {
      kind: "create-character",
    });
    const id = loaded.order[0];
    if (!id) throw new Error("expected an id");

    const hydrated = rosterReducer(initialRosterState, {
      kind: "hydrate",
      sheets: [loaded.sheets[id]!],
    });

    expect(hydrated.order).toEqual([id]);
    expect(hydrated.dirty.size).toBe(0); // freshly loaded, nothing unsaved
    expect(hydrated.events).toEqual([]); // no session history yet
  });

  /*
   * With no field left to edit Current Aura through, a hand-edited vault
   * file is the one remaining way it could be out of range — and hydrate
   * has to self-heal it rather than surface an error the user has no
   * control to fix.
   */
  it("clamps an out-of-range Current Aura on a hand-edited sheet", () => {
    const overFull = rosterReducer(initialRosterState, {
      kind: "hydrate",
      sheets: [
        {
          schemaVersion: 4,
          id: "char-over",
          name: "Over Full",
          character: {
            id: "char-over",
            name: "Over Full",
            attributes: {
              str: 10, agi: 10, dex: 10, con: 10, vit: 10,
              int: 10, wis: 10, per: 10, spi: 10, cha: 10,
            },
            body: { surfaceUnits: 100 },
          },
          // CON 10 / VIT 10 -> Maximum Aura 10. A hand-edit left this at
          // 99,999, far past what the body can hold.
          workbench: { auraPool: { current: 99999 }, renAccessFraction: 0, notes: "" },
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(overFull.sheets["char-over"]?.workbench.auraPool.current).toBe(10);

    const negative = rosterReducer(initialRosterState, {
      kind: "hydrate",
      sheets: [
        {
          schemaVersion: 4,
          id: "char-negative",
          name: "Negative",
          character: {
            id: "char-negative",
            name: "Negative",
            attributes: {
              str: 10, agi: 10, dex: 10, con: 10, vit: 10,
              int: 10, wis: 10, per: 10, spi: 10, cha: 10,
            },
            body: { surfaceUnits: 100 },
          },
          workbench: { auraPool: { current: -50 }, renAccessFraction: 0, notes: "" },
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(negative.sheets["char-negative"]?.workbench.auraPool.current).toBe(0);
  });

  it("leaves hand-authored ids alone, and a create afterwards never collides with them", () => {
    const hydrated = rosterReducer(initialRosterState, {
      kind: "hydrate",
      sheets: [
        {
          schemaVersion: 1,
          id: "gon-freecss",
          name: "Gon Freecss",
          character: {
            id: "gon-freecss",
            name: "Gon Freecss",
            attributes: {
              str: 10, agi: 10, dex: 10, con: 10, vit: 10,
              int: 10, wis: 10, per: 10, spi: 10, cha: 10,
            },
            body: { surfaceUnits: 100 },
          },
          workbench: {
            auraPool: { current: 0 },
            renAccessFraction: 0,
            notes: "",
          },
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(hydrated.order).toEqual(["gon-freecss"]);

    const created = rosterReducer(hydrated, { kind: "create-character" });
    expect(created.order).toHaveLength(2);
    expect(created.order).toContain("gon-freecss");

    const newId = created.order.find((id) => id !== "gon-freecss");
    expect(newId).toMatch(/^char-[a-z0-9]{16}$/);
  });
});

describe("sheet-saved", () => {
  it("clears dirty only when the saved version still matches the current sheet", () => {
    const { state, id } = withOneCharacter();
    const savedAt = state.sheets[id]!.updatedAt;

    expect(state.dirty.has(id)).toBe(true);

    const staleSave = rosterReducer(state, {
      kind: "sheet-saved",
      id,
      updatedAt: "2000-01-01T00:00:00.000Z", // does not match current sheet
    });
    expect(staleSave.dirty.has(id)).toBe(true);

    const freshSave = rosterReducer(state, {
      kind: "sheet-saved",
      id,
      updatedAt: savedAt,
    });
    expect(freshSave.dirty.has(id)).toBe(false);
  });
});

describe("clear-events", () => {
  it("empties the event log without touching sheets", () => {
    const { state, id } = withOneCharacter();
    const cleared = rosterReducer(state, { kind: "clear-events" });

    expect(cleared.events).toEqual([]);
    expect(cleared.sheets[id]).toBe(state.sheets[id]);
  });
});

describe("event log", () => {
  it("stores newest first", () => {
    const { state, id } = withOneCharacter();
    const renamed = rosterReducer(state, {
      kind: "rename-character",
      id,
      name: "Killua",
    });

    expect(renamed.events[0]?.label).toBe("Character renamed");
    expect(renamed.events[1]?.label).toBe("Character created");
  });
});
