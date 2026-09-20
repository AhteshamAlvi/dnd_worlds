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

import type { Anatomy, BodyPartId } from "../../character/foundation/body/anatomy/types";
import type { ResolvedSensoryFootprints } from "../../character/foundation/body/critical-points/footprints";
import type { CriticalPointId } from "../../character/foundation/body/critical-points/types";
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


/** The namespace a Sensory Anatomical Point carries as a coating site. */
export const COATING_POINT_SITE_PREFIX = "point:";


export interface ReinforcementCoatingFocus {
  readonly kind: "reinforcement";

  /** Namespaced sites, as the Gyō adapter stores them. */
  readonly sites: readonly string[];

  /** Oshifted. The uniform pass places the rest. */
  readonly shiftedOutput: number;

  /** Gyō's grant to place unevenly, bound as every such grant is. */
  readonly authorization: AuraDifferentialAuthorization;
}


export interface SensoryCoatingFocus {
  readonly kind: "sensory";

  /** The Anatomical Points selected, already validated as one group. */
  readonly pointIds: readonly CriticalPointId[];

  /** Oshifted. The uniform pass places the rest. */
  readonly shiftedOutput: number;

  /**
   * The same grant a reinforcement focus needs, and required for the same
   * reason: this is an uneven placement of a character's own Aura, and Aura
   * refuses one without a grant regardless of what the unevenness is FOR.
   */
  readonly authorization: AuraDifferentialAuthorization;
}


export type CoatingFocus = ReinforcementCoatingFocus | SensoryCoatingFocus;


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

  /**
   * How the body's surface is partitioned into sense organs and remainder.
   *
   * Absent for a body with no Sensory anatomy, which is an ordinary case.
   * Present, it SUBDIVIDES body sites rather than adding to them: a Hand
   * becomes a Palm site and a Hand-remainder site whose areas sum to exactly
   * what the Hand had. The coating gets finer, never larger.
   */
  readonly sensoryFootprints?: ResolvedSensoryFootprints;

  /** Absent for Ken. Present for Gyō. */
  readonly focus?: CoatingFocus;
}


/** One place on the boundary, and what is on it. */
export interface CoatingSite {
  /** `body:<continuityKey>`, `item:<entryId>` or `point:<pointId>`. */
  readonly siteId: string;

  readonly kind: "body" | "overlay" | "extension" | "sensory-point";

  /** Present for a body site, and for the identities an overlay took over. */
  readonly continuityKeys: readonly string[];

  /** Present for an Item site. */
  readonly entryId?: string;

  /** Present for a Sensory point site. */
  readonly pointId?: CriticalPointId;

  /** For a point site, the body site its area was carved out of. */
  readonly hostSiteId?: string;

  readonly surfaceAreaSquareMetres: number;

  /** What the uniform remainder put here. */
  readonly uniformAura: number;

  /** What the Gyō shift added. Zero outside the focus, and for Ken. */
  readonly shiftedAura: number;

  /**
   * What the shifted share is FOR, when there is one.
   *
   * The distinction a defence consumer has to respect: a reinforcement shift
   * armours the site it is on, and a SENSORY shift does not. Aura piled into
   * an eye to see with is not a thicker eye — see protectiveAuraOn().
   */
  readonly shiftKind?: "reinforcement" | "sensory";

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
      focusKind: { value: describeDiagnosticValue(request?.focus?.kind) },
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

  /* ── 2b. Carve each Sensory point out of the body site hosting it ── */

  const pointSites = new Map<CriticalPointId, {
    area: number;
    aura: number;
    hostKey: string;
  }>();

  if (request.sensoryFootprints !== undefined) {
    /*
     * Points are hosted by BodyParts and coating sites are keyed by continuity
     * identity, so the two have to be joined through the anatomy that knows
     * both. Built here rather than carried on the request, because it is
     * derivable and a supplied copy could disagree with the anatomy the rest
     * of this function is reading.
     */
    const keyByPartId = new Map<BodyPartId, string>();

    for (const part of request.anatomy.parts) {
      keyByPartId.set(part.id, String(part.continuityKey));
    }

    const carved = new Map<string, { pointId: CriticalPointId; area: number }[]>();

    for (const host of request.sensoryFootprints.hosts) {
      const key = keyByPartId.get(host.hostPartId);

      /*
       * A point whose host identity is not a body site any more is skipped.
       * The ordinary cause is an overlay: a gauntlet covering a Hand has taken
       * that identity's area onto itself, so the Palm inside it is not exposed
       * surface and cannot be coated separately. Carving it anyway would
       * create a site holding area the gauntlet already owns.
       */
      if (key === undefined || !bodySites.has(key)) continue;

      const held = carved.get(key) ?? [];

      for (const point of host.points) {
        held.push({ pointId: point.pointId, area: point.squareMetres });
      }

      carved.set(key, held);
    }

    for (const [key, points] of carved) {
      const site = bodySites.get(key)!;
      const claimed = points.reduce((sum, one) => sum + one.area, 0);

      if (claimed <= 0 || site.area <= 0) continue;

      if (claimed > site.area * (1 + CONSERVATION_TOLERANCE)) {
        return refuse(root, [{
          code: "nen.coating.point.overcommitted",
          message:
            `The Sensory points on "${key}" claim more surface than the ` +
            "coating has there.",
          audience: "developer",
          required: String(site.area),
          actual: String(claimed),
        }]);
      }

      /*
       * The host site holds ONE density, so splitting its area splits its Aura
       * in exactly the same proportion. That is what makes subdivision free:
       * nothing is redistributed, the same coating is simply described in more
       * places.
       */
      const density = site.aura / site.area;

      let takenArea = 0;
      let takenAura = 0;

      for (const point of points) {
        const aura = density * point.area;

        pointSites.set(point.pointId, {
          area: point.area,
          aura,
          hostKey: key,
        });

        takenArea += point.area;
        takenAura += aura;
      }

      /*
       * Subtracted, never recomputed — see the uniform/shifted split above.
       * Clamped at zero because a host whose points claim ALL of it, which is
       * what a `host-remainder` tactile surface does, can land a hair negative
       * on a float and there is no such thing as negative skin.
       */
      bodySites.set(key, {
        area: Math.max(0, site.area - takenArea),
        aura: Math.max(0, site.aura - takenAura),
      });
    }
  }

  /*
   * What each body IDENTITY holds in total, organs included.
   *
   * A reinforcement Gyō names a body identity — a hand, an arm — and it
   * reinforces the whole of it. Subdivision split that identity into a
   * remainder site and a set of organ sites, so the focus has to be weighted
   * by what the identity actually has rather than by what is left of it after
   * the organs took their share.
   *
   * Without this a Human could not raise a reinforcement Gyō at all: a
   * tactile surface claims its host's entire remainder, so every body site is
   * a zero-area shell and a differential placement weighted by those weights
   * totals zero.
   */
  const identityTotals = new Map<string, number>();

  for (const [key, held] of bodySites) {
    identityTotals.set(key, held.area);
  }

  for (const held of pointSites.values()) {
    identityTotals.set(
      held.hostKey,
      (identityTotals.get(held.hostKey) ?? 0) + held.area,
    );
  }

  /* ── 3. The Gyō shift, over the focus alone ────────────────────────── */

  const focus = request.focus;
  const focusSites = new Set(
    focus !== undefined && focus.kind === "reinforcement" ? focus.sites : [],
  );
  const focusPointIds = new Set<CriticalPointId>(
    focus !== undefined && focus.kind === "sensory" ? focus.pointIds : [],
  );

  /*
   * Two maps rather than one, because what a shift is FOR travels with it.
   * A reinforcement share armours the site it lands on; a sensory share does
   * not, and a consumer reading a single total could not tell them apart.
   */
  const reinforcedBySite = new Map<string, number>();
  const sensoryBySite = new Map<string, number>();
  const shiftedBySite = sensoryBySite;

  if (focus !== undefined && focus.kind === "sensory" && shifted > 0) {
    /*
     * The sensory shift, at ONE density over the selected organs:
     *
     *     shiftedDensity  = shiftedOutput / selectedPointArea
     *     pointShiftedAura = shiftedDensity * pointArea
     *
     * Placed through the same differential channel every uneven placement uses
     * — so the grant is checked exactly as it is for a reinforcement focus —
     * weighted by each HOST's share of the selected point area. That gives
     * each host the right total, and the split below puts it on the organs
     * rather than on the skin around them.
     */
    const selected = [...focusPointIds]
      .map((pointId) => ({ pointId, site: pointSites.get(pointId) }))
      .filter((one) => one.site !== undefined && one.site.area > 0) as {
        pointId: CriticalPointId;
        site: { area: number; aura: number; hostKey: string };
      }[];

    if (selected.length === 0) {
      return refuse(root, [{
        code: "nen.coating.focus.absent",
        message:
          "The sensory Gyō focus names no organ that is on this boundary any more.",
        audience: "player",
        required: "at least one selected Sensory point present on the boundary",
        actual: [...focusPointIds].join(", "),
      }]);
    }

    const byHost = new Map<string, number>();

    for (const one of selected) {
      byHost.set(
        one.site.hostKey,
        (byHost.get(one.site.hostKey) ?? 0) + one.site.area,
      );
    }

    const hostKeys = [...byHost.keys()].sort();

    const shiftPlaced = resolveAuraPlacement(
      {
        /*
         * The same request suffix a reinforcement focus uses, because only one
         * of the two ever runs for a given boundary and the GRANT is the same
         * grant either way: "this Gyō may place unevenly". Making a caller
         * build a different authorization id per focus kind would be asking
         * them to know which branch the engine took.
         */
        requestId: `${request.requestId}:focus`,
        owner: request.owner,
        source: request.source,
        aura: shifted,
        targets: [{
          target: { kind: "self" } as const,
          channel: {
            kind: "differential-surface" as const,
            weights: hostKeys.map((key) => ({
              continuityKey: key as never,
              weight: byHost.get(key)!,
            })),
            authorization: focus.authorization,
          },
        }] as NonEmptyArray<AuraPlacementTarget>,
      },
      {
        anatomy: request.anatomy,
        measurements: request.measurements,
        availableOutput: request.availableOutput,
      },
    );

    root.children.push(shiftPlaced.trace.root);

    if (!shiftPlaced.success) return refuse(root, shiftPlaced.errors);

    const auraByHost = new Map<string, number>();

    for (const site of shiftPlaced.payload.sites) {
      const key = String(site.continuityKey);

      auraByHost.set(key, (auraByHost.get(key) ?? 0) + site.aura);
    }

    /*
     * Each host's share split across its own selected organs by area, with the
     * last one taking the residual so the parts add back to exactly what the
     * host was given. Two independent multiplications would leave a sliver
     * unplaced, which the conservation assertion at the end would then report
     * as a coating holding less than the character is paying for.
     */
    for (const hostKey of hostKeys) {
      const organs = selected
        .filter((one) => one.site.hostKey === hostKey)
        .sort((left, right) => left.pointId.localeCompare(right.pointId));

      const hostArea = byHost.get(hostKey)!;
      const hostAura = auraByHost.get(hostKey) ?? 0;

      let placed = 0;

      organs.forEach((organ, index) => {
        const aura = index === organs.length - 1
          ? hostAura - placed
          : hostAura * (organ.site.area / hostArea);

        placed += aura;
        shiftedBySite.set(
          `${COATING_POINT_SITE_PREFIX}${organ.pointId}`,
          aura,
        );
      });
    }
  }

  if (focus !== undefined && focus.kind === "reinforcement" && shifted > 0) {
    const focusBodyKeys = [...identityTotals.keys()].filter((key) =>
      focusSites.has(`${GYO_BODY_SITE_PREFIX}${key}`) &&
      (identityTotals.get(key) ?? 0) > 0
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
            weight: identityTotals.get(key)!,
          })),
          authorization: focus.authorization,
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
      if (site.channel === "item-surface") {
        const id = `${GYO_ITEM_SITE_PREFIX}${
          String((site.target as { readonly objectId?: unknown }).objectId)
        }`;

        reinforcedBySite.set(id, (reinforcedBySite.get(id) ?? 0) + site.aura);

        continue;
      }

      /*
       * The identity's share, spread back across the remainder and the organs
       * it was subdivided into — by area, so the reinforced hand holds one
       * density exactly as it did before anybody carved a palm out of it.
       *
       * The last share takes the residual, so the parts add back to exactly
       * what the identity was given rather than to a float near it.
       */
      const key = String(site.continuityKey);
      const remainder = bodySites.get(key);

      const targets: { readonly id: string; readonly area: number }[] = [
        ...(remainder === undefined || remainder.area <= 0
          ? []
          : [{ id: `${GYO_BODY_SITE_PREFIX}${key}`, area: remainder.area }]),
        ...[...pointSites]
          .filter(([, held]) => held.hostKey === key && held.area > 0)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([pointId, held]) => ({
            id: `${COATING_POINT_SITE_PREFIX}${pointId}`,
            area: held.area,
          })),
      ];

      const total = targets.reduce((sum, one) => sum + one.area, 0);

      if (total <= 0) continue;

      let placedHere = 0;

      targets.forEach((target, index) => {
        const aura = index === targets.length - 1
          ? site.aura - placedHere
          : site.aura * (target.area / total);

        placedHere += aura;
        reinforcedBySite.set(
          target.id,
          (reinforcedBySite.get(target.id) ?? 0) + aura,
        );
      });
    }
  }

  /* ── 4. One flat boundary ──────────────────────────────────────────── */

  const sites: CoatingSite[] = [];

  /** The shift on one site, and what it was for. */
  const shiftOn = (siteId: string) => {
    const reinforcement = reinforcedBySite.get(siteId) ?? 0;
    const sensory = sensoryBySite.get(siteId) ?? 0;

    return {
      shiftedAura: reinforcement + sensory,

      /*
       * One kind per site, because the two passes are alternatives: a focus
       * is reinforcement or sensory, never both, so no site can receive from
       * each. Reported only when there is a shift at all.
       */
      ...(sensory > 0
        ? { shiftKind: "sensory" as const }
        : reinforcement > 0
          ? { shiftKind: "reinforcement" as const }
          : {}),
    };
  };

  for (const [key, held] of [...bodySites].sort()) {
    const siteId = `${GYO_BODY_SITE_PREFIX}${key}`;
    const { shiftedAura, ...shiftKind } = shiftOn(siteId);

    sites.push({
      siteId,
      kind: "body",
      continuityKeys: [key],
      surfaceAreaSquareMetres: held.area,
      uniformAura: held.aura,
      shiftedAura,
      ...shiftKind,
      aura: held.aura + shiftedAura,
      density: held.area > 0 ? (held.aura + shiftedAura) / held.area : 0,
      inFocus: focusSites.has(siteId),
    });
  }

  for (const [pointId, held] of [...pointSites].sort()) {
    const siteId = `${COATING_POINT_SITE_PREFIX}${pointId}`;
    const { shiftedAura, ...shiftKind } = shiftOn(siteId);

    sites.push({
      siteId,
      kind: "sensory-point",
      continuityKeys: [held.hostKey],
      pointId,
      hostSiteId: `${GYO_BODY_SITE_PREFIX}${held.hostKey}`,
      surfaceAreaSquareMetres: held.area,
      uniformAura: held.aura,
      shiftedAura,
      ...shiftKind,
      aura: held.aura + shiftedAura,
      density: held.area > 0 ? (held.aura + shiftedAura) / held.area : 0,
      inFocus: focusPointIds.has(pointId),
    });
  }

  for (const [entryId, held] of [...itemSites].sort()) {
    const siteId = `${GYO_ITEM_SITE_PREFIX}${entryId}`;
    const { shiftedAura, ...shiftKind } = shiftOn(siteId);
    const overlay = overlays.some((one) => one.entryId === entryId);

    sites.push({
      siteId,
      kind: overlay ? "overlay" : "extension",
      continuityKeys: coveredKeys.get(entryId) ?? [],
      entryId,
      surfaceAreaSquareMetres: held.area,
      uniformAura: held.aura,
      shiftedAura,
      ...shiftKind,
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


/**
 * The Aura on one site that actually DEFENDS it.
 *
 * Uniform coating always does. A reinforcement shift does. A SENSORY shift
 * does not: Aura concentrated into an eye is there to see with, and counting
 * it as armour would make sharpening a sense a way to harden it — which would
 * turn Sensory Gyō into a strictly better Gyō, since it would buy the
 * reinforcement anyway and the perception bonus on top.
 *
 * The uniform share on a sense organ still protects it normally. Only the
 * shifted share is set aside.
 */
export function protectiveAuraOn(site: CoatingSite): number {
  return site.shiftKind === "sensory"
    ? site.uniformAura
    : site.uniformAura + site.shiftedAura;
}


/**
 * The Aura on one site that is doing SENSORY work.
 *
 * The exact complement of protectiveAuraOn(). A REINFORCEMENT shift that
 * happened to land on a sense organ — a Gyō concentrated onto a fist, which
 * has a palm in it — armours that organ and does not sharpen it. Counting it
 * would make every reinforcement Gyō a free Sensory Gyō, bought with a focus
 * the character declared for something else.
 */
export function sensoryAuraFor(site: CoatingSite): number {
  return site.shiftKind === "sensory"
    ? site.uniformAura + site.shiftedAura
    : site.uniformAura;
}


/**
 * Everything protecting one body identity, organs included.
 *
 * Subdivision made a Hand into a Palm site and a Hand-remainder site, and a
 * blow to the hand meets both. A consumer that read only `body:<key>` after
 * subdivision would see a hand that had quietly lost a quarter of its coating
 * to an organ nobody struck separately.
 */
export function protectiveCoatingFor(
  boundary: ResolvedCoatingBoundary,
  siteId: string,
): { readonly aura: number; readonly surfaceAreaSquareMetres: number } {
  const sites = boundary.sites.filter((one) =>
    one.siteId === siteId || one.hostSiteId === siteId
  );

  return {
    aura: sites.reduce((sum, one) => sum + protectiveAuraOn(one), 0),
    surfaceAreaSquareMetres: sites.reduce(
      (sum, one) => sum + one.surfaceAreaSquareMetres,
      0,
    ),
  };
}


/**
 * The USEFUL sensory Aura on a set of organs.
 *
 * `sum(pointAura * pointFunctionalFraction)`, which is the amount the Sensory
 * Gyō table is consulted with — once, on the total. The impairment is applied
 * HERE, before the table, and never again afterwards: a half-ruined eye holds
 * half the useful Aura, and halving the resulting bonus as well would charge
 * the same injury twice.
 */
export function sensoryAuraOn(
  boundary: ResolvedCoatingBoundary,
  pointIds: readonly CriticalPointId[],
  pointFunction: Readonly<Record<CriticalPointId, number>>,
): number {
  const selected = new Set(pointIds);

  return boundary.sites
    .filter((one) =>
      one.pointId !== undefined && selected.has(one.pointId)
    )
    .reduce(
      (sum, one) => sum + sensoryAuraFor(one) * (pointFunction[one.pointId!] ?? 0),
      0,
    );
}
