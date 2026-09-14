/*
 * Where funded Aura actually goes, once a target is involved.
 *
 * TARGET answers what is affected. DISTRIBUTION answers how the Aura is
 * arranged over it. Those are different questions with different owners, and
 * this module is the only place they meet:
 *
 *   character/foundation/aura  owns Aura, its reserve, its Output ceiling and
 *                              how a commitment spreads over a BODY
 *   targeting/                 owns what a mechanic may point at
 *   spatial/                   owns metric geometry
 *
 * None of those three may import the others — Character in particular is
 * forbidden from reaching up into targeting/ or spatial/, and that rule is
 * what keeps "Range" from quietly becoming "Range for a Character". So the
 * composition lives HERE, above all three, which is the same shape as
 * gameplay/combat composing neutral actions with targeting.
 *
 *
 * THE SIX CHANNELS
 *
 *   uniform-body-surface    every eligible present part, by surface area
 *   uniform-body-internal   every eligible present part, by volume
 *   differential-surface    stated weights, AUTHORIZED
 *   differential-internal   stated weights, AUTHORIZED
 *   item-surface            an authoritative host measure for an object
 *   projected-spatial       a Spatial area, derived where exact
 *
 * The body channels are not reimplemented here. They are handed to
 * resolveAuraDistribution, which already owns equal-density expansion, present
 * anatomy, continuity identity and the authorization check — a second copy of
 * any of that is a second answer free to disagree.
 *
 * UNIFORM MEANS COMPLETE. A uniform channel covers the whole eligible domain
 * at one density, and cannot carry weights, gaps or exclusions; a request that
 * wants those asks for a differential channel and brings an authorization. The
 * same rule generalizes across MULTIPLE targets: two items under one uniform
 * request end at the same density as each other, because that is what one
 * even spread over a larger domain means.
 *
 *
 * WHAT THIS STOPS SHORT OF
 *
 * Aura placed, and its density. Not reinforcement, not defence, not damage,
 * not what an uneven distribution DOES — those are later systems reading this
 * one's output. And no principle appears here by name: Gyō, Kō, Ryū and En are
 * authorizations and channels like any other as far as this file is concerned.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";

import {
  resolveAuraDistribution,
  type AutomaticAuraAllocation,
} from "../../character/foundation/aura/distribution";
import {
  resolveInternalAuraDensity,
  resolveSurfaceAuraDensity,
} from "../../character/foundation/aura/density";
import type { AuraAllocation } from "../../character/foundation/aura/state";
import { SQUARE_CENTIMETRES_PER_SQUARE_METRE } from "../../character/foundation/aura/types";
import type {
  AuraDensity,
  AuraDifferentialAuthorization,
  AuraDifferentialWeight,
  AuraPlacement,
  DroppedAuraAllocation,
  ResolvedAuraAllocation,
} from "../../character/foundation/aura/types";
import type { Anatomy } from "../../character/foundation/body/anatomy/types";
import type { ResolvedBodyMeasurements } from "../../character/foundation/body/measurements/types";
import { findTargetIssues, type TargetRef } from "../../targeting";
import { findAreaIssues } from "../../spatial";

import {
  deriveAreaVolumeLitres,
  findMeasureIssues,
  measureUnitFor,
  type AuraPlacementMeasure,
} from "./measures";


export const AURA_PLACEMENT_CHANNELS = [
  "uniform-body-surface",
  "uniform-body-internal",
  "differential-surface",
  "differential-internal",
  "item-surface",
  "projected-spatial",
] as const;

export type AuraPlacementChannelKind =
  typeof AURA_PLACEMENT_CHANNELS[number];


/*
 * A uniform body channel carries NOTHING beyond its name.
 *
 * That emptiness is the contract. The moment this shape has a weights field,
 * an exclusions field or a "primary part", a differential placement can be
 * expressed as a uniform one and the authorization becomes optional in
 * practice while remaining mandatory on paper.
 */
export interface UniformBodyChannel {
  readonly kind: "uniform-body-surface" | "uniform-body-internal";
}

export interface DifferentialBodyChannel {
  readonly kind: "differential-surface" | "differential-internal";
  readonly weights: readonly AuraDifferentialWeight[];
  readonly authorization: AuraDifferentialAuthorization;
}

/*
 * Aura spread over something the engine does not measure.
 *
 * The measure is mandatory and must carry provenance. An Item's surface area
 * is not derivable from anything in this engine — Body measures bodies — so
 * the alternative to requiring it is inventing one, and a density computed
 * from an invented denominator is a fabricated number wearing an
 * authoritative unit.
 */
export interface ItemSurfaceChannel {
  readonly kind: "item-surface";
  readonly measure: AuraPlacementMeasure;
}

/*
 * Aura projected into a Spatial area.
 *
 * The measure is optional exactly when the area's own fields determine a
 * volume — a sphere, a cylinder, an axis-aligned box. For a cone or a line it
 * is required, because turning those into a solid needs an assumption the
 * geometry does not state. See deriveAreaVolumeLitres.
 */
export interface ProjectedSpatialChannel {
  readonly kind: "projected-spatial";
  readonly measure?: AuraPlacementMeasure;
}

export type AuraPlacementChannel =
  | UniformBodyChannel
  | DifferentialBodyChannel
  | ItemSurfaceChannel
  | ProjectedSpatialChannel;


/** Which measurement, and therefore which density, a channel resolves in. */
export function placementOf(channel: AuraPlacementChannel): AuraPlacement {
  switch (channel.kind) {
    case "uniform-body-internal":
    case "differential-internal":
    case "projected-spatial":
      return "internal";

    case "uniform-body-surface":
    case "differential-surface":
    case "item-surface":
      return "surface";
  }
}


/** One thing a request points at, with the channel it is placed through. */
export interface AuraPlacementTarget {
  readonly target: TargetRef;
  readonly channel: AuraPlacementChannel;
}


export interface AuraPlacementRequest {
  readonly requestId: string;

  /** Whose Aura. Differential authorizations are checked against it. */
  readonly owner: string;

  /** What asked for this placement. Bound into any authorization. */
  readonly source: string;

  /**
   * Aura to place — the FUNDED figure, not the requested one.
   *
   * A placement is where committed Aura sits, so a request that placed what
   * was asked for rather than what was funded would put Aura on the body that
   * the reserve never paid for.
   */
  readonly aura: number;

  /** One or more. Several share the Aura by measure, at one density. */
  readonly targets: NonEmptyArray<AuraPlacementTarget>;

  readonly priority?: number;
}


/** What the engine needs about the body, when a body channel is used. */
export interface AuraPlacementBody {
  readonly anatomy: Anatomy;
  readonly measurements: ResolvedBodyMeasurements;
  readonly availableOutput: number;
  readonly automatic?: readonly AutomaticAuraAllocation[];
}


/*
 * One place Aura ended up, whatever kind of thing it is.
 *
 * Body parts, items and projected volumes all reduce to the same four facts —
 * what it is, how much is there, how much of it there is, and the resulting
 * density — so they share a shape rather than forcing every consumer to branch
 * on the channel before it can read an amount.
 */
export interface AuraPlacementSite {
  readonly target: TargetRef;
  readonly channel: AuraPlacementChannelKind;

  /** Present only for body channels, where a specific part holds the Aura. */
  readonly partId?: ResolvedAuraAllocation["partId"];
  readonly continuityKey?: ResolvedAuraAllocation["continuityKey"];

  readonly aura: number;
  readonly measure: AuraPlacementMeasure;
  readonly density: AuraDensity;
}


export interface ResolvedAuraPlacement {
  readonly requestId: string;
  readonly owner: string;
  readonly source: string;

  readonly sites: readonly AuraPlacementSite[];

  /** Targets that resolved to nothing. Not an error — see the header. */
  readonly dropped: readonly DroppedAuraAllocation[];

  /** Aura actually placed. Equals `request.aura` less anything dropped. */
  readonly placedAura: number;
}


/*
 * Conservation tolerance.
 *
 * Splitting one amount by measure and adding the shares back up does not
 * reliably return the original in binary floating point. The same relative
 * tolerance the Aura domain uses for its Output ceiling, for the same reason:
 * Aura spans nine orders of magnitude, so an absolute epsilon would be
 * invisible at one end and a real quantity at the other.
 */
const CONSERVATION_TOLERANCE = 1e-9;


function fail(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<ResolvedAuraPlacement> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


function isBodyChannel(channel: AuraPlacementChannel): boolean {
  return channel.kind.startsWith("uniform-body-") ||
    channel.kind.startsWith("differential-");
}


/*
 * The measure a non-body target is denominated in, derived or supplied.
 *
 * Returns errors rather than a fallback. "I could not measure this" and "this
 * measures zero" are different answers, and only the first is true when a host
 * has not told us — so the absent case is a refusal, never a default.
 */
function measureFor(
  entry: AuraPlacementTarget,
): { readonly measure?: AuraPlacementMeasure; readonly errors: readonly EngineError[] } {
  const { channel, target } = entry;

  if (channel.kind === "item-surface") {
    const errors = findMeasureIssues(channel.measure, "An item surface measure");

    return errors.length > 0 ? { errors } : { measure: channel.measure, errors: [] };
  }

  if (channel.kind !== "projected-spatial") return { errors: [] };

  if (channel.measure !== undefined) {
    const errors = findMeasureIssues(channel.measure, "A projected measure");

    return errors.length > 0 ? { errors } : { measure: channel.measure, errors: [] };
  }

  if (target.kind !== "area") {
    return {
      errors: [{
        code: "aura.placement.measure.required",
        message:
          "A projected placement at a target that is not an area must carry " +
          "an explicit measure; the engine has no geometry to derive one from.",
        audience: "developer",
        required: "an AuraPlacementMeasure",
        actual: `target kind ${target.kind}`,
      }],
    };
  }

  const litres = deriveAreaVolumeLitres(target.area);

  if (litres === null || !Number.isFinite(litres) || litres <= 0) {
    return {
      errors: [{
        code: "aura.placement.measure.required",
        message:
          `A ${target.area.kind} does not determine a volume from its own ` +
          "fields, so a projected placement over one needs a host measure.",
        audience: "developer",
        required: "an AuraPlacementMeasure",
        actual: litres === null ? "not derivable" : String(litres),
      }],
    };
  }

  return {
    measure: {
      unit: "litre",
      amount: litres,
      derivation: "derived",
      provenance: `spatial:${target.area.kind}`,
    },
    errors: [],
  };
}


/*
 * Turn one body channel into the stored-allocation shape distribution takes.
 *
 * The authorization travels with it unchanged. Rebuilding one here — or
 * defaulting any of its three bindings — would be this module issuing itself
 * the permission the allocation is supposed to arrive holding.
 */
function allocationFor(
  request: AuraPlacementRequest,
  entry: AuraPlacementTarget,
  aura: number,
  index: number,
): AuraAllocation {
  const placement = placementOf(entry.channel);
  const id = `${request.requestId}:${index}`;
  const shared = {
    id,
    placement,
    aura,
    source: request.source,
    ...(request.priority === undefined ? {} : { priority: request.priority }),
  } as const;

  if (
    entry.channel.kind === "differential-surface" ||
    entry.channel.kind === "differential-internal"
  ) {
    return {
      ...shared,
      coverage: "differential",
      weights: entry.channel.weights,
      authorization: entry.channel.authorization,
    };
  }

  return { ...shared, coverage: "whole-body" };
}


/**
 * Resolve one funded Aura amount onto everything it was aimed at.
 *
 * The order is fixed and each step is a different kind of no:
 *
 *   1. the request's own shape and every target       structural failure
 *   2. each non-body target's measure                 structural failure
 *   3. the Aura is shared out by measure              equal density
 *   4. body channels go to resolveAuraDistribution    its rules, not ours
 *   5. non-body channels resolve their own density
 *
 * Step 3 is where "uniform" becomes arithmetic rather than a promise. Every
 * target's share is proportional to how much of it there is, so two items of
 * different sizes under one request end at the same density — which is the
 * same rule the body channels apply across parts, applied one level up.
 */
export function resolveAuraPlacement(
  request: AuraPlacementRequest,
  body?: AuraPlacementBody,
): EngineResult<ResolvedAuraPlacement> {
  const root = createTraceNode({
    id: "aura.placement.resolve",
    label: "Place funded Aura on its targets",
    formula:
      "share_i = aura * (measure_i / totalMeasure); density = share / measure",
    inputs: {
      requestId: { value: request.requestId },
      owner: { value: request.owner },
      source: { value: request.source },
      aura: {
        value: Number.isFinite(request.aura)
          ? request.aura
          : String(request.aura),
      },
      targets: { value: request.targets?.length ?? 0 },
    },
  });

  /* ── 1. Structure ─────────────────────────────────────────────────── */

  const structural: EngineError[] = [];

  if (!Number.isFinite(request.aura) || request.aura < 0) {
    structural.push({
      code: "aura.placement.aura.invalid",
      message: "Aura to place must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(request.aura),
    });
  }

  if (!Array.isArray(request.targets) || request.targets.length === 0) {
    structural.push({
      code: "aura.placement.targets.missing",
      message: "An Aura placement must name at least one target.",
      audience: "developer",
      required: "one or more targets",
      actual: String(request.targets?.length ?? "absent"),
    });

    return fail(root, structural);
  }

  request.targets.forEach((entry, index) => {
    structural.push(...findTargetIssues(entry?.target));

    if (
      entry?.channel === null || typeof entry?.channel !== "object" ||
      !(AURA_PLACEMENT_CHANNELS as readonly unknown[]).includes(entry.channel.kind)
    ) {
      structural.push({
        code: "aura.placement.channel.invalid",
        message: `Target ${index} must name a known placement channel.`,
        audience: "developer",
        required: AURA_PLACEMENT_CHANNELS.join(" | "),
        actual: String((entry?.channel as { kind?: unknown })?.kind),
      });

      return;
    }

    /*
     * The geometry, judged by the domain that owns it. A malformed area is a
     * malformed area whether or not anybody wanted to put Aura in it, and
     * spatial/ is the only thing entitled to say so.
     */
    if (entry.target?.kind === "area") {
      structural.push(...findAreaIssues(entry.target.area));
    }

    if (isBodyChannel(entry.channel) && body === undefined) {
      structural.push({
        code: "aura.placement.body.missing",
        message:
          "A body placement channel needs the anatomy and measurements to " +
          "place it on.",
        audience: "developer",
        required: "an AuraPlacementBody",
        actual: "absent",
      });
    }
  });

  if (structural.length > 0) return fail(root, structural);

  /* ── 2. Measures for everything the engine does not measure itself ─── */

  const measures = new Map<number, AuraPlacementMeasure>();
  const measureErrors: EngineError[] = [];

  request.targets.forEach((entry, index) => {
    const resolved = measureFor(entry);

    if (resolved.errors.length > 0) {
      measureErrors.push(...resolved.errors);

      return;
    }

    if (resolved.measure !== undefined) measures.set(index, resolved.measure);
  });

  if (measureErrors.length > 0) return fail(root, measureErrors);

  /* ── 3. Share the Aura out by how much of each target there is ─────── */

  const shares = shareByMeasure(request, measures, body);

  if (!shares.success) return fail(root, shares.errors);

  /* ── 4 & 5. Resolve each target through the channel it declared ────── */

  const sites: AuraPlacementSite[] = [];
  const dropped: DroppedAuraAllocation[] = [];
  const children: TraceNode[] = [];

  for (const [index, entry] of request.targets.entries()) {
    const share = shares.payload[index]!;

    if (isBodyChannel(entry.channel)) {
      const placed = resolveAuraDistribution({
        allocations: [allocationFor(request, entry, share, index)],
        ...(body!.automatic === undefined ? {} : { automatic: body!.automatic }),
        anatomy: body!.anatomy,
        measurements: body!.measurements,
        availableOutput: body!.availableOutput,
        owner: request.owner,
      });

      children.push(placed.trace.root);

      if (!placed.success) return fail(root, placed.errors);

      dropped.push(...placed.payload.dropped);

      for (const one of placed.payload.distribution.allocations) {
        sites.push({
          target: entry.target,
          channel: entry.channel.kind,
          partId: one.partId,
          continuityKey: one.continuityKey,
          aura: one.aura,
          measure: bodyMeasureOf(one),
          density: one.density,
        });
      }

      continue;
    }

    const measure = measures.get(index)!;

    /*
     * density.ts owns both formulas and the single cm2-to-m2 conversion, so
     * this asks it rather than dividing again. Surface measures reach it in
     * CENTIMETRES because that is the unit it takes.
     */
    const density = measure.unit === "litre"
      ? resolveInternalAuraDensity(share, measure.amount)
      : resolveSurfaceAuraDensity(
        share,
        measure.amount * SQUARE_CENTIMETRES_PER_SQUARE_METRE,
      );

    children.push(density.trace.root);

    if (!density.success) return fail(root, density.errors);

    sites.push({
      target: entry.target,
      channel: entry.channel.kind,
      aura: share,
      measure,
      density: density.payload,
    });
  }

  const placedAura = sites.reduce((total, site) => total + site.aura, 0);

  root.output = {
    sites: sites.length,
    dropped: dropped.length,
    placedAura,
  };
  root.children = children;

  return {
    success: true,
    payload: {
      requestId: request.requestId,
      owner: request.owner,
      source: request.source,
      sites,
      dropped,
      placedAura,
    },
    trace: { root },
    warnings: [],
  };
}


/*
 * The measure a resolved body allocation was actually judged against.
 *
 * Rebuilt from the resolved allocation rather than recomputed from the body,
 * so a site quotes the same denominator its density was divided by. The
 * conversion to square metres happens here because Body is authoritative in
 * centimetres and every consumer of a site wants one unit.
 */
function bodyMeasureOf(one: ResolvedAuraAllocation): AuraPlacementMeasure {
  return one.placement === "internal"
    ? {
      unit: "litre",
      amount: one.coveredVolumeL,
      derivation: "body",
      provenance: `body:${one.partId}`,
    }
    : {
      unit: "square-metre",
      amount: one.coveredSurfaceAreaCm2 / SQUARE_CENTIMETRES_PER_SQUARE_METRE,
      derivation: "body",
      provenance: `body:${one.partId}`,
    };
}


/*
 * How much of the Aura each target gets.
 *
 * Proportional to how much of that target there IS, which is what makes one
 * uniform request across several targets come out at one density rather than
 * at one amount each. A body channel's share is measured by the whole eligible
 * body, so a technique spread over a character and their sword weights the two
 * by their actual surfaces instead of splitting it down the middle.
 *
 * A single target takes the whole amount without arithmetic, which keeps the
 * overwhelmingly common case exact rather than exact-to-nine-decimal-places.
 */
function shareByMeasure(
  request: AuraPlacementRequest,
  measures: ReadonlyMap<number, AuraPlacementMeasure>,
  body: AuraPlacementBody | undefined,
): EngineResult<readonly number[]> {
  const root = createTraceNode({
    id: "aura.placement.share",
    label: "Share Aura across targets by measure",
  });

  if (request.targets.length === 1) {
    root.output = { shares: [request.aura] };

    return {
      success: true,
      payload: [request.aura],
      trace: { root },
      warnings: [],
    };
  }

  const amounts: number[] = [];

  for (const [index, entry] of request.targets.entries()) {
    if (!isBodyChannel(entry.channel)) {
      amounts.push(measures.get(index)!.amount);

      continue;
    }

    /*
     * The whole eligible body, in the unit this channel is denominated in.
     * Summed from the same measurements distribution will use, so the weight a
     * body carries here and the parts it expands into below cannot disagree.
     */
    const unit = measureUnitFor(placementOf(entry.channel));
    let total = 0;

    for (const part of body!.anatomy.parts) {
      if (part.state !== "active") continue;

      const measured = body!.measurements.byPartId[part.id];

      if (measured === undefined) continue;

      total += unit === "litre"
        ? measured.volumeL
        : measured.surfaceAreaCm2 / SQUARE_CENTIMETRES_PER_SQUARE_METRE;
    }

    amounts.push(total);
  }

  const totalMeasure = amounts.reduce((sum, one) => sum + one, 0);

  if (!Number.isFinite(totalMeasure) || totalMeasure <= 0) {
    root.output = false;

    return {
      success: false,
      trace: { root },
      warnings: [],
      errors: [{
        code: "aura.placement.measure.total.invalid",
        message:
          "The targets of an Aura placement have no measurable extent to " +
          "spread it over.",
        audience: "developer",
        required: "finite total measure > 0",
        actual: String(totalMeasure),
      }],
    };
  }

  const shares = amounts.map((one) => request.aura * (one / totalMeasure));

  /*
   * The trailing correction, for the reason budget.ts documents: multiplying
   * by a factor and adding the results back up does not reliably reproduce the
   * original, and a placement that overshot its funded Aura by one part in
   * 10^13 is a placement over its ceiling. The excess comes off the largest
   * share, where it is proportionally smallest.
   */
  const placed = shares.reduce((sum, one) => sum + one, 0);
  const excess = placed - request.aura;

  if (Math.abs(excess) > request.aura * CONSERVATION_TOLERANCE) {
    let largest = 0;

    shares.forEach((one, index) => {
      if (one > shares[largest]!) largest = index;
    });

    shares[largest] = Math.max(0, shares[largest]! - excess);
  }

  root.output = { totalMeasure, shares };

  return { success: true, payload: shares, trace: { root }, warnings: [] };
}
