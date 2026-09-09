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
  requiredApplicationContext,
  resolveEffectiveSkillApplication,
  projectSkillAuraCost,
  skillAuraCostNeedsRequestContext,
  skillOutcomeEntries,
  skillOutcomeOutputAmount,
  skillResolutionApproach,
  type EffectiveSkillApplication,
  type SkillApplicationContextValues,
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
  type SkillDefinition,
} from "../character/capabilities/skills";

import { TECHNIQUE_DEFINITIONS } from "../character/capabilities/techniques";

import { resolveCapabilities } from "../character/capabilities/resolution";

import type { DistanceInterval } from "../spatial";

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
    range: { kind: "none" },
    executionDuration: { kind: "fixed", value: 1000 },
  },
  role: "utility",
  cost: { exertionLoad: 0, aura: { kind: "none" } },
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

/*
 * The Mastery demonstration lives here, not in the authored catalog.
 *
 * A rank that halves a cost or doubles an impact is a balance decision, and an
 * authored one is a shipped rule that other content is then balanced against.
 * The MECHANISM has to be exercised; the game design does not have to be
 * invented to exercise it. So Flame Lance is a test Skill with a deliberately
 * arbitrary track: II makes it cheaper in Action economy, III reaches further
 * and costs more Aura, and IV hits harder.
 */
const FLAME_LANCE = "test-flame-lance";

const FLAME_LANCE_APPLICATION: SkillApplicationDefinition = {
  action: {
    allowedTimings: ["action"],
    structuredActionCost: { actions: 2 },
    targets: {
      cardinality: { minimum: 1, maximum: 1 },
      permittedKinds: ["entity"],
    },
    permittedFocusKinds: ["none", "direction"],
    range: {
      kind: "fixed",
      value: { kind: "direct", minimumMetres: 1, maximumMetres: 10 },
    },
    executionDuration: { kind: "fixed", value: 1000 },
    threatens: "declared-targets",
  },
  role: "offense",
  cost: {
    exertionLoad: 2,
    aura: { kind: "fixed", baseAuraCost: 10, requiredOutput: 5 },
  },
  check: { kind: "adjudicated" },
  outcome: {
    kind: "guided-narrative",
    guidance: [
      {
        id: "lance-lands",
        summary: "The lance reaches what it was aimed at.",
        outputs: [
          { id: "lance-impact", amount: 12, summary: "Impact magnitude." },
        ],
      },
      { id: "lance-misses", summary: "The lance goes wide." },
    ],
  },
  masteryChanges: [
    {
      minimumMastery: 2,
      changes: [{ op: "cap", field: "structuredActionCost", maximum: 1 }],
    },
    {
      minimumMastery: 3,
      changes: [
        { op: "add", field: "rangeMaximumMetres", amount: 5 },
        { op: "add", field: "baseAuraCost", amount: 5 },
      ],
    },
    {
      minimumMastery: 4,
      changes: [
        {
          op: "multiply",
          field: "outcomeOutput",
          outcomeId: "lance-lands",
          outputId: "lance-impact",
          factor: 2,
        },
      ],
    },
  ],
};

function registerFlameLance(): void {
  registerDefinition("skill", {
    id: FLAME_LANCE,
    name: "Flame Lance",
    description: "A test Skill whose ranks change how it is used.",
    mastery: { maximumMastery: 5 },
    application: FLAME_LANCE_APPLICATION,
  });
}


/** The Range a resolved application ended up with, when it is a constant. */
function fixedRangeOf(
  application: EffectiveSkillApplication,
): DistanceInterval | undefined {
  const range = application.action.range;

  return range.kind === "fixed" ? range.value : undefined;
}


/*
 * What a caller would work out at the moment of use.
 *
 * Written here rather than authored in the catalog, which is the point: the
 * reach below is one particular body's, and the lockpicking figures are one
 * particular lock's.
 */
const PUNCH_CONTEXT: SkillApplicationContextValues = {
  range: {
    profileId: "body.reach",
    value: { kind: "direct", minimumMetres: 0, maximumMetres: 1.4 },
  },
  executionDuration: { profileId: "combat.action-duration", value: 2000 },
};

const PICK_LOCK_CONTEXT: SkillApplicationContextValues = {
  range: {
    profileId: "task.lockpicking-range",
    value: { kind: "direct", minimumMetres: 0, maximumMetres: 1 },
  },
  executionDuration: { profileId: "task.lockpicking-duration", value: 60000 },
};


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

  it("authors no undecided combat mechanic as a rule", () => {
    /*
     * An authored number is a RULE the moment it ships: players see it, other
     * content is balanced against it, and nobody afterwards can tell a
     * considered value from a placeholder that survived. Combat has no check
     * layer and no calibrated Aura pricing yet, so the combat Skills resolve
     * through a person and Fire Blast prices no Aura, rather than the catalog
     * quietly deciding either.
     */
    for (const id of ["punch", "parry", "fire-blast"] as const) {
      expect(getSkillDefinition(id)?.application?.check.kind).toBe("adjudicated");
    }

    /*
     * And the undecided Aura price is DECLARED undecided rather than left
     * absent — an omitted price is charged as zero, which is a rule, not a
     * gap.
     */
    expect(getSkillDefinition("fire-blast")?.application?.cost.aura.kind)
      .toBe("request-derived");

    /* And no authored Skill ships a Mastery balance decision. */
    for (const id of Object.keys(SKILL_DEFINITIONS)) {
      expect(getSkillDefinition(id)?.application?.masteryChanges)
        .toBeUndefined();
    }

    /* Pick Lock keeps a real check: a lock is not an undecided combat question. */
    expect(getSkillDefinition("pick-lock")?.application?.check.kind)
      .toBe("fixed");
  });

  it("authors no Range, duration or travel literal it has no business choosing", () => {
    /*
     * Requirement 7. Every one of these depends on WHO is acting or WHAT they
     * declared, so the catalog names the profile that must supply it and
     * refuses to invent a number. The one fixed value left is that a fist
     * arrives instantly, which is a fact about fists rather than a figure.
     */
    const contextual: Record<string, readonly string[]> = {
      punch: ["body.reach", "combat.action-duration"],
      parry: ["reaction.trigger-range", "combat.reaction-duration"],
      "defensive-stance": ["combat.action-duration"],
      "pick-lock": ["task.lockpicking-range", "task.lockpicking-duration"],
      "fire-blast": [
        "aura.declared-power.range",
        "combat.action-duration",
        "aura.declared-power.travel",
      ],
    };

    for (const [skillId, profiles] of Object.entries(contextual)) {
      const action = getSkillDefinition(skillId)?.application?.action;

      expect(action).toBeDefined();

      if (action === undefined) continue;

      expect(requiredApplicationContext(action).map((one) => one.profileId))
        .toEqual(profiles);

      /* No authored Range or duration figure survives anywhere. */
      expect(action.range.kind).not.toBe("fixed");
      expect(action.executionDuration.kind).toBe("context-derived");
    }

    /* And the one Skill with no Range says so rather than omitting it. */
    expect(getSkillDefinition("defensive-stance")?.application?.action.range)
      .toEqual({ kind: "none" });

    /* Instantaneous travel is the sole authored constant, and it is not a number. */
    expect(getSkillDefinition("punch")?.application?.action.travel)
      .toEqual({ kind: "fixed", value: { kind: "instantaneous" } });
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
        range: {
          kind: "fixed",
          value: { kind: "direct", minimumMetres: 10, maximumMetres: 2 },
        },
      },
    }));

    expect(codes).toContain("spatial.interval.inverted");
  });

  it("rejects travel at zero speed", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        travel: { kind: "fixed", value: { kind: "speed", metresPerSecond: 0 } },
      },
    }));

    expect(codes).toContain("spatial.travel.speed.invalid");
  });

  it("rejects a negative exertion load", () => {
    const codes = issuesFor(applicationOf({
      cost: { exertionLoad: -1, aura: { kind: "none" } },
    }));

    expect(codes).toContain("capabilities.application.cost.exertion.invalid");
  });

  it("rejects a negative Aura cost and an Aura cost that asks for nothing", () => {
    expect(issuesFor(applicationOf({
      cost: { exertionLoad: 0, aura: { kind: "fixed", baseAuraCost: -5 } },
    }))).toContain("capabilities.application.cost.aura.base.invalid");

    expect(issuesFor(applicationOf({
      cost: { exertionLoad: 0, aura: { kind: "fixed" } },
    }))).toContain("capabilities.application.cost.aura.empty");
  });

  it("rejects an application that states no Range at all", () => {
    /*
     * What host JSON written against the old optional shape looks like.
     * Reading a missing Range as "no distance requirement" would be the
     * permissive answer to a question nobody answered — a Skill usable from
     * anywhere — which is the same conflation the Aura cost union removed.
     */
    const { range: _range, ...action } = MINIMAL_APPLICATION.action;

    const codes = issuesFor(applicationOf({
      action: action as typeof MINIMAL_APPLICATION.action,
    }));

    expect(codes).toContain("capabilities.application.value.range.missing");
  });

  it("reports rather than throws on any hostile contextual value", () => {
    /*
     * Written after a validator dereferenced the very field it was about to
     * report as missing. Host JSON reaches validation before it reaches the
     * compiler, so "required" is a claim about authored content and not about
     * what arrives — and a sweep catches the next read to grow, which a case
     * per bug does not.
     */
    const hostile = [
      undefined, null, {}, [], 0, 1, "fixed", true,
      { kind: "fixed" },
      { kind: "context-derived" },
      { kind: "context-derived", profileId: 7 },
      { kind: "elsewhere" },
      { value: { kind: "direct", minimumMetres: 0, maximumMetres: 1 } },
    ];

    for (const value of hostile) {
      for (const field of ["range", "executionDuration", "travel"] as const) {
        const application = applicationOf({
          action: {
            ...MINIMAL_APPLICATION.action,
            [field]: value,
          } as typeof MINIMAL_APPLICATION.action,
        });

        expect(() => issuesFor(application)).not.toThrow();

        /* And not throwing is not enough: it has to actually complain. */
        if (field !== "travel" || value !== undefined) {
          expect(issuesFor(application).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("rejects a context-derived value that names no profile", () => {
    /*
     * The failure worth catching hardest: a blank profileId reads as a
     * deliberate deferral and is a field nothing can ever supply, because
     * there is no name for a caller to answer.
     */
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        range: { kind: "context-derived", profileId: "   " },
        executionDuration: { kind: "context-derived", profileId: "" },
      },
    }));

    expect(
      codes.filter(
        (code) => code === "capabilities.application.value.profile.missing",
      ),
    ).toHaveLength(2);
  });

  it("rejects a fixed value that fails its own domain validator", () => {
    const codes = issuesFor(applicationOf({
      action: {
        ...MINIMAL_APPLICATION.action,
        travel: { kind: "fixed", value: { kind: "speed", metresPerSecond: -1 } },
      },
    }));

    expect(codes).toContain("spatial.travel.speed.invalid");
  });

  it("rejects a request-derived Aura cost that names no profile", () => {
    const codes = issuesFor(applicationOf({
      cost: {
        exertionLoad: 0,
        aura: { kind: "request-derived", profileId: "  " },
      },
    }));

    expect(codes)
      .toContain("capabilities.application.cost.aura.profile.missing");
  });

  it("rejects an Aura cost that states no kind at all", () => {
    /*
     * What host-registered JSON written against the old optional shape looks
     * like. It is refused rather than read as "no Aura", because Aura
     * expenditure would charge that as zero.
     */
    const codes = issuesFor(applicationOf({
      cost: {
        exertionLoad: 0,
        aura: { baseAuraCost: 5 } as never,
      },
    }));

    expect(codes).toContain("capabilities.application.cost.aura.kind.invalid");
  });

  it("refuses a Mastery change to an Aura price that is not fixed", () => {
    /*
     * There is no number to add five to on a request-derived price. Silently
     * doing nothing would be the worst outcome: the rank reads as an upgrade
     * and a player has paid Growth Points for it.
     */
    const codes = issuesFor(applicationOf({
      cost: {
        exertionLoad: 0,
        aura: { kind: "request-derived", profileId: "aura.declared-power" },
      },
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{ op: "add", field: "baseAuraCost", amount: 5 }],
        },
      ],
    }));

    expect(codes).toContain("capabilities.application.mastery.field.absent");
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

  it("rejects blank output and consequence identifiers", () => {
    /*
     * These are downstream handles: an output id is what a Mastery change
     * addresses to improve potency and what a proposal carries; a consequence
     * id is what a ruling is matched against. A blank one is unaddressable.
     */
    const codes = issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: {
          id: "done",
          summary: "It happens.",
          outputs: [{ id: "  ", amount: 1 }],
          consequences: [{ id: "", summary: "Something follows." }],
        },
      },
    }));

    expect(codes).toContain("capabilities.application.outcome.output.id.missing");
    expect(codes)
      .toContain("capabilities.application.outcome.consequence.id.missing");
  });

  it("rejects a consequence that says nothing", () => {
    /* A consequence IS its summary — it is a suggestion handed to a person. */
    const codes = issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: {
          id: "done",
          summary: "It happens.",
          consequences: [{ id: "aftermath", summary: "   " }],
        },
      },
    }));

    expect(codes)
      .toContain("capabilities.application.outcome.consequence.summary.missing");
  });

  it("rejects ids repeated anywhere in the application", () => {
    /*
     * Uniqueness is application-wide rather than per branch, because a Mastery
     * change names an output without naming the branch's shape, and two
     * outputs under one id would resolve to whichever was indexed last.
     */
    const codes = issuesFor(applicationOf({
      check: {
        kind: "fixed",
        scope: { kind: "attribute", attribute: "dex" },
      },
      outcome: {
        kind: "fixed",
        success: {
          id: "resolved",
          summary: "Yes.",
          outputs: [{ id: "impact", amount: 2 }],
          consequences: [{ id: "aftermath", summary: "It lands." }],
        },
        failure: {
          id: "resolved",
          summary: "No.",
          outputs: [{ id: "impact", amount: 0 }],
          consequences: [{ id: "aftermath", summary: "It does not." }],
        },
      },
    }));

    expect(codes).toContain("capabilities.application.outcome.id.duplicate");
    expect(codes)
      .toContain("capabilities.application.outcome.output.id.duplicate");
    expect(codes)
      .toContain("capabilities.application.outcome.consequence.id.duplicate");
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

    /*
     * `application` is required by the type, so this is what a HOST registering
     * unchecked JSON produces — the compiler never saw it. The engine still
     * refuses rather than inventing a contract, and catalog validation reports
     * the definition as unfinished.
     */
    registerDefinition("skill", {
      id: "test-contractless",
      name: "Contractless",
      description: "A Skill nobody said how to use.",
    } as unknown as SkillDefinition);

    expect(findSkillCatalogIssues().join("\n"))
      .toContain("declares no application");

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
    const first = resolveEffectiveSkillApplication(FLAME_LANCE_APPLICATION, 1);
    const third = resolveEffectiveSkillApplication(FLAME_LANCE_APPLICATION, 3);
    const fifth = resolveEffectiveSkillApplication(FLAME_LANCE_APPLICATION, 5);

    expect(first.action.structuredActionCost.actions).toBe(2);
    expect(fixedRangeOf(first)?.maximumMetres).toBe(10);
    expect(first.appliedMasteryChanges).toEqual([]);

    /* II caps the Action cost; III adds reach and Aura. Nothing from IV yet. */
    expect(third.action.structuredActionCost.actions).toBe(1);
    expect(fixedRangeOf(third)?.maximumMetres).toBe(15);
    expect(
      third.cost.aura.kind === "fixed" ? third.cost.aura.baseAuraCost : null,
    ).toBe(15);
    expect(third.appliedMasteryChanges).toEqual([2, 3]);

    /* V holds everything II, III and IV gave, and there is no rank V change. */
    expect(fifth.appliedMasteryChanges).toEqual([2, 3, 4]);
    expect(fixedRangeOf(fifth)?.maximumMetres).toBe(15);
  });

  it("lets a rank improve what the Skill DOES, not only what it costs", () => {
    /*
     * Mastery is depth. A track that can only make a Skill cheaper or
     * longer-ranged cannot express the thing ranks are for — the same act,
     * done harder — so a change can address an outcome branch's own output by
     * id and move its magnitude.
     */
    const before = resolveEffectiveSkillApplication(FLAME_LANCE_APPLICATION, 3);
    const after = resolveEffectiveSkillApplication(FLAME_LANCE_APPLICATION, 4);

    expect(
      skillOutcomeOutputAmount(before.outcome, "lance-lands", "lance-impact"),
    ).toBe(12);

    expect(
      skillOutcomeOutputAmount(after.outcome, "lance-lands", "lance-impact"),
    ).toBe(24);

    /* The other branch is untouched, and so is the authored definition. */
    expect(skillOutcomeEntries(after.outcome).map((entry) => entry.id))
      .toEqual(["lance-lands", "lance-misses"]);

    expect(
      skillOutcomeOutputAmount(
        FLAME_LANCE_APPLICATION.outcome,
        "lance-lands",
        "lance-impact",
      ),
    ).toBe(12);
  });

  it("refuses an outcome modifier that addresses nothing", () => {
    expect(issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: { id: "done", summary: "It happens." },
      },
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{
            op: "add",
            field: "outcomeOutput",
            outcomeId: "not-a-branch",
            outputId: "impact",
            amount: 1,
          }],
        },
      ],
    }))).toContain("capabilities.application.mastery.outcome.unknown");

    expect(issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: { id: "done", summary: "It happens." },
      },
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{
            op: "add",
            field: "outcomeOutput",
            outcomeId: "done",
            outputId: "not-an-output",
            amount: 1,
          }],
        },
      ],
    }))).toContain("capabilities.application.mastery.output.unknown");

    /* And a rank may not introduce a magnitude the base never declared. */
    expect(issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: {
          id: "done",
          summary: "It happens.",
          outputs: [{ id: "impact", summary: "No magnitude authored." }],
        },
      },
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{
            op: "add",
            field: "outcomeOutput",
            outcomeId: "done",
            outputId: "impact",
            amount: 1,
          }],
        },
      ],
    }))).toContain("capabilities.application.mastery.output.amountless");
  });

  it("applies thresholds in ascending order regardless of authored order", () => {
    /*
     * "add 2 then cap at 3" and "cap at 3 then add 2" are different answers, so
     * the order cannot be the order the array happened to be written in.
     */
    const application = applicationOf({
      cost: { exertionLoad: 1, aura: { kind: "none" } },
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

  it("catches a rank whose arithmetic overflows to a non-number", () => {
    /*
     * Both operands are finite and the product is not: Number.MAX_VALUE * 2 is
     * Infinity. Checking the authored numbers one at a time cannot see this —
     * only projecting the rank and looking at what came out can. Infinity is
     * not JSON either, so a magnitude that escaped would reach a host as null.
     */
    const codes = issuesFor(applicationOf({
      outcome: {
        kind: "automatic",
        outcome: {
          id: "done",
          summary: "It happens.",
          outputs: [{ id: "impact", amount: Number.MAX_VALUE }],
        },
      },
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{
            op: "multiply",
            field: "outcomeOutput",
            outcomeId: "done",
            outputId: "impact",
            factor: 2,
          }],
        },
      ],
    }));

    expect(codes)
      .toContain("capabilities.application.outcome.output.amount.invalid");
  });

  it("catches the same overflow in a cost a rank multiplies", () => {
    const codes = issuesFor(applicationOf({
      cost: {
        exertionLoad: Number.MAX_VALUE,
        aura: { kind: "none" },
      },
      masteryChanges: [
        {
          minimumMastery: 2,
          changes: [{ op: "multiply", field: "exertionLoad", factor: 2 }],
        },
      ],
    }));

    expect(codes).toContain("capabilities.application.cost.exertion.invalid");
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
  const heldPunch = () => resolveSkillApplication({
    skillId: "punch",
    capabilities: resolveCapabilities({
      authoredSkills: [{ skillId: "punch", mastery: 1 }],
    }),
    context: emptyContext(),
  });

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

    const built = buildSkillActionProfile(resolved.payload, PICK_LOCK_CONTEXT);

    expect(built.success).toBe(true);

    if (!built.success) return;

    const profile = built.payload;

    expect(findActionProfileIssues(profile)).toEqual([]);
    expect(profile.id).toBe("skill:pick-lock");

    /* Ordinary resolved geometry and timing; nothing contextual survives. */
    expect(profile.range)
      .toEqual({ kind: "direct", minimumMetres: 0, maximumMetres: 1 });
    expect(profile.executionDuration).toBe(60000);
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

    const built = buildSkillActionProfile(resolved.payload, PUNCH_CONTEXT);

    expect(built.success).toBe(true);

    if (!built.success) return;

    const profile = built.payload;

    expect(findActionProfileIssues(profile)).toEqual([]);
    expect(profile.allowedTimings).toEqual(["action"]);
    expect(profile.range)
      .toEqual({ kind: "direct", minimumMetres: 0, maximumMetres: 1.4 });
    expect(structuredActionCostFor(profile, { kind: "structured", timing: "action" }))
      .toEqual({ actions: 1 });
    expect(profileThreatensDeclaredTargets(profile)).toBe(true);

    /*
     * Punch is adjudicated and names no scope, so the profile carries no
     * check — the engine is not pretending to know how a strike is decided.
     */
    expect(profile.check).toBeUndefined();
  });

  it("refuses to build a profile while a contextual value is missing", () => {
    /*
     * The whole point of the contextual declaration. Punch's reach belongs to
     * the body throwing it, so until something works one out there IS no
     * Range — and the alternative to refusing is a profile carrying a number
     * nobody computed, which is the literal this addendum removed reappearing
     * one layer down.
     */
    const resolved = heldPunch();

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    const built = buildSkillActionProfile(resolved.payload);

    expect(built.success).toBe(false);

    if (built.success) return;

    expect(built.errors.map((error) => error.code)).toContain(
      "capabilities.application.value.missing",
    );

    /* Every missing field at once, not one build at a time. */
    expect(built.errors.length).toBeGreaterThan(1);
  });

  it("rejects a value supplied for the wrong context profile", () => {
    const resolved = heldPunch();

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    const built = buildSkillActionProfile(resolved.payload, {
      ...PUNCH_CONTEXT,
      range: {
        /* A perfectly good Range, worked out for the wrong question. */
        profileId: "aura.declared-power.range",
        value: { kind: "direct", minimumMetres: 0, maximumMetres: 1.4 },
      },
    });

    expect(built.success).toBe(false);

    if (built.success) return;

    expect(built.errors[0].code)
      .toBe("capabilities.application.value.profile-mismatch");
  });

  it("rejects a supplied value through the neutral domain validators", () => {
    const resolved = heldPunch();

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    /* An inverted Range, judged by spatial/ rather than by a Skill-side copy. */
    const badRange = buildSkillActionProfile(resolved.payload, {
      ...PUNCH_CONTEXT,
      range: {
        profileId: "body.reach",
        value: { kind: "direct", minimumMetres: 9, maximumMetres: 1 },
      },
    });

    expect(badRange.success).toBe(false);

    if (!badRange.success) {
      expect(badRange.errors[0].code).toBe("spatial.interval.inverted");
    }

    const badDuration = buildSkillActionProfile(resolved.payload, {
      ...PUNCH_CONTEXT,
      executionDuration: {
        profileId: "combat.action-duration",
        value: Number.POSITIVE_INFINITY,
      },
    });

    expect(badDuration.success).toBe(false);

    if (!badDuration.success) {
      expect(badDuration.errors[0].code)
        .toBe("capabilities.application.value.duration.invalid");
    }

    const blast = resolveSkillApplication({
      skillId: "fire-blast",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "fire-blast", mastery: 1 }],
      }),
      context: emptyContext({ traitIds: ["firebending"] }),
    });

    expect(blast.success).toBe(true);

    if (!blast.success) return;

    const badTravel = buildSkillActionProfile(blast.payload, {
      range: {
        profileId: "aura.declared-power.range",
        value: { kind: "direct", minimumMetres: 1, maximumMetres: 12 },
      },
      executionDuration: { profileId: "combat.action-duration", value: 2000 },
      travel: {
        profileId: "aura.declared-power.travel",
        value: { kind: "speed", metresPerSecond: 0 },
      },
    });

    expect(badTravel.success).toBe(false);

    if (!badTravel.success) {
      expect(badTravel.errors[0].code).toBe("spatial.travel.speed.invalid");
    }
  });

  it("builds a valid neutral profile once every context is supplied", () => {
    const blast = resolveSkillApplication({
      skillId: "fire-blast",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "fire-blast", mastery: 1 }],
      }),
      context: emptyContext({ traitIds: ["firebending"] }),
    });

    expect(blast.success).toBe(true);

    if (!blast.success) return;

    const built = buildSkillActionProfile(blast.payload, {
      range: {
        profileId: "aura.declared-power.range",
        value: { kind: "direct", minimumMetres: 1, maximumMetres: 12 },
      },
      executionDuration: { profileId: "combat.action-duration", value: 2000 },
      travel: {
        profileId: "aura.declared-power.travel",
        value: { kind: "speed", metresPerSecond: 25 },
      },
    });

    expect(built.success).toBe(true);

    if (!built.success) return;

    expect(findActionProfileIssues(built.payload)).toEqual([]);

    /*
     * Ordinary resolved values, and nothing else. A contextual specification
     * reaching a profile would be the Skill layer leaking into actions/.
     */
    expect(built.payload.range)
      .toEqual({ kind: "direct", minimumMetres: 1, maximumMetres: 12 });
    expect(built.payload.travel).toEqual({ kind: "speed", metresPerSecond: 25 });
    expect(built.payload.executionDuration).toBe(2000);
    expect(built.payload.range).not.toHaveProperty("profileId");
  });

  it("projects a Range of none into a profile with no Range", () => {
    /*
     * `none` is a real answer, and it resolves to the profile's own absence —
     * a resolved profile either has a distance requirement or does not, and
     * there is no author left to have forgotten one.
     */
    const resolved = resolveSkillApplication({
      skillId: "defensive-stance",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "defensive-stance", mastery: 1 }],
      }),
      context: emptyContext(),
    });

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    expect(resolved.payload.application?.action.range)
      .toEqual({ kind: "none" });

    /* Range needs nothing supplied; only the duration is outstanding. */
    expect(
      requiredApplicationContext(resolved.payload.application!.action)
        .map((one) => one.field),
    ).toEqual(["executionDuration"]);

    const built = buildSkillActionProfile(resolved.payload, {
      executionDuration: { profileId: "combat.action-duration", value: 2000 },
    });

    expect(built.success).toBe(true);

    if (!built.success) return;

    expect(findActionProfileIssues(built.payload)).toEqual([]);
    expect(built.payload.range).toBeUndefined();
    expect(built.payload).not.toHaveProperty("range");
  });

  it("refuses Range context for a Skill that has no Range", () => {
    const resolved = resolveSkillApplication({
      skillId: "defensive-stance",
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: "defensive-stance", mastery: 1 }],
      }),
      context: emptyContext(),
    });

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    const built = buildSkillActionProfile(resolved.payload, {
      executionDuration: { profileId: "combat.action-duration", value: 2000 },
      range: {
        profileId: "body.reach",
        value: { kind: "direct", minimumMetres: 0, maximumMetres: 2 },
      },
    });

    expect(built.success).toBe(false);

    if (built.success) return;

    expect(built.errors[0].code)
      .toBe("capabilities.application.value.unexpected");
  });

  it("refuses a value supplied for a field the Skill authors as fixed", () => {
    /*
     * Refused rather than ignored: silently discarding a value a caller
     * computed is the same class of bug as an omitted Aura cost charged as
     * zero — they believe they changed something and nothing says otherwise.
     */
    registerFlameLance();

    const resolved = resolveSkillApplication({
      skillId: FLAME_LANCE,
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: FLAME_LANCE, mastery: 1 }],
      }),
      context: emptyContext(),
    });

    expect(resolved.success).toBe(true);

    if (!resolved.success) return;

    /* Flame Lance authors its Range as a constant, so it takes no context. */
    expect(buildSkillActionProfile(resolved.payload).success).toBe(true);

    const built = buildSkillActionProfile(resolved.payload, {
      range: {
        profileId: "body.reach",
        value: { kind: "direct", minimumMetres: 0, maximumMetres: 3 },
      },
    });

    expect(built.success).toBe(false);

    if (built.success) return;

    expect(built.errors[0].code)
      .toBe("capabilities.application.value.not-contextual");
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

  it("carries a fixed Aura cost in the fields the real request takes", () => {
    const effective = resolveEffectiveSkillApplication(
      FLAME_LANCE_APPLICATION,
      3,
    );

    expect(projectSkillAuraCost(effective.cost)).toEqual({
      kind: "settled",
      fields: { exertionLoad: 2, baseAuraCost: 15, requiredOutput: 5 },
    });

    expect(skillAuraCostNeedsRequestContext(effective.cost)).toBe(false);
  });

  it("refuses to settle a price that depends on declared power", () => {
    /*
     * The distinction the union exists for. Fire Blast's price follows the
     * power the bender puts behind it, and an omitted figure is charged as
     * ZERO by Aura expenditure — so "burns no Aura" and "cannot be priced yet"
     * had to stop being the same data. A caller now cannot spread this into a
     * request without noticing: it is a different variant, and the fields it
     * carries do not include an Aura figure at all.
     */
    const application = getSkillDefinition("fire-blast")?.application;

    expect(application).toBeDefined();

    if (application === undefined) return;

    expect(application.cost.aura).toEqual({
      kind: "request-derived",
      profileId: "aura.declared-power",
    });

    expect(skillAuraCostNeedsRequestContext(application.cost)).toBe(true);

    const projection = projectSkillAuraCost(application.cost);

    expect(projection.kind).toBe("request-derived");

    if (projection.kind !== "request-derived") return;

    /* Exertion is charged for the act either way; the Aura price is not here. */
    expect(projection.fields).toEqual({ exertionLoad: 2 });
    expect(projection.fields).not.toHaveProperty("baseAuraCost");
    expect(projection.profileId).toBe("aura.declared-power");
  });

  it("says plainly when a Skill burns no deliberate Aura", () => {
    const application = getSkillDefinition("punch")?.application;

    expect(application).toBeDefined();

    if (application === undefined) return;

    expect(application.cost.aura).toEqual({ kind: "none" });
    expect(skillAuraCostNeedsRequestContext(application.cost)).toBe(false);

    expect(projectSkillAuraCost(application.cost)).toEqual({
      kind: "settled",
      fields: { exertionLoad: 1 },
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

    registerFlameLance();

    const lanceBefore = JSON.stringify(getSkillDefinition(FLAME_LANCE));

    const result = resolveSkillApplication({
      skillId: FLAME_LANCE,
      capabilities: resolveCapabilities({
        authoredSkills: [{ skillId: FLAME_LANCE, mastery: 4 }],
      }),
      context: emptyContext(),
    });

    expect(result.success).toBe(true);

    if (!result.success) return;

    const built = buildSkillActionProfile(result.payload);

    expect(built.success).toBe(true);

    /* Rank II capped the Action cost and IV doubled the impact — derived only. */
    expect(result.payload.application?.action.structuredActionCost)
      .toEqual({ actions: 1 });

    expect(JSON.stringify(getSkillDefinition(FLAME_LANCE))).toBe(lanceBefore);
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
