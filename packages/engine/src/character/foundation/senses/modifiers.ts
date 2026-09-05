import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import type { SenseId, SenseSelector } from "./scopes";

export interface ModifySenseEffect {
  readonly type: "modifySense";
  readonly sense: SenseSelector;
  readonly amount: number;
}

export interface GrantSenseEffect {
  readonly type: "grantSense";
  readonly sense: SenseId;
}

export interface SuppressSenseEffect {
  readonly type: "suppressSense";
  readonly sense: SenseSelector;
}

export interface GrantNenPerceptionEffect {
  readonly type: "grantNenPerception";
}

export interface SuppressNenPerceptionEffect {
  readonly type: "suppressNenPerception";
}

export type SensoryEffect =
  | ModifySenseEffect
  | GrantSenseEffect
  | SuppressSenseEffect
  | GrantNenPerceptionEffect
  | SuppressNenPerceptionEffect;

export interface SourcedSenseModifier {
  readonly source: ContributionSourceRef;
  readonly sense: SenseSelector;
  readonly amount: number;
}

export interface SourcedSenseGrant {
  readonly source: ContributionSourceRef;
  readonly sense: SenseId;
}

export interface SourcedSenseSuppression {
  readonly source: ContributionSourceRef;
  readonly sense: SenseSelector;
}

export interface ResolvedSensoryEffects {
  readonly senseModifiers: readonly SourcedSenseModifier[];
  readonly senseGrants: readonly SourcedSenseGrant[];
  readonly senseSuppressions: readonly SourcedSenseSuppression[];
  readonly nenPerceptionGrants: readonly ContributionSourceRef[];
  readonly nenPerceptionSuppressions: readonly ContributionSourceRef[];
}

export const EMPTY_SENSORY_EFFECTS: ResolvedSensoryEffects = {
  senseModifiers: [],
  senseGrants: [],
  senseSuppressions: [],
  nenPerceptionGrants: [],
  nenPerceptionSuppressions: [],
};
