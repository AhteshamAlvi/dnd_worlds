/*
 * Nen composition: where the principles meet everything they are not allowed
 * to import.
 *
 * Character owns what a principle IS. Equipment owns what an Item is. Combat
 * owns the Action economy. Senses own what a check is. None of the four may
 * reach into another, and Character in particular may never reach up into
 * `gameplay/` — so the module that joins all of them sits above all of them,
 * which is the same shape as `gameplay/aura` composing Aura with targeting and
 * spatial, and `gameplay/combat` composing neutral actions with targeting.
 *
 * Four compositions live here, and each of them is a question no single domain
 * could answer:
 *
 *   actions   does the actor have the Action this principle change costs, and
 *             are they allowed to spend it right now — settled with the
 *             transition, both or neither
 *   coating   one boundary over body and Items at one density, and where the
 *             Gyō shift lands on it
 *   items     what each Item's contact path transmits, and what that does to
 *             the Item — once
 *   senses    the single modifier Sensory Gyō contributes to one concrete check
 *
 * NOTHING BELOW THIS DIRECTORY IMPORTS IT. That is the direction the whole
 * arrangement depends on, and an architecture test holds it.
 */

export {
  settlePrincipleTransition,
} from "./actions";

export type {
  PrincipleTransitionCombatContext,
  PrincipleTransitionRequest,
  PrincipleTransitionSettlement,
} from "./actions";

export {
  COATING_POINT_SITE_PREFIX,
  coatingAt,
  protectiveAuraOn,
  protectiveCoatingFor,
  resolveCoatingBoundary,
  sensoryAuraOn,
} from "./coating";

export type {
  CoatingBoundaryRequest,
  CoatingFocus,
  CoatingItem,
  CoatingSite,
  ReinforcementCoatingFocus,
  ResolvedCoatingBoundary,
  SensoryCoatingFocus,
} from "./coating";

export {
  enhanceShuItems,
  recomputeShuAfterLoss,
  resolveShuComposition,
  shuIntegrityMitigation,
} from "./items";

export type {
  ResolvedShuComposition,
  ShuBoundaryItem,
  ShuCompositionRequest,
  ShuItemEnhancement,
  ShuLossOutcome,
  ShuLossRequest,
  ShuSelectedItem,
} from "./items";

export {
  SENSORY_GYO_CHECK_KINDS,
  resolveSensoryGyoContribution,
  sensoryGyoFocusGroups,
  withSensoryGyoModifier,
} from "./senses";

export type {
  SensoryGyoCheck,
  SensoryGyoCheckKind,
  SensoryGyoProjection,
  SensoryGyoProjectionRequest,
} from "./senses";
