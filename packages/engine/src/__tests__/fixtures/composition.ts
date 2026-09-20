/*
 * Fixtures for the action composition suites.
 *
 *
 * WHY THE BOW AND THE ARROW LIVE HERE AND NOT IN THE CATALOG
 *
 * The engine deliberately ships almost no content. `ITEM_DEFINITIONS` holds
 * two illustrative Items, `ITEM_FAMILY_DEFINITIONS` holds one family, and the
 * decision log is explicit about why: "an authored Item is a rule the moment
 * it ships". A canonical bow would mean choosing its range bands, its
 * ammunition semantics and its damage contribution — a weapon taxonomy the
 * repository has twice declined to design, and which ECP-1 lists under
 * "do not bundle catalog expansion".
 *
 * So the bow and the arrow are FIXTURES, registered through the same emission
 * profile shape production content uses. That is enough to prove the property
 * the vertical slice actually needs — that a Skill inherits its implement's
 * emissions without any resolver knowing what a bow is — while the real
 * production consumer of the pipeline remains the real `fire-blast` Skill,
 * which is the engine's one genuine ranged projectile.
 *
 *
 * WHY THE ATTENUATION TABLES ARE WRITTEN OUT IN FULL
 *
 * Because the alternative is a test that passes for the wrong reason. If these
 * suites leaned on the authored campfire or fire-blast tables, then changing a
 * balance number would break propagation tests that were never about balance,
 * and the tests would quietly be asserting today's content rather than the
 * mechanism. Every attenuation a propagation test depends on is stated in the
 * test's own fixture.
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { EmissionProfileDefinition } from "../../gameplay/composition/profiles";
import type {
  ActionPhaseRef,
  PreparedActionSnapshot,
  SensoryEmissionAdjustment,
} from "../../gameplay/composition";
import { derivedStateRevisions } from "../../gameplay/composition";
import type { MetricPosition } from "../../spatial";


export const CONTEXT = "scene-1";


export function at(xMetres: number): MetricPosition {
  return {
    kind: "metric",
    contextId: CONTEXT,
    xMetres,
    yMetres: 0,
    zMetres: 0,
  };
}


export const ARCHER = at(0);
export const QUARRY = at(40);


export const BOW: ContributionSourceRef = { type: "item", id: "test-bow" };
export const ARROW: ContributionSourceRef = {
  type: "item",
  id: "test-arrow",
  instanceId: "quiver-1",
};
export const LOOSE: ContributionSourceRef = { type: "skill", id: "test-loose" };


/** A bow that is loud where the archer is, and nowhere else. */
export const BOW_PROFILE: EmissionProfileDefinition = {
  id: "test-bow-emissions",
  name: "Test bow emissions",
  description: "A bowstring's snap on release.",
  appliesTo: { type: "item", id: "test-bow" },
  threatSeverity: 3,
  emissions: [
    {
      appliesTo: { phase: "release" },
      subject: "action",
      phenomenon: "physical",
      channel: "sound",
      intensity: 3,
      anchor: "actor",
    },
  ],
};


/** An arrow: quieter at the bow, and the only thing that makes noise on arrival. */
export const ARROW_PROFILE: EmissionProfileDefinition = {
  id: "test-arrow-emissions",
  name: "Test arrow emissions",
  description: "Fletching in the air and a head striking home.",
  appliesTo: { type: "item", id: "test-arrow" },
  emissions: [
    {
      appliesTo: { phase: "release" },
      subject: "action",
      phenomenon: "physical",
      channel: "sound",
      intensity: 2,
      anchor: "actor",
    },
    {
      appliesTo: { phase: "travel" },
      subject: "action",
      phenomenon: "physical",
      channel: "air-displacement",
      intensity: 2,
      anchor: "step",
    },
    {
      appliesTo: { phase: "impact" },
      subject: "action",
      phenomenon: "physical",
      channel: "sound",
      intensity: 5,
      anchor: "target",
    },
    {
      appliesTo: { phase: "aftermath" },
      subject: "trace",
      phenomenon: "physical",
      channel: "visible-light",
      intensity: 3,
      anchor: "target",
    },
  ],
};


/**
 * A Skill that says nothing about noise at all.
 *
 * Deliberately emission-bearing on one unrelated channel only, so that
 * "the Skill contributed nothing to sound" is a real inheritance rather than
 * the Skill simply having no profile to find.
 */
export const LOOSE_PROFILE: EmissionProfileDefinition = {
  id: "test-loose-emissions",
  name: "Test loose emissions",
  description: "A trained loose, which is no louder than an untrained one.",
  appliesTo: { type: "skill", id: "test-loose" },
  emissions: [
    {
      appliesTo: { phase: "preparation" },
      subject: "action",
      phenomenon: "physical",
      channel: "visible-light",
      intensity: 2,
      anchor: "actor",
    },
  ],
};


export const ARCHERY_PROFILES: readonly EmissionProfileDefinition[] = [
  LOOSE_PROFILE,
  BOW_PROFILE,
  ARROW_PROFILE,
];

export const ARCHERY_SOURCES: readonly ContributionSourceRef[] = [
  LOOSE,
  BOW,
  ARROW,
];


export function step(
  phase: ActionPhaseRef["phase"],
  overrides: Partial<ActionPhaseRef> = {},
): ActionPhaseRef {
  const sequence = {
    preparation: 0,
    release: 1,
    travel: 2,
    impact: 3,
    aftermath: 4,
  }[phase];

  return {
    phase,
    stepId: phase,
    sequence,
    occursAt: 1_000 + sequence,
    ...overrides,
  };
}


export const ARCHERY_STEPS: readonly ActionPhaseRef[] = [
  step("preparation"),
  step("release"),
  step("travel"),
  step("impact"),
  step("aftermath"),
];


/** A GM silencing one channel, signed and reasoned. */
export function silence(
  channel: string,
  phase: ActionPhaseRef["phase"] = "release",
): SensoryEmissionAdjustment {
  return {
    source: { type: "effect", id: "muffling-ward" },
    appliesTo: { phase },
    channel: channel as SensoryEmissionAdjustment["channel"],
    operation: "suppress",
    authorization: {
      authorizedBy: "gm",
      reason: "A muffling ward covers the clearing.",
    },
  };
}


export interface SnapshotOverrides {
  readonly phase?: ActionPhaseRef;
  readonly adjustments?: readonly SensoryEmissionAdjustment[];
  readonly spatial?: Partial<PreparedActionSnapshot["spatial"]>;
  readonly environment?: PreparedActionSnapshot["environment"];
  readonly implementation?: PreparedActionSnapshot["implementation"];
  readonly revisions?: PreparedActionSnapshot["stateBinding"]["revisions"];
}


export function snapshot(
  overrides: SnapshotOverrides = {},
): PreparedActionSnapshot {
  return {
    actionId: "action-1",
    proposalId: "proposal-1",
    phase: overrides.phase ?? step("release"),
    declaredAt: 1_000,
    actor: { actor: { type: "character", id: "archer" }, position: ARCHER },
    targets: [
      { target: { kind: "entity", entityId: "quarry" }, position: QUARRY },
    ],
    implementation: overrides.implementation ?? {
      implement: LOOSE,
      consumables: [ARROW],
    },
    stateBinding: {
      boundAt: 1_000,
      revisions: overrides.revisions ?? [
        { owner: "actor:archer", revision: "a1" },
      ],
    },
    spatial: {
      contextId: CONTEXT,
      origin: ARCHER,
      targetPositions: [QUARRY],
      separation: { kind: "direct", metres: 40 },
      ...overrides.spatial,
    },
    environment: overrides.environment ?? { illumination: "normal" },
    adjustments: overrides.adjustments ?? [],
  };
}


/** What the world currently looks like, for a snapshot that has not gone stale. */
export function currentRevisions(
  taken: PreparedActionSnapshot,
): PreparedActionSnapshot["stateBinding"]["revisions"] {
  return [...taken.stateBinding.revisions, ...derivedStateRevisions(taken)];
}
