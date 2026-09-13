/*
 * Standard and abrupt awakening — the two ordinary routes.
 *
 * They are opposites in every way that matters, which is why they share a file
 * and a settlement and nothing else:
 *
 *   STANDARD  the character does it to themselves, over time, having met five
 *             Attribute thresholds. It cannot fail once it is allowed to
 *             begin, it grants Ten I, and it finishes stable.
 *
 *   ABRUPT    somebody else does it to them, now, against a roll. It ignores
 *             the thresholds entirely, grants nothing, and leaves them
 *             haemorrhaging Aura if it works — or injured, possibly fatally,
 *             if it does not.
 *
 *
 * A REFUSAL AND A FAILURE ARE DIFFERENT ANSWERS
 * ---------------------------------------------
 *
 * A REFUSAL is an EngineResult failure: nothing happened, no dice were
 * consulted, and the caller is holding exactly the state they passed in.
 * Missing training, an unmet threshold, an incapable actor, a malformed roll.
 *
 * A FAILURE is a SUCCESSFUL transition whose success roll came up short. The
 * attempt genuinely happened. It cost the character nothing in awakening terms
 * — their nodes, their Mastery and their pseudo-Chu are all exactly as they
 * were, which the rule requires — and it produced trauma, which is a real
 * outcome reported through events and a request to Body.
 *
 * Collapsing the two would either refuse an attempt that actually took place
 * or make a validation bug look like bad luck.
 *
 *
 * WHAT STANDARD AWAKENING DOES NOT DO
 * -----------------------------------
 *
 * It does not start an active Ten. Ten I is MASTERY — the character now knows
 * how to contain their Aura, which is why they finish stable and non-leaking —
 * and an active principle instance is Phase 6 runtime state that this domain
 * has no business creating. Nothing here writes a runtime flag of any kind.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import { findDiceIssues, requireOneDie, rollsFor } from "../../runtime/dice";
import type {
  RuntimeDieRequirement,
  RuntimeRollSet,
} from "../../runtime/dice";
import type { RuntimeRequest } from "../../runtime/requests";
import { transitionOutcome } from "../../runtime/transition";

import {
  deriveAbruptAwakeningOdds,
  deriveAwakeningFailureSeverity,
  reawakeningAbruptOddsMultiplier,
  reawakeningStandardDuration,
} from "../foundation/nen/awakening/calculations";
import type {
  NenAwakeningRecord,
  NenAwakeningResolution,
} from "../foundation/nen/awakening/types";
import { validateNenState } from "../foundation/nen/nen";
import type { NenState } from "../foundation/nen/types";

import { isNenUncontained } from "./access";
import {
  awakeningAttributes,
  bypassedEligibility,
  resolveStandardAwakeningEligibility,
} from "./eligibility";
import {
  awakenedEvents,
  eligibilityIssues,
  emitContextOf,
  failAwakening,
  findAwakeningRequirementContextIssues,
  findAwakeningRequirementIssues,
  findCommonAwakeningIssues,
  wasProducingPseudoChu,
} from "./preflight";
import {
  noAwakeningChanges,
  type AbruptAwakeningRequest,
  type NenAwakeningChanges,
  type NenAwakeningContext,
  type NenAwakeningEvent,
  type NenAwakeningTransitionResult,
  type StandardAwakeningRequest,
} from "./protocol";
import { resolveActorCapability } from "./sources";
import {
  ABRUPT_AWAKENING_DEATH_PURPOSE,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  awakeningEvent,
  awakeningRecordId,
  conditionRequest,
  grantNenMastery,
  isReawakening,
  LEAKING_CONDITION_ID,
  openNodes,
  resolvePercentile,
  sequenceAwakeningEvents,
  STANDARD_AWAKENING_MASTERY_GRANTS,
  traumaRequest,
  type EmitContext,
} from "./settlement";


/* ── Standard ───────────────────────────────────────────────────────────── */

/**
 * The gradual route: five thresholds, finished training, Ten I, stable.
 *
 * Everything commits together or nothing does. The Mastery grant is validated
 * against the AWAKENED DRAFT — `validateNenAdvancement` refuses an unawakened
 * character, so there is no order in which the two could be checked separately
 * and both pass. If the grant is refused, the awakening is refused with it and
 * the caller keeps the state they had.
 */
export function awakenNenStandard(
  context: NenAwakeningContext,
  request: StandardAwakeningRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;
  const reawakening = isReawakening(state);

  const root = createTraceNode({
    id: "nen.awakening.standard",
    label: "Awaken Nen through standard training",
    formula:
      "thresholds satisfied && training completed -> open nodes + Ten I, committed together",
    inputs: {
      condition: { value: state.condition },
      reawakening: { value: String(reawakening) },
      hurdle: { value: request.hurdle ?? "none" },
      trainingCompleted: { value: String(request.trainingCompleted) },
    },
  });

  const common = findCommonAwakeningIssues(context, request?.hurdle !== undefined);

  if (common.length > 0) return failAwakening(root, common);

  if (request.trainingCompleted !== true) {
    return failAwakening(root, [{
      code: "nen.awakening.training.incomplete",
      message: "A standard awakening requires the training to be finished.",
      audience: "player",
      required: "completed awakening training",
      actual: String(request.trainingCompleted),
    }]);
  }

  /*
   * The SAME thresholds on a reawakening. The hurdle changes how long the
   * training takes, not who is allowed to attempt it — so a reverted character
   * who has since lost the WIS they had cannot come back by this route, and
   * has to use a valid abrupt or exceptional one instead.
   */
  const eligibility = resolveStandardAwakeningEligibility(context.requirements);

  const eligibilityErrors = eligibilityIssues(
    eligibility,
    "CON 13, VIT 13, PER 13, WIS 13, SPI 16",
  );

  if (eligibilityErrors.length > 0) return failAwakening(root, eligibilityErrors);

  /*
   * A supplied duration has to be a duration.
   *
   * There is no universal standard-awakening length, so this number is always
   * the caller's — and a NaN or a negative would be multiplied by the hurdle
   * and reported back as an adjusted training time, which is a confident wrong
   * answer rather than a missing one.
   */
  if (
    request.baseTrainingDurationHours !== undefined &&
    (!Number.isFinite(request.baseTrainingDurationHours) ||
      request.baseTrainingDurationHours < 0)
  ) {
    return failAwakening(root, [{
      code: "nen.awakening.training.duration.invalid",
      message:
        "A supplied base training duration must be a finite, non-negative number of hours.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(request.baseTrainingDurationHours),
    }]);
  }

  const record: NenAwakeningRecord = {
    kind: "awakening",
    id: awakeningRecordId(context.operationId),
    method: "standard",
    occurredAt: context.occurredAt,
    source: request.source ?? null,
    reawakening,
    eligibilityBypassed: false,
    appliedOverrides: [],
    ...(request.hurdle === undefined ? {} : { hurdle: request.hurdle }),
  };

  const draft: NenState = {
    ...context.nen,
    awakening: openNodes({
      state,
      record,
      naturalAbility: null,
      nenType: state.nenType,
    }),
  };

  const mastery = grantNenMastery(draft, STANDARD_AWAKENING_MASTERY_GRANTS);

  if (mastery.errors.length > 0) return failAwakening(root, mastery.errors);

  const next: NenState = { ...draft, mastery: mastery.mastery };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = emitContextOf(context);

  /*
   * Non-leaking, and this asserts it rather than assuming it. Ten I makes the
   * character contained; if the grant had been skipped because they already
   * held Ten, they are contained anyway. A standard awakening that came out
   * leaking would mean the grant silently did nothing.
   */
  const leaking = isNenUncontained(next);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    method: "standard",
    condition: "awakened",
    nodesOpened: true,
    pseudoChuEnded: wasProducingPseudoChu(state),
    masteryGranted: mastery.granted,
    eligibility,
    leakageStarted: leaking,
    reawakening,
    hurdle: request.hurdle ?? null,
    adjustedTrainingDurationHours:
      request.hurdle !== undefined &&
        request.baseTrainingDurationHours !== undefined
        ? reawakeningStandardDuration(
          request.baseTrainingDurationHours,
          request.hurdle,
        )
        : null,
  };

  root.output = {
    condition: "awakened",
    masteryGranted: mastery.granted.length,
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
        masteryGranted: mastery.granted,
        leaking,
        suppressionApplied: [],
        naturalAbilityGranted: null,
        nenTypeChanged: false,
      }),
      leaking
        ? [conditionRequest(
          emit,
          true,
          LEAKING_CONDITION_ID,
          "Awakened with no usable Ten.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}


/* ── Abrupt ─────────────────────────────────────────────────────────────── */

/*
 * What this attempt needs rolled, decided BEFORE anything is rolled.
 *
 * A pure function of the subject's Attributes, so a caller can be told exactly
 * which dice to bring. The death die is required only when a failure could
 * actually kill — Danger 0 means it cannot, and demanding a die whose result
 * the rules forbid using would invite a caller to supply one and wonder why it
 * was ignored.
 *
 * The die is required on a SUCCESS too, because whether the attempt succeeds
 * is not knowable until it is rolled, and a requirement that depended on the
 * outcome could not be published in advance.
 */
export function abruptAwakeningDiceRequirements(
  dangerScore: number,
): readonly RuntimeDieRequirement[] {
  const required = [requireOneDie(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100)];

  if (dangerScore > 0) {
    required.push(requireOneDie(ABRUPT_AWAKENING_DEATH_PURPOSE, 100));
  }

  return required;
}


/**
 * The forced route: a capable external actor, one roll, and consequences.
 *
 * No Attribute minimums, by rule. Being below them is expressed entirely in
 * the odds — every threshold shortfall divides the odds rather than refusing
 * the attempt — and in the Danger Score, which decides how badly a failure
 * goes. That is the whole of "abrupt awakening ignores the thresholds": it is
 * not that they do not matter, it is that they are priced instead of enforced.
 */
export function awakenNenAbrupt(
  context: NenAwakeningContext,
  request: AbruptAwakeningRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;
  const reawakening = isReawakening(state);

  const root = createTraceNode({
    id: "nen.awakening.abrupt",
    label: "Awaken Nen abruptly",
    formula:
      "p = clamp(odds / (1 + odds), 0.01, 0.99); on failure, roll the Danger Score's death chance",
    inputs: {
      condition: { value: state.condition },
      reawakening: { value: String(reawakening) },
      hurdle: { value: request.hurdle ?? "none" },
      actor: { value: request.actor?.ref?.id ?? "absent" },
    },
  });

  const common = findCommonAwakeningIssues(context, request?.hurdle !== undefined);

  if (common.length > 0) return failAwakening(root, common);

  /*
   * Read AFTER the preflight, not before it.
   *
   * This was the second statement of the function, so a context missing
   * `attributes` threw before the owner, the operation or the stored state had
   * been looked at once. The preflight has now proved the context is readable,
   * and this is the first thing that reads it.
   */
  const attributes = awakeningAttributes(context.requirements);

  /* The actor has to BE somebody before their capability can be judged. */
  if (
    request?.actor === undefined ||
    request.actor === null ||
    request.actor.ref === undefined ||
    request.actor.ref === null ||
    typeof request.actor.ref.id !== "string" ||
    request.actor.ref.id.trim().length === 0 ||
    typeof request.actor.ref.type !== "string" ||
    request.actor.ref.type.trim().length === 0
  ) {
    return failAwakening(root, [{
      code: "nen.awakening.actor.invalid",
      message:
        "An abrupt awakening requires an external actor, named by their content source.",
      audience: "developer",
      required: "{ type, id }",
      actual: String(request.actor?.ref),
    }]);
  }

  /*
   * The authored capability list, through the engine's own requirement
   * validator. It arrives from content, so a null entry or a malformed nested
   * node is ordinary hostile input rather than a caller's typo.
   */
  const capabilityIssues = findAwakeningRequirementIssues(
    request.actor.capability,
    "actor.capability",
    "nen.awakening.actor.capability.invalid",
    "An external actor must declare well-formed capability requirements.",
  );

  if (capabilityIssues.length > 0) return failAwakening(root, capabilityIssues);

  /*
   * The ACTOR's context, validated as thoroughly as the subject's and kept
   * separate from it. The old guard checked only whether `attributes` was
   * `undefined`, which accepts `attributes: null` and throws one call later
   * inside the requirement evaluator.
   */
  const actorContextIssues = findAwakeningRequirementContextIssues(
    request.actorContext,
    "request.actorContext",
  );

  if (actorContextIssues.length > 0) {
    return failAwakening(root, [{
      code: "nen.awakening.actor.context.invalid",
      message:
        "An abrupt awakening must be supplied a readable requirement context for the ACTOR, not only for the subject.",
      audience: "developer",
      required: "a well-formed requirement context for the actor",
      actual: actorContextIssues[0]!.actual ?? "absent",
    }]);
  }

  const capability = resolveActorCapability(
    request.actor,
    request.actorContext,
  );

  /*
   * `unresolved` is preserved as its own refusal. An actor whose Techniques
   * nobody has recorded is not an incapable actor, and telling a player their
   * teacher cannot do this would be a confident wrong answer about a missing
   * record.
   */
  if (capability.disposition !== "satisfied") {
    return failAwakening(root, [{
      code: capability.disposition === "unresolved"
        ? "nen.awakening.actor.capability.unresolved"
        : "nen.awakening.actor.incapable",
      message: capability.disposition === "unresolved"
        ? "Whether this actor can force an awakening cannot be established."
        : "This actor cannot force an awakening.",
      audience: capability.disposition === "unresolved" ? "developer" : "player",
      required: "an actor satisfying the declared capability requirements",
      actual: { actor: capability.actor.id, disposition: capability.disposition },
    }]);
  }

  const odds = deriveAbruptAwakeningOdds(
    attributes,
    request.hurdle === undefined
      ? 1
      : reawakeningAbruptOddsMultiplier(request.hurdle),
  );

  const severity = deriveAwakeningFailureSeverity(attributes);

  const diceIssues = findDiceIssues(
    request.rolls ?? [],
    abruptAwakeningDiceRequirements(severity.dangerScore),
  );

  if (diceIssues.length > 0) return failAwakening(root, diceIssues);

  const successRoll = rollsFor(
    request.rolls,
    ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  )!.values[0]!;

  const success = resolvePercentile(
    ABRUPT_AWAKENING_SUCCESS_PURPOSE,
    odds.probability,
    successRoll,
  );

  const emit = emitContextOf(context);

  root.children.push(createTraceNode({
    id: "nen.awakening.abrupt.odds",
    label: "Derive abrupt awakening odds",
    formula:
      "odds = 1.5 * 1.25^(CON-13) * 1.25^(VIT-13) * 1.25^(PER-13) * 1.25^(WIS-13) * 1.75^(SPI-16)",
    inputs: {
      con: { value: attributes.con },
      vit: { value: attributes.vit },
      per: { value: attributes.per },
      wis: { value: attributes.wis },
      spi: { value: attributes.spi },
      hurdleMultiplier: { value: odds.hurdleMultiplier },
    },
    output: {
      attributeOdds: odds.attributeOdds,
      odds: odds.odds,
      rawProbability: odds.rawProbability,
      probability: odds.probability,
      clamped: odds.clamped,
      dangerScore: severity.dangerScore,
      deathChance: severity.deathChance,
      roll: successRoll,
      succeeded: success.succeeded,
    },
  }));

  if (!success.succeeded) {
    return abruptFailure(
      context,
      root,
      emit,
      request.rolls,
      success,
      severity,
    );
  }

  const record: NenAwakeningRecord = {
    kind: "awakening",
    id: awakeningRecordId(context.operationId),
    method: "abrupt",
    occurredAt: context.occurredAt,
    source: request.actor.ref,
    reawakening,

    /* By rule, not by exception: abrupt awakening has no minimums at all. */
    eligibilityBypassed: true,
    appliedOverrides: [],
    ...(request.hurdle === undefined ? {} : { hurdle: request.hurdle }),
  };

  /*
   * NO MASTERY GRANT. Being torn open teaches nothing, which is the entire
   * reason an abrupt awakener leaks: they have open nodes and no Ten to
   * contain them.
   */
  const next: NenState = {
    ...context.nen,
    awakening: openNodes({
      state,
      record,
      naturalAbility: null,
      nenType: state.nenType,
    }),
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const leaking = isNenUncontained(next);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    method: "abrupt",
    condition: "awakened",
    nodesOpened: true,
    pseudoChuEnded: wasProducingPseudoChu(state),
    eligibility: bypassedEligibility(),
    resolutions: [success],
    leakageStarted: leaking,
    reawakening,
    hurdle: request.hurdle ?? null,
  };

  root.output = { condition: "awakened", leaking, roll: successRoll };

  return {
    success: true,
    payload: transitionOutcome(
      next,
      changes,
      awakenedEvents({
        emit,
        record,
        pseudoChuEnded: changes.pseudoChuEnded,
        masteryGranted: [],
        leaking,
        suppressionApplied: [],
        naturalAbilityGranted: null,
        nenTypeChanged: false,
      }),
      leaking
        ? [conditionRequest(
          emit,
          true,
          LEAKING_CONDITION_ID,
          "Abruptly awakened with no Ten.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}


/*
 * A failed attempt: the state is returned UNTOUCHED and the body pays.
 *
 * `context.nen` is returned by reference rather than rebuilt, which is the
 * strongest possible statement of "nothing changed" — there is no copy for a
 * dropped field to hide in. No history entry is written either: the history
 * records awakenings, and this was not one.
 *
 * The death roll happens HERE, after the success roll failed, and only when
 * the Danger Score says it can. A character at or above every threshold takes
 * severe trauma from a failure and cannot die of it, however the dice fall.
 */
function abruptFailure(
  context: NenAwakeningContext,
  root: TraceNode,
  emit: EmitContext,
  rolls: readonly RuntimeRollSet[],
  success: NenAwakeningResolution,
  severity: ReturnType<typeof deriveAwakeningFailureSeverity>,
): NenAwakeningTransitionResult {
  const resolutions: NenAwakeningResolution[] = [success];

  let fatal = false;

  if (severity.deathChance > 0) {
    const deathRoll = rollsFor(rolls, ABRUPT_AWAKENING_DEATH_PURPOSE);

    /*
     * Unreachable in practice: the dice were validated against a requirement
     * list that includes the death die whenever the Danger Score is positive.
     * Kept because a future caller reaching this function directly must not be
     * able to skip the roll and get a free non-fatal failure.
     */
    if (deathRoll === undefined) {
      return failAwakening(root, [{
        code: "nen.awakening.death-roll.missing",
        message: "A failure at this Danger Score requires a death roll.",
        audience: "developer",
        required: `one d100 for ${ABRUPT_AWAKENING_DEATH_PURPOSE}`,
        actual: "absent",
      }]);
    }

    const death = resolvePercentile(
      ABRUPT_AWAKENING_DEATH_PURPOSE,
      severity.deathChance,
      deathRoll.values[0]!,
    );

    resolutions.push(death);
    fatal = death.succeeded;
  }

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(context.nen.awakening.condition),
    method: "abrupt",
    eligibility: bypassedEligibility(),
    resolutions,
    trauma: fatal ? "fatal" : "severe",
  };

  root.output = {
    condition: context.nen.awakening.condition,
    succeeded: false,
    dangerScore: severity.dangerScore,
    trauma: changes.trauma,
  };

  const events = sequenceAwakeningEvents([
    awakeningEvent(emit, "nen-awakening-failed", "abrupt"),
    awakeningEvent(
      emit,
      fatal ? "nen-fatal-trauma" : "nen-trauma",
      String(severity.dangerScore),
    ),
  ]);

  const requests: RuntimeRequest[] = [
    traumaRequest(emit, fatal ? "fatal" : "severe", severity.dangerScore),
  ];

  return {
    success: true,
    payload: transitionOutcome(context.nen, changes, events, requests),
    trace: { root },
    warnings: [],
  };
}
