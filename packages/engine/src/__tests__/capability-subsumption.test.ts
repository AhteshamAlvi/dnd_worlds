/*
 * Subsumption: a newer capability replacing an older one.
 *
 * Intermediate Swordsmanship replaces Basic Swordsmanship. Awakened Sharingan
 * replaces Sharingan. Mangekyo Sharingan does NOT replace Sharingan — it is a
 * further development held alongside it — and the only thing that tells those
 * two cases apart is that one definition says `subsumes` and the other does
 * not. Nothing is inferred from names, from parent Traits, or from
 * prerequisites, because all three are things authors use for other reasons.
 *
 * The behaviour that makes subsumption worth having rather than just deleting
 * the old entry: the acquisition stays on the record, requirements naming it
 * are still met, the Skills it granted are still there, and its effects go on
 * applying — through its replacement, exactly once.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  hasResolvedSkill,
  hasResolvedTechnique,
} from "../character/capabilities/resolution";

import { resolveRequirement } from "../character/rules/resolution";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

/* ── Test content ───────────────────────────────────────────────────────── */

const BASIC = "test-basic-swordsmanship";
const INTERMEDIATE = "test-intermediate-swordsmanship";
const ADVANCED = "test-advanced-swordsmanship";

const THRUST = "test-direct-thrust";
const RIPOSTE = "test-riposte";

function registerSwordsmanship(): void {
  registerDefinition("skill", {
    id: THRUST,
    name: "Direct Thrust",
    description: "A test Skill granted by the basic discipline.",
    mastery: { maximumMastery: 3 },
  });

  registerDefinition("skill", {
    id: RIPOSTE,
    name: "Riposte",
    description: "A test Skill granted by the intermediate discipline.",
    mastery: { maximumMastery: 3 },
  });

  registerDefinition("technique", {
    id: BASIC,
    name: "Basic Swordsmanship",
    description: "A test Technique.",
    effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 1 }],
    mastery: {
      maximumMastery: 3,
      ranks: [{ rank: 1, effects: [{ type: "grantSkill", skillId: THRUST }] }],
    },
  });

  registerDefinition("technique", {
    id: INTERMEDIATE,
    name: "Intermediate Swordsmanship",
    description: "A test Technique replacing the basic one.",
    subsumes: [BASIC],
    effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 2 }],
    mastery: {
      maximumMastery: 5,
      ranks: [{ rank: 1, effects: [{ type: "grantSkill", skillId: RIPOSTE }] }],
    },
  });
}

const SHARINGAN = "test-sharingan";
const AWAKENED = "test-awakened-sharingan";
const MANGEKYO = "test-mangekyo-sharingan";

function registerSharingan(): void {
  registerDefinition("trait", {
    id: SHARINGAN,
    name: "Sharingan",
    description: "A test Trait.",
    effects: [{ type: "modifyBaseAttribute", attribute: "per", amount: 1 }],
  });

  registerDefinition("trait", {
    id: AWAKENED,
    name: "Awakened Sharingan",
    description: "A test Trait that replaces its predecessor.",
    parentTraitId: SHARINGAN,
    subsumes: [SHARINGAN],
    effects: [{ type: "modifyBaseAttribute", attribute: "per", amount: 3 }],
  });

  registerDefinition("trait", {
    id: MANGEKYO,
    name: "Mangekyo Sharingan",
    description: "A test Trait held alongside its predecessor.",
    parentTraitId: SHARINGAN,
    requirements: [{ type: "hasTrait", traitId: SHARINGAN }],
    effects: [{ type: "modifyBaseAttribute", attribute: "spi", amount: 2 }],
  });
}

afterEach(() => {
  clearCustomDefinitions();
});

/* ── Techniques ─────────────────────────────────────────────────────────── */

describe("a Technique can be replaced by its successor", () => {
  it("marks the older one subsumed rather than removing it", () => {
    registerSwordsmanship();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: BASIC, mastery: 3 },
          { techniqueId: INTERMEDIATE },
        ],
      }),
    );

    const basic = resolved.capabilities.techniques[BASIC];

    expect(basic).toBeDefined();
    expect(basic?.availability).toBe("subsumed");
    expect(basic?.isAuthored).toBe(true);
    expect(basic?.subsumedBy).toEqual([
      { kind: "technique", id: INTERMEDIATE },
    ]);

    /* The history is intact: they did reach III, and the record says so. */
    expect(basic?.mastery).toBe(3);

    expect(
      resolved.capabilities.techniques[INTERMEDIATE]?.availability,
    ).toBe("available");
  });

  /*
   * The replacement answers for what it replaced. An author retiring Basic
   * Swordsmanship should not have to hunt down every Skill that named it.
   */
  it("satisfies a requirement naming the older Technique", () => {
    registerSwordsmanship();

    const resolved = resolveTestCharacter(
      createTestCharacter({ techniques: [{ techniqueId: INTERMEDIATE }] }),
    );

    expect(hasResolvedTechnique(resolved.capabilities, BASIC)).toBe(true);

    expect(
      resolveRequirement(
        { type: "hasTechnique", techniqueId: BASIC },
        resolved.requirementContext,
      ),
    ).toBe("satisfied");

    expect(resolved.capabilities.techniques[BASIC]?.availability).toBe("subsumed");
    expect(resolved.capabilities.techniques[BASIC]?.isAuthored).toBe(false);
  });

  /*
   * Once, not twice and not never. Dropping the subsumed contributor alone
   * would delete a discipline's granted Skills the moment a successor arrived;
   * keeping both would apply everything twice.
   */
  it("applies the subsumed Technique's effects exactly once", () => {
    registerSwordsmanship();

    const both = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: BASIC },
          { techniqueId: INTERMEDIATE },
        ],
      }),
    );

    /* 10 base DEX, +1 inherited from Basic, +2 from Intermediate. */
    expect(both.attributes.base.dex).toBe(13);

    const successorOnly = resolveTestCharacter(
      createTestCharacter({ techniques: [{ techniqueId: INTERMEDIATE }] }),
    );

    expect(successorOnly.attributes.base.dex).toBe(13);
  });

  it("inherits the subsumed Technique's grants, so its Skills remain", () => {
    registerSwordsmanship();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: BASIC },
          { techniqueId: INTERMEDIATE },
        ],
      }),
    );

    expect(hasResolvedSkill(resolved.capabilities, THRUST)).toBe(true);
    expect(hasResolvedSkill(resolved.capabilities, RIPOSTE)).toBe(true);

    /* Attributed to the surviving Technique, which is what now supplies it. */
    expect(resolved.capabilities.skills[THRUST]?.grantedBy).toEqual([
      {
        source: { type: "technique", id: INTERMEDIATE },
        mode: "granted-while-present",
      },
    ]);
  });

  /*
   * The Skills were the character's own. Replacing the discipline they came
   * out of is not a reason to take away training that has its own entry.
   */
  it("leaves previously acquired Skills alone", () => {
    registerSwordsmanship();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: BASIC },
          { techniqueId: INTERMEDIATE },
        ],
        skills: [{ skillId: THRUST, mastery: 3 }],
      }),
    );

    const thrust = resolved.capabilities.skills[THRUST];

    expect(thrust?.availability).toBe("available");
    expect(thrust?.isAuthored).toBe(true);
    expect(thrust?.mastery).toBe(3);
  });

  it("inherits at the subsumed Technique's own Mastery, not the successor's", () => {
    registerDefinition("technique", {
      id: "test-old-forms",
      name: "Old Forms",
      description: "A test Technique whose ranks each add a point.",
      mastery: {
        maximumMastery: 3,
        ranks: [
          { rank: 2, effects: [{ type: "modifyBaseAttribute", attribute: "wis", amount: 1 }] },
          { rank: 3, effects: [{ type: "modifyBaseAttribute", attribute: "wis", amount: 1 }] },
        ],
      },
    });

    registerDefinition("technique", {
      id: "test-new-forms",
      name: "New Forms",
      description: "A test Technique replacing the old one.",
      subsumes: ["test-old-forms"],
      mastery: { maximumMastery: 5 },
    });

    const trained = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: "test-old-forms", mastery: 3 },
          { techniqueId: "test-new-forms" },
        ],
      }),
    );

    /* Three ranks of old work is two points, and taking up the new discipline
     * did not undo them. */
    expect(trained.attributes.base.wis).toBe(12);

    const untrained = resolveTestCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "test-new-forms" }],
      }),
    );

    /* Somebody who never studied the old forms inherits them at I. */
    expect(untrained.attributes.base.wis).toBe(10);
  });
});

/* ── Traits ─────────────────────────────────────────────────────────────── */

describe("a Trait can be replaced by its successor", () => {
  it("subsumes Sharingan into Awakened Sharingan", () => {
    registerSharingan();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [{ traitId: SHARINGAN }, { traitId: AWAKENED }],
      }),
    );

    expect(resolved.traits[SHARINGAN]?.availability).toBe("subsumed");
    expect(resolved.traits[SHARINGAN]?.subsumedBy).toEqual([
      { kind: "trait", id: AWAKENED },
    ]);
    expect(resolved.traits[AWAKENED]?.availability).toBe("available");

    /* 10 base PER, +1 inherited from Sharingan, +3 from Awakened. */
    expect(resolved.attributes.base.per).toBe(14);
  });

  it("still satisfies a requirement naming the older Trait", () => {
    registerSharingan();

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: AWAKENED }] }),
    );

    expect(
      resolveRequirement(
        { type: "hasTrait", traitId: SHARINGAN },
        resolved.requirementContext,
      ),
    ).toBe("satisfied");
  });

  /*
   * The pair that shows why nothing may be inferred. Mangekyo shares
   * Sharingan's parent Trait AND requires it, and replaces nothing — because
   * its definition does not say it does.
   */
  it("lets Sharingan and Mangekyo Sharingan coexist", () => {
    registerSharingan();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [{ traitId: SHARINGAN }, { traitId: MANGEKYO }],
      }),
    );

    expect(resolved.traits[SHARINGAN]?.availability).toBe("available");
    expect(resolved.traits[MANGEKYO]?.availability).toBe("available");
    expect(resolved.traits[SHARINGAN]?.subsumedBy).toEqual([]);

    /* Both contribute: +1 PER from Sharingan, +2 SPI from Mangekyo. */
    expect(resolved.attributes.base.per).toBe(11);
    expect(resolved.attributes.base.spi).toBe(12);
  });

  it("does not read a parent Trait as a subsumption claim", () => {
    registerSharingan();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [{ traitId: SHARINGAN }, { traitId: MANGEKYO }],
      }),
    );

    expect(resolved.traits[MANGEKYO]?.subsumedBy).toEqual([]);
    expect(resolved.traits[SHARINGAN]?.subsumedBy).toEqual([]);
  });
});

/* ── Chains ─────────────────────────────────────────────────────────────── */

describe("subsumption chains", () => {
  function registerChain(): void {
    registerSwordsmanship();

    registerDefinition("technique", {
      id: ADVANCED,
      name: "Advanced Swordsmanship",
      description: "A test Technique replacing the intermediate one.",
      subsumes: [INTERMEDIATE],
      effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 4 }],
      mastery: { maximumMastery: 10 },
    });
  }

  it("reaches transitively through the chain", () => {
    registerChain();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: BASIC },
          { techniqueId: INTERMEDIATE },
          { techniqueId: ADVANCED },
        ],
      }),
    );

    expect(resolved.capabilities.techniques[ADVANCED]?.availability).toBe(
      "available",
    );

    /* Both older links answer to the LIVE one, not to each other. */
    for (const id of [BASIC, INTERMEDIATE]) {
      expect(resolved.capabilities.techniques[id]?.availability).toBe("subsumed");
      expect(resolved.capabilities.techniques[id]?.subsumedBy).toEqual([
        { kind: "technique", id: ADVANCED },
      ]);
    }

    /* 10 base DEX, +1 +2 +4 with each contributing exactly once. */
    expect(resolved.attributes.base.dex).toBe(17);
  });

  it("carries the whole chain's grants when only the newest is held", () => {
    registerChain();

    const resolved = resolveTestCharacter(
      createTestCharacter({ techniques: [{ techniqueId: ADVANCED }] }),
    );

    expect(hasResolvedSkill(resolved.capabilities, THRUST)).toBe(true);
    expect(hasResolvedSkill(resolved.capabilities, RIPOSTE)).toBe(true);
    expect(hasResolvedTechnique(resolved.capabilities, BASIC)).toBe(true);
  });

  /*
   * Broken data must not hang a sheet or silently blank a character. A cycle
   * has no live capability in it, so nothing is subsumed and everything still
   * applies — degrading to "all of it" beats degrading to "none of it" when
   * the declarations are already known to be wrong, and
   * capabilities/dependencies.ts reports the cycle either way.
   */
  it("survives a subsumption cycle without hanging or blanking anything", () => {
    registerDefinition("trait", {
      id: "test-loop-a",
      name: "Loop A",
      description: "A test Trait replacing the one that replaces it.",
      subsumes: ["test-loop-b"],
      effects: [{ type: "modifyBaseAttribute", attribute: "cha", amount: 1 }],
    });

    registerDefinition("trait", {
      id: "test-loop-b",
      name: "Loop B",
      description: "A test Trait replacing the one that replaces it.",
      subsumes: ["test-loop-a"],
      effects: [{ type: "modifyBaseAttribute", attribute: "cha", amount: 1 }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [{ traitId: "test-loop-a" }, { traitId: "test-loop-b" }],
      }),
    );

    expect(resolved.traits["test-loop-a"]?.availability).toBe("available");
    expect(resolved.traits["test-loop-b"]?.availability).toBe("available");
    expect(resolved.attributes.base.cha).toBe(12);
  });

  it("ignores a capability that lists itself among what it replaces", () => {
    registerDefinition("trait", {
      id: "test-self-replacing",
      name: "Self Replacing",
      description: "A test Trait naming itself.",
      subsumes: ["test-self-replacing"],
      effects: [{ type: "modifyBaseAttribute", attribute: "cha", amount: 1 }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "test-self-replacing" }] }),
    );

    expect(resolved.traits["test-self-replacing"]?.availability).toBe("available");
    expect(resolved.attributes.base.cha).toBe(11);
  });

  /*
   * Two replacements naming the same predecessor is the case where "inherited
   * contributions apply only once" earns its keep: without the rule the older
   * Technique's bonus lands twice, from two different inheritors.
   */
  it("applies a shared predecessor's contribution once, not once per heir", () => {
    registerSwordsmanship();

    registerDefinition("technique", {
      id: "test-parallel-school",
      name: "Parallel School",
      description: "A second test Technique replacing the same basic one.",
      subsumes: [BASIC],
      mastery: { maximumMastery: 5 },
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [
          { techniqueId: BASIC },
          { techniqueId: INTERMEDIATE },
          { techniqueId: "test-parallel-school" },
        ],
      }),
    );

    /* 10 base DEX, +1 from Basic once, +2 from Intermediate. */
    expect(resolved.attributes.base.dex).toBe(13);

    /* Both heirs are recorded as replacing it; only one carries it. */
    expect(resolved.capabilities.techniques[BASIC]?.subsumedBy).toHaveLength(2);
  });
});
