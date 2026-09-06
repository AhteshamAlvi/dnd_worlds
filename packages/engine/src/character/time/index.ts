/*
 * Character time — the coordinator layer between the clock and a character.
 *
 * Time owns world time. Aura owns the reserve. Body owns wakefulness and
 * Fatigue. None of them may reach for the others, and one interval has to
 * reach all three at once — so this folder holds them together, and holds the
 * one fact that makes it safe: when each character's stored state was last
 * brought up to date.
 */

export type {
  AdvanceCharacterTimeInput,
  CharacterActiveEffects,
  CharacterProjection,
  CharacterTemporalState,
  CharacterTimeActivity,
  CharacterTimeTransition,
  ProjectCharacterAtTimeInput,
} from "./types";

export { characterTemporalState } from "./types";

export { advanceCharacterTime } from "./advance";
export { projectCharacterAtTime } from "./projection";
