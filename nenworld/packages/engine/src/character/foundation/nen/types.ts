/*
 * Shared Nen-domain value shapes.
 *
 * Nen principles use Mastery 0-X:
 *
 *   0     = locked / unlearned
 *   1-10  = Mastery I-X
 *
 * Stored mastery represents permanently learned mastery and is never reduced.
 * Temporary effects may seal a principle to a lower effective mastery without
 * changing the permanently learned rank.
 *
 * Hatsu here refers to Hatsu, the foundational Nen principle of Action.
 * It is distinct from a character's Nen Ability, which will eventually live
 * in its own Nen Ability subsystem.
 */


export type NenMasteryRank =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10;


export type NenPrincipleId =
  | "ten"
  | "ren"
  | "zetsu"
  | "hatsu"
  | "shu"
  | "en"
  | "gyo"
  | "ken"
  | "chu"
  | "in"
  | "ko"
  | "ryu"
  | "yu"
  | "ju"
  | "fu";


/**
 * Permanently learned mastery.
 *
 * These values never decrease through ordinary rules.
 */
export type NenMasteryState = Readonly<
  Record<NenPrincipleId, NenMasteryRank>
>;


/**
 * Temporary mastery caps.
 *
 * Example:
 *
 *   Permanent Gyō Mastery = III
 *   Temporary cap = II
 *
 * The character still permanently knows Gyō III, but currently has access
 * only to Gyō II.
 *
 * Missing entries mean no temporary seal is applied.
 */
export type NenMasterySeals = Readonly<
  Partial<Record<NenPrincipleId, NenMasteryRank>>
>;


/**
 * Complete current Nen state.
 *
 * Awakening eligibility and the process of awakening will be defined later.
 * For now, awakening is represented only as a boolean.
 */
export interface NenState {
  readonly awakened: boolean;

  readonly mastery: NenMasteryState;

  readonly seals?: NenMasterySeals;
}


/**
 * A prerequisite that always applies to a principle.
 *
 * To reach Mastery N in the child principle, this prerequisite must also
 * possess at least Mastery N.
 */
export interface NenPrerequisite {
  readonly principleId: NenPrincipleId;
}


/**
 * A prerequisite that begins applying only from a specific mastery rank.
 *
 * Example:
 *
 * Chū is not required for Ko I-V.
 *
 * From Ko VI onward, Chū becomes a mastery prerequisite and must be at least
 * equal to the desired Ko mastery.
 */
export interface NenConditionalPrerequisite
  extends NenPrerequisite {
  readonly fromRank: NenMasteryRank;
}


/**
 * A prerequisite that applies only in a specific usage context rather than
 * to the principle's general mastery.
 *
 * Example:
 *
 * Shū is relevant when Ko or Ryū is being used through a weapon, but Shū
 * does not prevent the character from learning ordinary unarmed Ko or Ryū.
 */
export interface NenContextualPrerequisite
  extends NenPrerequisite {
  readonly context: "weapon";
}


/**
 * Structural definition of one Nen-principle node.
 *
 * Principle-specific mechanics and advancement requirements do not belong
 * here. Those belong in the individual principle file.
 */
export interface NenPrincipleNode {
  readonly id: NenPrincipleId;

  readonly prerequisites:
    readonly NenPrerequisite[];

  readonly conditionalPrerequisites?:
    readonly NenConditionalPrerequisite[];

  readonly contextualPrerequisites?:
    readonly NenContextualPrerequisite[];
}


/**
 * Result of evaluating a proposed mastery advancement against the universal
 * Nen graph.
 *
 * This does not include principle-specific stat, training, Growth Point,
 * breakthrough, or other requirements.
 */
export interface NenAdvancementEvaluation {
  readonly principleId: NenPrincipleId;

  readonly currentRank: NenMasteryRank;

  readonly targetRank: NenMasteryRank;

  readonly maximumAllowedByGraph: NenMasteryRank;

  readonly allowedByGraph: boolean;
}