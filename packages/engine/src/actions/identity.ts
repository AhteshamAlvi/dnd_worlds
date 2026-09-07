/*
 * Who is acting, and what supplies the mechanic.
 *
 * These are two different questions and the engine has been bitten by systems
 * that answer them with one field. Gon punching with a Skill, an Item firing
 * on its own trigger, and a trap discharging all have a mechanical SOURCE; a
 * Skill used by Gon and the same Skill used by Killua have different ACTORS.
 * One id cannot mean both without the first mechanic that needs to charge a
 * cost to somebody guessing which one it has.
 *
 * The source reuses ContributionSourceRef rather than declaring a third
 * provenance shape, for the reason that file's header gives: two structural
 * definitions of "which content produced this" drift, and TypeScript will not
 * notice.
 */

import type { ContributionSourceRef } from "../infrastructure/contribution-source";
import type { EngineError } from "../infrastructure/diagnostics";


/** Identity of an authored action profile. */
export type ActionProfileId = string;

/** Identity of one concrete attempt. */
export type ActionIntentId = string;


/**
 * The acting subject.
 *
 * Not necessarily a Character: an Item, a summon, a construct or a hazard can
 * all act, and `type` stays open for the same reason ContributionSourceRef's
 * does.
 */
export interface ActorRef {
  readonly type: string;
  readonly id: string;
}


/** What supplies the mechanic being used: a Skill, an Item, an improvisation. */
export type ActionSourceRef = ContributionSourceRef;


export function actorKey(actor: ActorRef): string {
  return `${actor.type}:${actor.id}`;
}


export function isSameActor(left: ActorRef, right: ActorRef): boolean {
  return left.type === right.type && left.id === right.id;
}


export function findActorIssues(actor: ActorRef): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof actor.type !== "string" || actor.type.trim().length === 0) {
    errors.push({
      code: "actions.actor.type.missing",
      message: "An actor must state what kind of thing it is.",
      audience: "developer",
      required: "non-empty actor type",
      actual: String(actor.type),
    });
  }

  if (typeof actor.id !== "string" || actor.id.trim().length === 0) {
    errors.push({
      code: "actions.actor.id.missing",
      message: "An actor must be identified.",
      audience: "developer",
      required: "non-empty actor id",
      actual: String(actor.id),
    });
  }

  return errors;
}


export function findActionSourceIssues(
  source: ActionSourceRef,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof source.type !== "string" || source.type.trim().length === 0) {
    errors.push({
      code: "actions.source.type.missing",
      message: "An action's mechanical source must state its content type.",
      audience: "developer",
      required: "non-empty source type",
      actual: String(source.type),
    });
  }

  if (typeof source.id !== "string" || source.id.trim().length === 0) {
    errors.push({
      code: "actions.source.id.missing",
      message: "An action's mechanical source must be identified.",
      audience: "developer",
      required: "non-empty source id",
      actual: String(source.id),
    });
  }

  return errors;
}
