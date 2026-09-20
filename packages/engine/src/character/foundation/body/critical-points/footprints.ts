/*
 * Sensory point footprints — how much of a body's surface each organ occupies.
 *
 * Needed because Sensory Gyō concentrates a coating into the eyes, and a
 * coating is Aura per square metre. Without a measured eye there is no
 * denominator, and a density computed from an invented denominator is a
 * fabricated number wearing an authoritative unit — which is the one thing the
 * measure vocabulary exists to refuse.
 *
 *
 * A FOOTPRINT PARTITIONS; IT DOES NOT ADD
 *
 * The single rule this file enforces. A Palm is part of a Hand, not an extra
 * surface bolted onto one, so:
 *
 *     sum(point footprints on a host) + host remainder = host surface area
 *
 * exactly, at every host. Adding a point's area to its host's instead would
 * grow a character's total surface every time somebody authored an organ,
 * which thins every coating they hold and would make "this Species has
 * detailed anatomy" a mechanical penalty.
 *
 * Overcommitment — points claiming more than the host has — is REFUSED rather
 * than scaled down. Scaling would silently rewrite authored anatomy, and the
 * author who wrote three 0.4 fractions onto one part wants to know.
 *
 *
 * WHY DAMAGE DOES NOT CHANGE THE PARTITION
 *
 * A destroyed Eye contributes nothing to Sight and still occupies the front of
 * a face. Geometry is not function: the socket is still surface, still takes a
 * coating, and still gets hit. So footprints are resolved from anatomy alone
 * and never consult point state — which also means the partition is invariant
 * under injury, and a conservation assertion downstream cannot be broken by
 * somebody losing an eye mid-scene.
 *
 * Point state is read where it belongs: by profile resolution, which zeroes
 * the destroyed organ's CONTRIBUTION, and by Gyō, which multiplies the Aura on
 * it by its functional fraction.
 */

import type { EngineError } from "../../../../infrastructure/diagnostics";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import type { BodyPartId } from "../anatomy/types";
import type { ResolvedBodyMeasurements } from "../measurements/types";
import type {
  CriticalPointId,
  CriticalPointInstance,
  ResolvedCriticalPoints,
  SensoryPointFootprint,
} from "./types";


/*
 * Declared here rather than imported from the Aura domain.
 *
 * Body measures in square centimetres throughout and says so in
 * measurements/types.ts; the Aura domain converts at its own point of use and
 * owns a constant for it. Importing that constant would make the body
 * foundation depend on Aura at runtime — and Aura already depends on Body, so
 * it would be a cycle — for the sake of the number 10,000. A unit conversion
 * is arithmetic, not a rule the two domains could disagree about.
 */
const SQUARE_CENTIMETRES_PER_SQUARE_METRE = 10_000;

/*
 * How much of a host's area the partition may consume before it is refused.
 *
 * Exactly all of it, with a relative tolerance for the float error a sum of
 * authored fractions accumulates. Fractions that were written to total 1.00
 * must not be refused for landing on 1.0000000000000002.
 */
const FOOTPRINT_TOLERANCE = 1e-9;


export interface ResolvedSensoryFootprint {
  readonly pointId: CriticalPointId;
  readonly hostPartId: BodyPartId;
  readonly squareMetres: number;
}


export interface ResolvedHostFootprints {
  readonly hostPartId: BodyPartId;
  readonly hostSquareMetres: number;

  readonly points: readonly ResolvedSensoryFootprint[];

  /** The host's surface with every point carved out. Never negative. */
  readonly remainderSquareMetres: number;
}


export interface ResolvedSensoryFootprints {
  readonly hosts: readonly ResolvedHostFootprints[];
  readonly byHostPartId: Readonly<Record<BodyPartId, ResolvedHostFootprints>>;
  readonly byPointId: Readonly<Record<CriticalPointId, ResolvedSensoryFootprint>>;

  /** Sum over every point. Equals the area removed from the hosts. */
  readonly totalPointSquareMetres: number;
}


/**
 * One point's EXPLICIT footprint against one host area, in square metres.
 *
 * `null` for a point that is not Sensory, and for one claiming the host
 * remainder — the remainder is not a property of the point, it is whatever the
 * other points left, so it cannot be answered without seeing all of them.
 */
export function resolveSensoryPointFootprint(
  point: CriticalPointInstance,
  hostSquareMetres: number,
): number | null {
  const footprint = point.sensory?.footprint;

  if (footprint === undefined || footprint.kind === "host-remainder") {
    return null;
  }

  return resolveExplicitFootprintArea(footprint, hostSquareMetres);
}


function resolveExplicitFootprintArea(
  footprint: Exclude<SensoryPointFootprint, { readonly kind: "host-remainder" }>,
  hostSquareMetres: number,
): number {
  return footprint.kind === "host-surface-fraction"
    ? hostSquareMetres * footprint.fraction
    : footprint.squareMetres;
}


function duplicateRemainder(
  hostPartId: BodyPartId,
  pointIds: readonly CriticalPointId[],
): EngineError {
  return {
    code: "character.body.sensory.footprint.remainder.duplicate",
    message:
      `Two Sensory points on "${hostPartId}" both claim the host remainder. ` +
      `Each would be handed all of it, so the part's surface would be ` +
      `counted twice.`,
    audience: "developer",
    required: "at most one host-remainder point per host",
    actual: pointIds.join(", "),
  };
}


function overcommitted(
  hostPartId: BodyPartId,
  claimed: number,
  available: number,
): EngineError {
  return {
    code: "character.body.sensory.footprint.overcommitted",
    message:
      `The Sensory points on "${hostPartId}" claim more surface than the ` +
      `part has. Point footprints partition their host; they never add to it.`,
    audience: "developer",
    required: `<= ${String(available)} m2`,
    actual: `${String(claimed)} m2`,
  };
}


/**
 * Every Sensory point's resolved area, and what is left of each host.
 *
 * Measurements decide which hosts exist: a part absent from the PRESENT
 * measurements has been destroyed, removed or suppressed, and its points have
 * no surface because the surface they were a share of is gone.
 */
export function resolveSensoryFootprints(input: {
  readonly points: ResolvedCriticalPoints;
  readonly measurements: ResolvedBodyMeasurements;
}): EngineResult<ResolvedSensoryFootprints> {
  const traceId = "character.body.sensory.footprints";
  const label = "Resolve Sensory point footprints";

  const fail = (error: EngineError): EngineResult<ResolvedSensoryFootprints> => ({
    success: false,
    trace: {
      root: createTraceNode({
        id: traceId,
        label,
        formula: "sum(point footprints) + remainder = host surface area",
        output: false,
      }),
    },
    warnings: [],
    errors: [error],
  });

  const byHost = new Map<BodyPartId, ResolvedSensoryFootprint[]>();
  const remainderClaims = new Map<BodyPartId, CriticalPointId[]>();

  /*
   * Two passes, because a remainder cannot be resolved until every explicit
   * claim on its host is known. The first pass measures what was asked for by
   * name; the second hands whatever is left to the point that asked for "the
   * rest".
   */
  for (const point of input.points.points) {
    if (point.sensory === undefined) continue;

    const measured = input.measurements.byPartId[point.hostPartId];

    /*
     * A point whose host is not in the present measurements is skipped rather
     * than zeroed. Its host is not there, so it has no area to be a share of,
     * and recording a zero-area site would put a coating target on anatomy the
     * character does not have.
     */
    if (measured === undefined) continue;

    if (point.sensory.footprint.kind === "host-remainder") {
      const claims = remainderClaims.get(point.hostPartId) ?? [];

      claims.push(point.id);
      remainderClaims.set(point.hostPartId, claims);

      continue;
    }

    const hostSquareMetres =
      measured.surfaceAreaCm2 / SQUARE_CENTIMETRES_PER_SQUARE_METRE;

    const squareMetres = resolveExplicitFootprintArea(
      point.sensory.footprint,
      hostSquareMetres,
    );

    const held = byHost.get(point.hostPartId) ?? [];

    held.push({ pointId: point.id, hostPartId: point.hostPartId, squareMetres });
    byHost.set(point.hostPartId, held);
  }

  for (const [hostPartId, claims] of remainderClaims) {
    const claimant = claims[0]!;

    if (claims.length > 1) {
      return fail(duplicateRemainder(hostPartId, claims));
    }

    const hostSquareMetres =
      input.measurements.byPartId[hostPartId]!.surfaceAreaCm2 /
        SQUARE_CENTIMETRES_PER_SQUARE_METRE;

    const explicit = (byHost.get(hostPartId) ?? [])
      .reduce((sum, one) => sum + one.squareMetres, 0);

    if (explicit > hostSquareMetres * (1 + FOOTPRINT_TOLERANCE)) {
      return fail(overcommitted(hostPartId, explicit, hostSquareMetres));
    }

    const held = byHost.get(hostPartId) ?? [];

    held.push({
      pointId: claimant,
      hostPartId,

      /*
       * Subtracted rather than recomputed, so the explicit claims and the
       * remainder add back to exactly the host's area.
       */
      squareMetres: Math.max(0, hostSquareMetres - explicit),
    });

    byHost.set(hostPartId, held);
  }

  const hosts: ResolvedHostFootprints[] = [];
  const byHostPartId: Record<BodyPartId, ResolvedHostFootprints> = {};
  const byPointId: Record<CriticalPointId, ResolvedSensoryFootprint> = {};

  let totalPointSquareMetres = 0;

  /* Sorted, so two hosts iterating the same body produce the same order. */
  for (const hostPartId of [...byHost.keys()].sort()) {
    const points = [...byHost.get(hostPartId)!].sort((left, right) =>
      left.pointId.localeCompare(right.pointId)
    );

    const hostSquareMetres =
      input.measurements.byPartId[hostPartId]!.surfaceAreaCm2 /
        SQUARE_CENTIMETRES_PER_SQUARE_METRE;

    const claimed = points.reduce((sum, one) => sum + one.squareMetres, 0);

    if (claimed > hostSquareMetres * (1 + FOOTPRINT_TOLERANCE)) {
      return fail(overcommitted(hostPartId, claimed, hostSquareMetres));
    }

    const host: ResolvedHostFootprints = {
      hostPartId,
      hostSquareMetres,
      points,

      /*
       * Subtracted from the host rather than summed independently, so the
       * parts add back to exactly the area the host had. Computing both ends
       * separately is how a float leaves a sliver of surface unaccounted for.
       */
      remainderSquareMetres: Math.max(0, hostSquareMetres - claimed),
    };

    hosts.push(host);
    byHostPartId[hostPartId] = host;
    totalPointSquareMetres += claimed;

    for (const point of points) byPointId[point.pointId] = point;
  }

  const trace = createTraceNode({
    id: traceId,
    label,
    formula: "sum(point footprints) + remainder = host surface area",
    inputs: { hosts: { value: hosts.length } },
    output: { points: Object.keys(byPointId).length, totalPointSquareMetres },
  });

  return engineSuccess({
    hosts,
    byHostPartId,
    byPointId,
    totalPointSquareMetres,
  }, { root: trace });
}
