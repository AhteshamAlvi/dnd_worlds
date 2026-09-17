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


import type { MasteryRank, MasteryValue } from "../../capabilities/mastery";
import type { AttributeKey } from "../attributes/types";

import type { NenAwakeningState } from "./awakening/types";


/**
 * A Nen principle's Mastery, 0-X.
 *
 * The same rank vocabulary every other capability uses: an alias rather than
 * a parallel set of numbers, so a Ten rank and a Swordsmanship rank compare
 * without conversion and a requirement written against one works against the
 * other. capabilities/mastery.ts owns the range and the Roman numerals.
 *
 * What differs about Nen principles is what a rank *does*, not what a rank
 * *is* — and that lives in the principle implementations.
 */
export type NenMasteryRank = MasteryValue;


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
 * Stored Nen state: awakening, mastery, and temporary mastery seals.
 *
 * That is the whole of it, and the name deliberately no longer promises more.
 * There is NO active-principle state here — nothing records that Ten is up,
 * that Ren is running at some output, or that the character is in Zetsu.
 *
 * Those are runtime application state, and they arrive with the Nen
 * integration and transition contracts, which have to answer questions this
 * shape cannot: what it costs per unit time to hold a principle, what happens
 * when two are incompatible, and what a transition between them takes. A
 * boolean per principle invented ahead of those answers would be the wrong
 * shape and would have to be migrated out again — active Ren is an output
 * level, not an on/off flag.
 *
 * `awakening` WAS a boolean, and the boolean was wrong in the way a single
 * field carrying several facts is always wrong. It could not say that a
 * reverted character keeps the Mastery they trained, that a fresh awakener has
 * open nodes and no Ten, or that a forced Zetsu is not Zetsu — and the
 * validator that read it refused a reverted character outright. See
 * awakening/types.ts for the seven facts it now separates.
 *
 * Read it through the helpers rather than by comparing the condition against a
 * literal: isNenAwakened for "can use Nen now", hasEverAwakenedNen for "may
 * legitimately hold Mastery".
 */
export interface NenState {
  readonly awakening: NenAwakeningState;

  readonly mastery: NenMasteryState;

  readonly seals?: NenMasterySeals;
}


/*
 * NEN PROGRESSION: THREE DIFFERENT KINDS OF DEPENDENCY
 *
 * A single "prerequisite" used to mean all of these at once, and every edge was
 * therefore a continuing rank cap. That was wrong for the Four Major
 * Principles, whose order is a learning sequence rather than a ceiling, so the
 * kinds are now separate types with separate consumers:
 *
 *   unlock      gates learning Mastery I, and nothing after it
 *   mastery     caps effective and permanent mastery, continuously
 *   attribute   gates learning or advancing a rank; never a runtime debuff
 *
 * Contextual prerequisites are a fourth, usage-only kind and affect neither
 * learning nor mastery.
 */


/**
 * A principle whose mastery continuously caps this one.
 *
 * To hold Mastery N here, the prerequisite must hold at least Mastery N — at
 * every rank, or only from `fromRank` onward when that is stated. Several
 * mastery prerequisites cap at their minimum.
 *
 * Example: Chū caps Kō only from Kō VI; below that it plays no part.
 */
export interface NenMasteryPrerequisite {
  readonly principleId: NenPrincipleId;

  /** The first rank this cap applies to. Absent means every rank. */
  readonly fromRank?: NenMasteryRank;
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
export interface NenContextualPrerequisite {
  readonly principleId: NenPrincipleId;
  readonly context: "weapon";
}


/**
 * An attribute threshold for LEARNING or ADVANCING a rank.
 *
 * Judged when a rank is acquired, never re-applied to mastery the character
 * already holds: a later drop in the attribute does not seal anything.
 */
export interface NenAttributeRequirement {
  readonly attribute: AttributeKey;

  /** The minimum attribute value for each Mastery rank I-X. */
  readonly minimumByRank: Readonly<Record<MasteryRank, number>>;
}


/**
 * How one principle is learned, advanced and capped.
 *
 * Principle-specific mechanics do not belong here; those belong in the
 * individual principle file.
 */
export interface NenProgressionRules {
  /** Principles that must be learned (Mastery I+) before Mastery I here. */
  readonly unlockPrerequisites?: readonly NenPrincipleId[];

  /** Principles whose effective mastery continuously caps this one. */
  readonly masteryPrerequisites?: readonly NenMasteryPrerequisite[];

  /** Usage-context prerequisites. Affect neither learning nor mastery. */
  readonly contextualPrerequisites?: readonly NenContextualPrerequisite[];

  /** Attribute thresholds judged when a rank is learned or advanced. */
  readonly attributeRequirements?: readonly NenAttributeRequirement[];
}


/**
 * Result of evaluating a proposed mastery advancement against the universal
 * Nen progression rules: unlock and mastery prerequisites.
 *
 * This does not include attribute, training, Growth Point, breakthrough, or
 * other requirements.
 */
export interface NenAdvancementEvaluation {
  readonly principleId: NenPrincipleId;

  readonly currentRank: NenMasteryRank;

  readonly targetRank: NenMasteryRank;

  readonly maximumAllowedByGraph: NenMasteryRank;

  readonly allowedByGraph: boolean;

  /** Unlock prerequisites judged for this step; empty unless learning Mastery I. */
  readonly unlockPrerequisites: readonly NenPrincipleId[];
}