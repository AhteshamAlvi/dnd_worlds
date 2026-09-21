/*
 * Shared threat-awareness fixtures.
 *
 * Built on the real Fire Blast, reached through the real lifecycle, for the
 * same reason composition-fire-blast.test.ts is: it is the engine's only
 * genuine ranged projectile, so it is the only shipped content with a real
 * travel phase and therefore a real release-versus-impact distinction. Every
 * timing rule in ECP-2 is about that gap.
 *
 * The observers here have ESP GRANTED rather than assumed. `danger` is
 * received by exactly one Sense and that Sense is grant-only, so a fixture
 * that skipped the grant would be testing a character who cannot feel danger
 * at all — which is a real and important case, and is the fixture below it.
 */

import { getSkillDefinition } from "../../character/capabilities/skills";
import {
  resolveEffectiveSkillApplication,
  resolveSkillActionValues,
  skillActionProfile,
} from "../../character/capabilities/applications";
import { prepareAction } from "../../actions/preparation";
import type { ActionProposal } from "../../actions/proposal";
import { NO_FOCUS } from "../../actions/focus";
import { UNSTRUCTURED_EXECUTION } from "../../actions/timing";
import { resolvePassiveConcealment } from "../../character/foundation/senses/concealment/passive";
import type { ConcealmentRating } from "../../character/foundation/senses/concealment";
import type { ResolvedSensoryProfile } from "../../character/foundation/senses/types";
import {
  prepareActionProjections,
  stepsForProposal,
  type ActionProjector,
} from "../../gameplay/composition";
import type { ActionPhaseRef } from "../../gameplay/composition/phases";
import {
  threatIdentity,
  type ThreatIdentity,
} from "../../gameplay/awareness";
import type { RelationshipFactSet } from "../../gameplay/awareness";
import { seconds } from "../../time/duration";
import type { DistanceInterval, MetricPosition, SpatialTravel } from "../../spatial";

import { payloadOf } from "./result";
import { effects, sensoryProfile, sensoryStats, source } from "./senses";
import { canonicalEmissionProfile } from "./vault-content";

export const CLEARING = "forest-clearing";

export function at(xMetres: number, yMetres = 0): MetricPosition {
  return { kind: "metric", contextId: CLEARING, xMetres, yMetres, zMetres: 0 };
}

export const BENDER = at(0);
export const QUARRY = at(30);

export const DECLARED_AT = 10_000;

export const FIRE_BLAST_SOURCE = { type: "skill", id: "fire-blast" } as const;

export const SHOUT_METHOD = { type: "communication", id: "ordinary-shout" } as const;

/*
 * The real Vault documents, read from disk. Every awareness suite that asserts a
 * shout is intensity 5 or that a blast is a threat is therefore asserting it
 * about the JSON an author edits, rather than about a copy kept in TypeScript.
 */
export const PROFILES = [
  canonicalEmissionProfile("fire-blast"),
  canonicalEmissionProfile("ordinary-shout"),
];

const DECLARED_RANGE: DistanceInterval = {
  kind: "direct",
  minimumMetres: 0,
  maximumMetres: 60,
};

const DECLARED_TRAVEL: SpatialTravel = { kind: "speed", metresPerSecond: 15 };


/** A grant that makes ESP — and therefore the danger channel — available. */
const DANGER_SENSE = { source: source("danger-sense"), sense: "esp" };


/**
 * An observer who can feel danger.
 *
 * Granted explicitly, because ESP has no automatic unlock at any attribute and
 * a fixture that pretended otherwise would test a rule that was removed.
 */
export function dangerSensitiveProfile(): ResolvedSensoryProfile {
  return sensoryProfile({ effects: effects({ senseGrants: [DANGER_SENSE] }) });
}


/** An observer with ordinary anatomy and no danger sense at all. */
export function ordinaryProfile(): ResolvedSensoryProfile {
  return sensoryProfile();
}


/**
 * The passive Concealment standing against an observer on the given routes.
 *
 * A fire blast is not hiding, so this is the ordinary passive total every
 * Detection is measured against — not a zero, and not an absence. Detection
 * against nothing at all would be a comparison with no opposing number.
 */
export function unconcealedRatings(
  routes: readonly {
    readonly sense: string;
    readonly channel: string;
    readonly phenomenon: "physical" | "nen" | "other-supernatural" | "intent";
    readonly subject: "entity" | "object" | "action" | "threat" | "trace" | "environment" | "phenomenon";
  }[],
): readonly ConcealmentRating[] {
  return payloadOf(resolvePassiveConcealment({
    mode: "passive",
    basis: {
      kind: "character",
      stats: sensoryStats(),
      profile: sensoryProfile(),
    },
    routes: [...routes],
  })).ratings;
}


/**
 * The Concealment standing against an observer when the source IS hiding.
 *
 * A fire blast charged from behind cover, by somebody who does not want to be
 * felt coming. The extra points arrive as an ordinary contextual Concealment
 * modifier rather than as a hand-written total, so the number the Gate is
 * rolled against is one the real resolver produced.
 */
export function concealedRatings(
  extra: number,
  routes: readonly {
    readonly sense: string;
    readonly channel: string;
    readonly phenomenon: "physical" | "nen" | "other-supernatural" | "intent";
    readonly subject: "entity" | "object" | "action" | "threat" | "trace" | "environment" | "phenomenon";
  }[],
): readonly ConcealmentRating[] {
  return payloadOf(resolvePassiveConcealment({
    mode: "passive",
    basis: {
      kind: "character",
      stats: sensoryStats(),
      profile: sensoryProfile(),
    },
    routes: [...routes],
    modifiers: [{
      source: source("deep-cover", "environment"),
      scope: { kind: "concealment" },
      amount: extra,
      channel: "contextual",
    }],
  })).ratings;
}


/** The route terms a projected danger cue opens onto an ESP observer. */
export const DANGER_ROUTE = {
  sense: "esp",
  channel: "danger",
  phenomenon: "intent",
  subject: "threat",
} as const;


/** The route terms an ordinary shout opens onto anyone who can hear. */
export const SHOUT_ROUTE = {
  sense: "hearing",
  channel: "sound",
  phenomenon: "physical",
  subject: "action",
} as const;


export function fireBlastProposal(): ActionProposal {
  const definition = getSkillDefinition("fire-blast");
  const effective = resolveEffectiveSkillApplication(definition!.application!, 2);

  const resolved = resolveSkillActionValues(effective.action, {
    range: { profileId: "aura.declared-power.range", value: DECLARED_RANGE },
    executionDuration: {
      profileId: "combat.action-duration",
      value: seconds(2),
    },
    travel: { profileId: "aura.declared-power.travel", value: DECLARED_TRAVEL },
  });

  const profile = skillActionProfile("fire-blast", effective, resolved.values!);

  return payloadOf(prepareAction({
    operationId: "op-1",
    profile,
    intent: {
      id: "intent-1",
      profileId: profile.id,
      actor: { type: "character", id: "bender" },
      targets: [{ kind: "entity", entityId: "quarry" }],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
    },
    approach: "mechanical",
    spatial: {
      origin: BENDER,
      placements: [{ targetIndex: 0, position: QUARRY }],
      facts: { lineOfEffect: { clear: true } },
    },
  }));
}


export function fireBlastProjector(proposal = fireBlastProposal()): ActionProjector {
  const steps = stepsForProposal(proposal, DECLARED_AT);

  return payloadOf(prepareActionProjections({
    snapshot: {
      actionId: proposal.intentId,
      proposalId: proposal.operationId,
      phase: steps[0]!,
      declaredAt: DECLARED_AT,
      actor: { actor: proposal.actor, position: BENDER },
      targets: [
        { target: { kind: "entity", entityId: "quarry" }, position: QUARRY },
      ],
      implementation: { implement: FIRE_BLAST_SOURCE },
      stateBinding: {
        boundAt: DECLARED_AT,
        revisions: [{ owner: "actor:bender", revision: "b1" }],
      },
      spatial: {
        contextId: CLEARING,
        origin: BENDER,
        targetPositions: [QUARRY],
        ...(proposal.measuredDistance === undefined
          ? {}
          : { separation: proposal.measuredDistance }),
        facts: { lineOfEffect: { clear: true } },
      },
      environment: { illumination: "normal" } as never,
      adjustments: [],
    },
    steps,
    sources: [FIRE_BLAST_SOURCE],
    profiles: PROFILES,
    threatens: proposal.threatens !== "none",
    capability: DECLARED_RANGE,
    anchors: { actor: BENDER, target: QUARRY },
  }));
}


export function fireBlastSteps(proposal = fireBlastProposal()): readonly ActionPhaseRef[] {
  return stepsForProposal(proposal, DECLARED_AT);
}


/** The danger cue one step emits, or undefined for a step that emits none. */
export function dangerCueAt(projector: ActionProjector, step: ActionPhaseRef) {
  return projector.cuesAt(step)
    .find((entry) => entry.cue.emissions.danger !== undefined);
}


/**
 * One threat identity for a subject, built from the real proposal's timing.
 *
 * `releaseAt` and `impactAt` come from `stepsForProposal`, so the gap between
 * them is the Skill's real flight time rather than a number chosen here.
 */
export function fireBlastThreat(overrides: {
  readonly subjectId?: string;
  readonly combatantId?: string;
  readonly severity?: 1 | 2 | 3 | 4 | 5;
  readonly spatialRevision?: string;
  readonly consequenceId?: string;
  readonly impactAt?: number;
} = {}): ThreatIdentity {
  const steps = fireBlastSteps();
  const release = steps.find((step) => step.phase === "release")!;
  const impact = steps.find((step) => step.phase === "impact")!;

  return threatIdentity({
    actionId: "intent-1",
    proposalId: "op-1",
    implement: FIRE_BLAST_SOURCE,
    implementationRevision: "impl-1",
    actorId: "bender",
    subject: {
      subjectId: overrides.subjectId ?? "quarry",
      ...(overrides.combatantId === undefined
        ? {}
        : { combatantId: overrides.combatantId }),
    },
    severity: overrides.severity ?? 3,
    confidence: "probable",
    ...(overrides.consequenceId === undefined
      ? {}
      : { consequenceId: overrides.consequenceId }),
    timing: {
      releaseAt: release.occursAt!,
      impactAt: overrides.impactAt ?? impact.occursAt!,
    },
    spatialRevision: overrides.spatialRevision ?? "space-1",
  });
}


/** A host's answer naming everyone the subject is allied to. */
export function alliedWith(
  subjectId: string,
  allyIds: readonly string[],
  overrides: {
    readonly queryId?: string;
    readonly contextRevision?: string;
    readonly opposed?: readonly string[];
  } = {},
): RelationshipFactSet {
  return {
    queryId: overrides.queryId ?? "rel-1",
    contextId: CLEARING,
    contextRevision: overrides.contextRevision ?? "scene-1",
    reportedBy: { type: "host", id: "table" },
    facts: [
      ...allyIds.map((relatedId) => ({
        participantId: subjectId,
        relatedId,
        relationship: "allied" as const,
      })),
      ...(overrides.opposed ?? []).map((relatedId) => ({
        participantId: subjectId,
        relatedId,
        relationship: "opposed" as const,
      })),
    ],
  };
}
