/*
 * How far apart, and whether that satisfies a mechanic.
 *
 *
 * WHY DIRECT AND PATH DISTANCE ARE DIFFERENT TYPES
 *
 * Straight-line distance and travelled distance are both "metres" and are
 * almost never the same number. A target eight metres away around a corner is
 * within a 10 m Range and outside a 10 m walk. Storing both as a bare number
 * makes those interchangeable at every call site, and the mistake produces a
 * plausible answer rather than an error — which is the kind of bug that ships.
 *
 * So a Distance carries the kind of measurement it is, an interval says which
 * kind it constrains, and comparing one against the other is refused rather
 * than coerced.
 *
 *
 * WHY INTERVALS ARE INCLUSIVE AND BANDS ARE HALF-OPEN
 *
 * These two things want opposite boundary rules and the difference is not
 * cosmetic.
 *
 * A DistanceInterval expresses a REQUIREMENT — "Range 5 to 10 metres" — and a
 * target at exactly 10 metres is in Range. Both ends are inclusive, because
 * that is what a written rule means by "up to 10 metres".
 *
 * A RangeBandScale expresses a PARTITION — close / medium / long — and a
 * partition of a continuous quantity cannot have both ends inclusive without
 * either leaving gaps or claiming the same metre twice. A shared boundary
 * between two inclusive bands makes exactly one distance belong to two bands,
 * and the engine would then be picking between them by array order. So bands
 * are [from, to): inclusive at the start, exclusive at the end, with the last
 * band optionally unbounded. The field names say so, because a reader who
 * gets this backwards writes an off-by-one that only fires on round numbers.
 */

import type { EngineError } from "../infrastructure/diagnostics";


export const DISTANCE_KINDS = ["direct", "path"] as const;

/**
 * "direct" is the straight line between two points, ignoring what is in the
 * way. "path" is the length of a route actually travelled.
 */
export type DistanceKind = typeof DISTANCE_KINDS[number];


export function isDistanceKind(value: unknown): value is DistanceKind {
  return typeof value === "string" &&
    (DISTANCE_KINDS as readonly string[]).includes(value);
}


/** A measured separation, in metres, of a stated kind. */
export interface Distance {
  readonly kind: DistanceKind;
  readonly metres: number;
}


export function directDistance(metres: number): Distance {
  return { kind: "direct", metres };
}


export function pathDistance(metres: number): Distance {
  return { kind: "path", metres };
}


export function findDistanceIssues(
  distance: Distance,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isDistanceKind(distance.kind)) {
    errors.push({
      code: "spatial.distance.kind.invalid",
      message: "A distance must state whether it is direct or path length.",
      audience: "developer",
      required: [...DISTANCE_KINDS],
      actual: String(distance.kind),
    });
  }

  if (!Number.isFinite(distance.metres) || distance.metres < 0) {
    errors.push({
      code: "spatial.distance.metres.invalid",
      message: "A distance must be a finite, non-negative number of metres.",
      audience: "developer",
      required: "finite metres >= 0",
      actual: String(distance.metres),
    });
  }

  return errors;
}


/**
 * A requirement on how far away something may be. Both ends inclusive.
 *
 * `maximumMetres` is null for "no upper limit" rather than Infinity, so that
 * an unbounded requirement survives serialization to JSON — Infinity does not.
 */
export interface DistanceInterval {
  readonly kind: DistanceKind;
  readonly minimumMetres: number;
  readonly maximumMetres: number | null;
}


export function findDistanceIntervalIssues(
  interval: DistanceInterval,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isDistanceKind(interval.kind)) {
    errors.push({
      code: "spatial.interval.kind.invalid",
      message: "A distance interval must state which kind of distance it constrains.",
      audience: "developer",
      required: [...DISTANCE_KINDS],
      actual: String(interval.kind),
    });
  }

  if (!Number.isFinite(interval.minimumMetres) || interval.minimumMetres < 0) {
    errors.push({
      code: "spatial.interval.minimum.invalid",
      message: "A distance interval's minimum must be finite and non-negative.",
      audience: "developer",
      required: "finite metres >= 0",
      actual: String(interval.minimumMetres),
    });
  }

  if (interval.maximumMetres !== null) {
    if (!Number.isFinite(interval.maximumMetres)) {
      errors.push({
        code: "spatial.interval.maximum.invalid",
        message: "A distance interval's maximum must be finite, or null for unbounded.",
        audience: "developer",
        required: "finite metres, or null",
        actual: String(interval.maximumMetres),
      });
    } else if (interval.maximumMetres < interval.minimumMetres) {
      errors.push({
        code: "spatial.interval.inverted",
        message: "A distance interval's maximum is below its minimum.",
        audience: "developer",
        required: `maximum >= ${interval.minimumMetres}`,
        actual: String(interval.maximumMetres),
      });
    }
  }

  return errors;
}


/**
 * The result of measuring one distance against one requirement.
 *
 * Three of these outcomes are ordinary rule answers a GM would recognise —
 * in range, too close, too far — and the fourth is the engine refusing to
 * answer because the question was malformed. Keeping the refusal inside the
 * same union, rather than throwing or returning false, is what stops "out of
 * Range" and "you compared a walk to a Range" from looking identical to the
 * caller.
 */
export type DistanceComparison =
  | { readonly outcome: "within" }
  | { readonly outcome: "below-minimum"; readonly shortfallMetres: number }
  | { readonly outcome: "above-maximum"; readonly excessMetres: number }
  | { readonly outcome: "incomparable"; readonly error: EngineError };


export function compareToDistanceInterval(
  interval: DistanceInterval,
  distance: Distance,
): DistanceComparison {
  if (interval.kind !== distance.kind) {
    return {
      outcome: "incomparable",
      error: {
        code: "spatial.distance.kind.mismatch",
        message:
          "A distance may only be compared against an interval of the same kind.",
        audience: "developer",
        required: `${interval.kind} distance`,
        actual: `${distance.kind} distance`,
        resolution:
          "Straight-line separation and travelled path length are different measurements; measure the one the mechanic asks for.",
      },
    };
  }

  const structuralIssues = [
    ...findDistanceIssues(distance),
    ...findDistanceIntervalIssues(interval),
  ];

  const firstIssue = structuralIssues[0];

  if (firstIssue !== undefined) {
    return { outcome: "incomparable", error: firstIssue };
  }

  /* Inclusive at both ends: exactly 5 m satisfies a 5 m minimum. */
  if (distance.metres < interval.minimumMetres) {
    return {
      outcome: "below-minimum",
      shortfallMetres: interval.minimumMetres - distance.metres,
    };
  }

  if (
    interval.maximumMetres !== null &&
    distance.metres > interval.maximumMetres
  ) {
    return {
      outcome: "above-maximum",
      excessMetres: distance.metres - interval.maximumMetres,
    };
  }

  return { outcome: "within" };
}


/**
 * How far a body can strike without travelling.
 *
 * Kept as its own named concept rather than "an interval starting at zero"
 * because reach is a property of a creature and its weapon, and the places
 * that read it — melee attacks, opportunity conditions — ask "what is your
 * reach", not "what is your minimum". It converts to an interval for the
 * actual comparison.
 */
export interface MeleeReach {
  readonly reachMetres: number;
}


export function findMeleeReachIssues(
  reach: MeleeReach,
): readonly EngineError[] {
  if (!Number.isFinite(reach.reachMetres) || reach.reachMetres < 0) {
    return [{
      code: "spatial.reach.invalid",
      message: "Melee reach must be a finite, non-negative number of metres.",
      audience: "developer",
      required: "finite metres >= 0",
      actual: String(reach.reachMetres),
    }];
  }

  return [];
}


export function meleeReachInterval(reach: MeleeReach): DistanceInterval {
  return {
    kind: "direct",
    minimumMetres: 0,
    maximumMetres: reach.reachMetres,
  };
}


/**
 * One band of a Range scale. Inclusive at `fromMetresInclusive`, exclusive at
 * `toMetresExclusive`, which is null for the unbounded final band.
 */
export interface RangeBand {
  readonly id: string;
  readonly fromMetresInclusive: number;
  readonly toMetresExclusive: number | null;
}


/** An ordered, non-overlapping partition of distance, for one distance kind. */
export interface RangeBandScale {
  readonly kind: DistanceKind;
  readonly bands: readonly RangeBand[];
}


export function findRangeBandScaleIssues(
  scale: RangeBandScale,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isDistanceKind(scale.kind)) {
    errors.push({
      code: "spatial.bands.kind.invalid",
      message: "A Range band scale must state which kind of distance it partitions.",
      audience: "developer",
      required: [...DISTANCE_KINDS],
      actual: String(scale.kind),
    });
  }

  if (scale.bands.length === 0) {
    errors.push({
      code: "spatial.bands.empty",
      message: "A Range band scale must declare at least one band.",
      audience: "developer",
      required: "one or more bands",
      actual: "none",
    });

    return errors;
  }

  const seenIds = new Set<string>();
  let previousEnd: number | null = null;

  scale.bands.forEach((band, index) => {
    if (typeof band.id !== "string" || band.id.trim().length === 0) {
      errors.push({
        code: "spatial.bands.id.missing",
        message: "Every Range band must be named.",
        audience: "developer",
        required: "non-empty id",
        actual: String(band.id),
      });
    } else if (seenIds.has(band.id)) {
      errors.push({
        code: "spatial.bands.id.duplicate",
        message: `More than one Range band is named "${band.id}".`,
        audience: "developer",
        required: "unique band ids",
        actual: band.id,
      });
    } else {
      seenIds.add(band.id);
    }

    if (
      !Number.isFinite(band.fromMetresInclusive) ||
      band.fromMetresInclusive < 0
    ) {
      errors.push({
        code: "spatial.bands.from.invalid",
        message: `Range band "${band.id}" starts at an invalid distance.`,
        audience: "developer",
        required: "finite metres >= 0",
        actual: String(band.fromMetresInclusive),
      });

      return;
    }

    if (band.toMetresExclusive !== null) {
      if (!Number.isFinite(band.toMetresExclusive)) {
        errors.push({
          code: "spatial.bands.to.invalid",
          message: `Range band "${band.id}" ends at an invalid distance.`,
          audience: "developer",
          required: "finite metres, or null for the unbounded final band",
          actual: String(band.toMetresExclusive),
        });

        return;
      }

      if (band.toMetresExclusive <= band.fromMetresInclusive) {
        errors.push({
          code: "spatial.bands.empty-span",
          message: `Range band "${band.id}" covers no distance.`,
          audience: "developer",
          required: `end > ${band.fromMetresInclusive}`,
          actual: String(band.toMetresExclusive),
        });

        return;
      }
    } else if (index !== scale.bands.length - 1) {
      /*
       * An unbounded band anywhere but last swallows every band after it, and
       * the author almost certainly meant it to be last.
       */
      errors.push({
        code: "spatial.bands.unbounded-not-last",
        message: `Range band "${band.id}" is unbounded but is not the last band.`,
        audience: "developer",
        required: "only the final band may be unbounded",
        actual: `band ${index + 1} of ${scale.bands.length}`,
      });
    }

    if (previousEnd === null && index > 0) {
      /* Already reported as unbounded-not-last; nothing further to say. */
      return;
    }

    if (previousEnd !== null && band.fromMetresInclusive < previousEnd) {
      errors.push({
        code: "spatial.bands.overlap",
        message: `Range band "${band.id}" starts before the previous band ends.`,
        audience: "developer",
        required: `start >= ${previousEnd}`,
        actual: String(band.fromMetresInclusive),
      });
    }

    previousEnd = band.toMetresExclusive;
  });

  return errors;
}


/**
 * The band a distance falls in, or undefined if the scale does not cover it.
 *
 * Undefined is a real answer rather than an error: a scale is allowed to leave
 * gaps (a scale describing only thrown-weapon bands says nothing about 400
 * metres), and the caller decides what an uncovered distance means.
 */
export function findRangeBand(
  scale: RangeBandScale,
  distance: Distance,
): RangeBand | undefined {
  if (scale.kind !== distance.kind) return undefined;

  return scale.bands.find((band) =>
    distance.metres >= band.fromMetresInclusive &&
    (band.toMetresExclusive === null ||
      distance.metres < band.toMetresExclusive)
  );
}
