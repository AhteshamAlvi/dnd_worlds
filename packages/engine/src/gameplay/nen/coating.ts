/*
 * ONE coating boundary, whatever it is made of.
 *
 * A character holding Ken has a surface with Aura on it. Without Shū that
 * surface is their skin. With Shū it is their skin plus the sword in their
 * hand, minus the skin their gauntlet is covering — and the whole point is
 * that it is still ONE surface at ONE density, because the Aura did not
 * increase when the sword joined it. It spread.
 *
 *     Output after Shū = Output before Shū
 *
 * which is why a greatsword noticeably thins a coating and brass knuckles
 * barely do. That dilution is the cost of reach, stated as arithmetic instead
 * of as a penalty.
 *
 *
 * THE THREE KINDS OF SITE
 * -----------------------
 *
 *   uncovered body   skin with nothing over it
 *   overlay Item     armour, boots, fitted gloves. Its area IS the body area
 *                    it covers, so it adds nothing to the boundary — it moves
 *                    a piece of the boundary outward. Only the OUTERMOST
 *                    overlay over a given identity owns that area; layering
 *                    cannot duplicate it, because the second layer would be
 *                    claiming surface the first one already is.
 *   extension Item   weapons, shields, staffs. Genuinely new exposed area,
 *                    and the only thing that changes the total.
 *
 *     Acombined = AuncoveredBody + sum(Aoverlay) + sum(Aextension)
 *
 * and since every overlay's area equals the body it replaces, that reduces to
 * the whole body plus the extensions. Which is exactly how it is computed: the
 * body goes through `gameplay/aura` whole, and each overlay then TAKES the
 * Aura already resolved onto the identities it covers. Equal density in means
 * equal density out, so moving a share from skin to the plate over that skin
 * changes neither the density nor the total — it only changes which site a
 * consumer reads when something strikes there.
 *
 *
 * WHY THE PLACEMENT ITSELF IS NOT DONE HERE
 * -----------------------------------------
 *
 * `gameplay/aura` already owns equal-density expansion, present anatomy,
 * continuity identity and the differential authorization check. A second copy
 * of any of that living in a Nen file would be a second answer free to
 * disagree with the first. So this module composes — it decides what the
 * targets are and what each one measures — and hands the actual spreading
 * down.
 *
 *
 * GYŌ IS A SECOND PASS, NOT A SECOND RULE
 * ---------------------------------------
 *
 * The uniform remainder covers the complete boundary. The shifted share covers
 * the focus, at its own equal density, and is ADDED. Two passes rather than
 * one weighted pass, because that is what the mechanic says: `Ouniform` is
 * spread over everything and `Oshifted` is spread over the focus, and a site
 * inside the focus holds both.
 *
 *     sum over every site of (uniform + shifted) = Oactive
 *
 * Conductivity appears nowhere in this file. It changes how much a coating
 * ACCOMPLISHES on an Item, never how much of it is there — see `items.ts`.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";

import type { Anatomy } from "../../character/foundation/body/anatomy/types";
import type { ResolvedBodyMeasurements } from "../../character/foundation/body/measurements/types";
import type { AuraDifferentialAuthorization } from "../../character/foundation/aura/types";
import type { ItemBoundaryMode } from "../../character/equipment/physics";
import {
  GYO_BODY_SITE_PREFIX,
  GYO_ITEM_SITE_PREFIX,
} from "../../character/foundation/nen/principles/gyo";

import {
  resolveAuraPlacement,
  type AuraPlacementTarget,
} from "../aura";


/* The tolerance conservation is asserted to. The Aura domain's own. */
const CONSERVATION_TOLERANCE = 1e-9;


/** One Item on the boundary, as this layer needs it. */
export interface CoatingItem {
  /** The stable inventory entry id. Never an index. */
  readonly entryId: string;

  readonly mode: ItemBoundaryMode;

  /**
   * Its exposed area in square metres.
   *
   * For an EXTENSION, resolved from its authored measure or geometry. For an
   * OVERLAY this field is ignored — an overlay's area is the body it covers,
   * resolved from the measurements rather than restated, so the two can never
   * disagree.
   */
  readonly surfaceAreaSquareMetres?: number;

  /** Overlay only: the continuity identities it authoritatively covers. */
  readonly coveredContinuityKeys?: readonly string[];

  /**
   * How far out this Item sits, from the Shū contact network.
   *
   * Used for exactly one thing: deciding which of two overlays over the same
   * identity is the outer one. Greater depth is further from the body.
   */
  readonly depth: number;
}


export interface CoatingFocus {
  /** Namespaced sites, as the Gyō adapter stores them. */
  readonly sites: readonly string[];

  /** Oshifted. The uniform pass places the rest. */
  readonly shiftedOutput: number;

  /** Gyō's grant to place unevenly, bound as every such grant is. */
  readonly authorization: AuraDifferentialAuthorization;
}


export interface CoatingBoundaryRequest {
  readonly requestId: string;
  readonly owner: string;
  readonly source: string;

  /** Oactive — everything the principle is holding. */
  readonly activeOutput: number;

  readonly anatomy: Anatomy;
  readonly measurements: ResolvedBodyMeasurements;
  readonly availableOutput: number;

  /** Empty without Shū, which is an ordinary case and not a degenerate one. */
  readonly items: readonly CoatingItem[];

  /** Absent for Ken. Present for Gyō. */
  readonly focus?: CoatingFocus;
}


/** One place on the boundary, and what is on it. */
export interface CoatingSite {
  /** `body:<continuityKey>` or `item:<entryId>`. */
  readonly siteId: string;

  readonly kind: "body" | "overlay" | "extension";

  /** Present for a body site, and for the identities an overlay took over. */
  readonly continuityKeys: readonly string[];

  /** Present for an Item site. */
  readonly entryId?: string;

  readonly surfaceAreaSquareMetres: number;

  /** What the uniform remainder put here. */
  readonly uniformAura: number;

  /** What the Gyō shift added. Zero outside the focus, and for Ken. */
  readonly shiftedAura: number;

  readonly aura: number;

  /** Aura per square metre. Equal across every site outside the focus. */
  readonly density: number;

  readonly inFocus: boolean;
}


export interface ResolvedCoatingBoundary {
  readonly sites: readonly CoatingSite[];

  /** Acombined. */
  readonly surfaceAreaSquareMetres: number;

  /** The density outside the focus — one number, by construction. */
  readonly uniformDensity: number;

  /** The total placed. Equals `activeOutput`. */
  readonly placedAura: number;
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


function itemTarget(
  entryId: string,
  area: number,
  provenance: string,
): AuraPlacementTarget {
  return {
    target: { kind: "object", objectId: entryId },
    channel: {
      kind: "item-surface",
      measure: {
        unit: "square-metre",
        amount: area,
        derivation: "host",
        provenance,
      },
    },
  };
}


/*
 * Which overlay, if any, owns each covered identity.
 *
 * The outermost wins — greater contact depth is further from the body — and a
 * tie is broken by entry id so that two hosts holding the same equipment in
 * different orders resolve the same boundary. A tie is genuinely ambiguous
 * content rather than a situation with a right answer, so the rule is chosen
 * for determinism rather than for meaning.
 */
function outermostOverlays(
  items: readonly CoatingItem[],
): ReadonlyMap<string, string> {
  const owner = new Map<string, string>();
  const depth = new Map<string, number>();

  for (const item of items) {
    if (item.mode !== "overlay") continue;

    for (const key of item.coveredContinuityKeys ?? []) {
      const held = owner.get(key);

      if (held !== undefined) {
        const heldDepth = depth.get(key)!;

        if (
          heldDepth > item.depth ||
          (heldDepth === item.depth && held.localeCompare(item.entryId) < 0)
        ) {
          continue;
        }
      }

      owner.set(key, item.entryId);
      depth.set(key, item.depth);
    }
  }

  return owner;
}


function findRequestIssues(
  request: CoatingBoundaryRequest,
): readonly EngineError[] {
  if (request === null || typeof request !== "object") {
    return [{
      code: "nen.coating.request.malformed",
      message: "A coating boundary needs a request object.",
      audience: "developer",
      required: "CoatingBoundaryRequest",
      actual: describeDiagnosticValue(request),
    }];
  }

  const errors: EngineError[] = [];

  if (
    typeof request.activeOutput !== "number" ||
    !Number.isFinite(request.activeOutput) || request.activeOutput < 0
  ) {
    errors.push({
      code: "nen.coating.output.invalid",
      message: "A coating places a finite non-negative Output.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(request.activeOutput),
    });
  }

  const seen = new Set<string>();

  for (const item of request.items ?? []) {
    if (
      item === null || typeof item !== "object" ||
      typeof item.entryId !== "string" || item.entryId.trim().length === 0
    ) {
      errors.push({
        code: "nen.coating.item.malformed",
        message: "Every Item on the boundary must name its inventory entry.",
        audience: "developer",
        required: "CoatingItem",
        actual: describeDiagnosticValue(item),
      });

      continue;
    }

    if (seen.has(item.entryId)) {
      errors.push({
        code: "nen.coating.item.duplicate",
        message: `"${item.entryId}" appears on the boundary twice.`,
        audience: "developer",
        required: "distinct entry ids",
        actual: item.entryId,
      });
    }

    seen.add(item.entryId);

    if (item.mode === "extension") {
      const area = item.surfaceAreaSquareMetres;

      /*
       * Refused, never defaulted. An extension with no measure is an Item
       * nobody has measured, and a plausible-looking number here would be
       * quoted downstream as though somebody had.
       */
      if (typeof area !== "number" || !Number.isFinite(area) || area <= 0) {
        errors.push({
          code: "nen.coating.item.measure.missing",
          message:
            `"${item.entryId}" extends the boundary but has no resolved ` +
            "surface area, and one is never inferred.",
          audience: "developer",
          required: "finite number > 0",
          actual: describeDiagnosticValue(area),
        });
      }

      continue;
    }

    if (item.mode !== "overlay") {
      errors.push({
        code: "nen.coating.item.mode.invalid",
        message: `"${item.entryId}" must be an overlay or an extension.`,
        audience: "developer",
        required: "overlay | extension",
        actual: describeDiagnosticValue(item.mode),
      });

      continue;
    }

    if (
      !Array.isArray(item.coveredContinuityKeys) ||
      item.coveredContinuityKeys.length === 0
    ) {
      errors.push({
        code: "nen.coating.item.measure.missing",
        message:
          `"${item.entryId}" covers the body, so it must say which ` +
          "identities it covers; its area is theirs.",
        audience: "developer",
        required: "one or more continuity identities",
        actual: describeDiagnosticValue(item.coveredContinuityKeys),
      });
    }
  }

  return errors;
}


/**
 * Resolve the whole coating boundary and what sits on every part of it.
 *
 * Two placements through `gameplay/aura` — the uniform remainder over
 * everything, then the Gyō shift over the focus — and one reassignment, which
 * moves each covered identity's share onto the overlay covering it without
 * changing the density or the total.
 */
export function resolveCoatingBoundary(
  request: CoatingBoundaryRequest,
): EngineResult<ResolvedCoatingBoundary> {
  const root = createTraceNode({
    id: "nen.coating.boundary",
    label: "Resolve one coating boundary over body and Items",
    formula:
      "Acombined = AuncoveredBody + sum(Aoverlay) + sum(Aextension); " +
      "uniform density = Ouniform / Acombined",
    inputs: {
      activeOutput: { value: describeDiagnosticValue(request?.activeOutput) },
      items: { value: describeDiagnosticValue(request?.items?.length) },
      focus: { value: describeDiagnosticValue(request?.focus?.sites?.length) },
    },
  });

  const structural = findRequestIssues(request);

  if (structural.length > 0) return refuse(root, structural);

  const shifted = request.focus?.shiftedOutput ?? 0;

  if (
    typeof shifted !== "number" || !Number.isFinite(shifted) || shifted < 0 ||
    shifted > request.activeOutput
  ) {
    return refuse(root, [{
      code: "nen.coating.focus.shift.invalid",
      message:
        "The shifted share of a Gyō must be a finite amount no larger than " +
        "the Output being held.",
      audience: "developer",
      required: `finite number in [0, ${request.activeOutput}]`,
      actual: describeDiagnosticValue(shifted),
    }]);
  }

  /*
   * Exact conservation, by construction rather than by two multiplications
   * that happen to agree. The ticket asks for `Ouniform + Oshifted` to equal
   * `Oactive` exactly, and `Oactive * (1 - shift)` does not reliably do that
   * in binary floating point — subtracting the shifted amount always does.
   */
  const uniform = request.activeOutput - shifted;

  const extensions = request.items.filter((one) => one.mode === "extension");
  const overlays = request.items.filter((one) => one.mode === "overlay");
  const overlayOwner = outermostOverlays(request.items);

  /* ── 1. The uniform remainder, over the complete boundary ──────────── */

  const uniformTargets: AuraPlacementTarget[] = [
    { target: { kind: "self" }, channel: { kind: "uniform-body-surface" } },
    ...extensions.map((one) =>
      itemTarget(
        one.entryId,
        one.surfaceAreaSquareMetres!,
        `equipment:${one.entryId}`,
      )
    ),
  ];

  const placed = resolveAuraPlacement(
    {
      requestId: `${request.requestId}:uniform`,
      owner: request.owner,
      source: request.source,
      aura: uniform,
      targets: uniformTargets as NonEmptyArray<AuraPlacementTarget>,
    },
    {
      anatomy: request.anatomy,
      measurements: request.measurements,
      availableOutput: request.availableOutput,
    },
  );

  root.children.push(placed.trace.root);

  if (!placed.success) return refuse(root, placed.errors);

  /* ── 2. Move each covered identity onto the overlay covering it ────── */

  const bodySites = new Map<string, { area: number; aura: number }>();
  const itemSites = new Map<string, { area: number; aura: number }>();

  for (const site of placed.payload.sites) {
    if (site.channel === "item-surface") {
      const entryId = String(
        (site.target as { readonly objectId?: unknown }).objectId,
      );

      itemSites.set(entryId, { area: site.measure.amount, aura: site.aura });

      continue;
    }

    const key = String(site.continuityKey);
    const target = overlayOwner.get(key);
    const bucket = target === undefined
      ? bodySites
      : itemSites;
    const id = target ?? key;
    const held = bucket.get(id) ?? { area: 0, aura: 0 };

    bucket.set(id, {
      area: held.area + site.measure.amount,
      aura: held.aura + site.aura,
    });
  }

  /*
   * An overlay covering nothing the body actually has is not an error — a
   * character can be wearing a gauntlet on an arm they have lost — but it owns
   * no area and therefore holds no coating.
   */
  for (const overlay of overlays) {
    if (itemSites.has(overlay.entryId)) continue;

    itemSites.set(overlay.entryId, { area: 0, aura: 0 });
  }

  const coveredKeys = new Map<string, string[]>();

  for (const [key, entryId] of overlayOwner) {
    coveredKeys.set(entryId, [...(coveredKeys.get(entryId) ?? []), key]);
  }

  /* ── 3. The Gyō shift, over the focus alone ────────────────────────── */

  const focusSites = new Set(request.focus?.sites ?? []);
  const shiftedBySite = new Map<string, number>();

  if (request.focus !== undefined && shifted > 0) {
    const focusBodyKeys = [...bodySites.keys()].filter((key) =>
      focusSites.has(`${GYO_BODY_SITE_PREFIX}${key}`)
    );

    const focusItemIds = [...itemSites.keys()].filter((entryId) =>
      focusSites.has(`${GYO_ITEM_SITE_PREFIX}${entryId}`)
    );

    if (focusBodyKeys.length === 0 && focusItemIds.length === 0) {
      return refuse(root, [{
        code: "nen.coating.focus.absent",
        message:
          "The Gyō focus names nothing that is on this boundary any more.",
        audience: "player",
        required: "at least one focus site present on the boundary",
        actual: [...focusSites].join(", "),
      }]);
    }

    const focusTargets: AuraPlacementTarget[] = [
      ...(focusBodyKeys.length === 0 ? [] : [{
        target: { kind: "self" } as const,
        channel: {
          kind: "differential-surface" as const,

          /*
           * Weighted BY AREA, which is what makes the focus one density.
           *
           * A differential allocation shares out by stated weight, so equal
           * weights would give a hand and an arm the same AURA — and the hand
           * is a third the area, so it would end at three times the density.
           * That is a Ryū-shaped answer to a Gyō-shaped question: every site
           * in a Gyō focus holds the same density, and weighting by area is
           * how that is said in the vocabulary differential placement has.
           */
          weights: focusBodyKeys.map((key) => ({
            continuityKey: key as never,
            weight: bodySites.get(key)!.area,
          })),
          authorization: request.focus.authorization,
        },
      }]),
      ...focusItemIds.map((entryId) =>
        itemTarget(
          entryId,
          itemSites.get(entryId)!.area,
          `equipment:${entryId}`,
        )
      ),
    ];

    const shiftPlaced = resolveAuraPlacement(
      {
        requestId: `${request.requestId}:focus`,
        owner: request.owner,
        source: request.source,
        aura: shifted,
        targets: focusTargets as NonEmptyArray<AuraPlacementTarget>,
      },
      {
        anatomy: request.anatomy,
        measurements: request.measurements,
        availableOutput: request.availableOutput,
      },
    );

    root.children.push(shiftPlaced.trace.root);

    if (!shiftPlaced.success) return refuse(root, shiftPlaced.errors);

    for (const site of shiftPlaced.payload.sites) {
      const id = site.channel === "item-surface"
        ? `${GYO_ITEM_SITE_PREFIX}${
          String((site.target as { readonly objectId?: unknown }).objectId)
        }`
        : `${GYO_BODY_SITE_PREFIX}${String(site.continuityKey)}`;

      shiftedBySite.set(id, (shiftedBySite.get(id) ?? 0) + site.aura);
    }
  }

  /* ── 4. One flat boundary ──────────────────────────────────────────── */

  const sites: CoatingSite[] = [];

  for (const [key, held] of [...bodySites].sort()) {
    const siteId = `${GYO_BODY_SITE_PREFIX}${key}`;
    const shiftedAura = shiftedBySite.get(siteId) ?? 0;

    sites.push({
      siteId,
      kind: "body",
      continuityKeys: [key],
      surfaceAreaSquareMetres: held.area,
      uniformAura: held.aura,
      shiftedAura,
      aura: held.aura + shiftedAura,
      density: held.area > 0 ? (held.aura + shiftedAura) / held.area : 0,
      inFocus: focusSites.has(siteId),
    });
  }

  for (const [entryId, held] of [...itemSites].sort()) {
    const siteId = `${GYO_ITEM_SITE_PREFIX}${entryId}`;
    const shiftedAura = shiftedBySite.get(siteId) ?? 0;
    const overlay = overlays.some((one) => one.entryId === entryId);

    sites.push({
      siteId,
      kind: overlay ? "overlay" : "extension",
      continuityKeys: coveredKeys.get(entryId) ?? [],
      entryId,
      surfaceAreaSquareMetres: held.area,
      uniformAura: held.aura,
      shiftedAura,
      aura: held.aura + shiftedAura,
      density: held.area > 0 ? (held.aura + shiftedAura) / held.area : 0,
      inFocus: focusSites.has(siteId),
    });
  }

  const area = sites.reduce(
    (sum, one) => sum + one.surfaceAreaSquareMetres,
    0,
  );
  const placedAura = sites.reduce((sum, one) => sum + one.aura, 0);

  /*
   * Conservation, asserted rather than assumed. Every step above is a share of
   * something, and a share that stopped adding up would show as a coating that
   * quietly held less Aura than the character is paying to hold.
   */
  if (
    Math.abs(placedAura - request.activeOutput) >
      CONSERVATION_TOLERANCE * Math.max(1, request.activeOutput)
  ) {
    return refuse(root, [{
      code: "nen.coating.conservation.violated",
      message:
        "The coating placed a different amount of Aura than the principle is " +
        "holding.",
      audience: "developer",
      required: request.activeOutput,
      actual: placedAura,
    }]);
  }

  root.output = {
    sites: sites.length,
    area,
    placedAura,
  };

  return {
    success: true,
    payload: {
      sites,
      surfaceAreaSquareMetres: area,
      uniformDensity: area > 0 ? uniform / area : 0,
      placedAura,
    },
    trace: { root },
    warnings: [],
  };
}


/**
 * The coating on one site, for an attack or defence consumer.
 *
 * ONE site, and no chain. The attacking Body Part's own coating, or the struck
 * one's — no parent, no adjacent part, no internal reserve, and nothing summed
 * up a limb. The coating is not consumed by being used, so reading it twice
 * returns the same number both times.
 */
export function coatingAt(
  boundary: ResolvedCoatingBoundary,
  siteId: string,
): CoatingSite | undefined {
  return boundary.sites.find((one) => one.siteId === siteId);
}
