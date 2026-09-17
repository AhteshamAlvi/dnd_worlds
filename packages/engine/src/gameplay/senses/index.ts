/*
 * Sensory composition for play.
 *
 * `gameplay/aura` joins a Character's Aura to a Target and a Spatial area;
 * this joins a Character's senses to Combat's Reaction queue. Both exist
 * because the domains they compose are forbidden from importing each other
 * directly, and both keep the composition in one named place rather than
 * letting it leak into either side.
 */

export type {
  ReactionGateBinding,
  ReactionGatePreparation,
  ReactionGateSettlement,
  PrepareReactionGateInput,
  SettleReactionGateInput,
} from "./reaction-gate";

export { prepareReactionGate, settleReactionGate } from "./reaction-gate";
