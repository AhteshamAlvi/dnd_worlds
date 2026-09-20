/*
 * One ally gets to interrupt. Choosing which one.
 *
 *
 * WHY EARLIEST AND NOT BEST
 *
 * The intervention Gate exists because somebody saw it coming in time to do
 * something. That is a statement about WHEN, so the selection key is when —
 * not who is most capable, not who is closest, not who rolled highest. An
 * ally who noticed the gathering has a real head start over one who noticed
 * the loose, and awarding the interrupt to the better fighter would delete
 * that head start and make noticing early worth nothing.
 *
 * Selecting the LATEST would be worse still and is easy to write by accident:
 * a reduce that keeps replacing the leader on `>=` selects the last one in the
 * array, which looks like a tie-break and is actually a reversal.
 *
 *
 * WHY EXACTLY ONE
 *
 * Because the alternative is a free off-turn Action for every bystander who
 * happens to be friendly. One threat produces one interruption; everybody else
 * who noticed is AWARE, which is worth a great deal on their own Turn and is
 * not worth a Reaction Gate. `aware` is returned alongside `selected` rather
 * than discarded, precisely so a caller can act on that distinction instead of
 * inferring that the unselected saw nothing.
 *
 *
 * WHY INITIATIVE AND NOT AN INVENTED ROLL
 *
 * Two allies can genuinely notice at the same instant, and something has to
 * decide. The Round already has an authority for who acts first when two
 * things coincide, and Combat's Reaction queue already orders its Gates by it.
 * Reusing it costs nothing and invents nothing.
 *
 * What this will NOT do is manufacture an ordering when the engine has none.
 * Initiative is rerolled every Round and does not exist outside one; the
 * formula is undecided and `resolveInitiativeOrder` reports equal values as an
 * unresolved tie rather than ordering them by array position. So a tie with no
 * initiative to break it is REFUSED here, with the cohort named, and a person
 * decides. Inventing an out-of-combat initiative roll to avoid that refusal
 * would be exactly the balance decision this engine keeps declining to make.
 *
 *
 * WHY ENDANGERED ALLIES ARE EXCLUDED FROM THE CONTEST
 *
 * They are not excluded from REACTING — R9 is explicit that endangered
 * subjects keep their own defensive Gates, and selecting an observer does not
 * erase one. They are excluded from being the INTERVENTION observer, because
 * the intervention Gate is for somebody acting on another's behalf, and a
 * subject who is themselves in the blast already has their own Gate for it.
 * Letting them win the contest would hand one person two Gates.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { GameTimestamp } from "../../time/types";
import { findInitiativeEntry } from "../combat/initiative";
import type { InitiativeOrder } from "../combat/types";
import { alliedCandidates, type RelationshipFactSet } from "./relationships";
import { subjectAwareness, type ThreatAwareness } from "./awareness";


/** Why no ally was selected. Never collapsed into "nobody". */
export const OBSERVER_REFUSALS = [
  /* No relationship facts were supplied. R13: refuse, do not assume. */
  "relationships-unavailable",

  /* Facts were supplied and named no ally of this subject. */
  "no-allied-candidate",

  /* Allies exist; none of them detected the threat. */
  "none-detected",

  /* An exact detection tie with no initiative entry to break it. */
  "tie-unresolved",
] as const;

export type ObserverRefusal = typeof OBSERVER_REFUSALS[number];


export interface AlliedObserverCandidate {
  readonly observerId: string;
  readonly detectedAt: GameTimestamp;

  /** Absent for a candidate outside the encounter; such a tie cannot break. */
  readonly initiative?: number;
}


export type AlliedObserverSelection =
  | {
      readonly selected: string;

      /** Everyone who detected at the same earliest instant, selected included. */
      readonly cohort: readonly string[];

      /** Every detecting eligible ally. Aware, but not interrupting. */
      readonly aware: readonly string[];

      /** True when initiative had to break an exact tie. */
      readonly tieBroken: boolean;

      readonly trace: TraceNode;
    }
  | {
      readonly selected: null;
      readonly refusal: ObserverRefusal;
      readonly cohort: readonly string[];
      readonly aware: readonly string[];
      readonly trace: TraceNode;
    };


export interface AlliedObserverInput {
  readonly awareness: ThreatAwareness;

  /** Whose allies are wanted: the endangered subject. */
  readonly subjectId: string;

  /**
   * Everybody the caller considers present.
   *
   * Supplied rather than read from the relationship facts, so a host
   * reporting a hundred relations cannot enlarge the contest.
   */
  readonly candidateIds: readonly string[];

  /** Everyone this threat endangers. They keep their own Gates and lose this one. */
  readonly endangeredSubjectIds: readonly string[];

  /** Absent means no facts were supplied, which refuses rather than assumes. */
  readonly relationships?: RelationshipFactSet;

  /** The Round's own order. Absent outside structured time. */
  readonly initiative?: InitiativeOrder;
}


const TRACE_ID = "gameplay.awareness.observer";


export function selectAlliedObserver(
  input: AlliedObserverInput,
): AlliedObserverSelection {
  const allied = alliedCandidates(
    input.relationships,
    input.subjectId,
    input.candidateIds,
  );

  const eligible = allied.filter((observerId) =>
    !input.endangeredSubjectIds.includes(observerId)
  );

  const detecting: AlliedObserverCandidate[] = [];

  for (const observerId of eligible) {
    const awareness = subjectAwareness(input.awareness, observerId);

    if (!awareness.detected || awareness.detectedAt === undefined) continue;

    const entry = input.initiative === undefined
      ? undefined
      : findInitiativeEntry(input.initiative, observerId);

    detecting.push({
      observerId,
      detectedAt: awareness.detectedAt,
      ...(entry === undefined ? {} : { initiative: entry.value }),
    });
  }

  const aware = detecting.map((candidate) => candidate.observerId);

  const refuse = (
    refusal: ObserverRefusal,
    cohort: readonly string[] = [],
  ): AlliedObserverSelection => ({
    selected: null,
    refusal,
    cohort,
    aware,
    trace: trace(refusal, cohort),
  });

  function trace(output: string | number, cohort: readonly string[]): TraceNode {
    return createTraceNode({
      id: TRACE_ID,
      label: "Select the allied intervention observer",
      formula: "earliest Detection wins; an exact tie is broken by Initiative alone",
      inputs: {
        subject: { value: input.subjectId },
        candidates: { value: input.candidateIds.length },
        allied: { value: allied.length },
        eligible: { value: eligible.length },
        detecting: { value: detecting.length },
        cohort: { value: cohort.length },
      },
      output,
    });
  }

  if (input.relationships === undefined) return refuse("relationships-unavailable");
  if (allied.length === 0) return refuse("no-allied-candidate");
  if (detecting.length === 0) return refuse("none-detected");

  const earliest = detecting.reduce(
    (best, candidate) => candidate.detectedAt < best ? candidate.detectedAt : best,
    detecting[0]!.detectedAt,
  );

  const cohortMembers = detecting.filter(
    (candidate) => candidate.detectedAt === earliest,
  );

  const cohort = cohortMembers.map((candidate) => candidate.observerId);

  const sole = cohortMembers[0]!;

  if (cohortMembers.length === 1) {
    return {
      selected: sole.observerId,
      cohort,
      aware,
      tieBroken: false,
      trace: trace(sole.observerId, cohort),
    };
  }

  /*
   * A tie, and every member of it must carry an Initiative value for the tie
   * to be breakable. One member without an entry is not "the others win": it
   * is an ordering the engine does not have, and Initiative refuses equal
   * values for the same reason.
   */
  if (cohortMembers.some((candidate) => candidate.initiative === undefined)) {
    return refuse("tie-unresolved", cohort);
  }

  const ordered = [...cohortMembers].sort(
    (left, right) => right.initiative! - left.initiative!,
  );

  const leader = ordered[0]!;
  const runnerUp = ordered[1]!;

  /* Equal Initiative is the tie Initiative itself declines to break. */
  if (leader.initiative === runnerUp.initiative) {
    return refuse("tie-unresolved", cohort);
  }

  return {
    selected: leader.observerId,
    cohort,
    aware,
    tieBroken: true,
    trace: trace(leader.observerId, cohort),
  };
}
