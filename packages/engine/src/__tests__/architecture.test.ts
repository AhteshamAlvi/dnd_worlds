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


/*
 * The decision log is prose stored as data, and both suites below exempt it.
 *
 * Its entries QUOTE the patterns they retired — the `type:id` template, the
 * `equipped` boolean — because an entry that cannot say what it replaced
 * explains nothing. Those quotes live inside string literals rather than
 * comments, so comment-stripping does not reach them, and a rule that flagged
 * them would force the archive to describe its own decisions in paraphrase.
 * Nothing in this file is executed as a mechanic; it is read.
 */
const DECISION_LOG = join(SRC, "decisions", "log.ts");


/*
 * Source identity has exactly one spelling.
 *
 * contributionSourceKey() and a `${source.type}:${source.id}` template agreed
 * perfectly for as long as a source had exactly two fields, so five files had
 * quietly grown their own copy — in trace labels, in modifier selection, and
 * in the attribute ladder. The moment provenance gained an optional instance,
 * every one of those copies started dropping it: two owned copies of one Item
 * described themselves identically, and the traces disambiguated them with a
 * numeric suffix that named neither.
 *
 * The failure is invisible in review, because the template LOOKS like the key
 * and produces the same string for every source that predates instances. So it
 * is checked against the source text instead.
 *
 * actorKey() is deliberately outside the rule: ActorRef is a separately
 * declared shape answering a different question — who is acting, rather than
 * what supplied the mechanic — and identity.ts's own header says why the two
 * must not be merged.
 */
describe("a contribution source is keyed in one place", () => {
  const everySource = sourceFilesUnder(SRC).filter(
    (path) => !path.includes("__tests__"),
  );

  const stripComments = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  const PERMITTED = [
    join(SRC, "infrastructure", "contribution-source.ts"),
    /* actorKey(), over ActorRef — a different question with a different type. */
    join(SRC, "actions", "identity.ts"),
    DECISION_LOG,
  ];

  it("finds the sources it is checking", () => {
    expect(everySource.length).toBeGreaterThan(50);
  });

  it("builds no second `type:id` source template", () => {
    const offenders = everySource
      .filter((path) => !PERMITTED.includes(path))
      .filter((path) => /\.type\}:\$\{/.test(stripComments(path)));

    expect(offenders).toEqual([]);
  });

  it("implements the key and the comparison exactly once", () => {
    for (const name of ["contributionSourceKey", "isSameContributionSource"]) {
      const declarers = everySource.filter((path) =>
        new RegExp(`\\bfunction\\s+${name}\\b`).test(readFileSync(path, "utf8")),
      );

      expect(declarers).toHaveLength(1);
      expect(declarers[0]).toBe(join(SRC, "infrastructure", "contribution-source.ts"));
    }
  });

  it("keeps the actor key over ActorRef, so the exception is real", () => {
    /*
     * Guards the exception rather than only the rule. If actorKey ever starts
     * taking a ContributionSourceRef, the two questions have been merged and
     * this exception is hiding it.
     */
    const identity = readFileSync(join(SRC, "actions", "identity.ts"), "utf8");

    expect(/export function actorKey\(actor: ActorRef\)/.test(identity)).toBe(true);
  });
});


/*
 * Every registry guards its own door.
 *
 * The barrier is only worth anything if no catalog is outside it, and the
 * failure mode is silent: a new domain that forgets a structural validator
 * accepts malformed content, and the fault surfaces somewhere else entirely —
 * for Effects, as a throw from resolveRuleEffects()'s `never` guard, addressed
 * to whoever resolved a character rather than to whoever wrote the content.
 *
 * So the validator is a REQUIRED parameter of createRegistry, which makes a
 * forgotten one a compile error. What the type system cannot say is that the
 * function passed actually checks something, and `() => []` type-checks
 * perfectly. That is what these rules are for.
 */
describe("no catalog is outside the registration barrier", () => {
  const everySource = sourceFilesUnder(SRC).filter(
    (path) => !path.includes("__tests__"),
  );

  /*
   * The argument text of every createRegistry CALL in a file.
   *
   * Matched by scanning to the balanced closing paren rather than to the next
   * `);`, because an import list and a type annotation both contain the word
   * and a regex that stopped at the first `);` matched neither the call nor
   * anything useful.
   */
  function registryCalls(source: string): readonly string[] {
    const calls: string[] = [];

    for (const match of source.matchAll(/createRegistry\s*(?:<[^>]*>)?\s*\(/g)) {
      let depth = 0;
      let index = (match.index ?? 0) + match[0].length - 1;
      const start = index;

      while (index < source.length) {
        if (source[index] === "(") depth += 1;
        else if (source[index] === ")") {
          depth -= 1;

          if (depth === 0) break;
        }

        index += 1;
      }

      calls.push(source.slice(start + 1, index));
    }

    return calls;
  }

  const registryFiles = everySource
    /* registry.ts DECLARES createRegistry; it does not call one. */
    .filter((path) => !path.endsWith(join("infrastructure", "registry.ts")))
    /* And the decision log NAMES it, in prose stored as data. */
    .filter((path) => path !== DECISION_LOG)
    .filter((path) => registryCalls(readFileSync(path, "utf8")).length > 0);

  it("finds the registries it is checking", () => {
    /* Guards against the rules below passing because the walk found nothing. */
    expect(registryFiles.length).toBeGreaterThan(9);
  });

  it("passes a NAMED validator to every createRegistry call", () => {
    /*
     * An inline `() => []` is the shape this refuses. A domain with no rules
     * to check says so by passing `declaresNoRules`, which is searchable and
     * is a claim someone made on purpose — an anonymous empty function is
     * indistinguishable from an oversight.
     */
    const offenders = registryFiles.filter((path) =>
      registryCalls(readFileSync(path, "utf8"))
        .some((args) => /=>/.test(args)),
    );

    expect(offenders).toEqual([]);
  });

  it("names a validator this codebase actually declares", () => {
    /*
     * Every validator a registry is allowed to be handed, named rather than
     * pattern-matched. A twelfth domain arriving with a validator nobody has
     * reviewed fails here and has to be added deliberately.
     *
     * `declaresNoRules` is gone from this list. It was the honest way for
     * BodyParts, Reference Forms and Anatomical Points to say they carried no
     * Effects — and it was also a hole, because a BodyPart with a negative
     * Volume carries no rules and is still unresolvable. All three have real
     * shape validators now, and nothing is left that needs the escape hatch.
     */
    const PERMITTED = [
      "findContentStructuralIssues",
      "findItemStructuralIssues",
      "findSkillDefinitionStructuralIssues",
      "findTechniqueDefinitionStructuralIssues",
      "findConditionDefinitionStructuralIssues",
      "findInjuryDefinitionStructuralIssues",
      "findSpeciesDefinitionStructuralIssues",
      "findTraitDefinitionStructuralIssues",
      "findBodyPartDefinitionStructuralIssues",
      "findReferenceFormDefinitionStructuralIssues",
      "findAnatomicalPointDefinitionStructuralIssues",
    ];

    for (const path of registryFiles) {
      const source = readFileSync(path, "utf8");

      const calls = registryCalls(source);

      expect(calls.length).toBeGreaterThan(0);

      for (const args of calls) {
        /*
         * At least one, not exactly one: a domain composes its universal rule
         * walk with its own local structure through
         * composeStructuralValidators, so most calls name two.
         */
        const supplied = PERMITTED.filter((name) => args.includes(name));

        expect(supplied.length).toBeGreaterThan(0);
      }
    }
  });

  it("leaves no domain relying on declaresNoRules", () => {
    /*
     * The escape hatch still exists for a future domain that genuinely has no
     * local structure, and nothing uses it. If something does again, that is a
     * claim worth making on purpose rather than inheriting — so this fails and
     * the name has to be added back to PERMITTED above deliberately.
     */
    const users = registryFiles.filter((path) =>
      registryCalls(readFileSync(path, "utf8"))
        .some((args) => args.includes("declaresNoRules")),
    );

    expect(users).toEqual([]);
  });

  it("validates before it stores, so a refusal is atomic", () => {
    /*
     * Checked against the source text because the ORDER is the whole property
     * and no type expresses it. Re-registering an existing custom id is an
     * edit, so a write followed by a failing check would let a host correcting
     * a typo lose the entry it was correcting and be left with neither.
     */
    const source = readFileSync(
      join(SRC, "infrastructure", "registry.ts"),
      "utf8",
    );

    const check = source.indexOf("findRegistrationIssues(definition)");
    const write = source.indexOf("custom.set(definition.id, definition)");

    expect(check).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(check).toBeLessThan(write);
  });

  it("keeps existence checks OUT of the barrier", () => {
    /*
     * The half that must not move. Content refers forward — a Trait may grant
     * a Technique registered a moment later — so a registry that checked
     * whether a referenced id existed would make load order a rule nobody
     * authored, and a host loading its catalog alphabetically would see
     * failures another host would not.
     *
     * infrastructure/ imports nothing, so it cannot reach a catalog even by
     * accident; what is checked here is that the DOMAIN validator handed to it
     * does not either.
     */
    const source = readFileSync(
      join(SRC, "character", "rules", "definitions.ts"),
      "utf8",
    );

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(/isKnownDefinitionId|getDefinition|REGISTRIES|catalogs/.test(code))
      .toBe(false);
  });

  it("declares the rule-bearing field walk exactly once", () => {
    /*
     * It used to live in catalogs.ts, keyed by domain, with a comment saying
     * it was listed once on purpose "so a domain that gains a new rule-carrying
     * field cannot quietly escape reference checking". The barrier needed the
     * same knowledge and could not import catalogs.ts without closing a cycle,
     * so the walk moved down rather than being copied.
     */
    const declarers = everySource.filter((path) =>
      /\bfunction\s+collectRuleBundles\b/.test(readFileSync(path, "utf8")),
    );

    expect(declarers).toHaveLength(1);
    expect(
      declarers[0]!.endsWith(join("character", "rules", "definitions.ts")),
    ).toBe(true);

    /* And the old copy is gone rather than left beside it. */
    const catalogs = readFileSync(
      join(SRC, "character", "catalogs.ts"),
      "utf8",
    );

    expect(/\bfunction\s+rulesOf\b/.test(catalogs)).toBe(false);
  });

  it("keeps the `never` exhaustiveness guard in Effect resolution", () => {
    /*
     * The barrier exists so this guard is unreachable from host data, NOT so
     * it can be softened. It was added because ten Body effect variants were
     * once introduced and silently dropped, and turning it into a skip would
     * trade a loud developer error for exactly that silence again.
     */
    const source = readFileSync(
      join(SRC, "character", "rules", "resolution.ts"),
      "utf8",
    );

    expect(source).toContain("const unhandled: never = effect;");
    expect(source).toContain("Unhandled Effect type");
  });
});


/*
 * The rule validators assume nothing about their input.
 *
 * They take `unknown` and narrow through type predicates. The tempting
 * shortcut is one `as Effect` after a structural guard, and it is worse than
 * it looks: the assertion tells the compiler the value IS a valid Effect,
 * which is precisely the claim the function exists to test, so every field
 * read afterwards is well-typed and unfounded — and the day a new field is
 * read without a guard, nothing complains.
 */
describe("rule validation narrows rather than asserts", () => {
  const VALIDATION = join(SRC, "character", "rules", "validation.ts");

  it("asserts nothing INTO the rule vocabulary", () => {
    /*
     * Directional, on purpose.
     *
     * `x as Effect` is the dangerous one: it claims a value is valid content,
     * which is the claim this file exists to test, and every field read after
     * it is well-typed and unfounded. `xs as readonly unknown[]` is the
     * opposite — it keeps a narrowed `any[]` from leaking `any` into the walk
     * — and `LIST as readonly string[]` widens a const tuple so `.includes()`
     * accepts an arbitrary string. Banning those alongside the real hazard
     * would make the rule something to argue with rather than obey, which is
     * how a guard gets loosened in a hurry instead of carefully.
     */
    const code = readFileSync(VALIDATION, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    const VALIDATED_SHAPES =
      /\bas\s+(?:readonly\s+)?(?:Effect|Requirement|NamedRequirement|CheckScopeSelector)\b/g;

    expect([...code.matchAll(VALIDATED_SHAPES)].map((match) => match[0]))
      .toEqual([]);
  });

  it("would catch the assertion it is written to refuse", () => {
    /* Guards the guard: a pattern that matches nothing is not enforcement. */
    const VALIDATED_SHAPES =
      /\bas\s+(?:readonly\s+)?(?:Effect|Requirement|NamedRequirement|CheckScopeSelector)\b/;

    expect(VALIDATED_SHAPES.test("const effect = candidate as Effect;")).toBe(true);
    expect(VALIDATED_SHAPES.test("entry.requirement as Requirement,")).toBe(true);
    expect(VALIDATED_SHAPES.test("(effects as readonly unknown[]).entries()"))
      .toBe(false);
    expect(VALIDATED_SHAPES.test("(SENSE_IDS as readonly string[]).includes(v)"))
      .toBe(false);
  });

  it("names no validated shape it would only need for an assertion", () => {
    const source = readFileSync(VALIDATION, "utf8");

    for (const imported of ["type Effect", "type Requirement", "type NamedRequirement"]) {
      expect(source.includes(`import { ${imported}`)).toBe(false);
      expect(source.includes(`import ${imported}`)).toBe(false);
    }
  });
});


/*
 * A named requirement has exactly one structural definition.
 *
 * Three domains arrived at the same three fields independently. The Character
 * action adapter declared NamedRequirement; a Skill's application declared
 * ApplicationRequirement and carried a comment saying it agreed with the
 * adapter's shape ON PURPOSE and was copied because nothing under character/
 * may import the adapter; and Item equip requirements were about to need a
 * third. The comment was honest and the copy was still wrong — two structurally
 * identical declarations of one contract are two things that drift, and
 * TypeScript accepts assignment between them in both directions for exactly as
 * long as they happen to match.
 *
 * They agree now because there is one declaration and two aliases, which is
 * what this checks. Aliases are fine and are the point: `ApplicationRequirement`
 * reads better than `NamedRequirement` at a Skill call site. A second
 * `interface` body is not.
 */
describe("a named requirement is declared once", () => {
  const REQUIREMENTS = join("character", "rules", "requirements.ts");
  const RESOLUTION = join("character", "rules", "resolution.ts");

  const everySource = sourceFilesUnder(SRC).filter(
    (path) => !path.includes("__tests__"),
  );

  it("finds the sources it is checking", () => {
    expect(everySource.some((path) => path.endsWith(REQUIREMENTS))).toBe(true);
    expect(everySource.some((path) => path.endsWith(RESOLUTION))).toBe(true);
  });

  it("declares NamedRequirement only in the requirement vocabulary", () => {
    const declarers = everySource.filter((path) =>
      /\binterface\s+NamedRequirement\b|\btype\s+NamedRequirement\s*=/.test(
        readFileSync(path, "utf8"),
      ),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(REQUIREMENTS)).toBe(true);
  });

  it("declares its resolution only beside the evaluator", () => {
    const declarers = everySource.filter((path) =>
      /\binterface\s+NamedRequirementResolution\b|\btype\s+NamedRequirementResolution\s*=/
        .test(readFileSync(path, "utf8")),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(RESOLUTION)).toBe(true);
  });

  it("leaves the domain names as ALIASES rather than second bodies", () => {
    /*
     * `type X = NamedRequirement` is a readability alias and creates no second
     * declaration. `interface X { id; requirement; summary? }` is the copy this
     * rule exists to refuse, so the shape is what is checked — a domain type
     * whose body declares those fields itself.
     */
    const offenders = everySource
      /* The one that DECLARES it, which is what the rule is protecting. */
      .filter((path) => !path.endsWith(REQUIREMENTS))
      .filter((path) => {
        const source = readFileSync(path, "utf8");

        return /\binterface\s+\w*Requirement\b[^{]*\{[^}]*\breadonly\s+id\s*:[^}]*\breadonly\s+requirement\s*:/s
          .test(source);
      });

    expect(offenders).toEqual([]);
  });

  it("would actually catch a reintroduced copy", () => {
    /*
     * Guards the guard. A rule that passes because its pattern matches nothing
     * is worse than no rule, because it reads as enforcement.
     */
    const COPY = /\binterface\s+\w*Requirement\b[^{]*\{[^}]*\breadonly\s+id\s*:[^}]*\breadonly\s+requirement\s*:/s;

    expect(COPY.test(
      "export interface ApplicationRequirement {\n" +
      "  readonly id: string;\n" +
      "  readonly requirement: Requirement;\n}",
    )).toBe(true);

    /* An alias creates no second declaration and must stay legal. */
    expect(COPY.test("export type ApplicationRequirement = NamedRequirement;"))
      .toBe(false);
  });

  it("keeps one implementation of the resolution and the aggregate", () => {
    for (const name of ["resolveNamedRequirements", "namedRequirementDisposition"]) {
      const declarers = everySource.filter((path) =>
        new RegExp(`\\bfunction\\s+${name}\\b`).test(readFileSync(path, "utf8")),
      );

      expect(declarers).toHaveLength(1);
      expect(declarers[0]!.endsWith(RESOLUTION)).toBe(true);
    }
  });

  it("has the Skill layer delegate rather than reimplement the aggregate", () => {
    /*
     * Guards the delegation positively. applicationRequirementDisposition()
     * used to hold its own copy of the precedence rule, and a copy is how one
     * caller eventually decides an unresolved requirement should outrank an
     * unsatisfied one.
     */
    const source = readFileSync(
      join(SRC, "character", "capabilities", "application-resolution.ts"),
      "utf8",
    );

    expect(source).toContain("return namedRequirementDisposition(resolutions);");
    expect(source).toContain("return resolveNamedRequirements(requirements, context);");
  });
});


/*
 * The inventory state vocabulary, and the boolean it replaced.
 *
 * `equipped: boolean` answered one question with one bit. Held and worn are
 * different facts — a hand versus a body — and the difference is needed by
 * hands, body slots, Shū and weapon selection, none of which exist yet. While
 * the field was a boolean, each of those would have had to recover the
 * distinction from the Item definition separately, which is how four systems
 * end up disagreeing about what "equipped" means.
 *
 * Two things therefore have to stay true. The boolean must not come back, in
 * source OR in a fixture — a migrated engine with one surviving
 * `equipped: true` in a test is an engine with two inventory models. And the
 * question "is this equipped?" must keep going through isEquippedItemState(),
 * because an inline `state !== "carried"` is the same rule spelled a second
 * way, and it is the spelling that silently changes meaning the day a fourth
 * state is added: a stowed or sheathed object would become equipped by
 * default, which is exactly backwards.
 */
describe("equipment state is a vocabulary, not a boolean", () => {
  const STATE = join("character", "equipment", "state.ts");

  const everySource = sourceFilesUnder(SRC);

  const stripComments = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  it("finds the sources it is checking", () => {
    expect(everySource.some((path) => path.endsWith(STATE))).toBe(true);
  });

  it("has no surviving `equipped` boolean, in source or in a fixture", () => {
    /*
     * The requirement vocabulary's `state: "equipped"` and an Item's
     * `equippedEffects` are untouched and correct — a requirement asks about
     * equipment in general, and a definition's Effects apply while equipped
     * whichever way. What is retired is the FIELD.
     */
    const offenders = everySource
      .filter((path) => path !== DECISION_LOG)
      .filter((path) =>
        /\bequipped\s*:\s*(?:true|false|boolean)\b/.test(stripComments(path)),
      );

    expect(offenders).toEqual([]);
  });

  it("declares the state vocabulary exactly once, under equipment/", () => {
    const named = ["ITEM_EQUIPMENT_STATES", "ItemEquipmentState"] as const;

    for (const name of named) {
      const declarers = everySource
        .filter((path) => !path.includes("__tests__"))
        .filter((path) =>
          new RegExp(
            `\\bconst\\s+${name}\\b\\s*=|\\btype\\s+${name}\\s*=`,
          ).test(readFileSync(path, "utf8")),
        );

      expect(declarers).toHaveLength(1);
      expect(declarers[0]!.endsWith(STATE)).toBe(true);
    }
  });

  it("declares the inventory-mode vocabulary exactly once, beside the type", () => {
    /*
     * The other closed Item vocabulary, and the one that decides whether a
     * quantity above one is legal. It lives in types.ts rather than state.ts
     * because it is a property of the DEFINITION — whether copies of this Item
     * are distinct objects — not of how one owned entry is being engaged.
     */
    const TYPES = join("character", "equipment", "types.ts");

    for (const name of ["ITEM_INVENTORY_MODES", "ItemInventoryMode"]) {
      const declarers = everySource
        .filter((path) => !path.includes("__tests__"))
        .filter((path) =>
          new RegExp(
            `\\bconst\\s+${name}\\b\\s*=|\\btype\\s+${name}\\s*=`,
          ).test(readFileSync(path, "utf8")),
        );

      expect(declarers).toHaveLength(1);
      expect(declarers[0]!.endsWith(TYPES)).toBe(true);
    }

    const predicates = everySource.filter((path) =>
      /\bfunction\s+isStackableItem\b/.test(readFileSync(path, "utf8")),
    );

    expect(predicates).toHaveLength(1);
    expect(predicates[0]!.endsWith(TYPES)).toBe(true);
  });

  it("asks whether a state is equipped in one place", () => {
    const declarers = everySource.filter((path) =>
      /\bfunction\s+isEquippedItemState\b/.test(readFileSync(path, "utf8")),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(STATE)).toBe(true);
  });

  it("interprets no state by comparing it against a literal", () => {
    /*
     * INTERPRETATION, not use.
     *
     * `state !== "carried"`, `state === "held" || state === "worn"` and a
     * switch over the three are the ways the equipped question gets
     * re-derived, and each is a second copy of a rule isEquippedItemState()
     * already owns. Those are what this refuses.
     *
     * PRODUCING a state is not that, and an earlier version of this rule
     * banned every occurrence of the literals — which would have failed
     * `return { ...entry, state: "held" }`, the ordinary way an equip
     * transition is written. A guard stricter than its own stated intention
     * gets argued with rather than obeyed, and the first ticket to hit it
     * would have loosened it in a hurry rather than carefully.
     *
     * So the check is the comparison operators and `case`, in code with
     * comments stripped. A helper that needs to branch on the vocabulary
     * belongs in state.ts beside the values, where the switch can be
     * exhaustive over the declared list.
     */
    const INTERPRETS = new RegExp(
      [
        /* state === "held" */
        String.raw`(?:===|!==|==|!=)\s*"(?:carried|held|worn)"`,
        /* "held" === state */
        String.raw`"(?:carried|held|worn)"\s*(?:===|!==|==|!=)`,
        /* case "worn": */
        String.raw`\bcase\s+"(?:carried|held|worn)"\s*:`,
      ].join("|"),
    );

    const offenders = everySource
      .filter((path) => !path.includes("__tests__"))
      .filter((path) => !path.endsWith(STATE))
      .filter((path) => INTERPRETS.test(stripComments(path)));

    expect(offenders).toEqual([]);
  });

  it("permits constructing a state, which is what a transition does", () => {
    /*
     * Guards the narrowing above rather than only trusting it. If the rule
     * tightens back into a bare literal search, this fails here — in a test
     * that says why — instead of in Ticket 4.2's first equip function.
     */
    const INTERPRETS = new RegExp(
      String.raw`(?:===|!==|==|!=)\s*"(?:carried|held|worn)"|` +
      String.raw`"(?:carried|held|worn)"\s*(?:===|!==|==|!=)|` +
      String.raw`\bcase\s+"(?:carried|held|worn)"\s*:`,
    );

    expect(INTERPRETS.test('return { ...entry, state: "held" };')).toBe(false);
    expect(INTERPRETS.test('const state: ItemEquipmentState = "worn";')).toBe(false);
    expect(INTERPRETS.test('items.map((e) => ({ ...e, state: "carried" }))')).toBe(false);

    expect(INTERPRETS.test('if (entry.state !== "carried") return;')).toBe(true);
    expect(INTERPRETS.test('state === "held" || state === "worn"')).toBe(true);
    expect(INTERPRETS.test('switch (s) { case "worn": return 1; }')).toBe(true);
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

  /*
   * The adapter subtree, and the only exception to the rule below it.
   *
   * character/actions/ is the declared seam between a Character and a neutral
   * action: it evaluates Requirements and assembles check modifiers, and hands
   * the results across as neutral findings. It is ABOVE both layers by
   * definition, so it may import actions/ — that is what an adapter is.
   *
   * Two things keep that from becoming a hole. Neutral actions/ still may not
   * import character/ (checked separately, above). And nothing else under
   * character/ may import the adapter, because a Character file reaching for
   * it would pull the neutral vocabulary back down into the layer that is
   * supposed to sit underneath.
   */
  const ADAPTER = join(SRC, "character", "actions");

  /*
   * The second seam: a Skill's executable application contract.
   *
   * A Skill has to be able to say when it may be used, what it costs the
   * Action economy, what it may be pointed at, how far it reaches and how it is
   * decided — and every one of those already has exactly one neutral
   * definition. The only two ways to write that contract are to compose those
   * vocabularies or to declare Skill-shaped copies of them, and copies of a
   * closed vocabulary are the failure the sensory scopes had to be rescued
   * from: two structurally identical declarations that TypeScript accepts in
   * both directions forever.
   *
   * So these two files may import upward, exactly as the adapter may, and the
   * rule below permits them BY NAME rather than by pattern — a third capability
   * file reaching for actions/ fails here and has to argue for itself. The
   * anti-duplication suite further down is the other half: composing is
   * allowed, redeclaring is not.
   */
  const APPLICATION_SEAM = [
    join(SRC, "character", "capabilities", "applications.ts"),
    join(SRC, "character", "capabilities", "application-resolution.ts"),
  ];

  it("never lets Character reach up into spatial/, targeting/ or actions/", () => {
    const characterFiles = sourceFilesUnder(join(SRC, "character"))
      .filter((path) => !path.startsWith(ADAPTER + "/"))
      .filter((path) => !APPLICATION_SEAM.includes(path));

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

  it("finds the application seam it is excepting, so the exception is real", () => {
    /*
     * Guards against the exception outliving the files it was written for. If
     * applications.ts stops reaching for the neutral vocabulary, the exception
     * is dead and should be deleted rather than left standing for the next
     * file that finds it convenient.
     */
    const reaching = APPLICATION_SEAM.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesIntoDomain(path, specifier, "actions"),
      ),
    );

    expect(reaching).toEqual(APPLICATION_SEAM);
  });

  it("keeps the adapter the only Character file that may import actions/", () => {
    const adapterFiles = sourceFilesUnder(ADAPTER);

    expect(adapterFiles.length).toBeGreaterThan(0);

    /* Guards against the exception passing vacuously if the edge is removed. */
    const reaching = adapterFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesIntoDomain(path, specifier, "actions"),
      ),
    );

    expect(reaching.length).toBeGreaterThan(0);
  });

  it("never lets the rest of Character import the adapter", () => {
    const characterFiles = sourceFilesUnder(join(SRC, "character"))
      .filter((path) => !path.startsWith(ADAPTER + "/"));

    const offenders = characterFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) => {
        if (!specifier.startsWith(".")) return false;

        const resolved = join(path, "..", specifier);

        return resolved === ADAPTER || resolved.startsWith(ADAPTER + "/");
      }),
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


/*
 * GM authority lives in exactly one place.
 *
 * The design this rejects is an `override?` beside every field a GM might want
 * to change — on the check, on the requirement, on the Range test, on the Body
 * call. That fails three ways at once: every domain grows a second code path
 * that only runs when a person intervened and is therefore the least tested
 * code in the system; nothing can answer "what did the GM change" without
 * walking the whole object graph; and the private reasoning ends up scattered
 * across structures designed to be public.
 *
 * Checked against code with comments stripped, because the comments explaining
 * why adjudication is absent from these domains would otherwise fail a word
 * search for it.
 */
describe("GM adjudication is not scattered", () => {
  const DOMAINS = [
    join(SRC, "checks"),
    join(SRC, "spatial"),
    join(SRC, "targeting"),
    join(SRC, "runtime"),
    join(SRC, "gameplay"),
    join(SRC, "character"),
  ];

  function codeOf(path: string): string {
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("finds the sources it is checking", () => {
    expect(DOMAINS.flatMap((one) => sourceFilesUnder(one)).length)
      .toBeGreaterThan(100);
  });

  /*
   * The machinery a GM ruling is actually made of.
   *
   * Named individually rather than by grepping "adjudicat", because the word
   * does two different jobs. `adjudicateAction` and the override records are
   * the DECISION — who may overrule what, and what a player is shown — and a
   * second implementation of any of them is a second policy.
   *
   * "This is decided by a person" is not that. It is a property of the action,
   * it lives in the neutral ResolutionApproach vocabulary, and approach.ts's
   * own header says content selects it per action: a Skill whose outcome the
   * GM supplies has to be able to say so in its own definition. Banning the
   * substring banned the declaration along with the decision, which would have
   * left content unable to describe the one case a rules engine most needs
   * described.
   */
  const ADJUDICATION_MACHINERY =
    /\bgmOverride|\badjudicateAction\b|\bAdjudicationDecision\b|\bAdjudicationInput\b|\bAdjudicationOverrideRecord\b|\bAdjudicatedAction\b|\bAdjudicatedRoll\b|\bFindingOverride\b|\bOutcomeOverride\b|\bCostOverride\b|\bDiceOverride\b|\brevealsAtLeast\b|\bGmActionView\b/;

  it("names no GM override or adjudication machinery below actions/", () => {
    const offenders = DOMAINS
      .flatMap((directory) => sourceFilesUnder(directory))
      .filter((path) => ADJUDICATION_MACHINERY.test(codeOf(path)));

    expect(offenders).toEqual([]);
  });

  it("lets only the Skill application contract and its catalog NAME adjudication", () => {
    /*
     * The narrower rule, kept explicit so the loosening above cannot widen by
     * accident. Two files may say the word and no others: applications.ts,
     * which declares the vocabulary, and skills.ts, which is the authored
     * catalog USING it — a Skill whose resolution Combat has not designed yet
     * says so by resolving through a person, which is the honest contract and
     * the reason the vocabulary exists.
     *
     * A new file that names it fails here rather than quietly joining the
     * exception.
     */
    const namers = DOMAINS
      .flatMap((directory) => sourceFilesUnder(directory))
      .filter((path) => /adjudicat/i.test(codeOf(path)));

    expect(namers.sort()).toEqual([
      join(SRC, "character", "capabilities", "applications.ts"),
      join(SRC, "character", "capabilities", "skills.ts"),
    ].sort());
  });

  it("keeps the public/GM split inside the adjudication layer", () => {
    /*
     * Carrying the two views is fine; DECIDING what goes in them is not.
     *
     * Settlement holds both views and passes them through untouched, so it may
     * name the types. Authorization READS the GM view in order to narrow it
     * down to the handful of finalized facts a scheduler may see — narrowing
     * is the opposite of leaking, and a test asserts the result carries no
     * rolls, overrides, findings or consequences.
     *
     * What none of them may do — what nothing but adjudication may do — is
     * consult the reveal ladder, because that is the function that decides
     * what a player is shown, and a second caller of it would be a second
     * policy.
     */
    const actionFiles = sourceFilesUnder(join(SRC, "actions"));
    const relative = (path: string) =>
      path.slice(join(SRC, "actions").length + 1);

    const importers = actionFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        specifier.endsWith("./visibility")
      ),
    );

    expect(importers.map(relative).sort())
      .toEqual([
        "adjudication.ts",
        "authorization.ts",
        "index.ts",
        "settlement.ts",
      ]);

    const deciders = actionFiles.filter((path) =>
      /\brevealsAtLeast\b/.test(readFileSync(path, "utf8")),
    );

    expect(deciders.map(relative).sort())
      .toEqual(["adjudication.ts", "index.ts", "visibility.ts"]);
  });
});


/*
 * Combat wraps neutral actions; it does not own them.
 *
 * The edge gameplay/ -> actions/ is the point of the wrapper and is
 * expected. What must stay absent is the reverse, and the content catalogs:
 * a Combat that reaches into Skill or Item definitions has taken back the
 * ownership this phase spent five tickets moving out of it.
 */
describe("Combat schedules neutral actions without owning them", () => {
  const combatFiles = sourceFilesUnder(join(SRC, "gameplay"));

  it("finds the sources it is checking", () => {
    expect(combatFiles.length).toBeGreaterThan(5);
  });

  it("reaches actions/ from at least one place, so the edge is real", () => {
    const reaching = combatFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "actions"),
      ),
    );

    expect(reaching.length).toBeGreaterThan(0);
  });

  it("imports no Character content, catalogs or rules", () => {
    /*
     * Combat may consume a resolved Action capacity handed to it. What it
     * may not do is look a Skill up, evaluate a Requirement, or read a
     * catalog — each of which would make it a second authority on a question
     * some other domain already answers.
     */
    const offenders = combatFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "character"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps declared targets out of the Combat model entirely", () => {
    /*
     * `targetCombatantIds` was the Combat-level copy of who an Action points
     * at, and it was the source of Reaction truth. Both jobs moved: declared
     * targets live on the neutral intent, and Reactions read an explicit
     * threat list. A reappearance of the field would restore the competing
     * source this ticket removed.
     */
    const offenders = combatFiles.filter((path) =>
      /\btargetCombatantIds\b/.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the inert Bonus Action field out of the model", () => {
    const offenders = combatFiles.filter((path) =>
      /\bbonusAction\b|\bCombatBonusAction\b/.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("gives no caller a way to add an undeclared threat", () => {
    /*
     * `additionalThreatenedCombatantIds` let a caller name anybody as
     * endangered, which is an unauthored threat rule wearing a parameter. An
     * action that threatens subjects it did not declare needs a real rule,
     * and until one exists the escape hatch must not come back.
     */
    const everySource = sourceFilesUnder(SRC).filter(
      (path) => !path.includes("__tests__"),
    );

    const offenders = everySource.filter((path) =>
      /additionalThreatened/.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("never lets neutral actions/ import Combat", () => {
    const actionFiles = sourceFilesUnder(join(SRC, "actions"));

    const offenders = actionFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        resolvesInto(path, specifier, "gameplay"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps Combat out of GM-private views and settlement internals", () => {
    /*
     * Combat consumes a ScheduledActionAuthorization, which is narrow by
     * construction. Reaching past it for the adjudication or settlement
     * modules would hand a scheduler the private half of the split those
     * tickets built.
     */
    const forbidden = ["visibility", "adjudication", "settlement"];

    const offenders = combatFiles.filter((path) =>
      moduleSpecifiers(path).some((specifier) =>
        forbidden.some((module) => specifier.endsWith(`actions/${module}`)),
      ),
    );

    expect(offenders).toEqual([]);
  });
});


/*
 * Possession is not a rank, enforced rather than remembered.
 *
 * Optional Mastery only holds if nothing goes back to reading "has it" off a
 * rank comparison. That inference is easy to write, reads as harmless, and
 * silently deletes every capability that has no Mastery to compare — the
 * exact class the feature exists for. It was spelled `mastery > NO_MASTERY` in
 * three places before this ticket.
 *
 * Nen is deliberately outside the rule: its principles all carry real tracks,
 * NO_MASTERY genuinely means "not learned" there, and the ranks are its own
 * state rather than a capability record.
 */
describe("capability possession is never inferred from a Mastery rank", () => {
  /*
   * mastery.ts is exempt: it DECLARES NO_MASTERY, and its own
   * `value === NO_MASTERY` is the rank vocabulary saying what a legal value
   * is, not a capability claiming to be held.
   */
  const capabilityFiles = [
    ...sourceFilesUnder(join(SRC, "character", "capabilities")).filter(
      (path) => !path.endsWith(join("capabilities", "mastery.ts")),
    ),
    join(SRC, "character", "resolution.ts"),
    join(SRC, "character", "validation.ts"),
    join(SRC, "character", "rules", "resolution.ts"),
  ];

  it("finds the sources it is checking", () => {
    expect(capabilityFiles.length).toBeGreaterThan(5);

    for (const path of capabilityFiles) {
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
    }
  });

  it("compares no Mastery value against zero to decide possession", () => {
    /*
     * Comparisons in prose are what the comments explaining the rule are made
     * of, so only code is checked: a comparison operator with NO_MASTERY or a
     * bare 0 on one side of it.
     */
    const offenders = capabilityFiles.filter((path) => {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      return /(?:>|>=|<|<=|===|!==)\s*NO_MASTERY\b/.test(code) ||
        /\bNO_MASTERY\s*(?:>|>=|<|<=|===|!==)/.test(code) ||
        /\bmastery\s*(?:>|>=)\s*0\b/i.test(code);
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the three-way resolved Mastery reading in one place", () => {
    /*
     * trackMastery() decides what a stored rank means against a track. A
     * second `?? 1` on a stored Mastery elsewhere is that decision copied, and
     * a copy that does not know about trackless capabilities is how "no
     * Mastery" becomes Mastery I again.
     */
    const declarers = sourceFilesUnder(SRC)
      .filter((path) => !path.includes("__tests__"))
      .filter((path) =>
        /\bfunction\s+trackMastery\b/.test(readFileSync(path, "utf8")),
      );

    expect(declarers).toHaveLength(1);
    expect(
      declarers[0]!.endsWith(join("character", "capabilities", "mastery.ts")),
    ).toBe(true);
  });
});


/*
 * The capability lifecycle, and the one import that would break it.
 *
 * capabilities/lifecycle.ts is imported by identity/traits.ts as well as by
 * the Skill and Technique resolvers — that is what makes it SHARED, and what
 * makes "a grant mode means the same thing for a Trait as for a Skill" true by
 * construction rather than by two files agreeing.
 *
 * It also means a value import of any catalog from that file closes a cycle:
 *
 *   identity/traits.ts -> capabilities/lifecycle.ts -> identity/traits.ts
 *
 * TypeScript will not complain, because `import type` and value imports look
 * the same to a reader and the type graph resolves either way. What breaks is
 * module initialisation, at runtime, in whichever entry point happens to load
 * first. So the rule is checked against the source text, which is the only
 * place the difference is visible.
 */
describe("the capability lifecycle stays importable from below", () => {
  const LIFECYCLE = join(SRC, "character", "capabilities", "lifecycle.ts");

  it("finds the source it is checking", () => {
    expect(readFileSync(LIFECYCLE, "utf8").length).toBeGreaterThan(0);
  });

  it("value-imports no capability catalog", () => {
    /*
     * `import type { X } from "./skills"` is fine and is erased. An
     * `import { getSkillDefinition }` is the edge that would close the loop —
     * so what is checked is the FORM of each import statement, not whether the
     * module is named.
     */
    const source = readFileSync(LIFECYCLE, "utf8");

    const catalogs = [
      "../identity/traits",
      "./skills",
      "./techniques",
      "../catalogs",
    ];

    const offenders = [...source.matchAll(/^import\s+([\s\S]*?)from\s+"([^"]+)";/gm)]
      .filter(([, clause, specifier]) =>
        catalogs.includes(specifier!) && !clause!.trimStart().startsWith("type"),
      )
      .map(([, , specifier]) => specifier);

    expect(offenders).toEqual([]);
  });

  it("keeps the catalog-aware lookups in dependencies.ts, above the loop", () => {
    /*
     * Guards the exception rather than only the rule: the kind-agnostic
     * lookups have to live SOMEWHERE, and if they migrate back down into
     * lifecycle.ts the check above starts failing for a reason nobody
     * remembers. They belong in the module nothing below imports.
     */
    const dependencies = readFileSync(
      join(SRC, "character", "capabilities", "dependencies.ts"),
      "utf8",
    );

    expect(/export function capabilityRequirements\b/.test(dependencies)).toBe(true);
    expect(/export function capabilitySubsumes\b/.test(dependencies)).toBe(true);
  });
});


/*
 * One vocabulary for capability kinds and grant modes.
 *
 * The mode is a field on the three grant Effects, so effects.ts declares it and
 * everything else — including capabilities/lifecycle.ts, which re-exports the
 * lot — imports it. A second declaration would be two enumerations of one
 * closed set, and the failure mode is silent: a fourth mode added to one copy
 * type-checks against the other for exactly as long as they stay structurally
 * identical.
 */
describe("capability kinds and grant modes are declared once", () => {
  const EFFECTS = join("character", "rules", "effects.ts");

  const everySource = sourceFilesUnder(SRC).filter(
    (path) => !path.includes("__tests__"),
  );

  const CLOSED_LISTS = ["CAPABILITY_KINDS", "CAPABILITY_GRANT_MODES"] as const;

  const TYPES = [
    "CapabilityKind",
    "CapabilityRef",
    "CapabilityGrantMode",
  ] as const;

  it("finds the sources it is checking", () => {
    expect(everySource.some((path) => path.endsWith(EFFECTS))).toBe(true);
  });

  it.each(CLOSED_LISTS)("declares %s exactly once, in rules/effects.ts", (name) => {
    const declarers = everySource.filter((path) =>
      new RegExp(`\\bconst\\s+${name}\\b\\s*=`).test(readFileSync(path, "utf8")),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(EFFECTS)).toBe(true);
  });

  it.each(TYPES)("declares %s exactly once, in rules/effects.ts", (name) => {
    const declarers = everySource.filter((path) =>
      new RegExp(`\\binterface\\s+${name}\\b|\\btype\\s+${name}\\s*=`).test(
        readFileSync(path, "utf8"),
      ),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(EFFECTS)).toBe(true);
  });

  it("leaves the default in one function rather than at each reader", () => {
    /*
     * An omitted mode means granted-while-present. Applying that default at
     * every call site is how one reader eventually gets it wrong and treats an
     * absent mode as an unlock — so the default is applied once, at the
     * boundary where an Effect becomes a resolved grant, and the literal is
     * spelled out in exactly the two places that own it.
     */
    const declarers = everySource.filter((path) =>
      /\bDEFAULT_CAPABILITY_GRANT_MODE\s*:/.test(readFileSync(path, "utf8")),
    );

    expect(declarers).toHaveLength(1);
    expect(declarers[0]!.endsWith(EFFECTS)).toBe(true);
  });
});


/*
 * A Skill application COMPOSES the neutral vocabularies; it never copies them.
 *
 * The exception that lets character/capabilities/applications.ts import
 * upward is only safe while that is true. The failure it exists to prevent is
 * specific and has already happened once, to the sensory scopes: two
 * structurally identical declarations of a closed vocabulary, which TypeScript
 * accepts assignments between in both directions, so adding a member to one
 * and not the other compiles perfectly and disagrees at runtime.
 *
 * A Skill-shaped ActionTiming or TargetSpecification would be exactly that,
 * and it would be worse than the sensory case: the two copies would sit either
 * side of the seam that turns a Skill into a scheduled action, so the
 * disagreement would surface as a Combat scheduling something the Skill did
 * not permit.
 */
describe("capability code composes the neutral vocabularies", () => {
  const capabilityFiles = sourceFilesUnder(
    join(SRC, "character", "capabilities"),
  );

  /*
   * Every closed vocabulary the application contract reaches for, and the
   * domain that owns it. Adding a field to any of these is a change in one
   * file; adding a second declaration is what this suite refuses.
   */
  const NEUTRAL_VOCABULARY = [
    "ActionTiming",
    "ActionProfile",
    "ActionFocus",
    "ActionFocusKind",
    "StructuredActionCost",
    "ThreatDeclaration",
    "ResolutionApproach",
    "ActionOutputFact",
    "ActionConsequenceSuggestion",
    "TargetSpecification",
    "TargetCardinality",
    "TargetKind",
    "TargetRef",
    "DistanceInterval",
    "Distance",
    "SpatialTravel",
    "CheckScope",
    "FixedCheckTiePolicy",
    "OpposedCheckSide",
    "CheckRequest",
    "AuraCostRequest",
    "PhysicalExertionLoad",
  ];

  it("finds the sources it is checking", () => {
    expect(capabilityFiles.length).toBeGreaterThan(5);
  });

  it("declares no capability-local copy of a neutral vocabulary", () => {
    const offenders: string[] = [];

    for (const path of capabilityFiles) {
      const source = readFileSync(path, "utf8");

      for (const name of NEUTRAL_VOCABULARY) {
        /*
         * A DECLARATION, not a mention. Importing the type, extending it,
         * naming it in a field and writing about it in a comment are all the
         * composition this rule wants; `interface ActionTiming` and
         * `type ActionTiming =` are the two forms that create a second one.
         */
        const declares = new RegExp(
          `\\b(?:interface|enum)\\s+${name}\\b|\\btype\\s+${name}\\s*[=<]|\\bconst\\s+${name}S?\\s*=\\s*\\[`,
        );

        if (declares.test(source)) offenders.push(`${path}: ${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("reaches the neutral vocabularies from the seam and nowhere else", () => {
    /*
     * The composition half, asserted positively so the rule above cannot pass
     * because the imports quietly went away and were reimplemented locally.
     */
    const seam = join(SRC, "character", "capabilities", "applications.ts");

    const source = readFileSync(seam, "utf8");

    for (const domain of ["../../actions", "../../targeting", "../../spatial", "../../checks"]) {
      expect(source).toContain(`from "${domain}"`);
    }
  });

  it("keeps the minimal application scaffolding out of the engine's own answers", () => {
    /*
     * minimalSkillApplication() exists so an AUTHORING TOOL can hand a person a
     * real, editable contract when they create a Skill. It is not a fallback,
     * and the difference is the whole reason `application` became required: an
     * engine that supplied a contract when content declared none would be
     * deciding an Action cost, a target rule and an outcome nobody chose.
     *
     * So nothing that resolves, validates or authors content may call it. The
     * authored catalog writes every contract out in full; resolution refuses a
     * Skill that has none.
     */
    const withoutComments = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    const callers = sourceFilesUnder(join(SRC, "character"))
      .filter((path) =>
        !path.endsWith(join("capabilities", "applications.ts")),
      )
      /* Naming it in a comment explains the boundary; calling it crosses it. */
      .filter((path) => /\bminimalSkillApplication\b/.test(withoutComments(path)));

    expect(callers).toEqual([]);
  });

  it("keeps spatial/ a resolved, context-neutral domain", () => {
    /*
     * The addendum's other half. A Skill's Range genuinely depends on the body
     * throwing the punch, the action being parried, or the power declared —
     * and the cheap way to express that is a DistanceInterval that can hold
     * "ask somebody". That would make the spatial domain a place where a
     * distance is sometimes not a distance, and every consumer of one would
     * have to handle a case that has no metres in it.
     *
     * So the unresolved half lives entirely in the Skill layer and is gone
     * before an ActionProfile exists. spatial/ still models resolved metric
     * geometry and nothing else.
     */
    const stripComments = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    const spatialFiles = sourceFilesUnder(join(SRC, "spatial"));

    expect(spatialFiles.length).toBeGreaterThan(3);

    const offenders = spatialFiles.filter((path) =>
      /\bSkill|\bAura\b|\bReaction\b|\bBody\b|\bprofileId\b|context-derived/
        .test(stripComments(path)),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves DistanceInterval exactly three resolved fields", () => {
    /*
     * Named explicitly, because "do not add context to DistanceInterval" is
     * the rule most easily broken by one convenient optional field.
     */
    const source = readFileSync(join(SRC, "spatial", "distance.ts"), "utf8");

    const declaration = /export interface DistanceInterval \{([\s\S]*?)\n\}/
      .exec(source);

    expect(declaration).not.toBeNull();

    const fields = [
      ...(declaration?.[1] ?? "").matchAll(/readonly\s+(\w+)\s*[?:]/g),
    ].map((match) => match[1]);

    expect(fields).toEqual(["kind", "minimumMetres", "maximumMetres"]);
  });

  it("keeps the contextual value vocabulary out of the neutral domains", () => {
    const stripComments = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    /*
     * actions/ has its own `profileId` — an ActionProfileId, a different
     * concept that predates this — so the check names the Skill-layer types
     * rather than the word.
     */
    const neutral = [
      ...sourceFilesUnder(join(SRC, "actions")),
      ...sourceFilesUnder(join(SRC, "targeting")),
      ...sourceFilesUnder(join(SRC, "spatial")),
    ];

    const offenders = neutral.filter((path) =>
      /SkillApplicationValue|SkillApplicationContextValues|context-derived/
        .test(stripComments(path)),
    );

    expect(offenders).toEqual([]);
  });

  it("builds the profile identity in exactly one place", () => {
    /*
     * `skill:<id>` is the profile id AND the source id, and a second spelling
     * of it would produce two profile ids for one Skill — which a scheduler
     * matching an intent against a profile would reject as a mismatch nobody
     * could see in either file.
     */
    const everySource = [
      ...sourceFilesUnder(join(SRC, "character")),
      ...sourceFilesUnder(join(SRC, "actions")),
      ...sourceFilesUnder(join(SRC, "gameplay")),
    ];

    const builders = everySource.filter((path) =>
      /`skill:\$\{/.test(readFileSync(path, "utf8")),
    );

    expect(builders).toEqual([
      join(SRC, "character", "capabilities", "applications.ts"),
    ]);
  });
});


/*
 * A rule bundle holds each requirement list once.
 *
 * The walk used to carry a named gate twice: `requirements`, the bare trees
 * projected out of the named entries, and a second field beside it holding the
 * same entries in their named form. The projection had already dropped every
 * entry it could not read, so a malformed named list and an empty one looked
 * the same through it, and a nested fault was reported under two paths. One
 * discriminated field replaced the pair, and a second field coming back would
 * restore both problems without any type error to announce it.
 */
describe("a rule bundle holds its requirements once", () => {
  const DEFINITIONS = join(SRC, "character", "rules", "definitions.ts");
  const ITEM_TYPES = join(SRC, "character", "equipment", "types.ts");
  const ITEM_USE = join(SRC, "character", "equipment", "use.ts");

  const everySource = sourceFilesUnder(SRC)
    .filter((path) => !path.includes("__tests__"))
    /* The decision log records the field's history in prose stored as data. */
    .filter((path) => path !== DECISION_LOG);

  const codeOf = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  const PARALLEL = /\bnamedRequirements\b/;

  const DISCRIMINATED =
    /\binterface\s+RuleBundle\s*\{[^}]*\breadonly\s+requirements\s*:\s*RuleRequirementBundle\s*;/s;

  it("finds the sources it is checking", () => {
    expect(everySource).toContain(DEFINITIONS);
    expect(everySource).toContain(ITEM_TYPES);
    expect(everySource).toContain(ITEM_USE);
  });

  it("names no parallel named-requirement field anywhere", () => {
    expect(everySource.filter((path) => PARALLEL.test(codeOf(path))))
      .toEqual([]);
  });

  it("types a bundle's requirements as the discriminated union", () => {
    const source = codeOf(DEFINITIONS);

    expect(DISCRIMINATED.test(source)).toBe(true);
    expect(source).toMatch(/readonly\s+kind\s*:\s*"bare"\s*;/);
    expect(source).toMatch(/readonly\s+kind\s*:\s*"named"\s*;/);
  });

  it("would catch the parallel representation coming back", () => {
    /* Guards the guard: a pattern that matches nothing is not enforcement. */
    expect(PARALLEL.test("readonly namedRequirements?: unknown;")).toBe(true);
    expect(PARALLEL.test("readonly requirements: RuleRequirementBundle;"))
      .toBe(false);

    expect(DISCRIMINATED.test(
      "export interface RuleBundle {\n" +
      "  readonly where: string;\n" +
      "  readonly effects: unknown;\n" +
      "  readonly requirements: unknown;\n}",
    )).toBe(false);

    expect(DISCRIMINATED.test(
      "export interface RuleBundle {\n" +
      "  readonly where: string;\n" +
      "  readonly effects: unknown;\n" +
      "  readonly requirements: RuleRequirementBundle;\n}",
    )).toBe(true);
  });

  it("types both Item gates as the one shared named contract", () => {
    const source = codeOf(ITEM_TYPES);

    expect(source).toMatch(
      /readonly\s+equipRequirements\?\s*:\s*readonly\s+NamedRequirement\[\]\s*;/,
    );
    expect(source).toMatch(
      /readonly\s+useRequirements\?\s*:\s*readonly\s+NamedRequirement\[\]\s*;/,
    );

    /* No bare Requirement list survives on an Item, and no Item-local copy. */
    expect(/\breadonly\s+Requirement\[\]/.test(source)).toBe(false);
    expect(/\binterface\s+\w*UseRequirement\b/.test(source)).toBe(false);
  });

  it("has Item use delegate to the canonical resolvers", () => {
    /*
     * A use resolver with its own requirement aggregate or its own Effect
     * switch would be a second answer to questions the engine already answers
     * once, and the first rule change would split them.
     */
    const source = codeOf(ITEM_USE);

    expect(source).toContain("resolveNamedRequirements(");
    expect(source).toContain("namedRequirementDisposition(requirements)");
    expect(source).toContain("resolveRuleEffects([");
    expect(source).toContain("findItemUseDefinitionIssues(definition)");

    /*
     * The context gate, through the SHARED validator. A local "is it an
     * object" check is what let `requirementContext: {}` reach the evaluator
     * and throw.
     */
    expect(source).toContain("findRequirementContextIssues(");
  });

  it("has the equip transition gate its context through the shared boundary", () => {
    /*
     * The transition read the requirement context straight into the evaluator,
     * and `requirementContext: {}` threw for an Attribute-gated equip. It must
     * ask the one shared validator, before the gate reads the context — not a
     * local "is it an object" check, which is exactly the guard that let the
     * use resolver's version of this through.
     */
    const source = codeOf(join(SRC, "character", "equipment", "transitions.ts"));

    expect(source).toContain("findRequirementContextIssues(");
    expect(source).toContain("equipment.transition.input_invalid");
    expect(source.indexOf("findRequirementContextIssues("))
      .toBeLessThan(source.indexOf("resolveNamedRequirements("));
  });

  it("declares the requirement-context validator exactly once", () => {
    /* Both active Item operations share it; a second one is a second answer. */
    const declarers = everySource.filter((path) =>
      /\bfunction\s+findRequirementContextIssues\b/.test(readFileSync(path, "utf8")),
    );

    expect(declarers).toEqual([join(SRC, "character", "rules", "resolution.ts")]);
  });
});
