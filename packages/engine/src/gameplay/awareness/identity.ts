/*
 * One threat, named once, for as long as it stays the same threat.
 *
 *
 * WHY THE PHASE IS NOT IN THE NAME
 *
 * A fire blast being gathered, crossing the room, and landing are one threat
 * seen three times. The danger channel gets louder as it approaches — that is
 * `urgencyForPhase` doing its job — but the thing endangering you never
 * changed, and a subject who failed to notice the gathering is entitled to
 * notice the arrival.
 *
 * So the phase is deliberately absent from the identity and present on the
 * ATTEMPT instead. Folding it in would have produced a fresh threat at every
 * step, which reads as harmless and quietly grants four Reaction Gates for one
 * attack: each phase would be "a threat nobody has detected yet", and R5's
 * deduplication would have nothing to deduplicate against.
 *
 * Urgency and commitment are out for the same reason, and they are the exact
 * two dimensions the phase supplies. Severity is IN, because severity is
 * content's statement about how bad this is, and a threat that became more
 * dangerous is a different threat to weigh.
 *
 *
 * WHY IT IS PER SUBJECT AND NOT PER ACTION
 *
 * Because R2's whole point is that endangerment is resolved for each subject
 * separately. Two people standing in the same blast have different anatomy,
 * different Concealment against them, different distances and therefore
 * different answers — and one group-level "the party noticed" is the
 * simplification that erases every one of those.
 *
 * The subject is therefore part of the name, and a redirected attack is a new
 * name rather than a silent reuse of the old one.
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { GameTimestamp } from "../../time/types";
import type { TargetRef } from "../../targeting";
import { digestOf } from "../composition/digest";
import type {
  ThreatConfidence,
  ThreatSeverity,
} from "../composition/threat";


/**
 * Somebody a threat is pointed at, in both id spaces at once.
 *
 * `subjectId` is the sensory domain's observer identity and `combatantId` is
 * Combat's. They are carried together rather than assumed equal because the
 * Reaction Gate already keeps them apart — `observerId` and
 * `reactingCombatantId` are separate fields on its binding — and a host that
 * maps characters onto combatants per encounter has no reason for the two
 * strings to match.
 *
 * `combatantId` is absent for a subject who is not in the encounter. Such a
 * subject can still be endangered and can still detect the threat; they
 * simply have no queue to be offered a Gate in.
 */
export interface ThreatSubject {
  readonly subjectId: string;
  readonly combatantId?: string;

  /** What the projection called them, preserved for the trace. */
  readonly target?: TargetRef;
}


/**
 * When the threat's own clock says things happen.
 *
 * Both come from `stepsForProposal`, which derives them from the proposal's
 * `executionDuration` and `travelDuration`. Nothing here invents a duration:
 * see timing.ts for why that matters and what it refuses to guess.
 */
export interface ThreatTiming {
  readonly releaseAt: GameTimestamp;
  readonly impactAt: GameTimestamp;
}


/**
 * Everything that makes this threat this threat.
 *
 * Every field is in the digest. A field that was carried but not fingerprinted
 * would be a way for the world to change without the name changing, which is
 * the one property this shape exists to deny.
 */
export interface ThreatIdentityInput {
  readonly actionId: string;
  readonly proposalId: string;

  /** The Skill, Item or improvisation supplying the mechanic. */
  readonly implement: ContributionSourceRef;

  /**
   * The implementation's revision, as the prepared snapshot fingerprinted it.
   *
   * Bound because R1 names it: the same Skill with a different implement, or
   * an emptied quiver, is not the same threat even though the ids match.
   */
  readonly implementationRevision: string;

  readonly actorId: string;
  readonly subject: ThreatSubject;

  readonly severity: ThreatSeverity;
  readonly confidence: ThreatConfidence;

  /**
   * What content says this would do, when content says anything.
   *
   * Absent is a real answer and not a placeholder: most actions carry no
   * authored consequence id, and a secondary consequence that DOES carry one
   * is a different threat by R1's boundary rule.
   */
  readonly consequenceId?: string;

  readonly timing: ThreatTiming;

  /** The snapshot's spatial digest. A redirected attack changes it. */
  readonly spatialRevision: string;
}


export interface ThreatIdentity extends ThreatIdentityInput {
  /** The stable name. Derived, never supplied. */
  readonly key: string;
}


export function findThreatIdentityIssues(
  input: ThreatIdentityInput,
  path = "threat",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const strings: readonly [string, unknown][] = [
    ["actionId", input?.actionId],
    ["proposalId", input?.proposalId],
    ["actorId", input?.actorId],
    ["implementationRevision", input?.implementationRevision],
    ["spatialRevision", input?.spatialRevision],
    ["subject.subjectId", input?.subject?.subjectId],
  ];

  for (const [field, value] of strings) {
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({
        code: "awareness.threat.identity.incomplete",
        message: `A threat identity must name its ${field}.`,
        audience: "developer",
        subject: { kind: "field", id: `${path}.${field}` },
        required: "a non-empty identifier",
        actual: describeDiagnosticValue(value),
      });
    }
  }

  const timing = input?.timing;

  if (
    !Number.isFinite(timing?.releaseAt) ||
    !Number.isFinite(timing?.impactAt)
  ) {
    errors.push({
      code: "awareness.threat.identity.timing.invalid",
      message: "A threat identity must carry a release and an impact time.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.timing` },
      required: "two finite timestamps",
      actual: describeDiagnosticValue(timing),
    });
  } else if (timing.impactAt < timing.releaseAt) {
    /*
     * Equality is legal and common: an action with no travel lands as it is
     * released. Arriving BEFORE being released is not, and it would silently
     * make every response look timely.
     */
    errors.push({
      code: "awareness.threat.identity.timing.reversed",
      message: "A threat cannot land before it is released.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.timing` },
      required: "impactAt >= releaseAt",
      actual: `${String(timing.releaseAt)} -> ${String(timing.impactAt)}`,
    });
  }

  return errors;
}


/**
 * Name a threat.
 *
 * The digest covers the whole input verbatim rather than a hand-picked subset,
 * so a field added to `ThreatIdentityInput` later is automatically part of the
 * name. The alternative — listing the fingerprinted fields here — is a second
 * declaration of what a threat is, and the first person to add a field and
 * forget this list would produce two materially different threats sharing one
 * identity, which is precisely what R1's boundary forbids.
 */
export function threatIdentity(input: ThreatIdentityInput): ThreatIdentity {
  return { ...input, key: digestOf(input) };
}


/** Whether two identities name the same threat. */
export function sameThreatIdentity(
  left: ThreatIdentity,
  right: ThreatIdentity,
): boolean {
  return left.key === right.key;
}
