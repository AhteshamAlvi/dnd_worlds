/*
 * Binding a Gate to a threat, ordering the Gates, and refusing the stale ones.
 *
 *
 * A GATE IS AN OPPORTUNITY, NOT A PERMISSION
 *
 * R7 is one sentence and it is the one most easily lost: detecting the threat
 * opens the Gate, and opening the Gate makes nothing legal. The responder
 * still has to have an Action, still has to have a Skill usable as a Reaction,
 * still has to be able to afford it, and still has to produce an effect in
 * time. Every one of those is already owned somewhere else — Combat's Action
 * economy, the capability layer, the runtime coordinator, timing.ts — and this
 * module answers none of them.
 *
 * What it owns is narrower: which Gate is settled in what order, and whether
 * the world the Gate was prepared against is still there.
 *
 *
 * WHY ORDERING IS DETECTION TIME AND THEN INITIATIVE, IN THAT ORDER
 *
 * Because they answer different questions. Detection time says who knew first
 * and it is a real fact about the fiction — the character watching the door
 * reacts before the one reading a book. Initiative says who acts first among
 * people who knew at the same instant, which is exactly the question
 * Initiative was invented for and exactly the question Detection time cannot
 * answer.
 *
 * Using Initiative alone would delete the head start. Using Detection time
 * alone leaves genuine ties undecided, and array position would then quietly
 * become the tie-break — which makes the order a host listed its tokens in
 * into a mechanical outcome.
 *
 * Combat's Reaction queue already orders its Gate prompts by Initiative and
 * keeps doing so; this ordering is about which prepared response SETTLES
 * first, which is the question R10 asks.
 *
 *
 * WHY EVERY LATER GATE IS REVALIDATED
 *
 * Because the first response may have changed what the later ones are for. If
 * an ally knocks the archer's arm, the arrow that was coming at you is now
 * going somewhere else — and settling your dodge against the old facts is the
 * silent recompute the whole snapshot mechanism exists to refuse. R10 says the
 * later Gate becomes stale, unnecessary, or a new threat entirely, and this
 * reports which rather than picking one.
 *
 * `superseded` in particular is not a failure. It means the threat is still
 * real but is no longer THIS threat, and the honest next step is a new
 * identity and a fresh Detection — not reusing a binding computed for
 * something that no longer exists.
 *
 *
 * WHY REJECTION IS ATOMIC
 *
 * R22, and it is the reason authorization is separate from settlement here as
 * it is everywhere else in this engine. A rejected response must cost nothing:
 * not a partial Action, not a partially committed Aura, not a Concealment
 * break. So the validation runs first, returns a refusal, and the caller has
 * charged nothing because there was nothing between the two.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import type { EngineError } from "../../infrastructure/diagnostics";
import type { GameTimestamp } from "../../time/types";
import { findInitiativeEntry } from "../combat/initiative";
import type { InitiativeOrder } from "../combat/types";
import type { StateRevisionRef } from "../composition/snapshot";
import type { ThreatIdentity } from "./identity";
import { compareEffectToImpact, type EffectTimeliness } from "./timing";
import { RELATIONSHIP_BINDING_OWNER } from "./relationships";


const TRACE_ID = "gameplay.awareness.gates";


/**
 * Why this Gate exists.
 *
 * The distinction is R8's: a defensive Gate belongs to somebody the threat is
 * pointed at, an intervention Gate belongs to the one ally who noticed first
 * and is acting on their behalf. They are settled by the same machinery and
 * are not the same entitlement, so they are named apart rather than
 * distinguished by whether the holder happens to be in the threat list.
 */
export const THREAT_GATE_KINDS = ["defensive", "intervention"] as const;

export type ThreatGateKind = typeof THREAT_GATE_KINDS[number];


/**
 * Everything a threat Gate was opened against.
 *
 * The relationship revision is in here for intervention Gates specifically. An
 * ally selected against a party that has since turned on itself is exactly as
 * stale as a shot aimed at a target that has since moved, and there is no
 * reason relationships should be the one bound fact nobody checks.
 */
export interface ThreatGateBinding {
  readonly threatKey: string;
  readonly kind: ThreatGateKind;

  readonly holderId: string;
  readonly holderCombatantId?: string;

  /** Whose behalf it is on. The holder themselves, for a defensive Gate. */
  readonly subjectId: string;

  /** The ordering key R9 makes primary. */
  readonly detectedAt: GameTimestamp;

  /** Every revision the Gate was computed against, relationships included. */
  readonly revisions: readonly StateRevisionRef[];
}


export function bindThreatGate(input: {
  readonly threat: ThreatIdentity;
  readonly kind: ThreatGateKind;
  readonly holderId: string;
  readonly holderCombatantId?: string;
  readonly subjectId: string;
  readonly detectedAt: GameTimestamp;
  readonly revisions: readonly StateRevisionRef[];
  readonly relationshipRevision?: string;
}): ThreatGateBinding {
  const revisions = input.relationshipRevision === undefined
    ? input.revisions
    : [
      ...input.revisions,
      {
        owner: RELATIONSHIP_BINDING_OWNER,
        revision: input.relationshipRevision,
      },
    ];

  return {
    threatKey: input.threat.key,
    kind: input.kind,
    holderId: input.holderId,
    ...(input.holderCombatantId === undefined
      ? {}
      : { holderCombatantId: input.holderCombatantId }),
    subjectId: input.subjectId,
    detectedAt: input.detectedAt,
    revisions,
  };
}


/**
 * How a Gate stands now, which is not always how it stood when it opened.
 *
 *   valid        the threat and the world are as bound
 *   cancelled    the threat is gone; the Gate has nothing to answer
 *   superseded   still a threat, but a materially different one
 *   too-late     the threat has already landed
 *   stale        a bound fact changed underneath it
 */
export const GATE_VALIDITIES = [
  "valid",
  "cancelled",
  "superseded",
  "too-late",
  "stale",
] as const;

export type GateValidity = typeof GATE_VALIDITIES[number];


export interface GateRevalidation {
  readonly validity: GateValidity;

  /** The bound facts that changed, when the reason is staleness. */
  readonly changed: readonly StateRevisionRef[];

  readonly trace: TraceNode;
}


export interface GateRevalidationInput {
  readonly binding: ThreatGateBinding;

  /**
   * The threat as it stands after everything that has settled so far.
   *
   * Null means an earlier response removed it. A DIFFERENT key means an
   * earlier response changed it into something else, which R1's boundary says
   * requires a new identity rather than a silent reuse of this one.
   */
  readonly threat: ThreatIdentity | null;

  /** The revisions that hold now, from the same owners that were bound. */
  readonly revisions: readonly StateRevisionRef[];

  /** When this Gate is being revalidated. */
  readonly at: GameTimestamp;
}


export function revalidateThreatGate(
  input: GateRevalidationInput,
): GateRevalidation {
  const now = new Map(
    input.revisions.map((entry) => [entry.owner, entry.revision]),
  );

  const changed = input.binding.revisions.filter((entry) =>
    now.get(entry.owner) !== entry.revision
  );

  const trace = (validity: GateValidity): TraceNode =>
    createTraceNode({
      id: `${TRACE_ID}.revalidate`,
      label: "Revalidate a threat Gate",
      formula: "the threat first, then the clock, then the bound world",
      inputs: {
        threat: { value: input.binding.threatKey },
        holder: { value: input.binding.holderId },
        kind: { value: input.binding.kind },
        changed: { value: changed.length },
      },
      output: validity,
    });

  /*
   * Order matters. A cancelled threat is cancelled whatever else moved, and
   * reporting it as merely stale would send a caller looking for a revision
   * that changed rather than telling them the arrow is no longer coming.
   */
  if (input.threat === null) {
    return { validity: "cancelled", changed, trace: trace("cancelled") };
  }

  if (input.threat.key !== input.binding.threatKey) {
    return { validity: "superseded", changed, trace: trace("superseded") };
  }

  if (input.at > input.threat.timing.impactAt) {
    return { validity: "too-late", changed, trace: trace("too-late") };
  }

  if (changed.length > 0) {
    return { validity: "stale", changed, trace: trace("stale") };
  }

  return { validity: "valid", changed: [], trace: trace("valid") };
}


/**
 * One Gate waiting to settle, with everything the ordering needs.
 *
 * `initiative` is absent outside structured time. A cohort containing one such
 * entry cannot be ordered, and `orderThreatGates` says so rather than falling
 * back on array position.
 */
export interface PendingThreatGate {
  readonly binding: ThreatGateBinding;
  readonly initiative?: number;
}


export type ThreatGateOrdering =
  | { readonly ordered: readonly PendingThreatGate[]; readonly tied: null }
  | {
      /** The Gates that could be ordered, up to the point of the tie. */
      readonly ordered: readonly PendingThreatGate[];

      /** Holders sharing a Detection time with no Initiative to separate them. */
      readonly tied: readonly string[];
    };


/**
 * Order Gates by when their holders knew, breaking exact ties by Initiative.
 *
 * Refuses rather than guesses. An unresolvable tie returns everything ordered
 * up to that point plus the tied holders, so a caller can settle the
 * unambiguous prefix and take the tie to a person — which is the same shape
 * `resolveInitiativeOrder` uses for the same reason.
 */
export function orderThreatGates(
  gates: readonly PendingThreatGate[],
  initiative?: InitiativeOrder,
): ThreatGateOrdering {
  const withInitiative = gates.map((gate) => {
    if (gate.initiative !== undefined) return gate;

    const entry = initiative === undefined || gate.binding.holderCombatantId === undefined
      ? undefined
      : findInitiativeEntry(initiative, gate.binding.holderCombatantId);

    return entry === undefined ? gate : { ...gate, initiative: entry.value };
  });

  const sorted = [...withInitiative].sort((left, right) => {
    if (left.binding.detectedAt !== right.binding.detectedAt) {
      return left.binding.detectedAt - right.binding.detectedAt;
    }

    /* Higher Initiative acts first, which is the rotation's own direction. */
    return (right.initiative ?? 0) - (left.initiative ?? 0);
  });

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;

    if (previous.binding.detectedAt !== current.binding.detectedAt) continue;

    const undecided = previous.initiative === undefined ||
      current.initiative === undefined ||
      previous.initiative === current.initiative;

    if (!undecided) continue;

    /*
     * The prefix stops BEFORE the first member of the tie, not before the
     * tie's second member. An earlier Gate that shares the Detection time but
     * whose Initiative did separate it stays ordered and is not reported as
     * tied: it is decided, and asking a person to break a tie it is not part
     * of would be this function reporting its own indecision too widely.
     */
    return {
      ordered: sorted.slice(0, index - 1),
      tied: sorted
        .slice(index - 1)
        .filter((gate) => gate.binding.detectedAt === current.binding.detectedAt)
        .map((gate) => gate.binding.holderId),
    };
  }

  return { ordered: sorted, tied: null };
}


export interface GateResponseAuthorizationInput {
  readonly binding: ThreatGateBinding;
  readonly threat: ThreatIdentity | null;
  readonly revisions: readonly StateRevisionRef[];

  /** When the response's relevant effect becomes active. Not when declared. */
  readonly effectiveAt: GameTimestamp;
}


export interface AuthorizedGateResponse {
  readonly binding: ThreatGateBinding;
  readonly timeliness: EffectTimeliness;
  readonly trace: TraceNode;
}


/**
 * Authorize a response, or refuse it having charged nothing.
 *
 * A `simultaneous` effect is authorized rather than refused, and that is
 * deliberate: R19 says equality is a real event resolved through Initiative,
 * so refusing it here would decide by comparison operator what the rules say
 * Initiative decides. The timeliness is reported so the caller takes it to the
 * ordering rather than assuming success.
 */
export function authorizeGateResponse(
  input: GateResponseAuthorizationInput,
): EngineResult<AuthorizedGateResponse> {
  const revalidation = revalidateThreatGate({
    binding: input.binding,
    threat: input.threat,
    revisions: input.revisions,
    at: input.effectiveAt,
  });

  const label = "Authorize a Reaction Gate response";

  if (revalidation.validity !== "valid") {
    const error: EngineError = {
      code: `gameplay.awareness.gates.${revalidation.validity}`,
      message:
        "This Reaction Gate no longer describes the threat, timing or world it was opened against.",
      audience: "developer",
      required: "a valid gate binding",
      actual: revalidation.validity,
      ...(revalidation.changed.length === 0 ? {} : {
        subject: {
          kind: "field" as const,
          id: revalidation.changed.map((entry) => entry.owner).join(", "),
        },
      }),
    };

    return engineFailure(
      { root: revalidation.trace },
      [error] as NonEmptyArray<EngineError>,
    );
  }

  const timeliness = compareEffectToImpact(
    input.effectiveAt,
    input.threat!.timing.impactAt,
  );

  const trace = createTraceNode({
    id: `${TRACE_ID}.authorize`,
    label,
    formula: "the EFFECT is compared against impact, never the declaration",
    inputs: {
      holder: { value: input.binding.holderId },
      effectiveAt: { value: input.effectiveAt },
      impactAt: { value: input.threat!.timing.impactAt },
    },
    output: timeliness,
    children: [revalidation.trace],
  });

  return engineSuccess(
    { binding: input.binding, timeliness, trace },
    { root: trace },
  );
}
