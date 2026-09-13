/*
 * Awakened characters, built the only way the engine allows.
 *
 * Every helper here runs a REAL transition. None of them constructs an
 * awakened state by hand, and that is the point: a fixture that wrote
 * `condition: "awakened"` directly would be a second mutation route with none
 * of the validation, and every test built on it would be testing a state the
 * engine cannot actually produce.
 *
 * It also keeps the fixtures honest about what each route costs. A standard
 * awakener HAS Ten I and does not leak; an abrupt one has nothing and leaks at
 * their full Output Capacity a minute. Those are different characters, and a
 * test that wants one must not silently get the other.
 */

import {
  awakenNenAbrupt,
  awakenNenStandard,
} from "../../character/nen/transitions";
import { revertNen } from "../../character/nen/reversion";
import type {
  NenAwakeningContext,
  NenAwakeningTransitionResult,
} from "../../character/nen/protocol";
import { ABRUPT_AWAKENING_SUCCESS_PURPOSE } from "../../character/nen/protocol";
import { createUnawakenedNenState } from "../../character/foundation/nen/nen";
import type { NenState } from "../../character/foundation/nen/types";
import type { Attributes } from "../../character/foundation/attributes/types";
import type { RequirementContext } from "../../character/rules/resolution";
import type { RuntimeOwnerRef } from "../../runtime/domains";

import { TEST_ATTRIBUTES } from "./character";
import { unassignedNenType } from "../../character/foundation/nen/nen-type";


/** Comfortably over every standard threshold, so eligibility is never the subject. */
export const AWAKENING_CAPABLE: Attributes = {
  ...TEST_ATTRIBUTES,
  con: 13,
  vit: 13,
  per: 13,
  wis: 13,
  spi: 16,
};


export const TEST_AWAKENING_OWNER: RuntimeOwnerRef = {
  domain: "character",
  id: "test-subject",
};


export function requirementContextFor(
  attributes: Attributes = AWAKENING_CAPABLE,
): RequirementContext {
  return {
    attributes: { stored: attributes, base: attributes, resolved: attributes },
    level: 1,
  };
}


export function awakeningContext(overrides: {
  readonly nen?: NenState;
  readonly attributes?: Attributes;
  readonly operationId?: string;
  readonly occurredAt?: number;
  readonly owner?: RuntimeOwnerRef;
} = {}): NenAwakeningContext {
  return {
    owner: overrides.owner ?? TEST_AWAKENING_OWNER,
    operationId: overrides.operationId ?? "op-1",
    occurredAt: overrides.occurredAt ?? 0,
    nen: overrides.nen ?? createUnawakenedNenState(unassignedNenType()),
    requirements: requirementContextFor(
      overrides.attributes ?? AWAKENING_CAPABLE,
    ),
  };
}


/** The payload, or a readable failure rather than a `!` on undefined. */
export function expectAwakened(
  result: NenAwakeningTransitionResult,
): NenState {
  if (!result.success) {
    throw new Error(
      `awakening transition failed: ${
        result.errors.map((error) => error.code).join(", ")
      }`,
    );
  }

  return result.payload.state;
}


/**
 * Awakened through standard training: Ten I, stable, not leaking.
 *
 * What most tests mean by "an awakened character" — somebody who went through
 * the ordinary route and can contain their own Aura.
 */
export function standardAwakenedNen(
  attributes: Attributes = AWAKENING_CAPABLE,
): NenState {
  return expectAwakened(
    awakenNenStandard(
      awakeningContext({ attributes }),
      { method: "standard", trainingCompleted: true },
    ),
  );
}


/**
 * Awakened abruptly: open nodes, NO Ten, leaking.
 *
 * The fresh-awakener state. The roll is a 1, which succeeds against any
 * probability the clamp permits — deterministic, and it exercises the real
 * dice contract rather than bypassing it.
 */
export function abruptAwakenedNen(
  attributes: Attributes = AWAKENING_CAPABLE,
): NenState {
  return expectAwakened(
    awakenNenAbrupt(awakeningContext({ attributes }), {
      method: "abrupt",
      actor: {
        ref: { type: "test", id: "capable-actor" },
        capability: [],
      },
      actorContext: requirementContextFor(),
      rolls: [{
        purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE,
        sides: 100,
        values: [1],
      }],
    }),
  );
}


/**
 * Awakened through standard training, then reverted by an exceptional source.
 *
 * Keeps Ten I as a retained rank the character cannot currently use, which is
 * the state the old awakening boolean could not represent at all.
 */
export function revertedNen(
  attributes: Attributes = AWAKENING_CAPABLE,
): NenState {
  const awakened = standardAwakenedNen(attributes);

  return expectAwakened(
    revertNen(
      awakeningContext({ nen: awakened, attributes, operationId: "op-2" }),
      {
        source: { type: "test", id: "reverting-source" },
        reason: "A test fixture reverting a character.",
      },
    ),
  );
}
