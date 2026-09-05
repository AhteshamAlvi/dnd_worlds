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
