/*
 * Tests for the Sandbox form resolver.
 *
 * The registry's type inference promises `invoke` gets fully-populated,
 * correctly-shaped arguments. Nothing enforces that at runtime except this
 * file, so it gets tested directly: nested groups, missing-field detection,
 * prefill, and the characterRef lookup that turns an id into a real engine
 * Character.
 */

import { describe, expect, it } from "vitest";

import { field, type SandboxContext } from "../fields";
import {
  initialFormState,
  resolveArgs,
  setFormValue,
  type FormState,
} from "../resolve";
import type { CharacterSheet } from "../../../state/sheet";

function sheet(id: string, name: string): CharacterSheet {
  return {
    schemaVersion: 1,
    id,
    name,
    character: {
      id,
      name,
      attributes: {
        str: 10, agi: 10, dex: 10, con: 10, vit: 10,
        int: 10, wis: 10, per: 10, spi: 10, cha: 10,
      },
      body: { surfaceUnits: 100 },
    },
    workbench: {
      auraPool: { current: 3200 },
      renAccessFraction: 0.32,
      notes: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

const gon = sheet("gon", "Gon");
const hisoka = sheet("hisoka", "Hisoka");

const ctx: SandboxContext = {
  active: gon,
  target: hisoka,
  sheets: { gon, hisoka },
  order: ["gon", "hisoka"],
  ephemeralIds: [],
};

describe("initialFormState", () => {
  it("applies prefill from the sandbox context", () => {
    const params = {
      amount: field.number("Amount", {
        prefill: (c) => c.active?.workbench.auraPool.current,
      }),
    };

    expect(initialFormState(params, ctx)).toEqual({ amount: 3200 });
  });

  it("defaults a characterRef to the active or target character's id", () => {
    const params = {
      attacker: field.characterRef("Attacker", { defaultTo: "active" }),
      defender: field.characterRef("Defender", { defaultTo: "target" }),
      other: field.characterRef("Other"),
    };

    expect(initialFormState(params, ctx)).toEqual({
      attacker: "gon",
      defender: "hisoka",
      other: undefined,
    });
  });

  it("builds nested state for groups and picks the first select option", () => {
    const params = {
      pool: field.group("Pool", {
        current: field.number("Current"),
        maximum: field.number("Maximum", { prefill: () => 9000 }),
      }),
      mode: field.select("Mode", ["fast", "slow"]),
    };

    expect(initialFormState(params, ctx)).toEqual({
      pool: { current: undefined, maximum: 9000 },
      mode: "fast",
    });
  });
});

describe("resolveArgs", () => {
  it("resolves a nested group into a plain object", () => {
    const params = {
      pool: field.group("Pool", {
        current: field.number("Current"),
        maximum: field.number("Maximum"),
      }),
    };

    const result = resolveArgs(
      params,
      { pool: { current: 100, maximum: 200 } },
      ctx,
    );

    expect(result).toEqual({
      ok: true,
      args: { pool: { current: 100, maximum: 200 } },
    });
  });

  it("reports missing fields by dotted path", () => {
    const params = {
      pool: field.group("Pool", {
        current: field.number("Current"),
        maximum: field.number("Maximum"),
      }),
      label: field.text("Label"),
    };

    const result = resolveArgs(params, { pool: { current: 100 } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["pool.maximum", "label"]);
    }
  });

  // An emptied number input yields NaN, which is never a legal engine
  // argument — it has to count as absent, not as a value.
  it("treats NaN as missing rather than as a number", () => {
    const params = { amount: field.number("Amount") };
    const result = resolveArgs(params, { amount: Number.NaN }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["amount"]);
  });

  it("turns a characterRef id into the engine's Character object", () => {
    const params = { character: field.characterRef("Character") };
    const result = resolveArgs(params, { character: "hisoka" }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The engine's own object, not a copy of the sheet.
      expect(result.args.character).toBe(hisoka.character);
    }
  });

  it("reports an unknown character id as missing", () => {
    const params = { character: field.characterRef("Character") };
    const result = resolveArgs(params, { character: "deleted" }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["character"]);
  });

  it("rejects a select value outside its options", () => {
    const params = { mode: field.select("Mode", ["fast", "slow"]) };

    expect(resolveArgs(params, { mode: "sideways" }, ctx).ok).toBe(false);
    expect(resolveArgs(params, { mode: "slow" }, ctx).ok).toBe(true);
  });

  it("treats an unset boolean as false rather than missing", () => {
    const params = { flag: field.boolean("Flag") };
    const result = resolveArgs(params, {}, ctx);

    expect(result).toEqual({ ok: true, args: { flag: false } });
  });
});

describe("setFormValue", () => {
  it("updates a nested leaf without mutating the original", () => {
    const before: FormState = { pool: { current: 1, maximum: 2 } };
    const after = setFormValue(before, ["pool", "maximum"], 99);

    expect(after).toEqual({ pool: { current: 1, maximum: 99 } });
    expect(before).toEqual({ pool: { current: 1, maximum: 2 } });
  });

  it("creates intermediate objects that don't exist yet", () => {
    expect(setFormValue({}, ["pool", "current"], 5)).toEqual({
      pool: { current: 5 },
    });
  });
});
