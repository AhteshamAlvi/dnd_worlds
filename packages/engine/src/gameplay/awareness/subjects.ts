/*
 * Who this threat actually endangers, which is not the same as who it is
 * pointed at.
 *
 *
 * THE PARAMETER THAT IS NOT COMING BACK
 *
 * Combat used to accept a caller-supplied list of extra endangered
 * combatants, and it was removed for a recorded reason: it let any caller
 * declare anybody endangered, which is an unauthored threat rule wearing a
 * parameter. The decision log says an action that endangers subjects it did
 * not declare "needs a real rule", and an architecture test fails if that
 * parameter's name reappears anywhere in this source tree — including, quite
 * deliberately, in a comment like this one.
 *
 * This is that rule, and the difference from the parameter is the whole point.
 * A caller does not name extra subjects here. The AREA names them: the action
 * declares where it lands, the host is asked the objective question "who is in
 * this area, at this revision", and the host answers with occupancy. The host
 * cannot add somebody standing elsewhere, because the query bounds the answer;
 * the caller cannot add anybody at all, because there is no field for it.
 *
 * That is the same division composition/candidates.ts already draws. The host
 * owns the map and answers geometry; the engine owns who noticed and answers
 * that itself.
 *
 *
 * WHY DECLARED TARGETS ARE STILL NOT ENOUGH, IN EITHER DIRECTION
 *
 * Being pointed at is not being endangered — a heal names a recipient and
 * threatens nobody — which is why an action that does not declare
 * `threatens` produces no endangered subjects here regardless of how many
 * targets it has.
 *
 * And being endangered does not require being pointed at, which is the half
 * the old model could not express at all: a blast catches whoever is standing
 * in it, and they are entitled to their Gate before it lands rather than being
 * told afterwards that they were affected.
 *
 * What stays excluded is COLLATERAL discovered after resolution. Affectedness
 * is known once the dice are in, and a Reaction exists to be taken before
 * that. An area occupant is endangered in advance and a blast's unlucky
 * ricochet victim is not, and the difference is whether anybody could have
 * known in time.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { TargetRef } from "../../targeting";
import type { CandidateQueryResult } from "../composition/candidates";
import type { PreparedTargetRef } from "../composition/snapshot";
import type { ThreatSubject } from "./identity";


const TRACE_ID = "gameplay.awareness.subjects";


/** How a subject came to be endangered, kept apart because R2 keeps it apart. */
export const ENDANGERMENT_SOURCES = ["declared", "area"] as const;

export type EndangermentSource = typeof ENDANGERMENT_SOURCES[number];


export interface EndangeredSubject extends ThreatSubject {
  readonly via: EndangermentSource;
}


export interface EndangeredSubjectsInput {
  /**
   * Whether the action endangers anything at all.
   *
   * False produces no subjects, whatever the targets and whatever the area.
   * An action that threatens nobody is not made dangerous by having an area.
   */
  readonly threatens: boolean;

  readonly declaredTargets: readonly PreparedTargetRef[];

  /**
   * How the caller maps a declared target onto the two id spaces.
   *
   * Supplied as a function because the engine has no entity table: a
   * `TargetRef` names an entity, a body part or a position, and only the host
   * knows which combatant that is. Returning undefined excludes the target,
   * which is correct for a position nobody is standing on.
   */
  readonly identify: (target: TargetRef) => ThreatSubject | undefined;

  /**
   * The host's answer to "who is in the area", bound to the query that asked.
   *
   * Absent means nobody asked, which is not the same as an empty area — see
   * `AffectedSubjectSuggestion` for the same distinction drawn one layer up.
   * Absent therefore yields declared targets alone rather than claiming the
   * area caught nobody.
   */
  readonly occupancy?: CandidateQueryResult;

  /** The query the occupancy must echo. Refused when it does not. */
  readonly occupancyQueryId?: string;
  readonly occupancyContextRevision?: string;
}


export interface EndangeredSubjects {
  readonly subjects: readonly EndangeredSubject[];
  readonly errors: readonly EngineError[];
  readonly trace: TraceNode;
}


/**
 * Every subject this threat endangers, deduplicated, declared first.
 *
 * Declared-first ordering is deterministic and meaningful rather than
 * cosmetic: a subject who is both a declared target and an area occupant is
 * recorded as declared, because that is the stronger statement about why they
 * are in danger.
 */
export function endangeredSubjects(
  input: EndangeredSubjectsInput,
): EndangeredSubjects {
  const errors: EngineError[] = [];
  const subjects: EndangeredSubject[] = [];
  const seen = new Set<string>();

  const add = (subject: ThreatSubject, via: EndangermentSource): void => {
    if (seen.has(subject.subjectId)) return;

    seen.add(subject.subjectId);
    subjects.push({ ...subject, via });
  };

  if (input.threatens) {
    for (const declared of input.declaredTargets) {
      const subject = input.identify(declared.target);

      if (subject !== undefined) add(subject, "declared");
    }

    const occupancy = input.occupancy;

    if (occupancy !== undefined) {
      /*
       * The binding is checked before a single candidate is read. An answer to
       * a different question, or one computed against a scene that has since
       * changed, is not a weaker answer — it is an answer about a different
       * world, and reading candidates off it would endanger whoever was
       * standing there a minute ago.
       */
      const wrongQuery = input.occupancyQueryId !== undefined &&
        occupancy.queryId !== input.occupancyQueryId;

      const wrongRevision = input.occupancyContextRevision !== undefined &&
        occupancy.contextRevision !== input.occupancyContextRevision;

      if (wrongQuery || wrongRevision) {
        errors.push({
          code: "awareness.subjects.occupancy.unbound",
          message:
            "This occupancy answer does not belong to the area query it is being used for.",
          audience: "developer",
          required: `${input.occupancyQueryId ?? "-"} @ ${
            input.occupancyContextRevision ?? "-"
          }`,
          actual: `${describeDiagnosticValue(occupancy.queryId)} @ ${
            describeDiagnosticValue(occupancy.contextRevision)
          }`,
        });
      } else {
        for (const candidate of occupancy.candidates) {
          add({ subjectId: candidate.id }, "area");
        }
      }
    }
  }

  const trace = createTraceNode({
    id: TRACE_ID,
    label: "Derive endangered subjects",
    formula: "declared targets, plus whoever the area query found standing in it",
    inputs: {
      threatens: { value: input.threatens },
      declared: { value: input.declaredTargets.length },
      occupancyAsked: { value: input.occupancy !== undefined },
    },
    output: errors.length === 0 ? subjects.length : "refused",
  });

  return { subjects, errors, trace };
}


/** Whether this threat endangers one particular subject. */
export function isEndangered(
  subjects: readonly EndangeredSubject[],
  subjectId: string,
): boolean {
  return subjects.some((subject) => subject.subjectId === subjectId);
}
