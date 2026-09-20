/*
 * Danger, projected before anybody rolls anything.
 *
 * The two properties here are the reason this projector exists rather than
 * being a function of the damage:
 *
 *   The number is available BEFORE adjudication, which is what makes reacting
 *   to it possible at all.
 *
 *   The number does not know what the damage will be, which is what stops a
 *   danger sense from leaking a secret roll to the player who felt it.
 */

import { describe, expect, it } from "vitest";

import {
  dangerIntensity,
  describeThreatForGm,
  describeThreatForPlayer,
  findThreatIssues,
  projectThreat,
  THREAT_CONFIDENCES,
  type ProjectedThreat,
  type ThreatCommitment,
  type ThreatSeverity,
  type ThreatUrgency,
} from "../gameplay/composition";

import { LOOSE } from "./fixtures/composition";


const codes = (errors: readonly { code: string }[]): readonly string[] =>
  errors.map((error) => error.code);


function threat(overrides: Partial<ProjectedThreat> = {}): ProjectedThreat {
  return {
    severity: 3,
    urgency: 2,
    commitment: 2,
    confidence: "probable",
    ...overrides,
  };
}


describe("the danger formula is the sum of three declared dimensions", () => {
  it("spans the scale exactly, from the floor to the ceiling", () => {
    expect(dangerIntensity(threat({ severity: 1, urgency: 0, commitment: 0 })))
      .toBe(1);
    expect(dangerIntensity(threat({ severity: 5, urgency: 3, commitment: 2 })))
      .toBe(10);
  });

  it("resolves every intermediate combination as the plain sum", () => {
    for (const severity of [1, 2, 3, 4, 5] as ThreatSeverity[]) {
      for (const urgency of [0, 1, 2, 3] as ThreatUrgency[]) {
        for (const commitment of [0, 1, 2] as ThreatCommitment[]) {
          expect(dangerIntensity(threat({ severity, urgency, commitment })))
            .toBe(severity + urgency + commitment);
        }
      }
    }
  });

  it("accepts every value in the declared ranges", () => {
    for (const severity of [1, 2, 3, 4, 5] as ThreatSeverity[]) {
      expect(findThreatIssues(threat({ severity }))).toEqual([]);
    }

    for (const urgency of [0, 1, 2, 3] as ThreatUrgency[]) {
      expect(findThreatIssues(threat({ urgency }))).toEqual([]);
    }

    for (const commitment of [0, 1, 2] as ThreatCommitment[]) {
      expect(findThreatIssues(threat({ commitment }))).toEqual([]);
    }
  });

  it("refuses a value outside its range, rather than clamping it quietly", () => {
    expect(codes(findThreatIssues(threat({ severity: 0 as ThreatSeverity }))))
      .toContain("composition.threat.severity.invalid");
    expect(codes(findThreatIssues(threat({ severity: 6 as ThreatSeverity }))))
      .toContain("composition.threat.severity.invalid");
    expect(codes(findThreatIssues(threat({ urgency: 4 as ThreatUrgency }))))
      .toContain("composition.threat.urgency.invalid");
    expect(codes(findThreatIssues(threat({ commitment: -1 as ThreatCommitment }))))
      .toContain("composition.threat.commitment.invalid");
    expect(codes(findThreatIssues(threat({ severity: 2.5 as ThreatSeverity }))))
      .toContain("composition.threat.severity.invalid");
  });

  it("requires a stated confidence", () => {
    expect(
      codes(findThreatIssues(threat({
        confidence: "hunch" as ProjectedThreat["confidence"],
      }))),
    ).toContain("composition.threat.confidence.invalid");
  });
});


describe("confidence changes the wording and never the number", () => {
  const applies = { phase: "release" } as const;

  it("produces the same intensity at every confidence", () => {
    const dangers = THREAT_CONFIDENCES.map((confidence) => {
      const projection = projectThreat({
        source: LOOSE,
        appliesTo: applies,
        threat: threat({ confidence }),
      });

      return projection.kind === "threat" ? projection.danger : -1;
    });

    expect(dangers).toEqual([7, 7, 7]);
  });

  it("changes what the character is told", () => {
    const wordings = THREAT_CONFIDENCES.map((confidence) =>
      describeThreatForPlayer(projectThreat({
        source: LOOSE,
        appliesTo: applies,
        threat: threat({ confidence }),
      }))
    );

    expect(new Set(wordings).size).toBe(3);
  });

  it("keeps the working out of what the character is told", () => {
    const projection = projectThreat({
      source: LOOSE,
      appliesTo: applies,
      threat: threat({ severity: 5, urgency: 3, commitment: 2 }),
    });

    const player = describeThreatForPlayer(projection);

    /*
     * No intensity, no severity, no arithmetic. A player who could read the
     * working could read the danger back out of it, which is the leak this
     * split exists to prevent.
     */
    expect(player).not.toMatch(/\d/);
    expect(player).toBe("Something here is probably dangerous.");

    expect(describeThreatForGm(projection, threat({ severity: 5, urgency: 3, commitment: 2 })))
      .toContain("Danger 10");
  });

  it("records confidence beside the formula rather than inside it", () => {
    const projection = projectThreat({
      source: LOOSE,
      appliesTo: applies,
      threat: threat({ confidence: "conditional" }),
    });

    expect(projection.trace.formula)
      .toBe("clamp(severity + urgency + commitment, 1, 10)");
    expect(projection.trace.inputs.confidence!.value).toBe("conditional");
    expect(projection.trace.output).toBe(7);
  });
});


describe("a non-threat emits no danger at all", () => {
  it("produces no contribution rather than an intensity of zero", () => {
    const projection = projectThreat({
      source: LOOSE,
      appliesTo: { phase: "release" },
    });

    expect(projection.kind).toBe("none");
    expect(describeThreatForPlayer(projection)).toBe("");

    /* There is no contribution to carry a zero on. */
    expect("contribution" in projection).toBe(false);
  });
});


describe("the projection cannot see the damage, structurally", () => {
  it("takes no damage input of any kind", () => {
    const projection = projectThreat({
      source: LOOSE,
      appliesTo: { phase: "release" },
      threat: threat(),
    });

    if (projection.kind !== "threat") throw new Error("unreachable");

    expect(JSON.stringify(projection.trace)).not.toMatch(/damage|roll|hit/i);
    expect(Object.keys(projection.trace.inputs).sort())
      .toEqual(["commitment", "confidence", "severity", "urgency"]);
  });

  it("emits on the danger channel, as intent rather than as a physical fact", () => {
    const projection = projectThreat({
      source: LOOSE,
      appliesTo: { phase: "release", stepId: "release" },
      threat: threat(),
    });

    if (projection.kind !== "threat") throw new Error("unreachable");

    expect(projection.contribution.channel).toBe("danger");
    expect(projection.contribution.subject).toBe("threat");
    expect(projection.contribution.phenomenon).toBe("intent");
    expect(projection.contribution.intensity).toBe(7);

    /* Anchored at the actor: the warning comes from whoever means it. */
    expect(projection.contribution.anchor).toBe("actor");
  });
});
