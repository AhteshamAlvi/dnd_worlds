/*
 * Every public Phase 5 entry point, handed rubbish.
 *
 * The rule these sweeps enforce is one sentence: a transition either returns a
 * structured EngineFailure or succeeds by explicit contract. It never throws,
 * and it never half-commits.
 *
 * Phase 5 broke that in a consistent way, and the pattern is worth naming
 * because it is the root cause behind most of this file: it read fields for
 * TRACE LABELS and for ELIGIBILITY before validating them. `awakenNenAbrupt`
 * resolved the subject's Attributes at its second statement — before the
 * preflight that checks the owner, the operation and the stored state — so a
 * context missing `attributes` threw a TypeError out of a function whose whole
 * contract is that it returns diagnostics.
 *
 * The engine already owns validators for all of this. Nothing here is a
 * Nen-specific copy: `findRequirementContextIssues` and
 * `findNamedRequirementsValidationIssues` are the same ones every other
 * consumer uses.
 */

import { describe, expect, it } from "vitest";

import {
  advanceNenCollapseRecovery,
  awakenNenAbrupt,
  awakenNenExceptional,
  awakenNenInstinctive,
  awakenNenStandard,
  releaseForcedZetsu,
  releaseInvoluntaryZetsu,
  revertNen,
  settleNenCollapse,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  type NenAwakeningContext,
  type NenAwakeningTransitionResult,
} from "../character/nen";
import { findExceptionalSourceIssues } from "../character/nen/sources";
import { describeDiagnosticValue } from "../infrastructure/diagnostics";
import {
  adoptLegacyNenType,
  unassignedNenType,
} from "../character/foundation/nen/nen-type";
import { createUnawakenedNenState } from "../character/foundation/nen/nen";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import { findAwakeningStateIssues } from "../character/foundation/nen/awakening/validation";
import { awakeningStateFromJson } from "../character/foundation/nen/awakening/serialization";
import { createUnawakenedAwakeningState } from "../character/foundation/nen/awakening/state";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";
import type { NenState } from "../character/foundation/nen/types";

import { AWAKENING_CAPABLE, awakeningContext, requirementContextFor } from "./fixtures/nen";


const GM = { type: "gm", id: "ruling" } as const;
const ACTOR = { ref: { type: "character", id: "t" }, capability: [] } as const;
const SUCCESS_ROLL = {
  purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  sides: 100,
  values: [1],
};

/*
 * Every shape a caller can substitute for an object it was supposed to supply.
 * Each one has broken something in this engine at least once.
 */
const GARBAGE: readonly unknown[] = [
  undefined,
  null,
  0,
  1,
  Number.NaN,
  "",
  "context",
  true,
  [],
  [null],
  {},
  { attributes: null },
  { attributes: {} },
  { attributes: { base: null }, level: 1 },
  { attributes: { stored: {}, base: {}, resolved: {} } },
  { attributes: { stored: {}, base: {}, resolved: {} }, level: "one" },
  Object.create(null),
  Object.assign(Object.create(null), { method: "standard" }),
];

/*
 * A label for a value that may not survive String().
 *
 * `Object.create(null)` has no prototype and therefore no toString, so the
 * obvious `String(value)` throws — inside the test, which would look exactly
 * like the engine throwing. It is kept in the table precisely because a
 * prototype-less object is the kind of thing a JSON reviver or a hostile
 * payload produces.
 */
function label(value: unknown): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}


/** Every route, as a thunk over one context, so one sweep drives them all. */
function everyRoute(
  context: NenAwakeningContext,
): readonly (readonly [string, () => NenAwakeningTransitionResult])[] {
  return [
    ["standard", () => awakenNenStandard(context, {
      method: "standard", trainingCompleted: true,
    })],
    ["abrupt", () => awakenNenAbrupt(context, {
      method: "abrupt",
      actor: ACTOR,
      actorContext: requirementContextFor(),
      rolls: [SUCCESS_ROLL],
    })],
    ["instinctive", () => awakenNenInstinctive(context, {
      method: "instinctive",
      authorization: { grantedBy: GM, reason: "Cornered." },
      naturalAbilityId: "ability-a",
    })],
    ["exceptional", () => awakenNenExceptional(context, {
      method: "exceptional",
      source: { ref: { type: "item", id: "relic" }, overrides: {} },
    })],
    ["reversion", () => revertNen(context, {
      source: { type: "curse", id: "c" }, reason: "Severed.",
    })],
    ["collapse", () => settleNenCollapse(context, {
      collapse: uncontainedCollapse(0),
    })],
    ["recovery", () => advanceNenCollapseRecovery(context, {
      qualifyingSleepHours: 8, maximumAura: 100, at: 1,
    })],
    ["release-involuntary", () => releaseInvoluntaryZetsu(context, {
      suppressionId: "anything",
    })],
    ["release-forced", () => releaseForcedZetsu(context, {
      suppressionId: "anything", authorization: GM,
    })],
  ];
}

function refusedCleanly(
  where: string,
  run: () => NenAwakeningTransitionResult,
): void {
  let result: NenAwakeningTransitionResult;

  try {
    result = run();
  } catch (thrown) {
    throw new Error(`${where} threw instead of returning: ${String(thrown)}`);
  }

  expect([where, result.success]).toEqual([where, false]);

  if (result.success) return;

  expect([where, result.errors.length > 0]).toEqual([where, true]);

  for (const error of result.errors) {
    expect([where, typeof error.code]).toEqual([where, "string"]);
    expect([where, error.code.length > 0]).toEqual([where, true]);
  }
}


describe("R2 — a malformed requirement context is refused, never dereferenced", () => {
  it("refuses every garbage subject context on every route", () => {
    for (const requirements of GARBAGE) {
      const context = {
        ...awakeningContext(),
        requirements,
      } as unknown as NenAwakeningContext;

      for (const [name, run] of everyRoute(context)) {
        refusedCleanly(`${name} / ${label(requirements)}`, run);
      }
    }
  });

  /*
   * The worst-ordered instance. The subject's Attributes were read at the
   * second statement of the function, before the preflight that checks the
   * owner, the operation and the stored state — so a malformed context never
   * got as far as a diagnostic.
   */
  it("validates the context before reading Attributes for the odds", () => {
    const context = {
      ...awakeningContext(),
      requirements: {},
    } as unknown as NenAwakeningContext;

    const result = awakenNenAbrupt(context, {
      method: "abrupt",
      actor: ACTOR,
      actorContext: requirementContextFor(),
      rolls: [SUCCESS_ROLL],
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((error) => error.code))
      .toContain("nen.awakening.requirement-context.invalid");
  });

  /*
   * The ACTOR's context is a different object with the same problem. The old
   * guard checked only `actorContext.attributes === undefined`, which accepts
   * `attributes: null` and throws one call later.
   */
  it("refuses a malformed actor context without throwing", () => {
    for (const actorContext of GARBAGE) {
      refusedCleanly(
        `actorContext=${label(actorContext)}`,
        () => awakenNenAbrupt(awakeningContext(), {
          method: "abrupt",
          actor: {
            ref: { type: "character", id: "t" },
            capability: [{
              id: "teaches",
              requirement: {
                type: "attributeMinimum", attribute: "spi",
                layer: "base", minimum: 10,
              },
            }],
          },
          actorContext: actorContext as never,
          rolls: [SUCCESS_ROLL],
        }),
      );
    }
  });

  /*
   * `unresolved` is a legitimate requirement disposition and must survive the
   * new structural gate. A well-formed context that simply does not record the
   * Techniques an actor holds is not malformed.
   */
  it("still distinguishes unresolved from malformed", () => {
    const result = awakenNenAbrupt(awakeningContext(), {
      method: "abrupt",
      actor: {
        ref: { type: "character", id: "t" },
        capability: [{
          id: "teaches",
          requirement: { type: "hasTechnique", techniqueId: "nen-instruction" },
        }],
      },
      actorContext: requirementContextFor(),
      rolls: [SUCCESS_ROLL],
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((error) => error.code))
      .toEqual(["nen.awakening.actor.capability.unresolved"]);
  });

  it("refuses authored requirements that are not requirements", () => {
    for (const requirements of [null, 3, "all", [null], [{}], [{ id: "" }]]) {
      refusedCleanly(
        `capability=${JSON.stringify(requirements)}`,
        () => awakenNenAbrupt(awakeningContext(), {
          method: "abrupt",
          actor: {
            ref: { type: "character", id: "t" },
            capability: requirements as never,
          },
          actorContext: requirementContextFor(),
          rolls: [SUCCESS_ROLL],
        }),
      );

      refusedCleanly(
        `eligibility=${JSON.stringify(requirements)}`,
        () => awakenNenExceptional(awakeningContext(), {
          method: "exceptional",
          source: {
            ref: { type: "item", id: "relic" },
            overrides: {
              eligibility: {
                requirements: requirements as never,
                summary: "Waived.",
              },
            },
          },
        }),
      );
    }
  });
});


describe("R3 — every new validator survives hostile content", () => {
  it("builds a diagnostic for a null external Ability without reading it", () => {
    /*
     * The exact crash: the guard proved the entry was not an object, and the
     * error literal inside the guard then called describe(external.abilityId)
     * on it.
     */
    const state = {
      ...createUnawakenedAwakeningState(unassignedNenType()),
      externalAbilities: [null],
    };

    expect(() => findAwakeningStateIssues(state as never)).not.toThrow();
    expect(findAwakeningStateIssues(state as never).length).toBeGreaterThan(0);
  });

  it("sweeps every nested array for hostile entries", () => {
    const nested: readonly (readonly [string, unknown])[] = [
      ["history", [null]],
      ["history", [{ kind: "awakening" }]],
      ["history", [3]],
      ["externalAbilities", [null]],
      ["externalAbilities", ["ability"]],
      ["suppression", [null]],
      ["suppression", [{ kind: "unknown" }]],
      ["suppression", [{ kind: "forced-zetsu", id: "x", exemptions: [null] }]],
      ["suppression", [{ kind: "forced-zetsu", id: "x", exemptions: "none" }]],
    ];

    for (const [field, value] of nested) {
      const state = { ...createUnawakenedAwakeningState(unassignedNenType()), [field]: value };

      expect([field, (() => {
        try {
          return findAwakeningStateIssues(state as never).length > 0;
        } catch (thrown) {
          return `threw: ${String(thrown)}`;
        }
      })()]).toEqual([field, true]);
    }
  });

  it("refuses an unknown override field rather than ignoring it", () => {
    const issues = findExceptionalSourceIssues({
      ref: { type: "item", id: "relic" },
      overrides: { somethingInvented: { summary: "x" } },
    } as never);

    expect(issues.map((issue) => issue.code))
      .toContain("nen.awakening.override.field.unknown");
  });

  it("validates nenType.known and naturalAbilityDevelopment against their vocabularies", () => {
    expect(findExceptionalSourceIssues({
      ref: { type: "item", id: "relic" },
      overrides: {
        nenType: { type: "emission", known: "yes", summary: "x" },
      },
    } as never).map((issue) => issue.code))
      .toContain("nen.awakening.override.nen-type.known.invalid");

    expect(findExceptionalSourceIssues({
      ref: { type: "item", id: "relic" },
      overrides: {
        naturalAbilityDevelopment: { development: "whatever", summary: "x" },
      },
    } as never).map((issue) => issue.code))
      .toContain("nen.awakening.override.ability-development.invalid");
  });

  /*
   * The missing-summary check was unreachable: the helper that assembled the
   * record substituted the field's own NAME for an absent summary before the
   * check ever saw it, so `summary: undefined` reported no error and the sheet
   * showed "eligibility" as the explanation.
   */
  it("requires the authored summary rather than substituting the field name", () => {
    const issues = findExceptionalSourceIssues({
      ref: { type: "item", id: "relic" },
      overrides: { eligibility: { requirements: [], summary: undefined } },
    } as never);

    expect(issues.map((issue) => issue.code))
      .toContain("nen.awakening.override.summary.missing");
  });

  it("refuses a malformed exceptional source of any shape", () => {
    for (const source of GARBAGE) {
      expect([label(source), (() => {
        try {
          return findExceptionalSourceIssues(source as never).length > 0;
        } catch (thrown) {
          return `threw: ${String(thrown)}`;
        }
      })()]).toEqual([label(source), true]);
    }
  });

  it("refuses a malformed reversion request of any shape", () => {
    const awakened = awakeningContext().nen;

    for (const request of GARBAGE) {
      refusedCleanly(
        `reversion=${label(request)}`,
        () => revertNen(
          awakeningContext({ nen: awakened }),
          request as never,
        ),
      );
    }
  });

  it("refuses malformed targeted Ability lists", () => {
    for (const targeted of [3, "ability", [null], [3], [""]]) {
      refusedCleanly(
        `targeted=${JSON.stringify(targeted)}`,
        () => revertNen(awakeningContext(), {
          source: { type: "curse", id: "c" },
          reason: "Severed.",
          targetedExternalAbilityIds: targeted as never,
        }),
      );
    }
  });

  it("refuses hostile persisted state at the deserialization boundary", () => {
    for (const value of GARBAGE) {
      expect([label(value), (() => {
        try {
          return awakeningStateFromJson(value as never).success;
        } catch (thrown) {
          return `threw: ${String(thrown)}`;
        }
      })()]).toEqual([label(value), false]);
    }
  });
});


describe("R4 — routing metadata is validated on every transition", () => {
  const BAD_OWNERS: readonly unknown[] = [
    undefined, null, {}, { domain: "character" }, { id: "x" },
    { domain: "nonsense", id: "x" }, { domain: "character", id: "" }, 3, "gon",
  ];

  it("refuses a malformed owner everywhere, emitting nothing", () => {
    for (const owner of BAD_OWNERS) {
      const context = { ...awakeningContext(), owner } as unknown as NenAwakeningContext;

      for (const [name, run] of everyRoute(context)) {
        refusedCleanly(`${name} / owner=${label(owner)}`, run);
      }
    }
  });

  it("refuses a malformed operation id everywhere", () => {
    for (const operationId of [undefined, null, "", "   ", 3, {}]) {
      const context = {
        ...awakeningContext(),
        operationId,
      } as unknown as NenAwakeningContext;

      for (const [name, run] of everyRoute(context)) {
        refusedCleanly(`${name} / op=${label(operationId)}`, run);
      }
    }
  });

  it("refuses a non-finite operation timestamp everywhere", () => {
    for (const occurredAt of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, "now"]) {
      const context = {
        ...awakeningContext(),
        occurredAt,
      } as unknown as NenAwakeningContext;

      for (const [name, run] of everyRoute(context)) {
        refusedCleanly(`${name} / at=${label(occurredAt)}`, run);
      }
    }
  });

  /*
   * The confirmed failure this repair exists for: reversion validated none of
   * these, so with `owner: null` it committed a reverted character and emitted
   * events addressed to nothing.
   */
  it("does not let reversion commit with a null owner", () => {
    const context = {
      ...awakeningContext({ nen: awakenedFixture() }),
      owner: null,
    } as unknown as NenAwakeningContext;

    const result = revertNen(context, {
      source: { type: "curse", id: "c" },
      reason: "Severed.",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((error) => error.code))
      .toContain("nen.awakening.owner.invalid");
    expect(context.nen.awakening.condition).toBe("awakened");
  });
});


function awakenedFixture(): NenState {
  const result = awakenNenStandard(awakeningContext(), {
    method: "standard",
    trainingCompleted: true,
  });

  if (!result.success) throw new Error("fixture failed");

  return result.payload.state;
}


describe("R6 — extreme but finite Attributes never produce NaN", () => {
  it("refuses non-finite Attributes at the transition boundary", () => {
    for (const spi of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      refusedCleanly(
        `spi=${spi}`,
        () => awakenNenAbrupt(
          awakeningContext({ attributes: { ...AWAKENING_CAPABLE, spi } }),
          {
            method: "abrupt",
            actor: ACTOR,
            actorContext: requirementContextFor(),
            rolls: [SUCCESS_ROLL],
          },
        ),
      );
    }
  });

  it("resolves a finite but enormous character deterministically", () => {
    const huge = {
      ...AWAKENING_CAPABLE,
      con: 5000, vit: 5000, per: 5000, wis: 5000, spi: 5000,
    };

    const result = awakenNenAbrupt(
      awakeningContext({ attributes: huge }),
      {
        method: "abrupt",
        actor: ACTOR,
        actorContext: requirementContextFor(),
        rolls: [SUCCESS_ROLL],
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const resolution = result.payload.changes.resolutions[0]!;

    expect(Number.isNaN(resolution.probability)).toBe(false);
    expect(resolution.probability).toBe(0.99);
    expect(resolution.succeeded).toBe(true);
  });
});


describe("instinctive SPI gate still refuses without an authorization", () => {
  it("refuses a malformed authorization of any shape", () => {
    for (const authorization of GARBAGE) {
      refusedCleanly(
        `auth=${label(authorization)}`,
        () => awakenNenInstinctive(
          awakeningContext({
            attributes: {
              ...AWAKENING_CAPABLE,
              spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI,
            },
          }),
          {
            method: "instinctive",
            authorization: authorization as never,
            naturalAbilityId: "ability-a",
          },
        ),
      );
    }
  });
});


/*
 * The REQUEST argument, swept as thoroughly as the context was.
 *
 * The context sweeps above passed while five routes still threw on a null
 * REQUEST, because each read request fields to build its trace node before any
 * validator ran. A trace label is not a reason to dereference.
 */
describe("every route refuses a malformed request without throwing", () => {
  function routesWithRequest(
    request: unknown,
  ): readonly (readonly [string, () => NenAwakeningTransitionResult])[] {
    const context = awakeningContext();

    return [
      ["standard", () => awakenNenStandard(context, request as never)],
      ["abrupt", () => awakenNenAbrupt(context, request as never)],
      ["instinctive", () => awakenNenInstinctive(context, request as never)],
      ["exceptional", () => awakenNenExceptional(context, request as never)],
      ["reversion", () => revertNen(context, request as never)],
      ["collapse", () => settleNenCollapse(context, request as never)],
      ["recovery", () => advanceNenCollapseRecovery(context, request as never)],
      ["release-involuntary", () =>
        releaseInvoluntaryZetsu(context, request as never)],
      ["release-forced", () => releaseForcedZetsu(context, request as never)],
    ];
  }

  it("refuses every garbage request on all nine transitions", () => {
    for (const request of GARBAGE) {
      for (const [name, run] of routesWithRequest(request)) {
        refusedCleanly(`${name} / request=${label(request)}`, run);
      }
    }
  });

  it("emits nothing and changes nothing on a refused request", () => {
    const context = awakeningContext();
    const before = JSON.stringify(context.nen);

    for (const request of GARBAGE) {
      for (const [name, run] of routesWithRequest(request)) {
        const result = run();

        expect([name, result.success]).toEqual([name, false]);

        /* A failure carries no outcome at all, so there is nothing to emit. */
        expect([name, "payload" in result]).toEqual([name, false]);
      }
    }

    expect(JSON.stringify(context.nen)).toBe(before);
  });

  /*
   * `awakenNenStandard(context, abruptRequest)` is a caller who has wired up
   * the wrong function. Honouring the shape while ignoring the label it
   * carries would resolve an abrupt awakening as a standard one — silently,
   * and with no roll.
   */
  it("refuses a request whose method names a different route", () => {
    const context = awakeningContext();

    const mismatched: readonly (readonly [string, () => NenAwakeningTransitionResult])[] = [
      ["standard<-abrupt", () => awakenNenStandard(context, {
        method: "abrupt", trainingCompleted: true,
      } as never)],
      ["abrupt<-standard", () => awakenNenAbrupt(context, {
        method: "standard",
        actor: ACTOR,
        actorContext: requirementContextFor(),
        rolls: [SUCCESS_ROLL],
      } as never)],
      ["instinctive<-exceptional", () => awakenNenInstinctive(context, {
        method: "exceptional",
        authorization: { grantedBy: GM, reason: "x" },
        naturalAbilityId: "a",
      } as never)],
      ["exceptional<-instinctive", () => awakenNenExceptional(context, {
        method: "instinctive",
        source: { ref: { type: "item", id: "relic" }, overrides: {} },
      } as never)],
    ];

    for (const [name, run] of mismatched) {
      const result = run();

      expect([name, result.success]).toEqual([name, false]);
      if (result.success) continue;

      expect([name, result.errors.map((error) => error.code)])
        .toEqual([name, ["nen.awakening.request.method.mismatch"]]);
    }
  });
});


/*
 * A prototype-less object has no `toString`, so `String(value)` on one throws
 * "Cannot convert object to primitive value" — inside the code that was
 * building the diagnostic to explain why the value was rejected.
 *
 * Not an exotic curiosity: `JSON.parse` with a reviver produces them, which is
 * exactly the provenance of the data these validators exist to judge.
 */
describe("prototype-less values never break diagnostic formatting", () => {
  const BARE = () => Object.create(null) as never;

  it("describes any hostile value without asking it to describe itself", () => {
    const values: readonly unknown[] = [
      Object.create(null),
      Object.assign(Object.create(null), { domain: "character" }),
      { toString() { throw new Error("refused"); } },
      { [Symbol.toPrimitive]() { throw new Error("refused"); } },
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Symbol("s"),
      () => undefined,
      10n,
      [1, 2, 3],
    ];

    for (const value of values) {
      expect(() => describeDiagnosticValue(value)).not.toThrow();

      const described = describeDiagnosticValue(value);

      /* Whatever comes out has to survive the serialization boundary. */
      expect(() => JSON.stringify(described)).not.toThrow();
    }
  });

  it("refuses a prototype-less owner rather than throwing", () => {
    const context = {
      ...awakeningContext(),
      owner: BARE(),
    } as unknown as NenAwakeningContext;

    for (const [name, run] of everyRoute(context)) {
      refusedCleanly(`${name} / bare owner`, run);
    }
  });

  it("refuses a prototype-less operation id and timestamp", () => {
    for (const field of ["operationId", "occurredAt"] as const) {
      const context = {
        ...awakeningContext(),
        [field]: BARE(),
      } as unknown as NenAwakeningContext;

      for (const [name, run] of everyRoute(context)) {
        refusedCleanly(`${name} / bare ${field}`, run);
      }
    }
  });

  it("refuses a prototype-less legacy Nen Type rather than throwing", () => {
    const nen = createUnawakenedNenState(unassignedNenType());

    expect(() => adoptLegacyNenType(nen, BARE())).not.toThrow();
    expect(adoptLegacyNenType(nen, BARE()).success).toBe(false);
  });

  it("refuses prototype-less requests, sources and authorizations", () => {
    const context = awakeningContext();

    expect(() => findExceptionalSourceIssues(BARE())).not.toThrow();
    expect(findExceptionalSourceIssues(BARE()).length).toBeGreaterThan(0);

    expect(() => findExceptionalSourceIssues({
      ref: BARE(),
      overrides: BARE(),
    } as never)).not.toThrow();

    refusedCleanly("bare authorization", () => awakenNenInstinctive(context, {
      method: "instinctive",
      authorization: BARE(),
      naturalAbilityId: "a",
    } as never));

    refusedCleanly("bare source", () => revertNen(context, {
      source: BARE(),
      reason: "Severed.",
    } as never));

    refusedCleanly("bare collapse", () => settleNenCollapse(context, {
      collapse: BARE(),
    } as never));
  });

  it("refuses a prototype-less stored state at the loading boundary", () => {
    expect(() => awakeningStateFromJson(BARE())).not.toThrow();
    expect(awakeningStateFromJson(BARE()).success).toBe(false);

    const bareNested = {
      ...createUnawakenedAwakeningState(unassignedNenType()),
      externalAbilities: [Object.create(null)],
      suppression: [Object.create(null)],
    };

    expect(() => findAwakeningStateIssues(bareNested as never)).not.toThrow();
    expect(findAwakeningStateIssues(bareNested as never).length)
      .toBeGreaterThan(0);
  });
});
