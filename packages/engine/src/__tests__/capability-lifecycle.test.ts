/*
 * The capability lifecycle: five different ways to "have" something.
 *
 * Owning it, being lent it, being permitted to learn it, being awarded it, and
 * retaining it after whatever justified it is gone. The engine recorded all
 * five identically before this ticket, so selling an Item and forgetting a
 * discipline were the same event, and losing a prerequisite unlearned a Skill
 * that had already been learned.
 *
 * These tests pin the differences. The one that matters most is the last: an
 * acquisition requirement is a question asked at a moment, not a lease the
 * engine re-reads forever.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  commitCapabilityAwards,
  commitCapabilityAwardsToCharacter,
  capabilityGrantMode,
  DEFAULT_CAPABILITY_GRANT_MODE,
  evaluateCapabilityAcquisition,
  isHeldCapability,
} from "../character/capabilities/lifecycle";

import { evaluateAcquisition } from "../character/capabilities/dependencies";

import {
  getResolvedSkillMastery,
  getResolvedTechniqueMastery,
  hasResolvedSkill,
  hasResolvedTechnique,
  resolveCapabilities,
} from "../character/capabilities/resolution";

import { resolveTraits } from "../character/identity/traits";

import { validateCharacter } from "../character/validation";

import type { Character } from "../character/types";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

/* ── Test content ───────────────────────────────────────────────────────── */

const LENT = "test-lent-skill";
const CLAN_STYLE = "test-clan-style";
const EARNED = "test-earned-trait";
const GATE = "test-gate-trait";
const GATED = "test-gated-skill";
const INNER = "test-inner-style";
const OFFERED = "test-offered-technique";

function registerLifecycleContent(): void {
  registerDefinition("skill", {
    id: LENT,
    name: "Lent Skill",
    description: "A test Skill something else supplies.",
    timings: ["action"],
    mastery: { maximumMastery: 3 },
  });

  registerDefinition("skill", {
    id: CLAN_STYLE,
    name: "Clan Style",
    description: "A test Skill a Clan permits rather than teaches.",
    timings: ["action"],
    mastery: { maximumMastery: 3 },
  });

  registerDefinition("trait", {
    id: EARNED,
    name: "Earned Trait",
    description: "A test Trait awarded permanently.",
    effects: [{ type: "modifyBaseAttribute", attribute: "vit", amount: 1 }],
  });

  registerDefinition("trait", {
    id: GATE,
    name: "Gate Trait",
    description: "A test Trait that other content asks for.",
  });

  registerDefinition("skill", {
    id: GATED,
    name: "Gated Skill",
    description: "A test Skill gated on one Trait.",
    timings: ["action"],
    mastery: { maximumMastery: 3 },
    requirements: [{ type: "hasTrait", traitId: GATE }],
  });

  registerDefinition("skill", {
    id: INNER,
    name: "Inner Style",
    description: "A test Skill gated on a Trait AND on being invited.",
    timings: ["action"],
    mastery: { maximumMastery: 3 },
    requiresUnlock: true,
    requirements: [{ type: "hasTrait", traitId: GATE }],
  });

  registerDefinition("technique", {
    id: OFFERED,
    name: "Offered Discipline",
    description: "A test Technique something offers rather than teaches.",
    mastery: { maximumMastery: 5 },
  });
}

afterEach(() => {
  clearCustomDefinitions();
});

/* ── The default mode ───────────────────────────────────────────────────── */

describe("a grant with no mode is a loan", () => {
  it("reads an omitted mode as granted-while-present", () => {
    expect(capabilityGrantMode(undefined)).toBe("granted-while-present");
    expect(DEFAULT_CAPABILITY_GRANT_MODE).toBe("granted-while-present");
  });

  /*
   * Every grant authored before modes existed meant a loan, so the default is
   * not a convenience — it is the only reading under which existing content
   * still says what it said.
   */
  it("resolves content authored without a mode exactly as before", () => {
    registerLifecycleContent();

    registerDefinition("trait", {
      id: "test-lender",
      name: "Lender",
      description: "A test Trait granting a Skill the old way.",
      effects: [{ type: "grantSkill", skillId: LENT }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "test-lender" }] }),
    );

    const lent = resolved.capabilities.skills[LENT];

    expect(lent?.availability).toBe("available");
    expect(lent?.isGranted).toBe(true);
    expect(lent?.isAuthored).toBe(false);
    expect(lent?.mastery).toBe(1);
    expect(lent?.grantedBy).toEqual([
      {
        source: { type: "trait", id: "test-lender" },
        mode: "granted-while-present",
      },
    ]);
  });
});

/* ── Loans ──────────────────────────────────────────────────────────────── */

describe("a loan lasts exactly as long as its sources", () => {
  it("disappears with the last source that supplied it", () => {
    const withSource = resolveCapabilities({
      skillGrants: [
        {
          source: { type: "item", id: "climbing-gloves" },
          skillId: LENT,
          mode: "granted-while-present",
        },
      ],
    });

    const without = resolveCapabilities({});

    expect(hasResolvedSkill(withSource, LENT)).toBe(true);
    expect(hasResolvedSkill(without, LENT)).toBe(false);
    expect(without.skills[LENT]).toBeUndefined();
  });

  it("survives the loss of one source while another still supplies it", () => {
    const withOne = resolveCapabilities({
      skillGrants: [
        {
          source: { type: "item", id: "climbing-gloves" },
          skillId: LENT,
          mode: "granted-while-present",
        },
      ],
    });

    expect(hasResolvedSkill(withOne, LENT)).toBe(true);
  });

  it("leaves an authored capability untouched when a grant goes", () => {
    const resolved = resolveCapabilities({
      authoredSkills: [{ skillId: LENT, mastery: 3 }],
    });

    const lent = resolved.skills[LENT];

    expect(lent?.isAuthored).toBe(true);
    expect(lent?.isGranted).toBe(false);
    expect(lent?.availability).toBe("available");
    expect(lent?.mastery).toBe(3);
  });

  /*
   * Provenance has to stay per-source, not per-capability. A character asking
   * why they still have something after selling the Item needs both entries,
   * and needs to be able to tell a loan from an award.
   */
  it("keeps every source independently traceable, mode included", () => {
    const resolved = resolveCapabilities({
      skillGrants: [
        {
          source: { type: "item", id: "climbing-gloves" },
          skillId: LENT,
          mode: "granted-while-present",
        },
        {
          source: { type: "trait", id: "spider-mutation" },
          skillId: LENT,
          mode: "granted-permanently",
        },
      ],
    });

    expect(resolved.skills[LENT]?.grantedBy).toEqual([
      {
        source: { type: "item", id: "climbing-gloves" },
        mode: "granted-while-present",
      },
      {
        source: { type: "trait", id: "spider-mutation" },
        mode: "granted-permanently",
      },
    ]);
  });

  it("records the same source once however many times it grants", () => {
    const grant = {
      source: { type: "item", id: "climbing-gloves" },
      skillId: LENT,
      mode: "granted-while-present",
    } as const;

    const resolved = resolveCapabilities({ skillGrants: [grant, grant] });

    expect(resolved.skills[LENT]?.grantedBy).toHaveLength(1);
  });
});

/* ── Unlocks ────────────────────────────────────────────────────────────── */

describe("an unlock is permission, not possession", () => {
  it("records the offer without granting access", () => {
    registerLifecycleContent();

    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait opening a style to its holder.",
      effects: [
        {
          type: "grantSkill",
          skillId: CLAN_STYLE,
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "test-clan-membership" }] }),
    );

    const style = resolved.capabilities.skills[CLAN_STYLE];

    expect(style?.availability).toBe("inaccessible");
    expect(style?.isGranted).toBe(false);
    expect(style?.isAuthored).toBe(false);
    expect(style?.mastery).toBeNull();
    expect(style?.unlockedBy).toEqual([
      { type: "trait", id: "test-clan-membership" },
    ]);

    /* Not held, so it satisfies no requirement and appears in no id list. */
    expect(hasResolvedSkill(resolved.capabilities, CLAN_STYLE)).toBe(false);
    expect(resolved.requirementContext.skillIds).not.toContain(CLAN_STYLE);
    expect(isHeldCapability(style!)).toBe(false);
  });

  it("marks the capability as unlocked for acquisition purposes", () => {
    registerLifecycleContent();

    const evaluation = evaluateAcquisition(
      { kind: "skill", id: CLAN_STYLE },
      resolveTestCharacter(createTestCharacter()).requirementContext,
      [{ type: "clan", id: "kurta" }],
    );

    expect(evaluation.unlocked).toBe(true);
    expect(evaluation.disposition).toBe("satisfied");
  });

  /*
   * The acquisition was the character's. Whatever permitted it has no claim on
   * it afterwards — a Clan that expels a member does not unlearn their style.
   */
  it("leaves an acquired capability alone when the unlock goes", () => {
    registerLifecycleContent();

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: CLAN_STYLE, mastery: 2 }] }),
    );

    const style = resolved.capabilities.skills[CLAN_STYLE];

    expect(style?.availability).toBe("available");
    expect(style?.unlockedBy).toEqual([]);
    expect(style?.mastery).toBe(2);
  });

  it("adds nothing to a character who is merely offered it", () => {
    registerLifecycleContent();

    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait opening a style to its holder.",
      effects: [
        {
          type: "grantSkill",
          skillId: CLAN_STYLE,
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "test-clan-membership" }] }),
    );

    expect(resolved.capabilityAwards).toEqual([]);
  });
});

/* ── Permanent awards ───────────────────────────────────────────────────── */

describe("a permanent grant is an award", () => {
  function awardingCharacter(): Character {
    registerLifecycleContent();

    registerDefinition("trait", {
      id: "test-ordeal",
      name: "Ordeal",
      description: "A test Trait that permanently awards another.",
      effects: [
        { type: "grantTrait", traitId: EARNED, mode: "granted-permanently" },
      ],
    });

    return createTestCharacter({ traits: [{ traitId: "test-ordeal" }] });
  }

  it("produces an award a caller can persist", () => {
    const resolved = resolveTestCharacter(awardingCharacter());

    expect(resolved.capabilityAwards).toEqual([
      {
        capability: { kind: "trait", id: EARNED },
        source: { type: "trait", id: "test-ordeal" },
      },
    ]);
  });

  it("gives access straight away, without waiting to be written down", () => {
    const resolved = resolveTestCharacter(awardingCharacter());

    expect(resolved.traits[EARNED]?.availability).toBe("available");
    expect(resolved.traits[EARNED]?.isAuthored).toBe(false);
    expect(resolved.attributes.base.vit).toBe(11);
  });

  /*
   * RESOLUTION DOES NOT WRITE. The award comes back as data and the caller
   * commits it, which is what keeps resolveCharacter pure — and what makes it
   * safe to resolve a character a hundred times while a player edits them.
   */
  it("never edits the character it was resolved from", () => {
    const character = awardingCharacter();

    const before = JSON.stringify(character);

    resolveTestCharacter(character);

    expect(JSON.stringify(character)).toBe(before);
    expect(character.traits).toEqual([{ traitId: "test-ordeal" }]);
  });

  it("commits the award onto the sheet", () => {
    const character = awardingCharacter();

    const resolved = resolveTestCharacter(character);

    const committed = commitCapabilityAwardsToCharacter(
      character,
      resolved.capabilityAwards,
    );

    expect(committed.traits).toEqual([
      { traitId: "test-ordeal" },
      { traitId: EARNED },
    ]);

    expect(resolveTestCharacter(committed).traits[EARNED]?.isAuthored).toBe(true);
  });

  /*
   * The award is reproduced on every resolution for as long as the awarding
   * content applies, so committing twice has to be indistinguishable from
   * committing once — otherwise a Trait awarded by a permanent Injury grows a
   * duplicate entry per save.
   */
  it("is idempotent when the same award is applied again", () => {
    const character = awardingCharacter();

    const once = commitCapabilityAwardsToCharacter(
      character,
      resolveTestCharacter(character).capabilityAwards,
    );

    const twice = commitCapabilityAwardsToCharacter(
      once,
      resolveTestCharacter(once).capabilityAwards,
    );

    expect(twice.traits).toEqual(once.traits);
  });

  it("never overwrites training the character already has", () => {
    const committed = commitCapabilityAwards(
      { traits: [], techniques: [], skills: [{ skillId: LENT, mastery: 3 }] },
      [
        {
          capability: { kind: "skill", id: LENT },
          source: { type: "item", id: "relic" },
        },
      ],
    );

    expect(committed.skills).toEqual([{ skillId: LENT, mastery: 3 }]);
  });

  it("keeps the award after its source is gone, once committed", () => {
    const character = awardingCharacter();

    const committed = commitCapabilityAwardsToCharacter(
      character,
      resolveTestCharacter(character).capabilityAwards,
    );

    /* The ordeal is over; what it left behind is not. */
    const afterwards = resolveTestCharacter({
      ...committed,
      traits: (committed.traits ?? []).filter(
        (trait) => trait.traitId !== "test-ordeal",
      ),
    });

    expect(afterwards.traits[EARNED]?.availability).toBe("available");
    expect(afterwards.traits[EARNED]?.isAuthored).toBe(true);
  });
});

/* ── Acquisition eligibility ────────────────────────────────────────────── */

describe("acquisition eligibility answers three ways", () => {
  it("is satisfied when the prerequisites are met", () => {
    registerLifecycleContent();

    const context = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: GATE }] }),
    ).requirementContext;

    expect(
      evaluateAcquisition({ kind: "skill", id: GATED }, context).disposition,
    ).toBe("satisfied");
  });

  it("is unsatisfied when the sheet is complete and the prerequisite is absent", () => {
    registerLifecycleContent();

    const context = resolveTestCharacter(
      createTestCharacter({ traits: [] }),
    ).requirementContext;

    const evaluation = evaluateAcquisition({ kind: "skill", id: GATED }, context);

    expect(evaluation.disposition).toBe("unsatisfied");
    expect(evaluation.requirements).toEqual([
      {
        requirement: { type: "hasTrait", traitId: GATE },
        disposition: "unsatisfied",
      },
    ]);
  });

  /*
   * An unfinished sheet is not a refusal. Reporting one would tell an author
   * their character fails a prerequisite nobody has established they fail.
   */
  it("is unresolved when the sheet does not record what the requirement reads", () => {
    registerLifecycleContent();

    /* No `traits` key at all — an unrecorded list, not a recorded empty one. */
    const { traits: _unrecorded, ...halfBuilt } = createTestCharacter();

    const context = resolveTestCharacter(halfBuilt).requirementContext;

    expect(
      evaluateAcquisition({ kind: "skill", id: GATED }, context).disposition,
    ).toBe("unresolved");
  });

  it("is unresolved for a capability no catalog knows", () => {
    const context = resolveTestCharacter(createTestCharacter())
      .requirementContext;

    expect(
      evaluateAcquisition({ kind: "skill", id: "no-such-skill" }, context)
        .disposition,
    ).toBe("unresolved");
  });

  it("evaluates requirements handed to it directly, without a catalog", () => {
    const context = resolveTestCharacter(
      createTestCharacter({ traits: [] }),
    ).requirementContext;

    expect(
      evaluateCapabilityAcquisition({
        capability: { kind: "skill", id: "unregistered" },
        requirements: [{ type: "hasTrait", traitId: "firebending" }],
        context,
      }).disposition,
    ).toBe("unsatisfied");
  });

  it("spends nothing and changes nothing", () => {
    registerLifecycleContent();

    const character = createTestCharacter({ traits: [{ traitId: GATE }] });

    const before = JSON.stringify(character);

    evaluateAcquisition(
      { kind: "skill", id: GATED },
      resolveTestCharacter(character).requirementContext,
    );

    expect(JSON.stringify(character)).toBe(before);
  });
});

/* ── Retained ownership ─────────────────────────────────────────────────── */

describe("losing a prerequisite does not unlearn what it gated", () => {
  /*
   * The rule this whole distinction exists for. Losing Fire Control does not
   * erase Flame Lance; it may make Flame Lance unusable, which is an execution
   * question Ticket 3.3 asks of the application rather than of the sheet.
   */
  it("keeps the capability, at its trained Mastery", () => {
    registerLifecycleContent();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [],
        skills: [{ skillId: GATED, mastery: 3 }],
      }),
    );

    const gated = resolved.capabilities.skills[GATED];

    expect(gated?.availability).toBe("available");
    expect(gated?.isAuthored).toBe(true);
    expect(gated?.mastery).toBe(3);
  });

  it("validates the sheet, with a warning rather than a refusal", () => {
    registerLifecycleContent();

    const result = validateCharacter(
      createTestCharacter({
        traits: [],
        skills: [{ skillId: GATED, mastery: 3 }],
      }),
    );

    expect(result.success).toBe(true);

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "character.skill.requirements_unsatisfied",
    );
  });
});

/* ── What an offer is worth to a reader ─────────────────────────────────── */

describe("an offer is reported without being mistaken for a possession", () => {
  function offering(): Character {
    registerLifecycleContent();

    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait offering a Skill and a Technique.",
      effects: [
        {
          type: "grantSkill",
          skillId: CLAN_STYLE,
          mode: "unlocked-for-acquisition",
        },
        {
          type: "grantTechnique",
          techniqueId: OFFERED,
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    return createTestCharacter({ traits: [{ traitId: "test-clan-membership" }] });
  }

  /*
   * `null` is a claim: "they have this, and it has no Mastery." An offer is
   * not a possession, so answering null for one would be the same conflation
   * the three-way Mastery reading was built to remove, one field further
   * along. Undefined is the honest answer.
   */
  it("answers undefined, not null, for the Mastery of an unlocked Skill", () => {
    const resolved = resolveTestCharacter(offering());

    expect(resolved.capabilities.skills[CLAN_STYLE]).toBeDefined();

    expect(
      getResolvedSkillMastery(resolved.capabilities, CLAN_STYLE),
    ).toBeUndefined();
  });

  it("answers the same way for an unlocked Technique", () => {
    const resolved = resolveTestCharacter(offering());

    expect(resolved.capabilities.techniques[OFFERED]).toBeDefined();

    expect(
      getResolvedTechniqueMastery(resolved.capabilities, OFFERED),
    ).toBeUndefined();
  });

  it("still answers null for something held that has no Mastery", () => {
    registerDefinition("skill", {
      id: "test-door-rune",
      name: "Door Rune",
      description: "A test Skill with no Mastery at all.",
      timings: ["action"],
    });

    const resolved = resolveCapabilities({
      authoredSkills: [{ skillId: "test-door-rune" }],
    });

    expect(getResolvedSkillMastery(resolved, "test-door-rune")).toBeNull();
  });

  it("answers undefined for a capability nobody has mentioned", () => {
    expect(
      getResolvedSkillMastery(resolveCapabilities({}), "test-door-rune"),
    ).toBeUndefined();
  });
});


/* ── Two gates ──────────────────────────────────────────────────────────── */

describe("a capability may be gated on permission as well as prerequisites", () => {
  /*
   * The two gates are orthogonal, so neither is the answer on its own: meeting
   * the Attributes does not make an outsider welcome, and being invited does
   * not confer the Attributes. `acquisition` is the decision; `disposition`
   * and `unlocked` are kept so a UI can say which gate is shut, which is the
   * difference between "train DEX" and "get invited".
   */
  it("refuses an unoffered capability whose prerequisites are met", () => {
    registerLifecycleContent();

    const context = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: GATE }] }),
    ).requirementContext;

    const evaluation = evaluateAcquisition({ kind: "skill", id: INNER }, context);

    expect(evaluation.requiresUnlock).toBe(true);
    expect(evaluation.unlocked).toBe(false);

    /* The prerequisites really are met. Permission is what is missing. */
    expect(evaluation.disposition).toBe("satisfied");
    expect(evaluation.acquisition).toBe("unsatisfied");
  });

  it("accepts it once it is offered and the prerequisites are met", () => {
    registerLifecycleContent();

    const context = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: GATE }] }),
    ).requirementContext;

    const evaluation = evaluateAcquisition(
      { kind: "skill", id: INNER },
      context,
      [{ type: "clan", id: "kurta" }],
    );

    expect(evaluation.unlocked).toBe(true);
    expect(evaluation.acquisition).toBe("satisfied");
  });

  it("still refuses an offered capability whose prerequisites are not met", () => {
    registerLifecycleContent();

    const context = resolveTestCharacter(
      createTestCharacter({ traits: [] }),
    ).requirementContext;

    const evaluation = evaluateAcquisition(
      { kind: "skill", id: INNER },
      context,
      [{ type: "clan", id: "kurta" }],
    );

    expect(evaluation.unlocked).toBe(true);
    expect(evaluation.disposition).toBe("unsatisfied");
    expect(evaluation.acquisition).toBe("unsatisfied");
  });

  it("leaves an ungated capability's decision to its prerequisites alone", () => {
    registerLifecycleContent();

    const context = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: GATE }] }),
    ).requirementContext;

    const evaluation = evaluateAcquisition({ kind: "skill", id: GATED }, context);

    expect(evaluation.requiresUnlock).toBe(false);
    expect(evaluation.unlocked).toBe(false);
    expect(evaluation.acquisition).toBe("satisfied");
  });

  /* An unfinished sheet stays unresolved rather than becoming a refusal. */
  it("carries an unresolved prerequisite through to the decision", () => {
    registerLifecycleContent();

    const { traits: _unrecorded, ...halfBuilt } = createTestCharacter();

    const evaluation = evaluateAcquisition(
      { kind: "skill", id: INNER },
      resolveTestCharacter(halfBuilt).requirementContext,
      [{ type: "clan", id: "kurta" }],
    );

    expect(evaluation.acquisition).toBe("unresolved");
  });
});


/* ── Grants create nothing from nothing ─────────────────────────────────── */

describe("a grant cycle needs a seed", () => {
  function registerCycle(): void {
    registerDefinition("trait", {
      id: "test-cycle-a",
      name: "Cycle A",
      description: "A test Trait granting the other half of a cycle.",
      effects: [{ type: "grantTrait", traitId: "test-cycle-b" }],
    });

    registerDefinition("trait", {
      id: "test-cycle-b",
      name: "Cycle B",
      description: "A test Trait granting the first half back.",
      effects: [{ type: "grantTrait", traitId: "test-cycle-a" }],
    });
  }

  it("grants nothing when nothing seeds it", () => {
    registerCycle();

    const resolved = resolveTestCharacter(createTestCharacter({ traits: [] }));

    expect(resolved.traits["test-cycle-a"]).toBeUndefined();
    expect(resolved.traits["test-cycle-b"]).toBeUndefined();
  });

  it("settles on the whole closure once one end is seeded", () => {
    registerCycle();

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "test-cycle-a" }] }),
    );

    expect(resolved.traits["test-cycle-a"]?.isAuthored).toBe(true);
    expect(resolved.traits["test-cycle-b"]?.isGranted).toBe(true);
  });
});

/* ── Nothing that already worked stopped working ────────────────────────── */

describe("existing capability resolution is unchanged", () => {
  it("still hands over the Skills of every Technique rank reached", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts", mastery: 2 }],
      }),
    );

    expect(Object.keys(resolved.capabilities.skills).sort()).toEqual([
      "parry",
      "punch",
    ]);

    expect(resolved.capabilities.skills["punch"]?.availability).toBe("available");
    expect(resolved.capabilities.skills["punch"]?.isGranted).toBe(true);
  });

  it("still keeps trained depth over a grant of the same Skill", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts", mastery: 1 }],
        skills: [{ skillId: "punch", mastery: 5 }],
      }),
    );

    expect(resolved.capabilities.skills["punch"]?.mastery).toBe(5);
  });

  it("still resolves a Trait granted by ancestry", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        species: [{ speciesId: "firebender", percentage: 100 }],
      }),
    );

    expect(resolved.traits["firebending"]?.isGranted).toBe(true);
    expect(resolved.traits["firebending"]?.availability).toBe("available");
  });

  it("still folds authored Traits and granted ones into one record", () => {
    const state = resolveTraits(
      [{ traitId: "one-armed" }],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
          mode: "granted-while-present",
        },
      ],
    );

    expect(Object.keys(state.traits).sort()).toEqual([
      "firebending",
      "one-armed",
    ]);

    expect(state.awards).toEqual([]);
  });

  it("still resolves Techniques and their Mastery unchanged", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "lockpicking", mastery: 4 }],
      }),
    );

    expect(resolved.capabilities.techniques["lockpicking"]?.mastery).toBe(4);
    expect(hasResolvedTechnique(resolved.capabilities, "lockpicking")).toBe(true);
  });
});
