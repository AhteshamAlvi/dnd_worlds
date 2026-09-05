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

  it("imports nothing from character/rules/ except the authored-content vocabulary", () => {
    /*
     * The one remaining edge, and why it is allowed to remain.
     *
     * An Injury is authored CONTENT as well as anatomy: InjuryDefinition
     * extends EffectfulDefinition and carries Effects. The Effect union is a
     * union over every domain — it names Body selectors, check scopes,
     * Attribute keys and Action capacities — so it cannot be pushed below
     * Foundation without dragging all of them with it, and the Injury catalog
     * cannot be pushed above Foundation without taking Recovery (which reads
     * it every pass) along.
     *
     * What matters is that the edge is one-directional and confined. Rules
     * never imports Injuries, so there is no Rules <-> Foundation cycle; and
     * pinning the exception here means a NEW upward import fails this test
     * rather than quietly joining an existing exception.
     */
    const allowed = new Set([
      join(SRC, "character", "foundation", "body", "injuries", "types.ts"),
    ]);

    const offenders = foundationFiles
      .filter((path) => !allowed.has(path))
      .filter((path) =>
        moduleSpecifiers(path).some((specifier) =>
          resolvesInto(path, specifier, join("character", "rules")),
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
