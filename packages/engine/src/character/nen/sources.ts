/*
 * Who or what awakens somebody, and what an exceptional one is allowed to
 * change.
 *
 * Three routes need a source, and they need different things from it:
 *
 *   ABRUPT       needs a CAPABLE EXTERNAL ACTOR. Somebody has to be doing the
 *                forcing, and they have to be able to. "Capable" is expressed
 *                as requirements against the ACTOR rather than as a flag,
 *                because what makes somebody able to tear another person's
 *                nodes open is content's business, not this file's.
 *
 *   INSTINCTIVE  needs an AUTHORIZATION. A GM, a piece of content or a world
 *                event says this happens. There is no rarity roll and nothing
 *                triggers it automatically — an automatic route would make
 *                every sufficiently spiritual character a coin being flipped
 *                in the background.
 *
 *   EXCEPTIONAL  needs the overrides it claims, declared FIELD BY FIELD.
 *
 *
 * FIELD-SCOPED OVERRIDES, AND WHY THEY ARE NOT A BAG OF FLAGS
 * -----------------------------------------------------------
 *
 * An exceptional source states which ordinary rules it replaces and states
 * nothing else. Every rule it does not mention applies normally, and that is
 * the load-bearing half: a source that waives the Attribute thresholds has
 * waived the Attribute thresholds, and has NOT granted Ten, changed a Nen
 * Type, permitted an Ability the character has not developed, or excused any
 * mastery prerequisite anywhere else in the engine.
 *
 * The alternative — an `overrides: true` or a free-form payload — is how one
 * piece of content ends up being the reason a global rule has an exception
 * nobody can find. Here, an override that was not declared cannot be claimed,
 * and the declaration is recorded on the character's history so a sheet can
 * say which rules were not applied to them and why.
 *
 * NOTHING HERE IS A FRANCHISE EXAMPLE. There are no named artifacts, no named
 * characters and no hard-coded special cases; the contract is generic and the
 * content that uses it lives in a catalog.
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { EngineError } from "../../infrastructure/diagnostics";
import type {
  NenAppliedOverride,
  NenExceptionalOverrideField,
} from "../foundation/nen/awakening/types";
import { isNenExceptionalOverrideField } from "../foundation/nen/awakening/types";
import { isNenType, type NenType } from "../foundation/nen/nen-type";
import type { NamedRequirement } from "../rules/requirements";
import type { RequirementContext, RequirementDisposition } from "../rules/resolution";
import {
  namedRequirementDisposition,
  resolveNamedRequirements,
} from "../rules/resolution";


/* ── The external actor ─────────────────────────────────────────────────── */

/*
 * Somebody doing the awakening to somebody else.
 *
 * `capability` is judged against the ACTOR's requirement context, not the
 * subject's. That separation is the whole point: an abrupt awakening is one
 * person's capability applied to another person's body, and evaluating the
 * teacher's prerequisites against the student would be nonsense that happened
 * to compile.
 *
 * An actor who is merely UNRESOLVED — a context that has not recorded the
 * Techniques they hold — is not refused as incapable. The attempt is refused
 * as unresolvable, and the two are reported differently.
 */
export interface NenExternalAwakeningActor {
  readonly ref: ContributionSourceRef;

  /** What the actor must be or know. Empty means no prerequisites. */
  readonly capability: readonly NamedRequirement[];
}


export interface NenActorCapabilityReport {
  readonly disposition: RequirementDisposition;
  readonly actor: ContributionSourceRef;
}


/**
 * Judge an actor against their OWN context.
 *
 * Two arguments rather than one so the call site has to name whose context it
 * is passing, which is the mistake this shape exists to make visible.
 */
export function resolveActorCapability(
  actor: NenExternalAwakeningActor,
  actorContext: RequirementContext,
): NenActorCapabilityReport {
  return {
    disposition: namedRequirementDisposition(
      resolveNamedRequirements(actor.capability, actorContext),
    ),
    actor: actor.ref,
  };
}


/* ── Authorization ──────────────────────────────────────────────────────── */

/*
 * Explicit permission for a transition that never happens on its own.
 *
 * Instinctive awakening requires one. It is a value the caller supplies, not
 * something derived from the character, because deriving it would BE the
 * automatic route the rule forbids.
 */
export interface NenAwakeningAuthorization {
  readonly grantedBy: ContributionSourceRef;
  readonly reason: string;
}


/* ── Exceptional overrides ──────────────────────────────────────────────── */

/**
 * Replaces the standard eligibility bundle with the source's own.
 *
 * An EMPTY requirement list is legitimate and means "no eligibility rules at
 * all", which is different from not declaring the override, which leaves the
 * standard thresholds in force.
 */
export interface NenEligibilityOverride {
  readonly requirements: readonly NamedRequirement[];
  readonly summary: string;
}


/** Forces the character's Nen Type, recording what it was. */
export interface NenTypeOverride {
  readonly type: NenType;
  readonly known: boolean;
  readonly summary: string;
}


/** Whether the character may ever develop a natural Nen Ability. */
export interface NenNaturalAbilityOverride {
  readonly development: "prohibited" | "permitted";
  readonly summary: string;
}


/*
 * What Nen mastery the awakening itself grants.
 *
 * Declared as a LIST OF GRANTS rather than as a "grants Ten" boolean, because
 * an exceptional source may grant nothing, may grant Ten I as the standard
 * route does, or may hand the character mastery from outside themselves.
 * Whatever it declares still passes through the ordinary mastery path and is
 * still validated against the Nen graph — an override of this field changes
 * what is granted, never whether the graph applies.
 */
export interface NenMasteryGrantOverride {
  readonly grants: readonly { readonly principleId: string; readonly rank: number }[];
  readonly summary: string;
}


/** Extra prerequisites the source demands of the SUBJECT. Additive, never a waiver. */
export interface NenPrerequisiteOverride {
  readonly requirements: readonly NamedRequirement[];
  readonly summary: string;
}


/** A note that later progression is altered. Phase 5 records it and applies nothing. */
export interface NenProgressionOverride {
  readonly summary: string;
}


/*
 * Every override an exceptional source may declare, all optional.
 *
 * Absence is the whole design. An undeclared field is an ordinary rule still
 * in force, so the default behaviour of this object is "change nothing", and
 * a source has to say each exception out loud to get it.
 */
export interface NenExceptionalOverrides {
  readonly eligibility?: NenEligibilityOverride;
  readonly nenType?: NenTypeOverride;
  readonly naturalAbilityDevelopment?: NenNaturalAbilityOverride;
  readonly masteryGrant?: NenMasteryGrantOverride;
  readonly prerequisite?: NenPrerequisiteOverride;
  readonly progression?: NenProgressionOverride;
}


/*
 * A content-defined awakening route.
 *
 * `ref` is provenance and is required: an exceptional awakening with no source
 * is an ordinary awakening claiming exceptions, and the history would have
 * nothing to attribute the overridden rules to.
 */
export interface NenExceptionalAwakeningSource {
  readonly ref: ContributionSourceRef;
  readonly overrides: NenExceptionalOverrides;
}


/*
 * Which fields this source declares, in the vocabulary the history records.
 *
 * Derived from the object rather than declared twice, so a source cannot claim
 * an override it did not supply or supply one it did not claim.
 */
export function declaredOverrideFields(
  overrides: NenExceptionalOverrides,
): readonly NenExceptionalOverrideField[] {
  const fields: NenExceptionalOverrideField[] = [];

  if (overrides.eligibility !== undefined) fields.push("eligibility");
  if (overrides.nenType !== undefined) fields.push("nenType");

  if (overrides.naturalAbilityDevelopment !== undefined) {
    fields.push("naturalAbilityDevelopment");
  }

  if (overrides.masteryGrant !== undefined) fields.push("masteryGrant");
  if (overrides.prerequisite !== undefined) fields.push("prerequisite");
  if (overrides.progression !== undefined) fields.push("progression");

  return fields;
}


/** The overrides as they are written onto the character's history. */
export function appliedOverrides(
  overrides: NenExceptionalOverrides,
): readonly NenAppliedOverride[] {
  const summaries: Record<NenExceptionalOverrideField, string | undefined> = {
    eligibility: overrides.eligibility?.summary,
    nenType: overrides.nenType?.summary,
    naturalAbilityDevelopment: overrides.naturalAbilityDevelopment?.summary,
    masteryGrant: overrides.masteryGrant?.summary,
    prerequisite: overrides.prerequisite?.summary,
    progression: overrides.progression?.summary,
  };

  return declaredOverrideFields(overrides).map((field) => ({
    field,
    summary: summaries[field] ?? field,
  }));
}


/* ── Validation ─────────────────────────────────────────────────────────── */

function sourceRefIssues(
  ref: ContributionSourceRef | undefined,
  what: string,
): readonly EngineError[] {
  if (
    ref !== undefined &&
    typeof ref === "object" &&
    ref !== null &&
    typeof ref.type === "string" &&
    ref.type.trim().length > 0 &&
    typeof ref.id === "string" &&
    ref.id.trim().length > 0
  ) {
    return [];
  }

  return [{
    code: "nen.awakening.source.invalid",
    message: `${what} must name the content that supplied it.`,
    audience: "developer",
    required: "{ type, id }",
    actual: ref === undefined ? "absent" : String(ref),
  }];
}


/**
 * Judge an exceptional source before ANY state is touched.
 *
 * Contradictions are the interesting half. A source that prohibits natural
 * Ability development while granting a natural Ability is not a source with an
 * unusual combination; it is a source whose two halves cannot both be applied,
 * and applying it would leave the character in a state that depends on which
 * half ran second.
 */
export function findExceptionalSourceIssues(
  source: NenExceptionalAwakeningSource,
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...sourceRefIssues(source?.ref, "An exceptional awakening source"),
  ];

  if (
    source === null ||
    typeof source !== "object" ||
    typeof source.overrides !== "object" ||
    source.overrides === null
  ) {
    errors.push({
      code: "nen.awakening.overrides.invalid",
      message: "An exceptional awakening source must declare its overrides.",
      audience: "developer",
      required: "an overrides object, even an empty one",
      actual: String(source?.overrides),
    });

    return errors;
  }

  const { overrides } = source;

  for (const field of declaredOverrideFields(overrides)) {
    if (!isNenExceptionalOverrideField(field)) {
      errors.push({
        code: "nen.awakening.override.field.unknown",
        message: "An exceptional source declared an unknown override field.",
        audience: "developer",
        required: "a declared exceptional override field",
        actual: String(field),
      });
    }
  }

  if (overrides.nenType !== undefined && !isNenType(overrides.nenType.type)) {
    errors.push({
      code: "nen.awakening.override.nen-type.invalid",
      message: "A Nen Type override must name one of the six Nen Types.",
      audience: "developer",
      required: "a Nen Type",
      actual: String(overrides.nenType.type),
    });
  }

  if (overrides.eligibility !== undefined) {
    if (!Array.isArray(overrides.eligibility.requirements)) {
      errors.push({
        code: "nen.awakening.override.eligibility.invalid",
        message:
          "An eligibility override must supply a requirement list, even an empty one.",
        audience: "developer",
        required: "array of named requirements",
        actual: String(overrides.eligibility.requirements),
      });
    }
  }

  if (overrides.masteryGrant !== undefined) {
    if (!Array.isArray(overrides.masteryGrant.grants)) {
      errors.push({
        code: "nen.awakening.override.mastery.invalid",
        message:
          "A mastery-grant override must supply a grant list, even an empty one.",
        audience: "developer",
        required: "array of { principleId, rank }",
        actual: String(overrides.masteryGrant.grants),
      });
    }
  }

  /*
   * Every declared override has to explain itself. The summary is what a sheet
   * shows a player when it says which ordinary rule did not apply to them, and
   * an override nobody can account for afterwards is indistinguishable from a
   * bug in the engine.
   */
  for (const applied of appliedOverrides(overrides)) {
    if (
      typeof applied.summary !== "string" ||
      applied.summary.trim().length === 0
    ) {
      errors.push({
        code: "nen.awakening.override.summary.missing",
        message: `The "${applied.field}" override must say what it replaces.`,
        audience: "developer",
        required: "non-empty summary",
        actual: String(applied.summary),
      });
    }
  }

  return errors;
}
