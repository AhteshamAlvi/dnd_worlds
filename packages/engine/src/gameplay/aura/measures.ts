/*
 * The denominator a placement is judged against, and where it came from.
 *
 * Aura density is Aura over something physical, and the engine is authoritative
 * about exactly one of those somethings: a Character's own Body, measured
 * through the Body pipeline. For everything else — a sword's surface, the
 * volume a projected sphere occupies, a wall a technique is spread across — it
 * is either derivable exactly from geometry the engine already holds, or it is
 * a fact about a world the engine cannot see.
 *
 * So a measure arrives one of two ways and says which:
 *
 *   DERIVED   computed here from a SpatialArea's own stated dimensions, and
 *             only for the shapes whose solid those dimensions determine
 *             without assuming anything. A sphere of radius r has exactly one
 *             volume; so do a cylinder and an axis-aligned box.
 *
 *   HOST      supplied, finite, positive, and carrying provenance. An Item's
 *             surface area is not derivable from anything the engine models,
 *             and a plausible-looking default would be a number every
 *             downstream density quoted as though it had been measured.
 *
 * A cone and a line are deliberately NOT derived. A cone's fields fix a
 * direction, a length and an aperture but not the shape of the solid they
 * sweep, and a line has no height at all — so both would need an assumption to
 * turn into a volume, and an assumption is the one thing a measure may not be.
 * The host supplies those, as it supplies an Item's.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type { SpatialArea } from "../../spatial";


export const AURA_MEASURE_UNITS = ["square-metre", "litre"] as const;

export type AuraMeasureUnit = typeof AURA_MEASURE_UNITS[number];


/*
 * A physical quantity Aura is spread over.
 *
 * `provenance` is required rather than optional, on both branches. A density
 * of "12 per square metre" is unarguable and unauditable without it: a GM
 * asking why wants to know whether that metre came from the Body pipeline, a
 * derived sphere, or a number the host handed over.
 */
export interface AuraPlacementMeasure {
  readonly unit: AuraMeasureUnit;

  /** Finite and strictly positive. Zero is a question, not a measurement. */
  readonly amount: number;

  readonly derivation: "derived" | "host" | "body";

  readonly provenance: string;
}


/** The measure a placement needs, given where the Aura is going. */
export function measureUnitFor(
  placement: "surface" | "internal",
): AuraMeasureUnit {
  return placement === "surface" ? "square-metre" : "litre";
}


export function findMeasureIssues(
  measure: unknown,
  label: string,
): readonly EngineError[] {
  if (measure === null || typeof measure !== "object") {
    return [{
      code: "aura.placement.measure.invalid",
      message: `${label} must be an object naming a unit, an amount and its provenance.`,
      audience: "developer",
      required: "AuraPlacementMeasure",
      actual: String(measure),
    }];
  }

  const { unit, amount, provenance } = measure as {
    readonly unit?: unknown;
    readonly amount?: unknown;
    readonly provenance?: unknown;
  };

  const errors: EngineError[] = [];

  if (!(AURA_MEASURE_UNITS as readonly unknown[]).includes(unit)) {
    errors.push({
      code: "aura.placement.measure.unit.invalid",
      message: `${label} must be measured in one of: ${AURA_MEASURE_UNITS.join(", ")}.`,
      audience: "developer",
      required: AURA_MEASURE_UNITS.join(" | "),
      actual: String(unit),
    });
  }

  /*
   * Strictly positive. A zero denominator is not an extreme density, it is a
   * division that has no answer — and Infinity is worse than a refusal because
   * it propagates silently through every sum downstream.
   */
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    errors.push({
      code: "aura.placement.measure.amount.invalid",
      message: `${label} must be a finite positive quantity.`,
      audience: "developer",
      required: "finite number > 0",
      actual: String(amount),
    });
  }

  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    errors.push({
      code: "aura.placement.measure.provenance.missing",
      message:
        `${label} must say where it came from, so a density can be audited ` +
        "rather than merely quoted.",
      audience: "developer",
      required: "non-empty provenance",
      actual: provenance === undefined ? "absent" : String(provenance),
    });
  }

  return errors;
}


/**
 * The volume a Spatial area occupies, when its own fields determine one.
 *
 * `null` means "not derivable" rather than "zero", and the caller must then
 * require a host measure. The distinction matters: returning a plausible
 * number for a cone would be the engine quietly choosing a solid, and every
 * density computed from it would carry that choice as though it were measured.
 */
export function deriveAreaVolumeLitres(area: SpatialArea): number | null {
  const CUBIC_METRE_IN_LITRES = 1000;

  switch (area.kind) {
    case "sphere": {
      const cubicMetres = (4 / 3) * Math.PI * area.radiusMetres ** 3;

      return cubicMetres * CUBIC_METRE_IN_LITRES;
    }

    case "cylinder": {
      const cubicMetres =
        Math.PI * area.radiusMetres ** 2 * area.heightMetres;

      return cubicMetres * CUBIC_METRE_IN_LITRES;
    }

    case "box": {
      const cubicMetres =
        area.lengthMetres * area.widthMetres * area.heightMetres;

      return cubicMetres * CUBIC_METRE_IN_LITRES;
    }

    /*
     * A cone's aperture and length sweep a solid whose shape the type does not
     * fix, and a line has a length and a width but no height. Both need an
     * assumption to become a volume; the host supplies the measure instead.
     */
    case "cone":
    case "line":
      return null;
  }
}
