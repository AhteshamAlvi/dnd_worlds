/*
 * Where a principle transition meets the Action economy.
 *
 * Two authorities have to agree before anything happens, and they live in
 * different domains:
 *
 *   character/nen   whether the transition is legal at all — funded, unsealed,
 *                   compatible, connected
 *   gameplay/combat whether the actor may spend what it costs, right now,
 *                   from the shared Round pool and under the state cap
 *
 * Neither can answer the other's question, and neither may import the other:
 * Combat must not learn what Ken is, and Character must not reach up into
 * `gameplay/`. So the composition lives HERE, which is the same shape as
 * `gameplay/aura` joining Aura to targeting and spatial.
 *
 *
 * BOTH OR NEITHER
 * ---------------
 *
 * The failure this exists to make impossible is a character who paid an Action
 * for a Ken that did not start, or who started one they could not afford. So
 * the order is fixed:
 *
 *   1. price the transition               (no state touched)
 *   2. RESOLVE the transition             (a new runtime, not yet returned)
 *   3. check affordability and the window (no state touched)
 *   4. spend, and return both
 *
 * Step 2 produces a value rather than a mutation, which is what makes step 3's
 * refusal free: the resolved runtime is simply dropped, and the caller is
 * handed back the one they came in with. Nothing needs unwinding because
 * nothing was wound.
 *
 *
 * FORCED TRANSITIONS DO NOT TOUCH COMBAT AT ALL
 * ---------------------------------------------
 *
 * A Ken reduced because the reserve fell, a Shū recomputed because a sword was
 * knocked away, an activity stopped because a seal landed — none of those are
 * things the character did, so none of them cost an Action and none of them
 * need a Turn to happen in. Routing them through the Action economy would
 * charge somebody for being disarmed, and would make a mid-interval
 * recomputation illegal outside their own Turn, which is exactly when it
 * happens.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";

import {
  resolvePrincipleTransitionCost,
  type PrincipleActionAuthorization,
  type PrincipleTransitionCost,
  type PrincipleTransitionKind,
} from "../../character/foundation/nen/principles/transition-cost";
import type { NenActivityRuntime } from "../../character/foundation/nen/runtime/types";
import type { NenActivityTransition } from "../../character/nen/runtime/transitions";

import {
  findActionSpendFailure,
  spendCombatAction,
} from "../combat/actions";
import type {
  ActiveCombatState,
  CombatAction,
  CombatantId,
  CombatantRoundState,
  NeutralCombatAction,
} from "../combat/types";


/** The Combat context a voluntary transition is judged against. */
export interface PrincipleTransitionCombatContext {
  readonly combatant: CombatantRoundState;
  readonly state: ActiveCombatState;
  readonly actorCombatantId: CombatantId;

  /**
   * The authorized intent this transition schedules.
   *
   * A REFERENCE, exactly as every other neutral Action carries. Combat owns
   * when the actor may act and what it costs; it does not own what Ken is.
   */
  readonly intentId: string;
}


export interface PrincipleTransitionRequest {
  /** This transition's own id. Authorizations are bound to it. */
  readonly transitionId: string;

  readonly owner: string;
  readonly principleId: string;
  readonly kind: PrincipleTransitionKind;

  /** The principle's effective rank, after seals. */
  readonly effectiveMastery: number;

  /** False for anything the world imposed. See the header. */
  readonly voluntary: boolean;

  readonly authorization?: PrincipleActionAuthorization;

  /**
   * Combat, when there is any.
   *
   * Absent out of combat, where there is no Action economy to spend from and
   * no Turn to be inside. A principle transition outside combat is legal and
   * free, which is not a loophole: the Action cost exists to ration a Round,
   * and there is no Round.
   */
  readonly combat?: PrincipleTransitionCombatContext;
}


export interface PrincipleTransitionSettlement {
  readonly runtime: NenActivityRuntime;

  /** The Nen-side result, with its consequences and events intact. */
  readonly transition: NenActivityTransition;

  readonly cost: PrincipleTransitionCost;

  /** Unchanged when nothing was spent, including at a cost of zero. */
  readonly combatant: CombatantRoundState | null;
  readonly state: ActiveCombatState | null;

  /** The Action that was spent, or null when none was. */
  readonly action: CombatAction | null;
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


/**
 * Settle a principle transition and its Action cost together.
 *
 * `resolve` is the adapter call that would perform the transition —
 * `startKen`, `adjustGyo`, `stopNenActivity`, anything returning a
 * `NenActivityTransition`. It is invoked at most once, and its result is
 * discarded without ceremony if the Action cannot be paid.
 *
 * A Skill that BUNDLES the transition passes an authorization of kind
 * `"bundled"` and pays its own cost through its own path; a Skill that merely
 * requires an already-active principle passes nothing, and the character pays
 * for the transition separately, because entering a state and demanding one
 * are different acts.
 */
export function settlePrincipleTransition(
  runtime: NenActivityRuntime,
  request: PrincipleTransitionRequest,
  resolve: (runtime: NenActivityRuntime) => EngineResult<NenActivityTransition>,
): EngineResult<PrincipleTransitionSettlement> {
  const root = createTraceNode({
    id: "nen.transition.settle",
    label: "Settle a principle transition against the Action economy",
    inputs: {
      principleId: { value: describeDiagnosticValue(request?.principleId) },
      kind: { value: describeDiagnosticValue(request?.kind) },
      voluntary: { value: describeDiagnosticValue(request?.voluntary) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.transition.request.malformed",
      message: "A principle transition settlement needs a request object.",
      audience: "developer",
      required: "PrincipleTransitionRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  if (typeof resolve !== "function") {
    return refuse(root, [{
      code: "nen.transition.request.malformed",
      message: "A principle transition settlement needs the transition to run.",
      audience: "developer",
      required: "a function returning an EngineResult<NenActivityTransition>",
      actual: describeDiagnosticValue(resolve),
    }]);
  }

  /* 1. Price it. Nothing is touched, and a bad authorization refuses here. */
  const priced = resolvePrincipleTransitionCost({
    transitionId: request.transitionId,
    owner: request.owner,
    principleId: request.principleId,
    kind: request.kind,
    effectiveMastery: request.effectiveMastery,
    voluntary: request.voluntary,
    ...(request.authorization === undefined
      ? {}
      : { authorization: request.authorization }),
  });

  root.children.push(priced.trace.root);

  if (!priced.success) return refuse(root, priced.errors);

  /* 2. Resolve it, holding the result rather than returning it. */
  const resolved = resolve(runtime);

  root.children.push(resolved.trace.root);

  if (!resolved.success) return refuse(root, resolved.errors);

  /*
   * 3. A forced transition is finished here. It is not something the actor
   *    did, so there is no window to be inside and nothing to pay.
   */
  const combat = request.combat;

  if (!request.voluntary || combat === undefined) {
    root.output = {
      actions: priced.payload.actions,
      reason: priced.payload.reason,
      spent: false,
    };

    return {
      success: true,
      payload: {
        runtime: resolved.payload.runtime,
        transition: resolved.payload,
        cost: priced.payload,
        combatant: combat?.combatant ?? null,
        state: combat?.state ?? null,
        action: null,
      },
      trace: { root },
      warnings: [],
    };
  }

  /*
   * A real Action even when it costs nothing.
   *
   * The cost and the WINDOW are separate rules: a rank X Ken is free, and it
   * is still something the character does on their own Turn or inside a
   * Reaction they already have open. Building the Action at zero cost runs the
   * window check through the same production path that a paid one uses, rather
   * than through a second copy of it that could come to disagree.
   */
  const action: NeutralCombatAction = {
    id: request.transitionId,
    kind: "neutral",
    actorCombatantId: combat.actorCombatantId,
    actionCost: priced.payload.actions,
    intentId: combat.intentId,
    threatenedCombatantIds: [],
  };

  const failure = findActionSpendFailure(action, combat.combatant, combat.state);

  if (failure !== null) {
    return refuse(root, [{
      code: `nen.transition.action.${failure.replace(/-/g, "_")}`,
      message: failure === "wrong-combatant"
        ? "A principle may only be changed on the actor's own Turn, or inside " +
          "a Reaction they already have open."
        : "This character cannot spend the Action this principle change costs.",
      audience: "player",
      required: { actionCost: action.actionCost },
      actual: failure,
      resolution:
        "Wait for their Turn, or change the principle when an Action is free.",
    }]);
  }

  /* 4. Both. */
  const spent = spendCombatAction(action, combat.combatant, combat.state);

  if (!spent.success) {
    return refuse(root, [{
      code: "nen.transition.action.refused",
      message:
        "The Action economy refused a spend that had just been checked; the " +
        "principle transition was discarded rather than half-applied.",
      audience: "developer",
      required: "a spendable Action",
      actual: spent.reason,
    }]);
  }

  root.output = {
    actions: priced.payload.actions,
    reason: priced.payload.reason,
    spent: true,
  };

  return {
    success: true,
    payload: {
      runtime: resolved.payload.runtime,
      transition: resolved.payload,
      cost: priced.payload,
      combatant: spent.combatant,
      state: spent.state,
      action,
    },
    trace: { root },
    warnings: [],
  };
}
