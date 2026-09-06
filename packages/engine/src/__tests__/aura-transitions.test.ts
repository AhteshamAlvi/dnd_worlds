/*
 * Aura state transitions: the pure operations that produce a new stored state.
 *
 * The rule the whole suite circles is that the POOL and the PLACEMENT are
 * almost independent. Moving Aura around the body costs nothing — allocations
 * are Output being directed, and directing it elsewhere is free. Only
 * deliberate expenditure and involuntary drain reduce Current Aura.
 *
 * The one direction the dependency does run is downward: Current Aura caps
 * usable Output, so draining a character can leave them holding more in place
 * than they can now supply. Reconciliation is what that produces, and it is
 * why every operation here ends with it rather than only the allocation ones.
 *
 * CONTROL is the other axis. spendAura routes through it because a deliberate
 * expenditure is exactly what Control describes the efficiency of; drainAura
 * bypasses it, because being dexterous is no defence against having Aura torn
 * out of you.
 */

import { describe, expect, it } from "vitest";

import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { resolveAuraProfile } from "../character/foundation/aura/resolution";
import {
  clearAuraAllocations,
  drainAura,
  reconcileAuraState,
  removeAuraAllocation,
  replaceAuraAllocations,
  spendAura,
  upsertAuraAllocation,
} from "../character/foundation/aura/transitions";
import type { AuraTransitionContext } from "../character/foundation/aura/budget";
import type {
  AuraAllocation,
  CharacterAuraState,
} from "../character/foundation/aura/state";
import type { AuraAccessInput } from "../character/foundation/aura/types";

import { auraContext, UNAWAKENED, WITH_TEN } from "./fixtures/aura";

const RIGHT_ARM = continuityKey("upper-limb:right");

/*
 * CON 20 / VIT 20 gives a Maximum Aura of 50,000 and a physiological Output of
 * 10,000. Ren III opens 30% of it, and baseline Ten takes 5% off the top, so a
 * character at full reserve has 3,000 usable Output and 2,500 of it free.
 */
const REN_III: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
};

function context(
  overrides: {
    readonly dex?: number;
    readonly access?: AuraAccessInput;
    readonly anatomy?: typeof STANDARD_HUMANOID_ANATOMY;
  } = {},
): AuraTransitionContext {
  return auraContext({
    attributes: { con: 20, vit: 20, dex: overrides.dex ?? 22 },
    access: overrides.access ?? REN_III,
    ...(overrides.anatomy === undefined ? {} : { anatomy: overrides.anatomy }),
  });
}

function state(
  current: number,
  allocations: readonly AuraAllocation[] = [],
): CharacterAuraState {
  return { current, allocations };
}

const WHOLE_BODY_KEN: AuraAllocation = {
  id: "ken",
  coverage: "whole-body",
  placement: "surface",
  aura: 2000,
};

const ARM_KEN: AuraAllocation = {
  id: "ken-arm",
  coverage: "localized",
  placement: "surface",
  continuityKey: RIGHT_ARM,
  aura: 500,
};

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

/** A snapshot to compare an input against once the operation has run. */
function snapshot(value: unknown): string {
  return JSON.stringify(value);
}


describe("deliberate expenditure", () => {
  it("deducts the Base Cost times the Control multiplier", () => {
    const result = spendAura(state(4000), context({ dex: 10 }), 100);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.expenditure).toEqual({
      baseCost: 100,
      controlMultiplier: 2.9,
      finalCost: 290,
    });
    expect(result.payload.previousCurrent).toBe(4000);
    expect(result.payload.current).toBe(3710);
    expect(result.payload.currentChange).toBe(-290);
    expect(result.payload.state.current).toBe(3710);
  });

  it("charges superhuman control less for the same application", () => {
    const clumsy = spendAura(state(4000), context({ dex: 10 }), 100);
    const precise = spendAura(state(4000), context({ dex: 30 }), 100);

    expect(clumsy.success && clumsy.payload.current).toBe(3710);
    expect(precise.success && precise.payload.current).toBe(3980);
  });

  /*
   * The multiplier is rounded; the Final Cost is not. Continuous-time upkeep
   * spends fractional Aura, and rounding here would compound over a long
   * maintenance.
   */
  it("preserves a fractional Final Cost in the stored reserve", () => {
    const result = spendAura(state(4000), context({ dex: 25 }), 7);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.expenditure!.finalCost).toBe(3.5);
    expect(result.payload.state.current).toBe(3996.5);
  });

  /*
   * No partial spend. A character who cannot afford an application does not
   * perform a weaker version of it by default.
   */
  it("refuses an expenditure above Current Aura, atomically", () => {
    const before = state(100, [ARM_KEN]);
    const taken = snapshot(before);

    const result = spendAura(before, context(), 500);

    expect(errorCodes(result)).toContain("aura.expenditure.insufficient");
    expect(snapshot(before)).toBe(taken);
  });

  it("measures affordability against the FINAL cost, not the Base Cost", () => {
    /* Base 200 at x2.9 is 580, which 400 cannot cover. */
    expect(errorCodes(spendAura(state(400), context({ dex: 10 }), 200)))
      .toContain("aura.expenditure.insufficient");

    /* The same Base Cost at x0.2 is 40, which it easily can. */
    expect(spendAura(state(400), context({ dex: 30 }), 200).success).toBe(true);
  });

  it("refuses a negative or non-finite Base Cost", () => {
    expect(errorCodes(spendAura(state(4000), context(), -1)))
      .toContain("aura.control.base_cost.invalid");
    expect(errorCodes(spendAura(state(4000), context(), Number.NaN)))
      .toContain("aura.control.base_cost.invalid");
  });

  /*
   * Usable Output is capped by Current Aura, so a big enough expenditure
   * shrinks the budget the character's existing placement is standing on.
   */
  it("reconciles allocations when the spend lowers usable Output", () => {
    const before = state(4000, [{ ...WHOLE_BODY_KEN, aura: 2500 }]);

    const result = spendAura(before, context(), 2500);

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* 1,500 left: Ten takes 500, so 1,000 of budget remains for Ken. */
    expect(result.payload.current).toBe(1500);
    expect(result.payload.state.allocations[0]!.aura).toBeCloseTo(1000, 8);
    expect(result.payload.allocationChanges).toEqual([
      expect.objectContaining({ kind: "reduced", allocationId: "ken" }),
    ]);
  });
});


describe("involuntary drain", () => {
  it("deducts the supplied amount directly", () => {
    const result = drainAura(state(4000), context(), 250);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.current).toBe(3750);
    expect(result.payload.currentChange).toBe(-250);
  });

  /*
   * Control describes how efficiently a character SPENDS. It has nothing to
   * say about what is taken from them.
   */
  it("bypasses Control entirely", () => {
    for (const dex of [7, 10, 22, 30, 50]) {
      const result = drainAura(state(4000), context({ dex }), 250);

      expect(result.success && result.payload.current).toBe(3750);
      expect(result.success && result.payload.expenditure).toBeUndefined();
    }
  });

  /*
   * An unawakened character possesses Aura and can absolutely be drained of
   * it. Awakening gates deliberate access, not loss.
   */
  it("works with no awakening and no deliberate access", () => {
    const result = drainAura(
      state(4000),
      context({ access: UNAWAKENED }),
      1000,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.current).toBe(3000);
  });

  it("refuses a drain larger than the reserve, atomically", () => {
    const before = state(100);
    const taken = snapshot(before);

    expect(errorCodes(drainAura(before, context(), 101)))
      .toContain("aura.drain.excessive");
    expect(snapshot(before)).toBe(taken);
  });

  it("refuses a negative or non-finite drain", () => {
    expect(errorCodes(drainAura(state(100), context(), -1)))
      .toContain("aura.drain.amount.invalid");
    expect(errorCodes(drainAura(state(100), context(), Number.NaN)))
      .toContain("aura.drain.amount.invalid");
  });

  it("reconciles allocations after the deduction", () => {
    const result = drainAura(
      state(4000, [{ ...WHOLE_BODY_KEN, aura: 2500 }]),
      context(),
      2500,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.allocations[0]!.aura).toBeCloseTo(1000, 8);
  });
});


describe("allocation transitions", () => {
  /*
   * The rule everything else in this block depends on. Output is capacity
   * being directed; directing it costs nothing.
   */
  it("never deducts Current Aura for placing Aura", () => {
    const result = replaceAuraAllocations(
      state(4000),
      context(),
      [WHOLE_BODY_KEN],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.current).toBe(4000);
    expect(result.payload.currentChange).toBe(0);
    expect(result.payload.expenditure).toBeUndefined();
  });

  it("replaces the whole set atomically", () => {
    const result = replaceAuraAllocations(
      state(4000, [WHOLE_BODY_KEN]),
      context(),
      [ARM_KEN],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.allocations).toEqual([ARM_KEN]);
    expect(result.payload.allocationChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "added", allocationId: "ken-arm" }),
        expect.objectContaining({ kind: "removed", allocationId: "ken" }),
      ]),
    );
  });

  it("adds through upsert and replaces the one sharing an id", () => {
    const added = upsertAuraAllocation(state(4000), context(), ARM_KEN);

    expect(added.success && added.payload.state.allocations).toEqual([ARM_KEN]);
    expect(added.success && added.payload.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "added" })]);

    const changed = upsertAuraAllocation(
      state(4000, [ARM_KEN]),
      context(),
      { ...ARM_KEN, aura: 900 },
    );

    expect(changed.success && changed.payload.state.allocations)
      .toEqual([{ ...ARM_KEN, aura: 900 }]);
    expect(changed.success && changed.payload.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "replaced" })]);
  });

  it("removes one by id and clears them all", () => {
    const removed = removeAuraAllocation(
      state(4000, [WHOLE_BODY_KEN, ARM_KEN]),
      context(),
      "ken",
    );

    expect(removed.success && removed.payload.state.allocations)
      .toEqual([ARM_KEN]);

    const cleared = clearAuraAllocations(
      state(4000, [WHOLE_BODY_KEN, ARM_KEN]),
      context(),
    );

    expect(cleared.success && cleared.payload.state.allocations).toEqual([]);
    expect(cleared.success && cleared.payload.current).toBe(4000);
  });

  /*
   * Removing an id that is not there is a caller holding a belief that is
   * wrong, and returning success would confirm it.
   */
  it("refuses to remove an allocation that is not there", () => {
    expect(errorCodes(removeAuraAllocation(state(4000), context(), "ghost")))
      .toContain("aura.allocation.not_found");
  });

  it("refuses a set that exceeds the deliberate budget", () => {
    const result = replaceAuraAllocations(
      state(50_000),
      context(),
      [{ ...WHOLE_BODY_KEN, aura: 2501 }],
    );

    expect(errorCodes(result)).toContain("aura.allocation.over_output");
    if (result.success) return;

    /* 3,000 usable, 500 of it already committed by baseline Ten. */
    expect(result.errors[0]!.required).toBeCloseTo(2500, 8);
  });

  it("refuses malformed allocations before anything else", () => {
    const result = replaceAuraAllocations(state(4000), context(), [
      { id: "", coverage: "whole-body", placement: "surface", aura: 1 },
      { id: "b", coverage: "whole-body", placement: "surface", aura: -1 },
    ]);

    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        "aura.allocation.id.missing",
        "aura.allocation.amount.invalid",
      ]),
    );
    expect(errorCodes(result)).not.toContain("aura.allocation.over_output");
  });

  it("refuses internal placement the access state does not permit", () => {
    const result = replaceAuraAllocations(state(4000), context(), [{
      id: "chu-fist",
      coverage: "localized",
      placement: "internal",
      continuityKey: RIGHT_ARM,
      aura: 200,
    }]);

    expect(errorCodes(result))
      .toContain("aura.access.internal_placement.not_permitted");
  });

  it("permits internal placement once an override grants it", () => {
    const result = replaceAuraAllocations(
      state(4000),
      context({
        access: {
          ...WITH_TEN,
          override: {
            kind: "internal-access",
            source: "chu",
            accessFraction: 0.3,
          },
        },
      }),
      [{
        id: "chu-fist",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 200,
      }],
    );

    expect(result.success).toBe(true);
  });

  /*
   * Deliberately targeting anatomy that is not there is REFUSED, where
   * anatomy that disappears afterwards is merely reconciled. The difference is
   * who asked.
   */
  it("refuses a localized allocation on anatomy that is not manifested", () => {
    const result = replaceAuraAllocations(
      state(4000),
      context({
        anatomy: setBodyPartState(
          STANDARD_HUMANOID_ANATOMY,
          "arm-2",
          "archived-removed",
        ),
      }),
      [ARM_KEN],
    );

    expect(errorCodes(result))
      .toContain("aura.allocation.identity.not_manifested");
  });

  it("preserves fractional allocations exactly", () => {
    const fractional: AuraAllocation = { ...ARM_KEN, aura: 118.3 };

    const result = replaceAuraAllocations(state(4000), context(), [fractional]);

    expect(result.success && result.payload.state.allocations[0]!.aura)
      .toBe(118.3);
  });
});


describe("reconciliation", () => {
  it("removes an allocation whose anatomy is no longer manifested", () => {
    const result = reconcileAuraState(
      state(4000, [ARM_KEN]),
      context({
        anatomy: setBodyPartState(
          STANDARD_HUMANOID_ANATOMY,
          "arm-2",
          "archived-removed",
        ),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.allocations).toEqual([]);
    expect(result.payload.allocationChanges).toEqual([
      expect.objectContaining({
        kind: "removed-not-manifested",
        allocationId: "ken-arm",
        reason: "identity-not-manifested",
      }),
    ]);
  });

  /*
   * Losing a limb is not a drain. The Aura the allocation was holding returns
   * to unallocated Output and the reserve is untouched.
   */
  it("never deducts Current Aura because anatomy disappeared", () => {
    const result = reconcileAuraState(
      state(4000, [ARM_KEN]),
      context({
        anatomy: setBodyPartState(
          STANDARD_HUMANOID_ANATOMY,
          "arm-2",
          "archived-removed",
        ),
      }),
    );

    expect(result.success && result.payload.current).toBe(4000);
    expect(result.success && result.payload.currentChange).toBe(0);
  });

  /*
   * The identity, not the instance. An allocation aimed at "my right upper
   * limb" survives that limb being a different part of a different form.
   */
  it("keeps an allocation across replacement anatomy with the same identity", () => {
    const regrown = setBodyPartState(
      setBodyPartState(STANDARD_HUMANOID_ANATOMY, "arm-2", "archived-removed"),
      "arm-2",
      "active",
    );

    const result = reconcileAuraState(state(4000, [ARM_KEN]), context({
      anatomy: regrown,
    }));

    expect(result.success && result.payload.state.allocations).toEqual([ARM_KEN]);
    expect(result.success && result.payload.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "unchanged" })]);
  });

  it("scales the survivors proportionally when the budget has shrunk", () => {
    const result = reconcileAuraState(
      state(1500, [
        { id: "a", coverage: "whole-body", placement: "surface", aura: 800 },
        { id: "b", coverage: "whole-body", placement: "surface", aura: 200 },
      ]),
      context(),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* 1,500 usable, 500 to Ten, 1,000 left for a 4:1 split of 1,000. */
    const byId = new Map(
      result.payload.state.allocations.map((one) => [one.id, one.aura]),
    );

    expect(byId.get("a")!).toBeCloseTo(800, 8);
    expect(byId.get("b")!).toBeCloseTo(200, 8);

    const tighter = reconcileAuraState(
      state(1000, [
        { id: "a", coverage: "whole-body", placement: "surface", aura: 800 },
        { id: "b", coverage: "whole-body", placement: "surface", aura: 200 },
      ]),
      context(),
    );

    expect(tighter.success).toBe(true);
    if (!tighter.success) return;

    const scaled = new Map(
      tighter.payload.state.allocations.map((one) => [one.id, one.aura]),
    );

    expect(scaled.get("a")! + scaled.get("b")!).toBeCloseTo(500, 8);
    expect(scaled.get("a")! / scaled.get("b")!).toBeCloseTo(4, 8);
  });

  it("reports the factor it reduced by", () => {
    const result = reconcileAuraState(
      state(1000, [{ ...WHOLE_BODY_KEN, aura: 1000 }]),
      context(),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.allocationChanges).toEqual([
      expect.objectContaining({ kind: "reduced", factor: 0.5 }),
    ]);
  });

  it("leaves an already-legal state exactly as it was", () => {
    const before = state(50_000, [{ ...WHOLE_BODY_KEN, aura: 2000 }]);

    const result = reconcileAuraState(before, context());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state).toEqual(before);
    expect(result.payload.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "unchanged" })]);
  });

  /*
   * A duplicate id was never legal, and quietly repairing one would hide a bug
   * in whatever wrote it. Reconciliation answers "this was legal and the world
   * moved", which is a different question.
   */
  it("refuses a structurally malformed state rather than repairing it", () => {
    expect(errorCodes(reconcileAuraState(
      state(4000, [WHOLE_BODY_KEN, { ...ARM_KEN, id: "ken" }]),
      context(),
    ))).toContain("aura.allocation.id.duplicate");
  });

  it("leaves a reconciled state that the resolver then accepts unchanged", () => {
    const reconciled = reconcileAuraState(
      state(1000, [{ ...WHOLE_BODY_KEN, aura: 1000 }]),
      context(),
    );

    expect(reconciled.success).toBe(true);
    if (!reconciled.success) return;

    const resolved = resolveAuraProfile({
      state: reconciled.payload.state,
      ...context(),
    });

    expect(resolved.success).toBe(true);
    if (!resolved.success) return;

    expect(resolved.payload.adjustments).toEqual([]);
  });
});


describe("immutability", () => {
  const before = state(4000, [WHOLE_BODY_KEN, ARM_KEN]);

  const operations: readonly (readonly [
    string,
    () => { readonly success: boolean },
  ])[] = [
    ["spend", () => spendAura(before, context(), 100)],
    ["spend refused", () => spendAura(before, context(), 999_999)],
    ["drain", () => drainAura(before, context(), 100)],
    ["drain refused", () => drainAura(before, context(), 999_999)],
    ["replace", () => replaceAuraAllocations(before, context(), [ARM_KEN])],
    [
      "replace refused",
      () => replaceAuraAllocations(before, context(), [
        { ...WHOLE_BODY_KEN, aura: 999_999 },
      ]),
    ],
    ["upsert", () => upsertAuraAllocation(before, context(), { ...ARM_KEN, aura: 1 })],
    ["remove", () => removeAuraAllocation(before, context(), "ken")],
    ["remove refused", () => removeAuraAllocation(before, context(), "ghost")],
    ["clear", () => clearAuraAllocations(before, context())],
    ["reconcile", () => reconcileAuraState(before, context())],
  ];

  it("leaves the input state untouched on success and on failure", () => {
    const taken = snapshot(before);

    for (const [name, run] of operations) {
      run();

      expect([name, snapshot(before)]).toEqual([name, taken]);
    }
  });

  it("returns a state object that is not the one it was given", () => {
    const result = reconcileAuraState(before, context());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state).not.toBe(before);
    expect(result.payload.state.allocations).not.toBe(before.allocations);
  });
});


describe("what a transition explains", () => {
  it("traces a successful expenditure down to the Control derivation", () => {
    const result = spendAura(state(4000), context({ dex: 10 }), 100);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const serialized = JSON.stringify(result.trace.root);

    expect(result.trace.root.id).toBe("aura.transition.spend");
    expect(serialized).toContain("aura.control.multiplier");
    expect(serialized).toContain("aura.budget.resolve");
  });

  /*
   * A failure has to explain how far it got. A refused expenditure whose trace
   * is an empty node tells a caller nothing about why the cost was what it was.
   */
  it("traces a refused expenditure just as far", () => {
    const result = spendAura(state(10), context({ dex: 10 }), 100);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(JSON.stringify(result.trace.root))
      .toContain("aura.control.multiplier");
    expect(result.trace.root.output).toBe(false);
  });

  it("reports one change entry per allocation", () => {
    const result = replaceAuraAllocations(
      state(4000, [WHOLE_BODY_KEN]),
      context(),
      [{ ...WHOLE_BODY_KEN, aura: 100 }, ARM_KEN],
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(
      result.payload.allocationChanges
        .map((change) => change.allocationId)
        .sort(),
    ).toEqual(["ken", "ken-arm"]);
  });
});
