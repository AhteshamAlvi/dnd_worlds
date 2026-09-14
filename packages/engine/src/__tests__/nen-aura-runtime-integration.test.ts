/*
 * The whole pipeline, through the paths a host actually calls.
 *
 * Every piece of this phase has its own suite, and every one of them passes
 * against contracts that never meet. This is where they meet:
 *
 *   request -> priority funding -> lifecycle -> commitment -> distribution
 *           -> ledger and trace
 *
 * Three things are being checked that no isolated suite can check.
 *
 * THE SEAMS CARRY THE FIGURES. An activity commits what Aura FUNDED, a
 * placement spreads what the activity committed, and the ledger reports all
 * three. Each hand-off is somewhere a requested figure could be substituted
 * for a resolved one and every isolated test would still pass.
 *
 * AUTHORITATIVE TIME DRIVES BOTH. `advanceCharacterTime` is the only thing
 * entitled to move a character through an interval, and after this phase it
 * returns the active runtime beside the Aura state. One advance of sixty
 * seconds and sixty of one second have to agree, because a host with a live
 * clock and a manual skip will do both.
 *
 * FIFTEEN PRINCIPLES FIT WITHOUT BEING NAMED. The last block is the real
 * deliverable: every structural category the fifteen principles need, carried
 * by the generic contract, with no principle rule authored and no legacy
 * implementation imported.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  auraCostRequest,
  createAuraCostHandler,
  type AuraCostDetail,
} from "../character/foundation/aura/runtime";
import { runCoordinatedOperation, type SettledCosts } from "../runtime";
import {
  activateNenActivity,
  adjustNenActivity,
  advanceNenActivities,
  resumeNenActivity,
  stopNenActivity,
} from "../character/nen/runtime";
import {
  committedNenOutput,
  emptyNenActivityRuntime,
  findNenActivity,
  type NenActivityConstraint,
  type NenActivityDefinition,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
/*
 * Through the PACKAGE, not the module.
 *
 * Three other suites reach the public surface as `../index`, and that checks
 * the barrel. This one goes through the package name because the claim being
 * made is stronger: placement has no production caller yet — it is waiting on
 * the reinforcement and principle layers — so the only thing standing between
 * it and being unreachable is the export. A self-reference exercises
 * package.json's `exports` map as well as the barrel, which a relative path
 * bypasses entirely, and it fails the moment either one stops naming it.
 */
import { resolveAuraPlacement } from "@nenworld/engine";
import {
  advanceCharacterTime,
  characterTemporalState,
} from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import { AURA_PLACEMENT_CHANNELS } from "@nenworld/engine";
import type { AuraPlacementChannel } from "@nenworld/engine";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { CharacterAuraState } from "../character/foundation/aura/state";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import type { ContributionSourceRef } from "../infrastructure/contribution-source";
import type { TargetRef } from "../targeting";

import {
  auraContext,
  auraTestAttributes,
  auraTestMeasurements,
  WITH_TEN,
} from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";


const SRC = fileURLToPath(new URL("..", import.meta.url));

const OPERATION = { operationId: "op-1", occurredAt: 0 } as const;
const CALLER = { domain: "caller", id: "host" } as const;

const ACTOR: ContributionSourceRef = { type: "character", id: "gon" };
const HOSTILE: ContributionSourceRef = { type: "ability", id: "chain-jail" };

const SELF: TargetRef = { kind: "self" };


function context(dex = 22) {
  return auraContext({
    attributes: auraTestAttributes({ con: 20, vit: 20, dex }),
    access: WITH_TEN,
  });
}

function body(availableOutput = 100_000) {
  return {
    anatomy: STANDARD_HUMANOID_ANATOMY,
    measurements: auraTestMeasurements(),
    availableOutput,
  };
}


/**
 * Fund one cost through the real coordinator and hand back the ledger entry.
 *
 * Through `runCoordinatedOperation` rather than by calling Aura directly,
 * because the point is that the LEDGER a mechanic reads is the one the
 * transaction produced — not a figure reconstructed beside it.
 */
function fund(input: {
  readonly current: number;
  readonly baseAuraCost: number;
  readonly shortfall?: Parameters<typeof auraCostRequest>[0]["shortfall"];
  readonly costPriority?: number;

  /** The character whose pool is charged. Defaults to the suite's Gon. */
  readonly ownerId?: string;
}): AuraCostDetail {
  let detail: AuraCostDetail | null = null;

  const owner = { domain: "aura", id: input.ownerId ?? "gon" } as const;

  const result = runCoordinatedOperation(
    {
      context: OPERATION,
      states: {
        [`aura:${owner.id}`]: {
          current: input.current,
          allocations: [],
        } as CharacterAuraState,
      },
      costs: [auraCostRequest({
        requestId: "activate",
        operationId: OPERATION.operationId,
        occurredAt: OPERATION.occurredAt,
        from: CALLER,
        to: owner,
        requested: input.baseAuraCost,
        baseAuraCost: input.baseAuraCost,
        ...(input.shortfall === undefined ? {} : { shortfall: input.shortfall }),
        ...(input.costPriority === undefined
          ? {}
          : { costPriority: input.costPriority }),
      })],
      resolve: (_dice, _states, costs: SettledCosts) => {
        detail = costs.detail("activate") as AuraCostDetail;

        return { result: "activated" };
      },
    },
    { costs: [createAuraCostHandler(() => context())], effects: [] },
  );

  if (!result.success) {
    throw new Error(`funding failed: ${JSON.stringify(result.errors)}`);
  }

  if (detail === null) throw new Error("resolve was never called");

  return detail;
}


function runtimeWith(
  funding: AuraFundingOutcome,
  overrides: {
    readonly requested?: { readonly aura: number; readonly durationSeconds?: number };
    readonly constraints?: readonly NenActivityConstraint[];
    readonly owner?: string;
  } = {},
): NenActivityRuntime {
  const result = activateNenActivity(
    emptyNenActivityRuntime(overrides.owner ?? "nen:gon", 0),
    {
    activityId: "guard",
    definitionId: "definition:guard",
    source: ACTOR,
    at: 0,
    requested: overrides.requested ?? { aura: funding.requested },
    priority: 10,
    funding,
    ...(overrides.constraints === undefined
      ? {}
      : { constraints: overrides.constraints }),
    },
  );

  if (!result.success) {
    throw new Error(`activation failed: ${JSON.stringify(result.errors)}`);
  }

  return result.payload.runtime;
}


describe("request to funding to lifecycle to distribution", () => {
  it("carries the FUNDED figure the whole way through, in full", () => {
    const detail = fund({ current: 10_000, baseAuraCost: 400 });

    expect(detail.succeeded).toBe(true);
    expect(detail.funding.status).toBe("funded");

    const runtime = runtimeWith(detail.funding);
    const activity = findNenActivity(runtime, "guard")!;

    expect(activity.funding.committed).toBe(400);
    expect(activity.funding.requestId).toBe(detail.funding.requestId);

    const placed = resolveAuraPlacement({
      requestId: "place",
      owner: "aura:gon",
      source: "activity:guard",
      aura: activity.funding.committed,
      targets: [{ target: SELF, channel: { kind: "uniform-body-surface" } }],
    }, body());

    expect(placed.success).toBe(true);
    if (!placed.success) return;

    /* Nothing was added or lost at any seam. */
    expect(placed.payload.placedAura).toBeCloseTo(400, 6);
  });

  it("carries a SCALED figure through without anyone substituting the request", () => {
    /*
     * The seam this guards. A requested 400 against a reserve of 250 funds 250
     * — and every stage after it has a requested figure sitting right there,
     * ready to be used by mistake. Each assertion below is one place that
     * substitution would show up.
     */
    const detail = fund({
      current: 250,
      baseAuraCost: 400,
      shortfall: { kind: "scale" },
    });

    expect(detail.funding.status).toBe("scaled");
    expect(detail.funding.funded).toBe(250);
    expect(detail.funding.unmet).toBe(150);

    const runtime = runtimeWith(detail.funding, {
      requested: { aura: 400 },
    });

    const activity = findNenActivity(runtime, "guard")!;

    expect(activity.requested.aura).toBe(400);
    expect(activity.funding.committed).toBe(250);
    expect(activity.funding.unmet).toBe(150);

    const placed = resolveAuraPlacement({
      requestId: "place",
      owner: "aura:gon",
      source: "activity:guard",
      aura: activity.funding.committed,
      targets: [{ target: SELF, channel: { kind: "uniform-body-surface" } }],
    }, body());

    expect(placed.success).toBe(true);
    if (!placed.success) return;

    expect(placed.payload.placedAura).toBeCloseTo(250, 6);
  });

  it("starts nothing on a consumed failure, and still reports the spend", () => {
    const detail = fund({
      current: 250,
      baseAuraCost: 400,
      shortfall: { kind: "consume-and-fail", minimum: 400 },
    });

    expect(detail.succeeded).toBe(false);
    expect(detail.funding.status).toBe("consumed-below-minimum");
    expect(detail.funding.funded).toBe(250);

    const result = activateNenActivity(emptyNenActivityRuntime("nen:gon", 0), {
      activityId: "guard",
      definitionId: "definition:guard",
      source: ACTOR,
      at: 0,
      requested: { aura: 400 },
      priority: 10,
      funding: detail.funding,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /*
     * No activity, and the Aura is gone. The two halves of the mechanic that
     * an engine without partial funding could not express at all.
     */
    expect(result.payload.after).toBeNull();
    expect(committedNenOutput(result.payload.runtime)).toBe(0);
  });
});


describe("authoritative time drives both", () => {
  /*
   * Through advanceNenActivities directly, with the interval invariant stated
   * the way `advanceCharacterTime` will exercise it: an activity's fate must
   * not depend on how the caller chopped up the span.
   */
  it("agrees between one long advance and many short ones", () => {
    const detail = fund({ current: 10_000, baseAuraCost: 100 });

    const base = runtimeWith(detail.funding, {
      requested: { aura: 100, durationSeconds: 17 },
    });

    const long = advanceNenActivities(base, { to: 60, by: ACTOR });

    let stepped = base;

    for (let second = 1; second <= 60; second += 1) {
      const step = advanceNenActivities(stepped, { to: second, by: ACTOR });

      expect(step.success).toBe(true);
      if (!step.success) return;

      stepped = step.payload.runtime;
    }

    expect(long.success).toBe(true);
    if (!long.success) return;

    expect(findNenActivity(long.payload.runtime, "guard")!.stop!.at).toBe(17);
    expect(findNenActivity(stepped, "guard")!.stop!.at).toBe(17);
  });

  it("stops an activity when access is lost, creating no mastery", () => {
    const detail = fund({ current: 10_000, baseAuraCost: 100 });

    const base = runtimeWith(detail.funding, {
      constraints: [{ kind: "deliberate-access" }],
    });

    const result = advanceNenActivities(base, {
      to: 60,
      by: HOSTILE,
      deliberateAccess: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const stopped = findNenActivity(result.payload.runtime, "guard")!;

    expect(stopped.stop!.cause).toBe("access-lost");

    /*
     * Nothing in this transition can touch mastery, because NenState is not an
     * input to it. The strongest form the guarantee takes is structural: a
     * forced state has nothing to write to.
     */
    expect(committedNenOutput(result.payload.runtime)).toBe(0);
    expect(Object.keys(result.payload.runtime)).toEqual(
      expect.not.arrayContaining(["mastery"]),
    );
  });

  it("returns the advanced runtime beside the Aura state, on the real path", () => {
    /*
     * `advanceCharacterTime` is the only thing entitled to move a character
     * through an interval, so this goes through it rather than through the
     * lifecycle transition directly. An activity with a declared duration
     * shorter than the interval must be finished by the time the advance
     * returns, and the Aura state must come back beside it from one call.
     */
    const subject = createTestCharacter({
      attributes: { con: 20, vit: 20, dex: 22 },
      aura: { current: 10_000, allocations: [] },
      wakefulness: { hoursAwake: 2 },
      nen: standardAwakenedNen(),
    });

    const detail = fund({
      current: 10_000,
      baseAuraCost: 100,
      ownerId: subject.id,
    });

    /*
     * The runtime is built for THIS character. Aura keys them `aura:<id>` and
     * the activity runtime `nen:<id>` — two states, one person, which is what
     * the ownership vocabulary is for.
     */
    const activities = runtimeWith(detail.funding, {
      requested: { aura: 100, durationSeconds: 60 },
      owner: `nen:${subject.id}`,
    });

    const startedAt = 1_000_000_000;

    const result = advanceCharacterTime({
      character: subject,
      temporalState: characterTemporalState(startedAt),
      interval: gameTimeIntervalOf(startedAt, hoursToDuration(1)),
      activity: { initial: { mode: "ordinary-waking" } },
      activeEffects: { nenActivities: activities },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* One call, both answers. */
    expect(result.payload.aura.state).toBeDefined();
    expect(result.payload.nenActivities).toBeDefined();

    const advanced = findNenActivity(
      result.payload.nenActivities!.runtime,
      "guard",
    )!;

    expect(advanced.stop!.cause).toBe("expired");
    expect(advanced.stop!.at).toBe(60);

    /*
     * The character is ready to persist and carries NO activity state. Scene
     * state stays beside the sheet — a sheet that recorded "Ren is active"
     * could be loaded into a world where it is not.
     */
    expect(Object.keys(result.payload.character))
      .toEqual(expect.not.arrayContaining(["nenActivities", "activities"]));
  });

  it("invents no runtime for a caller who supplied none", () => {
    const subject = createTestCharacter({
      attributes: { con: 20, vit: 20, dex: 22 },
      aura: { current: 10_000, allocations: [] },
      wakefulness: { hoursAwake: 2 },
    });

    const startedAt = 1_000_000_000;

    const result = advanceCharacterTime({
      character: subject,
      temporalState: characterTemporalState(startedAt),
      interval: gameTimeIntervalOf(startedAt, hoursToDuration(1)),
      activity: { initial: { mode: "ordinary-waking" } },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /*
     * Absent, not empty. A caller who gets a runtime back that they never
     * passed in cannot tell it from state they had forgotten about.
     */
    expect(result.payload.nenActivities).toBeUndefined();
  });
});


describe("owner isolation across the whole pipeline", () => {
  it("never lets one character's funding start another's activity", () => {
    const detail = fund({ current: 10_000, baseAuraCost: 100 });

    const result = activateNenActivity(
      emptyNenActivityRuntime("nen:killua", 0),
      {
        activityId: "guard",
        definitionId: "definition:guard",
        source: ACTOR,
        at: 0,
        requested: { aura: 100 },
        priority: 10,
        funding: detail.funding,
      },
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.funding.owner.mismatched");
  });
});


/*
 * The fifteen principles, as LIFECYCLE categories.
 *
 * Split from placement, and the split is the correction. One table used to
 * assign every principle a lifecycle shape AND an Aura channel, which quietly
 * asserted two very different things at once:
 *
 *   the generic runtime can represent this principle structurally
 *   this principle necessarily produces that Aura placement
 *
 * The first is what this phase set out to prove. The second is a claim about
 * mechanics nobody has designed yet — Zetsu and Hatsu have no settled
 * placement at all — and pairing them meant a speculative channel had to be
 * invented for each principle just to get it through `resolveAuraPlacement`.
 * Jū was the visible cost: it was handed the shared differential channel, which
 * contradicts its canonical complete, even distribution.
 *
 * So this block proves the LIFECYCLE only, for all fifteen, and never places
 * any Aura. Placement is proved separately below, against opaque mechanic ids,
 * because a placement category is a property of the channel rather than of any
 * principle that might one day use it.
 */
describe("all fifteen principles fit the generic lifecycle", () => {
  /*
   * Which principles distribute evenly and which may concentrate.
   *
   * Canon, recorded here as TEST DATA and nowhere in production. The generic
   * runtime validates an authorization and never asks which principle issued
   * it; a list like this inside the engine would be the principle catalog
   * arriving through the back door.
   */
  const UNIFORM_PRINCIPLES = ["ten", "ren", "ken", "chu", "ju", "shu"] as const;

  const DIFFERENTIAL_PRINCIPLES = ["gyo", "ko", "ryu", "yu"] as const;

  /*
   * The generic lifecycle capabilities, and the principle standing in for each.
   *
   * No `channel` field exists on this shape, which is what makes "the
   * lifecycle test cannot manufacture a placement" structural rather than a
   * convention somebody has to remember.
   */
  type LifecycleCapability =
    | "activation"
    | "requirements"
    | "relations"
    | "composition"
    | "replacement"
    | "suppression"
    | "component-loss"
    | "adjustment"
    | "stop-resume";

  interface LifecycleCase {
    readonly principle: string;
    readonly capability: LifecycleCapability;
    readonly relations?: NenActivityDefinition["relations"];
    readonly components?: readonly string[];
    readonly constraints?: readonly NenActivityConstraint[];
  }

  const CASES: readonly LifecycleCase[] = [
    { principle: "ten", capability: "activation" },
    { principle: "ren", capability: "adjustment" },

    {
      principle: "zetsu",
      capability: "suppression",
      relations: [{ relation: "suppresses", other: "principle:ten" }],
    },

    { principle: "chu", capability: "activation" },

    {
      principle: "hatsu",
      capability: "requirements",
      relations: [{ relation: "requires", other: "principle:ren" }],
    },

    { principle: "shu", capability: "stop-resume" },

    {
      principle: "gyo",
      capability: "relations",
      relations: [{ relation: "modifies", other: "principle:ten" }],
    },

    {
      principle: "in",
      capability: "relations",
      relations: [{ relation: "modifies", other: "principle:ten" }],
    },

    {
      principle: "ken",
      capability: "composition",
      relations: [{ relation: "composite", other: "principle:ten" }],
      components: ["principle:ten", "principle:ren"],
    },

    { principle: "en", capability: "stop-resume" },
    { principle: "ko", capability: "adjustment" },

    {
      principle: "ryu",
      capability: "component-loss",
      relations: [{ relation: "component-loss", other: "principle:ten" }],
      constraints: [{ kind: "component", activityId: "guard" }],
    },

    { principle: "yu", capability: "activation" },

    /*
     * Jū replaces what was held. It is COMPLETE and EVEN when it lands, so it
     * appears here for its replacement relationship and carries no
     * differential anything — which is what it was wrongly given before.
     */
    {
      principle: "ju",
      capability: "replacement",

      /*
       * Points at the BASE activity's definition, which is the opaque stand-in
       * for whatever was being held. What is proved is that the runtime reads
       * a `replaces` declaration and stops the named activity; which
       * definition that turns out to be is the principle layer's business.
       */
      relations: [{ relation: "replaces", other: "definition:guard" }],
    },

    {
      principle: "fu",
      capability: "relations",
      relations: [{
        relation: "conditional",
        other: "principle:ten",
        condition: "while the foundation holds",
      }],
    },
  ];

  it("covers all fifteen, once each", () => {
    expect(CASES).toHaveLength(15);
    expect(new Set(CASES.map((one) => one.principle)).size).toBe(15);
  });

  it("exercises every generic lifecycle capability", () => {
    /*
     * Guards the table against drifting into fifteen rows that all test
     * activation. Each capability has to be represented by at least one.
     */
    const CAPABILITIES: readonly LifecycleCapability[] = [
      "activation",
      "requirements",
      "relations",
      "composition",
      "replacement",
      "suppression",
      "component-loss",
      "adjustment",
      "stop-resume",
    ];

    const covered = new Set(CASES.map((one) => one.capability));

    expect([...covered].sort()).toEqual([...CAPABILITIES].sort());
  });

  it("never asks a principle to manufacture an Aura placement", () => {
    /*
     * Structural, not a convention. `LifecycleCase` has no channel field, so
     * there is nothing here a placement could be built from — and a future
     * edit that added one would have to add it to the type first.
     */
    for (const one of CASES) {
      expect(one).not.toHaveProperty("channel");
      expect(one).not.toHaveProperty("weights");
      expect(one).not.toHaveProperty("authorization");
    }
  });

  it.each(CASES.map((one) => [one.principle, one] as const))(
    "carries %s through the generic lifecycle with no rule of its own",
    (principle, testCase) => {
      const detail = fund({ current: 50_000, baseAuraCost: 100 });

      const definitionId = `principle:${principle}`;

      const definitions = new Map<string, NenActivityDefinition>([[
        definitionId,
        {
          id: definitionId,
          relations: testCase.relations ?? [],
          ...(testCase.components === undefined
            ? {}
            : { components: testCase.components }),
        },
      ]]);

      /*
       * A base activity under an opaque id stands in for whatever the real
       * principle would depend on or replace. `requires`, `component` and
       * `replaces` all need something already running, and the runtime does
       * not know or care what that something is.
       */
      const base = runtimeWith(detail.funding);

      const started = activateNenActivity(base, {
        activityId: `activity:${principle}`,
        definitionId,
        source: ACTOR,
        at: 0,
        requested: { aura: detail.funding.funded },
        priority: 5,
        funding: detail.funding,
        ...(testCase.constraints === undefined
          ? {}
          : { constraints: testCase.constraints }),
      }, definitions);

      /*
       * `requires` names a definition nothing is running, so that one case
       * legitimately refuses — and refusing for the RIGHT reason proves the
       * declaration was read rather than ignored.
       */
      if (!started.success) {
        expect(testCase.capability).toBe("requirements");
        expect(started.errors.map((one) => one.code))
          .toContain("nen.activity.requirement.absent");

        return;
      }

      const activity = started.payload.after!;

      expect(activity.definitionId).toBe(definitionId);
      expect(activity.condition).toBe("active");

      /* Replacement is a consequence of activating, and is visible as one. */
      if (testCase.capability === "replacement") {
        expect(started.payload.consequences.map((one) => one.id))
          .toContain("guard");
        expect(started.payload.consequences[0]!.stop!.cause).toBe("replaced");
      }

      /* Composition and component loss both end with the component. */
      if (testCase.capability === "component-loss") {
        const lost = stopNenActivity(started.payload.runtime, {
          activityId: "guard",
          cause: "interrupted",
          at: 10,
          by: HOSTILE,
        });

        expect(lost.success).toBe(true);
        if (!lost.success) return;

        expect(
          lost.payload.consequences.find(
            (one) => one.id === `activity:${principle}`,
          )!.stop!.cause,
        ).toBe("collapsed");

        return;
      }

      if (testCase.capability === "adjustment") {
        const adjusted = adjustNenActivity(started.payload.runtime, {
          activityId: `activity:${principle}`,
          at: 5,
          by: ACTOR,
          requested: { aura: 50 },
          funding: { ...detail.funding, funded: 50, requested: 50 },
        });

        expect(adjusted.success).toBe(true);
        if (!adjusted.success) return;

        expect(adjusted.payload.after!.funding.committed).toBe(50);

        return;
      }

      /* Everything else stops, and the cause it stopped for is recorded. */
      const cause = testCase.capability === "suppression"
        ? "suppressed" as const
        : "interrupted" as const;

      const stopped = stopNenActivity(started.payload.runtime, {
        activityId: `activity:${principle}`,
        cause,
        at: 10,
        by: HOSTILE,
        ...(testCase.capability === "stop-resume"
          ? { resume: { authority: HOSTILE } }
          : {}),
      });

      expect(stopped.success).toBe(true);
      if (!stopped.success) return;

      expect(stopped.payload.after!.stop!.cause).toBe(cause);

      if (testCase.capability !== "stop-resume") return;

      const resumed = resumeNenActivity(stopped.payload.runtime, {
        activityId: `activity:${principle}`,
        at: 20,
        by: HOSTILE,
        funding: detail.funding,
      });

      expect(resumed.success).toBe(true);
      if (!resumed.success) return;

      expect(resumed.payload.after!.condition).toBe("active");
    },
  );

  it("treats Jū as uniform, never as differential", () => {
    /*
     * The specific correction. Jū's distribution is complete and even, and it
     * appeared in the old table holding the shared differential channel —
     * which authorized an uneven placement for a principle whose canon forbids
     * one.
     */
    expect(UNIFORM_PRINCIPLES).toContain("ju");
    expect(DIFFERENTIAL_PRINCIPLES).not.toContain("ju");

    const ju = CASES.find((one) => one.principle === "ju")!;

    expect(ju.capability).toBe("replacement");
    expect(JSON.stringify(ju)).not.toMatch(/differential|weights|authorization/);
  });

  it("names only Gyō, Kō, Ryū and Yū as principles that may concentrate", () => {
    expect([...DIFFERENTIAL_PRINCIPLES].sort())
      .toEqual(["gyo", "ko", "ryu", "yu"]);

    /* The two lists never overlap: a principle is even or it concentrates. */
    for (const principle of DIFFERENTIAL_PRINCIPLES) {
      expect(UNIFORM_PRINCIPLES).not.toContain(principle);
    }
  });

  it("imports no legacy principle implementation anywhere in this suite", () => {
    const source = readFileSync(
      join(SRC, "__tests__", "nen-aura-runtime-integration.test.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/principles\/(ten|ren|zetsu|hatsu)/);
  });
});


/*
 * The placement categories, against OPAQUE mechanic ids.
 *
 * Deliberately not indexed by principle. A channel is a property of how Aura
 * is arranged — over a whole body by volume, over an item's surface, through a
 * projected volume — and which principle eventually uses which is a decision
 * the principle layer owns and has not made. Naming principles here would
 * turn every row into a guess that later has to be unpicked.
 *
 * Seven rows, one per category the contract carries.
 */
describe("every Aura placement category resolves", () => {
  const RIGHT_ARM = continuityKey("upper-limb:right");
  const LEFT_ARM = continuityKey("upper-limb:left");

  const MECHANIC = "mechanic:opaque";

  function authorization(allocationId: string) {
    return {
      allocationId,
      source: MECHANIC,
      owner: "aura:gon",
      grantedBy: "test:granting-mechanic",
    } as const;
  }

  interface PlacementCase {
    readonly category: string;
    readonly channel: AuraPlacementChannel;
    readonly target?: TargetRef;
  }

  const CASES: readonly PlacementCase[] = [
    {
      category: "uniform body surface",
      channel: { kind: "uniform-body-surface" },
    },
    {
      category: "uniform body internal",
      channel: { kind: "uniform-body-internal" },
    },
    {
      category: "authorized differential surface",
      channel: {
        kind: "differential-surface",
        weights: [
          { continuityKey: RIGHT_ARM, weight: 3 },
          { continuityKey: LEFT_ARM, weight: 1 },
        ],
        authorization: authorization("place:0"),
      },
    },
    {
      category: "authorized differential internal",
      channel: {
        kind: "differential-internal",
        weights: [{ continuityKey: RIGHT_ARM, weight: 1 }],
        authorization: authorization("place:0"),
      },
    },
    {
      category: "item surface",
      target: { kind: "object", objectId: "sword-1" },
      channel: {
        kind: "item-surface",
        measure: {
          unit: "square-metre",
          amount: 0.3,
          derivation: "host",
          provenance: "host:item-catalog",
        },
      },
    },
    {
      category: "projected spatial",
      target: {
        kind: "area",
        area: {
          kind: "sphere",
          centre: {
            kind: "metric",
            contextId: "scene-1",
            xMetres: 0,
            yMetres: 0,
            zMetres: 0,
          },
          radiusMetres: 2,
        },
      },
      channel: { kind: "projected-spatial" },
    },
  ];

  it("covers every declared channel", () => {
    const covered = new Set(CASES.map((one) => one.channel.kind));

    expect([...covered].sort())
      .toEqual([...AURA_PLACEMENT_CHANNELS].sort());
  });

  it("names no principle", () => {
    /*
     * The rule this block exists to keep. A principle id here would be a guess
     * about mechanics the principle layer has not designed.
     */
    const PRINCIPLES = [
      "ten", "ren", "zetsu", "hatsu", "shu", "en", "gyo",
      "ken", "chu", "in", "ko", "ryu", "yu", "ju", "fu",
    ];

    const written = JSON.stringify(CASES).toLowerCase();

    for (const principle of PRINCIPLES) {
      expect(written).not.toMatch(new RegExp(`["':]${principle}["':]`));
    }
  });

  it.each(CASES.map((one) => [one.category, one] as const))(
    "resolves %s",
    (_category, placementCase) => {
      const detail = fund({ current: 50_000, baseAuraCost: 100 });

      const placed = resolveAuraPlacement({
        requestId: "place",
        owner: "aura:gon",
        source: MECHANIC,
        aura: detail.funding.funded,
        targets: [{
          target: placementCase.target ?? SELF,
          channel: placementCase.channel,
        }],
      }, body());

      expect(placed.success).toBe(true);
      if (!placed.success) return;

      expect(placed.payload.sites.length).toBeGreaterThan(0);

      for (const site of placed.payload.sites) {
        expect(site.measure.amount).toBeGreaterThan(0);
        expect(site.measure.provenance.length).toBeGreaterThan(0);
      }

      expect(placed.payload.placedAura)
        .toBeCloseTo(detail.funding.funded, 6);
    },
  );

  it("resolves a multi-target placement at one density", () => {
    const detail = fund({ current: 50_000, baseAuraCost: 300 });

    const placed = resolveAuraPlacement({
      requestId: "place",
      owner: "aura:gon",
      source: MECHANIC,
      aura: detail.funding.funded,
      targets: [
        {
          target: { kind: "object", objectId: "sword-1" },
          channel: {
            kind: "item-surface",
            measure: {
              unit: "square-metre",
              amount: 1,
              derivation: "host",
              provenance: "host:item-catalog",
            },
          },
        },
        {
          target: { kind: "object", objectId: "shield-1" },
          channel: {
            kind: "item-surface",
            measure: {
              unit: "square-metre",
              amount: 2,
              derivation: "host",
              provenance: "host:item-catalog",
            },
          },
        },
      ],
    });

    expect(placed.success).toBe(true);
    if (!placed.success) return;

    const [sword, shield] = placed.payload.sites;

    expect(sword!.aura).toBeCloseTo(100, 6);
    expect(shield!.aura).toBeCloseTo(200, 6);
    expect(sword!.density).toEqual(shield!.density);
  });

  it("refuses an unauthorized one-part placement", () => {
    /*
     * The hole this repair closed, checked at the placement boundary. One Body
     * Part is the most concentrated placement there is; before `localized` was
     * removed it needed no grant at all.
     */
    const placed = resolveAuraPlacement({
      requestId: "place",
      owner: "aura:gon",
      source: MECHANIC,
      aura: 100,
      targets: [{
        target: SELF,
        channel: {
          kind: "differential-surface",
          weights: [{ continuityKey: RIGHT_ARM, weight: 1 }],
          authorization: {
            allocationId: "place:0",
            source: MECHANIC,
            owner: "aura:someone-else",
            grantedBy: "test:granting-mechanic",
          },
        },
      }],
    }, body());

    expect(placed.success).toBe(false);
  });
});


/*
 * The layering this phase had to respect, checked where it would break.
 *
 * These sit here rather than in architecture.test.ts because they are about
 * THIS phase's modules; a guard in the general suite would pass vacuously
 * until somebody added the files it was written for.
 */
describe("the new modules keep their layers", () => {
  const sourceFilesUnder = (root: string): readonly string[] => {
    const out: string[] = [];

    for (const entry of readdirSync(root)) {
      const path = join(root, entry);

      if (statSync(path).isDirectory()) out.push(...sourceFilesUnder(path));
      else if (entry.endsWith(".ts")) out.push(path);
    }

    return out;
  };

  const importsOf = (path: string): readonly string[] =>
    [...readFileSync(path, "utf8").matchAll(/\bfrom\s+"([^"]+)"/g)]
      .map((match) => match[1]!);

  const NEN_RUNTIME = join(SRC, "character", "foundation", "nen", "runtime");
  const NEN_RULES = join(SRC, "character", "nen", "runtime");
  const PLACEMENT = join(SRC, "gameplay", "aura");

  it("finds the sources it is checking", () => {
    expect(sourceFilesUnder(NEN_RUNTIME).length).toBeGreaterThan(1);
    expect(sourceFilesUnder(NEN_RULES).length).toBeGreaterThan(0);
    expect(sourceFilesUnder(PLACEMENT).length).toBeGreaterThan(1);
  });

  it("never lets the Foundation runtime import character/nen/", () => {
    /*
     * Foundation owns the SHAPE of an activity; the rules for changing one sit
     * above it. An edge back down would put the transitions underneath the
     * types they act on and make the split meaningless.
     */
    const offenders = sourceFilesUnder(NEN_RUNTIME).filter((path) =>
      importsOf(path).some((one) =>
        one.includes("/nen/") && !one.includes("foundation")
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("never lets the active runtime import an individual principle", () => {
    /*
     * The rule the whole phase rests on. One import of ten.ts and this stops
     * being a generic runtime; the fifteen categories above would still pass,
     * because the sixteenth thing nobody has authored yet is what breaks.
     */
    const offenders = [
      ...sourceFilesUnder(NEN_RUNTIME),
      ...sourceFilesUnder(NEN_RULES),
    ].filter((path) =>
      importsOf(path).some((one) => one.includes("principles/")),
    );

    expect(offenders).toEqual([]);
  });

  it("spells no principle id in the generic runtime", () => {
    /*
     * The same rule, by content rather than by import. A hard-coded "ren"
     * string is a principle branch that no import check would catch.
     */
    const codeOf = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    const PRINCIPLES = [
      "ten", "ren", "zetsu", "hatsu", "shu", "en", "gyo",
      "ken", "chu", "in", "ko", "ryu", "yu", "ju", "fu",
    ];

    const offenders = [
      ...sourceFilesUnder(NEN_RUNTIME),
      ...sourceFilesUnder(NEN_RULES),
    ].filter((path) => {
      const code = codeOf(path);

      return PRINCIPLES.some((id) =>
        new RegExp(`["'\`]${id}["'\`]`).test(code)
      );
    });

    expect(offenders).toEqual([]);
  });

  /*
   * Aura's independence from Targeting and Spatial, and the placement layer's
   * own boundary, now live in architecture.test.ts — see "Aura placement is a
   * layer above Character, not inside it". They were checked here while
   * gameplay/aura was new and a rule in the general suite would have passed
   * vacuously; the files exist now, and the version there is stronger, so one
   * authoritative rule is better than two that can drift apart.
   */

  it("creates no Body injury from Aura or the Nen runtime", () => {
    const offenders = [
      ...sourceFilesUnder(join(SRC, "character", "foundation", "aura")),
      ...sourceFilesUnder(NEN_RUNTIME),
      ...sourceFilesUnder(NEN_RULES),
      ...sourceFilesUnder(PLACEMENT),
    ].filter((path) =>
      importsOf(path).some((one) => one.includes("injuries")),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves the legacy principle implementations unexported", () => {
    /*
     * They are legacy and non-authoritative, and this phase was told not to
     * expand, export, redesign or delete them. The check that they stay
     * unreachable is what keeps "we left them alone" true.
     */
    const barrel = readFileSync(join(SRC, "index.ts"), "utf8");

    expect(barrel).not.toMatch(/foundation\/nen\/principles/);
  });
});
