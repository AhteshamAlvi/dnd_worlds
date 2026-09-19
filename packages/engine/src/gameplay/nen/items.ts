/*
 * Where Shū's Items become part of the coating, and what that does to them.
 *
 * Two different questions, answered in two different currencies, and keeping
 * them apart is the whole job of this file:
 *
 *   HOW MUCH AURA IS ON IT     geometry. An Item's area joins the boundary and
 *                              takes its equal-density share. Conductivity is
 *                              not consulted, at all: a lead pipe on the end
 *                              of a chain still occupies its full surface and
 *                              still dilutes everybody else's density.
 *
 *   WHAT THAT AURA ACCOMPLISHES   conductivity. How much of the coating the
 *                              Item can actually express is `Ti`, which falls
 *                              by half at every Item-to-Item hop and by the
 *                              conductivity of everything on the path.
 *
 * Collapsing the two is the single most tempting mistake here, and it is wrong
 * in a way that would look reasonable: multiplying the Aura PLACED on a poor
 * conductor by its conductivity would quietly hand the missing Aura back to
 * the rest of the boundary, so wrapping yourself in insulating junk would make
 * your fists sharper. The Aura goes there. It just does not do much.
 *
 *
 * THE ENHANCEMENT
 * ---------------
 *
 *     Hi = eta * Ti * (Di / D0)          D0 = 1 Aura per square metre
 *     Fi = 1 + Hi
 *
 * applied ONCE, to the Item's own envelope. An Item under Shū is not also
 * carrying a generic external coating force that something else adds in later:
 * this is the one application, and it covers the Item's attack, its defence,
 * its own Effects and its integrity together, because `shuInteraction` is a
 * whole-Item verdict and always has been.
 *
 *
 * WHAT STAYS OUT
 * --------------
 *
 * Equipment does not learn what Aura is — `enhanceItemEnvelope` takes a plain
 * number — and Nen does not learn what an integrity band is. The mitigation
 * figure is computed here, above both, and handed into the seam equipment
 * already had.
 *
 * Nothing Skill-, Technique-, Trait-, character- or environment-owned is
 * touched. The envelope is Item-owned by construction and says so; a bonus
 * that merely happened to be involved in the same strike is not the Item's.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";

import {
  enhanceItemEnvelope,
  itemIntegrityMitigationFor,
  resolveItemSurfaceArea,
  type ItemBoundaryPhysics,
  type ResolvedItemEnvelope,
} from "../../character/equipment";
import {
  deriveShuEfficiency,
  resolveShuNetwork,
  SHU_BODY_NODE,
  type ShuContactEdge,
  type ShuItemPath,
} from "../../character/foundation/nen/principles/shu";
import type { MasteryRank } from "../../character/capabilities/mastery";

import { GYO_ITEM_SITE_PREFIX } from "../../character/foundation/nen/principles/gyo";

import type { CoatingItem, ResolvedCoatingBoundary } from "./coating";


/** One selected Item, with everything authoritative about it already resolved. */
export interface ShuSelectedItem {
  readonly entryId: string;

  /** Resolved from the entry's own definition, never from an argument. */
  readonly envelope: ResolvedItemEnvelope;

  /** Whether this entry is a single concrete Item rather than a stack. */
  readonly quantity: number;
}


export interface ShuCompositionRequest {
  /** The character's effective Shū rank. */
  readonly mastery: MasteryRank;

  readonly items: readonly ShuSelectedItem[];

  /** Authoritative current contact. `body` is a legal endpoint. */
  readonly contactEdges: readonly ShuContactEdge[];
}


/** An Item that is on the boundary, with its path and its physics resolved. */
export interface ShuBoundaryItem {
  readonly entryId: string;
  readonly physics: ItemBoundaryPhysics;
  readonly path: ShuItemPath;

  /**
   * The Item as equipment resolved it, carried rather than re-resolved.
   *
   * The enhancement below scales THIS envelope. Looking it up again would be a
   * second resolution of one Item, free to see a different definition than the
   * one the physics and the path were taken from.
   */
  readonly envelope: ResolvedItemEnvelope;

  /** What the boundary needs: mode, area or covered identities, depth. */
  readonly coating: CoatingItem;
}


export interface ResolvedShuComposition {
  readonly items: readonly ShuBoundaryItem[];

  /** What the coating resolver needs, in its own vocabulary. */
  readonly coatingItems: readonly CoatingItem[];
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


/*
 * Everything that disqualifies one selected Item, reported together.
 *
 * Every one of these is a STRUCTURAL failure rather than a default. An Item
 * with no measure is not an Item of unknown size that we can estimate — it is
 * content nobody has finished authoring, and a number invented here would be
 * quoted by every density downstream as though it had been measured.
 */
function findItemIssues(item: ShuSelectedItem): readonly EngineError[] {
  const at = `"${String(item?.entryId)}"`;

  if (item === null || typeof item !== "object" || item.envelope === undefined) {
    return [{
      code: "nen.shu.item.malformed",
      message: "A selected Shū Item must carry its resolved envelope.",
      audience: "developer",
      required: "ShuSelectedItem",
      actual: describeDiagnosticValue(item),
    }];
  }

  const errors: EngineError[] = [];

  if (item.envelope.shuInteraction !== "compatible") {
    errors.push({
      code: "nen.shu.item.incompatible",
      message: `${at} is an Item a coating cannot be extended onto.`,
      audience: "player",
      required: "compatible",
      actual: item.envelope.shuInteraction,
    });
  }

  /*
   * ONE Item, not a stack. Five arrows in one entry share one integrity
   * figure and one identity, and a coating that spread onto "the arrows"
   * could not say which of them the transmission ran through.
   */
  if (item.quantity !== 1) {
    errors.push({
      code: "nen.shu.item.not_concrete",
      message:
        `${at} is a stack rather than one concrete Item, so nothing can say ` +
        "which of them is in contact.",
      audience: "player",
      required: "quantity === 1",
      actual: describeDiagnosticValue(item.quantity),
    });
  }

  const physics = item.envelope.boundaryPhysics;

  if (physics === undefined) {
    errors.push({
      code: "nen.shu.item.physics.missing",
      message:
        `${at} is Shū-compatible but has no authored boundary physics, and ` +
        "none is ever inferred from its name, mass, price or family.",
      audience: "developer",
      required: "an authored ItemBoundaryPhysics",
      actual: "absent",
    });

    return errors;
  }

  if (physics.mode === "extension") {
    const area = resolveItemSurfaceArea(physics.surface);

    if (area === null || !Number.isFinite(area) || area <= 0) {
      errors.push({
        code: "nen.shu.item.physics.missing",
        message:
          `${at} extends the boundary but its measure resolves to no usable ` +
          "surface area.",
        audience: "developer",
        required: "finite number > 0",
        actual: describeDiagnosticValue(area),
      });
    }
  } else if (physics.surface.kind !== "covers-body") {
    errors.push({
      code: "nen.shu.item.physics.missing",
      message:
        `${at} covers the body, so its area must be the identities it covers.`,
      audience: "developer",
      required: "covers-body",
      actual: physics.surface.kind,
    });
  }

  return errors;
}


/**
 * Resolve the selected Items into boundary sites and transmission paths.
 *
 * Validates every Item's physics, then hands the ids, conductivities and
 * contacts to the pure network resolver — which owns the strongest-path rule
 * and the `0.5^depth` decay, and is the only thing that does.
 */
export function resolveShuComposition(
  request: ShuCompositionRequest,
): EngineResult<ResolvedShuComposition> {
  const root = createTraceNode({
    id: "nen.shu.composition",
    label: "Resolve Shū Items onto the coating boundary",
    inputs: {
      mastery: { value: describeDiagnosticValue(request?.mastery) },
      items: { value: describeDiagnosticValue(request?.items?.length) },
    },
  });

  if (
    request === null || typeof request !== "object" ||
    !Array.isArray(request.items)
  ) {
    return refuse(root, [{
      code: "nen.shu.composition.malformed",
      message: "A Shū composition needs the Items it is composing.",
      audience: "developer",
      required: "ShuCompositionRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const itemIssues = request.items.flatMap(findItemIssues);

  if (itemIssues.length > 0) return refuse(root, itemIssues);

  const network = resolveShuNetwork({
    selection: request.items.map((one) => one.entryId),
    conductivity: Object.fromEntries(
      request.items.map((
        one,
      ) => [one.entryId, one.envelope.boundaryPhysics!.conductivity]),
    ),
    edges: request.contactEdges,
  });

  root.children.push(network.trace.root);

  if (!network.success) return refuse(root, network.errors);

  const pathById = new Map(
    network.payload.items.map((one) => [one.itemId, one]),
  );

  const items: ShuBoundaryItem[] = request.items.map((item) => {
    const physics = item.envelope.boundaryPhysics!;
    const path = pathById.get(item.entryId)!;

    return {
      entryId: item.entryId,
      physics,
      path,
      envelope: item.envelope,
      coating: {
        entryId: item.entryId,
        mode: physics.mode,
        depth: path.depth,
        ...(physics.mode === "extension"
          ? {
            surfaceAreaSquareMetres: resolveItemSurfaceArea(physics.surface)!,
          }
          : {
            coveredContinuityKeys:
              physics.surface.kind === "covers-body"
                ? physics.surface.continuityKeys
                : [],
          }),
      },
    };
  });

  root.output = { items: items.length };

  return {
    success: true,
    payload: { items, coatingItems: items.map((one) => one.coating) },
    trace: { root },
    warnings: [],
  };
}


/* ── Enhancement ────────────────────────────────────────────────────────── */

export interface ShuItemEnhancement {
  readonly entryId: string;

  /** Di: the Aura density actually resolved onto this Item. */
  readonly density: number;

  /** Ti: what the contact path transmits. */
  readonly transmission: number;

  /** eta: the rank's efficiency. */
  readonly efficiency: number;

  /** Hi, unrounded. */
  readonly headroom: number;

  /** Fi = 1 + Hi, unrounded. */
  readonly factor: number;

  readonly envelope: ResolvedItemEnvelope;
}


/**
 * Enhance every Item on the boundary, once.
 *
 * `Di` is read from the RESOLVED boundary rather than recomputed, so the
 * density that an Item's enhancement is derived from is the same number the
 * placement produced. Nothing is rounded at any stage — not `Hi`, not `Fi`,
 * and not the scaled values inside the envelope.
 */
export function enhanceShuItems(
  boundary: ResolvedCoatingBoundary,
  composition: ResolvedShuComposition,
  mastery: MasteryRank,
  source: ContributionSourceRef,
): EngineResult<readonly ShuItemEnhancement[]> {
  const root = createTraceNode({
    id: "nen.shu.enhancement",
    label: "Enhance every Shū Item on the boundary",
    formula: "Hi = eta * Ti * (Di / D0); Fi = 1 + Hi",
    inputs: { items: { value: composition.items.length } },
  });

  const efficiency = deriveShuEfficiency(mastery);
  const enhanced: ShuItemEnhancement[] = [];

  for (const item of composition.items) {
    const site = boundary.sites.find(
      (one) => one.siteId === `${GYO_ITEM_SITE_PREFIX}${item.entryId}`,
    );

    if (site === undefined) {
      return refuse(root, [{
        code: "nen.shu.enhancement.unplaced",
        message:
          `"${item.entryId}" is on the selection but not on the resolved ` +
          "boundary, so there is no density to enhance it from.",
        audience: "developer",
        required: "a placed Item site",
        actual: "absent",
      }]);
    }

    /*
     * `SHU_REFERENCE_DENSITY` is 1 Aura per square metre, so the ratio is the
     * density itself — written as the pure resolver's own arithmetic rather
     * than inlined, so the reference density has one owner.
     */
    const headroom = efficiency * item.path.transmission * site.density;
    const factor = 1 + headroom;

    const scaled = enhanceItemEnvelope(item.envelope, { factor, source });

    root.children.push(scaled.trace.root);

    if (!scaled.success) return refuse(root, scaled.errors);

    enhanced.push({
      entryId: item.entryId,
      density: site.density,
      transmission: item.path.transmission,
      efficiency,
      headroom,
      factor,
      envelope: scaled.payload,
    });
  }

  root.output = { items: enhanced.length };

  return { success: true, payload: enhanced, trace: { root }, warnings: [] };
}


/**
 * The integrity mitigation an enhanced Item provides against one stress.
 *
 *     effective = incoming / Fi
 *     mitigation = incoming - effective
 *
 * Computed above Nen and equipment both, and handed into the mitigation seam
 * equipment already honours for a compatible Item — which is what keeps
 * equipment from ever importing Aura or Nen to find out.
 */
export function shuIntegrityMitigation(
  enhancement: ShuItemEnhancement,
  incomingStress: number,
): EngineResult<{ readonly effectiveStress: number; readonly mitigation: number }> {
  return itemIntegrityMitigationFor(incomingStress, enhancement.factor);
}


/* ── Loss and recomputation ─────────────────────────────────────────────── */

export interface ShuLossRequest {
  readonly composition: ShuCompositionRequest;

  /**
   * Items that are gone or no longer in contact, at the exact instant.
   *
   * Dropped, transferred, consumed, destroyed, disconnected, or simply no
   * longer being used. The reason does not change the arithmetic; what changes
   * is only which ids are still in the network.
   */
  readonly removedEntryIds: readonly string[];

  /** Contacts that no longer hold. Removed before the paths are recomputed. */
  readonly removedEdges?: readonly ShuContactEdge[];
}


export interface ShuLossOutcome {
  /** The selection that survives, in stable order. */
  readonly remaining: readonly string[];

  /** Removed outright, or orphaned by something that was. */
  readonly dropped: readonly string[];

  /** The recomputed request, ready to resolve again. */
  readonly composition: ShuCompositionRequest;
}


/**
 * Recompute a Shū selection after Items or contacts are lost.
 *
 * Removes what went, then removes everything DOWNSTREAM of it that has no
 * remaining path to the body — a sword held through a gauntlet goes when the
 * gauntlet does, because the route it was reaching the coating through no
 * longer exists.
 *
 * What it deliberately does not do:
 *
 *   spend an Action        the world did this, not the character
 *   release reserve Aura   placement is not expenditure. The Output was never
 *                          spent to sit on the sword, so nothing comes back
 *                          when the sword goes; it simply spreads over the
 *                          smaller boundary at a higher density.
 *   add anything           a newly contacted Item is not selected by having
 *                          been touched. Selection is a deliberate act.
 */
export function recomputeShuAfterLoss(
  request: ShuLossRequest,
): EngineResult<ShuLossOutcome> {
  const root = createTraceNode({
    id: "nen.shu.loss",
    label: "Recompute a Shū selection after loss",
    inputs: {
      removed: { value: describeDiagnosticValue(request?.removedEntryIds?.length) },
    },
  });

  if (
    request === null || typeof request !== "object" ||
    request.composition === undefined ||
    !Array.isArray(request.removedEntryIds)
  ) {
    return refuse(root, [{
      code: "nen.shu.loss.malformed",
      message: "A Shū recomputation needs the composition and what was lost.",
      audience: "developer",
      required: "ShuLossRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const removed = new Set(request.removedEntryIds);

  const survivors = request.composition.items.filter(
    (one) => !removed.has(one.entryId),
  );

  const brokenEdges = new Set(
    (request.removedEdges ?? []).map((edge) => `${edge.from} ${edge.to}`),
  );

  const edges = request.composition.contactEdges.filter((edge) =>
    !removed.has(edge.from) && !removed.has(edge.to) &&
    !brokenEdges.has(`${edge.from} ${edge.to}`) &&
    !brokenEdges.has(`${edge.to} ${edge.from}`)
  );

  /*
   * Reachability over what is left, from the body. An Item that survived the
   * loss but whose only route ran through something that did not is orphaned,
   * and orphaning cascades — so this is a traversal rather than one pass.
   */
  const alive = new Set(survivors.map((one) => one.entryId));
  const adjacency = new Map<string, string[]>([[SHU_BODY_NODE, []]]);

  for (const entryId of alive) adjacency.set(entryId, []);

  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;

    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  const reached = new Set<string>([SHU_BODY_NODE]);
  const queue = [SHU_BODY_NODE];

  while (queue.length > 0) {
    for (const next of adjacency.get(queue.pop()!) ?? []) {
      if (reached.has(next)) continue;

      reached.add(next);
      queue.push(next);
    }
  }

  const remaining = survivors.filter((one) => reached.has(one.entryId));
  const remainingIds = new Set(remaining.map((one) => one.entryId));

  const dropped = request.composition.items
    .map((one) => one.entryId)
    .filter((entryId) => !remainingIds.has(entryId))
    .sort();

  root.output = { remaining: remaining.length, dropped: dropped.length };

  return {
    success: true,
    payload: {
      remaining: remaining.map((one) => one.entryId),
      dropped,
      composition: {
        ...request.composition,
        items: remaining,
        contactEdges: edges.filter((edge) =>
          (edge.from === SHU_BODY_NODE || remainingIds.has(edge.from)) &&
          (edge.to === SHU_BODY_NODE || remainingIds.has(edge.to))
        ),
      },
    },
    trace: { root },
    warnings: [],
  };
}
