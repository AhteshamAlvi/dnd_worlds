/*
 * The sensory check vocabulary — declared here and nowhere else.
 *
 * Perception phenomena, Detection and Concealment modes, Detection and
 * Investigation subjects, the four sensory check scopes, their selectors, and
 * selector matching all live in this file. checks/scopes.ts imports them to
 * compose CheckScope and re-exports them; checks/matching.ts imports the
 * matchers rather than reimplementing them.
 *
 * It reads backwards at first that the universal check module depends on a
 * Foundation domain, but that is the direction that already holds: scopes.ts
 * imports AttributeKey and DerivedAttributeName the same way. A check is
 * something you make AGAINST a capability, so the capability names the terms.
 *
 *
 * WHAT IS NO LONGER CLOSED
 *
 * `SenseId` and `SensoryChannelId` used to be closed unions declared here, and
 * they are not any more — they are registry-backed open strings owned by
 * definitions.ts and channels.ts. This file re-exports them so the check
 * vocabulary still reads as one surface, and it deliberately declares NO
 * second list of senses or channels of its own. `PHYSICAL_SENSE_IDS` is gone
 * for exactly that reason: it was a second closed list, free to disagree with
 * the first, and a selector that wants "the ordinary five" now says
 * `{ kind: "family", family: "basic" }` and gets the answer from the registry.
 *
 * The rule this file still exists to keep: exactly one declaration per closed
 * list. The lists that remain genuinely closed — phenomena, modes, subjects —
 * are mechanics rather than content, and architecture.test.ts fails if a
 * duplicate of one reappears.
 *
 *
 * WHY `channel` IS ON THE SCOPE
 *
 * Because concealment is channel-specific and could not be said otherwise.
 * Invisibility hides you from `visible-light`; it does not hide you from a
 * dog. Before channels, both of those arrived at the sensory domain as "sight"
 * and "smell" with no shared vocabulary for what was actually being hidden, so
 * a hiding Effect had to name the observer's ORGAN. Naming the carrier instead
 * means one invisibility modifier correctly covers Sight, a homebrew
 * compound-eye Sense and anything else that reads light, without listing them.
 */

import {
  getSenseDefinition,
  isSenseId,
  senseReceivesChannel,
  type SenseFamily,
  type SenseId,
} from "./definitions";
import { isSensoryChannelId, type SensoryChannelId } from "./channels";

export { isSenseId };
export { isSensoryChannelId };
export type { SenseId, SenseFamily };
export type { SensoryChannelId };

export const PERCEPTION_PHENOMENA = [
  "physical",
  "nen",
  "other-supernatural",
  "intent",
] as const;

export type PerceptionPhenomenon = typeof PERCEPTION_PHENOMENA[number];

export const DETECTION_MODES = ["passive", "active", "reaction"] as const;
export type DetectionMode = typeof DETECTION_MODES[number];

export const CONCEALMENT_MODES = ["passive", "active", "established"] as const;
export type ConcealmentMode = typeof CONCEALMENT_MODES[number];

export const DETECTION_SUBJECTS = [
  "entity",
  "object",
  "action",
  "threat",
  "trace",
  "environment",
  "phenomenon",
] as const;
export type DetectionSubject = typeof DETECTION_SUBJECTS[number];

export const INVESTIGATION_SUBJECTS = [
  "entity",
  "anatomy",
  "environment",
  "event",
  "evidence",
  "combat-style",
  "technique",
  "ability",
  "nen",
  "deception",
] as const;
export type InvestigationSubject = typeof INVESTIGATION_SUBJECTS[number];


/*
 * Four ways to name a set of Senses, and none of them enumerate ids.
 *
 *   all       every Sense
 *   family    every Sense of one family, resolved from the registry
 *   channel   every Sense that receives one channel — "whatever reads light"
 *   specific  exactly one
 *
 * `family` and `channel` are what replaced `all-physical`. Both ask the
 * registry, so a host's newly registered Sense is included the moment it is
 * registered rather than the next time somebody remembers to edit a constant.
 */
export type SenseSelector =
  | { readonly kind: "all" }
  | { readonly kind: "family"; readonly family: SenseFamily }
  | { readonly kind: "channel"; readonly channel: SensoryChannelId }
  | { readonly kind: "specific"; readonly sense: SenseId };

export type SensoryChannelSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly channel: SensoryChannelId };

export type PhenomenonSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly phenomenon: PerceptionPhenomenon };

export type DetectionModeSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly mode: DetectionMode };

export type ConcealmentModeSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly mode: ConcealmentMode };

export type DetectionSubjectSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly subject: DetectionSubject };

export type InvestigationSubjectSelector =
  | { readonly kind: "all" }
  | { readonly kind: "specific"; readonly subject: InvestigationSubject };

export interface PerceptionCheckScope {
  readonly kind: "perception";
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
  readonly phenomenon: PerceptionPhenomenon;
}

export interface DetectionCheckScope {
  readonly kind: "detection";
  readonly mode: DetectionMode;
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
}

export interface ConcealmentCheckScope {
  readonly kind: "concealment";
  readonly mode: ConcealmentMode;
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
}

export interface InvestigationCheckScope {
  readonly kind: "investigation";
  readonly subject: InvestigationSubject;
  readonly sense?: SenseId;
  readonly channel?: SensoryChannelId;
  readonly phenomenon?: PerceptionPhenomenon;
}

export interface PerceptionCheckScopeSelector {
  readonly kind: "perception";
  readonly sense?: SenseSelector;
  readonly channel?: SensoryChannelSelector;
  readonly phenomenon?: PhenomenonSelector;
}

export interface DetectionCheckScopeSelector {
  readonly kind: "detection";
  readonly mode?: DetectionModeSelector;
  readonly sense?: SenseSelector;
  readonly channel?: SensoryChannelSelector;
  readonly phenomenon?: PhenomenonSelector;
  readonly subject?: DetectionSubjectSelector;
}

export interface ConcealmentCheckScopeSelector {
  readonly kind: "concealment";
  readonly mode?: ConcealmentModeSelector;
  readonly sense?: SenseSelector;
  readonly channel?: SensoryChannelSelector;
  readonly phenomenon?: PhenomenonSelector;
  readonly subject?: DetectionSubjectSelector;
}

export interface InvestigationCheckScopeSelector {
  readonly kind: "investigation";
  readonly subject?: InvestigationSubjectSelector;
  readonly sense?: SenseSelector;
  readonly channel?: SensoryChannelSelector;
  readonly phenomenon?: PhenomenonSelector;
}

export type SensoryCheckScope =
  | PerceptionCheckScope
  | DetectionCheckScope
  | ConcealmentCheckScope
  | InvestigationCheckScope;

export type SensoryCheckScopeSelector =
  | PerceptionCheckScopeSelector
  | DetectionCheckScopeSelector
  | ConcealmentCheckScopeSelector
  | InvestigationCheckScopeSelector;

export function isPerceptionPhenomenon(value: unknown): value is PerceptionPhenomenon {
  return typeof value === "string" &&
    (PERCEPTION_PHENOMENA as readonly string[]).includes(value);
}

export function isDetectionSubject(value: unknown): value is DetectionSubject {
  return typeof value === "string" &&
    (DETECTION_SUBJECTS as readonly string[]).includes(value);
}


/**
 * Whether one concrete Sense falls inside a selector's set.
 *
 * The `family` and `channel` branches read the registry rather than a copied
 * list, which is what makes an unknown Sense id answer `false` instead of
 * throwing — a modifier authored against a Sense the host later unregistered
 * simply stops matching, which is the right behaviour for a dangling
 * reference at check time.
 */
export function matchesSenseSelector(
  selector: SenseSelector,
  sense: SenseId,
): boolean {
  if (selector.kind === "all") return true;
  if (selector.kind === "specific") return selector.sense === sense;

  const definition = getSenseDefinition(sense);

  if (definition === undefined) return false;

  return selector.kind === "family"
    ? definition.family === selector.family
    : senseReceivesChannel(definition, selector.channel);
}

export function matchesSensoryChannelSelector(
  selector: SensoryChannelSelector,
  channel: SensoryChannelId,
): boolean {
  return selector.kind === "all" || selector.channel === channel;
}

export function matchesPhenomenonSelector(
  selector: PhenomenonSelector,
  phenomenon: PerceptionPhenomenon,
): boolean {
  return selector.kind === "all" || selector.phenomenon === phenomenon;
}
