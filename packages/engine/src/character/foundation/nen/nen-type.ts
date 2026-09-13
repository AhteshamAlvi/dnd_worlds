/*
 * Nen Type — a character's natural affinity, and whether they know it.
 *
 * Moved here from character/details.ts, which said it should be: the type was
 * parked there as descriptive sheet data "until Nen affinity mechanics are
 * implemented", and awakening is the mechanic that needed it.
 *
 * The VALUE moved with it. `CharacterDetails` briefly kept its own writable
 * `nenType` alongside the one on Nen state, which is two stored affinities
 * with nothing keeping them in step — a character could be an Enhancer on one
 * and an Emitter on the other and both would validate. The canonical value is
 * now `nen.awakening.nenType` and nowhere else; details.ts re-exports the TYPE
 * because callers import it from there, and adoptLegacyNenType() below is the
 * one-time adapter for records written before that was true.
 *
 *
 * AFFINITY AND KNOWLEDGE ARE TWO FACTS
 * ------------------------------------
 *
 * A character HAS a Nen Type from birth. Whether anybody has established what
 * it is — a water divination, a teacher's judgement, a source that declares
 * it — is a separate question with a separate answer, and collapsing the two
 * into one optional field makes "Enhancer, undiscovered" and "nobody has
 * decided yet" the same value. Only the second is missing data.
 *
 * Neither of them is awakening. An unawakened character already has a type;
 * awakening does not assign one, discover one, or change one. An exceptional
 * source may force or change a type, and when it does it records what the type
 * was, what it became, and why — see the awakening vocabulary.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";

import type { NenState } from "./types";


/** Every Nen Type. Closed: the six categories are the whole of the system. */
export const NEN_TYPES = [
  "enhancement",
  "transmutation",
  "emission",
  "conjuration",
  "manipulation",
  "specialization",
] as const;

/** A character's natural Nen affinity. */
export type NenType = typeof NEN_TYPES[number];

export function isNenType(value: unknown): value is NenType {
  return (
    typeof value === "string" && (NEN_TYPES as readonly string[]).includes(value)
  );
}


/*
 * What the character's Nen Type is, and whether it has been established.
 *
 * A DISCRIMINATED state rather than a nullable type, because `type: null` was
 * carrying two unrelated meanings. Affinity is intrinsic — every character has
 * one from birth, whether or not a water divination has ever been run — so
 * "this character has no affinity" is not a thing the model should be able to
 * say at all.
 *
 *   assigned    the affinity is recorded. `known` says whether the character
 *               and their sheet may act on it, so an undiscovered Enhancer is
 *               { type: "enhancement", known: false } — an Enhancer who does
 *               not know it yet, which is a fact about them.
 *
 *   unassigned  nobody has decided. A property of the RECORD, not of the
 *               character, and the state a legacy sheet migrates out of. New
 *               characters are expected to be given a type at construction;
 *               this exists so a record written before affinity was required
 *               can be loaded and then migrated, rather than silently reading
 *               as an Enhancer who does not know it.
 */
export interface NenAssignedType {
  readonly status: "assigned";
  readonly type: NenType;
  readonly known: boolean;
}

export interface NenUnassignedType {
  readonly status: "unassigned";
}

export type NenTypeKnowledge = NenAssignedType | NenUnassignedType;


export function assignedNenType(
  type: NenType,
  known: boolean,
): NenAssignedType {
  return { status: "assigned", type, known };
}


/** What a record that predates affinity being required carries. */
export function unassignedNenType(): NenUnassignedType {
  return { status: "unassigned" };
}


/** The affinity itself, or null when the record has never recorded one. */
export function nenTypeOf(knowledge: NenTypeKnowledge): NenType | null {
  return knowledge.status === "assigned" ? knowledge.type : null;
}


/*
 * One recorded change of Nen Type.
 *
 * Only an exceptional source may produce one, and it must say all three
 * things: what the type was, what it became, and what caused it. A change
 * recording only the new value is a change nothing can be undone from or
 * argued with.
 */
export interface NenTypeChange {
  readonly previous: NenType | null;
  readonly next: NenType;
  readonly cause: string;
}


/* ── Legacy migration ───────────────────────────────────────────────────── */

/**
 * Fold a legacy `details.nenType` into the canonical Nen state.
 *
 * The affinity used to be stored in two places with nothing keeping them in
 * step. The canonical value now lives on Nen state alone, and this is the
 * one-time adapter that moves an older record's value across.
 *
 * Three outcomes, and the third is the one that matters:
 *
 *   nothing recorded   the legacy field is absent. Nothing to do.
 *
 *   agreement          both say the same type. The canonical `known` is kept,
 *                      because agreeing with a legacy record is not a reason
 *                      to forget that the character had discovered their type.
 *
 *   disagreement       REFUSED. Two stored values that contradict each other
 *                      is not something to settle silently by precedence:
 *                      whichever one loses, somebody's character changes
 *                      affinity and nobody is told. The caller is handed both
 *                      and decides.
 *
 * A legacy record that never recorded whether the character KNEW their type
 * migrates as `known: false`. Assuming they knew would be inventing a fact the
 * old field never carried.
 */
export function adoptLegacyNenType(
  nen: NenState,
  legacy: unknown,
): EngineResult<NenState> {
  const traceNode = createTraceNode({
    id: "nen.type.adopt-legacy",
    label: "Adopt a legacy Nen Type",
    formula: "canonical wins when they agree; a disagreement is refused",
    inputs: {
      legacy: { value: String(legacy ?? "absent") },
      canonical: { value: nen.awakening.nenType.status },
    },
  });

  if (legacy === undefined) {
    traceNode.output = { migrated: false, reason: "nothing recorded" };

    return { success: true, payload: nen, trace: { root: traceNode }, warnings: [] };
  }

  if (!isNenType(legacy)) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "nen.type.legacy.invalid",
        message: "A legacy Nen Type must be one of the six Nen Types.",
        audience: "developer",
        required: NEN_TYPES.join(" | "),
        actual: String(legacy),
      }],
    };
  }

  const canonical = nen.awakening.nenType;

  if (canonical.status === "assigned") {
    if (canonical.type !== legacy) {
      traceNode.output = false;

      return {
        success: false,
        trace: { root: traceNode },
        warnings: [],
        errors: [{
          code: "nen.type.legacy.conflict",
          message:
            "A legacy Nen Type disagrees with the one recorded on Nen state.",
          audience: "developer",
          required: canonical.type,
          actual: legacy,
        }],
      };
    }

    traceNode.output = { migrated: false, reason: "already canonical" };

    return { success: true, payload: nen, trace: { root: traceNode }, warnings: [] };
  }

  const migrated: NenState = {
    ...nen,
    awakening: { ...nen.awakening, nenType: assignedNenType(legacy, false) },
  };

  traceNode.output = { migrated: true, type: legacy };

  return {
    success: true,
    payload: migrated,
    trace: { root: traceNode },
    warnings: [],
  };
}
