/*
 * Universal Nen structure and mastery rules.
 *
 * Nen principles use the engine-wide Mastery vocabulary defined by
 * capabilities/mastery.ts:
 *
 *   0     = locked / unlearned
 *   I-X   = learned Mastery
 *
 * This file does not define what Mastery ranks are. It defines how those
 * shared ranks interact inside the Nen system.
 *
 * This file owns:
 *
 * - Nen awakening state validation
 * - the Nen progression rules: unlock, mastery, contextual and attribute
 *   prerequisites, and their validation
 * - structural Nen mastery ceilings
 * - unlock and advancement eligibility
 * - temporary mastery sealing
 * - propagation of temporary mastery reductions through MASTERY prerequisites
 *
 * This file does NOT own:
 *
 * - the generic Mastery rank vocabulary
 * - principle-specific mechanics
 * - Growth Point costs
 * - breakthrough requirements
 * - principle-specific advancement mutations
 * - Nen Ability mechanics
 *
 * Generic Mastery rules belong in capabilities/mastery.ts.
 *
 * Principle-specific rules belong in the relevant principle files.
 *
 * Nen Ability rules belong in the Nen Ability subsystem.
 *
 *
 * CONTROLLED MASTERY
 * ------------------
 *
 * The graph below represents controlled, learned Nen mastery.
 *
 * Exceptional natural awakening states such as forced instinctive Zetsu or
 * an instinctively awakened Hatsu do not permanently rewrite this graph.
 * Those exceptional awakening states will be represented separately when
 * awakening mechanics are implemented.
 *
 * A naturally awakened character must still learn controlled Nen in the
 * normal foundational order:
 *
 *   Ten -> Ren -> Zetsu -> Hatsu
 *
 * That order is an UNLOCK sequence. Each of the four must be learned before
 * the next can be, and once learned each advances independently: Ren I and
 * Zetsu X coexist, and sealing Ren does not reduce Zetsu.
 */


import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";

import {
  getNextMasteryRank,
  isMasteryValue,
  MASTERY_RANKS,
  NO_MASTERY,
  STANDARD_MASTERY_MAX,
} from "../../capabilities/mastery";

import { ATTRIBUTE_KEYS } from "../attributes/base";
import type { Attributes } from "../attributes/types";
import type { MasteryRank } from "../../capabilities/mastery";

import {
  findNenAffinityKnowledgeIssues,
  type NenAffinityKnowledge,
} from "./nen-type";
import {
  createUnawakenedAwakeningState,
  hasEverAwakened,
  isAwakened,
} from "./awakening/state";
import {
  findAwakeningStateIssues,
} from "./awakening/validation";

import type {
  NenAdvancementEvaluation,
  NenAttributeRequirement,
  NenContextualPrerequisite,
  NenMasteryRank,
  NenPrincipleId,
  NenProgressionRules,
  NenState,
} from "./types";


/** A complete set of progression rules, one entry per principle. */
export type NenProgressionRuleSet =
  Readonly<Record<NenPrincipleId, NenProgressionRules>>;


/**
 * Authoritative Nen progression rules.
 *
 * Three kinds of dependency, each with its own consumer — see
 * NenProgressionRules in types.ts:
 *
 *   unlockPrerequisites    judged only when learning Mastery I
 *   masteryPrerequisites   cap mastery continuously; several cap at their
 *                          minimum, and seals propagate through them
 *   attributeRequirements  judged when a rank is learned or advanced
 *
 *
 * THE FOUR MAJOR PRINCIPLES
 *
 *   Ten -> Ren -> Zetsu -> Hatsu, unlock only, and no attribute requirements.
 *
 *
 * KEN AND GYŌ
 *
 *   capped by min(effective Ten, effective Ren).
 *
 * Gyō's DEX requirement has no authoritative per-rank table in the engine, so
 * none is authored here. Adding one is a design decision, not an inference.
 *
 *
 * EVERYTHING ELSE
 *
 * Every other relationship is a mastery prerequisite, exactly as the single
 * prerequisite list previously encoded it:
 *
 * Ko:
 *   - Ten, Ren, Zetsu, and Gyō cap it.
 *   - Chū caps it only from Mastery VI onward.
 *   - Shū is contextual and applies only when Ko is used through a weapon.
 *
 * Ryū:
 *   - Gyō and Ken cap it.
 *   - Chū caps it only from Mastery VI onward.
 *   - Shū is contextual and applies only when Ryū is used through a weapon.
 */
export const NEN_PROGRESSION_RULES: NenProgressionRuleSet = {

  ten: {},

  ren: { unlockPrerequisites: ["ten"] },

  zetsu: { unlockPrerequisites: ["ren"] },

  hatsu: { unlockPrerequisites: ["zetsu"] },

  shu: {
    masteryPrerequisites: [{ principleId: "ten" }],
  },

  en: {
    masteryPrerequisites: [{ principleId: "ten" }, { principleId: "ren" }],
  },

  gyo: {
    masteryPrerequisites: [{ principleId: "ten" }, { principleId: "ren" }],
  },

  ken: {
    masteryPrerequisites: [{ principleId: "ten" }, { principleId: "ren" }],
  },

  chu: {
    masteryPrerequisites: [
      { principleId: "ten" },
      { principleId: "ren" },
      { principleId: "zetsu" },
    ],
  },

  in: {
    masteryPrerequisites: [{ principleId: "zetsu" }],
  },

  ko: {
    masteryPrerequisites: [
      { principleId: "ten" },
      { principleId: "ren" },
      { principleId: "zetsu" },
      { principleId: "gyo" },
      { principleId: "chu", fromRank: 6 },
    ],
    contextualPrerequisites: [{ principleId: "shu", context: "weapon" }],
  },

  ryu: {
    masteryPrerequisites: [
      { principleId: "gyo" },
      { principleId: "ken" },
      { principleId: "chu", fromRank: 6 },
    ],
    contextualPrerequisites: [{ principleId: "shu", context: "weapon" }],
  },

  yu: {
    masteryPrerequisites: [
      { principleId: "gyo" },
      { principleId: "ren" },
      { principleId: "chu" },
      { principleId: "hatsu" },
    ],
  },

  ju: {
    masteryPrerequisites: [
      { principleId: "ken" },
      { principleId: "chu" },
      { principleId: "hatsu" },
    ],
  },

  fu: {
    masteryPrerequisites: [{ principleId: "en" }, { principleId: "hatsu" }],
  },
};


export const NEN_PRINCIPLE_IDS =
  Object.keys(
    NEN_PROGRESSION_RULES,
  ) as NenPrincipleId[];


/**
 * The Nen state of somebody who has never awakened.
 *
 * Required rather than optional on Character, and this is what makes that
 * cheap. Every principle at NO_MASTERY and an unawakened awakening state is a
 * real,
 * complete answer — an ordinary person HAS this Nen state, they do not lack
 * one. Leaving the field absent would have made "no Nen data recorded" and
 * "definitely unawakened" the same value, and only one of those is a fact
 * about the character.
 *
 * The affinity is REQUIRED rather than defaulted. Every character has a Nen
 * Type from birth, so a constructor that quietly supplied one would be the
 * engine deciding it. A host with no value to give passes
 * unassignedNenAffinity(), which says that about the RECORD rather than about
 * the person.
 *
 * Note what it does NOT say: nothing about Aura. An unawakened character still
 * has a pool and still loses Current Aura. See foundation/aura/state.ts.
 */
export function createUnawakenedNenState(
  affinity: NenAffinityKnowledge,
): NenState {
  const mastery = {} as Record<NenPrincipleId, NenMasteryRank>;

  for (const principleId of NEN_PRINCIPLE_IDS) {
    mastery[principleId] = NO_MASTERY;
  }

  return { awakening: createUnawakenedAwakeningState(), affinity, mastery };
}


/**
 * Whether the character can use Nen RIGHT NOW.
 *
 * The reading that replaced `state.awakened`, and the one almost every caller
 * wants. It is false for a reverted character, who keeps everything they
 * learned and can reach none of it.
 *
 * A wrapper over the awakening domain's own reading rather than a second
 * comparison, so there is exactly one place that decides what "awakened" means
 * and NenState consumers do not reach past the field to answer it.
 */
export function isNenAwakened(state: NenState): boolean {
  return isAwakened(state.awakening);
}


/**
 * Whether the character has EVER awakened.
 *
 * The reading that governs PERMANENT mastery. These two are not
 * interchangeable and the difference is the entire reversion rule: a reverted
 * character is not awakened and has legitimately trained Ten V.
 */
export function hasEverAwakenedNen(state: NenState): boolean {
  return hasEverAwakened(state.awakening);
}


/**
 * Nen-facing runtime validation for a stored Mastery value.
 *
 * The generic Mastery system owns the actual range. This alias remains so
 * Nen consumers do not need to reach into the capability layer merely to
 * validate a Nen Mastery value.
 */
export function isNenMasteryRank(
  value: number,
): value is NenMasteryRank {
  return isMasteryValue(value);
}


/**
 * Return the character's permanently learned mastery in a principle.
 */
export function getNenMasteryRank(
  state: NenState,
  principleId: NenPrincipleId,
): NenMasteryRank {
  return state.mastery[principleId];
}


/**
 * Return the temporary local cap applied directly to a principle.
 *
 * This does NOT yet account for prerequisite principles being sealed.
 */
export function getLocalEffectiveMasteryRank(
  state: NenState,
  principleId: NenPrincipleId,
): NenMasteryRank {
  const permanent =
    state.mastery[principleId];

  const seal =
    state.seals?.[principleId];


  if (seal === undefined) {
    return permanent;
  }


  return Math.min(
    permanent,
    seal,
  ) as NenMasteryRank;
}


/**
 * The MASTERY prerequisites that cap a principle at a particular rank.
 *
 * Unlock and contextual prerequisites are deliberately excluded: this is the
 * only list effective and permanent mastery ceilings are resolved from.
 */
export function getNenMasteryPrerequisitesForRank(
  principleId: NenPrincipleId,
  targetRank: NenMasteryRank,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): readonly NenPrincipleId[] {
  return (rules[principleId].masteryPrerequisites ?? [])
    .filter((prerequisite) =>
      prerequisite.fromRank === undefined ||
      targetRank >= prerequisite.fromRank
    )
    .map((prerequisite) => prerequisite.principleId);
}


/**
 * The principles that must already be learned before Mastery I here.
 *
 * Consulted when learning Mastery I and at no other time.
 */
export function getNenUnlockPrerequisites(
  principleId: NenPrincipleId,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): readonly NenPrincipleId[] {
  return rules[principleId].unlockPrerequisites ?? [];
}


/** The attribute thresholds judged when a rank of this principle is acquired. */
export function getNenAttributeRequirements(
  principleId: NenPrincipleId,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): readonly NenAttributeRequirement[] {
  return rules[principleId].attributeRequirements ?? [];
}


/**
 * Return contextual prerequisites for a principle.
 *
 * These do not affect ordinary mastery validation.
 *
 * At present, this is primarily used for Shū when Ko or Ryū is being used
 * through a weapon.
 */
export function getNenContextualPrerequisites(
  principleId: NenPrincipleId,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): readonly NenContextualPrerequisite[] {
  return rules[principleId].contextualPrerequisites ?? [];
}


/**
 * Derive the highest mastery rank structurally allowed by the character's
 * PERMANENT prerequisite mastery.
 *
 * This is used for advancement and permanent-state validation.
 *
 * Temporary seals are deliberately ignored here because they do not erase
 * learned mastery.
 */
export function deriveMaximumNenMastery(
  state: NenState,
  principleId: NenPrincipleId,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): NenMasteryRank {
  /*
   * EVER awakened, not currently awakened.
   *
   * This is the PERMANENT ceiling, and a reverted character permanently knows
   * what they trained — reversion disables access and keeps every rank. Gating
   * it on the current condition would make validateNenState refuse the exact
   * state reversion is defined to produce, and would silently erase a
   * character's Mastery the moment anything re-validated their sheet.
   */
  if (!hasEverAwakenedNen(state)) {
    return NO_MASTERY;
  }


  /*
   * A principle with no mastery prerequisites may advance through the entire
   * generic Mastery range. Unlock prerequisites never cap it.
   */
  if ((rules[principleId].masteryPrerequisites ?? []).length === 0) {
    return STANDARD_MASTERY_MAX;
  }


  let maximum: NenMasteryRank =
    NO_MASTERY;


  /*
   * The generic Mastery system owns which learned ranks exist.
   *
   * Nen only decides whether each of those ranks is structurally permitted.
   */
  for (const targetRank of MASTERY_RANKS) {
    const prerequisites =
      getNenMasteryPrerequisitesForRank(
        principleId,
        targetRank,
        rules,
      );


    const valid =
      prerequisites.every(
        prerequisiteId =>
          state.mastery[prerequisiteId] >=
          targetRank,
      );


    if (!valid) {
      break;
    }


    maximum = targetRank;
  }


  return maximum;
}


/**
 * Derive the mastery rank the character can CURRENTLY use.
 *
 * Unlike permanent mastery, this respects temporary seals.
 *
 * Seals propagate through MASTERY prerequisites, and only through those.
 *
 * Example:
 *
 *   Ten permanent = V, Ren permanent = V, Ken permanent = V
 *
 * If Ten is temporarily sealed to III, Ken cannot currently function above
 * III even though the character permanently retains Ken V. Sealing Ren to III
 * does NOT reduce Zetsu: Ren only had to be learned before Zetsu could be.
 *
 * Unlock and contextual prerequisites are not included.
 */
export function deriveEffectiveNenMastery(
  state: NenState,
  principleId: NenPrincipleId,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): NenMasteryRank {
  /*
   * CURRENTLY awakened, which is the half of the pair reversion turns off. A
   * reverted character retains Ten V permanently and can use none of it, and
   * this function is the one that has to say so — it is what Aura is handed to
   * decide whether Ten is available.
   */
  if (!isNenAwakened(state)) {
    return NO_MASTERY;
  }


  const memo =
    new Map<
      NenPrincipleId,
      NenMasteryRank
    >();


  const visiting =
    new Set<NenPrincipleId>();


  function derive(
    currentId: NenPrincipleId,
  ): NenMasteryRank {
    const cached =
      memo.get(currentId);


    if (cached !== undefined) {
      return cached;
    }


    /*
     * Defensive cycle protection.
     *
     * The authored mastery prerequisites must remain acyclic.
     */
    if (visiting.has(currentId)) {
      return NO_MASTERY;
    }


    visiting.add(currentId);


    const localMaximum =
      getLocalEffectiveMasteryRank(
        state,
        currentId,
      );


    /*
     * A malformed stored rank or seal is passed through untouched rather than
     * resolved. The rank loop below never breaks on NaN, so a principle with no
     * prerequisites would otherwise read an unreadable rank as Mastery X — and
     * the validators downstream can only refuse what they are shown.
     */
    if (!isMasteryValue(localMaximum)) {
      visiting.delete(currentId);
      memo.set(currentId, localMaximum);

      return localMaximum;
    }


    if (localMaximum === NO_MASTERY) {
      visiting.delete(currentId);

      memo.set(
        currentId,
        NO_MASTERY,
      );

      return NO_MASTERY;
    }


    let effective: NenMasteryRank =
      NO_MASTERY;


    for (const targetRank of MASTERY_RANKS) {
      if (targetRank > localMaximum) {
        break;
      }


      const prerequisites =
        getNenMasteryPrerequisitesForRank(
          currentId,
          targetRank,
          rules,
        );


      const valid =
        prerequisites.every(
          prerequisiteId =>
            derive(prerequisiteId) >=
            targetRank,
        );


      if (!valid) {
        break;
      }


      effective = targetRank;
    }


    visiting.delete(currentId);

    memo.set(
      currentId,
      effective,
    );


    return effective;
  }


  return derive(principleId);
}


/**
 * Whether a principle can currently be learned at Mastery I according to the
 * universal progression rules: its unlock prerequisites are learned and its
 * mastery prerequisites permit Mastery I.
 *
 * Attribute requirements are not checked here; see
 * resolveNenAdvancementEligibility.
 */
export function isNenPrincipleUnlocked(
  state: NenState,
  principleId: NenPrincipleId,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): boolean {
  /* Learning needs open nodes now, not a memory of having had them. */
  if (!isNenAwakened(state)) {
    return false;
  }


  /*
   * STORED mastery: "learned" is a permanent fact, so a sealed prerequisite
   * has still been learned.
   */
  const unlocked = getNenUnlockPrerequisites(principleId, rules).every(
    (prerequisiteId) => state.mastery[prerequisiteId] > NO_MASTERY,
  );


  return (
    unlocked &&
    deriveMaximumNenMastery(
      state,
      principleId,
      rules,
    ) > NO_MASTERY
  );
}


/**
 * Validate a single one-rank advancement against the universal progression
 * rules: unlock prerequisites when learning Mastery I, and mastery
 * prerequisites at every rank.
 *
 * This performs STRUCTURAL validation only. Attribute requirements are judged
 * by resolveNenAdvancementEligibility, which composes this. Still outside
 * both:
 *
 * - training requirements
 * - Growth Point costs
 * - breakthrough conditions
 * - principle-specific restrictions
 */
export function validateNenAdvancement(
  state: NenState,
  principleId: NenPrincipleId,
  targetRank: NenMasteryRank,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): EngineResult<NenAdvancementEvaluation> {
  const currentRank =
    state.mastery[principleId];


  const maximumAllowedByGraph =
    deriveMaximumNenMastery(
      state,
      principleId,
      rules,
    );


  /* Judged only for the step that learns Mastery I. */
  const unlockPrerequisites =
    currentRank === NO_MASTERY
      ? getNenUnlockPrerequisites(principleId, rules)
      : [];


  const traceNode = createTraceNode({
    id: "nen.mastery.validate-advancement",
    label: "Validate Nen mastery advancement",

    formula:
      "targetRank = nextMasteryRank(currentRank) && unlock prerequisites learned when currentRank = 0 && targetRank <= maximumAllowedByGraph",

    inputs: {
      principleId: {
        value: principleId,
      },

      currentRank: {
        value: currentRank,
      },

      targetRank: {
        value: targetRank,
      },

      maximumAllowedByGraph: {
        value: maximumAllowedByGraph,
      },
    },
  });


  /*
   * Advancing needs access NOW. A reverted character keeps every rank they
   * trained and can train no further until they reawaken, which is a different
   * refusal from an unawakened character's and says so.
   */
  if (!isNenAwakened(state)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "nen.not_awakened",
          message:
            state.awakening.condition === "reverted"
              ? "Nen mastery cannot be advanced while Nen access is reverted."
              : "Nen mastery cannot be advanced before Nen is awakened.",
          audience: "player",
          required: "awakened Nen",
          actual: state.awakening.condition,
        },
      ],
    };
  }


  if (!isNenMasteryRank(targetRank)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "nen.mastery.rank.invalid",
          message:
            `Nen mastery rank must be an integer from ${NO_MASTERY} through ${STANDARD_MASTERY_MAX}.`,
          audience: "developer",
          required:
            `integer from ${NO_MASTERY} through ${STANDARD_MASTERY_MAX}`,
          actual: targetRank,
        },
      ],
    };
  }


  const nextRank =
    getNextMasteryRank(
      currentRank,
      STANDARD_MASTERY_MAX,
    );


  if (
    nextRank === null ||
    targetRank !== nextRank
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "nen.mastery.advancement.invalid_step",
          message:
            nextRank === null
              ? "Nen mastery is already at its maximum rank."
              : "Nen mastery must advance exactly one rank at a time.",
          audience: "player",
          required:
            nextRank === null
              ? `no rank beyond ${STANDARD_MASTERY_MAX}`
              : nextRank,
          actual: targetRank,
        },
      ],
    };
  }


  /*
   * Unlock prerequisites, against STORED mastery. Learned is a permanent fact:
   * a sealed Ten has still been learned, and Ren may still be unlocked.
   */
  const missingUnlocks = unlockPrerequisites.filter(
    (prerequisiteId) => state.mastery[prerequisiteId] === NO_MASTERY,
  );


  if (missingUnlocks.length > 0) {
    return {
      success: false,
      trace: {
        root: traceNode,
      },
      warnings: [],
      errors: [
        {
          code: "nen.mastery.unlock_prerequisite_not_met",
          message:
            "This principle cannot be learned until the principles that unlock it have been learned.",
          audience: "player",
          required: { unlockPrerequisites: [...unlockPrerequisites] },
          actual: { missing: [...missingUnlocks] },
        },
      ],
    };
  }


  if (
    targetRank >
    maximumAllowedByGraph
  ) {
    const prerequisites =
      getNenMasteryPrerequisitesForRank(
        principleId,
        targetRank,
        rules,
      );


    const blockingPrerequisites =
      prerequisites.filter(
        prerequisiteId =>
          state.mastery[prerequisiteId] <
          targetRank,
      );


    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "nen.mastery.prerequisite_not_met",
          message:
            "Nen mastery cannot exceed the mastery of the principles that cap it.",
          audience: "player",
          required: {
            targetRank,

            // Spread because a readonly array is not JSON-assignable, and a
            // diagnostic has to survive serialisation to reach a UI.
            prerequisites: [...prerequisites],
          },
          actual: {
            blockingPrerequisites:
              blockingPrerequisites.map(
                prerequisiteId => ({
                  principleId:
                    prerequisiteId,

                  mastery:
                    state.mastery[
                      prerequisiteId
                    ],
                }),
              ),
          },
        },
      ],
    };
  }


  const payload: NenAdvancementEvaluation = {
    principleId,
    currentRank,
    targetRank,
    maximumAllowedByGraph,
    allowedByGraph: true,
    unlockPrerequisites,
  };


  /*
   * Spelled out rather than assigning the payload directly: an interface has
   * no index signature, so it is not assignable to JsonValue even when every
   * field in it is JSON-safe.
   */
  traceNode.output = {
    principleId: payload.principleId,
    currentRank: payload.currentRank,
    targetRank: payload.targetRank,
    maximumAllowedByGraph: payload.maximumAllowedByGraph,
    allowedByGraph: payload.allowedByGraph,
    unlockPrerequisites: [...payload.unlockPrerequisites],
  };


  return {
    success: true,
    payload,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Validate the permanent Nen mastery state.
 *
 * Temporary seals are not considered violations because they do not modify
 * what the character has permanently learned.
 */
export function validateNenState(
  state: NenState,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): EngineResult<NenState> {
  const traceNode = createTraceNode({
    id: "nen.state.validate",
    label: "Validate Nen state",

    formula:
      "stored mastery must satisfy awakening and mastery prerequisites",

    inputs: {
      condition: {
        value: state.awakening?.condition ?? String(state.awakening),
      },
    },
  });


  const errors: EngineError[] = [];


  /*
   * The awakening state is judged FIRST, and its issues stop the pass.
   *
   * Every mastery rule below reads the condition and the history, so a
   * malformed awakening state would have those rules answering from a shape
   * nobody has checked — which is how "reverted with no history" became a
   * character who could hold Mastery they never trained.
   */
  const awakeningIssues = [
    ...findAwakeningStateIssues(state.awakening),

    /*
     * The one stored affinity, judged structurally alongside the awakening.
     * No mastery rule reads it, but a state that validated with a malformed
     * lean would hand the next profile lookup a record nobody had checked.
     */
    ...findNenAffinityKnowledgeIssues(state.affinity, "affinity"),
  ];

  if (awakeningIssues.length > 0) {
    traceNode.output = { valid: false };

    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        awakeningIssues as readonly EngineError[] as
          NonEmptyArray<EngineError>,
    };
  }


  for (
    const principleId
    of NEN_PRINCIPLE_IDS
  ) {
    const mastery =
      state.mastery[principleId];


    if (!isMasteryValue(mastery)) {
      errors.push({
        code: "nen.mastery.rank.invalid",
        message:
          `${principleId} mastery must be an integer from ${NO_MASTERY} through ${STANDARD_MASTERY_MAX}.`,
        audience: "developer" as const,
        required:
          `integer from ${NO_MASTERY} through ${STANDARD_MASTERY_MAX}`,
        actual: mastery,
      });

      continue;
    }


    const seal =
      state.seals?.[principleId];


    if (
      seal !== undefined &&
      !isMasteryValue(seal)
    ) {
      errors.push({
        code: "nen.mastery.seal.invalid",
        message:
          `${principleId} temporary mastery cap must be an integer from ${NO_MASTERY} through ${STANDARD_MASTERY_MAX}.`,
        audience: "developer" as const,
        required:
          `integer from ${NO_MASTERY} through ${STANDARD_MASTERY_MAX}`,
        actual: seal,
      });
    }
  }


  /*
   * EVER awakened, which is the whole of the change reversion forced here.
   *
   * The old rule read a boolean and refused any Mastery on a character who was
   * not awakened RIGHT NOW — which is exactly the state reversion produces, so
   * a reverted character with the Ten V they trained failed their own sheet's
   * validation. What is actually forbidden is Mastery on a character who has
   * never awakened at all, and that is what this asks.
   */
  if (
    !hasEverAwakenedNen(state) &&
    NEN_PRINCIPLE_IDS.some(
      principleId =>
        state.mastery[principleId] >
        NO_MASTERY,
    )
  ) {
    errors.push({
      code: "nen.mastery.before_awakening",
      message:
        "A character cannot possess controlled Nen mastery before Nen is awakened.",
      audience: "developer" as const,
      required:
        `all mastery ranks equal ${NO_MASTERY} while Nen has never been awakened`,

      // Copied rather than passed through: a readonly record is not a
      // JsonObject, and a diagnostic has to be serialisable.
      actual: { ...state.mastery },
    });
  }


  if (hasEverAwakenedNen(state)) {
    for (
      const principleId
      of NEN_PRINCIPLE_IDS
    ) {
      const mastery =
        state.mastery[principleId];


      if (mastery === NO_MASTERY) {
        continue;
      }


      const maximum =
        deriveMaximumNenMastery(
          state,
          principleId,
          rules,
        );


      /*
       * Mastery prerequisites only. Unlock prerequisites are judged once, when
       * Mastery I is learned, and are deliberately not re-asserted against a
       * stored sheet: they are acquisition rules, not state invariants.
       */
      if (mastery > maximum) {
        errors.push({
          code:
            "nen.mastery.graph.invalid",
          message:
            `${principleId} mastery exceeds the mastery permitted by the principles that cap it.`,
          audience: "developer" as const,
          required: {
            maximumMastery: maximum,
          },
          actual: {
            mastery,
          },
        });
      }
    }
  }


  traceNode.output = {
    valid: errors.length === 0,
  };


  if (errors.length > 0) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      /*
       * The length check is the guarantee; the type system cannot carry it
       * across the branch. Same cast the other validators make.
       */
      errors:
        errors as NonEmptyArray<EngineError>,
    };
  }


  return {
    success: true,

    payload: state,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}

/* ── Progression rule validation ────────────────────────────────────────── */

/**
 * Everything wrong with a progression rule set.
 *
 * Reported in full, and judged before any eligibility is resolved against the
 * rules, so a malformed set refuses rather than quietly permitting or blocking
 * a rank:
 *
 * - every principle has exactly one entry, and nothing else does;
 * - every referenced principle exists, and none refers to itself;
 * - no principle is listed twice in one list, or as both an unlock and a
 *   mastery prerequisite of the same child;
 * - a conditional mastery prerequisite starts at a real rank;
 * - attribute requirements name a real attribute once each and give a finite,
 *   non-negative, non-decreasing threshold for every rank;
 * - neither the unlock nor the mastery relation contains a cycle.
 */
export function findNenProgressionRuleIssues(
  rules: NenProgressionRuleSet,
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const known = new Set<string>(NEN_PRINCIPLE_IDS);

  const issue = (code: string, message: string, actual: unknown): void => {
    errors.push({
      code,
      message,
      audience: "developer",
      required: "a well-formed Nen progression rule set",
      actual: describeDiagnosticValue(actual),
    });
  };

  if (rules === null || typeof rules !== "object") {
    issue("nen.progression.rules.malformed", "Nen progression rules must be an object.", rules);

    return errors;
  }

  for (const key of Object.keys(rules)) {
    if (!known.has(key)) {
      issue("nen.progression.principle.unknown", `"${key}" is not a Nen principle.`, key);
    }
  }

  const listOf = (value: unknown): readonly unknown[] | null =>
    value === undefined ? [] : Array.isArray(value) ? value : null;

  for (const principleId of NEN_PRINCIPLE_IDS) {
    const entry = rules[principleId] as NenProgressionRules | undefined;

    if (entry === null || typeof entry !== "object") {
      issue("nen.progression.principle.missing", `${principleId} has no progression rules.`, principleId);
      continue;
    }

    const unlocks = listOf(entry.unlockPrerequisites);
    const masteries = listOf(entry.masteryPrerequisites);
    const contextual = listOf(entry.contextualPrerequisites);
    const attributes = listOf(entry.attributeRequirements);

    for (const [name, list] of [
      ["unlockPrerequisites", unlocks],
      ["masteryPrerequisites", masteries],
      ["contextualPrerequisites", contextual],
      ["attributeRequirements", attributes],
    ] as const) {
      if (list === null) {
        issue("nen.progression.list.malformed", `${principleId}.${name} must be a list.`, principleId);
      }
    }

    const reference = (id: unknown, where: string): string | null => {
      if (typeof id !== "string" || !known.has(id)) {
        issue("nen.progression.prerequisite.unknown", `${principleId}.${where} names an unknown principle.`, id);
        return null;
      }

      if (id === principleId) {
        issue("nen.progression.prerequisite.self", `${principleId}.${where} names itself.`, id);
        return null;
      }

      return id;
    };

    const unlockIds = new Set<string>();

    for (const id of unlocks ?? []) {
      const valid = reference(id, "unlockPrerequisites");

      if (valid === null) continue;

      if (unlockIds.has(valid)) {
        issue("nen.progression.prerequisite.duplicate", `${principleId} lists ${valid} as an unlock prerequisite twice.`, valid);
      }

      unlockIds.add(valid);
    }

    const masteryIds = new Set<string>();

    for (const prerequisite of masteries ?? []) {
      const candidate = prerequisite as NenMasteryPrerequisiteShape | null;
      const valid = reference(
        candidate !== null && typeof candidate === "object" ? candidate.principleId : candidate,
        "masteryPrerequisites",
      );

      if (valid === null) continue;

      if (masteryIds.has(valid)) {
        issue("nen.progression.prerequisite.duplicate", `${principleId} lists ${valid} as a mastery prerequisite twice.`, valid);
      }

      if (unlockIds.has(valid)) {
        issue(
          "nen.progression.prerequisite.ambiguous",
          `${principleId} lists ${valid} as both an unlock and a mastery prerequisite.`,
          valid,
        );
      }

      masteryIds.add(valid);

      const fromRank = candidate!.fromRank;

      if (
        fromRank !== undefined &&
        !(MASTERY_RANKS as readonly unknown[]).includes(fromRank)
      ) {
        issue("nen.progression.prerequisite.from_rank.invalid", `${principleId}'s ${valid} cap starts at an invalid rank.`, fromRank);
      }
    }

    for (const prerequisite of contextual ?? []) {
      const candidate = prerequisite as { principleId?: unknown; context?: unknown } | null;

      if (candidate === null || typeof candidate !== "object") {
        issue("nen.progression.contextual.malformed", `${principleId} has a malformed contextual prerequisite.`, candidate);
        continue;
      }

      reference(candidate.principleId, "contextualPrerequisites");

      if (candidate.context !== "weapon") {
        issue("nen.progression.contextual.context.invalid", `${principleId} has an unknown prerequisite context.`, candidate.context);
      }
    }

    const attributeKeys = new Set<string>();

    for (const requirement of attributes ?? []) {
      const candidate = requirement as { attribute?: unknown; minimumByRank?: unknown } | null;

      if (
        candidate === null ||
        typeof candidate !== "object" ||
        typeof candidate.attribute !== "string" ||
        !(ATTRIBUTE_KEYS as readonly string[]).includes(candidate.attribute)
      ) {
        issue("nen.progression.attribute.invalid", `${principleId} names an unknown attribute requirement.`, candidate?.attribute);
        continue;
      }

      if (attributeKeys.has(candidate.attribute)) {
        issue("nen.progression.attribute.duplicate", `${principleId} requires ${candidate.attribute} twice.`, candidate.attribute);
      }

      attributeKeys.add(candidate.attribute);

      const table = candidate.minimumByRank as Record<number, unknown> | null;
      let previous = Number.NEGATIVE_INFINITY;

      for (const rank of MASTERY_RANKS) {
        const minimum = table !== null && typeof table === "object" ? table[rank] : undefined;

        if (typeof minimum !== "number" || !Number.isFinite(minimum) || minimum < 0) {
          issue(
            "nen.progression.attribute.threshold.invalid",
            `${principleId}'s ${candidate.attribute} requirement at rank ${rank} must be a finite non-negative number.`,
            minimum,
          );
          break;
        }

        if (minimum < previous) {
          issue(
            "nen.progression.attribute.threshold.decreasing",
            `${principleId}'s ${candidate.attribute} requirement falls at rank ${rank}.`,
            minimum,
          );
          break;
        }

        previous = minimum;
      }
    }
  }

  if (errors.length > 0) return errors;

  /*
   * Acyclic, per relation. A cycle in either would make a principle its own
   * prerequisite at one remove, which no character could ever satisfy.
   */
  const cyclic = (edges: (id: NenPrincipleId) => readonly NenPrincipleId[]): NenPrincipleId | null => {
    const state = new Map<NenPrincipleId, "visiting" | "done">();

    const visit = (id: NenPrincipleId): boolean => {
      const mark = state.get(id);

      if (mark === "done") return false;
      if (mark === "visiting") return true;

      state.set(id, "visiting");

      const found = edges(id).some(visit);

      state.set(id, "done");

      return found;
    };

    return NEN_PRINCIPLE_IDS.find(visit) ?? null;
  };

  const unlockCycle = cyclic((id) => rules[id].unlockPrerequisites ?? []);

  if (unlockCycle !== null) {
    issue("nen.progression.unlock.cyclic", "The unlock prerequisites contain a cycle.", unlockCycle);
  }

  const masteryCycle = cyclic((id) =>
    (rules[id].masteryPrerequisites ?? []).map((one) => one.principleId)
  );

  if (masteryCycle !== null) {
    issue("nen.progression.mastery.cyclic", "The mastery prerequisites contain a cycle.", masteryCycle);
  }

  return errors;
}


interface NenMasteryPrerequisiteShape {
  readonly principleId?: unknown;
  readonly fromRank?: unknown;
}


/* ── Advancement eligibility ────────────────────────────────────────────── */

export interface NenAdvancementEligibility extends NenAdvancementEvaluation {
  /** The attribute thresholds judged for the target rank, all satisfied. */
  readonly attributeRequirements: readonly {
    readonly attribute: string;
    readonly minimum: number;
    readonly actual: number;
  }[];
}


/**
 * Whether a character may learn or advance a principle to a rank.
 *
 * The acquisition-side resolver, and deliberately NOT effective mastery. It
 * composes, in order:
 *
 *   1. the rule set itself, refused if malformed;
 *   2. the stored Nen state, refused if malformed;
 *   3. structural advancement — one step, unlock prerequisites for Mastery I,
 *      mastery prerequisites at every rank;
 *   4. attribute requirements for the target rank, against the supplied
 *      attributes.
 *
 * Pure: it reads a state and answers, and nothing is learned by asking.
 */
export function resolveNenAdvancementEligibility(
  state: NenState,
  principleId: NenPrincipleId,
  targetRank: NenMasteryRank,
  attributes: Attributes,
  rules: NenProgressionRuleSet = NEN_PROGRESSION_RULES,
): EngineResult<NenAdvancementEligibility> {
  const traceNode = createTraceNode({
    id: "nen.mastery.advancement-eligibility",
    label: "Resolve Nen advancement eligibility",
    formula:
      "valid rules && valid state && structural advancement && attributes >= requirement(targetRank)",
    inputs: {
      principleId: { value: describeDiagnosticValue(principleId) },
      targetRank: { value: describeDiagnosticValue(targetRank) },
    },
  });

  const refuse = (
    errors: readonly EngineError[],
  ): EngineResult<NenAdvancementEligibility> => {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  };

  const ruleIssues = findNenProgressionRuleIssues(rules);

  if (ruleIssues.length > 0) return refuse(ruleIssues);

  if (!(NEN_PRINCIPLE_IDS as readonly unknown[]).includes(principleId)) {
    return refuse([{
      code: "nen.principle.unknown",
      message: "Advancement eligibility needs a known Nen principle.",
      audience: "developer",
      required: NEN_PRINCIPLE_IDS.join(" | "),
      actual: describeDiagnosticValue(principleId),
    }]);
  }

  const validState = validateNenState(state, rules);

  traceNode.children.push(validState.trace.root);

  if (!validState.success) return refuse(validState.errors);

  const structural = validateNenAdvancement(state, principleId, targetRank, rules);

  traceNode.children.push(structural.trace.root);

  if (!structural.success) return refuse(structural.errors);

  const judged: { attribute: string; minimum: number; actual: number }[] = [];
  const unmet: EngineError[] = [];

  for (const requirement of getNenAttributeRequirements(principleId, rules)) {
    const minimum = requirement.minimumByRank[targetRank as MasteryRank];
    const actual = attributes?.[requirement.attribute];

    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      unmet.push({
        code: "nen.mastery.attribute.invalid",
        message: `Advancement eligibility needs a finite ${requirement.attribute} score.`,
        audience: "developer",
        required: "finite number",
        actual: describeDiagnosticValue(actual),
      });
      continue;
    }

    if (actual < minimum) {
      unmet.push({
        code: "nen.mastery.attribute_requirement_not_met",
        message: `${principleId} Mastery ${targetRank} requires ${requirement.attribute.toUpperCase()} ${minimum}.`,
        audience: "player",
        required: { attribute: requirement.attribute, minimum },
        actual: { attribute: requirement.attribute, value: actual },
      });
      continue;
    }

    judged.push({ attribute: requirement.attribute, minimum, actual });
  }

  if (unmet.length > 0) return refuse(unmet);

  const payload: NenAdvancementEligibility = {
    ...structural.payload,
    attributeRequirements: judged,
  };

  traceNode.output = {
    principleId: payload.principleId,
    targetRank: payload.targetRank,
    attributeRequirements: judged.length,
  };

  return { success: true, payload, trace: { root: traceNode }, warnings: [] };
}
