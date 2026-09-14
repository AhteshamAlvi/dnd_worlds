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
  advanceNenActivities,
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
 * The fifteen principles, as STRUCTURAL CATEGORIES.
 *
 * The deliverable of the whole phase, and deliberately not fifteen
 * implementations. What is proved here is that the generic contract can carry
 * every shape the fifteen need — surface and internal placement, access
 * change, suppression, an item target, a projection, a concealment
 * placeholder, composition, and authorized differential Aura — without any of
 * them needing a rule of their own and without importing a line of the legacy
 * implementations under foundation/nen/principles/.
 *
 * The mastery values, costs, durations and intensity curves are NOT here.
 * Those are the authored mechanics this phase explicitly does not write; a
 * table of them would be this file quietly becoming the principle catalog.
 */
describe("all fifteen principles fit the generic contract", () => {
  interface Category {
    readonly principle: string;
    readonly channel: AuraPlacementChannel;
    readonly constraints?: readonly NenActivityConstraint[];
    readonly relations?: NenActivityDefinition["relations"];
    readonly components?: readonly string[];
  }

  const RIGHT_ARM = continuityKey("upper-limb:right");

  const authorization = {
    allocationId: "place:0",
    source: "activity:differential",
    owner: "aura:gon",
    grantedBy: "mastery:differential",
  } as const;

  const DIFFERENTIAL: AuraPlacementChannel = {
    kind: "differential-surface",
    weights: [{ continuityKey: RIGHT_ARM, weight: 1 }],
    authorization,
  };

  const CATEGORIES: readonly Category[] = [
    /* Whole-body surface, held. */
    { principle: "ten", channel: { kind: "uniform-body-surface" } },

    /* Whole-body surface at raised output — an access change, not a shape. */
    {
      principle: "ren",
      channel: { kind: "uniform-body-surface" },
      constraints: [{ kind: "deliberate-access" }],
    },

    /* Suppression: an activity that stops every other one. */
    {
      principle: "zetsu",
      channel: { kind: "uniform-body-surface" },
      relations: [{ relation: "suppresses", other: "principle:ten" }],
    },

    /* Internal placement. */
    { principle: "chu", channel: { kind: "uniform-body-internal" } },

    /* Authored action: needs the foundation active, carries no shape here. */
    {
      principle: "hatsu",
      channel: { kind: "uniform-body-surface" },
      relations: [{ relation: "requires", other: "principle:ren" }],
    },

    /* Aura extended onto an object the engine does not measure. */
    {
      principle: "shu",
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

    /* Uneven concentration. Authorized, by construction. */
    { principle: "gyo", channel: DIFFERENTIAL },

    /* Concealment: a placeholder category, structurally a modifier. */
    {
      principle: "in",
      channel: { kind: "uniform-body-surface" },
      relations: [{ relation: "modifies", other: "principle:ten" }],
    },

    /* Composite: built from two others, and collapses with them. */
    {
      principle: "ken",
      channel: { kind: "uniform-body-surface" },
      relations: [
        { relation: "composite", other: "principle:ten" },
        { relation: "component-loss", other: "principle:ren" },
      ],
      components: ["principle:ten", "principle:ren"],
      constraints: [{ kind: "component", activityId: "guard" }],
    },

    /* Projection into space. */
    {
      principle: "en",
      channel: {
        kind: "projected-spatial",
        measure: {
          unit: "litre",
          amount: 1000,
          derivation: "host",
          provenance: "host:scene-volume",
        },
      },
    },

    /* Concentration into one identity. */
    { principle: "ko", channel: DIFFERENTIAL },

    /* Shifting concentration — the same category, re-authorized per change. */
    { principle: "ryu", channel: DIFFERENTIAL },

    /* Differential internal placement. */
    {
      principle: "yu",
      channel: {
        kind: "differential-internal",
        weights: [{ continuityKey: RIGHT_ARM, weight: 1 }],
        authorization,
      },
    },

    /* All-in: a replacement for whatever was held. */
    {
      principle: "ju",
      channel: DIFFERENTIAL,
      relations: [{ relation: "replaces", other: "principle:ten" }],
    },

    /* Conditional compatibility. */
    {
      principle: "fu",
      channel: { kind: "uniform-body-surface" },
      relations: [{
        relation: "conditional",
        other: "principle:ten",
        condition: "while the foundation holds",
      }],
    },
  ];

  it("covers all fifteen", () => {
    expect(CATEGORIES).toHaveLength(15);
    expect(new Set(CATEGORIES.map((one) => one.principle)).size).toBe(15);
  });

  it.each(CATEGORIES.map((one) => [one.principle, one] as const))(
    "carries %s as a category, with no rule of its own",
    (principle, category) => {
      const detail = fund({ current: 50_000, baseAuraCost: 100 });

      const definitionId = `principle:${principle}`;

      const definitions = new Map<string, NenActivityDefinition>([[
        definitionId,
        {
          id: definitionId,
          relations: category.relations ?? [],
          ...(category.components === undefined
            ? {}
            : { components: category.components }),
        },
      ]]);

      /*
       * `requires` and `component` need something already running, and
       * `replaces` needs something to replace. A base activity stands in for
       * whatever the real principle would depend on — under an opaque id,
       * because the point is that the runtime does not know or care.
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
        ...(category.constraints === undefined
          ? {}
          : { constraints: category.constraints }),
      }, definitions);

      /*
       * `requires` names a definition nothing is running, so that one category
       * legitimately refuses — and refusing for the RIGHT reason is the proof
       * the declaration was read rather than ignored.
       */
      if (!started.success) {
        expect(started.errors.map((one) => one.code))
          .toContain("nen.activity.requirement.absent");

        return;
      }

      const activity = started.payload.after!;

      expect(activity.definitionId).toBe(definitionId);
      expect(activity.condition).toBe("active");

      const placed = resolveAuraPlacement({
        requestId: "place",
        owner: "aura:gon",
        source: "activity:differential",
        aura: activity.funding.committed,
        targets: [{ target: SELF, channel: category.channel }],
      }, body());

      expect(placed.success).toBe(true);
      if (!placed.success) return;

      expect(placed.payload.sites.length).toBeGreaterThan(0);

      for (const site of placed.payload.sites) {
        expect(site.measure.amount).toBeGreaterThan(0);
        expect(site.measure.provenance.length).toBeGreaterThan(0);
      }

      expect(placed.payload.placedAura)
        .toBeCloseTo(activity.funding.committed, 6);
    },
  );

  it("imports no legacy principle implementation anywhere in this suite", () => {
    const source = readFileSync(
      join(SRC, "__tests__", "nen-aura-runtime-integration.test.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/principles\/(ten|ren|zetsu|hatsu)/);
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
