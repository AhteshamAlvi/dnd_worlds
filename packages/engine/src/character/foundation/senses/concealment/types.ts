import type {
  CheckDiceInput,
  CheckModifierContribution,
  CheckResolution,
} from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { CharacterStats } from "../../attributes/stats";
import type { ResolvedSensoryProfile } from "../types";
import type { ConcealmentMode } from "../scopes";
import type { SensoryReceiverRef } from "../receivers";
import type { SensoryRouteTerms } from "../routes";

/*
 * What a Concealment attempt is rated against.
 *
 * The four shared route terms, plus an OPTIONAL receiver.
 *
 * Optional, because a hider rates their own findability and has no idea what
 * organs are pointed at them. Invisibility is a statement about `visible-light`
 * — it is not a statement about eyes, and certainly not about which pair. So
 * the ordinary rating names no receiver and covers every receiver reading that
 * channel, which is what makes one hiding roll answer the whole room.
 *
 * Present when a rating genuinely IS receiver-specific — something that hides
 * from a particular network or cluster and not from another. Lookup prefers an
 * exact receiver match and falls back to the receiver-less rating, so the
 * specific case is expressible without the general case paying for it.
 */
export interface ConcealmentRoute extends SensoryRouteTerms {
  readonly receiver?: SensoryReceiverRef;
}

/*
 * What the Concealment value is being derived FROM.
 *
 * The character basis carries the resolved sensory profile alongside the raw
 * stats because passive Concealment is a stored resolved value
 * (profile.passiveConcealmentBase), not something this resolver recomputes.
 * Active and established Concealment roll the Concealment Derived Attribute
 * instead, which is why the stats are still here. Both come out of the same
 * resolveCharacter() pass, so requiring both costs a caller nothing and makes
 * "passive reads the stored base" true by construction rather than by
 * validation.
 */
export type ConcealmentBasis =
  | {
      readonly kind: "character";
      readonly stats: CharacterStats;
      readonly profile: ResolvedSensoryProfile;
    }
  | {
      readonly kind: "authored-information";
      readonly baseModifier: number;
      readonly factors?: readonly ConcealmentFactor[];
    };

export interface ConcealmentFactor {
  readonly kind: "age" | "faintness" | "scarcity" | "damage" | "environment" | "other";
  readonly amount: number;
  readonly sourceId: string;
}

export interface ConcealmentRequest {
  readonly mode: ConcealmentMode;
  readonly basis: ConcealmentBasis;
  readonly routes: readonly ConcealmentRoute[];
  readonly dice?: CheckDiceInput;
  readonly modifiers?: readonly CheckModifierContribution[];
}

export interface ConcealmentRating {
  readonly route: ConcealmentRoute;
  readonly mode: ConcealmentMode;
  readonly total: number;
  readonly check?: CheckResolution;
  readonly trace: TraceNode;
}

export interface ConcealmentResolution {
  readonly mode: ConcealmentMode;
  readonly ratings: readonly ConcealmentRating[];
  readonly sharedDice?: CheckResolution["dice"];
  readonly trace: TraceNode;
}
