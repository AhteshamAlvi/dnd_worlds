/*
 * Investigation — analysis of evidence already in hand.
 *
 * Distinct from Detection in what gates it: not whether you noticed something,
 * but whether you hold the evidence, the Skill and the knowledge a conclusion
 * requires. The resolver returns finding IDS and never narration, so a
 * prerequisite that silently stopped applying would be invisible in play.
 */

import { describe, expect, it } from "vitest";

import { errorCodesOf, payloadOf } from "./fixtures/result";

import { createTraceNode } from "../infrastructure/trace";
import { resolveInvestigationCheck } from "../character/foundation/senses/investigation/resolution";
import {
  eligibleInvestigationFindings,
  findingsRevealedAtBand,
} from "../character/foundation/senses/investigation/findings";
import { findInvestigationRequestIssues } from "../character/foundation/senses/investigation/validation";
import type {
  InvestigationFinding,
  InvestigationRequest,
} from "../character/foundation/senses/investigation/types";
import type { ConcealmentRating } from "../character/foundation/senses/concealment";

import { roll, route, sensoryProfile, sensoryStats, source } from "./fixtures/senses";

/* Investigation: round((INT 18 + WIS 14 + PER 16) / 3) = 16 -> +3. */
const INVESTIGATION_MODIFIER = 3;

const FINDINGS: readonly InvestigationFinding[] = [
  { id: "was-a-struggle", requiredBand: "minimal" },
  {
    id: "attacker-was-left-handed",
    requiredBand: "partial",
    requiredSkillIds: ["forensics"],
  },
  {
    id: "nen-residue-is-emitter",
    requiredBand: "substantial",
    requiredEvidenceIds: ["scorch-mark"],
    requiredKnowledgeIds: ["nen-categories"],
  },
];

function request(overrides: Partial<InvestigationRequest> = {}): InvestigationRequest {
  return {
    stats: sensoryStats(),
    subject: "evidence",
    evidence: [],
    findings: FINDINGS,
    difficulty: { kind: "fixed", difficulty: 10 },
    dice: roll(10),
    ...overrides,
  };
}

function concealmentRating(total: number): ConcealmentRating {
  return {
    route: route(),
    mode: "established",
    total,
    trace: createTraceNode({
      id: "test.concealment.informational",
      label: "Test informational Concealment",
      output: total,
    }),
  };
}


describe("against a fixed difficulty", () => {
  it("rolls the Investigation Derived Attribute", () => {
    const result = payloadOf(resolveInvestigationCheck(request()));

    expect(result.total).toBe(10 + INVESTIGATION_MODIFIER);
    expect(result.opposingValue).toBe(10);
    expect(result.margin).toBe(3);
    expect(result.band).toBe("minimal");
  });

  it("carries the fixed check through for inspection", () => {
    const result = payloadOf(resolveInvestigationCheck(request()));

    expect(result.fixedCheck?.margin).toBe(3);
    expect(result.check.total).toBe(13);
  });

  it("reveals nothing on a missed roll", () => {
    const result = payloadOf(resolveInvestigationCheck(request({ dice: roll(6) })));

    expect(result.band).toBe("none");
    expect(result.revealedFindingIds).toEqual([]);
  });
});


describe("opposed by informational Concealment", () => {
  it("measures the margin against the Concealment total", () => {
    const result = payloadOf(resolveInvestigationCheck(request({
      difficulty: { kind: "concealment", rating: concealmentRating(8) },
    })));

    expect(result.opposingValue).toBe(8);
    expect(result.margin).toBe(5);
    expect(result.band).toBe("partial");
    expect(result.fixedCheck).toBeUndefined();
  });
});


describe("finding prerequisites", () => {
  it("reveals only what the band reached", () => {
    const result = payloadOf(resolveInvestigationCheck(request({ dice: roll(10) })));

    expect(result.band).toBe("minimal");
    expect(result.revealedFindingIds).toEqual(["was-a-struggle"]);
  });

  it("withholds a finding whose Skill the character lacks", () => {
    // 15 + 3 = 18 against 10 -> margin 8 -> partial, enough band but no Skill.
    const result = payloadOf(resolveInvestigationCheck(request({ dice: roll(15) })));

    expect(result.band).toBe("partial");
    expect(result.eligibleFindingIds).not.toContain("attacker-was-left-handed");
    expect(result.revealedFindingIds).toEqual(["was-a-struggle"]);
  });

  it("reveals it once the Skill is held", () => {
    const result = payloadOf(resolveInvestigationCheck(request({
      dice: roll(15),
      skillIds: ["forensics"],
    })));

    expect(result.revealedFindingIds).toEqual([
      "was-a-struggle",
      "attacker-was-left-handed",
    ]);
  });

  it("requires the evidence AND the knowledge, not either", () => {
    // 20 + 3 = 23 against 10 -> margin 13 -> substantial.
    const withEvidenceOnly = payloadOf(resolveInvestigationCheck(request({
      dice: roll(20),
      evidence: [{ id: "scorch-mark" }],
    })));
    const withKnowledgeOnly = payloadOf(resolveInvestigationCheck(request({
      dice: roll(20),
      knowledgeIds: ["nen-categories"],
    })));
    const withBoth = payloadOf(resolveInvestigationCheck(request({
      dice: roll(20),
      evidence: [{ id: "scorch-mark" }],
      knowledgeIds: ["nen-categories"],
    })));

    expect(withEvidenceOnly.band).toBe("substantial");
    expect(withEvidenceOnly.revealedFindingIds).not.toContain("nen-residue-is-emitter");
    expect(withKnowledgeOnly.revealedFindingIds).not.toContain("nen-residue-is-emitter");
    expect(withBoth.revealedFindingIds).toContain("nen-residue-is-emitter");
  });

  it("separates eligibility from revelation", () => {
    /*
     * A finding you have every prerequisite for but did not roll well enough
     * to reach is eligible and unrevealed — which is what lets a GM say "there
     * is more here" without saying what.
     */
    const result = payloadOf(resolveInvestigationCheck(request({
      dice: roll(10),
      evidence: [{ id: "scorch-mark" }],
      knowledgeIds: ["nen-categories"],
      skillIds: ["forensics"],
    })));

    expect(result.eligibleFindingIds).toHaveLength(3);
    expect(result.revealedFindingIds).toEqual(["was-a-struggle"]);
  });
});


describe("the finding helpers on their own", () => {
  it("filters by every prerequisite kind at once", () => {
    const eligible = eligibleInvestigationFindings({
      findings: FINDINGS,
      evidenceIds: new Set(["scorch-mark"]),
      skillIds: new Set<string>(),
      knowledgeIds: new Set(["nen-categories"]),
    });

    expect(eligible.map((finding) => finding.id)).toEqual([
      "was-a-struggle",
      "nen-residue-is-emitter",
    ]);
  });

  it("reveals every finding at or below the band reached", () => {
    expect(findingsRevealedAtBand(FINDINGS, "partial").map((finding) => finding.id))
      .toEqual(["was-a-struggle", "attacker-was-left-handed"]);
  });

  it("reveals nothing at the none band", () => {
    expect(findingsRevealedAtBand(FINDINGS, "none")).toEqual([]);
  });
});


describe("sense-specific Investigation", () => {
  const KEEN_EARS = sensoryProfile({
    effects: {
      senseModifiers: [{
        source: source("keen-ears"),
        sense: { kind: "specific", sense: "hearing" },
        amount: 6,
      }],
      senseGrants: [],
      senseSuppressions: [],
      nenPerceptionGrants: [],
      nenPerceptionSuppressions: [],
    },
  });

  it("substitutes the sense for ordinary PER", () => {
    // Hearing 22 -> round((18 + 14 + 22) / 3) = 18 -> +4.
    const result = payloadOf(resolveInvestigationCheck(request({
      profile: KEEN_EARS,
      sense: "hearing",
      dice: roll(10),
    })));

    expect(result.total).toBe(14);
    expect(result.margin).toBe(4);
  });

  it("leaves an unmodified sense at the ordinary score", () => {
    const result = payloadOf(resolveInvestigationCheck(request({
      profile: KEEN_EARS,
      sense: "sight",
      dice: roll(10),
    })));

    expect(result.total).toBe(10 + INVESTIGATION_MODIFIER);
  });

  it("refuses a sense with no profile to read it from", () => {
    expect(errorCodesOf(resolveInvestigationCheck(request({ sense: "hearing" }))))
      .toContain("character.senses.investigation.profile.missing");
  });

  it("reports the missing profile in validation first", () => {
    expect(findInvestigationRequestIssues(request({ sense: "hearing" }))
      .map((issue) => issue.type)).toContain("sense-profile-missing");
  });
});


describe("validation", () => {
  it("reports a non-finite fixed difficulty", () => {
    expect(findInvestigationRequestIssues(request({
      difficulty: { kind: "fixed", difficulty: Number.NaN },
    })).map((issue) => issue.type)).toContain("difficulty-invalid");
  });

  it("reports a finding with no id", () => {
    expect(findInvestigationRequestIssues(request({
      findings: [{ id: "  ", requiredBand: "minimal" }],
    })).map((issue) => issue.type)).toContain("finding-id-missing");
  });

  it("reports a finding with an unknown band", () => {
    expect(findInvestigationRequestIssues(request({
      findings: [{
        id: "impossible",
        requiredBand: "total" as InvestigationFinding["requiredBand"],
      }],
    })).map((issue) => issue.type)).toContain("finding-band-invalid");
  });

  it("accepts a well-formed request", () => {
    expect(findInvestigationRequestIssues(request())).toEqual([]);
  });
});
