/*
 * Executable Skill applications.
 *
 * The claim under test is a separation: possession is permanent and settled
 * once, usability is asked afresh every time, and losing what a Skill needs to
 * WORK must never touch what the character HAS. The Fire Blast trio below is
 * the whole ticket in three tests — available, inaccessible, available again,
 * with the Skill on the sheet throughout and nothing written in either
 * direction.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  NO_STRUCTURED_ACTION_COST,
  UNSTRUCTURED_EXECUTION,
  findActionProfileIssues,
  profileThreatensDeclaredTargets,
  structuredActionCostFor,
} from "../actions";

import {
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  registerDefinition,
} from "../character/catalogs";

import {
  buildSkillActionProfile,
  resolveSkillApplication,
} from "../character/capabilities/application-resolution";

import {
  findSkillApplicationIssues,
  resolveEffectiveSkillApplication,
  skillAuraCostFields,
  skillResolutionApproach,
  type SkillApplicationDefinition,
} from "../character/capabilities/applications";

import {
  resolveSkillApplicationRequirements,
  satisfiesSkillApplicationRequirements,
  satisfiesSkillRequirements,
} from "../character/capabilities/validation";

import {
  findSkillCatalogIssues,
  getSkillDefinition,
  SKILL_DEFINITIONS,
} from "../character/capabilities/skills";

import { TECHNIQUE_DEFINITIONS } from "../character/capabilities/techniques";

import { resolveCapabilities } from "../character/capabilities/resolution";

import type { MasteryTrack } from "../character/capabilities/mastery";

import type { RequirementContext } from "../character/rules/resolution";

import { getEngineDecision } from "../decisions/log";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/* ── Test material ──────────────────────────────────────────────────────── */

/*
 * The smallest coherent application. Written out once so that a test about
 * duplicate requirement ids is not also a test about everything else.
 */
const MINIMAL_APPLICATION: SkillApplicationDefinition = {
  action: {
    allowedTimings: ["action"],
    structuredActionCost: { actions: 1 },
    targets: { cardinality: { minimum: 0, maximum: 0 } },
    executionDuration: 1000,
  },
  role: "utility",
  cost: { exertionLoad: 0 },
  check: { kind: "automatic" },
  outcome: {
    kind: "automatic",
    outcome: { id: "done", summary: "It happens." },
  },
};

function applicationOf(
  overrides: Partial<SkillApplicationDefinition>,
): SkillApplicationDefinition {
  return { ...MINIMAL_APPLICATION, ...overrides };
}

function issuesFor(
  application: SkillApplicationDefinition,
  track: MasteryTrack | undefined = { maximumMastery: 5 },
): readonly string[] {
  return findSkillApplicationIssues("test-skill", application, track)
    .map((error) => error.code);
}

/*
 * The same question asked of a Skill with no Mastery track.
 *
 * A separate function rather than `issuesFor(application, undefined)`, because
 * an explicit `undefined` argument triggers a default parameter and would have
 * quietly asked about a five-rank track instead.
 */
function tracklessIssuesFor(
  application: SkillApplicationDefinition,
): readonly string[] {
  return findSkillApplicationIssues("test-skill", application, undefined)
    .map((error) => error.code);
}

/** A context that records everything and has nothing in it. */
function emptyContext(
  overrides: Partial<RequirementContext> = {},
): RequirementContext {
  const attributes = {
    agi: 10, dex: 10, con: 10, vit: 10,
    int: 10, wis: 10, per: 10, spi: 10, cha: 10,
  };

  return {
    attributes: { stored: attributes, base: attributes, resolved: attributes },
    level: 1,
    traitIds: [],
    skillIds: [],
    techniqueIds: [],
    ...overrides,
  };
}


/* ── 1. The authored catalog ────────────────────────────────────────────── */

describe("every authored Skill carries a valid application", () => {
  const AUTHORED = [
    "punch",
    "parry",
    "defensive-stance",
    "pick-lock",
    "fire-blast",
  ] as const;

  it("declares one for each of the five", () => {
    for (const id of AUTHORED) {
      expect(getSkillDefinition(id)?.application).toBeDefined();
    }
  });

  it("passes catalog validation, including at every declared rank", () => {
    expect(findSkillCatalogIssues()).toEqual([]);
  });

  it("still resolves every reference an application requirement names", () => {
    /*
     * Fire Blast's execution requirement names the Firebending Trait by id.
     * An id only read at execution time is exactly the one a typo survives in,
     * so catalogs.ts walks the application bundle alongside the acquisition
     * one.
     */
    expect(findCatalogReferenceIssues()).toEqual([]);

    registerDefinition("skill", {
      id: "test-typo",
      name: "Typo",
      description: "A Skill whose execution requirement names nothing.",
      application: applicationOf({
        requirements: [
          {
            id: "missing",
            requirement: { type: "hasTrait", traitId: "not-a-trait" },
          },
        ],
      }),
    });

    expect(findCatalogReferenceIssues().join("\n")).toContain("(application)");
  });

  it("keeps timing on the application and nowhere else", () => {
    /*
     * The dual-support failure this ticket exists to avoid: a flat `timings`
     * beside a nested one is two answers for a scheduler, and the flat one
     * wins by being read first.
     */
    for (const definition of Object.values(SKILL_DEFINITIONS)) {
      expect(definition).not.toHaveProperty("timings");
    }
  });

  it("gives Techniques no executable application at all", () => {
    /*
     * Techniques are passive: they widen what a character may learn and
     * contribute effects, and nothing about them is attempted. An application
     * field on one would be an execution path for something that is never
     * executed — and a private second one would be worse.
     */
    for (const definition of Object.values(TECHNIQUE_DEFINITIONS)) {
      expect(definition).not.toHaveProperty("application");
      expect(definition).not.toHaveProperty("preparation");
    }
  });
});


/* ── 2-3. Validation ────────────────────────────────────────────────────── */

describe("application validation refuses incoherent contracts", () => {
  it("rejects duplicate application requirement ids", () => {
    const codes = issuesFor(applicationOf({
      requirements: [
        { id: "fire", requirement: { type: "hasTrait", traitId: "firebending" } },
        { id: "fire", requirement: { type: "hasTrait", traitId: "waterbending" } },
      ],
    }));

    expect(codes).toContain("capabilities.application.requirement.id.duplicate");
  });

  it("rejects an unidentified application requirement", () => {
    const codes = issuesFor(applicationOf({
      requirements: [
        {
          id: "",
          requirement: { type: "hasTrait", traitId: "firebending" },
        },
      ],
    }));

    expect(codes).toContain("capabilities.application.requirement.id.missing");
  });

  it("rejects an unknown timing", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        allowedTimings: ["bonus" as "action"],
      },
    }));

    expect(codes).toContain("actions.timing.invalid");
  });

  it("rejects a fractional Action cost", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        structuredActionCost: { actions: 0.5 },
      },
    }));

    expect(codes).toContain("actions.cost.actions.invalid");
  });

  it("rejects an inverted target cardinality", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        targets: { cardinality: { minimum: 2, maximum: 1 } },
      },
    }));

    expect(codes).toContain("targeting.cardinality.inverted");
  });

  it("rejects an inverted Range", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        range: { kind: "direct", minimumMetres: 10, maximumMetres: 2 },
      },
    }));

    expect(codes).toContain("spatial.interval.inverted");
  });

  it("rejects travel at zero speed", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        travel: { kind: "speed", metresPerSecond: 0 },
      },
    }));

    expect(codes).toContain("spatial.travel.speed.invalid");
  });

  it("rejects a negative exertion load", () => {
    const codes = issuesFor(applicationOf({ cost: { exertionLoad: -1 } }));

    expect(codes).toContain("capabilities.application.cost.exertion.invalid");
  });

  it("rejects a negative Aura cost and an Aura cost that asks for nothing", () => {
    expect(issuesFor(applicationOf({
      cost: { exertionLoad: 0, aura: { baseAuraCost: -5 } },
    }))).toContain("capabilities.application.cost.aura.base.invalid");

    expect(issuesFor(applicationOf({
      cost: { exertionLoad: 0, aura: {} },
    }))).toContain("capabilities.application.cost.aura.empty");
  });

  it("rejects a check that names no known scope", () => {
    const codes = issuesFor(applicationOf({
      check: {
        kind: "fixed",
        scope: { kind: "attribute", attribute: "luck" as "dex" },
      },
      outcome: {
        kind: "fixed",
        success: { id: "s", summary: "Yes." },
        failure: { id: "f", summary: "No." },
      },
    }));

    expect(codes).toContain("capabilities.application.check.scope.invalid");
  });

  it("rejects an opposed check that does not say who wins a tie", () => {
    const codes = issuesFor(applicationOf({
      check: {
        kind: "opposed",
        initiatorScope: { kind: "attribute", attribute: "dex" },
        opponentScope: { kind: "attribute", attribute: "agi" },
        tiesFavor: "nobody" as "initiator",
      },
      outcome: {
        kind: "opposed",
        winner: { id: "w", summary: "Won." },
        loser: { id: "l", summary: "Lost." },
      },
    }));

    expect(codes).toContain("capabilities.application.check.ties-favor.invalid");
  });

  it("rejects an outcome the check can never select", () => {
    /*
     * A success/failure pair behind an automatic check reads perfectly well and
     * describes two branches nothing will ever choose between.
     */
    const codes = issuesFor(applicationOf({
      check: { kind: "automatic" },
      outcome: {
        kind: "fixed",
        success: { id: "s", summary: "Yes." },
        failure: { id: "f", summary: "No." },
      },
    }));

    expect(codes).toContain("capabilities.application.outcome.check-mismatch");
  });

  it("rejects an unnamed outcome branch and an empty guidance list", () => {
    expect(issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: { id: "", summary: "It happens." },
      },
    }))).toContain("capabilities.application.outcome.id.missing");

    expect(issuesFor(applicationOf({
      check: { kind: "adjudicated" },
      outcome: { kind: "guided-narrative", guidance: [] },
    }))).toContain("capabilities.application.outcome.guidance.empty");
  });

  it("rejects an unknown mechanical role", () => {
    const codes = issuesFor(applicationOf({
      role: "vibes" as "utility",
    }));

    expect(codes).toContain("capabilities.application.role.invalid");
  });
});


/* ── 4-8. Live availability ─────────────────────────────────────────────── */

describe("live application availability", () => {
  const firebender = (traits: readonly string[]) =>
    resolveTestCharacter(createTestCharacter({
      traits: traits.map((traitId) => ({ traitId })),
      techniques: [{ techniqueId: "firebending-forms" }],
      skills: [{ skillId: "fire-blast", mastery: 2 }],
    }));

  const resolveFor = (
    resolved: ReturnType<typeof resolveTestCharacter>,
    skillId = "fire-blast",
  ) => resolveSkillApplication({
    skillId,
    capabilities: resolved.capabilities,
    context: resolved.requirementContext,
  });

  it("makes a held Skill with satisfied execution requirements available", () => {
    const result = resolveFor(firebender(["firebending"]));

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("available");
    expect(result.payload.mastery).toBe(2);
    expect(result.payload.application).toBeDefined();

    /* The divergence is named on the trace, not only in the decision log. */
    expect(getEngineDecision(result.trace.root.decisionId ?? "")).toBeDefined();
    expect(result.payload.requirements).toEqual([
      expect.objectContaining({ id: "fire-control", disposition: "satisfied" }),
    ]);
  });

  it("keeps a retained Skill possessed while making it inaccessible", () => {
    const resolved = firebender([]);

    const result = resolveFor(resolved);

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("requirements-unsatisfied");
    expect(result.payload.application).toBeUndefined();

    /*
     * The half that matters. The Skill is still on the sheet, still held, and
     * still at the rank they trained — losing Fire Control took away the use
     * of Fire Blast and not one thing more.
     */
    expect(resolved.capabilities.skills["fire-blast"]?.availability)
      .toBe("available");
    expect(result.payload.mastery).toBe(2);
  });

  it("restores access when the Trait comes back, with nothing rewritten", () => {
    expect(resolveFor(firebender([])).success).toBe(true);

    const restored = resolveFor(firebender(["firebending"]));

    expect(restored.success).toBe(true);

    if (!restored.success) return;

    expect(restored.payload.disposition).toBe("available");
  });

  it("does not treat an unrecorded Trait list as a refusal", () => {
    /*
     * "You lack that Trait" and "nobody has said what Traits you have" have
     * different remedies, and only the first is a no. A host that collapses
     * them greys out a Skill the character may well be able to use.
     */
    const result = resolveSkillApplication({
      skillId: "fire-blast",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "fire-blast", mastery: 1 }],
      }),
      context: emptyContext({ traitIds: [], incomplete: ["traits"] }),
    });

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("requirements-unresolved");
    expect(result.payload.application).toBeUndefined();
  });

  it("refuses to execute a Skill that is only unlocked", () => {
    /*
     * An unlock is permission, not possession. The Skill is in the resolved
     * record so its offer can be reported, and reading presence as possession
     * is what would turn every invitation into a grant.
     */
    const capabilities = resolveCapabilities({
      skillGrants: [
        {
          skillId: "pick-lock",
          source: { type: "clan", id: "test-clan" },
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    expect(capabilities.skills["pick-lock"]?.availability).toBe("inaccessible");

    const result = resolveSkillApplication({
      skillId: "pick-lock",
      capabilities,
      context: emptyContext(),
    });

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("skill-not-held");
    expect(result.payload.mastery).toBeUndefined();
    expect(result.payload.application).toBeUndefined();
  });

  it("keeps a subsumed Skill executable through the one that replaced it", () => {
    registerDefinition("skill", {
      id: "test-heavy-punch",
      name: "Heavy Punch",
      description: "A Skill that replaces Punch.",
      subsumes: ["punch"],
      mastery: { maximumMastery: 5 },
      application: applicationOf({}),
    });

    const capabilities = resolveCapabilities({
      authoredSkills: [
        { skillId: "punch", mastery: 3 },
        { skillId: "test-heavy-punch", mastery: 1 },
      ],
    });

    expect(capabilities.skills["punch"]?.availability).toBe("subsumed");

    const result = resolveSkillApplication({
      skillId: "punch",
      capabilities,
      context: emptyContext(),
    });

    expect(result.success).toBe(true);

    if (!result.success) return;

    /* Held through the successor: the character still has it, so they may use it. */
    expect(result.payload.disposition).toBe("available");
    expect(result.payload.mastery).toBe(3);
  });

  it("fails structurally on an unknown Skill and on one with no application", () => {
    const unknown = resolveSkillApplication({
      skillId: "not-a-skill",
      capabilities: resolveCapabilities({}),
      context: emptyContext(),
    });

    expect(unknown.success).toBe(false);

    if (!unknown.success) {
      expect(unknown.errors[0].code)
        .toBe("capabilities.application.skill.unknown");
    }

    registerDefinition("skill", {
      id: "test-contractless",
      name: "Contractless",
      description: "A Skill nobody said how to use.",
    });

    const contractless = resolveSkillApplication({
      skillId: "test-contractless",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "test-contractless" }],
      }),
      context: emptyContext(),
    });

    expect(contractless.success).toBe(false);

    if (!contractless.success) {
      expect(contractless.errors[0].code).toBe("capabilities.application.absent");
    }
  });
});


describe("the two requirement lists are asked separately", () => {
  it("keeps acquisition and execution answers independent", () => {
    const definition = getSkillDefinition("fire-blast");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    /*
     * A character who learned Fire Blast and has since lost the Trait: the
     * acquisition question and the execution question are asked of two
     * different lists, and only one of them is about the present.
     */
    const lapsed = emptyContext({
      traitIds: [],
      techniqueIds: ["firebending-forms"],
    });

    expect(satisfiesSkillRequirements(definition, lapsed)).toBe(false);
    expect(satisfiesSkillApplicationRequirements(definition, lapsed)).toBe(false);

    const restored = emptyContext({
      traitIds: ["firebending"],
      techniqueIds: ["firebending-forms"],
    });

    expect(satisfiesSkillApplicationRequirements(definition, restored)).toBe(true);
    expect(resolveSkillApplicationRequirements(definition, restored))
      .toBe("satisfied");
  });

  it("treats a Skill with no execution requirements as usable by anyone holding it", () => {
    const punch = getSkillDefinition("punch");

    expect(punch).toBeDefined();

    if (punch === undefined) return;

    expect(resolveSkillApplicationRequirements(punch, emptyContext()))
      .toBe("satisfied");
  });
});


/* ── 9-12. Mastery ──────────────────────────────────────────────────────── */

describe("Mastery changes what using a Skill looks like", () => {
  it("resolves a trackless Skill with mastery null and applies nothing", () => {
    registerDefinition("skill", {
      id: "test-door-rune",
      name: "Door Rune",
      description: "A Skill with no Mastery at all.",
      application: applicationOf({}),
    });

    const result = resolveSkillApplication({
      skillId: "test-door-rune",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "test-door-rune" }],
      }),
      context: emptyContext(),
    });

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("available");
    expect(result.payload.mastery).toBeNull();
    expect(result.payload.application?.appliedMasteryChanges).toEqual([]);
  });

  it("applies changes cumulatively and stops at the held rank", () => {
    const application = getSkillDefinition("pick-lock")?.application;

    expect(application).toBeDefined();

    if (application === undefined) return;

    const base = resolveEffectiveSkillApplication(application, 1);
    const middle = resolveEffectiveSkillApplication(application, 3);
    const top = resolveEffectiveSkillApplication(application, 5);

    /* III halves the time; V additionally makes it cost no Action. */
    expect(base.action.executionDuration).toBe(60000);
    expect(base.action.structuredActionCost.actions).toBe(1);

    expect(middle.action.executionDuration).toBe(30000);
    expect(middle.action.structuredActionCost.actions).toBe(1);
    expect(middle.appliedMasteryChanges).toEqual([3]);

    expect(top.action.executionDuration).toBe(30000);
    expect(top.action.structuredActionCost.actions).toBe(0);
    expect(top.appliedMasteryChanges).toEqual([3, 5]);
  });

  it("applies thresholds in ascending order regardless of authored order", () => {
    /*
     * "add 2 then cap at 3" and "cap at 3 then add 2" are different answers, so
     * the order cannot be the order the array happened to be written in.
     */
    const application = applicationOf({
      cost: { exertionLoad: 1 },
      masteryChanges: [
        { minimumMastery: 4, changes: [{ op: "cap", field: "exertionLoad", maximum: 2 }] },
        { minimumMastery: 2, changes: [{ op: "add", field: "exertionLoad", amount: 4 }] },
      ],
    });

    expect(resolveEffectiveSkillApplication(application, 2).cost.exertionLoad)
      .toBe(5);
    expect(resolveEffectiveSkillApplication(application, 4).cost.exertionLoad)
      .toBe(2);
  });

  it("refuses Mastery changes on a Skill with no Mastery track", () => {
    const codes = tracklessIssuesFor(applicationOf({
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{ op: "add", field: "exertionLoad", amount: 1 }],
        },
      ],
    }));

    expect(codes).toContain("capabilities.application.mastery.unsupported");
  });

  it("refuses out-of-range and duplicate Mastery thresholds", () => {
    expect(issuesFor(applicationOf({
      masteryChanges: [
        {
          minimumMastery: 9,
          changes: [{ op: "add", field: "exertionLoad", amount: 1 }],
        },
      ],
    }))).toContain("capabilities.application.mastery.threshold.out-of-range");

    expect(issuesFor(applicationOf({
      masteryChanges: [
        {
          minimumMastery: 3,
          changes: [{ op: "add", field: "exertionLoad", amount: 1 }],
        },
        {
          minimumMastery: 3,
          changes: [{ op: "add", field: "exertionLoad", amount: 2 }],
        },
      ],
    }))).toContain("capabilities.application.mastery.threshold.duplicate");
  });

  it("refuses a change to a field the base application does not declare", () => {
    /*
     * The silent no-op is the worst kind of authoring bug in a Mastery track:
     * the rank looks like it does something, and a player has spent Growth
     * Points to reach it.
     */
    const codes = issuesFor(applicationOf({
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{ op: "add", field: "rangeMaximumMetres", amount: 5 }],
        },
      ],
    }));

    expect(codes).toContain("capabilities.application.mastery.field.absent");
  });

  it("refuses to prohibit a focus kind the base leaves unrestricted", () => {
    const codes = issuesFor(applicationOf({
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [
            { op: "prohibit", permission: { kind: "focus", focus: "area" } },
          ],
        },
      ],
    }));

    expect(codes)
      .toContain("capabilities.application.mastery.permission.unrestricted");
  });

  it("catches a rank that drives the application invalid", () => {
    /*
     * Validated by projecting each declared rank, so a change that makes the
     * Action cost negative fails at catalog time rather than on the first
     * character to reach that rank.
     */
    const codes = issuesFor(applicationOf({
      masteryChanges: [
        {
          minimumMastery: 3,
          changes: [
            { op: "add", field: "structuredActionCost", amount: -3 },
          ],
        },
      ],
    }));

    expect(codes).toContain("actions.cost.actions.invalid");
  });

  it("permits a timing a rank opens up", () => {
    const application = applicationOf({
      masteryChanges: [
        {
          minimumMastery: 3,
          changes: [
            { op: "permit", permission: { kind: "timing", timing: "reaction" } },
          ],
        },
      ],
    });

    expect(issuesFor(application)).toEqual([]);

    expect(resolveEffectiveSkillApplication(application, 3).action.allowedTimings)
      .toEqual(["action", "reaction"]);
  });
});


/* ── 13-14. Projection into neutral action profiles ─────────────────────── */

describe("an available application projects into a neutral action profile", () => {
  const heldPickLock = () => resolveSkillApplication({
    skillId: "pick-lock",
    capabilities: resolveCapabilities({
      authoredSkills: [{ skillId: "pick-lock", mastery: 1 }],
    }),
    context: emptyContext(),
  });

  it("projects pick-lock, charging no Action outside structured time", () => {
    const resolved = heldPickLock();

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    const built = buildSkillActionProfile(resolved.payload);

    expect(built.success).toBe(true);

    if (!built.success) return;

    const profile = built.payload;

    expect(findActionProfileIssues(profile)).toEqual([]);
    expect(profile.id).toBe("skill:pick-lock");
    expect(profile.source).toEqual({ type: "skill", id: "pick-lock" });
    expect(profile.check).toEqual({ scope: { kind: "attribute", attribute: "dex" } });

    /*
     * Outside structured time there is no Round to charge, and the profile's
     * own cost is unchanged — the action is not cheaper, there is simply
     * nothing to bill.
     */
    expect(structuredActionCostFor(profile, UNSTRUCTURED_EXECUTION))
      .toEqual(NO_STRUCTURED_ACTION_COST);
    expect(profile.structuredActionCost).toEqual({ actions: 1 });

    /* And the costs that ARE real outside Combat survive untouched. */
    expect(resolved.payload.application?.cost.exertionLoad).toBe(0.25);
    expect(profileThreatensDeclaredTargets(profile)).toBe(false);
  });

  it("projects punch as a structured Action that threatens its targets", () => {
    const resolved = resolveSkillApplication({
      skillId: "punch",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "punch", mastery: 1 }],
      }),
      context: emptyContext(),
    });

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    const built = buildSkillActionProfile(resolved.payload);

    expect(built.success).toBe(true);

    if (!built.success) return;

    const profile = built.payload;

    expect(findActionProfileIssues(profile)).toEqual([]);
    expect(profile.allowedTimings).toEqual(["action"]);
    expect(structuredActionCostFor(profile, { kind: "structured", timing: "action" }))
      .toEqual({ actions: 1 });
    expect(profileThreatensDeclaredTargets(profile)).toBe(true);

    /* The initiator's scope is what the profile carries for an opposed check. */
    expect(profile.check)
      .toEqual({ scope: { kind: "derivedAttribute", derivedAttribute: "accuracy" } });
  });

  it("refuses to build a profile for an unavailable application", () => {
    const resolved = resolveSkillApplication({
      skillId: "fire-blast",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "fire-blast", mastery: 1 }],
      }),
      context: emptyContext(),
    });

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    expect(resolved.payload.disposition).toBe("requirements-unsatisfied");

    const built = buildSkillActionProfile(resolved.payload);

    expect(built.success).toBe(false);

    if (built.success) return;

    expect(built.errors[0].code).toBe("capabilities.application.unavailable");
  });

  it("carries the Aura cost in the fields the real request takes", () => {
    const application = getSkillDefinition("fire-blast")?.application;

    expect(application).toBeDefined();

    if (application === undefined) return;

    const effective = resolveEffectiveSkillApplication(application, 3);

    /* III buys reach with fuel: +5 m and +5 Aura, cumulative from the base. */
    expect(effective.action.range?.maximumMetres).toBe(20);
    expect(skillAuraCostFields(effective.cost)).toEqual({
      exertionLoad: 2,
      baseAuraCost: 15,
      requiredOutput: 5,
    });
  });

  it("derives the resolution approach rather than storing a second one", () => {
    expect(skillResolutionApproach({
      kind: "automatic",
      outcome: { id: "a", summary: "It happens." },
    })).toBe("mechanical");

    expect(skillResolutionApproach({
      kind: "guided-narrative",
      guidance: [{ id: "g", summary: "Consider the guard's mood." }],
    })).toBe("guided-narrative");

    expect(skillResolutionApproach({ kind: "free-adjudication" }))
      .toBe("free-adjudication");
  });
});


/* ── 16. Purity ─────────────────────────────────────────────────────────── */

describe("resolution and projection mutate nothing", () => {
  it("leaves the authored definition byte-identical", () => {
    const before = JSON.stringify(getSkillDefinition("pick-lock"));

    const resolved = resolveTestCharacter(createTestCharacter({
      techniques: [{ techniqueId: "lockpicking" }],
      skills: [{ skillId: "pick-lock", mastery: 5 }],
    }));

    const result = resolveSkillApplication({
      skillId: "pick-lock",
      capabilities: resolved.capabilities,
      context: resolved.requirementContext,
    });

    expect(result.success).toBe(true);

    if (!result.success) return;

    const built = buildSkillActionProfile(result.payload);

    expect(built.success).toBe(true);

    /* Rank V capped the Action cost to zero on the DERIVED value only. */
    expect(result.payload.application?.action.structuredActionCost)
      .toEqual({ actions: 0 });

    expect(JSON.stringify(getSkillDefinition("pick-lock"))).toBe(before);
  });

  it("leaves the resolved capabilities and the context alone", () => {
    const resolved = resolveTestCharacter(createTestCharacter({
      traits: [{ traitId: "firebending" }],
      techniques: [{ techniqueId: "firebending-forms" }],
      skills: [{ skillId: "fire-blast", mastery: 4 }],
    }));

    const capabilitiesBefore = JSON.stringify(resolved.capabilities);
    const contextBefore = JSON.stringify(resolved.requirementContext);

    resolveSkillApplication({
      skillId: "fire-blast",
      capabilities: resolved.capabilities,
      context: resolved.requirementContext,
    });

    expect(JSON.stringify(resolved.capabilities)).toBe(capabilitiesBefore);
    expect(JSON.stringify(resolved.requirementContext)).toBe(contextBefore);
  });
});
