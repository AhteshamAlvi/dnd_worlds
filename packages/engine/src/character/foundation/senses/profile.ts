/*
 * Sensory profile resolution — what this creature can actually perceive.
 *
 * The rule that changed everything: a Sense is available because the creature
 * HAS THE ANATOMY FOR IT or because something granted it, and never merely
 * because the Sense exists. The old model handed every character all five
 * physical senses at PER by construction, which meant a decapitated head saw
 * perfectly, a Species with no eyes saw perfectly, and blinding somebody
 * required an Effect that explicitly said "suppress sight" rather than
 * destroying their eyes.
 *
 *
 * THE ARITHMETIC, ONCE
 *
 *   support_s   = sum over contributing points of (share * functionalFraction)
 *   SenseScore  = floor(scoreBasis * support + persistent modifiers)
 *
 * The flooring happens EXACTLY ONCE, at the end, over the complete
 * expression. Not per point, not per averaged attribute, not before the
 * modifiers. Two Human eyes are 0.50 each and a lost eye halves the score,
 * which is the whole point of shares being fractions — rounding them first
 * would make eight eyes lose nothing when one went.
 *
 * Support is NOT clamped to 1. A Species authored with four 0.4 eyes has
 * support 1.6 and sees better than a Human, and clamping would silently delete
 * the only statement its author was making.
 *
 *
 * FIXED SHARES VS NETWORKS
 *
 * A discrete organ carries an authored share: two eyes, half each. Lose one
 * and half the Sight goes with it.
 *
 * Distributed anatomy carries a WEIGHT and is normalized against the members
 * that are present, so a skin is one surface rather than thirteen organs. Lose
 * an arm and the rest of the skin renormalizes to 1.00 — the character does
 * not feel less, they simply have less to feel with. That asymmetry is
 * deliberate and it is what the two contribution kinds exist to express.
 *
 *
 * A GRANT FLOORS SUPPORT; IT DOES NOT ADD TO IT
 *
 * `max(anatomical, granted)`, not a sum. A Trait that lets you see without
 * eyes should do nothing at all for somebody who already has two working ones
 * — adding would double their Sight score for owning a redundancy.
 *
 *
 * WHAT THIS FILE REFUSES TO DO
 *
 * Branch on a Sense id. ESP's grant-only availability, its floor-averaged
 * score and its five channels are read off its definition exactly as Sight's
 * are read off Sight's, and the same code resolves a host's homebrew. There is
 * no attribute threshold anywhere in this file: the PER 22 / SPI 20 automatic
 * ESP unlock is gone, not disabled.
 */

import { createTraceNode } from "../../../infrastructure/trace";
import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import { deriveStandardModifier } from "../attributes/resolution";
import { resolveDerivedAttribute } from "../attributes/derived/resolution";
import type { CharacterStats } from "../attributes/stats";
import type { ResolvedSensoryFootprints } from "../body/critical-points/footprints";
import type { AnatomicalPointStates } from "../body/critical-points/state";
import { isAnatomicalPointActive } from "../body/critical-points/state";
import type {
  CriticalPointId,
  CriticalPointInstance,
  ResolvedCriticalPoints,
} from "../body/critical-points/types";
import {
  MAXIMUM_SENSORY_INTENSITY,
  MINIMUM_SENSORY_INTENSITY,
  type SensoryChannelId,
} from "./channels";
import {
  getSenseDefinition,
  listSenses,
  type SenseDefinition,
  type SenseScoreBasis,
} from "./definitions";
import { EMPTY_SENSORY_EFFECTS, type ResolvedSensoryEffects } from "./modifiers";
import { canonicalReceiver, receiverKey } from "./receivers";
import { matchesSenseSelector, type SenseId } from "./scopes";
import type {
  ResolvedSense,
  ResolvedSenseReceiver,
  ResolvedSensoryProfile,
  SenseAnatomicalContribution,
  SenseAvailabilityReason,
} from "./types";


/*
 * The Sense an awakened Nen user perceives Aura through.
 *
 * Named once, here, and used for exactly one thing: turning the character's
 * awakening into an ordinary grant of an ordinary Sense. That is not a
 * resolver branching on a built-in id — nothing downstream tests for it, and
 * the Sense resolves through the same generic path as every other. It is the
 * translation of one fact (this character is awakened) into the vocabulary the
 * profile already has, in the one place allowed to know both.
 */
export const NEN_PERCEPTION_SENSE_ID = "aura-perception";

/** Provenance for the grant awakening produces. */
export const NEN_AWAKENING_SENSE_SOURCE: ContributionSourceRef = {
  type: "nen",
  id: "awakening",
};


export interface ResolveSensoryProfileOptions {
  readonly effects?: ResolvedSensoryEffects;
  readonly nenAwakened?: boolean;

  /** Resolved Anatomical Points. Absent means a creature with no anatomy. */
  readonly points?: ResolvedCriticalPoints;

  /** What has happened to those points. Absent means all intact. */
  readonly pointStates?: AnatomicalPointStates;

  /** Resolved footprints, which supply distributed network weights. */
  readonly footprints?: ResolvedSensoryFootprints;
}


interface PointShare {
  readonly point: CriticalPointInstance;
  readonly share: number;
  readonly functionalFraction: number;
  readonly impairedBy: readonly ContributionSourceRef[];
}


/**
 * How well one Anatomical Point is working, in [0, ∞).
 *
 * Zero for anything that is not active — destroyed, suppressed, archived — and
 * otherwise the product of every multiplier addressed at it. A product rather
 * than a sum, because two independent halvings should leave a quarter and not
 * nothing.
 *
 * Multipliers above 1 are permitted. An Ability that sharpens one eye is the
 * same seam as an Injury that clouds it, and forbidding the improving
 * direction would mean inventing a second mechanism for it later.
 */
function resolvePointFunction(
  point: CriticalPointInstance,
  states: AnatomicalPointStates,
  effects: ResolvedSensoryEffects,
): { readonly fraction: number; readonly impairedBy: readonly ContributionSourceRef[] } {
  if (!isAnatomicalPointActive(states, point.id)) {
    return { fraction: 0, impairedBy: [] };
  }

  let fraction = 1;
  const impairedBy: ContributionSourceRef[] = [];

  for (const modifier of effects.pointFunctionModifiers) {
    if (modifier.pointId !== point.id) continue;
    if (!Number.isFinite(modifier.multiplier) || modifier.multiplier < 0) {
      continue;
    }

    fraction *= modifier.multiplier;
    impairedBy.push(modifier.source);
  }

  return { fraction, impairedBy };
}


/**
 * Every point contributing to one Sense, with its share already normalized.
 *
 * Fixed shares pass through unchanged. Network weights are divided by the sum
 * of the weights of the members that are PRESENT AND ACTIVE, which is where
 * "loss of anatomy renormalizes the remaining network" actually happens — a
 * destroyed member leaves both the numerator and the denominator, so the
 * survivors add back to exactly 1.
 */
function collectPointShares(
  senseId: SenseId,
  points: ResolvedCriticalPoints,
  states: AnatomicalPointStates,
  footprints: ResolvedSensoryFootprints | undefined,
  effects: ResolvedSensoryEffects,
): readonly PointShare[] {
  const fixed: PointShare[] = [];

  /* networkId -> members, collected before any of them can be normalized. */
  const networks = new Map<string, {
    point: CriticalPointInstance;
    weight: number;
    fraction: number;
    impairedBy: readonly ContributionSourceRef[];
  }[]>();

  for (const point of points.points) {
    const entry = point.sensory?.functions
      .find((one) => one.senseId === senseId);

    if (entry === undefined) continue;

    const { fraction, impairedBy } = resolvePointFunction(
      point,
      states,
      effects,
    );

    if (entry.contribution.kind === "fixed") {
      fixed.push({
        point,
        share: entry.contribution.amount,
        functionalFraction: fraction,
        impairedBy,
      });

      continue;
    }

    /*
     * A network member with no resolved footprint has no area, so it has no
     * weight. That is a member whose host left the body, and it drops out of
     * both ends of the normalization rather than contributing a zero that
     * would still occupy a slot.
     */
    const area = footprints?.byPointId[point.id]?.squareMetres;

    if (area === undefined || area <= 0) continue;

    const members = networks.get(entry.contribution.networkId) ?? [];

    members.push({
      point,
      weight: area * entry.contribution.sensitivity,
      fraction,
      impairedBy,
    });
    networks.set(entry.contribution.networkId, members);
  }

  const shares: PointShare[] = [...fixed];

  for (const members of networks.values()) {
    /*
     * Only ACTIVE members are in the denominator. An inactive one has left the
     * network, exactly as a severed limb has left the body, and leaving it in
     * would mean a character with a destroyed hand permanently felt 8% less
     * with the skin they still have.
     */
    const total = members
      .filter((one) => one.fraction > 0)
      .reduce((sum, one) => sum + one.weight, 0);

    if (total <= 0) continue;

    for (const member of members) {
      shares.push({
        point: member.point,
        share: member.weight / total,
        functionalFraction: member.fraction,
        impairedBy: member.impairedBy,
      });
    }
  }

  return shares;
}


/**
 * The receivers one Sense resolves, grouped by focus membership.
 *
 * Local clusters key on (host BodyPart, Sense, authored cluster), which is what
 * makes the eyes on one Head a different receiver from the eye on a hand —
 * without either of them being identified by a name or a side.
 *
 * Returned in CANONICAL KEY ORDER, over every receiver at once rather than per
 * kind. Grants used to be appended in the order the Effects happened to arrive
 * in, which was fine while no two of them read the same channel and wrong the
 * moment two did: route generation walks this array, so a cue on a shared
 * channel emitted its candidates in host order, and the sweep's best-route tie
 * — deliberately broken on canonical route identity so a scene saved and
 * reloaded prepares the same Reaction Gate — was being handed its candidates
 * in an order that depended on how the host built its list.
 *
 * The key is the identity route generation, Concealment lookup and Gate
 * binding already compare on, so ordering by it introduces no second notion of
 * which receiver this is. Nothing is merged: two distinct grants remain two
 * receivers with their own sources, support and channels.
 */
function collectReceivers(
  senseId: SenseId,
  shares: readonly PointShare[],
  grantReceivers: readonly ResolvedSenseReceiver[],
  anatomicalChannels: readonly SensoryChannelId[],
): readonly ResolvedSenseReceiver[] {
  const local = new Map<string, { pointIds: CriticalPointId[]; support: number }>();
  const distributed = new Map<
    string,
    { pointIds: CriticalPointId[]; support: number }
  >();

  for (const entry of shares) {
    const focus = entry.point.sensory?.focus;

    if (focus === undefined) continue;

    const support = entry.share * entry.functionalFraction;

    if (focus.kind === "local") {
      const key = localClusterKey(entry.point.hostPartId, senseId, focus.cluster);
      const held = local.get(key) ?? { pointIds: [], support: 0 };

      held.pointIds.push(entry.point.id);
      held.support += support;
      local.set(key, held);

      continue;
    }

    const held = distributed.get(focus.network) ?? { pointIds: [], support: 0 };

    held.pointIds.push(entry.point.id);
    held.support += support;
    distributed.set(focus.network, held);
  }

  const receivers: ResolvedSenseReceiver[] = [];

  for (const clusterKey of [...local.keys()].sort()) {
    const held = local.get(clusterKey)!;
    const ref = canonicalReceiver({
      kind: "anatomical",
      clusterKey,
      pointIds: held.pointIds,
    });

    receivers.push({
      ref,
      key: receiverKey(ref),
      functionalSupport: held.support,
      channels: anatomicalChannels,
    });
  }

  for (const networkId of [...distributed.keys()].sort()) {
    const held = distributed.get(networkId)!;
    const ref = canonicalReceiver({
      kind: "distributed-network",
      networkId,
      pointIds: held.pointIds,
    });

    receivers.push({
      ref,
      key: receiverKey(ref),
      functionalSupport: held.support,
      channels: anatomicalChannels,
    });
  }

  /*
   * A stable sort, so receivers that genuinely share a key — duplicate grant
   * data, which is one receiver written twice — keep a fixed relative order
   * instead of swapping under a comparator that cannot tell them apart.
   */
  return [...receivers, ...grantReceivers]
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}


/**
 * The resolved identity of one local sensory cluster.
 *
 * Three parts, and all three are load-bearing. Drop the host and two Heads
 * share one cluster; drop the Sense and an eye that also senses heat joins the
 * wrong focus; drop the authored cluster and a rear eye joins the facial ones.
 */
export function localClusterKey(
  hostPartId: string,
  senseId: SenseId,
  cluster: string,
): string {
  return `${hostPartId}/${senseId}/${cluster}`;
}


function resolveScoreBasis(
  basis: SenseScoreBasis,
  stats: CharacterStats,
): number {
  if (basis.kind === "fixed") return basis.score;

  if (basis.kind === "attribute") {
    return stats[basis.attribute] ?? 0;
  }

  /*
   * Averaged but NOT floored here. ESP is floor((PER + SPI) / 2 + modifiers),
   * and flooring the average first would make PER 7 / SPI 8 resolve as 7 even
   * when a +1 modifier should have carried it to 8.
   */
  const values = basis.attributes.map((key) => stats[key] ?? 0);

  return values.length === 0
    ? 0
    : values.reduce((sum, one) => sum + one, 0) / values.length;
}


/**
 * One RECEIVER's channel set: a starting list, plus this Sense's channel
 * Effects.
 *
 * `restrictedTo` is a restricted grant's own enabled list and replaces the
 * definition's set for THAT receiver alone. Null is the ordinary start —
 * anatomy, and an unrestricted grant — which begins from the definition.
 *
 * The Effects apply either way, because their scope is the Sense: a Trait that
 * adds `thermal` to Sight adds it wherever Sight is received, and a Condition
 * that suppresses a channel takes it from every receiver it covers. What a
 * restricted grant may not do is reach past itself, which is the whole reason
 * this is called once per receiver instead of once per Sense.
 */
function resolveChannels(
  definition: SenseDefinition,
  restrictedTo: readonly SensoryChannelId[] | null,
  effects: ResolvedSensoryEffects,
): readonly SensoryChannelId[] {
  const base = new Set<SensoryChannelId>(
    restrictedTo ?? definition.receiveChannels,
  );

  for (const grant of effects.senseChannelGrants) {
    if (grant.sense === definition.id) base.add(grant.channel);
  }

  for (const suppression of effects.senseChannelSuppressions) {
    if (matchesSenseSelector(suppression.sense, definition.id)) {
      base.delete(suppression.channel);
    }
  }

  return [...base].sort();
}


/**
 * What the creature receives ANYWHERE, as the sorted union of its receivers.
 *
 * Only active receivers contribute: a channel that arrives exclusively at a
 * destroyed organ is a channel this creature no longer receives, and route
 * generation drops that receiver for the same reason.
 */
function unionReceiverChannels(
  receivers: readonly ResolvedSenseReceiver[],
): readonly SensoryChannelId[] {
  const union = new Set<SensoryChannelId>();

  for (const receiver of receivers) {
    if (receiver.functionalSupport <= 0) continue;

    for (const channel of receiver.channels) union.add(channel);
  }

  return [...union].sort();
}


function resolveReceptionModifiers(
  definition: SenseDefinition,
  channels: readonly SensoryChannelId[],
  effects: ResolvedSensoryEffects,
): Readonly<Record<SensoryChannelId, number>> {
  const modifiers: Record<SensoryChannelId, number> = {};

  for (const entry of effects.senseChannelReception) {
    if (!channels.includes(entry.channel)) continue;
    if (!matchesSenseSelector(entry.sense, definition.id)) continue;
    if (!Number.isFinite(entry.amount)) continue;

    modifiers[entry.channel] = (modifiers[entry.channel] ?? 0) + entry.amount;
  }

  return modifiers;
}


/**
 * Where an arriving intensity lands for one observer, on one channel.
 *
 * Clamped into the 1-10 scale rather than allowed off the end, because the
 * modifier table is defined on that scale and an intensity of 14 would be
 * worth +9 through arithmetic nobody authored. Night Vision makes a dim room
 * bright; it does not make a lit one impossible to miss.
 */
export function receivedIntensityFor(
  sense: ResolvedSense,
  channel: SensoryChannelId,
  emitted: number,
): number {
  const adjusted = emitted + (sense.receptionModifiers[channel] ?? 0);

  return Math.max(
    MINIMUM_SENSORY_INTENSITY,
    Math.min(MAXIMUM_SENSORY_INTENSITY, Math.round(adjusted)),
  );
}


export function resolveSensoryProfile(
  stats: CharacterStats,
  options: ResolveSensoryProfileOptions = {},
): ResolvedSensoryProfile {
  const effects = options.effects ?? EMPTY_SENSORY_EFFECTS;
  const points = options.points ?? { points: [], byId: {} };
  const states = options.pointStates ?? {};

  /*
   * Awakening as an ordinary grant. Everything below then treats Aura
   * Perception exactly as it treats Sight — see NEN_PERCEPTION_SENSE_ID.
   */
  const grants = options.nenAwakened === true
    ? [
      ...effects.senseGrants,
      { source: NEN_AWAKENING_SENSE_SOURCE, sense: NEN_PERCEPTION_SENSE_ID },
    ]
    : effects.senseGrants;

  const pointFunction: Record<CriticalPointId, number> = {};

  for (const point of points.points) {
    pointFunction[point.id] =
      resolvePointFunction(point, states, effects).fraction;
  }

  const senses: Record<SenseId, ResolvedSense> = {};

  for (const definition of listSenses()) {
    const shares = collectPointShares(
      definition.id,
      points,
      states,
      options.footprints,
      effects,
    );

    const anatomy: SenseAnatomicalContribution[] = shares.map((entry) => ({
      pointId: entry.point.id,
      share: entry.share,
      functionalFraction: entry.functionalFraction,
      amount: entry.share * entry.functionalFraction,
      impairedBy: entry.impairedBy,
    }));

    const anatomicalSupport = anatomy.reduce(
      (sum, one) => sum + one.amount,
      0,
    );

    const matchingGrants = grants.filter((grant) => grant.sense === definition.id);
    const grantedSupport = matchingGrants.reduce(
      (best, grant) => Math.max(best, grant.amount ?? 1),
      0,
    );

    const suppressedBy = effects.senseSuppressions.filter((entry) =>
      matchesSenseSelector(entry.sense, definition.id)
    );

    const anatomicallyAvailable = definition.availability !== "granted" &&
      anatomicalSupport > 0;
    const grantAvailable = definition.availability !== "anatomical" &&
      matchingGrants.length > 0;

    /*
     * Suppression wins outright. A blinding Condition is not outvoted by a
     * Trait that granted sight, and the reverse would mean every grant was
     * also an immunity nobody wrote.
     */
    const available = suppressedBy.length === 0 &&
      (anatomicallyAvailable || grantAvailable);

    const availabilityReason: SenseAvailabilityReason = suppressedBy.length > 0
      ? "suppressed"
      : anatomicallyAvailable
        ? "anatomical"
        : grantAvailable
          ? "granted"
          : definition.availability === "granted"
            ? "not-granted"
            : "no-functional-anatomy";

    if (!available && anatomy.length === 0 && matchingGrants.length === 0) {
      /*
       * Absent rather than present-and-false. A Human has no Echolocation
       * entry at all; publishing one carrying a real-looking score would be a
       * number for a capability nobody has, and something downstream would
       * eventually read it.
       */
      continue;
    }

    /*
     * Anatomy's channels, and an unrestricted grant's: the definition's set
     * with this Sense's channel Effects applied. Resolved once and shared,
     * because every receiver that is not restricted has the same answer.
     */
    const anatomicalChannels = resolveChannels(definition, null, effects);

    const matchingModifiers = effects.senseModifiers.filter((modifier) =>
      matchesSenseSelector(modifier.sense, definition.id)
    );

    const support = Math.max(anatomicalSupport, grantedSupport);

    /*
     * ONE floor, over the complete expression. See the header.
     */
    const score = Math.floor(
      resolveScoreBasis(definition.scoreBasis, stats) * support +
        matchingModifiers.reduce((total, one) => total + one.amount, 0),
    );

    const senseAdjustedStats = { ...stats, per: score };
    const detectionScore = resolveDerivedAttribute("detection", senseAdjustedStats);
    const investigationScore = resolveDerivedAttribute(
      "investigation",
      senseAdjustedStats,
    );

    /*
     * One receiver per grant, each with ITS OWN channels. Two restricted
     * grants of one Sense are two receivers supplying two channel sets, and
     * neither of them narrows the other or the anatomy.
     */
    const grantReceivers: ResolvedSenseReceiver[] = matchingGrants.map(
      (grant) => {
        const ref = { kind: "granted" as const, source: grant.source };

        return {
          ref,
          key: receiverKey(ref),
          functionalSupport: grant.amount ?? 1,
          channels: grant.enabledChannels === undefined
            ? anatomicalChannels
            : resolveChannels(definition, grant.enabledChannels, effects),
        };
      },
    );

    const receivers = collectReceivers(
      definition.id,
      shares,
      grantReceivers,
      anatomicalChannels,
    );

    const channels = unionReceiverChannels(receivers);

    senses[definition.id] = {
      id: definition.id,
      score,
      standardModifier: deriveStandardModifier(score),
      available,
      availabilityReason,
      support,
      anatomicalSupport,
      grantedSupport,
      channels,
      receptionModifiers: resolveReceptionModifiers(
        definition,
        channels,
        effects,
      ),
      receivers,
      contributions: matchingModifiers.map(({ source, amount }) => ({
        source,
        amount,
      })),
      anatomy,
      detection: {
        score: detectionScore,
        standardModifier: deriveStandardModifier(detectionScore),
      },
      investigation: {
        score: investigationScore,
        standardModifier: deriveStandardModifier(investigationScore),
      },
      passiveDetectionBase:
        deriveStandardModifier(score) + deriveStandardModifier(stats.wis),
    };
  }

  /*
   * Nen perception as a VIEW of the Aura Perception Sense rather than as a
   * second parallel capability.
   *
   * It used to be its own boolean with its own grants and suppressions, which
   * meant a character could be recorded as perceiving Nen while having no
   * Sense that receives the `aura` channel — two answers to one question. The
   * Effects still exist and still work; they now resolve through the Sense.
   */
  const nenSuppressed = effects.nenPerceptionSuppressions.length > 0;
  const auraSense = senses[NEN_PERCEPTION_SENSE_ID];

  return {
    senses,
    pointFunction,
    nenPerception: {
      available: !nenSuppressed &&
        (auraSense?.available === true ||
          effects.nenPerceptionGrants.length > 0),
      sources: [...effects.nenPerceptionGrants],
      suppressedBy: [...effects.nenPerceptionSuppressions],
    },
    passiveConcealmentBase:
      deriveStandardModifier(stats.dex) + deriveStandardModifier(stats.wis),
    trace: createTraceNode({
      id: "character.senses.profile",
      label: "Resolve sensory profile",
      formula:
        "support = sum(share x functionalFraction); " +
        "score = floor(basis x support + persistent modifiers)",
      inputs: {
        per: { value: stats.per },
        spi: { value: stats.spi },
        sensoryPoints: {
          value: points.points.filter((one) => one.sensory !== undefined).length,
        },
        nenAwakened: { value: Boolean(options.nenAwakened) },
      },
      output: Object.fromEntries(
        Object.keys(senses).sort().map((id) => [
          id,
          { score: senses[id]!.score, available: senses[id]!.available },
        ]),
      ),
    }),
  };
}


export { getSenseDefinition };
