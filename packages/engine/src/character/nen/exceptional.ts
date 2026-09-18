/*
 * Instinctive and exceptional awakening — the two routes that are not rules.
 *
 * Standard and abrupt awakening are mechanics: anybody who meets the
 * conditions may attempt them, and the engine decides. These two are not, and
 * the difference is deliberate in both cases.
 *
 *
 * INSTINCTIVE AWAKENING IS AUTHORIZED, NEVER TRIGGERED
 * ----------------------------------------------------
 *
 * A body opens itself in extremity and a Nen Ability arrives with it, fully
 * formed and untrained. There is NO rarity roll: nothing in this file consults
 * a probability, and a high SPI does not quietly make a character a coin being
 * flipped in the background. SPI 20 is a GATE — it makes the transition
 * possible and causes none of it — and the cause is an explicit authorization
 * a GM, a piece of content or a world event supplies.
 *
 * Three things must be true at once and they commit together:
 *
 *   SPI 20+      judged through the ordinary requirement vocabulary
 *   authorized   supplied, never derived; deriving it IS the automatic route
 *   an Ability   the awakening IS the Ability arriving. An instinctive
 *                awakening that produced none is a character in a forced Zetsu
 *                for no reason, so it cannot commit without one.
 *
 * What comes out is a character who is awakened, in a forced Zetsu they did
 * not choose and cannot lift, with no ordinary Mastery of any kind — and one
 * Ability that works anyway. That last exception is bound to THIS Ability,
 * THIS forced state and THIS origin, all three checked. There is no general
 * "Abilities work through Zetsu" rule anywhere in the engine, and this route
 * does not create one.
 *
 *
 * AN EXCEPTIONAL SOURCE STATES ITS EXCEPTIONS
 * -------------------------------------------
 *
 * Content declares, field by field, which ordinary rules it replaces. Every
 * rule it does not mention applies normally — that is the half that does the
 * work. A source that waives the Attribute thresholds has waived the Attribute
 * thresholds and has NOT granted Ten, changed an affinity, permitted an Ability
 * the character never developed, or excused a mastery prerequisite anywhere
 * else in the engine.
 *
 * Contradictions are refused BEFORE anything is touched, because a source
 * whose two halves cannot both apply would otherwise leave the character in
 * whichever state the second half produced.
 *
 * Nothing here is a franchise example. There are no named artifacts and no
 * hard-coded special cases; this is a contract, and the content that uses it
 * lives in a catalog.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import { createTraceNode } from "../../infrastructure/trace";
import { transitionOutcome } from "../../runtime/transition";

import type {
  NenAwakeningRecord,
  NenForcedZetsuState,
} from "../foundation/nen/awakening/types";
import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import { validateNenState } from "../foundation/nen/nen";
import type {
  NenMasteryRank,
  NenPrincipleId,
  NenState,
} from "../foundation/nen/types";
import { NEN_PRINCIPLE_IDS } from "../foundation/nen/nen";
import { isMasteryValue } from "../capabilities/mastery";
import {
  nenAffinityOf,
  type NenAffinityChange,
} from "../foundation/nen/nen-type";

import { isNenUncontained } from "./access";
import {
  resolveInstinctiveAwakeningEligibility,
  resolveNenEligibility,
  resolveStandardAwakeningEligibility,
} from "./eligibility";
import {
  awakenedEvents,
  eligibilityIssues,
  emitContextOf,
  failAwakening,
  findAwakeningRequestIssues,
  findCommonAwakeningIssues,
  wasProducingPseudoChu,
} from "./preflight";
import {
  noAwakeningChanges,
  type ExceptionalAwakeningRequest,
  type InstinctiveAwakeningRequest,
  type NenAwakeningChanges,
  type NenAwakeningContext,
  type NenAwakeningTransitionResult,
  type NenMasteryGrant,
} from "./protocol";
import {
  appliedOverrides,
  findExceptionalSourceIssues,
  type NenExceptionalOverrides,
} from "./sources";
import {
  awakeningRecordId,
  conditionRequest,
  grantNenMastery,
  isReawakening,
  LEAKING_CONDITION_ID,
  naturalAbilityRecord,
  openNodes,
  applySuppression,
  applyAffinityChange,
  suppressionId,
} from "./settlement";


/* ── Instinctive ────────────────────────────────────────────────────────── */

/**
 * The authorized route. SPI 20, explicit permission, and an Ability — or none
 * of it.
 *
 * The forced Zetsu and the Ability exception are built in ONE step with the
 * awakening. Applying the Zetsu after committing the awakening would leave a
 * window in which the character is awakened, uncontained and leaking, which is
 * the state this route specifically does not produce.
 */
export function awakenNenInstinctive(
  context: NenAwakeningContext,
  request: InstinctiveAwakeningRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;
  const reawakening = isReawakening(state);

  const root = createTraceNode({
    id: "nen.awakening.instinctive",
    label: "Awaken Nen instinctively",
    formula:
      "SPI >= 20 && explicit authorization && a natural Nen Ability -> awakened inside a forced Zetsu",
    inputs: {
      condition: { value: state.condition },
    },
  });

  const shape = findAwakeningRequestIssues(request, "instinctive");

  if (shape.length > 0) return failAwakening(root, shape);

  root.inputs.authorizedBy = {
    value: describeDiagnosticValue(request.authorization?.grantedBy?.id ?? "absent"),
  };
  root.inputs.abilityId = {
    value: describeDiagnosticValue(request.naturalAbilityId ?? "absent"),
  };

  /*
   * Refused for a reverted character BEFORE the shared preflight, because the
   * shared preflight would refuse them for the wrong reason: it requires a
   * reawakening to state a hurdle, and this route has no hurdle to state. The
   * character would be told to supply one, and no hurdle would help.
   *
   * Instinctive awakening is not a route back. A reverted character comes back
   * through standard, abrupt or an exceptional source; letting this one serve
   * would make "rare, authorized, and arrives with an Ability" a repeatable
   * way of restoring access, and would have to decide what happened to the
   * Ability the first one produced.
   */
  const stateIssues = findAwakeningStateIssues(state);

  if (stateIssues.length > 0) return failAwakening(root, stateIssues);

  if (state.condition === "reverted") {
    return failAwakening(root, [{
      code: "nen.awakening.instinctive.not-a-reawakening-route",
      message:
        "Instinctive awakening is not a route back for a reverted character.",
      audience: "player",
      required: "a character who has never awakened",
      actual: state.condition,
    }]);
  }

  const common = findCommonAwakeningIssues(context, false);

  if (common.length > 0) return failAwakening(root, common);

  const issues: EngineError[] = [];

  /*
   * The authorization is a VALUE the caller supplies. Nothing about the
   * character can produce it, which is exactly what stops this being a rarity
   * roll that fires on its own.
   */
  const authorization = request.authorization;

  if (
    authorization === undefined ||
    authorization === null ||
    typeof authorization !== "object" ||
    typeof authorization.grantedBy?.id !== "string" ||
    authorization.grantedBy.id.trim().length === 0 ||
    typeof authorization.grantedBy.type !== "string" ||
    authorization.grantedBy.type.trim().length === 0 ||
    typeof authorization.reason !== "string" ||
    authorization.reason.trim().length === 0
  ) {
    issues.push({
      code: "nen.awakening.instinctive.unauthorized",
      message:
        "An instinctive awakening requires an explicit authorization naming who granted it and why.",
      audience: "developer",
      required: "{ grantedBy: { type, id }, reason }",
      actual: authorization === undefined
        ? "absent"
        : describeDiagnosticValue(authorization),
    });
  }

  /*
   * The Ability is what the awakening IS. Refusing here rather than awakening
   * first and granting second is the whole of "cannot commit without it".
   */
  if (
    typeof request.naturalAbilityId !== "string" ||
    request.naturalAbilityId.trim().length === 0
  ) {
    issues.push({
      code: "nen.awakening.instinctive.ability.missing",
      message:
        "An instinctive awakening must produce the natural Nen Ability it consists of.",
      audience: "developer",
      required: "a non-empty Nen Ability id",
      actual: describeDiagnosticValue(request.naturalAbilityId),
    });
  }

  if (issues.length > 0) return failAwakening(root, issues);

  /*
   * SPI only. The standard thresholds do not apply to this route at all, so a
   * frail character with an extraordinary spirit is a legitimate candidate.
   */
  const eligibility = resolveInstinctiveAwakeningEligibility(
    context.requirements,
  );

  const eligibilityErrors = eligibilityIssues(eligibility, "SPI 20 or higher");

  if (eligibilityErrors.length > 0) return failAwakening(root, eligibilityErrors);

  const abilityId = request.naturalAbilityId;
  const recordId = awakeningRecordId(context.operationId);
  const zetsuId = suppressionId(context.operationId, "forced-zetsu");

  const record: NenAwakeningRecord = {
    kind: "awakening",
    id: recordId,
    method: "instinctive",
    occurredAt: context.occurredAt,
    source: authorization.grantedBy,
    reawakening: false,

    /* The standard thresholds were not applied; a different gate was. */
    eligibilityBypassed: true,
    appliedOverrides: [],
  };

  const forced: NenForcedZetsuState = {
    id: zetsuId,
    kind: "forced-zetsu",
    appliedAt: context.occurredAt,
    source: authorization.grantedBy,

    /*
     * Externally imposed, so only the source that imposed it may lift it. The
     * character cannot, and neither can the collapse-recovery route — which is
     * the whole distinction between this and an involuntary Zetsu.
     */
    release: { rule: "source-authorized", authority: authorization.grantedBy },

    /*
     * ONE exemption, naming all three of the facts that bind it: the Ability,
     * this exact instance, and the source that granted it. An exemption naming
     * only the Ability would travel — it would be honoured by an involuntary
     * Zetsu the character was never granted anything against, which is the
     * global ability-through-Zetsu rule this engine does not have.
     */
    exemptions: [{
      abilityId,
      suppressionId: zetsuId,
      source: authorization.grantedBy,
    }],
  };

  const opened = openNodes({
    state,
    record,
    naturalAbility: naturalAbilityRecord({
      abilityId,
      grantedAt: context.occurredAt,
      awakeningId: recordId,
      method: "instinctive",
    }),
  });

  const next: NenState = {
    ...context.nen,

    /* Awakening, Ability and forced Zetsu in one value. No intermediate state
     * exists in which the character is open and unprotected. */
    awakening: applySuppression(opened, forced),
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = emitContextOf(context);

  /*
   * NOT leaking, and this asserts it rather than assuming it: the forced Zetsu
   * closes the nodes, so isNenUncontained is false. If it ever came back true
   * the forced state would not be reaching the Aura access input.
   */
  const leaking = isNenUncontained(next);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    method: "instinctive",
    condition: "awakened",
    nodesOpened: true,
    pseudoChuEnded: wasProducingPseudoChu(state),
    eligibility,
    leakageStarted: leaking,
    suppressionApplied: [{ id: zetsuId, kind: "forced-zetsu" }],
    naturalAbilityGranted: abilityId,
  };

  root.output = {
    condition: "awakened",
    forcedZetsu: zetsuId,
    abilityId,
    leaking,
  };

  return {
    success: true,
    payload: transitionOutcome(
      next,
      changes,
      awakenedEvents({
        emit,
        record,
        pseudoChuEnded: changes.pseudoChuEnded,

        /* No ordinary Mastery of any kind. The Ability is not Mastery. */
        masteryGranted: [],
        leaking,
        suppressionApplied: [{ id: zetsuId, kind: "forced-zetsu" }],
        naturalAbilityGranted: abilityId,
        affinityChanged: false,
      }),
      leaking
        ? [conditionRequest(
          emit,
          true,
          LEAKING_CONDITION_ID,
          "Instinctively awakened with no containment.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}


/* ── Exceptional ────────────────────────────────────────────────────────── */

/*
 * Turn a declared mastery-grant override into grants the Nen progression
 * rules can judge.
 *
 * The principle ids and ranks arrive as loose strings and numbers, because the
 * override contract is content-facing and content cannot be trusted to have
 * spelled either correctly. Anything unrecognised is refused here rather than
 * being written into a state the rules would later have to reject.
 */
function readMasteryGrants(
  overrides: NenExceptionalOverrides,
): { readonly grants: readonly NenMasteryGrant[]; readonly errors: readonly EngineError[] } {
  const declared = overrides.masteryGrant;

  if (declared === undefined) return { grants: [], errors: [] };

  const grants: NenMasteryGrant[] = [];
  const errors: EngineError[] = [];

  for (const grant of declared.grants) {
    if (!(NEN_PRINCIPLE_IDS as readonly string[]).includes(grant.principleId)) {
      errors.push({
        code: "nen.awakening.override.mastery.principle.unknown",
        message: "A mastery-grant override names a principle that does not exist.",
        audience: "developer",
        required: "a Nen principle id",
        actual: describeDiagnosticValue(grant.principleId),
      });

      continue;
    }

    if (!isMasteryValue(grant.rank)) {
      errors.push({
        code: "nen.awakening.override.mastery.rank.invalid",
        message: "A mastery-grant override names a rank outside the Mastery range.",
        audience: "developer",
        required: "integer from 0 through 10",
        actual: describeDiagnosticValue(grant.rank),
      });

      continue;
    }

    grants.push({
      principleId: grant.principleId as NenPrincipleId,
      rank: grant.rank as NenMasteryRank,
    });
  }

  return { grants, errors };
}


/*
 * The contradictions a source can declare, refused before anything is touched.
 *
 * Each of these is a pair of overrides that cannot both be applied, so running
 * the transition would leave the character in whichever state the second half
 * produced — a result that depends on the order the engine happened to read
 * the fields in.
 */
function findOverrideContradictions(
  overrides: NenExceptionalOverrides,
  request: ExceptionalAwakeningRequest,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (
    overrides.naturalAbilityDevelopment?.development === "prohibited" &&
    request.naturalAbilityId !== undefined
  ) {
    errors.push({
      code: "nen.awakening.override.ability.contradictory",
      message:
        "This source prohibits natural Nen Ability development and was asked to grant one.",
      audience: "developer",
      required: "no natural Ability, or an override that permits development",
      actual: request.naturalAbilityId,
    });
  }

  /*
   * One principle named twice at two ranks. Which one applies would depend on
   * the order the list was read in, so neither does.
   */
  const declaredRanks = new Map<string, number>();

  for (const grant of overrides.masteryGrant?.grants ?? []) {
    const existing = declaredRanks.get(grant.principleId);

    if (existing !== undefined && existing !== grant.rank) {
      errors.push({
        code: "nen.awakening.override.mastery.contradictory",
        message:
          "A mastery-grant override declares two different ranks for one principle.",
        audience: "developer",
        required: "one rank per principle",
        actual: `${grant.principleId}: ${existing} and ${grant.rank}`,
      });
    }

    declaredRanks.set(grant.principleId, grant.rank);
  }

  /*
   * The same requirement id in the eligibility bundle and in the additional
   * prerequisites. The two bundles are reported separately, so a shared id
   * would make a refusal ambiguous about which bundle refused.
   */
  const eligibilityIds = new Set(
    (overrides.eligibility?.requirements ?? []).map((entry) => entry.id),
  );

  for (const entry of overrides.prerequisite?.requirements ?? []) {
    if (eligibilityIds.has(entry.id)) {
      errors.push({
        code: "nen.awakening.override.requirement.duplicate",
        message:
          "A requirement id appears in both the eligibility override and the added prerequisites.",
        audience: "developer",
        required: "distinct requirement ids across bundles",
        actual: entry.id,
      });
    }
  }

  return errors;
}


/**
 * The content-defined route: only the overrides the source actually declared.
 *
 * Note what this function does NOT do when a source overrides eligibility: it
 * does not grant Ten, does not touch the affinity, does not permit an Ability,
 * and does not relax the Nen mastery graph. Every one of those needs its own
 * declared override, and the mastery grant — however it is declared — still
 * goes through validateNenAdvancement like every other grant in the engine.
 */
export function awakenNenExceptional(
  context: NenAwakeningContext,
  request: ExceptionalAwakeningRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;
  const reawakening = isReawakening(state);

  const root = createTraceNode({
    id: "nen.awakening.exceptional",
    label: "Awaken Nen through an exceptional source",
    formula:
      "apply only the overrides the source declares; every unmentioned rule stays in force",
    inputs: {
      condition: { value: state.condition },
    },
  });

  const shape = findAwakeningRequestIssues(request, "exceptional");

  if (shape.length > 0) return failAwakening(root, shape);

  root.inputs.source = {
    value: describeDiagnosticValue(request.source?.ref?.id ?? "absent"),
  };
  root.inputs.hurdle = { value: request.hurdle ?? "none" };

  const common = findCommonAwakeningIssues(context, request.hurdle !== undefined);

  if (common.length > 0) return failAwakening(root, common);

  const sourceIssues = findExceptionalSourceIssues(request.source);

  if (sourceIssues.length > 0) return failAwakening(root, sourceIssues);

  const overrides = request.source.overrides;

  const contradictions = findOverrideContradictions(overrides, request);

  if (contradictions.length > 0) return failAwakening(root, contradictions);

  const mastery = readMasteryGrants(overrides);

  if (mastery.errors.length > 0) return failAwakening(root, mastery.errors);

  /*
   * Eligibility: the source's bundle if it declared one, the standard
   * thresholds if it did not. An override with an EMPTY requirement list means
   * "no eligibility rules at all" and is honoured; not declaring the override
   * leaves the standard thresholds in force, which is the difference between
   * waiving a rule and forgetting to mention it.
   */
  const eligibility = overrides.eligibility === undefined
    ? resolveStandardAwakeningEligibility(context.requirements)
    : resolveNenEligibility(
      overrides.eligibility.requirements,
      context.requirements,
    );

  const eligibilityErrors = eligibilityIssues(
    eligibility,
    overrides.eligibility?.summary ?? "CON 13, VIT 13, PER 13, WIS 13, SPI 16",
  );

  if (eligibilityErrors.length > 0) return failAwakening(root, eligibilityErrors);

  /* Additional prerequisites are ADDITIVE. They never waive anything. */
  const prerequisites = overrides.prerequisite === undefined
    ? null
    : resolveNenEligibility(
      overrides.prerequisite.requirements,
      context.requirements,
    );

  if (prerequisites !== null) {
    const prerequisiteErrors = eligibilityIssues(
      prerequisites,
      overrides.prerequisite?.summary ?? "the source's own prerequisites",
    );

    if (prerequisiteErrors.length > 0) {
      return failAwakening(root, prerequisiteErrors);
    }
  }

  const declaredOverrides = appliedOverrides(overrides);
  const recordId = awakeningRecordId(context.operationId);

  /*
   * An affinity change ONLY when the source declared one. An eligibility
   * override leaves the character's affinity exactly as it was, which is the
   * whole of "unmentioned rules remain normal".
   *
   * The COMPLETE affinity and the declared `known`, both recorded as given
   * and both stored as given — the record and the resulting state are built
   * from one value so they cannot disagree.
   */
  const affinityChange: NenAffinityChange | undefined =
    overrides.affinity === undefined
      ? undefined
      : {
        previous: nenAffinityOf(context.nen.affinity),
        next: overrides.affinity.affinity,
        known: overrides.affinity.known,
        cause: overrides.affinity.summary,
      };

  const record: NenAwakeningRecord = {
    kind: "awakening",
    id: recordId,
    method: "exceptional",
    occurredAt: context.occurredAt,
    source: request.source.ref,
    reawakening,
    eligibilityBypassed: overrides.eligibility !== undefined,
    appliedOverrides: declaredOverrides,
    ...(request.hurdle === undefined ? {} : { hurdle: request.hurdle }),
    ...(affinityChange === undefined ? {} : { affinityChange }),
  };

  const abilityId =
    overrides.naturalAbilityDevelopment?.development === "prohibited"
      ? undefined
      : request.naturalAbilityId;

  const opened = openNodes({
    state,
    record,
    naturalAbility: abilityId === undefined ? null : naturalAbilityRecord({
      abilityId,
      grantedAt: context.occurredAt,
      awakeningId: recordId,
      method: "exceptional",
    }),
  });

  /*
   * No forced state. An exceptional source may replace eligibility, replace
   * the affinity, prohibit Ability development, grant Mastery, add prerequisites
   * and note a change to later progression — and that is the whole list. It
   * cannot impose a forced Zetsu. The vocabulary can represent an
   * Ability-imposed or status-imposed one — a forced Zetsu carries a generic
   * source and an explicit release rule precisely so it can — but deciding
   * WHEN content may impose one, and what lifts it, is the Ability and status
   * runtime's business rather than this file's.
   */
  const draft: NenState = {
    ...context.nen,
    awakening: opened,
    affinity: applyAffinityChange(context.nen.affinity, affinityChange),
  };

  /*
   * Through the ordinary mastery path, whatever the source declared. An
   * override changes WHAT is granted; it does not excuse the Nen progression
   * rules, so a source granting Hatsu to a character who has not unlocked it
   * is refused here exactly as any other route would be.
   */
  const granted = grantNenMastery(draft, mastery.grants);

  if (granted.errors.length > 0) return failAwakening(root, granted.errors);

  const next: NenState = { ...draft, mastery: granted.mastery };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = emitContextOf(context);
  const leaking = isNenUncontained(next);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    method: "exceptional",
    condition: "awakened",
    nodesOpened: true,
    pseudoChuEnded: wasProducingPseudoChu(state),
    masteryGranted: granted.granted,
    eligibility: overrides.eligibility === undefined
      ? eligibility
      : { ...eligibility, applied: true },
    leakageStarted: leaking,
    suppressionApplied: [],
    naturalAbilityGranted: abilityId ?? null,
    affinityChange: affinityChange ?? null,
    appliedOverrides: declaredOverrides,
    reawakening,
    hurdle: request.hurdle ?? null,
  };

  root.output = {
    condition: "awakened",
    overrides: declaredOverrides.map((applied) => applied.field),
    masteryGranted: granted.granted.length,
    leaking,
  };

  return {
    success: true,
    payload: transitionOutcome(
      next,
      changes,
      awakenedEvents({
        emit,
        record,
        pseudoChuEnded: changes.pseudoChuEnded,
        masteryGranted: granted.granted,
        leaking,
        suppressionApplied: changes.suppressionApplied,
        naturalAbilityGranted: changes.naturalAbilityGranted,
        affinityChanged: affinityChange !== undefined,
      }),
      leaking
        ? [conditionRequest(
          emit,
          true,
          LEAKING_CONDITION_ID,
          "Exceptionally awakened with no usable Ten.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}
