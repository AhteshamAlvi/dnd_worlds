/*
 * Universal Nen structure and mastery rules.
 *
 * This file owns:
 *
 * - Nen awakening state validation
 * - the Nen-principle dependency graph
 * - universal mastery ceilings
 * - structural unlock validation
 * - temporary mastery sealing
 * - propagation of temporary mastery reductions through dependent principles
 *
 * This file does NOT own:
 *
 * - principle-specific mechanics
 * - principle-specific stat requirements
 * - Growth Point costs
 * - breakthrough requirements
 * - principle-specific advancement mutations
 * - Nen Ability mechanics
 *
 * Those belong in the relevant principle or Nen Ability files.
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


const NEN_PRINCIPLE_IDS =
  Object.keys(
    NEN_PRINCIPLE_GRAPH,
  ) as NenPrincipleId[];


/**
 * Runtime validation for mastery values.
 */
export function isNenMasteryRank(
  value: number,
): value is NenMasteryRank {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10
  );
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
  if (!state.awakened) {
    return 0;
  }


  const node =
    NEN_PRINCIPLE_GRAPH[principleId];


  if (
    node.prerequisites.length === 0 &&
    (
      node.conditionalPrerequisites === undefined ||
      node.conditionalPrerequisites.length === 0
    )
  ) {
    return 10;
  }


  let maximum: NenMasteryRank = 0;


  for (
    let rank = 1;
    rank <= 10;
    rank += 1
  ) {
    const targetRank =
      rank as NenMasteryRank;


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
  if (!state.awakened) {
    return 0;
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
      return 0;
    }


    visiting.add(currentId);


    const localMaximum =
      getLocalEffectiveMasteryRank(
        state,
        currentId,
      );


    if (localMaximum === 0) {
      visiting.delete(currentId);

      memo.set(
        currentId,
        0,
      );

      return 0;
    }


    let effective: NenMasteryRank = 0;


    for (
      let rank = 1;
      rank <= localMaximum;
      rank += 1
    ) {
      const targetRank =
        rank as NenMasteryRank;


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
  if (!state.awakened) {
    return false;
  }


  return (
    deriveMaximumNenMastery(
      state,
      principleId,
    ) >= 1
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
      "targetRank <= maximumAllowedByGraph",

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


  if (!state.awakened) {
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
            "Nen mastery cannot be advanced before Nen is awakened.",
          audience: "player",
          required: "awakened Nen",
          actual: "Nen not awakened",
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
            "Nen mastery rank must be an integer from 0 through 10.",
          audience: "developer",
          required: "integer from 0 through 10",
          actual: targetRank,
        },
      ],
    };
  }


  if (
    targetRank !== currentRank + 1
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
            "Nen mastery must advance exactly one rank at a time.",
          audience: "player",
          required: currentRank + 1,
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


  // Spelled out rather than assigning the payload directly: an interface has
  // no index signature, so it is not assignable to JsonValue even when every
  // field in it is JSON-safe.
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
      awakened: {
        value: state.awakened,
      },
    },
  });


  const errors: EngineError[] = [];


  for (
    const principleId
    of NEN_PRINCIPLE_IDS
  ) {
    const mastery =
      state.mastery[principleId];


    if (!isNenMasteryRank(mastery)) {
      errors.push({
        code: "nen.mastery.rank.invalid",
        message:
          `${principleId} mastery must be an integer from 0 through 10.`,
        audience: "developer" as const,
        required: "integer from 0 through 10",
        actual: mastery,
      });

      continue;
    }


    const seal =
      state.seals?.[principleId];


    if (
      seal !== undefined &&
      !isNenMasteryRank(seal)
    ) {
      errors.push({
        code: "nen.mastery.seal.invalid",
        message:
          `${principleId} temporary mastery cap must be an integer from 0 through 10.`,
        audience: "developer" as const,
        required: "integer from 0 through 10",
        actual: seal,
      });
    }
  }


  if (
    !state.awakened &&
    NEN_PRINCIPLE_IDS.some(
      principleId =>
        state.mastery[principleId] > 0,
    )
  ) {
    errors.push({
      code: "nen.mastery.before_awakening",
      message:
        "A character cannot possess controlled Nen mastery before Nen is awakened.",
      audience: "developer" as const,
      required:
        "all mastery ranks equal 0 while Nen is unawakened",
      // Copied rather than passed through: a readonly record is not a
      // JsonObject, and a diagnostic has to be serialisable.
      actual: { ...state.mastery },
    });
  }


  if (state.awakened) {
    for (
      const principleId
      of NEN_PRINCIPLE_IDS
    ) {
      const mastery =
        state.mastery[principleId];


      if (mastery === 0) {
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

      // The length check is the guarantee; the type system cannot carry it
      // across the branch. Same cast the other validators make.
      errors: errors as NonEmptyArray<EngineError>,
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