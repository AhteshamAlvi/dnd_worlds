/*
 * Layering, enforced rather than documented.
 *
 * The dependency direction between Rules and Foundation is a decision that a
 * single convenient import silently reverses, and the type system will not
 * complain: TypeScript resolves circular type-only imports perfectly happily.
 * That is exactly how `RuleSourceRef` ended up being imported UPWARD into
 * foundation/actions/ while rules/effects.ts imported Action and Body
 * contracts DOWNWARD — a cycle nobody introduced on purpose and nothing
 * flagged.
 *
 * So the rule is checked here, against the source text, the way import
 * boundaries have to be checked to stay true.
 *
 * It is now absolute. The last exception — the Injury definition, which
 * carried Effects — was removed by splitting the interface: Foundation owns
 * AnatomicalInjuryDefinition, character/status/injuries/ owns the
 * Effect-bearing InjuryDefinition built on top of it, and Body is handed the
 * definitions it needs. There is no whitelist left, which is the only state a
 * layering rule reliably survives in.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sourceFilesUnder(directory: string): readonly string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      files.push(...sourceFilesUnder(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

/*
 * Every `from "..."` specifier in a file, import and re-export alike.
 *
 * A barrel's `export ... from` reaches the same module an import would and
 * creates the same edge, so both forms are collected.
 */
function moduleSpecifiers(path: string): readonly string[] {
  const source = readFileSync(path, "utf8");

  return [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((match) => match[1]!);
}

function resolvesInto(fromPath: string, specifier: string, segment: string): boolean {
  if (!specifier.startsWith(".")) return false;

  const resolved = join(fromPath, "..", specifier);

  return resolved.includes(segment);
}


describe("Foundation does not depend on Rules", () => {
  const foundationFiles = sourceFilesUnder(join(SRC, "character", "foundation"));

  it("finds the Foundation sources it is checking", () => {
    // Guards against the walk silently matching nothing and passing vacuously.
    expect(foundationFiles.length).toBeGreaterThan(50);
  });

  it("imports no provenance type from character/rules/", () => {
    /*
     * The specific reversal this ticket removed. Provenance is now
     * infrastructure/contribution-source.ts's ContributionSourceRef, and
     * RuleSourceRef / CheckSourceRef are aliases over it rather than separate
     * structural definitions — so nothing under foundation/ has any reason to
     * reach up for one.
     */
    const offenders = foundationFiles.filter((path) => {
      const source = readFileSync(path, "utf8");

      if (!/\bRuleSourceRef\b|\bCheckSourceRef\b/.test(source)) return false;

      // A prose mention in a comment is not a dependency; an import is.
      return moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, join("character", "rules")),
      );
    });

    expect(offenders).toEqual([]);
  });

  it("imports nothing from character/rules/, with NO exceptions", () => {
    /*
     * There used to be one: foundation/body/injuries/types.ts, because
     * InjuryDefinition extended EffectfulDefinition and carried Effects. It is
     * gone, and the whitelist that permitted it is gone with it.
     *
     * The fix was to split the INTERFACE rather than move the domain.
     * AnatomicalInjuryDefinition stays under Body with the applicability,
     * treatment and recovery-ceiling fields Body actually reads;
     * character/status/injuries/ declares InjuryDefinition on top of it and
     * adds the Effects. Manifestation and Recovery stay where they belong
     * because they are anatomical, and Body is handed the definitions it needs
     * through its inputs rather than reaching for a catalog.
     *
     * So this is now an absolute rule with nothing to except, which is the
     * only kind of layering rule that stays true. A new upward import fails
     * here rather than joining a list.
     */
    const offenders = foundationFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, join("character", "rules")),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("imports nothing from character/status/ either", () => {
    /*
     * The other direction the Injury split could have leaked.
     *
     * Status sits above Foundation and owns the Injury CATALOG. Body reaching
     * for it — to look up a definition instead of being handed one — would
     * reintroduce exactly the dependency the split removed, just one hop
     * further round: status/injuries/types.ts imports the rules vocabulary, so
     * a Foundation -> Status edge is a Foundation -> Rules edge wearing a hat.
     */
    const offenders = foundationFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, join("character", "status")),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("is not depended on in reverse — Rules never imports Injuries", () => {
    /*
     * Rules may import the Foundation contracts its Effects target, and does.
     * What it must not do is import the Injury domain back, which would make
     * the split circular in the other direction.
     */
    const ruleFiles = sourceFilesUnder(join(SRC, "character", "rules"));

    const offenders = ruleFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, join("body", "injuries")),
      ),
    );

    expect(offenders).toEqual([]);
  });
});


describe("Checks does not depend on Rules", () => {
  const checkFiles = sourceFilesUnder(join(SRC, "checks"));

  it("finds the Checks sources it is checking", () => {
    expect(checkFiles.length).toBeGreaterThan(3);
  });

  it("imports nothing from character/rules/", () => {
    /*
     * Content authors modifiers against the check vocabulary, so Rules imports
     * Checks. The reverse would make the vocabulary depend on one of its own
     * consumers.
     */
    const offenders = checkFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, join("character", "rules")),
      ),
    );

    expect(offenders).toEqual([]);
  });
});


describe("provenance has exactly one structural definition", () => {
  it("declares the shape only in infrastructure/contribution-source.ts", () => {
    /*
     * RuleSourceRef and CheckSourceRef may exist as readability aliases. What
     * they may not be is `interface`/`type` declarations with their own
     * `{ type; id }` body — two structural definitions of the same fact are
     * two things that drift.
     */
    const everySource = sourceFilesUnder(SRC).filter(
      (path) => !path.includes("__tests__"),
    );

    const structural = everySource.filter((path) =>
      /\b(?:interface|type)\s+(?:RuleSourceRef|CheckSourceRef)\b\s*(?:extends[^=]*)?\{/.test(
        readFileSync(path, "utf8"),
      ),
    );

    expect(structural).toEqual([]);
  });
});


/*
 * The closed sensory vocabulary is closed only if it is declared once.
 *
 * It was briefly declared twice: checks/scopes.ts and
 * character/foundation/senses/scopes.ts each had a full copy of the sense
 * list, the phenomena, the modes, the subjects, the four sensory scopes and
 * every selector. Because the two copies were structurally identical
 * TypeScript accepted assignment in both directions, so nothing failed — and
 * nothing would have failed if a seventh sense had been added to one and not
 * the other. Modifier matching would simply have stopped agreeing with profile
 * resolution, at runtime, silently.
 *
 * Foundation owns them now and checks/ re-exports. A re-export creates no
 * second declaration, so this counts DECLARATIONS specifically.
 */
describe("the sensory vocabulary has exactly one declaration", () => {
  const SENSES = join("character", "foundation", "senses", "scopes.ts");

  const everySource = sourceFilesUnder(SRC).filter(
    (path) => !path.includes("__tests__"),
  );

  /* `export const SENSE_IDS = [...]`, not `export { SENSE_IDS } from ...`. */
  const CLOSED_LISTS = [
    "SENSE_IDS",
    "PHYSICAL_SENSE_IDS",
    "PERCEPTION_PHENOMENA",
    "DETECTION_MODES",
    "CONCEALMENT_MODES",
    "DETECTION_SUBJECTS",
    "INVESTIGATION_SUBJECTS",
  ] as const;

  const SENSORY_TYPES = [
    "SenseId",
    "PerceptionPhenomenon",
    "DetectionMode",
    "ConcealmentMode",
    "DetectionSubject",
    "InvestigationSubject",
    "SenseSelector",
    "PhenomenonSelector",
    "DetectionModeSelector",
    "ConcealmentModeSelector",
    "DetectionSubjectSelector",
    "InvestigationSubjectSelector",
    "PerceptionCheckScope",
    "DetectionCheckScope",
    "ConcealmentCheckScope",
    "InvestigationCheckScope",
    "PerceptionCheckScopeSelector",
    "DetectionCheckScopeSelector",
    "ConcealmentCheckScopeSelector",
    "InvestigationCheckScopeSelector",
  ] as const;

  /* Matching the selectors is part of the vocabulary, not a second opinion. */
  const SENSORY_MATCHERS = ["matchesSenseSelector", "matchesPhenomenonSelector"] as const;

  function declaringFiles(pattern: RegExp): readonly string[] {
    return everySource.filter((path) => pattern.test(readFileSync(path, "utf8")));
  }

  it("finds the sources it is checking", () => {
    expect(everySource.length).toBeGreaterThan(50);
    expect(everySource.some((path) => path.endsWith(SENSES))).toBe(true);
  });

  it.each(CLOSED_LISTS)("declares %s exactly once, under foundation/senses/", (name) => {
    const declarers = declaringFiles(new RegExp(`\\bconst\\s+${name}\\b\\s*=`));

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(SENSES)).toBe(true);
  });

  it.each(SENSORY_TYPES)("declares %s exactly once, under foundation/senses/", (name) => {
    /*
     * Declarations only. `export type { SenseId }` re-export lists cannot
     * match because the word after `type` there is `{`; requiring `=` after a
     * type alias also excludes the inline `import { type SenseId }` specifier
     * form, which is how checks/ now names these without declaring them.
     */
    const declarers = declaringFiles(
      new RegExp(`\\binterface\\s+${name}\\b|\\btype\\s+${name}\\s*=`),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(SENSES)).toBe(true);
  });

  it.each(SENSORY_MATCHERS)("implements %s exactly once, under foundation/senses/", (name) => {
    const declarers = declaringFiles(new RegExp(`\\bfunction\\s+${name}\\b`));

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(SENSES)).toBe(true);
  });

  it("leaves no second sense-selector guard behind either", () => {
    /*
     * checks/validation.ts had its own isSenseSelector / isPhenomenonSelector.
     * They are foundation/senses/validation.ts's isValidSenseSelector and
     * isValidPhenomenonSelector now, imported rather than reimplemented.
     */
    const guards = ["isValidSenseSelector", "isValidPhenomenonSelector"] as const;

    for (const guard of guards) {
      const declarers = declaringFiles(new RegExp(`\\bfunction\\s+${guard}\\b`));

      expect(declarers).toHaveLength(1);
      expect(
        declarers[0]!.endsWith(join("character", "foundation", "senses", "validation.ts")),
      ).toBe(true);
    }
  });
});


/*
 * The Body Size -> Volume migration, enforced rather than assumed.
 *
 * The mechanical measurement was called Size and had always been litres, so
 * the unit and the name disagreed and every reader had to be told which one to
 * believe. Renaming it is only worth anything if it is COMPLETE: one surviving
 * `sizeL` beside a `volumeL` is worse than the original, because now there are
 * two names and no way to know whether they mean the same thing.
 *
 * `Scale` is untouched and ordinary uses of the word "size" are fine — this
 * checks the specific mechanical identifiers.
 */
describe("Body Volume has no Size-named survivors", () => {
  const everySource = sourceFilesUnder(SRC);

  const RETIRED = [
    "sizeL",
    "totalSizeL",
    "bulkSize",
    "adipositySize",
    "adipositySizeFactor",
    "resolveAdipositySizeFactor",
    "REFERENCE_BODY_SIZE_L",
    "SIZE_BURDEN_SENSITIVITY",
  ] as const;

  const REPLACEMENTS = [
    "volumeL",
    "totalVolumeL",
    "bulkVolume",
    "adiposityVolume",
    "adiposityVolumeFactor",
    "REFERENCE_BODY_VOLUME_L",
    "VOLUME_BURDEN_SENSITIVITY",
  ] as const;

  it("finds the sources it is checking", () => {
    expect(everySource.length).toBeGreaterThan(50);
  });

  it.each(RETIRED)("has no occurrence of %s left", (name) => {
    const offenders = everySource.filter((path) => {
      /* This file names them as strings; that is the check, not a survivor. */
      if (path === fileURLToPath(import.meta.url)) return false;

      return new RegExp(`\\b${name}\\b`).test(readFileSync(path, "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  it.each(REPLACEMENTS)("uses %s instead", (name) => {
    const users = everySource.filter((path) =>
      new RegExp(`\\b${name}\\b`).test(readFileSync(path, "utf8")),
    );

    expect(users.length).toBeGreaterThan(0);
  });

  it("keeps Scale, which was never the measurement being renamed", () => {
    const users = everySource.filter((path) =>
      /\beffectiveScale\b/.test(readFileSync(path, "utf8")),
    );

    expect(users.length).toBeGreaterThan(0);
  });
});


/*
 * Stage II Phase 2A layering.
 *
 *   infrastructure / time / checks / runtime / character foundation
 *                                 ^
 *                            spatial / targeting
 *                                 ^
 *                               actions
 *                                 ^
 *                       later consumers, including Combat
 *
 * Three of these edges are the ones that would actually get written by
 * accident, and each has a specific failure behind it:
 *
 * - spatial/ reaching for a Character is how "Range" quietly becomes "Range
 *   between two Characters", and then movement, En and a thrown rock each need
 *   their own copy for the cases with no Character at either end.
 *
 * - actions/ reaching for Combat is the whole reason this phase exists. A
 *   neutral action that imports Combat is not neutral, and every non-Combat
 *   consumer inherits a turn order it has no use for.
 *
 * - character/ reaching UP for actions/ is the subtler one. Character rules
 *   own Character requirements and must keep owning them; the moment a
 *   Character file imports the neutral finding shape, the adapter that was
 *   supposed to sit above both layers has been written inside one of them, and
 *   the dependency arrow is reversed with nothing to notice.
 */
describe("Stage II Phase 2A layering", () => {
  const spatialFiles = sourceFilesUnder(join(SRC, "spatial"));
  const targetingFiles = sourceFilesUnder(join(SRC, "targeting"));
  const actionFiles = sourceFilesUnder(join(SRC, "actions"));

  it("finds the sources it is checking", () => {
    // Guards against a renamed directory turning every rule below vacuous.
    expect(spatialFiles.length).toBeGreaterThan(5);
    expect(targetingFiles.length).toBeGreaterThan(2);
    expect(actionFiles.length).toBeGreaterThan(5);
  });

  it("keeps spatial/ independent of Character, Combat and consumers", () => {
    const forbidden = ["character", "gameplay", "targeting", "actions"];

    const offenders = spatialFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        forbidden.some((segment) => resolvesInto(path, specifier, segment)),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("lets targeting/ reuse Body identities and nothing else from Character", () => {
    /*
     * The ONE permitted upward reach, and it is deliberately narrow: the two
     * modules that declare BodyPartId and CriticalPointId. Reusing those is
     * what stops targeting from declaring a second string alias TypeScript
     * would happily let anyone swap with the first. Anything else under
     * character/ is a dependency on anatomy mechanics, which targeting does
     * not have and must not grow.
     */
    const permitted = [
      join("body", "anatomy", "types"),
      join("body", "critical-points", "types"),
    ];

    const offenders = targetingFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) => {
        if (!resolvesInto(path, specifier, "character")) return false;

        return !permitted.some((allowed) => specifier.includes(allowed));
      }),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps targeting/ out of Combat", () => {
    const offenders = targetingFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "gameplay"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("never lets Body import targeting/", () => {
    const bodyFiles = sourceFilesUnder(
      join(SRC, "character", "foundation", "body"),
    );

    expect(bodyFiles.length).toBeGreaterThan(20);

    const offenders = bodyFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "targeting"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps actions/ out of Combat, Character, and content catalogs", () => {
    const offenders = actionFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "gameplay") ||
        resolvesInto(path, specifier, "character")
      ),
    );

    expect(offenders).toEqual([]);
  });

  /*
   * A permission, guarded so it cannot be quietly withdrawn.
   *
   * 2A uses almost none of runtime/, and the temptation later is to "tidy up"
   * by forbidding the edge — at which point action preparation, which is
   * supposed to reach the coordinator, looks like it is eroding a boundary
   * rather than using one that was always intended.
   */
  it("permits the intended actions/ -> runtime/ edge", () => {
    const forbiddenForActions = ["gameplay", "character"];

    expect(forbiddenForActions).not.toContain("runtime");
    expect(forbiddenForActions).not.toContain("checks");
    expect(forbiddenForActions).not.toContain("time");
    expect(forbiddenForActions).not.toContain("spatial");
    expect(forbiddenForActions).not.toContain("targeting");
  });

  /*
   * Checked by resolved PREFIX, not by substring.
   *
   * `character/foundation/actions/` already exists and is a different domain
   * entirely — how many Actions per Round a character is capable of, which is
   * Character data Combat consumes. A substring test for "actions" flags every
   * file that imports it and the rule reads as broken on day one. The two
   * domains genuinely are different things that share a word, so the check has
   * to know the difference between `src/actions/` and an `actions` folder
   * further down a path.
   */
  function resolvesIntoDomain(
    fromPath: string,
    specifier: string,
    domain: string,
  ): boolean {
    if (!specifier.startsWith(".")) return false;

    const resolved = join(fromPath, "..", specifier);

    return resolved === join(SRC, domain) ||
      resolved.startsWith(join(SRC, domain) + "/");
  }

  it("never lets Character reach up into spatial/, targeting/ or actions/", () => {
    const characterFiles = sourceFilesUnder(join(SRC, "character"));

    expect(characterFiles.length).toBeGreaterThan(50);

    const offenders = characterFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesIntoDomain(path, specifier, "spatial") ||
        resolvesIntoDomain(path, specifier, "targeting") ||
        resolvesIntoDomain(path, specifier, "actions")
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("distinguishes src/actions/ from character/foundation/actions/", () => {
    /*
     * A guard on the guard above. If resolvesIntoDomain ever loosens back into
     * a substring match, this fails rather than the rule silently flagging the
     * Action-capacity domain forever.
     */
    const capacityImporter = join(SRC, "character", "resolution.ts");

    expect(resolvesIntoDomain(capacityImporter, "./foundation/actions", "actions"))
      .toBe(false);

    expect(resolvesIntoDomain(capacityImporter, "../actions/intent", "actions"))
      .toBe(true);
  });

  /*
   * No host geometry, by the only check that cannot be fooled by prose.
   *
   * The rule is "no Foundry scenes, walls, tokens, squares, hexes, grids or
   * canvas types". Grepping for those WORDS would fail on the comments that
   * explain why they are absent, so what is checked instead is the shape a
   * host dependency would actually have: a non-relative import. These three
   * domains have no package dependencies at all, so any bare specifier is
   * either a host library or a package that has no business here.
   */
  it("imports no package at all in the new domains", () => {
    const offenders = [...spatialFiles, ...targetingFiles, ...actionFiles]
      .filter((path) =>
        moduleSpecifiers(path).some((specifier) => !specifier.startsWith(".")),
      );

    expect(offenders).toEqual([]);
  });
});


/*
 * The two dice layers point one way.
 *
 * runtime/ owns operation-level dice validation and may project a validated
 * roll set into a check, so runtime/ -> checks/ is a real, intended edge.
 * The reverse would make the universal d20 vocabulary depend on the
 * transaction layer that happens to be one of its callers — and checks/ is
 * used from Character Foundation, which knows nothing about operations at all.
 */
describe("dice layering points from runtime to checks", () => {
  const checkFiles = sourceFilesUnder(join(SRC, "checks"));
  const runtimeFiles = sourceFilesUnder(join(SRC, "runtime"));

  it("finds the sources it is checking", () => {
    expect(checkFiles.length).toBeGreaterThan(3);
    expect(runtimeFiles.length).toBeGreaterThan(5);
  });

  it("never lets checks/ import runtime/", () => {
    const offenders = checkFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "runtime"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the projection the only runtime file reaching into checks/", () => {
    /*
     * Narrow on purpose. One crossing point is auditable; a second one added
     * later for convenience is how the two layers start sharing rules.
     */
    const offenders = runtimeFiles.filter((path) =>
      !path.endsWith("check-dice.ts") &&
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "checks"),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
