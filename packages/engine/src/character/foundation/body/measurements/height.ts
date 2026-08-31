/*
 * Height — the vertical extent of a body, measured through its geometry.
 *
 *
 * WHY THIS IS NOT A SUM, AND NOT A LONGEST PATH
 *
 * The obvious implementations are both wrong, and the second is wrong in a way
 * that looks right until you run it.
 *
 * Summing every part's vertical contribution double-counts anything paired: a
 * Human has two Legs and is not 246 cm tall.
 *
 * Taking the greatest unsigned path through the anatomy fixes the pairing but
 * introduces a worse failure. On the standard humanoid,
 *
 *   Foot-1 -> Leg-1 -> Lower Body -> Leg-2 -> Foot-2
 *
 * is a perfectly legal simple path, and it measures
 *
 *   7 + 81 + 0 + 81 + 7 = 176 cm
 *
 * beating the intended 165 cm. Walking down one leg and back down the other
 * counts both descents as descent, because an unsigned traversal has no way to
 * know that the second one is going the wrong way. (It is also longest-simple-
 * path, which is linear on a forest and NP-hard the moment a cycle appears.)
 *
 *
 * WHAT THIS DOES INSTEAD
 *
 * Anatomy is placed on a single vertical axis and Height is the total extent
 * of the result:
 *
 *   ResolvedHeight = max vertical coordinate - min vertical coordinate
 *
 * Each BodyPart has a normalized 0..1 longitudinal coordinate whose ends are
 * authored per type, a `heightContribution` saying how much of its Length is
 * vertical at all, and a `heightAxisSign` saying which way that axis points.
 * Moving through a part from local coordinate a to b:
 *
 *   VerticalDelta = (b - a) x ResolvedLength x heightContribution x sign
 *
 * signed, so descending one Leg and then ascending back out of it cancels
 * exactly. Each connection asserts that two coordinates meet:
 *
 *   vertical position at parentPosition == vertical position at childPosition
 *
 * and adds no distance of its own. Because both ends are recorded, the
 * constraint can be solved from either side, so the answer does not depend on
 * which of two parts happened to be authored as the parent.
 *
 * No Height base and no ground-contact schema is needed. The origin cancels
 * out of a difference of extremes, so the resolver can start anywhere. On the
 * standard humanoid, taking the pelvis as zero happens to put the soles at -88
 * and the crown at +77; taking the soles as zero would put the crown at 165.
 * Both say 165 cm.
 *
 *
 * THE ACYCLIC REQUIREMENT
 *
 * Unique coordinates require the connection graph to be a forest. Anatomy
 * already guarantees this — every BodyPart has at most one parent, and
 * anatomy/validation.ts rejects parent cycles — so a second connection into an
 * already-placed part means the invariant has been violated upstream, and this
 * file throws rather than silently picking one of two contradictory positions.
 * Solving a genuinely cyclic geometry needs a constraint solver, which is a
 * much larger thing than Height is worth.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";


/*
 * One BodyPart's placement on the vertical axis.
 *
 * `base` is the vertical coordinate of the part's own local coordinate 0.
 * `span` is the signed vertical distance from local 0 to local 1, so the part
 * occupies the closed interval between `base` and `base + span` and the
 * position at any local coordinate c is `base + (c x span)`.
 *
 * Collapsing length, contribution and sign into one signed span here means the
 * traversal below is plain arithmetic on two numbers rather than four.
 */
interface VerticalPlacement {
  readonly base: number;
  readonly span: number;
}


/*
 * The signed vertical distance from a part's local 0 to its local 1.
 *
 * Zero for anatomy that contributes no Height — an Arm, a Hand, a tail hanging
 * horizontally. Such a part collapses to a single point on the vertical axis,
 * which is correct: it still conducts the traversal onward to whatever hangs
 * off it, but it neither raises nor lowers anything.
 */
function verticalSpanOf(
  definition: BodyPartDefinition,
  lengthCm: number,
): number {
  return (
    lengthCm *
    definition.reference.heightContribution *
    definition.reference.heightAxisSign
  );
}


/*
 * Resolves the vertical extent of one body.
 *
 * Only active anatomy participates. A suppressed or archived-removed part is
 * absent from the geometry entirely, which also means it stops conducting: a
 * body whose Neck has been removed is two disconnected components, and the
 * Head is no longer part of the same vertical structure as the torso.
 *
 * `resolvedLengthCmByPartId` carries each part's already-resolved Length, so
 * Height is measured on the body as it actually is rather than on reference
 * anatomy. A part with no entry is treated as absent for the same reason a
 * non-active one is.
 *
 * With several disconnected components — deliberate detached anatomy, or the
 * decapitation above — each is measured independently and the greatest span
 * wins. An empty body has no vertical extent and resolves to 0 rather than
 * failing; a character whose anatomy has been entirely destroyed is 0 cm tall,
 * which is a strange sentence but the right number.
 */
export function resolveHeightCm(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  resolvedLengthCmByPartId: Readonly<Record<BodyPartId, number>>,
): number {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  const activeParts = new Map<BodyPartId, BodyPart>();

  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;
    if (resolvedLengthCmByPartId[part.id] === undefined) continue;

    activeParts.set(part.id, part);
  }

  const spans = new Map<BodyPartId, number>();

  for (const [partId, part] of activeParts) {
    const definition = definitionsById.get(part.type);

    /*
     * Same convention as selectBodyParts and resolveBodyMeasurements: anatomy
     * is assumed validated, so an unknown type is an invalid engine state.
     */
    if (definition === undefined) {
      throw new Error(
        `Cannot resolve Height for BodyPart "${partId}": ` +
        `unknown BodyPartDefinition "${part.type}".`,
      );
    }

    spans.set(
      partId,
      verticalSpanOf(definition, resolvedLengthCmByPartId[partId] ?? 0),
    );
  }

  /*
   * Undirected adjacency. A connection only exists when BOTH of its parts are
   * present — an attachment to a removed parent connects nothing.
   */
  const neighbours = new Map<BodyPartId, ConnectionEnd[]>();

  const addNeighbour = (
    fromId: BodyPartId,
    end: ConnectionEnd,
  ): void => {
    const existing = neighbours.get(fromId);

    if (existing === undefined) {
      neighbours.set(fromId, [end]);

      return;
    }

    existing.push(end);
  };

  for (const [partId, part] of activeParts) {
    const attachment = part.attachment;

    if (attachment === null) continue;
    if (!activeParts.has(attachment.parentId)) continue;

    /*
     * The connection is identified by the child's id, because every BodyPart
     * has at most one attachment. That gives the two directed ends below a
     * shared identity, which is what lets the traversal tell "I came in along
     * this very edge" apart from "a second, different edge reaches a part I
     * have already placed" — the first is ordinary, the second is a cycle.
     */
    addNeighbour(partId, {
      edgeId: partId,
      toId: attachment.parentId,
      fromPosition: attachment.childPosition,
      toPosition: attachment.parentPosition,
    });

    addNeighbour(attachment.parentId, {
      edgeId: partId,
      toId: partId,
      fromPosition: attachment.parentPosition,
      toPosition: attachment.childPosition,
    });
  }

  const placements = new Map<BodyPartId, VerticalPlacement>();

  const traversedEdges = new Set<BodyPartId>();

  let greatestSpan = 0;

  for (const startId of activeParts.keys()) {
    if (placements.has(startId)) continue;

    /*
     * Any origin will do — the difference of extremes is translation
     * invariant, so this component's own arbitrary zero cancels out.
     */
    const startSpan = spans.get(startId) ?? 0;

    placements.set(startId, { base: 0, span: startSpan });

    let minimum = Math.min(0, startSpan);
    let maximum = Math.max(0, startSpan);

    const pending: BodyPartId[] = [startId];

    while (pending.length > 0) {
      const currentId = pending.pop()!;

      const current = placements.get(currentId)!;

      for (const end of neighbours.get(currentId) ?? []) {
        if (traversedEdges.has(end.edgeId)) continue;

        /*
         * A part already placed, reached along an edge not yet walked, is a
         * second independent path to the same coordinate — a cycle. Anatomy
         * validation is supposed to have made that impossible, so reaching it
         * here means the invariant broke upstream. Better to say so than to
         * quietly adopt whichever of two contradictory positions arrived
         * first.
         */
        if (placements.has(end.toId)) {
          throw new Error(
            `Cannot resolve Height: BodyPart "${end.toId}" is reachable through ` +
            "more than one connection, so the Height-relevant anatomy is cyclic.",
          );
        }

        traversedEdges.add(end.edgeId);

        const neighbourSpan = spans.get(end.toId) ?? 0;

        /*
         * The connection asserts the two coordinates sit at the same height:
         *
         *   base_here + fromPosition x span_here
         *     == base_there + toPosition x span_there
         *
         * solved for the neighbour's own base. Symmetric in the two parts, so
         * arriving from either side places the other identically.
         */
        const base =
          current.base +
          (end.fromPosition * current.span) -
          (end.toPosition * neighbourSpan);

        placements.set(end.toId, { base, span: neighbourSpan });

        minimum = Math.min(minimum, base, base + neighbourSpan);
        maximum = Math.max(maximum, base, base + neighbourSpan);

        pending.push(end.toId);
      }
    }

    greatestSpan = Math.max(greatestSpan, maximum - minimum);
  }

  return greatestSpan;
}


/*
 * One end of one connection, from the perspective of the part being left.
 *
 * `fromPosition` is where the connection sits on the part being left, and
 * `toPosition` where it sits on the part being entered. Each attachment
 * produces two of these, one in each direction, which is what makes the
 * traversal direction-independent.
 */
interface ConnectionEnd {
  readonly edgeId: BodyPartId;
  readonly toId: BodyPartId;
  readonly fromPosition: number;
  readonly toPosition: number;
}
