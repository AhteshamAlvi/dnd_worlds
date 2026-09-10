/*
 * Where a content definition keeps its rules, and whether they are well formed.
 *
 * Every domain hides Effects and Requirements in slightly different places. A
 * Trait has `effects`; a Skill has those plus a Mastery track whose ranks each
 * carry their own, plus an application with named execution requirements; a
 * Condition keys extra Effects off stages; an Injury keys them off treatment;
 * an Item has three timing-specific Effect lists and two Requirement lists.
 *
 * That knowledge used to live in exactly one place — catalogs.ts's `rulesOf`,
 * with a comment saying so, deliberately, "so a domain that gains a new
 * rule-carrying field cannot quietly escape reference checking". The
 * registration barrier needs the same knowledge and cannot have it from there:
 * catalogs.ts imports every registry, so a registry importing catalogs.ts
 * would close a module-initialisation cycle. So the walk moved DOWN to here,
 * below both, and catalogs.ts consumes it rather than owning it.
 *
 * It is structural rather than domain-keyed. `rulesOf` took a CatalogDomain
 * and switched on it for Items alone; every other domain was already
 * duck-typed. Dropping the parameter costs nothing — a definition either has
 * `possessedEffects` or it does not — and buys the one thing the barrier
 * needs, which is to run without knowing which catalog it is guarding.
 *
 * Nothing here decides whether a referenced id EXISTS. That check stays where
 * it was, after every catalog has loaded, because content legitimately refers
 * forward: a Clan may grant a Technique registered a moment later, and
 * refusing it at registration would make load order a rule nobody authored.
 */

import {
  findEffectsValidationIssues,
  findNamedRequirementsValidationIssues,
  findRuleValidationIssues,
  type RuleValidationIssue,
} from "./validation";


/**
 * The requirements one place declares, and which FORM they are written in.
 *
 * ONE field, discriminated, where there used to be two. A bundle carried
 * `requirements` — bare Requirement trees, for reference walking — and, for a
 * named gate, a second field beside it holding the same rules again in their
 * named form, for metadata checking. Two fields describing one list are two
 * things a caller can disagree about: the projection had already discarded
 * every entry it could not read, so a malformed named list and an empty one
 * looked identical through it, and nothing in the type said which field was
 * the truth.
 *
 * So the bundle holds the list exactly as authored and says what kind of list
 * it is. Structural validation checks it in that form — ids, summaries,
 * duplicates and nested trees for a named list — and a walk that wants only
 * the trees asks ruleBundleRequirementTrees(), the one place a named list is
 * projected.
 *
 * bare  — acquisition and Mastery requirements: asked once, addressed never.
 * named — gates a character attempts and is refused by name: a Skill's
 *         application requirements, an Item's equip and use requirements.
 *
 * `entries` is `unknown` for the reason `effects` is: host content may put
 * anything in the field, and the validators these feed take `unknown` so the
 * malformation is reported instead of dereferenced.
 */
export type RuleRequirementBundle =
  | {
      readonly kind: "bare";
      readonly entries: unknown;
    }
  | {
      readonly kind: "named";
      readonly entries: unknown;
    };


/** One place a definition keeps rules, and what is in it. */
export interface RuleBundle {
  readonly where: string;
  readonly effects: unknown;
  readonly requirements: RuleRequirementBundle;
}


const NO_REQUIREMENTS: RuleRequirementBundle = { kind: "bare", entries: [] };


function fieldOf(definition: Record<string, unknown>, key: string): unknown {
  return definition[key];
}


/*
 * ABSENT only. A `null` gate is a malformed list rather than an omitted one,
 * and defaulting it with `??` would hand the validator an empty list and call
 * the gate clean.
 */
function presentOr(value: unknown, fallback: unknown): unknown {
  return value === undefined ? fallback : value;
}


function entriesOf(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
  );
}


function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}


/**
 * Every rule-bearing field on one definition, whatever domain it came from.
 *
 * A field that is absent produces no bundle; a field that is present but
 * malformed produces one carrying the malformed value, so the validator can
 * say so rather than the walk silently skipping it.
 */
export function collectRuleBundles(
  definition: unknown,
): readonly RuleBundle[] {
  const content = recordOf(definition);

  if (content === undefined) return [];

  const bundles: RuleBundle[] = [];

  /*
   * Items keep three Effect lists apart because their TIMING differs, and
   * both of their gates are NAMED: equipping and using are attempts a
   * character makes on purpose and is refused by name.
   */
  const itemFields = [
    ["possessed", "possessedEffects", undefined],
    ["equipped", "equippedEffects", "equipRequirements"],
    ["used", "useEffects", "useRequirements"],
  ] as const;

  /*
   * Any rule-bearing Item field marks the definition as an Item, both gates
   * included. An Item declaring only a use gate would otherwise fall through
   * to the generic walk, which looks for `requirements` and walks nothing.
   */
  const isItem = itemFields.some(
    ([, effectField, requirementField]) =>
      fieldOf(content, effectField) !== undefined ||
      (requirementField !== undefined &&
        fieldOf(content, requirementField) !== undefined),
  );

  if (isItem) {
    for (const [where, effectField, requirementField] of itemFields) {
      bundles.push({
        where,
        effects: fieldOf(content, effectField) ?? [],
        requirements: requirementField === undefined
          ? NO_REQUIREMENTS
          : {
              kind: "named",
              entries: presentOr(fieldOf(content, requirementField), []),
            },
      });
    }

    return bundles;
  }

  bundles.push({
    where: "definition",
    effects: fieldOf(content, "effects") ?? [],
    requirements: { kind: "bare", entries: fieldOf(content, "requirements") ?? [] },
  });

  const application = recordOf(fieldOf(content, "application"));

  if (application !== undefined) {
    const applicationRequirements = fieldOf(application, "requirements");

    if (applicationRequirements !== undefined) {
      bundles.push({
        where: "application",
        effects: [],
        requirements: { kind: "named", entries: applicationRequirements },
      });
    }
  }

  const mastery = recordOf(fieldOf(content, "mastery"));

  for (const rank of entriesOf(mastery?.["ranks"])) {
    bundles.push({
      where: `rank ${String(rank["rank"])}`,
      effects: rank["effects"] ?? [],
      requirements: { kind: "bare", entries: rank["requirements"] ?? [] },
    });
  }

  for (const stage of entriesOf(fieldOf(content, "stages"))) {
    bundles.push({
      where: `stage ${String(stage["stage"])}`,
      effects: stage["effects"] ?? [],
      requirements: { kind: "bare", entries: stage["requirements"] ?? [] },
    });
  }

  const treatment = recordOf(fieldOf(content, "treatmentEffects"));

  if (treatment !== undefined) {
    for (const state of ["untreated", "treated"] as const) {
      if (treatment[state] === undefined) continue;

      bundles.push({
        where: `${state} injury`,
        effects: treatment[state],
        requirements: NO_REQUIREMENTS,
      });
    }
  }

  return bundles;
}


/**
 * The Requirement TREES in a bundle, whichever form they were written in.
 *
 * For a walk that inspects what a requirement asks about — catalog reference
 * checking — rather than how it is named. A bare list already is that; a named
 * list is projected to each entry's inner `requirement`.
 *
 * A COLLECTOR's projection, and safe only for a collector. Entries that are
 * not objects are skipped and a list that is not a list projects to nothing,
 * which would be exactly wrong for validation — it would turn
 * `useRequirements: {}` into an empty gate. findRuleBundleIssues() validates
 * the unprojected list, so that fault is refused there while this walk simply
 * finds no references in it.
 */
export function ruleBundleRequirementTrees(bundle: RuleBundle): unknown {
  const { requirements } = bundle;

  if (requirements.kind === "bare") return requirements.entries;

  return entriesOf(requirements.entries).map((entry) => entry["requirement"]);
}


/**
 * One structural fault in a bundle.
 *
 * `rule` is a malformed Effect or Requirement tree; `requirement` is a fault
 * in a named requirement's wrapper or in the tree it names.
 */
export interface RuleBundleIssue {
  readonly kind: "rule" | "requirement";
  readonly issue: RuleValidationIssue;
}


/**
 * Every structural fault in one bundle.
 *
 * Shared by the registration barrier and by catalog validation, which render
 * the same faults for different readers. It used to be two copies of one loop.
 *
 * A bare list is checked as Requirement trees. A named list is checked as a
 * NAMED list — the wrapper and, through it, every tree inside — and never as
 * its projection, so a nested fault is reported once, at the path the author
 * wrote, rather than once per representation.
 */
export function findRuleBundleIssues(
  bundle: RuleBundle,
): readonly RuleBundleIssue[] {
  const { requirements } = bundle;

  if (requirements.kind === "bare") {
    return findRuleValidationIssues(bundle.effects, requirements.entries).map(
      (issue): RuleBundleIssue => ({ kind: "rule", issue }),
    );
  }

  return [
    ...findEffectsValidationIssues(bundle.effects).map(
      (issue): RuleBundleIssue => ({ kind: "rule", issue }),
    ),
    ...findNamedRequirementsValidationIssues(
      requirements.entries,
      bundle.where,
    ).map((issue): RuleBundleIssue => ({ kind: "requirement", issue })),
  ];
}


/**
 * Every structural fault in a definition's rules, as readable strings.
 *
 * This is what a registry is handed, so a host offering malformed content gets
 * a refusal it can act on rather than an exception three layers later. It runs
 * over authored content too — findCatalogIssues() applies the same rules —
 * because nothing registers the engine's own catalog, which would otherwise be
 * the one body of content nobody checked.
 *
 * Strings rather than typed issues, because the consumer is a registration
 * refusal a person reads. The typed form is still available from
 * findRuleBundleIssues() for callers that need to switch on it.
 */
export function findContentStructuralIssues(
  definition: unknown,
): readonly string[] {
  const issues: string[] = [];

  for (const bundle of collectRuleBundles(definition)) {
    const where = bundle.where === "definition" ? "" : ` (${bundle.where})`;

    for (const { kind, issue } of findRuleBundleIssues(bundle)) {
      issues.push(
        `has a malformed ${kind}${where}: ${issue.type} at ${issue.path}.`,
      );
    }
  }

  return issues;
}
