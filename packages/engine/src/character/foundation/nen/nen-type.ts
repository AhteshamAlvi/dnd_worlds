/*
 * Nen Type — a character's natural affinity, and whether they know it.
 *
 * Nen Type answers one question: how well does this character express each of
 * the six categories, as a percentage? It does not know what an Ability is, how
 * much power Hatsu produced, or how an Ability divides that power between
 * categories. Those three meet later, in the Nen Ability subsystem:
 *
 *   funded Aura -> Hatsu effective power -> category allocation -> affinity
 *
 * so this file imports neither Hatsu nor anything under ./ability/, and Hatsu
 * imports nothing from here. Either one reaching into the other would let a
 * character's affinity quietly change how efficiently they convert Aura, or
 * their Hatsu rank change what category they are.
 *
 *
 * ONE STORED AFFINITY
 * -------------------
 *
 * The canonical value is `NenState.affinity` and nowhere else. It used to live
 * on `CharacterDetails`, then on the awakening state — and awakening is the
 * wrong owner for the same reason details was: an unawakened character already
 * has a type, awakening does not assign one, and an affinity is not a fact
 * about whether somebody's nodes are open. adoptLegacyNenType() below and the
 * migration boundary are the one-time adapters for records written before that
 * was true.
 *
 *
 * AFFINITY AND KNOWLEDGE ARE TWO FACTS
 * ------------------------------------
 *
 * A character HAS a Nen Type from birth. Whether anybody has established what
 * it is — a water divination, a teacher's judgement, a source that declares
 * it — is a separate question with a separate answer. `known: false` changes
 * what a sheet may DISCLOSE, never what the character can do: an undiscovered
 * Enhancer is still an Enhancer, and the profile resolves the same either way.
 *
 * `unassigned` is a third answer, about the RECORD rather than the person. An
 * NPC nobody has needed to type is legal and can use everything that does not
 * ask for a category percentage — the four basic principles, Hatsu conversion.
 * Anything that DOES ask is refused rather than handed a default, because a
 * default would be the engine deciding somebody's type.
 *
 *
 * TWO ADJACENCIES, DELIBERATELY NOT ONE
 * -------------------------------------
 *
 * The six categories sit on a hexagon. Two different questions are asked of
 * it, and they have different answers:
 *
 *   PERCENTAGE ADJACENCY   how affinity falls off with distance. For the five
 *                          ordinary Types Specialization is SKIPPED, so the
 *                          calculation ring is a pentagon on which Conjuration
 *                          and Manipulation are neighbours.
 *
 *   LEGAL LEAN DIRECTION   which way a character's affinity may lean. This
 *                          follows the FULL hexagon, on which Specialization
 *                          sits between Conjuration and Manipulation — so
 *                          neither may lean toward the other.
 *
 * They are separate constants with separate names. A refactor that "simplified"
 * lean eligibility into ring adjacency would silently legalise
 * Conjuration↔Manipulation, which is exactly the barrier the hexagon exists to
 * draw.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../infrastructure/diagnostics";
import type { EngineResult, NonEmptyArray } from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";

import type { NenState } from "./types";


/* ── Categories ─────────────────────────────────────────────────────────── */

/**
 * Every Nen Type, in hexagon order. Closed: the six categories are the whole
 * of the system.
 */
export const NEN_TYPES = [
  "enhancement",
  "transmutation",
  "conjuration",
  "specialization",
  "manipulation",
  "emission",
] as const;

/** One of the six Nen categories. */
export type NenType = typeof NEN_TYPES[number];

export function isNenType(value: unknown): value is NenType {
  return (
    typeof value === "string" && (NEN_TYPES as readonly string[]).includes(value)
  );
}


/* ── Adjacency ──────────────────────────────────────────────────────────── */

/*
 * PERCENTAGE ADJACENCY, for an ordinary primary.
 *
 * The hexagon with Specialization removed, read cyclically. Distance on this
 * ring is what an ordinary Type's profile falls off by, and it is what a lean
 * shifts along. It says NOTHING about which leans are legal: Conjuration and
 * Manipulation are neighbours here and may not lean toward each other.
 */
export const NEN_ORDINARY_AFFINITY_RING = [
  "enhancement",
  "transmutation",
  "conjuration",
  "manipulation",
  "emission",
] as const satisfies readonly NenType[];

/*
 * PERCENTAGE ADJACENCY, for a Specialist primary.
 *
 * The full hexagon. A Specialist's profile falls off by distance on it, and a
 * Specialist's lean shifts along it.
 */
export const NEN_SPECIALIST_AFFINITY_RING = NEN_TYPES;


/*
 * LEGAL LEAN DIRECTION.
 *
 * Written out rather than derived from either ring, because neither ring gives
 * the right answer: the ordinary ring would let Conjuration and Manipulation
 * lean toward each other, and the hexagon would let an ordinary Type lean
 * toward Specialization. This table is the rule.
 */
export const NEN_LEGAL_LEAN_TARGETS = {
  enhancement: ["transmutation", "emission"],
  transmutation: ["enhancement", "conjuration"],
  conjuration: ["transmutation"],
  specialization: ["conjuration", "manipulation"],
  manipulation: ["emission"],
  emission: ["enhancement", "manipulation"],
} as const satisfies Readonly<Record<NenType, readonly NenType[]>>;


/** The categories a primary Type may lean toward. */
export function nenLeanTargets(primary: NenType): readonly NenType[] {
  return NEN_LEGAL_LEAN_TARGETS[primary];
}


export function isLegalNenLean(primary: NenType, toward: NenType): boolean {
  return (nenLeanTargets(primary) as readonly NenType[]).includes(toward);
}


/* ── Affinity ───────────────────────────────────────────────────────────── */

/** The only lean strengths there are. There is no 0% lean; that is `null`. */
export const NEN_LEAN_PERCENTS = [25, 50] as const;

export type NenLeanPercent = typeof NEN_LEAN_PERCENTS[number];

export function isNenLeanPercent(value: unknown): value is NenLeanPercent {
  return (NEN_LEAN_PERCENTS as readonly unknown[]).includes(value);
}


export interface NenAffinityLean {
  readonly toward: NenType;
  readonly percent: NenLeanPercent;
}


/**
 * A character's complete affinity: their primary Type, and which way — if
 * any — it leans.
 */
export interface NenAffinity {
  readonly primary: NenType;
  readonly leaning: NenAffinityLean | null;
}


/** An affinity with no lean. */
export function pureNenAffinity(primary: NenType): NenAffinity {
  return { primary, leaning: null };
}


function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function developerError(
  code: string,
  message: string,
  required: string,
  actual: unknown,
): EngineError {
  return {
    code,
    message,
    audience: "developer",
    required,
    actual: describeDiagnosticValue(actual),
  };
}


/**
 * Everything wrong with a candidate affinity, or nothing.
 *
 * Refuses rather than normalizes. A lean of 30% is not "about 25%", and a lean
 * toward the character's own Type is not "no lean": each is a record saying
 * something the rules cannot mean, and rounding it into something they can
 * would be inventing the character's affinity.
 */
export function findNenAffinityIssues(
  value: unknown,
  path = "affinity",
): readonly EngineError[] {
  if (!isRecordObject(value)) {
    return [developerError(
      "nen.affinity.invalid",
      `${path} must be a record.`,
      "{ primary, leaning }",
      value,
    )];
  }

  const errors: EngineError[] = [];
  const primary = value["primary"];

  if (!isNenType(primary)) {
    errors.push(developerError(
      "nen.affinity.primary.invalid",
      `${path}.primary must be one of the six Nen Types.`,
      NEN_TYPES.join(" | "),
      primary,
    ));
  }

  /*
   * PRESENT, even when null. An absent `leaning` is a record that never said
   * whether the character leans, which is not the same as saying they do not.
   */
  if (!Object.prototype.hasOwnProperty.call(value, "leaning")) {
    errors.push(developerError(
      "nen.affinity.leaning.missing",
      `${path}.leaning must be recorded, as null when there is no lean.`,
      "{ toward, percent } | null",
      "absent",
    ));

    return errors;
  }

  const leaning = value["leaning"];

  if (leaning === null) return errors;

  if (!isRecordObject(leaning)) {
    errors.push(developerError(
      "nen.affinity.leaning.invalid",
      `${path}.leaning must be a record, or null.`,
      "{ toward, percent } | null",
      leaning,
    ));

    return errors;
  }

  const toward = leaning["toward"];
  const percent = leaning["percent"];

  if (!isNenType(toward)) {
    errors.push(developerError(
      "nen.affinity.leaning.toward.invalid",
      `${path}.leaning.toward must be one of the six Nen Types.`,
      NEN_TYPES.join(" | "),
      toward,
    ));
  } else if (isNenType(primary) && !isLegalNenLean(primary, toward)) {
    errors.push(developerError(
      "nen.affinity.leaning.direction.illegal",
      `${primary} cannot lean toward ${toward}.`,
      nenLeanTargets(primary).join(" | "),
      toward,
    ));
  }

  if (!isNenLeanPercent(percent)) {
    errors.push(developerError(
      "nen.affinity.leaning.percent.invalid",
      `${path}.leaning.percent must be 25 or 50.`,
      NEN_LEAN_PERCENTS.join(" | "),
      percent,
    ));
  }

  return errors;
}


export function isNenAffinity(value: unknown): value is NenAffinity {
  return findNenAffinityIssues(value).length === 0;
}


export function isSameNenAffinity(left: NenAffinity, right: NenAffinity): boolean {
  if (left.primary !== right.primary) return false;
  if (left.leaning === null || right.leaning === null) {
    return left.leaning === right.leaning;
  }

  return (
    left.leaning.toward === right.leaning.toward &&
    left.leaning.percent === right.leaning.percent
  );
}


/* ── Profiles ───────────────────────────────────────────────────────────── */

/*
 * The six pure profiles — every category's efficiency for an affinity with no
 * lean. Declared ONCE, here. Nothing else in the engine restates it.
 *
 * Ordinary rows: 100 for the primary, 80 for its two ring neighbours, 60 for
 * the other two, 0 Specialization; 380 in total. A non-Specialist never has
 * Specialization at all.
 *
 * The Specialist row: 100, 80 for Conjuration and Manipulation, 60 for
 * Transmutation and Emission, 40 for Enhancement across the hexagon; 420 in
 * total. Specialists reach every category and have more affinity to spend.
 */
export const NEN_PURE_AFFINITY_PROFILES = {
  enhancement: {
    enhancement: 100, transmutation: 80, conjuration: 60,
    specialization: 0, manipulation: 60, emission: 80,
  },
  transmutation: {
    enhancement: 80, transmutation: 100, conjuration: 80,
    specialization: 0, manipulation: 60, emission: 60,
  },
  conjuration: {
    enhancement: 60, transmutation: 80, conjuration: 100,
    specialization: 0, manipulation: 80, emission: 60,
  },
  specialization: {
    enhancement: 40, transmutation: 60, conjuration: 80,
    specialization: 100, manipulation: 80, emission: 60,
  },
  manipulation: {
    enhancement: 60, transmutation: 60, conjuration: 80,
    specialization: 0, manipulation: 100, emission: 80,
  },
  emission: {
    enhancement: 80, transmutation: 60, conjuration: 60,
    specialization: 0, manipulation: 80, emission: 100,
  },
} as const satisfies Readonly<Record<NenType, Readonly<Record<NenType, number>>>>;


/** How far a 25% or 50% lean moves each shifted category. */
export const NEN_LEAN_SHIFT = {
  25: 5,
  50: 10,
} as const satisfies Readonly<Record<NenLeanPercent, number>>;


export type NenAffinityTotal = 380 | 420;


export interface NenAffinityProfile {
  readonly affinity: NenAffinity;
  readonly efficiencies: Readonly<Record<NenType, number>>;
  readonly total: NenAffinityTotal;
}


export const NEN_AFFINITY_PROFILE_FORMULA =
  "pure profile; a lean moves the two categories toward it up and the two away from it down by 5 (25%) or 10 (50%)";


/*
 * The affinity ring a primary's profile is calculated on.
 *
 * NOT lean eligibility — see the header. This only says which way is "toward"
 * once a lean has already been judged legal.
 */
function calculationRingFor(primary: NenType): readonly NenType[] {
  return primary === "specialization"
    ? NEN_SPECIALIST_AFFINITY_RING
    : NEN_ORDINARY_AFFINITY_RING;
}


/*
 * The profile of an affinity already proved valid.
 *
 * A lean shifts FOUR categories: the first and second step toward it gain the
 * shift, the first and second step away from it lose it. The primary never
 * moves, and the total never changes — a lean redistributes affinity, it does
 * not create any. For a Specialist the category directly opposite on the
 * hexagon (Enhancement) is three steps away both ways and never moves.
 *
 * No rounding: every legal input produces whole numbers.
 */
function profileOf(affinity: NenAffinity): NenAffinityProfile {
  const efficiencies: Record<NenType, number> = {
    ...NEN_PURE_AFFINITY_PROFILES[affinity.primary],
  };

  if (affinity.leaning !== null) {
    const ring = calculationRingFor(affinity.primary);
    const size = ring.length;
    const origin = ring.indexOf(affinity.primary);
    const direction =
      ring[(origin + 1) % size] === affinity.leaning.toward ? 1 : -1;
    const shift = NEN_LEAN_SHIFT[affinity.leaning.percent];

    const at = (steps: number): NenType =>
      ring[(((origin + steps * direction) % size) + size) % size] as NenType;

    efficiencies[at(1)] += shift;
    efficiencies[at(2)] += shift;
    efficiencies[at(-1)] -= shift;
    efficiencies[at(-2)] -= shift;
  }

  return {
    affinity,
    efficiencies,
    total: affinity.primary === "specialization" ? 420 : 380,
  };
}


function refuse<T>(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<T> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


/**
 * Every category's efficiency for one affinity.
 *
 * Takes an AFFINITY — not a character, an Ability, a Hatsu result or a
 * category allocation. What a caller does with the percentages is theirs.
 */
export function resolveNenAffinityProfile(
  affinity: NenAffinity,
): EngineResult<NenAffinityProfile> {
  const root = createTraceNode({
    id: "nen.affinity.profile",
    label: "Resolve a Nen affinity profile",
    formula: NEN_AFFINITY_PROFILE_FORMULA,
    inputs: {
      affinity: { value: describeDiagnosticValue(affinity) },
    },
  });

  const issues = findNenAffinityIssues(affinity);

  if (issues.length > 0) return refuse(root, issues);

  const payload = profileOf(affinity);

  root.output = { ...payload.efficiencies, total: payload.total };

  return { success: true, payload, trace: { root }, warnings: [] };
}


export interface NenCategoryAffinity {
  readonly affinity: NenAffinity;
  readonly category: NenType;

  /** The category's efficiency, as a whole-number percentage. */
  readonly efficiency: number;
}


/** One category's efficiency for one affinity. */
export function resolveNenCategoryAffinity(
  affinity: NenAffinity,
  category: NenType,
): EngineResult<NenCategoryAffinity> {
  const root = createTraceNode({
    id: "nen.affinity.category",
    label: "Resolve one category's Nen affinity",
    formula: NEN_AFFINITY_PROFILE_FORMULA,
    inputs: {
      affinity: { value: describeDiagnosticValue(affinity) },
      category: { value: describeDiagnosticValue(category) },
    },
  });

  const issues: EngineError[] = [...findNenAffinityIssues(affinity)];

  if (!isNenType(category)) {
    issues.push(developerError(
      "nen.affinity.category.invalid",
      "An affinity lookup must name one of the six Nen Types.",
      NEN_TYPES.join(" | "),
      category,
    ));
  }

  if (issues.length > 0) return refuse(root, issues);

  const payload: NenCategoryAffinity = {
    affinity,
    category,
    efficiency: profileOf(affinity).efficiencies[category],
  };

  root.output = payload.efficiency;

  return { success: true, payload, trace: { root }, warnings: [] };
}


/* ── Knowledge ──────────────────────────────────────────────────────────── */

/*
 * What the character's affinity is, and whether it has been established.
 *
 *   assigned    the affinity is recorded. `known` says whether the character
 *               and their sheet may act on KNOWING it — it gates disclosure,
 *               not the affinity's mechanical effect.
 *
 *   unassigned  nobody has decided. A property of the RECORD, not of the
 *               character: an NPC who never needed a type. Legal, and refused
 *               by anything that needs a category percentage.
 */
export interface NenAssignedAffinity {
  readonly status: "assigned";
  readonly affinity: NenAffinity;
  readonly known: boolean;
}

export interface NenUnassignedAffinity {
  readonly status: "unassigned";
}

export type NenAffinityKnowledge = NenAssignedAffinity | NenUnassignedAffinity;


/*
 * The fields that belong to the ASSIGNED branch of the union — plus the
 * retired `type`, which is the assigned branch's old spelling.
 *
 * Present alongside `status: "unassigned"`, each one contradicts the
 * discriminant. Declared here so the state validator and the migration cannot
 * drift apart about what a readable affinity is.
 */
export const UNASSIGNED_CONFLICTING_FIELDS = ["affinity", "known", "type"] as const;


export function assignedNenAffinity(
  affinity: NenAffinity,
  known: boolean,
): NenAssignedAffinity {
  return { status: "assigned", affinity, known };
}


/** An assigned affinity nobody has discovered yet. */
export function unknownNenAffinity(affinity: NenAffinity): NenAssignedAffinity {
  return assignedNenAffinity(affinity, false);
}


/** A record that has not assigned an affinity. */
export function unassignedNenAffinity(): NenUnassignedAffinity {
  return { status: "unassigned" };
}


/** The affinity itself, or null when the record has never assigned one. */
export function nenAffinityOf(knowledge: NenAffinityKnowledge): NenAffinity | null {
  return knowledge.status === "assigned" ? knowledge.affinity : null;
}


export function isNenAffinityAssigned(
  knowledge: NenAffinityKnowledge,
): knowledge is NenAssignedAffinity {
  return knowledge.status === "assigned";
}


/** True only for an assigned affinity somebody has established. */
export function isNenAffinityKnown(knowledge: NenAffinityKnowledge): boolean {
  return knowledge.status === "assigned" && knowledge.known;
}


/**
 * Everything wrong with a stored affinity reading, or nothing.
 *
 * The union is ENFORCED: an unassigned reading carrying an affinity, a `known`
 * or the retired `type` contradicts its own discriminant, and an assigned one
 * still carrying `type` is the old writable alias surviving beside the new one.
 */
export function findNenAffinityKnowledgeIssues(
  value: unknown,
  path = "affinity",
): readonly EngineError[] {
  if (!isRecordObject(value)) {
    return [developerError(
      "nen.affinity.knowledge.invalid",
      `${path} must be a record.`,
      '{ status: "assigned", affinity, known } | { status: "unassigned" }',
      value,
    )];
  }

  const status = value["status"];

  if (status === "unassigned") {
    return UNASSIGNED_CONFLICTING_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(value, field))
      .map((field) => developerError(
        "nen.affinity.unassigned.conflict",
        `An unassigned ${path} cannot also carry "${field}".`,
        `no ${field} alongside status "unassigned"`,
        value[field],
      ));
  }

  if (status !== "assigned") {
    return [developerError(
      "nen.affinity.status.invalid",
      `${path} must be assigned or unassigned.`,
      "assigned | unassigned",
      status,
    )];
  }

  const errors: EngineError[] = [
    ...findNenAffinityIssues(value["affinity"], `${path}.affinity`),
  ];

  if (typeof value["known"] !== "boolean") {
    errors.push(developerError(
      "nen.affinity.known.invalid",
      `${path} must say whether the affinity is known.`,
      "boolean",
      value["known"],
    ));
  }

  if (Object.prototype.hasOwnProperty.call(value, "type")) {
    errors.push(developerError(
      "nen.affinity.retired-type",
      `${path} carries the retired "type" field beside its affinity.`,
      "no type field",
      value["type"],
    ));
  }

  return errors;
}


/* ── Character-facing lookups ───────────────────────────────────────────── */

/*
 * A category percentage asked of a CHARACTER.
 *
 * Refuses an unassigned record with one stable code rather than inventing a
 * type. Resolves an assigned-but-unknown affinity exactly as a known one:
 * whether anybody has divined it changes what may be disclosed, not what the
 * character's Aura does.
 */
function unassignedRefusal(root: TraceNode): EngineResult<never> {
  return refuse(root, [{
    code: "nen.affinity.unassigned",
    message:
      "This character's record has not assigned a Nen affinity, so no category percentage exists to look up.",
    audience: "developer",
    required: 'affinity status "assigned"',
    actual: "unassigned",
  }]);
}


export function resolveNenStateAffinityProfile(
  nen: NenState,
): EngineResult<NenAffinityProfile> {
  const root = createTraceNode({
    id: "nen.affinity.character-profile",
    label: "Resolve a character's Nen affinity profile",
    formula: NEN_AFFINITY_PROFILE_FORMULA,
    inputs: {
      status: { value: describeDiagnosticValue(nen?.affinity?.status) },
    },
  });

  const issues = findNenAffinityKnowledgeIssues(nen?.affinity);

  if (issues.length > 0) return refuse(root, issues);

  if (nen.affinity.status !== "assigned") return unassignedRefusal(root);

  const resolved = resolveNenAffinityProfile(nen.affinity.affinity);

  root.children.push(resolved.trace.root);

  if (!resolved.success) return refuse(root, resolved.errors);

  root.output = { total: resolved.payload.total, known: nen.affinity.known };

  return { ...resolved, trace: { root } };
}


export function resolveNenStateCategoryAffinity(
  nen: NenState,
  category: NenType,
): EngineResult<NenCategoryAffinity> {
  const root = createTraceNode({
    id: "nen.affinity.character-category",
    label: "Resolve one category of a character's Nen affinity",
    formula: NEN_AFFINITY_PROFILE_FORMULA,
    inputs: {
      status: { value: describeDiagnosticValue(nen?.affinity?.status) },
      category: { value: describeDiagnosticValue(category) },
    },
  });

  const issues = findNenAffinityKnowledgeIssues(nen?.affinity);

  if (issues.length > 0) return refuse(root, issues);

  if (nen.affinity.status !== "assigned") return unassignedRefusal(root);

  const resolved = resolveNenCategoryAffinity(nen.affinity.affinity, category);

  root.children.push(resolved.trace.root);

  if (!resolved.success) return refuse(root, resolved.errors);

  root.output = resolved.payload.efficiency;

  return { ...resolved, trace: { root } };
}


/* ── Recorded changes ───────────────────────────────────────────────────── */

/*
 * One recorded change of affinity — the WHOLE affinity, not just its primary.
 *
 * Only an exceptional source may produce one, and it says everything: what the
 * affinity was (null when the record had none), what it became, whether the
 * character knows the new one, and what caused it. The resulting state stores
 * exactly `next` and `known`; a change whose record and state disagreed would
 * be a history nobody could trust.
 *
 * Nothing is inferred. A source changing the primary supplies the new lean
 * too, and "no lean" is something it has to say.
 */
export interface NenAffinityChange {
  readonly previous: NenAffinity | null;
  readonly next: NenAffinity;
  readonly known: boolean;
  readonly cause: string;
}


/** The affinity reading a recorded change produces. */
export function affinityAfterChange(change: NenAffinityChange): NenAssignedAffinity {
  return assignedNenAffinity(change.next, change.known);
}


export function findNenAffinityChangeIssues(
  value: unknown,
  path: string,
): readonly EngineError[] {
  if (!isRecordObject(value)) {
    return [developerError(
      "nen.affinity.change.invalid",
      `${path} must be a record.`,
      "{ previous, next, known, cause }",
      value,
    )];
  }

  const errors: EngineError[] = [];

  if (value["previous"] !== null) {
    errors.push(...findNenAffinityIssues(value["previous"], `${path}.previous`));
  }

  errors.push(...findNenAffinityIssues(value["next"], `${path}.next`));

  if (typeof value["known"] !== "boolean") {
    errors.push(developerError(
      "nen.affinity.change.known.invalid",
      `${path} must record whether the new affinity is known.`,
      "boolean",
      value["known"],
    ));
  }

  if (typeof value["cause"] !== "string" || value["cause"].trim().length === 0) {
    errors.push(developerError(
      "nen.affinity.change.cause.invalid",
      `${path} must record what caused the change.`,
      "non-empty string",
      value["cause"],
    ));
  }

  return errors;
}


/* ── Legacy migration ───────────────────────────────────────────────────── */

/**
 * Fold a legacy `details.nenType` into the canonical Nen state.
 *
 * Three outcomes, and the third is the one that matters:
 *
 *   nothing recorded   the legacy field is absent. Nothing to do.
 *
 *   agreement          the legacy Type is the canonical PRIMARY. The canonical
 *                      affinity is kept whole — its lean and its `known` —
 *                      because the old field never carried either and agreeing
 *                      with it is no reason to forget them.
 *
 *   disagreement       REFUSED. Whichever value lost, somebody's character
 *                      would change affinity and nobody would be told.
 *
 * A legacy record adopted into an unassigned state migrates with NO lean and
 * `known: false`. The old field never said either, and inventing them would be
 * the migration deciding facts about the character.
 */
export function adoptLegacyNenType(
  nen: NenState,
  legacy: unknown,
): EngineResult<NenState> {
  const traceNode = createTraceNode({
    id: "nen.type.adopt-legacy",
    label: "Adopt a legacy Nen Type",
    formula: "canonical wins when they agree; a disagreement is refused",
    inputs: {
      legacy: { value: describeDiagnosticValue(legacy ?? "absent") },
      canonical: { value: describeDiagnosticValue(nen.affinity?.status) },
    },
  });

  if (legacy === undefined) {
    traceNode.output = { migrated: false, reason: "nothing recorded" };

    return { success: true, payload: nen, trace: { root: traceNode }, warnings: [] };
  }

  if (!isNenType(legacy)) {
    return refuse(traceNode, [{
      code: "nen.type.legacy.invalid",
      message: "A legacy Nen Type must be one of the six Nen Types.",
      audience: "developer",
      required: NEN_TYPES.join(" | "),
      actual: describeDiagnosticValue(legacy),
    }]);
  }

  const canonical = nen.affinity;

  if (canonical.status === "assigned") {
    if (canonical.affinity.primary !== legacy) {
      return refuse(traceNode, [{
        code: "nen.type.legacy.conflict",
        message:
          "A legacy Nen Type disagrees with the affinity recorded on Nen state.",
        audience: "developer",
        required: canonical.affinity.primary,
        actual: legacy,
      }]);
    }

    traceNode.output = { migrated: false, reason: "already canonical" };

    return { success: true, payload: nen, trace: { root: traceNode }, warnings: [] };
  }

  const migrated: NenState = {
    ...nen,
    affinity: unknownNenAffinity(pureNenAffinity(legacy)),
  };

  traceNode.output = { migrated: true, type: legacy };

  return {
    success: true,
    payload: migrated,
    trace: { root: traceNode },
    warnings: [],
  };
}
