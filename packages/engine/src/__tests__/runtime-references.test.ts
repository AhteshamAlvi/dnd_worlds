/*
 * The two reference migrations, and the boundaries the runtime layer must keep.
 *
 * Aura is the reference for a domain that owns a SPENDABLE RESOURCE somebody
 * else needs. Recovery is the reference for a domain that must ASK ANOTHER
 * DOMAIN to change something it does not own. Between them they exercise both
 * directions of the request mechanism.
 *
 * Inputs are deep-frozen rather than merely typed readonly. `readonly` is a
 * compile-time claim and disappears at runtime; freezing turns a violation
 * into a thrown error in strict mode, and into a silently-ignored write
 * otherwise — either way the assertion afterwards catches it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createTraceNode } from "../infrastructure/trace";

import {
  auraCostRequest,
  createAuraCostHandler,
} from "../character/foundation/aura/runtime";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import type { CharacterAuraState } from "../character/foundation/aura/state";
import {
  recoveryEvent,
  recoveryRequests,
} from "../character/foundation/body/recovery/runtime";
import type { ResolveRecoveryOutcome } from "../character/foundation/body/recovery/types";
import {
  findRequestIssues,
  runCoordinatedOperation,
  type QuantitativeRequest,
  type RuntimeOwnerRef,
} from "../runtime";

import { auraContext, auraTestAttributes, WITH_TEN } from "./fixtures/aura";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const OPERATION = { operationId: "op-1", occurredAt: 5_000 } as const;

const CALLER = { domain: "caller", id: "host" } as const;
const GON_AURA = { domain: "aura", id: "gon" } as const;


/** Freeze an object graph, so a write is a runtime fact rather than a claim. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}


function auraSetup(current: number) {
  const attributes = auraTestAttributes({ con: 20, vit: 20, dex: 22 });
  const state = deepFreeze<CharacterAuraState>({ current, allocations: [] });
  const context = deepFreeze(auraContext({ attributes, access: WITH_TEN }));

  return { state, context, maximum: deriveMaximumAura(attributes) };
}


describe("Aura as a cost handler", () => {
  it("pays a valid action cost and returns the new pool as the answer", () => {
    const { state, context } = auraSetup(20_000);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state },
        costs: [auraCostRequest({
          requestId: "r-aura",
          operationId: OPERATION.operationId,
          occurredAt: OPERATION.occurredAt,
          from: CALLER,
          to: GON_AURA,
          requested: 0,
          exertionLoad: 2,
        })],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context)], effects: [] },
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    const outcome = result.payload.costOutcomes[0]!;
    const after = result.payload.states["aura:gon"] as CharacterAuraState;

    /* Aura's rules decide the figure; the requester's estimate does not win. */
    expect(outcome.actual!).toBeGreaterThan(0);
    expect(after.current).toBeCloseTo(20_000 - outcome.actual!, 8);

    const event = result.payload.events.find((one) => one.kind === "aura-spent");

    expect(event?.domain).toBe("aura");
    expect(event?.operationId).toBe(OPERATION.operationId);
    expect(event?.change?.actual).toBeCloseTo(outcome.actual!, 8);
  });

  /*
   * The handler holds the resolution CONTEXT and never the pool, so there is
   * nowhere for a committed state to hide. `committedState()` used to be that
   * hiding place, and it meant the authoritative Aura lived somewhere the
   * coordinator could not see.
   */
  it("keeps no state of its own", () => {
    const { context } = auraSetup(20_000);
    const handler = createAuraCostHandler(() => context);

    expect(Object.keys(handler).sort()).toEqual(["commit", "domain", "prepare"]);
    expect("committedState" in handler).toBe(false);
  });

  /*
   * Two costs against one pool. Preparing each against the ORIGINAL state let
   * a character spend more Aura than they had; preparing against the running
   * draft is what makes the second see the first.
   */
  it("charges two costs in one operation cumulatively", () => {
    const { state, context } = auraSetup(20_000);

    const cost = (requestId: string) => auraCostRequest({
      requestId,
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: CALLER,
      to: GON_AURA,
      requested: 0,
      exertionLoad: 2,
    });

    const one = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state },
        costs: [cost("r1")],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context)], effects: [] },
    );

    const two = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state },
        costs: [cost("r1"), cost("r2")],
        resolve: () => ({ result: "swung twice" }),
      },
      { costs: [createAuraCostHandler(() => context)], effects: [] },
    );

    if (!one.success || !two.success) throw new Error("expected success");

    const afterOne = (one.payload.states["aura:gon"] as CharacterAuraState).current;
    const afterTwo = (two.payload.states["aura:gon"] as CharacterAuraState).current;
    const single = 20_000 - afterOne;

    expect(single).toBeGreaterThan(0);
    expect(afterTwo).toBeCloseTo(20_000 - single * 2, 6);
  });

  /* Unaffordable is a validation failure: nothing happened at all. */
  it("changes nothing when the character cannot afford the cost", () => {
    const { state, context } = auraSetup(1);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state },
        costs: [auraCostRequest({
          requestId: "r-aura",
          operationId: OPERATION.operationId,
          occurredAt: OPERATION.occurredAt,
          from: CALLER,
          to: GON_AURA,
          requested: 0,
          exertionLoad: 10,
        })],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context)], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(state.current).toBe(1);
  });

  /*
   * The multi-domain case: the Aura is affordable and the Action is not, so
   * the Aura must not leave the pool.
   */
  it("keeps its Aura when another domain's cost refuses", () => {
    const { state, context } = auraSetup(20_000);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state, "combat:gon": 0 },
        costs: [
          auraCostRequest({
            requestId: "r-aura",
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: CALLER,
            to: GON_AURA,
            requested: 0,
            exertionLoad: 2,
          }),
          {
            requestId: "r-action",
            kind: "combat.action",
            phase: "cost",
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: CALLER,
            to: { domain: "combat", id: "gon" },
            requested: 1,
          } as QuantitativeRequest,
        ],
        resolve: () => ({ result: "swung" }),
      },
      {
        costs: [
          createAuraCostHandler(() => context),
          {
            domain: "combat",
            prepare: () => ({
              success: false,
              trace: { root: createTraceNode({ id: "t", label: "t" }) },
              warnings: [],
              errors: [{
                code: "test.combat.no-actions",
                message: "No Actions remain.",
                audience: "developer",
              }],
            }),
            commit: () => {
              throw new Error("must not commit");
            },
          },
        ],
        effects: [],
      },
    );

    expect(result.success).toBe(false);
    expect(state.current).toBe(20_000);
  });

  it("leaves the frozen input state untouched on success and on failure", () => {
    const { state, context } = auraSetup(20_000);

    const request = (requestId: string, exertionLoad: number) =>
      auraCostRequest({
        requestId,
        operationId: OPERATION.operationId,
        occurredAt: OPERATION.occurredAt,
        from: CALLER,
        to: GON_AURA,
        requested: 0,
        exertionLoad,
      });

    const succeeded = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state },
        costs: [request("r1", 2)],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context)], effects: [] },
    );

    const failed = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state },
        costs: [request("r1", 100_000)],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context)], effects: [] },
    );

    expect(succeeded.success).toBe(true);
    expect(failed.success).toBe(false);

    expect(state.current).toBe(20_000);
    expect(state.allocations).toHaveLength(0);
  });
});


describe("Body recovery asks rather than reaches", () => {
  /*
   * A recovery outcome shaped by hand rather than produced by a pass. Only
   * the fields these two adapters read are populated: they do no arithmetic,
   * so a full anatomy would be scenery. Typed through the real interface so a
   * field rename still breaks this test.
   */
  const outcome = deepFreeze<ResolveRecoveryOutcome>({
    continuity: {},
    anatomy: { parts: [] },
    parts: [
      { partId: "leg-1", integrityBefore: 0.5, integrityAfter: 0.6,
        bpRequested: 12, bpRestored: 5, ceiling: 8 },
      { partId: "arm-1", integrityBefore: 0.9, integrityAfter: 1,
        bpRequested: 4, bpRestored: 4, ceiling: 20 },
    ],
    removedInjuries: [
      { characterInjuryId: "ci-2", injuryId: "sprain" },
      { characterInjuryId: "ci-1", injuryId: "fracture" },
    ],
    bodyPointsAfterRecovery: {},
  } as unknown as ResolveRecoveryOutcome);

  const context = {
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    subjectId: "gon",
  };

  it("turns healed Injuries into requests addressed to Character status", () => {
    const requests = recoveryRequests(outcome, context);

    expect(requests).toHaveLength(2);

    for (const request of requests) {
      expect(request.from).toEqual({ domain: "body", id: "gon" });
      expect(request.to).toEqual({ domain: "character-status", id: "gon" });
      expect(request.phase).toBe("effect");
      expect(request.operationId).toBe(OPERATION.operationId);

      /*
       * A removal is not a quantity. It briefly carried `requested: 1` because
       * the shared base demanded a number, which every consumer then had to
       * know to ignore.
       */
      expect("requested" in request).toBe(false);
      expect(findRequestIssues(request, OPERATION.operationId)).toEqual([]);
    }
  });

  /* Body reports; it does not remove. The removal is somebody else's to do. */
  it("does not remove the Injuries itself", () => {
    recoveryRequests(outcome, context);

    expect(outcome.removedInjuries).toHaveLength(2);
  });

  it("orders requests by Injury id, not by discovery order", () => {
    const ids = recoveryRequests(outcome, context)
      .map((one) => one.characterInjuryId);

    expect(ids).toEqual(["ci-1", "ci-2"]);
  });

  /*
   * The recovery ceiling is exactly where requested and actual diverge: a tick
   * worth 16 BP capped to 9 by an untreated Injury.
   */
  it("reports requested against actual recovery", () => {
    const event = recoveryEvent(outcome, context);

    expect(event.domain).toBe("body");
    expect(event.change).toEqual({ requested: 16, actual: 9 });
  });

  it("leaves the frozen outcome untouched", () => {
    recoveryRequests(outcome, context);
    recoveryEvent(outcome, context);

    expect(outcome.parts).toHaveLength(2);
    expect(outcome.removedInjuries[0]!.characterInjuryId).toBe("ci-2");
  });
});


/*
 * The runtime layer must not become the universal gameplay resolver.
 *
 * That failure does not arrive as a design decision. It arrives as one
 * convenient import, and then another, until the coordinator knows what Ren
 * costs and the domains no longer own their own rules.
 */
describe("the runtime layer stays free of gameplay", () => {
  const runtimeFiles = readdirSync(join(SRC, "runtime"))
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(SRC, "runtime", entry));

  const specifiers = (path: string) =>
    [...readFileSync(path, "utf8").matchAll(/\bfrom\s+"([^"]+)"/g)]
      .map((match) => match[1]!);

  it("finds the runtime sources it is checking", () => {
    expect(runtimeFiles.length).toBeGreaterThanOrEqual(7);
  });

  it("imports no character or gameplay domain", () => {
    const offenders = runtimeFiles.filter((path) =>
      specifiers(path).some(
        (specifier) =>
          specifier.includes("character") || specifier.includes("gameplay"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  /* The coordinator is the strictest case: procedure only. */
  it("keeps the coordinator to infrastructure and its own siblings", () => {
    const imports = specifiers(join(SRC, "runtime", "coordinator.ts"));

    for (const specifier of imports) {
      expect(specifier.startsWith("./") || specifier.startsWith("../infrastructure/"))
        .toBe(true);
    }
  });

  it("names no gameplay mechanic anywhere in the runtime layer", () => {
    for (const path of runtimeFiles) {
      const code = readFileSync(path, "utf8")
        /* Prose explaining the boundary is not a dependency. */
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(code).not.toMatch(
        /\bRen\b|\bZetsu\b|\bHatsu\b|BodyPoint|\bInjury\b|\bCondition\b/,
      );
    }
  });

  /*
   * Combat attaches to Runtime State; Runtime State does not know Combat
   * exists. The slot is generic precisely so this import cannot appear.
   */
  it("never names a Combat type", () => {
    for (const path of runtimeFiles) {
      expect(specifiers(path).some((one) => one.includes("combat"))).toBe(false);
    }
  });
});


/* Foundation may use the protocol; the protocol may not use Foundation. */
describe("the protocol is a shared layer, not a domain", () => {
  const sourceFilesUnder = (directory: string): readonly string[] => {
    const files: string[] = [];

    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);

      if (statSync(path).isDirectory()) files.push(...sourceFilesUnder(path));
      else if (entry.endsWith(".ts")) files.push(path);
    }

    return files;
  };

  it("is imported by domains rather than importing them", () => {
    const adapters = [
      join(SRC, "character", "foundation", "aura", "runtime.ts"),
      join(SRC, "character", "foundation", "body", "recovery", "runtime.ts"),
    ];

    for (const path of adapters) {
      const imports = [...readFileSync(path, "utf8")
        .matchAll(/\bfrom\s+"([^"]+)"/g)].map((match) => match[1]!);

      expect(imports.some((one) => one.includes("runtime/"))).toBe(true);
    }
  });

  it("leaves the existing Foundation-to-Rules rule intact", () => {
    const foundationFiles = sourceFilesUnder(
      join(SRC, "character", "foundation"),
    );

    const offenders = foundationFiles.filter((path) =>
      [...readFileSync(path, "utf8").matchAll(/\bfrom\s+"([^"]+)"/g)]
        .map((match) => match[1]!)
        .some((specifier) => {
          if (!specifier.startsWith(".")) return false;

          return join(path, "..", specifier).includes(
            join("character", "rules"),
          );
        }),
    );

    expect(offenders).toEqual([]);
  });
});


/*
 * One Aura handler, two characters, two bodies.
 *
 * Owner-keyed STATE was only half the problem. The handler still closed over
 * one character's context — their Attributes, their access, their Control
 * multiplier — so two characters had separate pools that were both charged
 * using the first one's body. Separate pools with a shared calculation is
 * arguably worse than a shared pool, because the numbers look individual.
 */
describe("Aura resolves its context per owner", () => {
  const GON: RuntimeOwnerRef = { domain: "aura", id: "gon" };
  const KILLUA: RuntimeOwnerRef = { domain: "aura", id: "killua" };
  const STRANGER: RuntimeOwnerRef = { domain: "aura", id: "stranger" };

  /*
   * Different bodies. CON/VIT drive Maximum Aura — 50,000 against 20,000 here
   * — and physical cost scales with it, which is what makes one exertion cost
   * these two different amounts.
   */
  const gonContext = auraContext({
    attributes: auraTestAttributes({ con: 20, vit: 20, dex: 22 }),
    access: WITH_TEN,
  });

  const killuaContext = auraContext({
    attributes: auraTestAttributes({ con: 20, vit: 18, dex: 22 }),
    access: WITH_TEN,
  });

  const contexts = new Map([
    ["aura:gon", gonContext],
    ["aura:killua", killuaContext],
  ]);

  const lookup = (owner: RuntimeOwnerRef) =>
    contexts.get(`${owner.domain}:${owner.id}`);

  const strike = (requestId: string, to: RuntimeOwnerRef) =>
    auraCostRequest({
      requestId,
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: CALLER,
      to,
      requested: 0,
      exertionLoad: 2,
    });

  it("charges each character against their own body", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: {
          "aura:gon": deepFreeze<CharacterAuraState>({
            current: 10_000,
            allocations: [],
          }),
          "aura:killua": deepFreeze<CharacterAuraState>({
            current: 10_000,
            allocations: [],
          }),
        },
        costs: [strike("r-gon", GON), strike("r-killua", KILLUA)],
        resolve: () => ({ result: "clash" }),
      },
      { costs: [createAuraCostHandler(lookup)], effects: [] },
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    const byRequest = new Map(
      result.payload.costOutcomes.map((one) => [one.requestId, one.actual!]),
    );

    const gonPaid = byRequest.get("r-gon")!;
    const killuaPaid = byRequest.get("r-killua")!;

    /*
     * The whole point: the same exertion costs the two of them DIFFERENT
     * amounts, because physical cost scales with Maximum Aura and their
     * Maximum Aura differs. A shared context would have made these equal.
     */
    expect(gonPaid).toBeGreaterThan(0);
    expect(killuaPaid).toBeGreaterThan(0);
    expect(gonPaid).not.toBeCloseTo(killuaPaid, 6);

    const gonAfter = result.payload.states["aura:gon"] as CharacterAuraState;
    const killuaAfter = result.payload.states["aura:killua"] as CharacterAuraState;

    expect(gonAfter.current).toBeCloseTo(10_000 - gonPaid, 6);
    expect(killuaAfter.current).toBeCloseTo(10_000 - killuaPaid, 6);
  });

  /* A missing context refuses; it never falls back to somebody else's. */
  it("refuses an owner it has no context for", () => {
    const original = {
      "aura:gon": deepFreeze<CharacterAuraState>({
        current: 10_000,
        allocations: [],
      }),
      "aura:stranger": deepFreeze<CharacterAuraState>({
        current: 10_000,
        allocations: [],
      }),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [
          strike("r-gon", GON),
          strike("r-stranger", STRANGER),
        ],
        resolve: () => ({ result: "clash" }),
      },
      { costs: [createAuraCostHandler(lookup)], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("aura.runtime.context.missing");

    /* And Gon, whose cost was perfectly payable, still has all his Aura. */
    expect(original["aura:gon"].current).toBe(10_000);
    expect(original["aura:stranger"].current).toBe(10_000);
  });

  it("is one handler serving both owners", () => {
    const handler = createAuraCostHandler(lookup);

    expect(handler.domain).toBe("aura");
    expect(Object.keys(handler).sort()).toEqual(["commit", "domain", "prepare"]);
  });
});
