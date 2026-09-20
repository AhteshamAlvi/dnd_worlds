/*
 * Routes — one emission, one observer, and every way the first could reach the
 * second.
 *
 * A route is the complete statement of a perception path: which Sense, which
 * channel, which of that Sense's receivers, what kind of phenomenon, and what
 * kind of subject. It is what Detection rolls through, what Concealment is
 * rated against, and what a Reaction Gate is bound to — so if two things are
 * the same route they must be the same route in all five terms.
 *
 *
 * GENERATED, NEVER SUPPLIED
 *
 * The caller hands in a cue and whatever exposure and contact facts it knows.
 * It does not hand in a route, and it specifically does not hand in a
 * receiver: a torch does not emit light into your left eye. Everything below
 * is derivation from the observer's own profile.
 *
 * The one exception is a deliberate host override, which is a first-class
 * input rather than a hole — a GM ruling that something reaches a character by
 * a path no rule describes is a legitimate answer, and making it explicit is
 * better than making it impossible and watching somebody fake it with a
 * registry entry.
 *
 *
 * SEVERAL CANDIDATES, STILL ONE ROLL
 *
 * One tremor can produce a Touch candidate through the whole-body network, a
 * Touch candidate through a palm, and a Vibration Sense candidate through
 * dedicated anatomy. All three are real and all three are generated. What does
 * NOT happen is three Detection rolls: the passive sweep compares them for
 * free and everything rolled afterwards goes through the single best one. More
 * senses must make a character better at noticing, not luckier.
 *
 *
 * WHY INTENSITY IS RESOLVED HERE
 *
 * Because it is observer-dependent. The same emission arrives at intensity 3
 * for an ordinary observer and intensity 5 for one with Night Vision, and the
 * modifier the check sees is `received - 5`. Resolving it at route generation
 * means the number is fixed once, travels with the route, and is compared by
 * Reaction Gate settlement — rather than being recomputed by each consumer
 * from an emission and a profile that may both have moved.
 */

import {
  NEUTRAL_SENSORY_INTENSITY,
  getSensoryChannel,
  type SensoryChannelId,
  type SensoryIntensity,
} from "./channels";
import { emittedChannels, type ResolvedSensoryCue } from "./cues";
import { sensesReceiving } from "./definitions";
import { receiverKey, type SensoryReceiverRef } from "./receivers";
import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import type { CriticalPointId } from "../body/critical-points/types";
import { receivedIntensityFor } from "./profile";
import type {
  DetectionSubject,
  PerceptionPhenomenon,
  SenseId,
} from "./scopes";
import type { ResolvedSensoryProfile } from "./types";


/*
 * The four terms a Concealment can be rated against.
 *
 * Deliberately NOT including the receiver. A hider is doing something about
 * how findable they are; they are not doing something about which of the
 * watcher's organs finds them, and they have no way to know what organs the
 * watcher has. Asking a Concealment to rate itself per observer-receiver would
 * make hiding depend on the audience, which is the opposite of how the
 * established-roll lifecycle works.
 */
export interface SensoryRouteTerms {
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
}


/** A complete perception path. The receiver is mandatory. */
export interface SensoryRoute extends SensoryRouteTerms {
  readonly receiver: SensoryReceiverRef;
}


/**
 * The four shared terms, as a key.
 *
 * What Concealment ratings are looked up by, and what a channel-scoped
 * modifier matches against.
 */
export function sensoryRouteTermsKey(terms: SensoryRouteTerms): string {
  return `${terms.sense}|${terms.channel}|${terms.phenomenon}|${terms.subject}`;
}


/**
 * One complete route's identity.
 *
 * Terms plus receiver, and the receiver key sorts its point ids — so the same
 * pair of eyes is the same route however the host happened to order them.
 * Dropping either half is a real defect: without the channel, invisibility and
 * silence become the same concealment; without the receiver, a Reaction Gate
 * prepared against the facial eyes could be settled through a palm.
 */
export function sensoryRouteKey(route: SensoryRoute): string {
  return `${sensoryRouteTermsKey(route)}|${receiverKey(route.receiver)}`;
}


export function sameSensoryRouteTerms(
  left: SensoryRouteTerms,
  right: SensoryRouteTerms,
): boolean {
  return sensoryRouteTermsKey(left) === sensoryRouteTermsKey(right);
}


export function sameSensoryRoute(
  left: SensoryRoute,
  right: SensoryRoute,
): boolean {
  return sensoryRouteKey(left) === sensoryRouteKey(right);
}


/**
 * One generated route, with everything the check will need.
 *
 * `receivedIntensity` is the observer's number, after reception modifiers, and
 * `intensityModifier` is `received - 5`. Both are carried so that no consumer
 * has to recompute either — and so that Reaction Gate settlement can compare
 * them and refuse a Gate whose world got louder in between.
 */
export interface GeneratedSensoryRoute {
  readonly route: SensoryRoute;

  readonly cueId: string;
  readonly source: ContributionSourceRef;

  /** What the cue declared, before this observer's reception modifiers. */
  readonly emittedIntensity: SensoryIntensity;

  readonly receivedIntensity: SensoryIntensity;

  /** `receivedIntensity - 5`. Added to exactly one check, exactly once. */
  readonly intensityModifier: number;
}


/**
 * The propagation and exposure facts only the caller knows.
 *
 * Every field is optional, and absent means "do not filter on this" — except
 * for contact, where absent means no contact is happening, because contact is
 * a positive fact. A caller that says nothing about touching has not touched
 * anything.
 */
export interface SensoryExposureFacts {
  /** Anatomical Points currently in contact with the source or its medium. */
  readonly contactedPointIds?: readonly CriticalPointId[];

  /** Receivers in contact, for granted Senses that have no points. */
  readonly contactedReceiverKeys?: readonly string[];

  /**
   * Receivers reachable at all right now.
   *
   * Absent means every receiver is reachable. Supplying it is how a blindfold
   * covers the facial eyes while leaving the eye in a palm working, with no
   * new Effect and no Sense-level suppression.
   */
  readonly exposedReceiverKeys?: readonly string[];

  /** Channels stopped before they arrive — a wall, a vacuum, a ward. */
  readonly blockedChannels?: readonly SensoryChannelId[];

  /** Receivers that cannot be reached by anything at all. */
  readonly blockedReceiverKeys?: readonly string[];
}


export interface GenerateSensoryRoutesInput {
  readonly profile: ResolvedSensoryProfile;
  readonly cue: ResolvedSensoryCue;
  readonly exposure?: SensoryExposureFacts;

  /**
   * Routes the host is asserting directly.
   *
   * Appended after generation and never filtered, because the point of an
   * override is that the ordinary rules did not produce it. A GM who says the
   * character feels this one is not asking to be second-guessed by the
   * exposure facts.
   */
  readonly overrides?: readonly GeneratedSensoryRoute[];
}


function isReachable(
  receiverKeyValue: string,
  exposure: SensoryExposureFacts | undefined,
): boolean {
  if (exposure === undefined) return true;

  if (exposure.blockedReceiverKeys?.includes(receiverKeyValue) === true) {
    return false;
  }

  return exposure.exposedReceiverKeys === undefined ||
    exposure.exposedReceiverKeys.includes(receiverKeyValue);
}


/**
 * Whether a contact channel has actually reached this receiver.
 *
 * Contact is a POSITIVE fact and is therefore refused by default: a character
 * standing in a corridor is not tasting the floor. A caller says what is being
 * touched, either by naming the points in contact or by naming the receiver
 * outright — which is what a granted Sense with no anatomy needs.
 */
function isContacted(
  receiver: SensoryReceiverRef,
  key: string,
  exposure: SensoryExposureFacts | undefined,
): boolean {
  if (exposure === undefined) return false;

  if (exposure.contactedReceiverKeys?.includes(key) === true) return true;

  const contacted = exposure.contactedPointIds;

  if (contacted === undefined || receiver.kind === "granted") return false;

  return receiver.pointIds.some((pointId) => contacted.includes(pointId));
}


/**
 * Every route one cue opens onto one observer.
 *
 * Deterministically ordered — channels sorted, Senses sorted, receivers in the
 * profile's own sorted order — so that a best-route tie resolves the same way
 * on every host rather than following object iteration order.
 */
export function generateSensoryRoutes(
  input: GenerateSensoryRoutesInput,
): readonly GeneratedSensoryRoute[] {
  const { profile, cue, exposure } = input;
  const generated: GeneratedSensoryRoute[] = [];

  for (const channel of emittedChannels(cue)) {
    if (exposure?.blockedChannels?.includes(channel) === true) continue;

    const emitted = cue.emissions[channel];

    /* Zero is not an intensity; emittedChannels() has already dropped it. */
    if (emitted === undefined) continue;

    const definition = getSensoryChannel(channel);

    if (definition === undefined) continue;

    for (const candidate of sensesReceiving(channel)) {
      const sense = profile.senses[candidate.id];

      /*
       * Availability is checked against THIS observer, and so is the channel
       * list: a restricted ESP grant receives `danger` and genuinely does not
       * receive `hostile-intent`, so the second generates nothing.
       */
      if (sense === undefined || !sense.available) continue;
      if (!sense.channels.includes(channel)) continue;

      const receivedIntensity = receivedIntensityFor(
        sense,
        channel,
        emitted,
      ) as SensoryIntensity;

      for (const receiver of sense.receivers) {
        /* A receiver with no working anatomy is not a route, it is a scar. */
        if (receiver.functionalSupport <= 0) continue;

        if (!isReachable(receiver.key, exposure)) continue;

        if (
          definition.propagation === "contact" &&
          !isContacted(receiver.ref, receiver.key, exposure)
        ) {
          continue;
        }

        generated.push({
          route: {
            sense: candidate.id,
            channel,
            receiver: receiver.ref,
            phenomenon: cue.phenomenon,
            subject: cue.subject,
          },
          cueId: cue.id,
          source: cue.source,
          emittedIntensity: emitted,
          receivedIntensity,
          intensityModifier: receivedIntensity - NEUTRAL_SENSORY_INTENSITY,
        });
      }
    }
  }

  return [...generated, ...(input.overrides ?? [])];
}
