/*
 * What it costs to change what you are doing with your Nen.
 *
 * One rule for every ordinary principle — Ken, Gyō, Shū, and the ones that
 * come after them — rather than a cost field on each, because a per-principle
 * figure is a per-principle table that will disagree with itself by the fourth
 * entry. The rule is short:
 *
 *     effective mastery I-VII      1 Action to start, adjust or stop
 *     effective mastery VIII-X     0 Actions
 *
 * Mastery is what buys the speed. A practitioner who has drilled Ken to VIII
 * does not need a beat to raise it; one at III does. That is the entire
 * content of the table, and expressing it as a threshold rather than as ten
 * rows is what stops somebody "tuning" rank VI later.
 *
 *
 * WHAT THIS FILE IS NOT ALLOWED TO KNOW
 * -------------------------------------
 *
 * What an Action IS. There is no import of `gameplay/combat` here and there
 * must not be: this file answers "how many", and the Action economy, the Turn
 * and Reaction windows, the shared pool and the state cap all belong to
 * Combat. `gameplay/nen` is where the two meet, and it is the only place they
 * are allowed to.
 *
 *
 * TEN AND HATSU ARE NOT HERE
 * --------------------------
 *
 * Ten produces no transitions at all. It is derived state rather than an
 * activity — there is nothing to start — so it never reaches this function,
 * and that is a property of Ten rather than an exemption granted here.
 *
 * Hatsu and Nen Abilities are governed by their own rule: at least one Action
 * regardless of mastery. Nothing in this file applies to them, and the Hatsu
 * adapter does not call it. A rank X Ability that became free because its user
 * was skilled would be a different game.
 *
 *
 * THE TWO WAYS A COST CAN BE WAIVED
 * ---------------------------------
 *
 *   bundled   a Skill's own application includes the transition. The Skill
 *             pays what the Skill costs; the transition adds nothing. A Skill
 *             that merely REQUIRES an already-active principle bundles
 *             nothing — it demands a state, it does not enter one.
 *
 *   waived    a resolved Trait says this character does not pay for this.
 *
 * Both arrive as an AUTHORIZATION, and every field of it is a binding rather
 * than a description — the same shape Aura's differential grants use, for the
 * same reason. A bare `free: true` is a token: copy it onto another
 * transition, another character, or another principle, and the rule it was
 * meant to express is gone. Checking the id, the owner, the principle and the
 * kind against the transition actually being resolved is what makes forging
 * one require forging the thing it authorizes.
 *
 * An authorization that does NOT match is refused outright rather than
 * ignored. Silently charging the Action would look identical to the mechanic
 * working, which is the failure mode that survives longest.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import {
  isSameContributionSource,
  type ContributionSourceRef,
} from "../../../../infrastructure/contribution-source";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";

import { STANDARD_MASTERY_MAX } from "../../../capabilities/mastery";


/** What one voluntary transition costs below the threshold. */
export const PRINCIPLE_TRANSITION_ACTION_COST = 1;

/** The effective rank from which a voluntary transition is free. */
export const PRINCIPLE_TRANSITION_FREE_FROM_RANK = 8;


/*
 * The three things a character can voluntarily do to a running principle.
 *
 * Stopping is in the list and costs the same as starting, which is
 * deliberate: letting go of a held Output under control is an act, and a free
 * stop would make "drop Ken, act, re-raise Ken" cheaper than holding it.
 */
export const PRINCIPLE_TRANSITION_KINDS = [
  "start",
  "adjust",
  "stop",
] as const;

export type PrincipleTransitionKind =
  typeof PRINCIPLE_TRANSITION_KINDS[number];


export const PRINCIPLE_ACTION_EXEMPTIONS = ["bundled", "waived"] as const;

export type PrincipleActionExemption =
  typeof PRINCIPLE_ACTION_EXEMPTIONS[number];


/*
 * Permission not to pay, bound to what it was granted for.
 *
 * Every field is checked against the transition being resolved. `grantedBy` is
 * the resolved authored source — a Skill's application, a Trait's resolution —
 * and is provenance rather than a permission bit: a trace has to be able to
 * say WHICH Skill made this free.
 */
export interface PrincipleActionAuthorization {
  readonly kind: PrincipleActionExemption;

  /** Must equal the transition's own id. */
  readonly transitionId: string;

  /** Must equal the owner whose transition this is. */
  readonly owner: string;

  /** Must equal the principle being transitioned. */
  readonly principleId: string;

  /** Which of the three this covers. Non-empty. */
  readonly kinds: readonly PrincipleTransitionKind[];

  /** The resolved authored source that granted it. Never a boolean. */
  readonly grantedBy: ContributionSourceRef;

  /** Why, for a trace. Never parsed. */
  readonly summary: string;
}


export interface PrincipleTransitionCostInput {
  readonly transitionId: string;
  readonly owner: string;
  readonly principleId: string;
  readonly kind: PrincipleTransitionKind;

  /** The principle's EFFECTIVE rank, after seals. */
  readonly effectiveMastery: number;

  /*
   * Whether the character chose this.
   *
   * False for everything the world did to them: a budget that fell below what
   * was committed, an Item that left the contact network, a seal, an expiry.
   * A forced reduction costs nothing, because being reduced is not an act.
   */
  readonly voluntary: boolean;

  readonly authorization?: PrincipleActionAuthorization;
}


export interface PrincipleTransitionCost {
  readonly actions: number;

  /*
   * Which rule produced the figure, so a trace never has to infer it.
   *
   *   forced      the character did not choose this
   *   mastery     rank VIII or better
   *   authorized  a bundle or a waiver, named below
   *   standard    the ordinary one Action
   */
  readonly reason: "forced" | "mastery" | "authorized" | "standard";

  /** Present only when `reason` is `authorized`. */
  readonly authorization?: PrincipleActionAuthorization;
}


function refuse(
  traceNode: ReturnType<typeof createTraceNode>,
  errors: readonly EngineError[],
): EngineResult<PrincipleTransitionCost> {
  traceNode.output = false;

  return {
    success: false,
    trace: { root: traceNode },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


function isTransitionKind(value: unknown): value is PrincipleTransitionKind {
  return typeof value === "string" &&
    (PRINCIPLE_TRANSITION_KINDS as readonly string[]).includes(value);
}


function isSourceRef(value: unknown): value is ContributionSourceRef {
  const ref = value as { readonly type?: unknown; readonly id?: unknown };

  return ref !== null && typeof ref === "object" &&
    typeof ref.type === "string" && ref.type.length > 0 &&
    typeof ref.id === "string" && ref.id.length > 0;
}


/*
 * Everything wrong with an authorization, judged AGAINST the transition.
 *
 * Structure first, then the four bindings. A well-formed grant for somebody
 * else's transition is exactly as refused as a malformed one, and reported
 * differently, because they are different mistakes: one is a bug in the
 * content, the other is a grant being reused where it does not apply.
 */
function findAuthorizationIssues(
  input: PrincipleTransitionCostInput,
): readonly EngineError[] {
  const authorization = input.authorization;

  if (authorization === undefined) return [];

  if (authorization === null || typeof authorization !== "object") {
    return [{
      code: "nen.transition.authorization.malformed",
      message:
        "A waiver of a principle's Action cost must be a resolved " +
        "authorization, never a bare flag.",
      audience: "developer",
      required: "PrincipleActionAuthorization",
      actual: describeDiagnosticValue(authorization),
    }];
  }

  const errors: EngineError[] = [];

  if (
    !(PRINCIPLE_ACTION_EXEMPTIONS as readonly unknown[])
      .includes(authorization.kind)
  ) {
    errors.push({
      code: "nen.transition.authorization.malformed",
      message: "An Action-cost authorization must say which kind it is.",
      audience: "developer",
      required: PRINCIPLE_ACTION_EXEMPTIONS.join(" | "),
      actual: describeDiagnosticValue(authorization.kind),
    });
  }

  if (!isSourceRef(authorization.grantedBy)) {
    errors.push({
      code: "nen.transition.authorization.unproven",
      message:
        "An Action-cost authorization must name the resolved source that " +
        "granted it; an unattributed exemption is a permission bit.",
      audience: "developer",
      required: "{ type, id }",
      actual: describeDiagnosticValue(authorization.grantedBy),
    });
  }

  if (
    typeof authorization.summary !== "string" ||
    authorization.summary.trim().length === 0
  ) {
    errors.push({
      code: "nen.transition.authorization.unproven",
      message:
        "An Action-cost authorization must say why, so a trace can show it.",
      audience: "developer",
      required: "non-empty summary",
      actual: describeDiagnosticValue(authorization.summary),
    });
  }

  if (
    !Array.isArray(authorization.kinds) ||
    authorization.kinds.length === 0 ||
    !authorization.kinds.every(isTransitionKind)
  ) {
    errors.push({
      code: "nen.transition.authorization.malformed",
      message:
        "An Action-cost authorization must list the transition kinds it covers.",
      audience: "developer",
      required: PRINCIPLE_TRANSITION_KINDS.join(" | "),
      actual: describeDiagnosticValue(authorization.kinds),
    });
  }

  if (errors.length > 0) return errors;

  /* The four bindings, each naming what it was compared against. */
  const bindings: readonly (readonly [string, unknown, unknown])[] = [
    ["transition", authorization.transitionId, input.transitionId],
    ["owner", authorization.owner, input.owner],
    ["principle", authorization.principleId, input.principleId],
  ];

  for (const [what, granted, actual] of bindings) {
    if (granted === actual) continue;

    errors.push({
      code: "nen.transition.authorization.mismatched",
      message:
        `This Action-cost authorization was granted for a different ${what}.`,
      audience: "developer",
      required: describeDiagnosticValue(actual),
      actual: describeDiagnosticValue(granted),
    });
  }

  if (!authorization.kinds.includes(input.kind)) {
    errors.push({
      code: "nen.transition.authorization.mismatched",
      message:
        `This Action-cost authorization does not cover a "${input.kind}".`,
      audience: "developer",
      required: input.kind,
      actual: authorization.kinds.join(" | "),
    });
  }

  return errors;
}


/**
 * What one principle transition costs in Actions.
 *
 * A number and the rule that produced it. It does not spend anything, does not
 * know whether the character has the Actions, and does not know whether they
 * are in a Turn — `gameplay/nen` asks Combat all three, and settles both
 * halves together or neither.
 */
export function resolvePrincipleTransitionCost(
  input: PrincipleTransitionCostInput,
): EngineResult<PrincipleTransitionCost> {
  const traceNode = createTraceNode({
    id: "nen.transition.action-cost",
    label: "Resolve a principle transition's Action cost",
    formula:
      `effective mastery < ${PRINCIPLE_TRANSITION_FREE_FROM_RANK} costs ` +
      `${PRINCIPLE_TRANSITION_ACTION_COST}; at or above it costs 0`,
    inputs: {
      principleId: { value: describeDiagnosticValue(input?.principleId) },
      kind: { value: describeDiagnosticValue(input?.kind) },
      effectiveMastery: {
        value: describeDiagnosticValue(input?.effectiveMastery),
      },
      voluntary: { value: describeDiagnosticValue(input?.voluntary) },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.transition.cost.malformed",
      message: "A principle transition cost needs an input object.",
      audience: "developer",
      required: "PrincipleTransitionCostInput",
      actual: describeDiagnosticValue(input),
    }]);
  }

  const structural: EngineError[] = [];

  for (
    const [field, value] of [
      ["transitionId", input.transitionId],
      ["owner", input.owner],
      ["principleId", input.principleId],
    ] as const
  ) {
    if (typeof value === "string" && value.trim().length > 0) continue;

    structural.push({
      code: "nen.transition.cost.malformed",
      message: `A principle transition must name its ${field}.`,
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(value),
    });
  }

  if (!isTransitionKind(input.kind)) {
    structural.push({
      code: "nen.transition.cost.malformed",
      message: "A principle transition must be a start, an adjust or a stop.",
      audience: "developer",
      required: PRINCIPLE_TRANSITION_KINDS.join(" | "),
      actual: describeDiagnosticValue(input.kind),
    });
  }

  if (typeof input.voluntary !== "boolean") {
    structural.push({
      code: "nen.transition.cost.malformed",
      message:
        "A principle transition must say whether the character chose it; a " +
        "forced reduction and a deliberate one cost different things.",
      audience: "developer",
      required: "boolean",
      actual: describeDiagnosticValue(input.voluntary),
    });
  }

  const mastery = input.effectiveMastery;

  if (
    typeof mastery !== "number" || !Number.isInteger(mastery) ||
    mastery < 1 || mastery > STANDARD_MASTERY_MAX
  ) {
    structural.push({
      code: "nen.transition.mastery.invalid",
      message:
        "A principle transition is priced against a learned effective rank " +
        "from I through X.",
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: describeDiagnosticValue(mastery),
    });
  }

  if (structural.length > 0) return refuse(traceNode, structural);

  /*
   * The authorization is validated even when the transition would be free
   * anyway. A malformed grant on a rank X Ken is still malformed content, and
   * reporting it only when it happened to matter is how it reaches production
   * attached to the rank VI character who needs it.
   */
  const authorizationIssues = findAuthorizationIssues(input);

  if (authorizationIssues.length > 0) {
    return refuse(traceNode, authorizationIssues);
  }

  const answer = ((): PrincipleTransitionCost => {
    if (!input.voluntary) return { actions: 0, reason: "forced" };

    if (mastery >= PRINCIPLE_TRANSITION_FREE_FROM_RANK) {
      return { actions: 0, reason: "mastery" };
    }

    if (input.authorization !== undefined) {
      return {
        actions: 0,
        reason: "authorized",
        authorization: input.authorization,
      };
    }

    return { actions: PRINCIPLE_TRANSITION_ACTION_COST, reason: "standard" };
  })();

  traceNode.output = { actions: answer.actions, reason: answer.reason };

  return { success: true, payload: answer, trace: { root: traceNode }, warnings: [] };
}


/**
 * Whether two authorizations came from the same resolved source.
 *
 * Exposed so a caller reconciling several grants does not reimplement source
 * comparison — which is the engine-wide one, not a Nen-specific idea of it.
 */
export function isSameAuthorizationSource(
  left: PrincipleActionAuthorization,
  right: PrincipleActionAuthorization,
): boolean {
  return isSameContributionSource(left.grantedBy, right.grantedBy);
}
