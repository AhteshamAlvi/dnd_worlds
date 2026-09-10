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
  findNamedRequirementsValidationIssues,
  findRuleValidationIssues,
} from "./validation";


/**
 * One place a definition keeps rules, and what is in it.
 *
 * `effects` and `requirements` are `unknown` rather than typed arrays, and
 * that is deliberate: this walk runs over host-registered content, so a field
 * that should hold a list may hold anything at all, and the validators these
 * feed take `unknown` precisely so the malformation is reported instead of
 * dereferenced.
 *
 * `namedRequirements` carries the same requirements in their named form when
 * the field has one, ALONGSIDE rather than instead of `requirements` — the two
 * are checked for different things. `requirements` is walked for catalog
 * references, and this is checked for the id and summary metadata that a bare
 * Requirement does not have.
 */
export interface RuleBundle {
  readonly where: string;
  readonly effects: unknown;
  readonly requirements: unknown;
  readonly namedRequirements?: unknown;
}


function fieldOf(definition: Record<string, unknown>, key: string): unknown {
  return definition[key];
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

  /* Items keep three Effect lists apart because their TIMING differs. */
  const itemFields = [
    ["possessed", "possessedEffects", undefined],
    ["equipped", "equippedEffects", "equipRequirements"],
    ["used", "useEffects", "useRequirements"],
  ] as const;

  const isItem = itemFields.some(
    ([, effectField]) => fieldOf(content, effectField) !== undefined,
  ) || fieldOf(content, "equipRequirements") !== undefined;

  if (isItem) {
    for (const [where, effectField, requirementField] of itemFields) {
      const requirements = requirementField === undefined
        ? []
        : fieldOf(content, requirementField) ?? [];

      /*
       * Only equip requirements are NAMED. Use requirements stay bare until
       * the shared Item application work gives them the same job — being
       * reported to a player and overridden by name — and claiming them here
       * would validate metadata nothing authors yet.
       */
      const named = requirementField === "equipRequirements"
        ? { namedRequirements: requirements }
        : {};

      bundles.push({
        where,
        effects: fieldOf(content, effectField) ?? [],
        requirements: requirementField === "equipRequirements"
          ? entriesOf(requirements).map((entry) => entry["requirement"])
          : requirements,
        ...named,
      });
    }

    return bundles;
  }

  bundles.push({
    where: "definition",
    effects: fieldOf(content, "effects") ?? [],
    requirements: fieldOf(content, "requirements") ?? [],
  });

  const application = recordOf(fieldOf(content, "application"));

  if (application !== undefined) {
    const applicationRequirements = fieldOf(application, "requirements");

    if (applicationRequirements !== undefined) {
      bundles.push({
        where: "application",
        effects: [],
        requirements: entriesOf(applicationRequirements).map(
          (entry) => entry["requirement"],
        ),
        namedRequirements: applicationRequirements,
      });
    }
  }

  const mastery = recordOf(fieldOf(content, "mastery"));

  for (const rank of entriesOf(mastery?.["ranks"])) {
    bundles.push({
      where: `rank ${String(rank["rank"])}`,
      effects: rank["effects"] ?? [],
      requirements: rank["requirements"] ?? [],
    });
  }

  for (const stage of entriesOf(fieldOf(content, "stages"))) {
    bundles.push({
      where: `stage ${String(stage["stage"])}`,
      effects: stage["effects"] ?? [],
      requirements: stage["requirements"] ?? [],
    });
  }

  const treatment = recordOf(fieldOf(content, "treatmentEffects"));

  if (treatment !== undefined) {
    for (const state of ["untreated", "treated"] as const) {
      if (treatment[state] === undefined) continue;

      bundles.push({
        where: `${state} injury`,
        effects: treatment[state],
        requirements: [],
      });
    }
  }

  return bundles;
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
 * rules/validation.ts for callers that need to switch on it.
 */
export function findContentStructuralIssues(
  definition: unknown,
): readonly string[] {
  const issues: string[] = [];

  for (const bundle of collectRuleBundles(definition)) {
    const where = bundle.where === "definition" ? "" : ` (${bundle.where})`;

    for (const issue of findRuleValidationIssues(
      bundle.effects,
      bundle.requirements,
    )) {
      issues.push(
        `has a malformed rule${where}: ${issue.type} at ${issue.path}.`,
      );
    }

    if (bundle.namedRequirements === undefined) continue;

    for (const issue of findNamedRequirementsValidationIssues(
      bundle.namedRequirements,
      bundle.where,
    )) {
      issues.push(
        `has a malformed requirement${where}: ${issue.type} at ${issue.path}.`,
      );
    }
  }

  return issues;
}
