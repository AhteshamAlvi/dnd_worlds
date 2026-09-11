/*
 * Requirement contexts that must be refused, one malformed field at a time.
 *
 * Shared by the context validator's own tests and by every resolver that
 * accepts a context from a caller, so "refused by the validator" and "refused
 * by the resolver" are checked against one table rather than two copies that
 * drift.
 *
 * Each case is built from a VALID context with exactly one field broken, so a
 * refusal is attributable to that field and not to a context that happened to
 * be wrong in several places at once. The path is the one the validator must
 * report, from its default root.
 */

import type { RequirementContext } from "../../character/rules/resolution";


export type HostileRequirementContext = readonly [
  label: string,
  path: string,
  context: unknown,
];


const ROOT = "requirementContext";

const ID_COLLECTIONS = [
  "speciesIds",
  "subspeciesIds",
  "clanIds",
  "traitIds",
  "skillIds",
  "techniqueIds",
  "conditionIds",
] as const;

const MASTERY_RECORDS = ["skillMastery", "techniqueMastery"] as const;


export function hostileRequirementContexts(
  valid: RequirementContext,
): readonly HostileRequirementContext[] {
  const withField = (field: string, value: unknown) => ({ ...valid, [field]: value });

  const without = (field: string) => {
    const copy: Record<string, unknown> = { ...valid };

    delete copy[field];

    return copy;
  };

  const withLayer = (layer: "stored" | "base" | "resolved", value: unknown) => ({
    ...valid,
    attributes: { ...valid.attributes, [layer]: value },
  });

  const withScore = (
    layer: "stored" | "base" | "resolved",
    key: string,
    value: unknown,
  ) => ({
    ...valid,
    attributes: {
      ...valid.attributes,
      [layer]: { ...valid.attributes[layer], [key]: value },
    },
  });

  return [
    /* The reported case. */
    ["an empty context", `${ROOT}.attributes`, {}],

    /* Attributes */
    ["no attributes", `${ROOT}.attributes`, without("attributes")],
    ["null attributes", `${ROOT}.attributes`, withField("attributes", null)],
    ["attributes that are a list", `${ROOT}.attributes`, withField("attributes", [])],
    ["no stored layer", `${ROOT}.attributes.stored`, withLayer("stored", undefined)],
    ["a null base layer", `${ROOT}.attributes.base`, withLayer("base", null)],
    ["a resolved layer that is a number", `${ROOT}.attributes.resolved`, withLayer("resolved", 42)],
    ["a base layer missing DEX", `${ROOT}.attributes.base.dex`, withScore("base", "dex", undefined)],
    ["a stored AGI that is not a number", `${ROOT}.attributes.stored.agi`, withScore("stored", "agi", Number.NaN)],
    ["a resolved CHA written as text", `${ROOT}.attributes.resolved.cha`, withScore("resolved", "cha", "10")],

    /* Level */
    ["no level", `${ROOT}.level`, without("level")],
    ["a level written as text", `${ROOT}.level`, withField("level", "1")],
    ["an infinite level", `${ROOT}.level`, withField("level", Number.POSITIVE_INFINITY)],
    ["a null level", `${ROOT}.level`, withField("level", null)],

    /* Optional id collections */
    ...ID_COLLECTIONS.flatMap((field): HostileRequirementContext[] => [
      [`${field} that are null`, `${ROOT}.${field}`, withField(field, null)],
      [`${field} that are one bare id`, `${ROOT}.${field}`, withField(field, "one-armed")],
      [`${field} that are an object`, `${ROOT}.${field}`, withField(field, {})],
      [`${field} holding a number`, `${ROOT}.${field}[0]`, withField(field, [42])],
      [`${field} holding null`, `${ROOT}.${field}[0]`, withField(field, [null])],
    ]),

    /* Mastery records */
    ...MASTERY_RECORDS.flatMap((field): HostileRequirementContext[] => [
      [`a null ${field}`, `${ROOT}.${field}`, withField(field, null)],
      [`a ${field} that is a list`, `${ROOT}.${field}`, withField(field, [3])],
      [`a ${field} that is a number`, `${ROOT}.${field}`, withField(field, 3)],
      [`a ${field} rank written as text`, `${ROOT}.${field}.swordsmanship`, withField(field, { swordsmanship: "3" })],
      [`a ${field} rank that is not a number`, `${ROOT}.${field}.swordsmanship`, withField(field, { swordsmanship: Number.NaN })],
    ]),

    /* Items */
    ["null items", `${ROOT}.items`, withField("items", null)],
    ["items that are a list", `${ROOT}.items`, withField("items", [])],
    ["items with no lists", `${ROOT}.items.possessed`, withField("items", {})],
    ["items with no equipped list", `${ROOT}.items.equipped`, withField("items", { possessed: [] })],
    ["a possessed list that is one id", `${ROOT}.items.possessed`, withField("items", { possessed: "gauntlets", equipped: [] })],
    ["an equipped list holding a number", `${ROOT}.items.equipped[0]`, withField("items", { possessed: [], equipped: [1] })],

    /* Incomplete */
    ["a null incomplete", `${ROOT}.incomplete`, withField("incomplete", null)],
    ["an incomplete that is one collection", `${ROOT}.incomplete`, withField("incomplete", "traits")],
    ["an incomplete that is an object", `${ROOT}.incomplete`, withField("incomplete", {})],
    ["an incomplete naming no collection", `${ROOT}.incomplete[1]`, withField("incomplete", ["traits", "inventory"])],
    ["an incomplete holding a number", `${ROOT}.incomplete[0]`, withField("incomplete", [42])],
  ];
}
