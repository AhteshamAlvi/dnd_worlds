/*
 * The Body-facing Effect vocabulary.
 *
 * Ten variants, five physical properties in two flavours, and the design has
 * one governing idea: reach for the most fundamental property available and
 * let consequences propagate on their own. There is deliberately no
 * "grant +2 STR" effect, because Strength is derived from physics — something
 * physical has to change for it to move.
 */

import { describe, expect, it } from "vitest";

import { EFFECT_TYPES } from "../character/rules/effects";
import type { Effect } from "../character/rules/effects";
import { resolveRuleEffects } from "../character/rules/resolution";
import { findEffectValidationIssues } from "../character/rules/validation";

const SOURCE = { type: "trait", id: "test-trait" } as const;

function resolve(...effects: Effect[]) {
  return resolveRuleEffects([{ source: SOURCE, effects }]);
}

function issues(effect: Effect) {
  return findEffectValidationIssues(effect).map((issue) => issue.type);
}


describe("the vocabulary", () => {
  it("declares all ten Body variants", () => {
    const body = EFFECT_TYPES.filter(
      (type) =>
        type.includes("Body") ||
        type.includes("IntrinsicPhysicalForce") ||
        type.includes("DestructionResistance"),
    );

    expect(body).toHaveLength(10);
    expect(EFFECT_TYPES).toHaveLength(16);
  });

  /*
   * Every physical property comes in both flavours, and neither exists without
   * the other. Base is what is permanently true and is what Strength
   * advancement is priced against; resolved is what is true right now.
   */
  it("pairs every property across Base and Resolved", () => {
    for (const property of [
      "BodyScale",
      "BodyMorphology",
      "BodyAnatomy",
      "IntrinsicPhysicalForce",
      "DestructionResistance",
    ]) {
      expect(EFFECT_TYPES).toContain(`modifyBase${property}`);
      expect(EFFECT_TYPES).toContain(`modifyResolved${property}`);
    }
  });
});


describe("bucketing", () => {
  it("routes each property to its own bucket, in the right mode", () => {
    const resolved = resolve(
      { type: "modifyBaseBodyScale", multiplier: 2 },
      { type: "modifyResolvedBodyScale", multiplier: 1.5 },
      {
        type: "modifyBaseBodyMorphology",
        property: "bulk",
        multiplier: 1.2,
      },
      { type: "modifyBaseIntrinsicPhysicalForce", multiplier: 3 },
      { type: "modifyResolvedDestructionResistance", multiplier: 1.5 },
    );

    expect(resolved.body.base.scale).toHaveLength(1);
    expect(resolved.body.base.scale[0]?.multiplier).toBe(2);
    expect(resolved.body.resolved.scale[0]?.multiplier).toBe(1.5);

    expect(resolved.body.base.morphology[0]?.property).toBe("bulk");
    expect(resolved.body.base.intrinsicPhysicalForce).toHaveLength(1);
    expect(resolved.body.resolved.destructionResistance).toHaveLength(1);

    // Nothing leaked across modes.
    expect(resolved.body.resolved.morphology).toEqual([]);
    expect(resolved.body.base.destructionResistance).toEqual([]);
  });

  it("keeps provenance", () => {
    const resolved = resolve({ type: "modifyBaseBodyScale", multiplier: 2 });

    expect(resolved.body.base.scale[0]?.source).toEqual(SOURCE);
  });

  /*
   * A target narrows an effect to matching BodyParts. Expanding it into actual
   * parts needs anatomy, which the rules layer does not have and should not:
   * rules say what was declared, Body decides who it lands on.
   */
  it("carries a selector through without expanding it", () => {
    const resolved = resolve({
      type: "modifyBaseBodyMorphology",
      property: "length",
      multiplier: 1.15,
      target: { types: ["arm"] },
    });

    expect(resolved.body.base.morphology[0]?.target).toEqual({
      types: ["arm"],
    });
  });

  it("leaves an untargeted effect global", () => {
    const resolved = resolve({
      type: "modifyBaseBodyMorphology",
      property: "bulk",
      multiplier: 1.2,
    });

    expect(resolved.body.base.morphology[0]?.target).toBeUndefined();
  });

  it("gives an effectless character empty buckets rather than absent ones", () => {
    const resolved = resolve();

    expect(resolved.body.base.scale).toEqual([]);
    expect(resolved.body.resolved.anatomy).toEqual([]);
  });
});


describe("anatomy operations", () => {
  it("carries all four modes on a resolved effect", () => {
    const resolved = resolve(
      {
        type: "modifyResolvedBodyAnatomy",
        operation: { mode: "addToForm", slotId: "third-arm", type: "arm" },
      },
      {
        type: "modifyResolvedBodyAnatomy",
        operation: { mode: "removeFromForm", slotId: "left-arm" },
      },
      {
        type: "modifyResolvedBodyAnatomy",
        operation: { mode: "suppress", target: { types: ["arm"] } },
      },
      {
        type: "modifyResolvedBodyAnatomy",
        operation: { mode: "replaceForm", referenceFormId: "DragonForm" },
      },
    );

    expect(
      resolved.body.resolved.anatomy.map((entry) => entry.operation.mode),
    ).toEqual(["addToForm", "removeFromForm", "suppress", "replaceForm"]);
  });

  /*
   * Suppression hides a part WITHOUT changing what the body plan expects,
   * which is coherent only while temporary. Permanently, the form would go on
   * expecting anatomy that is permanently absent and nothing could ever
   * resolve the disagreement.
   */
  it("rejects suppress on a permanent anatomy effect", () => {
    expect(
      issues({
        type: "modifyBaseBodyAnatomy",
        operation: { mode: "suppress", target: { all: true } },
      } as unknown as Effect),
    ).toContain("suppress-on-base-anatomy");
  });

  it("accepts suppress on a temporary one", () => {
    expect(
      issues({
        type: "modifyResolvedBodyAnatomy",
        operation: { mode: "suppress", target: { all: true } },
      }),
    ).toEqual([]);
  });

  it.each([
    ["addToForm", { mode: "addToForm", slotId: "", type: "arm" }],
    ["removeFromForm", { mode: "removeFromForm", slotId: "" }],
    ["replaceForm", { mode: "replaceForm", referenceFormId: "" }],
  ])("rejects a %s operation missing its identifier", (_mode, operation) => {
    expect(
      issues({
        type: "modifyResolvedBodyAnatomy",
        operation,
      } as Effect),
    ).toContain("missing-anatomy-reference");
  });
});


describe("multiplier validation", () => {
  /*
   * Zero is rejected rather than treated as an extreme. Scale 0 is a body with
   * no size, Muscularity 0 drives Structural Capacity negative through the
   * structural factor, and a destruction resistance of 0 would be quietly
   * rescued to 1 by the Maximum BP floor — turning an authoring mistake into
   * an effect that silently does nothing.
   */
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a multiplier of %p",
    (multiplier) => {
      expect(
        issues({ type: "modifyBaseBodyScale", multiplier }),
      ).toContain("invalid-body-multiplier");
    },
  );

  it("accepts ordinary multipliers around 1", () => {
    for (const multiplier of [0.5, 1, 1.2, 10]) {
      expect(issues({ type: "modifyBaseBodyScale", multiplier })).toEqual([]);
    }
  });

  it("checks every multiplier-carrying variant", () => {
    for (const type of [
      "modifyBaseBodyScale",
      "modifyResolvedBodyScale",
      "modifyBaseIntrinsicPhysicalForce",
      "modifyResolvedIntrinsicPhysicalForce",
      "modifyBaseDestructionResistance",
      "modifyResolvedDestructionResistance",
    ] as const) {
      expect(issues({ type, multiplier: 0 } as Effect)).toContain(
        "invalid-body-multiplier",
      );
    }
  });
});
