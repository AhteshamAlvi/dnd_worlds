import type {
  CheckDiceInput,
  CheckModifierContribution,
  CheckResolution,
} from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { CharacterStats } from "../../attributes/stats";
import type { ResolvedSensoryProfile } from "../types";
import type {
  ConcealmentMode,
  DetectionSubject,
  PerceptionPhenomenon,
  SenseId,
} from "../scopes";

export interface ConcealmentRoute {
  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
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
