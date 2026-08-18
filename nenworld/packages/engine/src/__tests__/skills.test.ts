/*
 * Tests Skill possession: the prerequisite paths that gate a Defined Skill,
 * and the authored catalog those prerequisites point at.
 */

import { describe, expect, it } from "vitest";

import {
  findSkillCatalogIssues,
  getSkillDefinition,
} from "../character/capabilities/skills";

import {
  findSkillValidationIssues,
  satisfiesSkillRequirements,
} from "../character/capabilities/validation";

describe("skills", () => {
  it("allows no Skills", () => {
    expect(
      findSkillValidationIssues(
        [],
        [],
        [],
      ),
    ).toEqual([]);
  });

  it("allows Punch with Martial Arts", () => {
    expect(
      findSkillValidationIssues(
        [
          {
            skillId: "punch",
          },
        ],
        [],
        [
          {
            techniqueId: "martial-arts",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("rejects Punch without Martial Arts", () => {
    expect(
      findSkillValidationIssues(
        [
          {
            skillId: "punch",
          },
        ],
        [],
        [],
      ),
    ).toEqual([
      {
        type: "unsatisfied-skill-requirements",
        skillId: "punch",
      },
    ]);
  });

  it("requires both Firebending and Firebending Forms for Fire Blast", () => {
    expect(
      findSkillValidationIssues(
        [
          {
            skillId: "fire-blast",
          },
        ],
        [
          {
            abilityId: "firebending",
          },
        ],
        [
          {
            techniqueId: "firebending-forms",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("rejects Fire Blast when the Ability is missing", () => {
    expect(
      findSkillValidationIssues(
        [
          {
            skillId: "fire-blast",
          },
        ],
        [],
        [
          {
            techniqueId: "firebending-forms",
          },
        ],
      ),
    ).toEqual([
      {
        type: "unsatisfied-skill-requirements",
        skillId: "fire-blast",
      },
    ]);
  });

  it("rejects duplicate Skills", () => {
    expect(
      findSkillValidationIssues(
        [
          {
            skillId: "punch",
          },
          {
            skillId: "punch",
          },
        ],
        [],
        [
          {
            techniqueId: "martial-arts",
          },
        ],
      ),
    ).toEqual([
      {
        type: "duplicate-skill",
        skillId: "punch",
      },
    ]);
  });

  it("treats a Skill with no requirements as always satisfied", () => {
    expect(
      satisfiesSkillRequirements(
        {
          id: "improvised-shove",
          name: "Improvised Shove",
          description: "A Skill with no prerequisite path.",
          timings: ["action"],
        },
        [],
        [],
      ),
    ).toBe(true);
  });

  it("defines Parry as a Reaction Skill", () => {
    expect(
      getSkillDefinition("parry")?.timings,
    ).toContain("reaction");
  });

  it("has a valid authored Skill catalog", () => {
    expect(
      findSkillCatalogIssues(),
    ).toEqual([]);
  });
});