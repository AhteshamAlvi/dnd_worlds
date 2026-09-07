/*
 * Targeting, with the zero-target case treated as ordinary rather than exotic.
 *
 * The tests worth reading here are the ones that assert an action with NO
 * targets is well-formed. That is the case the previous model could not
 * express, and every "an attack must have a target" assumption in a consumer
 * downstream is a bug these fixtures are meant to catch early.
 */

import { describe, expect, it } from "vitest";

import {
  ANY_NUMBER_OF_TARGETS,
  EXACTLY_ONE_TARGET,
  NO_TARGETS,
  ONE_OR_MORE_TARGETS,
  OPTIONAL_TARGET,
  evaluateTargetSelection,
  findTargetCardinalityIssues,
  findTargetIssues,
  targetBodyOwnerId,
  type TargetRef,
  type TargetSpecification,
} from "../targeting";

const GON: TargetRef = { kind: "entity", entityId: "gon" };
const KILLUA: TargetRef = { kind: "entity", entityId: "killua" };

const HEAL: TargetSpecification = { cardinality: EXACTLY_ONE_TARGET };


describe("target cardinality", () => {
  it("accepts a selection of exactly one where one is required", () => {
    expect(evaluateTargetSelection(HEAL, [GON]))
      .toEqual({ outcome: "satisfied" });
  });

  it("rejects an empty selection for a capability that needs a recipient", () => {
    expect(evaluateTargetSelection(HEAL, []))
      .toEqual({ outcome: "too-few", required: 1, supplied: 0 });
  });

  it("rejects two targets for a single-recipient capability", () => {
    expect(evaluateTargetSelection(HEAL, [GON, KILLUA]))
      .toEqual({ outcome: "too-many", permitted: 1, supplied: 2 });
  });

  it("lets an optional-target profile take zero or one", () => {
    const optional: TargetSpecification = { cardinality: OPTIONAL_TARGET };

    expect(evaluateTargetSelection(optional, []).outcome).toBe("satisfied");
    expect(evaluateTargetSelection(optional, [GON]).outcome).toBe("satisfied");
    expect(evaluateTargetSelection(optional, [GON, KILLUA]).outcome)
      .toBe("too-many");
  });

  it("lets a targetless profile take nothing, and refuse a target", () => {
    const none: TargetSpecification = { cardinality: NO_TARGETS };

    expect(evaluateTargetSelection(none, []).outcome).toBe("satisfied");
    expect(evaluateTargetSelection(none, [GON]))
      .toEqual({ outcome: "too-many", permitted: 0, supplied: 1 });
  });

  it("keeps multiple targets a flat list rather than a nested target", () => {
    const many: TargetSpecification = { cardinality: ANY_NUMBER_OF_TARGETS };
    const selection = [GON, KILLUA, { kind: "object", objectId: "door" } as const];

    expect(evaluateTargetSelection(many, selection).outcome).toBe("satisfied");

    /* The selection IS the collection. Nothing nests. */
    expect(selection).toHaveLength(3);
    expect(selection.every((target) => "kind" in target)).toBe(true);
  });

  it("requires at least one for a one-or-more profile", () => {
    const some: TargetSpecification = { cardinality: ONE_OR_MORE_TARGETS };

    expect(evaluateTargetSelection(some, []).outcome).toBe("too-few");
    expect(evaluateTargetSelection(some, [GON, KILLUA]).outcome)
      .toBe("satisfied");
  });

  it("rejects a specification whose maximum is below its minimum", () => {
    expect(findTargetCardinalityIssues({ minimum: 3, maximum: 1 })
      .map((error) => error.code))
      .toContain("targeting.cardinality.inverted");

    expect(findTargetCardinalityIssues({ minimum: 1.5, maximum: null })
      .map((error) => error.code))
      .toContain("targeting.cardinality.minimum.invalid");
  });
});


describe("anatomical targets", () => {
  const bodyPart: TargetRef = {
    kind: "body-part",
    bodyOwnerId: "gon",
    bodyPartId: "arm-2",
  };

  const point: TargetRef = {
    kind: "anatomical-point",
    bodyOwnerId: "killua",
    criticalPointId: "wrist:hand-2",
  };

  it("preserves the exact owner and part id", () => {
    expect(findTargetIssues(bodyPart)).toEqual([]);

    if (bodyPart.kind !== "body-part") throw new Error("unreachable");

    expect(bodyPart.bodyOwnerId).toBe("gon");
    expect(bodyPart.bodyPartId).toBe("arm-2");
    expect(targetBodyOwnerId(bodyPart)).toBe("gon");
  });

  it("preserves the exact owner and Anatomical Point id", () => {
    expect(findTargetIssues(point)).toEqual([]);

    if (point.kind !== "anatomical-point") throw new Error("unreachable");

    expect(point.bodyOwnerId).toBe("killua");
    expect(point.criticalPointId).toBe("wrist:hand-2");
    expect(targetBodyOwnerId(point)).toBe("killua");
  });

  it("rejects a part with no Body behind it", () => {
    expect(findTargetIssues({
      kind: "body-part",
      bodyOwnerId: "",
      bodyPartId: "arm-2",
    }).map((error) => error.code))
      .toEqual(["targeting.target.body-part.owner.missing"]);
  });

  it("rejects a Body with no part named", () => {
    expect(findTargetIssues({
      kind: "body-part",
      bodyOwnerId: "gon",
      bodyPartId: "   ",
    }).map((error) => error.code))
      .toEqual(["targeting.target.body-part.id.missing"]);
  });

  it("rejects an Anatomical Point missing either half", () => {
    expect(findTargetIssues({
      kind: "anatomical-point",
      bodyOwnerId: "",
      criticalPointId: "",
    }).map((error) => error.code)).toEqual([
      "targeting.target.anatomical-point.owner.missing",
      "targeting.target.anatomical-point.id.missing",
    ]);
  });

  it("reports no Body owner for targets that do not have one", () => {
    expect(targetBodyOwnerId(GON)).toBeUndefined();
    expect(targetBodyOwnerId({ kind: "self" })).toBeUndefined();
  });
});


describe("permitted target kinds", () => {
  const objectsOnly: TargetSpecification = {
    cardinality: EXACTLY_ONE_TARGET,
    permittedKinds: ["object"],
  };

  it("refuses a target of a kind the capability does not accept", () => {
    expect(evaluateTargetSelection(objectsOnly, [GON])).toEqual({
      outcome: "kind-not-permitted",
      index: 0,
      kind: "entity",
      permitted: ["object"],
    });
  });

  it("accepts a permitted kind", () => {
    expect(evaluateTargetSelection(objectsOnly, [
      { kind: "object", objectId: "door" },
    ]).outcome).toBe("satisfied");
  });

  it("treats an empty permitted list as an authoring mistake", () => {
    const evaluation = evaluateTargetSelection(
      { cardinality: EXACTLY_ONE_TARGET, permittedKinds: [] },
      [GON],
    );

    expect(evaluation.outcome).toBe("invalid");
  });
});


describe("malformed input is not a rule answer", () => {
  it("reports a broken target as invalid rather than as a count", () => {
    /*
     * Two targets were supplied for a one-target capability AND one of them is
     * malformed. The malformed input wins: "you chose too many" would send a
     * GM to override a cardinality rule that is not the actual problem.
     */
    const evaluation = evaluateTargetSelection(HEAL, [
      GON,
      { kind: "entity", entityId: "" },
    ]);

    expect(evaluation.outcome).toBe("invalid");

    if (evaluation.outcome !== "invalid") throw new Error("unreachable");

    expect(evaluation.errors[0].code).toBe("targeting.target.entity.missing");
  });

  it("validates positions and areas carried as targets", () => {
    expect(findTargetIssues({
      kind: "position",
      position: {
        kind: "metric",
        contextId: "",
        xMetres: 0,
        yMetres: 0,
        zMetres: 0,
      },
    }).map((error) => error.code))
      .toContain("spatial.position.context.missing");

    expect(findTargetIssues({
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
        radiusMetres: -2,
      },
    }).map((error) => error.code))
      .toContain("spatial.area.extent.invalid");
  });
});
