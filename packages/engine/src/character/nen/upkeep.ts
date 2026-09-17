/*
 * Upkeep ownership, projected into Aura's generic vocabulary.
 *
 * Aura charges maintained effects and knows nothing about who owns them beyond
 * the opaque provenance on each commitment. This adapter is where that
 * provenance is JUDGED against the runtime and the stored suppression:
 *
 *   activity-backed   the owner must exist and be running; the upkeep inherits
 *                     the owner's declared capability, ends when the owner or
 *                     anything it is composed of ends, and is exempt from a
 *                     forced suppression exactly when its owner is
 *   standalone        may claim to function through suppression only with an
 *                     Ability source, and is exempt from a forced suppression
 *                     only when every held instance exempts that Ability
 *
 * The exemption itself is matched in ONE place, suppression.ts, for both.
 * Nothing is inferred from a matching string: ownership is what provenance
 * says, and a commitment whose provenance disagrees with the runtime is
 * refused rather than guessed at.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import type { GameTimestamp } from "../../time/types";

import {
  findAuraUpkeepIssues,
  type AuraUpkeepCommitment,
} from "../foundation/aura/upkeep";
import {
  findNenActivity,
  nenActivityRunsUntil,
} from "../foundation/nen/runtime/state";
import type {
  NenActivity,
  NenActivityRuntime,
  NenSuppressionPolicy,
} from "../foundation/nen/runtime/types";
import type { NenState } from "../foundation/nen/types";

import {
  NEN_ABILITY_SOURCE_TYPE,
  nenStoredSuppressionExemptsSource,
} from "./suppression";


export interface NenUpkeepProjectionInput {
  readonly nen: NenState;
  readonly upkeep: readonly AuraUpkeepCommitment[];

  /** The runtime as the caller supplied it: where owners must exist and run. */
  readonly suppliedRuntime: NenActivityRuntime | undefined;

  /** The same runtime after the opening instant's stops. */
  readonly openingRuntime: NenActivityRuntime | undefined;

  /** The stored suppression's activity policy, or null when none is stored. */
  readonly storedPolicy: NenSuppressionPolicy | null;

  readonly startedAt: GameTimestamp;
}


export type NenUpkeepProjection =
  | {
    readonly ok: true;

    /** Commitments as Aura receives them: inherited, clipped, linked. */
    readonly commitments: readonly AuraUpkeepCommitment[];

    /*
     * Which commitments the stored forced suppression exempts, or undefined
     * when nothing stored grants exemptions per instance.
     */
    readonly exemptUpkeepIds: readonly string[] | undefined;
  }
  | { readonly ok: false; readonly errors: readonly EngineError[] };


/* Every activity an owner is composed of, transitively, excluding itself. */
function componentsOf(
  runtime: NenActivityRuntime,
  owner: NenActivity,
): readonly string[] {
  const found = new Set<string>();
  const pending = [owner];

  while (pending.length > 0) {
    const next = pending.pop()!;

    for (const constraint of next.constraints) {
      if (constraint.kind !== "component") continue;
      if (constraint.activityId === owner.id || found.has(constraint.activityId)) continue;

      found.add(constraint.activityId);

      const component = findNenActivity(runtime, constraint.activityId);

      if (component !== undefined) pending.push(component);
    }
  }

  return [...found].sort();
}


/**
 * Judge and project the upkeep a character is holding for this interval.
 */
export function projectNenUpkeep(
  input: NenUpkeepProjectionInput,
): NenUpkeepProjection {
  /*
   * Shape first, by Aura's own rule: ownership cannot be judged against the
   * runtime until it is at least well-formed, and a malformed commitment should
   * be told so rather than that its owner is missing.
   */
  const shape = findAuraUpkeepIssues(input.upkeep);

  if (shape.length > 0) return { ok: false, errors: shape };

  const errors: EngineError[] = [];
  const commitments: AuraUpkeepCommitment[] = [];
  const exempt: string[] = [];

  const perInstance =
    input.storedPolicy !== null && input.storedPolicy.exemptions === "authorized";

  for (const commitment of input.upkeep) {
    const provenance = commitment.provenance;
    const at = `upkeep ${describeDiagnosticValue(commitment?.id)}`;

    if (provenance?.kind === "activity") {
      const owner = input.suppliedRuntime === undefined
        ? undefined
        : findNenActivity(input.suppliedRuntime, provenance.activityId);

      if (owner === undefined) {
        errors.push({
          code: "character.time.upkeep.owner.absent",
          message: `${at} names an owning activity this character's runtime does not hold.`,
          audience: "developer",
          required: "an activity in the supplied runtime",
          actual: describeDiagnosticValue(provenance.activityId),
        });

        continue;
      }

      if (owner.condition !== "active") {
        errors.push({
          code: "character.time.upkeep.owner.stopped",
          message: `${at} is still being charged for an activity that has stopped.`,
          audience: "developer",
          required: "an active owner",
          actual: owner.condition,
          resolution: "Drop upkeep whose owner has stopped; it ended with the owner.",
        });

        continue;
      }

      const capable = owner.functionsThroughSuppression === true;

      if (
        commitment.functionsThroughSuppression !== undefined &&
        commitment.functionsThroughSuppression !== capable
      ) {
        errors.push({
          code: "character.time.upkeep.capability.contradictory",
          message:
            `${at} claims a suppression capability its owning activity does not declare.`,
          audience: "developer",
          required: `functionsThroughSuppression: ${capable} (inherited)`,
          actual: String(commitment.functionsThroughSuppression),
        });

        continue;
      }

      const dependsOn = componentsOf(input.suppliedRuntime!, owner);

      if (
        provenance.dependsOn !== undefined &&
        [...provenance.dependsOn].sort().join("\u0000") !== dependsOn.join("\u0000")
      ) {
        errors.push({
          code: "character.time.upkeep.owner.contradictory",
          message: `${at} states dependencies its owning activity is not composed of.`,
          audience: "developer",
          required: dependsOn.join(", ") || "none",
          actual: describeDiagnosticValue(provenance.dependsOn),
        });

        continue;
      }

      /*
       * Ends with its owner: at the instant the opening stops recorded, or at
       * the instant the owner — or a component — runs out on its own.
       */
      const opening = input.openingRuntime === undefined
        ? owner
        : findNenActivity(input.openingRuntime, owner.id) ?? owner;

      const ownerEnds = opening.condition !== "active"
        ? opening.endedAt ?? input.startedAt
        : nenActivityRunsUntil(input.openingRuntime ?? input.suppliedRuntime!, opening);

      const endsAt = [commitment.endsAt, ownerEnds ?? undefined]
        .filter((one): one is number => one !== undefined);

      commitments.push({
        ...commitment,
        ...(capable ? { functionsThroughSuppression: true } : {}),
        provenance: {
          kind: "activity",
          activityId: owner.id,
          ...(dependsOn.length === 0 ? {} : { dependsOn }),
        },
        ...(endsAt.length === 0 ? {} : { endsAt: Math.min(...endsAt) }),
      });

      if (
        perInstance &&
        (input.storedPolicy!.exemptActivityIds ?? []).includes(owner.id)
      ) {
        exempt.push(commitment.id);
      }

      continue;
    }

    if (provenance?.kind === "standalone") {
      if (
        commitment.functionsThroughSuppression === true &&
        provenance.source?.type !== NEN_ABILITY_SOURCE_TYPE
      ) {
        errors.push({
          code: "character.time.upkeep.provenance.not_ability",
          message:
            `${at} claims to function through suppression, and only an Ability can.`,
          audience: "developer",
          required: `source.type: ${NEN_ABILITY_SOURCE_TYPE}`,
          actual: describeDiagnosticValue(provenance.source?.type),
        });

        continue;
      }

      if (perInstance && nenStoredSuppressionExemptsSource(input.nen, provenance.source)) {
        exempt.push(commitment.id);
      }
    }

    commitments.push(commitment);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    commitments,
    exemptUpkeepIds: perInstance ? exempt : undefined,
  };
}
