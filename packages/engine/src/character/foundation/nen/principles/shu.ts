/*
 * Shū — the Nen principle of extending Aura into an Item.
 *
 * Shū pushes the practitioner's already-held Aura out along a physical contact
 * path and into an object, so that the object behaves as an extension of the
 * body: sturdier than it has any right to be, and carrying the user's Aura on
 * its striking surface.
 *
 * Shū is arithmetic on Aura the character is ALREADY holding. It opens nothing,
 * costs nothing and ends nothing:
 *
 *   Output after Shū = Output before Shū
 *
 * There is no Output access in this file, no commitment, no concentration, no
 * density selection, no leakage, no upkeep, no duration, no exertion clock and
 * no recovery suppression — not as fields, not as zero placeholders. Shū takes
 * a density that something else resolved and answers how much of the user's
 * quality reaches an Item and what that does to the Item. Every question about
 * paying for the Aura was already answered upstream.
 *
 *
 * TRANSMISSION FALLS OFF BY HALVES
 * --------------------------------
 *
 * Aura reaching an Item at the end of a chain has crossed every boundary in it,
 * and each Item-to-Item boundary halves what gets through:
 *
 *   Ti = 0.5^depth * product(kappa over every Item on the path, i INCLUDED)
 *
 * `depth` counts the Item-to-Item edges AFTER the body, so an Item held in the
 * hand is depth 0 and loses nothing to distance; an Item held by an Item at
 * depth 1 receives half; the next, a quarter. The conductivities multiply on
 * top of that, and the Item's own conductivity is one of the factors — a
 * superbly conductive blade at the end of a poor chain is still starved, and a
 * poor blade at the end of a perfect chain is still a poor blade.
 *
 * The path arrives ALREADY CHOSEN. This function walks nothing, searches
 * nothing and compares nothing: a caller hands it one simple path and it
 * multiplies. Which Items are in contact, which of the possible paths is the
 * real one, what an Item's conductivity is and which band it falls in all
 * belong to the equipment domain.
 *
 *
 * ENHANCEMENT IS HEADROOM ON TOP OF ONE
 * -------------------------------------
 *
 *   Hi = efficiency * Ti * (density / D0)
 *   Fi = 1 + Hi
 *
 * The factor is one plus the headroom, so an Item with no reachable Aura is
 * exactly itself rather than nothing, and the enhancement is an improvement on
 * an object rather than a replacement for it. Nothing here is rounded at any
 * stage — not the transmission, not the headroom, not the factor, not the
 * mitigation. Rounding is a display decision, and a factor rounded before it
 * divides a stress is a different object than the one the rules describe.
 *
 *
 * "ALL" AT MASTERY X IS STILL A LIST
 * ----------------------------------
 *
 * Mastery X has no numeric cap on how many Items may be selected, and the
 * profile says so with `maximumItems: null`.
 *
 * READ THAT NARROWLY. `null` means "no number", not "everything touching you".
 * A Shū X practitioner still makes a FINITE, EXPLICIT selection of compatible
 * Items that lie on a valid contact network from their body. It does not reach
 * their inventory, their pack, the coins in a pocket, the floor they stand on,
 * the wall they lean against, the dust in the air, or anything they brush past.
 * Every Item that benefits was chosen, is compatible, and is connected — the
 * only thing rank X removes is the ceiling on how long that list may be.
 *
 *
 * This file owns:
 *
 * - Shū's I-X Mastery profile: Item limits and enhancement efficiencies;
 * - the advancement Dexterity figures;
 * - the path transmission formula, for one already-chosen path;
 * - the enhancement headroom and factor, and the reference density;
 * - the integrity mitigation a factor buys.
 *
 * This file does NOT own:
 *
 * - Item identity, contact graphs, boundary modes, geometry or conductivity
 *   bands, which are the equipment domain's;
 * - path selection or graph search of any kind;
 * - which Items a character has actually selected, or whether they are legal;
 * - Aura, Output, funding, duration, upkeep or recovery, none of which Shū
 *   touches;
 * - surface Aura density, which arrives resolved and is never derived here.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import type { JsonValue } from "../../../../infrastructure/json";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../../infrastructure/trace";

import {
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
} from "../../../capabilities/mastery";

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface ShuMasteryProfile {
  readonly rank: MasteryRank;

  /**
   * The greatest number of Items that may be selected at once.
   * null at Mastery X: no numeric cap, still a finite explicit selection.
   */
  readonly maximumItems: number | null;

  /** The share of the user's surface quality that reaches a perfect path. */
  readonly enhancementEfficiency: number;
}

export const SHU_MASTERY_PROFILES = {
  1: { rank: 1, maximumItems: 1, enhancementEfficiency: 0.20 },
  2: { rank: 2, maximumItems: 1, enhancementEfficiency: 0.30 },
  3: { rank: 3, maximumItems: 2, enhancementEfficiency: 0.40 },
  4: { rank: 4, maximumItems: 2, enhancementEfficiency: 0.50 },
  5: { rank: 5, maximumItems: 3, enhancementEfficiency: 0.60 },
  6: { rank: 6, maximumItems: 4, enhancementEfficiency: 0.70 },
  7: { rank: 7, maximumItems: 5, enhancementEfficiency: 0.80 },
  8: { rank: 8, maximumItems: 7, enhancementEfficiency: 0.90 },
  9: { rank: 9, maximumItems: 10, enhancementEfficiency: 0.95 },
  10: { rank: 10, maximumItems: null, enhancementEfficiency: 1.00 },
} as const satisfies Readonly<Record<MasteryRank, ShuMasteryProfile>>;


/*
 * The Dexterity each Shū rank asks for.
 *
 * A progression requirement, not a property of a running Shū: nothing in the
 * arithmetic below reads it. Kept beside the profiles because both are parts of
 * one authored table, and separated from them because an attribute moving must
 * never change what an already-earned rank transmits.
 */
export const SHU_ADVANCEMENT_DEX = {
  1: 16, 2: 16, 3: 17, 4: 18, 5: 19,
  6: 20, 7: 21, 8: 22, 9: 24, 10: 26,
} as const satisfies Readonly<Record<MasteryRank, number>>;


export const SHU_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      SHU_MASTERY_PROFILES[rank].maximumItems === null
        ? "Extend Aura into any number of explicitly selected, connected, compatible Items, losing nothing to the user's own skill."
        : `Extend Aura into up to ${SHU_MASTERY_PROFILES[rank].maximumItems} selected Item(s), at ${Math.round(SHU_MASTERY_PROFILES[rank].enhancementEfficiency * 100)}% efficiency.`,
  })),
} satisfies MasteryTrack;


export function getShuMasteryProfile(mastery: MasteryRank): ShuMasteryProfile {
  return SHU_MASTERY_PROFILES[mastery];
}

/** The Item cap, or null at Mastery X where there is no numeric cap. */
export function deriveShuMaximumItems(mastery: MasteryRank): number | null {
  return SHU_MASTERY_PROFILES[mastery].maximumItems;
}

export function deriveShuEfficiency(mastery: MasteryRank): number {
  return SHU_MASTERY_PROFILES[mastery].enhancementEfficiency;
}

/**
 * Whether a selection of `itemCount` Items fits inside the rank's limit.
 *
 * A non-integer or negative count is not a selection at all and is false. Zero
 * is true: selecting nothing is inside every limit, including rank X's absent
 * one, and it is the caller's business whether an empty Shū is worth declaring.
 */
export function withinShuItemLimit(
  mastery: MasteryRank,
  itemCount: number,
): boolean {
  if (!Number.isInteger(itemCount) || itemCount < 0) return false;

  const maximumItems = deriveShuMaximumItems(mastery);

  return maximumItems === null || itemCount <= maximumItems;
}


/* -------------------------------------------------------------------------- */
/* Shared validation                                                          */
/* -------------------------------------------------------------------------- */

function describeNumber(value: unknown): JsonValue {
  return describeDiagnosticValue(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function refuse<T>(
  traceNode: TraceNode,
  errors: readonly EngineError[],
): EngineResult<T> {
  traceNode.output = false;

  return {
    success: false,
    trace: { root: traceNode },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


/* -------------------------------------------------------------------------- */
/* Path transmission                                                          */
/* -------------------------------------------------------------------------- */

/** How much a single Item-to-Item boundary lets through. */
export const SHU_BOUNDARY_TRANSMISSION = 0.5;

export interface ShuPathTransmissionInput {
  /**
   * Item-to-Item edges after the body. An Item held in the hand is 0; an Item
   * held by that Item is 1; and so on down the chain.
   */
  readonly itemDepth: number;

  /**
   * The conductivity of every Item on the chosen path, the destination Item
   * included. Order does not matter — they multiply.
   */
  readonly pathConductivities: readonly number[];
}

/**
 * How much of the user's surface quality reaches the Item at the end of one
 * already-chosen simple path.
 *
 *   Ti = 0.5^depth * product(kappa)
 *
 * Conductivities are not capped at 1 here. A material better than the reference
 * multiplies above it and a worse one below, and which values are plausible is
 * the equipment domain's table to police, not this formula's.
 */
export function deriveShuPathTransmission(
  input: ShuPathTransmissionInput,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "nen.shu.path-transmission",
    label: "Resolve Shū path transmission",
    formula: "transmission = 0.5^itemDepth * product(pathConductivities)",
    inputs: {
      itemDepth: { value: describeNumber(input?.itemDepth) },
      pathLength: {
        value: Array.isArray(input?.pathConductivities)
          ? input.pathConductivities.length
          : "malformed",
      },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.shu.transmission.malformed",
      message: "A Shū path transmission must be resolved from an input object.",
      audience: "developer",
      required: "ShuPathTransmissionInput",
      actual: describeNumber(input),
    }]);
  }

  const errors: EngineError[] = [];
  const { itemDepth, pathConductivities } = input;

  if (!Number.isInteger(itemDepth) || (itemDepth as number) < 0) {
    errors.push({
      code: "nen.shu.item_depth.invalid",
      message: "Shū path depth counts Item-to-Item boundaries and cannot be negative or fractional.",
      audience: "developer",
      required: "integer >= 0",
      actual: describeNumber(itemDepth),
    });
  }

  if (!Array.isArray(pathConductivities) || pathConductivities.length === 0) {
    errors.push({
      code: "nen.shu.path.empty",
      message:
        "A Shū path carries at least the destination Item's own conductivity.",
      audience: "developer",
      required: "at least one conductivity",
      actual: Array.isArray(pathConductivities) ? 0 : describeNumber(pathConductivities),
    });
  } else {
    for (const [index, conductivity] of pathConductivities.entries()) {
      if (!isFiniteNonNegative(conductivity) || conductivity === 0) {
        errors.push({
          code: "nen.shu.conductivity.invalid",
          message: "Every Item on a Shū path needs a finite, positive conductivity.",
          audience: "developer",
          required: "finite number > 0",
          actual: { index, conductivity: describeNumber(conductivity) },
        });
      }
    }
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  let transmission = SHU_BOUNDARY_TRANSMISSION ** itemDepth;

  for (const conductivity of pathConductivities) {
    transmission *= conductivity;
  }

  traceNode.output = { transmission };

  return {
    success: true,
    payload: transmission,
    trace: { root: traceNode },
    warnings: [],
  };
}


/* -------------------------------------------------------------------------- */
/* Enhancement                                                                */
/* -------------------------------------------------------------------------- */

/*
 * D0, the reference surface Aura density, in Aura per square metre.
 *
 * One. The density term is a RATIO against this, so a practitioner wearing the
 * reference density enhances at exactly their efficiency times their
 * transmission, and everyone else scales linearly either side of it. It is
 * written as a named constant rather than omitted because a bare `density` in
 * the formula would silently make the result depend on which unit the caller
 * measured area in.
 */
export const SHU_REFERENCE_DENSITY = 1;

export interface ShuEnhancementInput {
  /** The rank's enhancement efficiency. */
  readonly efficiency: number;

  /** Ti for this Item, from deriveShuPathTransmission. */
  readonly transmission: number;

  /** Resolved surface Aura density, in Aura per square metre. */
  readonly density: number;
}

export interface ShuEnhancement {
  /** Hi = efficiency * transmission * (density / D0). */
  readonly headroom: number;

  /** Fi = 1 + Hi. Always at least 1: Shū never makes an Item worse. */
  readonly factor: number;
}

/**
 * The enhancement one Item receives.
 *
 * Exact throughout. Nothing here is rounded, floored or snapped to a step, at
 * any stage, and callers that want a tidy number are the ones who should round
 * it — after every multiplication and division is done.
 */
export function deriveShuEnhancementFactor(
  input: ShuEnhancementInput,
): EngineResult<ShuEnhancement> {
  const traceNode = createTraceNode({
    id: "nen.shu.enhancement",
    label: "Resolve Shū enhancement factor",
    formula: "headroom = efficiency * transmission * (density / D0); factor = 1 + headroom",
    inputs: {
      efficiency: { value: describeNumber(input?.efficiency) },
      transmission: { value: describeNumber(input?.transmission) },
      density: { value: describeNumber(input?.density) },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.shu.enhancement.malformed",
      message: "A Shū enhancement must be resolved from an input object.",
      audience: "developer",
      required: "ShuEnhancementInput",
      actual: describeNumber(input),
    }]);
  }

  const errors = ([
    ["nen.shu.efficiency.invalid", "enhancement efficiency", input.efficiency],
    ["nen.shu.transmission.invalid", "path transmission", input.transmission],
    ["nen.shu.density.invalid", "surface Aura density", input.density],
  ] as const)
    .filter(([, , value]) => !isFiniteNonNegative(value))
    .map(([code, label, value]): EngineError => ({
      code,
      message: `Shū enhancement requires a finite non-negative ${label}.`,
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(value),
    }));

  if (errors.length > 0) return refuse(traceNode, errors);

  const headroom =
    input.efficiency * input.transmission * (input.density / SHU_REFERENCE_DENSITY);

  const payload: ShuEnhancement = { headroom, factor: 1 + headroom };

  traceNode.output = { ...payload };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


export interface ShuIntegrityMitigation {
  /** What the Item actually has to survive: incoming / factor. */
  readonly effectiveStress: number;

  /** What the enhancement absorbed: incoming - effectiveStress. */
  readonly mitigation: number;
}

/**
 * What an enhanced Item actually suffers from a stress it takes.
 *
 *   effectiveStress = incomingStress / factor
 *   mitigation      = incomingStress - effectiveStress
 *
 * Division rather than subtraction, so the enhancement is a multiplier on how
 * much the Item can take rather than a flat shield that a large enough blow
 * simply steps over. A factor of 1 — no reachable Aura — passes the stress
 * through untouched and mitigates nothing, which is the correct answer for an
 * ordinary object.
 */
export function deriveShuIntegrityMitigation(
  incomingStress: number,
  factor: number,
): EngineResult<ShuIntegrityMitigation> {
  const traceNode = createTraceNode({
    id: "nen.shu.integrity-mitigation",
    label: "Resolve Shū integrity mitigation",
    formula: "effectiveStress = incomingStress / factor",
    inputs: {
      incomingStress: { value: describeNumber(incomingStress) },
      factor: { value: describeNumber(factor) },
    },
  });

  const errors: EngineError[] = [];

  if (!isFiniteNonNegative(incomingStress)) {
    errors.push({
      code: "nen.shu.incoming_stress.invalid",
      message: "Shū integrity mitigation requires a finite non-negative incoming stress.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(incomingStress),
    });
  }

  if (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0) {
    errors.push({
      code: "nen.shu.factor.invalid",
      message: "Shū integrity mitigation requires a finite, positive enhancement factor.",
      audience: "developer",
      required: "finite number > 0",
      actual: describeNumber(factor),
    });
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  const effectiveStress = incomingStress / factor;

  const payload: ShuIntegrityMitigation = {
    effectiveStress,
    mitigation: incomingStress - effectiveStress,
  };

  traceNode.output = { ...payload };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/* -------------------------------------------------------------------------- */
/* The contact network                                                        */
/* -------------------------------------------------------------------------- */

/*
 * WHICH Items the coating actually reaches, and how strongly, as pure graph
 * arithmetic over opaque ids.
 *
 * Shū travels by contact. An Item the character is not touching — directly, or
 * through another Item they have also selected and coated — is not on the
 * boundary at all, whatever its physics say. So the network is rooted at the
 * body, every hop between Items costs a factor of one half, and every Item on
 * the path multiplies its own conductivity in:
 *
 *     Ti = 0.5^di * product(kappa_j for every Item j on the path, including i)
 *
 * where `di` counts ITEM-TO-ITEM edges: body -> sword is depth 0, body ->
 * gauntlet -> sword is depth 1.
 *
 *
 * THE STRONGEST SINGLE PATH, NEVER A SUM
 * --------------------------------------
 *
 * When several routes reach one Item, the answer is the best of them and not
 * their total. Adding them would make a sword held in two hands twice as
 * reinforced as one held in one, which is a different mechanic — and a
 * character in armour touching their own weapon at four points would approach
 * arbitrary reinforcement by standing still.
 *
 * And never around a loop. Every hop multiplies by at most `0.5 * 1.50`, the
 * decay times the highest conductivity any authored content may carry, so a
 * hop is always a strict loss and revisiting a node can never improve a path.
 * That is what makes the search below safe rather than merely guarded: the
 * cycle case is not special-cased, it is arithmetically dead.
 *
 * Nothing here knows what an Item is. `gameplay/nen` composes authoritative
 * equipment facts into these ids, conductivities and edges, and Shū's own
 * rules about what a valid selection looks like live above; what lives here is
 * the transmission arithmetic, which has exactly one owner.
 */

/** The root every valid contact path starts from. */
export const SHU_BODY_NODE = "body";

/** One authoritative contact, undirected. `body` is a legal endpoint. */
export interface ShuContactEdge {
  readonly from: string;
  readonly to: string;
}

export interface ShuNetworkInput {
  /** The Items the character selected, by opaque id. */
  readonly selection: readonly string[];

  /** Each selected Item's authored conductivity, by the same ids. */
  readonly conductivity: Readonly<Record<string, number>>;

  readonly edges: readonly ShuContactEdge[];
}

export interface ShuItemPath {
  readonly itemId: string;

  /** Item-to-Item edges after the body. Direct contact is 0. */
  readonly depth: number;

  /** The strongest route, from the first Item to this one. */
  readonly path: readonly string[];

  /** Ti, exact and unrounded. */
  readonly transmission: number;
}

export interface ShuNetwork {
  readonly items: readonly ShuItemPath[];
}

/**
 * Resolve every selected Item's strongest path from the body.
 *
 * Refuses a malformed selection, a duplicate, a missing or invalid
 * conductivity, and — the rule that matters — any selected Item with no valid
 * route to the body through OTHER SELECTED Items. An unselected intermediary
 * is not a shortcut: it is simply an edge this search cannot use, so the Item
 * beyond it is unreachable and the selection is refused rather than quietly
 * reduced.
 */
export function resolveShuNetwork(
  input: ShuNetworkInput,
): EngineResult<ShuNetwork> {
  const traceNode = createTraceNode({
    id: "nen.shu.network",
    label: "Resolve the Shū contact network",
    formula: "Ti = 0.5^depth * product(kappa on the strongest single path)",
    inputs: {
      selection: { value: describeNumber(input?.selection?.length) },
      edges: { value: describeNumber(input?.edges?.length) },
    },
  });

  if (
    input === null || typeof input !== "object" ||
    !Array.isArray(input.selection)
  ) {
    return refuse(traceNode, [{
      code: "nen.shu.network.malformed",
      message: "A Shū network must state the Items it selects.",
      audience: "developer",
      required: "ShuNetworkInput",
      actual: describeNumber(input),
    }]);
  }

  const errors: EngineError[] = [];
  const selected = new Set<string>();

  for (const itemId of input.selection) {
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      errors.push({
        code: "nen.shu.selection.invalid",
        message: "Every selected Shū Item must be a non-empty identity.",
        audience: "developer",
        required: "non-empty string",
        actual: describeNumber(itemId),
      });

      continue;
    }

    if (itemId === SHU_BODY_NODE) {
      errors.push({
        code: "nen.shu.selection.invalid",
        message: `"${SHU_BODY_NODE}" is the root of the network, not an Item.`,
        audience: "developer",
        required: "an Item identity",
        actual: itemId,
      });

      continue;
    }

    if (selected.has(itemId)) {
      errors.push({
        code: "nen.shu.selection.duplicate",
        message: `"${itemId}" is selected twice; one Item is one selection.`,
        audience: "developer",
        required: "distinct Item identities",
        actual: itemId,
      });

      continue;
    }

    const kappa = input.conductivity?.[itemId];

    if (typeof kappa !== "number" || !Number.isFinite(kappa) || kappa <= 0) {
      errors.push({
        code: "nen.shu.conductivity.invalid",
        message:
          `"${itemId}" has no usable conductivity, so nothing can say how ` +
          "much of the coating reaches through it.",
        audience: "developer",
        required: "finite number > 0",
        actual: describeNumber(kappa),
      });

      continue;
    }

    selected.add(itemId);
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  /*
   * Adjacency over the INDUCED graph: an edge is usable only when both ends
   * are the body or a selected Item.
   */
  const usable = (node: unknown): node is string =>
    node === SHU_BODY_NODE ||
    (typeof node === "string" && selected.has(node));

  const adjacency = new Map<string, string[]>([[SHU_BODY_NODE, []]]);

  for (const itemId of selected) adjacency.set(itemId, []);

  for (const edge of input.edges ?? []) {
    const from = edge?.from;
    const to = edge?.to;

    if (!usable(from) || !usable(to) || from === to) continue;

    adjacency.get(from)!.push(to);
    adjacency.get(to)!.push(from);
  }

  /*
   * Best-first over the PRODUCT, which is the max-product shortest path.
   *
   * Safe without a visited-path check because every hop multiplies by at most
   * SHU_BOUNDARY_TRANSMISSION times the highest authorable conductivity, which
   * is below one — so a longer route is always a weaker route and the frontier
   * cannot cycle. Ties are broken by id so two hosts holding the same contacts
   * in different orders resolve the same paths.
   */
  const best = new Map<string, ShuItemPath>();

  const frontier: { readonly node: string; readonly reached: ShuItemPath }[] = [{
    node: SHU_BODY_NODE,
    reached: { itemId: SHU_BODY_NODE, depth: -1, path: [], transmission: 1 },
  }];

  while (frontier.length > 0) {
    frontier.sort((left, right) => {
      const byStrength = right.reached.transmission - left.reached.transmission;

      return byStrength !== 0
        ? byStrength
        : left.reached.itemId.localeCompare(right.reached.itemId);
    });

    const { node, reached } = frontier.shift()!;

    for (const next of [...adjacency.get(node)!].sort()) {
      if (next === SHU_BODY_NODE) continue;

      /*
       * Depth counts ITEM-to-Item edges, so the first Item off the body is
       * depth 0 and pays no decay; every hop after it halves.
       */
      const depth = reached.depth + 1;
      const transmission = reached.transmission *
        (node === SHU_BODY_NODE ? 1 : SHU_BOUNDARY_TRANSMISSION) *
        input.conductivity[next]!;

      const known = best.get(next);

      if (known !== undefined && known.transmission >= transmission) continue;

      const candidate: ShuItemPath = {
        itemId: next,
        depth,
        path: [...reached.path, next],
        transmission,
      };

      best.set(next, candidate);
      frontier.push({ node: next, reached: candidate });
    }
  }

  const unreachable = [...selected].filter((itemId) => !best.has(itemId));

  if (unreachable.length > 0) {
    return refuse(traceNode, [{
      code: "nen.shu.contact.unreachable",
      message:
        "Every selected Item must touch the body, or touch another Item that " +
        "was also selected.",
      audience: "player",
      required: "a contact path to the body through selected Items",
      actual: unreachable.sort().join(", "),
      resolution:
        "Select the Items in between, or drop the ones that are not connected.",
    }]);
  }

  const items = [...selected]
    .sort()
    .map((itemId) => best.get(itemId)!);

  traceNode.output = {
    items: items.length,
    deepest: items.reduce((deepest, one) => Math.max(deepest, one.depth), 0),
  };

  return {
    success: true,
    payload: { items },
    trace: { root: traceNode },
    warnings: [],
  };
}
