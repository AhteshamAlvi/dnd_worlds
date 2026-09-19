/*
 * An Item's boundary physics: what its outside is, how well it carries, and
 * how much of it there is.
 *
 * This file is about the OBJECT and nothing else. It describes three physical
 * facts an Item has whether or not anything is ever extended onto it:
 *
 *   MODE         whether the Item covers the body ("overlay" — a gauntlet, a
 *                breastplate, a coat) or extends away from it ("extension" —
 *                a blade, a staff, an arrow). The two are not a style choice:
 *                a thing worn ON a body shares that body's outline, while a
 *                thing held AWAY from it has an outline of its own.
 *
 *   CONDUCTIVITY how readily the material carries what is put through it, as
 *                a dimensionless coefficient. See the band table below.
 *
 *   SURFACE      how much exposed outside the Item has, in square metres, or
 *                — for an overlay — the identities of the body continuity it
 *                covers, which only a caller holding that body can turn into
 *                an area.
 *
 * NOTHING HERE MENTIONS AURA, AND THAT IS DELIBERATE. A sword's steel
 * conducts, has a surface and extends from the hand in a world where nobody
 * has ever learned Nen. Equipment owns the object; a coating mechanic owns
 * what it does with the object. architecture.test.ts enforces the one-way
 * direction by refusing any import of `character/foundation/aura` or
 * `character/foundation/nen` from this directory, types included, so the
 * vocabulary here is neutral by construction rather than by discipline.
 *
 *
 * GEOMETRY IS NEVER INFERRED
 *
 * `deriveItemGeometrySurfaceArea()` computes an area from AUTHORED dimensions
 * and from nothing else. An Item's name, its mass, its price, its families,
 * its damage figures and its flavour text are never consulted, and there is no
 * fallback area and no default: an Item that must be measured and carries no
 * measure is a structural failure at the moment something tries to measure it,
 * never a guessed number. A plausible default would be the worst possible
 * outcome here, because every density computed downstream would quote it as
 * though somebody had measured it. This mirrors `gameplay/aura/measures.ts`'s
 * `AuraPlacementMeasure` — read that file for the full reasoning; it is
 * deliberately not imported, because it sits outside equipment.
 *
 * Only shapes whose stated dimensions FIX a surface area with no assumption
 * are derivable. A cone and a line are absent for the reason that file gives:
 * their fields fix a direction and a length but not the solid they sweep.
 *
 *
 * ONE TABLE FOR THE BANDS, AND NO ROUNDING
 *
 * `ITEM_CONDUCTIVITY_BANDS` is the only place a threshold is written. A value
 * is never rounded into a neighbouring band: 0.1500001 is "ordinary" and not
 * "poor", because an author who wrote a hair above a boundary wrote a hair
 * above a boundary. Each entry names a half-open interval
 * `(exclusiveMinimum, maximum]`, so the boundary value itself always belongs
 * to the LOWER band — 0.15 is "poor", 0.30 is "ordinary", 1.00 is a perfect
 * conductor.
 *
 * "Approaching perfection" is `>0.95` up to but NOT including 1.00, and a
 * perfect conductor is 1.00 exactly. Expressed in one table that needs a
 * strict upper bound in one row, that is `maximum: BELOW_ONE` — the largest
 * double strictly below 1 — rather than a second lookup rule beside the table.
 * A second rule is how two answers to one question get started.
 *
 *
 * TICKET-READING DECISIONS, STATED RATHER THAN BURIED
 *
 * 1. `0 < kappa < 0.01` is REFUSED, not accepted as an unbanded trickle. The
 *    table is total over the authorable range, so a positive value with no
 *    band is an authoring slip — a misplaced decimal point far more often
 *    than a deliberate near-insulator — and accepting it would put a number
 *    into play that nothing downstream could describe.
 *
 * 2. `kappa > 1.50` is ACCEPTED with world authority, even though it has no
 *    band. That is not a contradiction of (1): above the table is where the
 *    world-level exceptional content lives, and the authorization is what
 *    stands in for the description. Below the table there is no authorization
 *    that would make sense of the value.
 *
 * 3. An authorization on a value that needs none is refused rather than
 *    ignored. A waiver attached to ordinary content is a false provenance,
 *    and a false provenance is worse than a missing one: it survives review.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";


/* -------------------------------------------------------------------------- */
/* Boundary mode                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Whether the Item covers the body or extends away from it.
 *
 * overlay   — the Item shares the body's outline where it sits. Its exposed
 *             area is a fact about the BODY underneath it, which is why an
 *             overlay names continuity identities rather than square metres.
 *
 * extension — the Item has an outline of its own, away from the body. Its
 *             exposed area is a fact about the Item, and must be stated or
 *             derived from authored geometry.
 */
export const ITEM_BOUNDARY_MODES = ["overlay", "extension"] as const;

export type ItemBoundaryMode = typeof ITEM_BOUNDARY_MODES[number];


export function isItemBoundaryMode(value: unknown): value is ItemBoundaryMode {
  return typeof value === "string" &&
    (ITEM_BOUNDARY_MODES as readonly string[]).includes(value);
}


/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A deterministic authored shape.
 *
 * Every member's stated dimensions fix an exposed surface area with no
 * assumption whatsoever. Nesting is permitted through `composite`, and a cycle
 * is impossible by construction: the type is a tree of literals, not a graph
 * of references, so there is nothing for a part to point back at.
 */
export type ItemGeometry =
  | {
      readonly shape: "box";
      readonly lengthMetres: number;
      readonly widthMetres: number;
      readonly heightMetres: number;
    }
  | {
      readonly shape: "cylinder";
      readonly radiusMetres: number;
      readonly heightMetres: number;

      /** Whether the two flat ends are exposed, or joined to something else. */
      readonly capped: boolean;
    }
  | {
      readonly shape: "sphere";
      readonly radiusMetres: number;
    }
  | {
      readonly shape: "plate";
      readonly lengthMetres: number;
      readonly widthMetres: number;
      readonly thicknessMetres: number;
    }
  | {
      readonly shape: "composite";
      readonly parts: readonly ItemGeometry[];
    };


export const ITEM_GEOMETRY_SHAPES = [
  "box",
  "cylinder",
  "sphere",
  "plate",
  "composite",
] as const;

export type ItemGeometryShape = typeof ITEM_GEOMETRY_SHAPES[number];


/**
 * The total EXPOSED surface area of an authored shape, in square metres.
 *
 * Reads the geometry as typed, so ask it only of a geometry that has passed
 * `findItemBoundaryPhysicsIssues()`. It computes and does not judge: a shape
 * with a zero dimension has an answer here and is refused there, because a
 * function that returned `null` for "invalid" and a number for "valid" would
 * be two functions sharing a name.
 *
 * A plate is a box whose third dimension is its thickness. It exists as its
 * own shape because an author writing a shield or a vambrace thinks in
 * length, width and thickness, and making them spell `heightMetres` for a
 * thickness is how a 3mm plate gets authored as a 3mm-tall box by one person
 * and a 3m-tall one by the next.
 */
export function deriveItemGeometrySurfaceArea(geometry: ItemGeometry): number {
  switch (geometry.shape) {
    case "box": {
      const { lengthMetres: l, widthMetres: w, heightMetres: h } = geometry;

      return 2 * (l * w + l * h + w * h);
    }

    case "cylinder": {
      const lateral = 2 * Math.PI * geometry.radiusMetres * geometry.heightMetres;
      const ends = geometry.capped
        ? 2 * Math.PI * geometry.radiusMetres ** 2
        : 0;

      return lateral + ends;
    }

    case "sphere":
      return 4 * Math.PI * geometry.radiusMetres ** 2;

    case "plate": {
      const { lengthMetres: l, widthMetres: w, thicknessMetres: t } = geometry;

      return 2 * (l * w + l * t + w * t);
    }

    case "composite":
      return geometry.parts.reduce(
        (total, part) => total + deriveItemGeometrySurfaceArea(part),
        0,
      );
  }
}


/* -------------------------------------------------------------------------- */
/* Surface measure                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How much exposed outside the Item has, and where that figure came from.
 *
 * `provenance` is required on EVERY branch, for the reason
 * `AuraPlacementMeasure.provenance` is: a density of "so much per square
 * metre" is unarguable and unauditable without it. A GM asking why wants to
 * know whether the metre came from a catalogue, from the Item's own authored
 * geometry, or from the body the Item is strapped to.
 *
 * stated      — an explicit positive area somebody measured or decided.
 * geometry    — authored dimensions this file turns into an area exactly.
 * covers-body — the Item has no area of its own to give. It names the body
 *               continuity identities it authoritatively covers, and the
 *               caller holding that body resolves them. `continuityKeys` is
 *               a SET of identities, so a repeat says nothing the first
 *               claim did not and is refused rather than collapsed.
 */
export type ItemSurfaceMeasure =
  | {
      readonly kind: "stated";
      readonly squareMetres: number;
      readonly provenance: string;
    }
  | {
      readonly kind: "geometry";
      readonly geometry: ItemGeometry;
      readonly provenance: string;
    }
  | {
      readonly kind: "covers-body";
      readonly continuityKeys: readonly string[];
      readonly provenance: string;
    };


export const ITEM_SURFACE_MEASURE_KINDS = [
  "stated",
  "geometry",
  "covers-body",
] as const;

export type ItemSurfaceMeasureKind = typeof ITEM_SURFACE_MEASURE_KINDS[number];


/** Which measure kinds a mode may use. */
export const ITEM_MEASURE_KINDS_BY_MODE: {
  readonly [K in ItemBoundaryMode]: readonly ItemSurfaceMeasureKind[];
} = {
  /*
   * An overlay's area is the body's, so it may say only which body it covers.
   * Letting one state a flat area would let a gauntlet claim a surface the arm
   * inside it does not have, and nothing downstream could contradict it.
   */
  overlay: ["covers-body"],

  /*
   * An extension has an outline of its own and must account for it, either
   * explicitly or from geometry. It may not defer to a body it is not part of.
   */
  extension: ["stated", "geometry"],
};


/**
 * The Item's own exposed area, or `null` when only the body it covers knows.
 *
 * `null` is "not resolvable HERE" and never zero. Zero would be a measurement
 * — a surface with no extent — and would propagate through every density
 * downstream as a division by nothing; `null` is an instruction to the caller
 * to go and ask the body, which is the one place the answer exists.
 */
export function resolveItemSurfaceArea(measure: ItemSurfaceMeasure): number | null {
  switch (measure.kind) {
    case "stated":
      return measure.squareMetres;

    case "geometry":
      return deriveItemGeometrySurfaceArea(measure.geometry);

    case "covers-body":
      return null;
  }
}


/* -------------------------------------------------------------------------- */
/* Conductivity                                                               */
/* -------------------------------------------------------------------------- */

/*
 * The largest double strictly below 1.
 *
 * This is what "<1.00" means once the value is a floating-point number, and
 * writing it lets "approaching perfection" and "perfect conductor" be two
 * ordinary rows of one table rather than a table plus a special case.
 */
const BELOW_ONE = 1 - Number.EPSILON / 2;


/**
 * Every conductivity band, as half-open intervals `(exclusiveMinimum, maximum]`.
 *
 * THE only table. A threshold written twice is a threshold that will be
 * changed once, so `describeItemConductivity()` and the validator below both
 * read this and neither restates a number from it.
 *
 * The first row's `exclusiveMinimum` is 0 rather than the authorable floor,
 * because the floor is a REFUSAL and not a band edge: `ITEM_CONDUCTIVITY_FLOOR`
 * is checked before the scan, so nothing below it ever reaches the first row,
 * and the row is then free to say what it means — everything up to 0.05.
 */
export const ITEM_CONDUCTIVITY_BANDS = [
  { band: "extremely poor", exclusiveMinimum: 0, maximum: 0.05 },
  { band: "poor", exclusiveMinimum: 0.05, maximum: 0.15 },
  { band: "ordinary", exclusiveMinimum: 0.15, maximum: 0.30 },
  { band: "good", exclusiveMinimum: 0.30, maximum: 0.50 },
  { band: "excellent", exclusiveMinimum: 0.50, maximum: 0.70 },
  { band: "exceptional", exclusiveMinimum: 0.70, maximum: 0.85 },
  { band: "near-perfect", exclusiveMinimum: 0.85, maximum: 0.95 },
  { band: "approaching perfection", exclusiveMinimum: 0.95, maximum: BELOW_ONE },
  { band: "perfect conductor", exclusiveMinimum: BELOW_ONE, maximum: 1 },
  { band: "legendary amplifier", exclusiveMinimum: 1, maximum: 1.10 },
  { band: "great legendary amplifier", exclusiveMinimum: 1.10, maximum: 1.25 },
  { band: "apex amplifier", exclusiveMinimum: 1.25, maximum: 1.50 },
] as const;

export type ItemConductivityBand = typeof ITEM_CONDUCTIVITY_BANDS[number]["band"];


/** The lowest describable conductivity. Below it is an authoring slip. */
export const ITEM_CONDUCTIVITY_FLOOR = 0.01;

/** The highest conductivity the table describes. Above it needs world authority. */
export const ITEM_CONDUCTIVITY_CEILING =
  ITEM_CONDUCTIVITY_BANDS[ITEM_CONDUCTIVITY_BANDS.length - 1]!.maximum;

/** At or below this, a conductivity is ordinary authored content. */
export const ITEM_ORDINARY_CONDUCTIVITY_MAXIMUM = 1;


/**
 * The band an authored conductivity falls in, or `null` when it falls outside
 * the banded range — below `ITEM_CONDUCTIVITY_FLOOR` or above
 * `ITEM_CONDUCTIVITY_CEILING`.
 *
 * Never rounds. A value a hair above a boundary belongs to the band above it,
 * because rounding here would quietly relabel authored content and the author
 * would have no way to find out.
 */
export function describeItemConductivity(
  kappa: number,
): ItemConductivityBand | null {
  if (!Number.isFinite(kappa) || kappa < ITEM_CONDUCTIVITY_FLOOR) return null;

  const row = ITEM_CONDUCTIVITY_BANDS.find(
    (entry) => kappa > entry.exclusiveMinimum && kappa <= entry.maximum,
  );

  return row?.band ?? null;
}


/* -------------------------------------------------------------------------- */
/* Authorization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Who may sign off a conductivity above ordinary authored content.
 *
 * exceptional — a registered exceptional source: a legendary smith's work, a
 *               named artefact, content a setting has already blessed.
 * world       — a world-level exceptional source. Strictly stronger, and the
 *               only authority that reaches past the top of the band table.
 */
export const ITEM_CONDUCTIVITY_AUTHORITIES = ["exceptional", "world"] as const;

export type ItemConductivityAuthority = typeof ITEM_CONDUCTIVITY_AUTHORITIES[number];


/**
 * A waiver for a conductivity ordinary content may not have.
 *
 * `ref` is the ordinary contribution provenance shape, so the source of a
 * waiver is identified exactly the way the source of a +2 is: there is one
 * answer in this engine to "which piece of content produced this", and a
 * second shape for waivers would be a second answer.
 */
export interface ItemConductivityAuthorization {
  readonly authority: ItemConductivityAuthority;

  /** The content that authorised it. */
  readonly ref: ContributionSourceRef;

  /** Why, in words a reviewer can weigh. Non-empty. */
  readonly reason: string;
}


/* -------------------------------------------------------------------------- */
/* The physics itself                                                         */
/* -------------------------------------------------------------------------- */

/**
 * An Item's boundary physics.
 *
 * Three facts about the object, and a fourth field that exists only when the
 * first three describe something ordinary content could not be.
 */
export interface ItemBoundaryPhysics {
  /** Whether the Item covers the body or extends away from it. */
  readonly mode: ItemBoundaryMode;

  /**
   * How readily the material carries what is put through it.
   *
   * Finite and strictly greater than zero, within
   * `[ITEM_CONDUCTIVITY_FLOOR, ...)`. See the band table above.
   */
  readonly conductivity: number;

  /** How much exposed outside there is, or whose body's outside it borrows. */
  readonly surface: ItemSurfaceMeasure;

  /**
   * Required when `conductivity` exceeds `ITEM_ORDINARY_CONDUCTIVITY_MAXIMUM`,
   * and refused when it does not. See this file's header, decision (3).
   */
  readonly conductivityAuthorization?: ItemConductivityAuthorization;
}


/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * Structured `EngineError`s, matching what every non-registration validator in
 * this domain returns — `findItemIntegrityIssues()`, `findItemFamilyIssues()`,
 * `findItemAttackContributionIssues()`. `validation.ts`'s own registration
 * vocabulary (`ItemDefinitionIssue`) wraps these under `malformed-rule`, the
 * same way it wraps integrity's and families', so a boundary fault reads the
 * same whether a registry or a resolver asked.
 *
 * EVERY problem at once, never the first. An author fixing a conductivity only
 * to be told next about a blank provenance is an author making three round
 * trips for one edit.
 */

function boundaryError(
  code: string,
  message: string,
  required: string,
  actual: unknown,
): EngineError {
  return {
    code: `equipment.boundary.${code}`,
    message,
    audience: "developer",
    required,
    actual: typeof actual === "string" ? actual : String(actual),
  };
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


/** A finite, strictly positive physical dimension. */
function isPositiveMetres(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}


/**
 * Everything wrong with one authored geometry, walked to the leaves.
 *
 * `path` names the part rather than the shape, because a composite's fault is
 * useless to an author who cannot tell which of five parts it is in.
 */
function findGeometryIssues(
  value: unknown,
  label: string,
  path: string,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [boundaryError(
      "surface.geometry.invalid",
      `${label}'s geometry at ${path} must be an authored shape object.`,
      "an ItemGeometry object",
      value,
    )];
  }

  const shape = value["shape"];

  if (
    typeof shape !== "string" ||
    !(ITEM_GEOMETRY_SHAPES as readonly string[]).includes(shape)
  ) {
    return [boundaryError(
      "surface.geometry.shape.invalid",
      `${label}'s geometry at ${path} must name one of: ${ITEM_GEOMETRY_SHAPES.join(", ")}.`,
      ITEM_GEOMETRY_SHAPES.join(" | "),
      shape,
    )];
  }

  const errors: EngineError[] = [];

  const requireDimensions = (names: readonly string[]) => {
    for (const name of names) {
      if (!isPositiveMetres(value[name])) {
        errors.push(boundaryError(
          "surface.geometry.dimension.invalid",
          `${label}'s geometry at ${path} must give a finite positive ${name}.`,
          "finite number > 0",
          value[name],
        ));
      }
    }
  };

  switch (shape as ItemGeometryShape) {
    case "box":
      requireDimensions(["lengthMetres", "widthMetres", "heightMetres"]);

      break;

    case "cylinder":
      requireDimensions(["radiusMetres", "heightMetres"]);

      /*
       * A real yes or no. `capped` decides whether two whole circles are part
       * of the exposed surface, and an omitted one read as `false` would
       * quietly shrink an author's cylinder rather than ask them.
       */
      if (typeof value["capped"] !== "boolean") {
        errors.push(boundaryError(
          "surface.geometry.capped.invalid",
          `${label}'s cylinder at ${path} must say whether its ends are capped.`,
          "true or false",
          value["capped"],
        ));
      }

      break;

    case "sphere":
      requireDimensions(["radiusMetres"]);

      break;

    case "plate":
      requireDimensions(["lengthMetres", "widthMetres", "thicknessMetres"]);

      break;

    case "composite": {
      const parts = value["parts"];

      if (!Array.isArray(parts) || parts.length === 0) {
        errors.push(boundaryError(
          "surface.geometry.composite.empty",
          `${label}'s composite geometry at ${path} must list at least one part.`,
          "a non-empty array of ItemGeometry",
          parts,
        ));

        break;
      }

      for (const [index, part] of (parts as readonly unknown[]).entries()) {
        errors.push(...findGeometryIssues(part, label, `${path}.parts[${index}]`));
      }

      break;
    }
  }

  return errors;
}


/** Every problem with the measure, INCLUDING whether the mode may use it. */
function findMeasureIssues(
  value: unknown,
  mode: unknown,
  label: string,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [boundaryError(
      "surface.missing",
      `${label} must carry a surface measure saying how much exposed outside it has.`,
      "an ItemSurfaceMeasure object",
      value,
    )];
  }

  const kind = value["kind"];

  if (
    typeof kind !== "string" ||
    !(ITEM_SURFACE_MEASURE_KINDS as readonly string[]).includes(kind)
  ) {
    return [boundaryError(
      "surface.kind.invalid",
      `${label}'s surface must be one of: ${ITEM_SURFACE_MEASURE_KINDS.join(", ")}.`,
      ITEM_SURFACE_MEASURE_KINDS.join(" | "),
      kind,
    )];
  }

  const errors: EngineError[] = [];

  /*
   * The mode↔measure rule, asked only once the mode is itself legal. An
   * unrecognised mode has already been reported, and adding "and it may not
   * use this measure" would be a second complaint about the first fault.
   */
  if (isItemBoundaryMode(mode)) {
    const permitted = ITEM_MEASURE_KINDS_BY_MODE[mode];

    if (!permitted.includes(kind as ItemSurfaceMeasureKind)) {
      errors.push(boundaryError(
        "surface.mode-mismatch",
        `${label} is an ${mode} and must measure its surface as ${permitted.join(" or ")}, not ${kind}.`,
        permitted.join(" | "),
        kind,
      ));
    }
  }

  switch (kind as ItemSurfaceMeasureKind) {
    case "stated": {
      const area = value["squareMetres"];

      if (typeof area !== "number" || !Number.isFinite(area) || area <= 0) {
        errors.push(boundaryError(
          "surface.area.invalid",
          `${label}'s stated surface must be a finite positive area in square metres.`,
          "finite number > 0",
          area,
        ));
      }

      break;
    }

    case "geometry":
      errors.push(...findGeometryIssues(value["geometry"], label, "surface.geometry"));

      break;

    case "covers-body": {
      const keys = value["continuityKeys"];

      if (!Array.isArray(keys) || keys.length === 0) {
        errors.push(boundaryError(
          "surface.continuity.empty",
          `${label} covers a body and must name at least one continuity it covers.`,
          "a non-empty array of continuity keys",
          keys,
        ));

        break;
      }

      const seen = new Set<string>();

      for (const key of keys as readonly unknown[]) {
        if (typeof key !== "string" || key.trim().length === 0) {
          errors.push(boundaryError(
            "surface.continuity.key.invalid",
            `${label}'s covered continuity must be named by a non-empty key.`,
            "non-empty string",
            key,
          ));

          continue;
        }

        if (seen.has(key)) {
          errors.push(boundaryError(
            "surface.continuity.key.duplicate",
            `${label} names covered continuity "${key}" more than once.`,
            "each continuity named once",
            key,
          ));

          continue;
        }

        seen.add(key);
      }

      break;
    }
  }

  const provenance = value["provenance"];

  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    errors.push(boundaryError(
      "surface.provenance.missing",
      `${label}'s surface must say where its figure came from, so a density ` +
      "can be audited rather than merely quoted.",
      "non-empty provenance",
      provenance === undefined ? "absent" : provenance,
    ));
  }

  return errors;
}


/**
 * Every problem with the conductivity and its authorization together.
 *
 * Together, because the two rules are one rule read from either end: what
 * `conductivity` is allowed to be depends on what signed for it, and whether
 * an authorization is allowed to be there depends on the conductivity.
 * Checking them separately is how a 0.8 with a world waiver passes both halves
 * and fails neither.
 */
function findConductivityIssues(
  value: unknown,
  authorization: unknown,
  label: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const kappa = typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

  if (kappa === undefined) {
    errors.push(boundaryError(
      "conductivity.invalid",
      `${label}'s conductivity must be a finite number greater than zero.`,
      "finite number > 0",
      value,
    ));
  } else if (kappa < ITEM_CONDUCTIVITY_FLOOR) {
    /*
     * See this file's header, decision (1). A positive value with no band is
     * refused rather than accepted as an unbanded trickle.
     */
    errors.push(boundaryError(
      "conductivity.unbanded",
      `${label}'s conductivity of ${kappa} falls below the lowest describable ` +
      `band (${ITEM_CONDUCTIVITY_FLOOR}), which is an authoring slip rather ` +
      "than a near-insulator.",
      `>= ${ITEM_CONDUCTIVITY_FLOOR}`,
      kappa,
    ));
  }

  /* -------------------------------------------------------------------- */
  /* What the authorization must be, before what it must permit           */
  /* -------------------------------------------------------------------- */

  let authority: ItemConductivityAuthority | undefined;

  if (authorization !== undefined) {
    if (!isRecord(authorization)) {
      errors.push(boundaryError(
        "conductivity.authorization.invalid",
        `${label}'s conductivity authorization must be an object naming an ` +
        "authority, a source and a reason.",
        "an ItemConductivityAuthorization object, or omit the field",
        authorization,
      ));
    } else {
      const declared = authorization["authority"];

      if (
        typeof declared !== "string" ||
        !(ITEM_CONDUCTIVITY_AUTHORITIES as readonly string[]).includes(declared)
      ) {
        errors.push(boundaryError(
          "conductivity.authorization.authority.invalid",
          `${label}'s conductivity authorization must name one of: ${ITEM_CONDUCTIVITY_AUTHORITIES.join(", ")}.`,
          ITEM_CONDUCTIVITY_AUTHORITIES.join(" | "),
          declared,
        ));
      } else {
        authority = declared as ItemConductivityAuthority;
      }

      const ref = authorization["ref"];

      if (
        !isRecord(ref) ||
        typeof ref["type"] !== "string" ||
        ref["type"].trim().length === 0 ||
        typeof ref["id"] !== "string" ||
        ref["id"].trim().length === 0
      ) {
        errors.push(boundaryError(
          "conductivity.authorization.ref.invalid",
          `${label}'s conductivity authorization must name the content that ` +
          "authorised it.",
          "a ContributionSourceRef with a non-empty type and id",
          ref,
        ));
      }

      const reason = authorization["reason"];

      if (typeof reason !== "string" || reason.trim().length === 0) {
        errors.push(boundaryError(
          "conductivity.authorization.reason.missing",
          `${label}'s conductivity authorization must say why, in words a ` +
          "reviewer can weigh.",
          "non-empty reason",
          reason === undefined ? "absent" : reason,
        ));
      }
    }
  }

  /* -------------------------------------------------------------------- */
  /* What the value needs, given what signed for it                       */
  /* -------------------------------------------------------------------- */

  /*
   * Asked only of a conductivity that is itself a legal number. "What
   * authority does NaN need" has no answer, and inventing one would report a
   * second fault an author cannot act on until the first is fixed.
   */
  if (kappa === undefined) return errors;

  if (kappa <= ITEM_ORDINARY_CONDUCTIVITY_MAXIMUM) {
    if (authorization !== undefined) {
      errors.push(boundaryError(
        "conductivity.authorization.not-permitted",
        `${label}'s conductivity of ${kappa} is ordinary authored content and ` +
        "must carry no authorization: a waiver for something that needs none " +
        "is a false provenance.",
        "no conductivityAuthorization at this conductivity",
        kappa,
      ));
    }

    return errors;
  }

  if (authorization === undefined) {
    errors.push(boundaryError(
      "conductivity.authorization.missing",
      `${label}'s conductivity of ${kappa} exceeds ${ITEM_ORDINARY_CONDUCTIVITY_MAXIMUM} ` +
      `and requires an authorization from one of: ${ITEM_CONDUCTIVITY_AUTHORITIES.join(", ")}.`,
      ITEM_CONDUCTIVITY_AUTHORITIES.join(" | "),
      "absent",
    ));

    return errors;
  }

  /*
   * Past the top of the band table, "exceptional" is no longer enough. There
   * is no band to describe such a value, so the authority IS the description,
   * and only a world-level one carries that weight. See decision (2).
   */
  if (kappa > ITEM_CONDUCTIVITY_CEILING && authority !== undefined && authority !== "world") {
    errors.push(boundaryError(
      "conductivity.authorization.authority.insufficient",
      `${label}'s conductivity of ${kappa} exceeds ${ITEM_CONDUCTIVITY_CEILING} ` +
      `and requires world authority, not "${authority}".`,
      "world",
      authority,
    ));
  }

  return errors;
}


/**
 * Everything wrong with one Item's boundary physics.
 *
 * Takes `unknown`, reads nothing before checking it and never throws, for the
 * reason every validator in this directory does: a host registers Items, and a
 * value reaching here may be anything at all.
 *
 * `label` is what the caller calls the thing, so one message reads
 * "Item \"steel-blade\"'s conductivity must be..." at registration and names
 * whatever a resolver was looking at everywhere else.
 */
export function findItemBoundaryPhysicsIssues(
  physics: unknown,
  label: string,
): readonly EngineError[] {
  if (!isRecord(physics)) {
    return [boundaryError(
      "invalid",
      `${label} must be an object naming a boundary mode, a conductivity and a surface.`,
      "an ItemBoundaryPhysics object",
      physics,
    )];
  }

  const mode = physics["mode"];
  const errors: EngineError[] = [];

  if (!isItemBoundaryMode(mode)) {
    errors.push(boundaryError(
      "mode.invalid",
      `${label} must declare a boundary mode of ${ITEM_BOUNDARY_MODES.join(" or ")}.`,
      ITEM_BOUNDARY_MODES.join(" | "),
      mode,
    ));
  }

  errors.push(...findConductivityIssues(
    physics["conductivity"],
    physics["conductivityAuthorization"],
    label,
  ));

  errors.push(...findMeasureIssues(physics["surface"], mode, label));

  return errors;
}


/** Whether a value is sound boundary physics. */
export function isItemBoundaryPhysics(
  value: unknown,
): value is ItemBoundaryPhysics {
  return findItemBoundaryPhysicsIssues(value, "boundary physics").length === 0;
}
