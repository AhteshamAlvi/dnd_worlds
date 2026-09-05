/*
 * Action capacity — Actions per Round/Turn/Reaction, derived from Combat
 * Ability and applicable Action-capacity Effects.
 *
 * The pure resolution formulas (Combat Ability -> base Round Actions, the
 * Round Action table) are exercised in phase9-model.test.ts's "the action
 * economy" suite. This file covers what this ticket actually added: the
 * mechanic's integration into ResolvedCharacter, the modifyActionCapacity
 * Effect reaching it through the ordinary rules pipeline, the Turn -> derived
 * Reaction-base propagation, and the resolution trace.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  resolveActionCapacity,
} from "../character/foundation/actions/resolution";
import type {
  ActionCapacityContribution,
} from "../character/foundation/actions/types";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

describe("resolveActionCapacity", () => {
  it("resolves base capacities from Combat Ability alone with no contributions", () => {
    const resolved = resolveActionCapacity(10);

    expect(resolved.baseRound).toBe(2);
    expect(resolved.baseTurn).toBe(2);
    expect(resolved.baseReaction).toBe(1);

    expect(resolved.capacity).toEqual({ round: 2, turn: 2, reaction: 1 });
  });

  it("applies round, turn, and reaction contributions independently", () => {
    const contributions: readonly ActionCapacityContribution[] = [
      { kind: "round", amount: 3, source: { type: "trait", id: "quick" } },
      { kind: "turn", amount: 1, source: { type: "trait", id: "quick" } },
      { kind: "reaction", amount: 1, source: { type: "trait", id: "quick" } },
    ];

    const resolved = resolveActionCapacity(10, contributions);

    // Round: base 2 + 3.
    expect(resolved.capacity.round).toBe(5);
    // Turn: base 2 + 1 = 3.
    expect(resolved.capacity.turn).toBe(3);
    // Reaction: floor(resolved Turn 3 / 2) = 1, + the reaction contribution.
    expect(resolved.capacity.reaction).toBe(2);
  });

  /*
   * The ordering rule this ticket's resolution.ts is explicit about: Reaction
   * is derived from the RESOLVED Turn capacity, not the unmodified baseTurn,
   * so a Turn-capacity Effect changes Reaction too even with no
   * Reaction-specific contribution at all.
   */
  it("propagates a Turn contribution into the derived Reaction base", () => {
    const withoutTurnBoost = resolveActionCapacity(10);
    const withTurnBoost = resolveActionCapacity(10, [
      { kind: "turn", amount: 2, source: { type: "trait", id: "quick" } },
    ]);

    expect(withoutTurnBoost.capacity.turn).toBe(2);
    expect(withoutTurnBoost.capacity.reaction).toBe(1);

    // Turn: 2 -> 4, so the derived Reaction base moves from 1 to 2.
    expect(withTurnBoost.capacity.turn).toBe(4);
    expect(withTurnBoost.baseReaction).toBe(2);
    expect(withTurnBoost.capacity.reaction).toBe(2);
  });

  it("builds a trace explaining Combat Ability, every base, every contribution, and every final capacity", () => {
    const resolved = resolveActionCapacity(10, [
      { kind: "round", amount: 1, source: { type: "trait", id: "quick" } },
    ]);

    expect(resolved.trace.children).toHaveLength(3);

    const [roundNode, turnNode, reactionNode] = resolved.trace.children;

    expect(roundNode?.inputs["combatAbility"]?.value).toBe(10);
    expect(roundNode?.inputs["baseRound"]?.value).toBe(2);
    expect(roundNode?.inputs["trait:quick"]?.value).toBe(1);
    expect(roundNode?.output).toBe(3);

    expect(turnNode?.output).toBe(2);
    expect(reactionNode?.output).toBe(1);
  });
});

describe("Action capacity on a resolved character", () => {
  it("exposes actionCapacity derived from Combat Ability", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    // The Standard Human fixture resolves every Derived Attribute to 10.
    expect(resolved.derivedAttributes.combatAbility).toBe(10);
    expect(resolved.actionCapacity.combatAbility).toBe(10);
    expect(resolved.actionCapacity.capacity).toEqual({
      round: 2,
      turn: 2,
      reaction: 1,
    });
  });

  it("reaches the resolved capacity through an ordinary modifyActionCapacity Effect", () => {
    registerDefinition("trait", {
      id: "fleet-of-foot",
      name: "Fleet of Foot",
      description: "A test Trait granting an extra Round Action.",
      effects: [
        { type: "modifyActionCapacity", capacity: "round", amount: 1 },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "fleet-of-foot" }] }),
    );

    expect(resolved.actionCapacity.capacity.round).toBe(3);
    expect(resolved.effects.actionCapacity).toEqual([
      {
        source: { type: "trait", id: "fleet-of-foot" },
        kind: "round",
        amount: 1,
      },
    ]);
  });

  it("a Turn-capacity Effect propagates into the resolved character's Reaction capacity", () => {
    registerDefinition("trait", {
      id: "quickened-mind",
      name: "Quickened Mind",
      description: "A test Trait granting an extra Turn Action.",
      effects: [
        { type: "modifyActionCapacity", capacity: "turn", amount: 2 },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "quickened-mind" }] }),
    );

    expect(resolved.actionCapacity.capacity.turn).toBe(4);
    expect(resolved.actionCapacity.capacity.reaction).toBe(2);
  });
});
