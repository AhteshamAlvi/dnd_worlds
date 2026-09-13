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
 * - the Nen-principle dependency graph
 * - structural Nen mastery ceilings
 * - structural unlock validation
 * - temporary mastery sealing
 * - propagation of temporary mastery reductions through dependent principles
 *
 * This file does NOT own:
 *
 * - the generic Mastery rank vocabulary
 * - principle-specific mechanics
 * - principle-specific stat requirements
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
 */


import type { EngineError } from "../../../infrastructure/diagnostics";
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

import type { NenTypeKnowledge } from "./nen-type";
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
  NenMasteryRank,
  NenPrincipleId,
  NenPrincipleNode,
  NenState,
} from "./types";


/**
 * Authoritative Nen-principle dependency graph.
 *
 * Universal rule:
 *
 *   To possess Mastery N in a child principle, every prerequisite that
 *   applies at Mastery N must possess at least Mastery N.
 *
 * Therefore, under normal circumstances:
 *
 *   Child Mastery <= lowest applicable prerequisite mastery.
 *
 *
 * Special cases:
 *
 * Ko:
 *   - Ten, Ren, Zetsu, and Gyō are normal prerequisites.
 *   - Chū becomes mandatory only from Mastery VI onward.
 *   - Shū is contextual and applies only when Ko is used through a weapon.
 *
 * Ryū:
 *   - Gyō and Ken are normal prerequisites.
 *   - Chū becomes mandatory only from Mastery VI onward.
 *   - Shū is contextual and applies only when Ryū is used through a weapon.
 */
export const NEN_PRINCIPLE_GRAPH:
  Readonly<Record<NenPrincipleId, NenPrincipleNode>> = {

  ten: {
    id: "ten",

    prerequisites: [],
  },


  ren: {
    id: "ren",

    prerequisites: [
      {
        principleId: "ten",
      },
    ],
  },


  zetsu: {
    id: "zetsu",

    prerequisites: [
      {
        principleId: "ren",
      },
    ],
  },


  hatsu: {
    id: "hatsu",

    prerequisites: [
      {
        principleId: "zetsu",
      },
    ],
  },


  shu: {
    id: "shu",

    prerequisites: [
      {
        principleId: "ten",
      },
    ],
  },


  en: {
    id: "en",

    prerequisites: [
      {
        principleId: "ten",
      },

      {
        principleId: "ren",
      },
    ],
  },


  gyo: {
    id: "gyo",

    prerequisites: [
      {
        principleId: "ren",
      },
    ],
  },


  ken: {
    id: "ken",

    prerequisites: [
      {
        principleId: "ten",
      },

      {
        principleId: "ren",
      },
    ],
  },


  chu: {
    id: "chu",

    prerequisites: [
      {
        principleId: "ten",
      },

      {
        principleId: "ren",
      },

      {
        principleId: "zetsu",
      },
    ],
  },


  in: {
    id: "in",

    prerequisites: [
      {
        principleId: "zetsu",
      },
    ],
  },


  ko: {
    id: "ko",

    prerequisites: [
      {
        principleId: "ten",
      },

      {
        principleId: "ren",
      },

      {
        principleId: "zetsu",
      },

      {
        principleId: "gyo",
      },
    ],

    conditionalPrerequisites: [
      {
        principleId: "chu",
        fromRank: 6,
      },
    ],

    contextualPrerequisites: [
      {
        principleId: "shu",
        context: "weapon",
      },
    ],
  },


  ryu: {
    id: "ryu",

    prerequisites: [
      {
        principleId: "gyo",
      },

      {
        principleId: "ken",
      },
    ],

    conditionalPrerequisites: [
      {
        principleId: "chu",
        fromRank: 6,
      },
    ],

    contextualPrerequisites: [
      {
        principleId: "shu",
        context: "weapon",
      },
    ],
  },


  yu: {
    id: "yu",

    prerequisites: [
      {
        principleId: "gyo",
      },

      {
        principleId: "ren",
      },

      {
        principleId: "chu",
      },

      {
        principleId: "hatsu",
      },
    ],
  },


  ju: {
    id: "ju",

    prerequisites: [
      {
        principleId: "ken",
      },

      {
        principleId: "chu",
      },

      {
        principleId: "hatsu",
      },
    ],
  },


  fu: {
    id: "fu",

    prerequisites: [
      {
        principleId: "en",
      },

      {
        principleId: "hatsu",
      },
    ],
  },
};


export const NEN_PRINCIPLE_IDS =
  Object.keys(
    NEN_PRINCIPLE_GRAPH,
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
 * Note what it does NOT say: nothing about Aura. An unawakened character still
 * has a pool and still loses Current Aura. See foundation/aura/state.ts.
 */
export function createUnawakenedNenState(
  nenType: NenTypeKnowledge,
): NenState {
  const mastery = {} as Record<NenPrincipleId, NenMasteryRank>;

  for (const principleId of NEN_PRINCIPLE_IDS) {
    mastery[principleId] = NO_MASTERY;
  }

  return { awakening: createUnawakenedAwakeningState(nenType), mastery };
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
 * Return every structural prerequisite that applies when attempting to reach
 * a particular mastery rank.
 *
 * Contextual prerequisites such as weapon-use Shū are deliberately excluded.
 */
export function getNenPrerequisitesForRank(
  principleId: NenPrincipleId,
  targetRank: NenMasteryRank,
): readonly NenPrincipleId[] {
  const node =
    NEN_PRINCIPLE_GRAPH[principleId];


  const prerequisites =
    node.prerequisites.map(
      prerequisite =>
        prerequisite.principleId,
    );


  const conditional =
    (
      node.conditionalPrerequisites ?? []
    )
      .filter(
        prerequisite =>
          targetRank >= prerequisite.fromRank,
      )
      .map(
        prerequisite =>
          prerequisite.principleId,
      );


  return [
    ...prerequisites,
    ...conditional,
  ];
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
) {
  return (
    NEN_PRINCIPLE_GRAPH[
      principleId
    ].contextualPrerequisites ?? []
  );
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


  const node =
    NEN_PRINCIPLE_GRAPH[principleId];


  /*
   * A principle with no structural prerequisites may advance through the
   * entire generic Mastery range.
   */
  if (
    node.prerequisites.length === 0 &&
    (
      node.conditionalPrerequisites === undefined ||
      node.conditionalPrerequisites.length === 0
    )
  ) {
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
      getNenPrerequisitesForRank(
        principleId,
        targetRank,
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
 * Seals propagate through the Nen graph.
 *
 * Example:
 *
 *   Ten permanent = V
 *   Ren permanent = V
 *
 * If Ten is temporarily sealed to III, Ren cannot currently function above
 * III even though the character permanently retains Ren V.
 *
 * Contextual prerequisites are not included.
 */
export function deriveEffectiveNenMastery(
  state: NenState,
  principleId: NenPrincipleId,
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
     * The authored Nen graph must remain acyclic.
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
        getNenPrerequisitesForRank(
          currentId,
          targetRank,
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
 * universal Nen graph.
 *
 * Principle-specific advancement requirements are not checked here.
 */
export function isNenPrincipleUnlocked(
  state: NenState,
  principleId: NenPrincipleId,
): boolean {
  /* Learning needs open nodes now, not a memory of having had them. */
  if (!isNenAwakened(state)) {
    return false;
  }


  return (
    deriveMaximumNenMastery(
      state,
      principleId,
    ) > NO_MASTERY
  );
}


/**
 * Validate a single one-rank advancement against the universal Nen graph.
 *
 * This performs STRUCTURAL validation only.
 *
 * The individual principle file must separately validate its own:
 *
 * - attribute requirements
 * - training requirements
 * - Growth Point costs
 * - breakthrough conditions
 * - principle-specific restrictions
 */
export function validateNenAdvancement(
  state: NenState,
  principleId: NenPrincipleId,
  targetRank: NenMasteryRank,
): EngineResult<NenAdvancementEvaluation> {
  const currentRank =
    state.mastery[principleId];


  const maximumAllowedByGraph =
    deriveMaximumNenMastery(
      state,
      principleId,
    );


  const traceNode = createTraceNode({
    id: "nen.mastery.validate-advancement",
    label: "Validate Nen mastery advancement",

    formula:
      "targetRank = nextMasteryRank(currentRank) && targetRank <= maximumAllowedByGraph",

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


  if (
    targetRank >
    maximumAllowedByGraph
  ) {
    const prerequisites =
      getNenPrerequisitesForRank(
        principleId,
        targetRank,
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
            "Nen mastery cannot exceed the mastery of its required prerequisite principles.",
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
): EngineResult<NenState> {
  const traceNode = createTraceNode({
    id: "nen.state.validate",
    label: "Validate Nen state",

    formula:
      "stored mastery must satisfy awakening and Nen graph prerequisites",

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
  const awakeningIssues = findAwakeningStateIssues(state.awakening);

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
        );


      if (mastery > maximum) {
        errors.push({
          code:
            "nen.mastery.graph.invalid",
          message:
            `${principleId} mastery exceeds the mastery permitted by its prerequisite principles.`,
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