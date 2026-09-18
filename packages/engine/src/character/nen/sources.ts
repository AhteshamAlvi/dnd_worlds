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
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type {
  NenAppliedOverride,
  NenExceptionalOverrideField,
} from "../foundation/nen/awakening/types";
import {
  isNenExceptionalOverrideField,
  NEN_EXCEPTIONAL_OVERRIDE_FIELDS,
} from "../foundation/nen/awakening/types";
import {
  findNenAffinityIssues,
  type NenAffinity,
} from "../foundation/nen/nen-type";
import type { NamedRequirement } from "../rules/requirements";
import type { RequirementContext, RequirementDisposition } from "../rules/resolution";
import {
  namedRequirementDisposition,
  resolveNamedRequirements,
} from "../rules/resolution";
import { findNamedRequirementsValidationIssues } from "../rules/validation";


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


/*
 * Replaces the character's WHOLE affinity, recording what it was.
 *
 * The complete affinity, lean included. A source that changes the primary
 * Type says what the lean becomes as well — `leaning: null` is a statement,
 * and nothing infers one from the old affinity.
 *
 * `known` is stored exactly as declared. A source may leave the character
 * ignorant of what they have become.
 */
export interface NenAffinityOverride {
  readonly affinity: NenAffinity;
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
 * still validated against the Nen progression rules — an override of this field changes
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
  readonly affinity?: NenAffinityOverride;
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
  /*
   * Read off the OBJECT's own keys, in the vocabulary's order.
   *
   * This used to test the six statically-typed fields one by one, which meant
   * an unknown key could never appear in the result — and the validator's
   * unknown-field check, which iterates this list, was therefore unreachable
   * dead code. Content declaring `overrides.somethingInvented` was silently
   * ignored rather than refused.
   */
  if (overrides === null || typeof overrides !== "object") return [];

  const declared = new Set(Object.keys(overrides));

  return NEN_EXCEPTIONAL_OVERRIDE_FIELDS.filter(
    (field) =>
      declared.has(field) &&
      (overrides as Record<string, unknown>)[field] !== undefined,
  );
}


/** Keys the vocabulary does not recognise at all. */
export function undeclaredOverrideFields(
  overrides: NenExceptionalOverrides,
): readonly string[] {
  if (overrides === null || typeof overrides !== "object") return [];

  return Object.keys(overrides).filter(
    (key) => !isNenExceptionalOverrideField(key),
  );
}


/** The overrides as they are written onto the character's history. */
/** The authored summary for one declared field, or undefined if there is none. */
export function declaredOverrideSummary(
  overrides: NenExceptionalOverrides,
  field: NenExceptionalOverrideField,
): unknown {
  const declared = (overrides as Record<string, unknown>)[field];

  if (declared === null || typeof declared !== "object") return undefined;

  return (declared as { summary?: unknown }).summary;
}


/**
 * The overrides as they are written onto the character's history.
 *
 * Only called once the source has been validated, and it no longer invents a
 * summary for a field that supplied none. It used to fall back to the FIELD'S
 * OWN NAME, which had two consequences: a sheet showed "eligibility" as the
 * reason a rule was waived, and the validator's missing-summary check — which
 * iterates this list — could never fire, because by the time it looked there
 * was always a non-empty string there.
 */
export function appliedOverrides(
  overrides: NenExceptionalOverrides,
): readonly NenAppliedOverride[] {
  return declaredOverrideFields(overrides).map((field) => ({
    field,
    /*
     * Only reached once findExceptionalSourceIssues has proved every declared
     * override carries a non-empty string summary, so this is a narrowing
     * rather than a coercion of untrusted input.
     */
    summary: typeof declaredOverrideSummary(overrides, field) === "string"
      ? declaredOverrideSummary(overrides, field) as string
      : "",
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
    actual: describeDiagnosticValue(ref),
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
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return [{
      code: "nen.awakening.source.invalid",
      message: "An exceptional awakening source must be a record.",
      audience: "developer",
      required: "{ ref, overrides }",
      actual: describeDiagnosticValue(source),
    }];
  }

  const errors: EngineError[] = [
    ...sourceRefIssues(source.ref, "An exceptional awakening source"),
  ];

  const { overrides } = source;

  if (
    overrides === null ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    errors.push({
      code: "nen.awakening.overrides.invalid",
      message: "An exceptional awakening source must declare its overrides.",
      audience: "developer",
      required: "an overrides object, even an empty one",
      actual: describeDiagnosticValue(overrides),
    });

    return errors;
  }

  /*
   * Unknown keys are REFUSED, not ignored.
   *
   * Content that declares an override the vocabulary has never heard of is
   * content whose author believes a rule is being waived. Dropping it silently
   * is the worst of the three options: the source ships, the rule still
   * applies, and nobody finds out until play.
   */
  for (const field of undeclaredOverrideFields(overrides)) {
    errors.push({
      code: "nen.awakening.override.field.unknown",
      message: `"${field}" is not an override this engine recognises.`,
      audience: "developer",
      required: NEN_EXCEPTIONAL_OVERRIDE_FIELDS.join(" | "),
      actual: field,
    });
  }

  /* Each declared override must be a record before any field is read off it. */
  for (const field of NEN_EXCEPTIONAL_OVERRIDE_FIELDS) {
    const declared = (overrides as Record<string, unknown>)[field];

    if (declared === undefined) continue;

    if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
      errors.push({
        code: "nen.awakening.override.shape.invalid",
        message: `The "${field}" override must be a record.`,
        audience: "developer",
        required: "object",
        actual: describeDiagnosticValue(declared),
      });
    }
  }

  if (errors.length > 0) return errors;

  if (overrides.affinity !== undefined) {
    const affinityIssues = findNenAffinityIssues(
      overrides.affinity.affinity,
      "overrides.affinity.affinity",
    );

    if (affinityIssues.length > 0) {
      errors.push({
        code: "nen.awakening.override.affinity.invalid",
        message: "An affinity override must declare a complete, legal affinity.",
        audience: "developer",
        required: "{ primary, leaning } with a legal lean or null",
        actual: affinityIssues.map((issue) => issue.code),
      });
    }

    /*
     * Whether the character KNOWS the new affinity is a separate fact from
     * what it is, and a `known: "yes"` would otherwise pass straight through
     * into stored state that claims to be a boolean.
     */
    if (typeof overrides.affinity.known !== "boolean") {
      errors.push({
        code: "nen.awakening.override.affinity.known.invalid",
        message:
          "An affinity override must say whether the character knows the affinity.",
        audience: "developer",
        required: "boolean",
        actual: describeDiagnosticValue(overrides.affinity.known),
      });
    }
  }

  /*
   * Nothing read this field at all. It is compared with `=== "prohibited"`
   * later, so a garbage value silently behaved as "permitted" — an override
   * that forbade Ability development would quietly permit it.
   */
  if (overrides.naturalAbilityDevelopment !== undefined) {
    const { development } = overrides.naturalAbilityDevelopment;

    if (development !== "prohibited" && development !== "permitted") {
      errors.push({
        code: "nen.awakening.override.ability-development.invalid",
        message:
          "A natural-Ability override must either prohibit or permit development.",
        audience: "developer",
        required: "prohibited | permitted",
        actual: describeDiagnosticValue(development),
      });
    }
  }

  errors.push(...requirementListIssues(
    overrides.eligibility?.requirements,
    "overrides.eligibility.requirements",
    "nen.awakening.override.eligibility.invalid",
    "An eligibility override must supply well-formed requirements.",
    overrides.eligibility !== undefined,
  ));

  errors.push(...requirementListIssues(
    overrides.prerequisite?.requirements,
    "overrides.prerequisite.requirements",
    "nen.awakening.override.prerequisite.invalid",
    "A prerequisite override must supply well-formed requirements.",
    overrides.prerequisite !== undefined,
  ));

  if (overrides.masteryGrant !== undefined) {
    const { grants } = overrides.masteryGrant;

    if (!Array.isArray(grants)) {
      errors.push({
        code: "nen.awakening.override.mastery.invalid",
        message:
          "A mastery-grant override must supply a grant list, even an empty one.",
        audience: "developer",
        required: "array of { principleId, rank }",
        actual: describeDiagnosticValue(grants),
      });
    } else {
      /*
       * Each grant proved to be a record HERE, before the transition's own
       * loop reads `principleId` and `rank` off it.
       */
      grants.forEach((grant: unknown, index) => {
        if (grant === null || typeof grant !== "object" || Array.isArray(grant)) {
          errors.push({
            code: "nen.awakening.override.mastery.grant.invalid",
            message: `Mastery grant ${index} must be a record.`,
            audience: "developer",
            required: "{ principleId, rank }",
            actual: describeDiagnosticValue(grant),
          });

          return;
        }

        const { principleId, rank } = grant as {
          principleId?: unknown;
          rank?: unknown;
        };

        if (typeof principleId !== "string" || principleId.trim().length === 0) {
          errors.push({
            code: "nen.awakening.override.mastery.grant.invalid",
            message: `Mastery grant ${index} must name a principle.`,
            audience: "developer",
            required: "non-empty string",
            actual: describeDiagnosticValue(principleId),
          });
        }

        if (typeof rank !== "number" || !Number.isFinite(rank)) {
          errors.push({
            code: "nen.awakening.override.mastery.grant.invalid",
            message: `Mastery grant ${index} must name a finite rank.`,
            audience: "developer",
            required: "finite number",
            actual: describeDiagnosticValue(rank),
          });
        }
      });
    }
  }

  if (overrides.progression !== undefined) {
    const { summary } = overrides.progression;

    if (typeof summary !== "string" || summary.trim().length === 0) {
      errors.push({
        code: "nen.awakening.override.progression.invalid",
        message: "A progression override must say what it changes.",
        audience: "developer",
        required: "non-empty summary",
        actual: describeDiagnosticValue(summary),
      });
    }
  }

  /*
   * Every declared override has to explain itself, read from what was
   * AUTHORED rather than from the assembled record — which used to substitute
   * the field's own name and made this check unreachable.
   */
  for (const field of declaredOverrideFields(overrides)) {
    const summary = declaredOverrideSummary(overrides, field);

    if (typeof summary !== "string" || summary.trim().length === 0) {
      errors.push({
        code: "nen.awakening.override.summary.missing",
        message: `The "${field}" override must say what it replaces.`,
        audience: "developer",
        required: "non-empty summary",
        actual: describeDiagnosticValue(summary),
      });
    }
  }

  return errors;
}


function requirementListIssues(
  requirements: unknown,
  path: string,
  code: string,
  message: string,
  declared: boolean,
): readonly EngineError[] {
  if (!declared) return [];

  const issues = findNamedRequirementsValidationIssues(requirements, path);

  if (issues.length === 0) return [];

  return [{
    code,
    message,
    audience: "developer",
    required: "a list of well-formed named requirements",
    actual: issues.map((issue) => ({ type: issue.type, path: issue.path })),
  }];
}
