/*
 * The seam between a Character and a neutral action.
 *
 * These tests are as much about what the adapter REFUSES to answer as about
 * what it returns. Difficulty, tie policy, target-side contributions, spatial
 * facts and GM rulings all belong to somebody else, and an adapter that grew
 * any of them would be quietly deciding things a character has no standing to
 * decide.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  prepareCharacterActionInputs,
  type NamedRequirement,
} from "../character/actions/preparation";
import type { Requirement } from "../character/rules/requirements";
import { resolveRequirement } from "../character/rules/resolution";
import type { Character } from "../character/types";
import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";
import { errorCodesOf, payloadOf } from "./fixtures/result";

afterEach(() => {
  clearCustomDefinitions();
});

/*
 * A sheet mid-build: the Trait list has never been recorded, as opposed to
 * having been recorded and found empty. The key is removed rather than set to
 * undefined, because that is the shape a partially-filled sheet actually has.
 */
function withoutTraits(): Character {
  const { traits: _traits, ...rest } = createTestCharacter();

  return rest;
}

function named(id: string, requirement: Requirement): NamedRequirement {
  return { id, requirement };
}

const STRONG: Requirement = {
  type: "attributeMinimum",
  layer: "resolved",
  attribute: "dex",
  minimum: 12,
};

const WEAK: Requirement = {
  type: "attributeMinimum",
  layer: "resolved",
  attribute: "dex",
  minimum: 8,
};


describe("requirements become normalised findings", () => {
  const resolved = resolveTestCharacter(
    createTestCharacter({ attributes: { dex: 14 } }),
  );

  it("reports a met requirement as satisfied, decided by character", () => {
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      requirements: [named("needs-dex-8", WEAK)],
    }));

    expect(inputs.eligibility).toEqual([{
      id: "needs-dex-8",
      status: "satisfied",
      decidedBy: "character",
    }]);
  });

  it("reports an unmet requirement as unsatisfied", () => {
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved: resolveTestCharacter(
        createTestCharacter({ attributes: { dex: 9 } }),
      ),
      requirements: [named("needs-dex-12", STRONG)],
    }));

    expect(inputs.eligibility[0]?.status).toBe("unsatisfied");
  });

  it("keeps the caller's finding id, so a GM can override it by name", () => {
    /*
     * Ids are supplied rather than derived from the requirement's shape,
     * because this is the string adjudication overrides by name. Deriving it
     * would change it whenever the requirement was rephrased.
     */
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      requirements: [{
        id: "aura-strike.mastery",
        requirement: STRONG,
        summary: "Requires a steady hand.",
      }],
    }));

    expect(inputs.eligibility[0]?.id).toBe("aura-strike.mastery");
    expect(inputs.eligibility[0]?.summary).toBe("Requires a steady hand.");
  });

  it("evaluates compound requirements through the rules layer", () => {
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      requirements: [
        named("both", { type: "all", requirements: [WEAK, STRONG] }),
        named("either", { type: "any", requirements: [WEAK, STRONG] }),
        named("neither", { type: "not", requirement: STRONG }),
      ],
    }));

    expect(inputs.eligibility.map((finding) => finding.status))
      .toEqual(["satisfied", "satisfied", "unsatisfied"]);
  });
});


describe("an unrecorded sheet is not a failed requirement", () => {
  it("reports unresolved when the collection was never recorded", () => {
    /*
     * Character collections are optional so a half-built sheet still resolves.
     * Reading an absent Trait list as "you lack that Trait" would refuse an
     * action for a reason that is not true yet — it is not known yet, which is
     * a different answer with a different remedy.
     */
    const halfBuilt = resolveTestCharacter(withoutTraits());

    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved: halfBuilt,
      requirements: [named("needs-trait", {
        type: "hasTrait",
        traitId: "firebending",
      })],
    }));

    expect(inputs.eligibility[0]?.status).toBe("unresolved");
    expect(inputs.eligibility[0]?.diagnostic?.code)
      .toBe("character.actions.requirement.unresolved");

    /*
     * The status is the rules layer's own disposition, unmodified. The adapter
     * used to work this out by inspecting the Character itself, because the
     * requirement context collapsed absence into emptiness before the
     * evaluator saw it. There is one source of requirement semantics now.
     */
    expect(inputs.eligibility[0]?.status)
      .toBe(resolveRequirement(
        { type: "hasTrait", traitId: "firebending" },
        halfBuilt.requirementContext,
      ));
  });

  it("reports unsatisfied once the collection exists and is empty", () => {
    const recorded = resolveTestCharacter(
      createTestCharacter({ traits: [] }),
    );

    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved: recorded,
      requirements: [named("needs-trait", {
        type: "hasTrait",
        traitId: "firebending",
      })],
    }));

    expect(inputs.eligibility[0]?.status).toBe("unsatisfied");
  });

  it("propagates unresolved out of a compound requirement", () => {
    const halfBuilt = resolveTestCharacter(withoutTraits());

    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved: halfBuilt,
      requirements: [named("compound", {
        type: "all",
        requirements: [WEAK, { type: "hasTrait", traitId: "firebending" }],
      })],
    }));

    expect(inputs.eligibility[0]?.status).toBe("unresolved");
  });
});


describe("governing contributions", () => {
  const resolved = resolveTestCharacter(
    createTestCharacter({ attributes: { dex: 14 } }),
  );

  it("reads an attribute scope off the resolved character", () => {
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      checkScope: { kind: "attribute", attribute: "dex" },
    }));

    expect(inputs.baseContributions).toEqual([{
      id: "dex.standardModifier",
      amount: resolved.attributeScores.dex.standardModifier,
    }]);
  });

  it("reads a Derived Attribute scope the same way", () => {
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      checkScope: { kind: "derivedAttribute", derivedAttribute: "acrobatics" },
    }));

    expect(inputs.baseContributions).toEqual([{
      id: "acrobatics.standardModifier",
      amount: resolved.derivedScores.acrobatics.standardModifier,
    }]);
  });

  it("contributes nothing when the action has no check", () => {
    expect(payloadOf(prepareCharacterActionInputs({ resolved }))
      .baseContributions).toEqual([]);
  });

  it("refuses a sensory scope rather than becoming a second source", () => {
    /*
     * A sensory governing score depends on the sense, the route and the
     * profile, and the sensory resolvers already compute it. Answering here
     * would be a second source for the same number, and the two would drift
     * the first time a sense gained a modifier.
     */
    expect(errorCodesOf(prepareCharacterActionInputs({
      resolved,
      checkScope: {
        kind: "detection",
        mode: "active",
        sense: "sight",
        phenomenon: "physical",
        subject: "entity",
      },
    }))).toContain("character.actions.check-scope.not-owned");
  });
});


describe("modifiers come through the canonical invocation path", () => {
  it("applies a persistent modifier without being asked", () => {
    registerDefinition("trait", {
      id: "steady-hand",
      name: "Steady Hand",
      description: "A test Trait that steadies a DEX check.",
      effects: [{
        type: "modifyCheck",
        check: { kind: "attribute", attribute: "dex" },
        amount: 2,
      }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "steady-hand" }] }),
    );

    const inputs = payloadOf(prepareCharacterActionInputs({ resolved }));

    expect(inputs.modifiers.map((modifier) => modifier.channel))
      .toContain("persistent");
  });

  it("applies an invoked modifier only when the player selected it", () => {
    /*
     * The whole reason character/checks/invocation.ts exists. Knowing a Skill
     * is not using it, and the adapter must not be a second path on which an
     * invoked modifier can leak in unselected.
     */
    registerDefinition("skill", {
      id: "contort",
      name: "Contort",
      description: "A test Skill granting a situational AGI bonus.",
      timings: ["action"],
      mastery: { maximumMastery: 10 },
      effects: [{
        type: "modifyCheck",
        check: { kind: "attribute", attribute: "agi" },
        amount: 3,
        activation: "invoked",
      }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: "contort", mastery: 1 }] }),
    );

    const unselected = payloadOf(prepareCharacterActionInputs({ resolved }));

    expect(unselected.modifiers).toEqual([]);

    const selected = payloadOf(prepareCharacterActionInputs({
      resolved,
      invocation: { sources: [{ type: "skill", id: "contort" }] },
    }));

    expect(selected.modifiers.map((modifier) => modifier.channel))
      .toEqual(["invoked"]);
  });

  it("passes contextual modifiers through untouched", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      invocation: {
        contextual: [{
          source: { type: "gm", id: "footing" },
          scope: { kind: "attribute", attribute: "dex" },
          amount: -2,
          channel: "contextual",
        }],
      },
    }));

    expect(inputs.modifiers).toHaveLength(1);
    expect(inputs.modifiers[0]?.amount).toBe(-2);
  });
});


describe("the adapter supplies Character-owned inputs and nothing else", () => {
  const resolved = resolveTestCharacter(createTestCharacter());

  it("returns exactly three things", () => {
    /*
     * Asserted structurally. Difficulty, tie policy, target contributions and
     * spatial facts are not absent by accident — each belongs to the action
     * mechanic, the target's own adapter, or the host, and adding one here is
     * how a Character starts deciding what it is up against.
     */
    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      checkScope: { kind: "attribute", attribute: "dex" },
    }));

    expect(Object.keys(inputs).sort())
      .toEqual(["baseContributions", "eligibility", "modifiers"]);
  });

  it("assembles an opposed check one participant at a time", () => {
    /*
     * There is no two-sided entry point on purpose: a call taking both
     * characters would have to decide which is the initiator, and that is the
     * calling mechanic's question, not a Character's.
     */
    const gon = resolveTestCharacter(
      createTestCharacter({ attributes: { dex: 16 } }),
    );

    const kite = resolveTestCharacter(
      createTestCharacter({ attributes: { dex: 8 } }),
    );

    const scope = { kind: "attribute", attribute: "dex" } as const;

    const initiator = payloadOf(prepareCharacterActionInputs({
      resolved: gon,
      checkScope: scope,
    }));

    const opponent = payloadOf(prepareCharacterActionInputs({
      resolved: kite,
      checkScope: scope,
    }));

    expect(initiator.baseContributions[0]?.amount)
      .toBeGreaterThan(opponent.baseContributions[0]?.amount ?? 0);

    /* Neither call knows the other happened, and neither picks a winner. */
    expect(initiator).not.toHaveProperty("opponent");
    expect(initiator).not.toHaveProperty("tiesFavor");
  });
});
