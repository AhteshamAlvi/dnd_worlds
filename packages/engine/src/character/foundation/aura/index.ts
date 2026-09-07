/*
 * The Aura subsystem's public surface.
 *
 * One barrel rather than two dozen hand-maintained export blocks in the
 * package root, for the reason the Body barrel exists: the root list had
 * already fallen behind its domain once, and a re-export cannot drift that way.
 *
 * The domain splits three ways, and the split is worth keeping in mind while
 * reading anything below:
 *
 *   STORED       Current Aura and the character's active allocations. The only
 *                two Aura facts a sheet writes down, because they are the only
 *                two that cannot be recomputed.        state.ts
 *
 *   RESOLVED     Everything else — pool, the three Output figures,
 *                regeneration, Control, access, placement and density — all
 *                derived from Attributes, Body and access state, and produced
 *                by ONE resolver.                      resolution.ts
 *
 *   TRANSITIONS  The pure operations that produce a new stored state:
 *                expenditure, drain, allocation and reconciliation.
 *                                                      transitions.ts
 */

/* ── Stored state ───────────────────────────────────────────────────────── */

export type {
  AuraAllocation,
  CharacterAuraState,
  LocalizedAuraAllocation,
  WholeBodyAuraAllocation,
} from "./state";

export {
  allocationsForPlacement,
  allocationsWithCoverage,
  emptyAuraState,
  isLocalizedAllocation,
  isWholeBodyAllocation,
  totalAllocatedAura,
} from "./state";


/* ── Value shapes ───────────────────────────────────────────────────────── */

export type {
  AggregatedInternalAura,
  AggregatedSurfaceAura,
  AuraAccessInput,
  AuraAccessOverride,
  AuraAccessState,
  AuraAllocationChange,
  AuraAllocationSource,
  AuraBalance,
  AuraControl,
  AuraCoverage,
  AuraDensity,
  AuraExplicitAccessOverride,
  AuraExpenditure,
  AuraInternalAccessOverride,
  AuraNodeState,
  AuraOutput,
  AuraOutputAccessOverride,
  AuraOutputLimit,
  AuraPlacement,
  AuraPool,
  AuraRegenerationCapacity,
  AuraSuppressedAccessOverride,
  AutomaticSurfaceCoating,
  DroppedAuraAllocation,
  DroppedAuraAllocationReason,
  InternalAuraDensity,
  PassiveInternalReinforcement,
  ResolvedAuraAccess,
  ResolvedAuraAllocation,
  ResolvedAuraDistribution,
  ResolvedAuraProfile,
  ResolvedBodyPartAura,
  ResolvedInternalAuraAllocation,
  ResolvedPassiveInternalAura,
  ResolvedSurfaceAuraAllocation,
  SurfaceAuraDensity,
} from "./types";

export {
  AURA_ACCESS_STATES,
  AURA_ALLOCATION_SOURCES,
  AURA_COVERAGES,
  AURA_NODE_STATES,
  AURA_PLACEMENTS,
  SQUARE_CENTIMETRES_PER_SQUARE_METRE,
  emptyAuraBalance,
} from "./types";


/* ── The central resolver ───────────────────────────────────────────────── */

export type { ResolveAuraProfileInput } from "./resolution";

export { resolveAuraProfile } from "./resolution";


/*
 * The budget both the resolver and the transitions are judged against, and the
 * reconciliation both of them run. One module, so the two can never disagree
 * about what a character may currently place.
 */
export type {
  AuraBudget,
  AuraTransitionContext,
  ReconciledAuraAllocations,
} from "./budget";

export {
  auraAdjustments,
  BASELINE_TEN_ALLOCATION_ID,
  proportionallyReduce,
  reconcileAuraAllocations,
  resolveAuraBudget,
} from "./budget";


/* ── Access ─────────────────────────────────────────────────────────────── */

export {
  deliberateAccessError,
  findAuraPlacementIssues,
  hasDeliberateAuraAccess,
  PSEUDO_CHU_EFFICIENCY,
  resolveAuraAccess,
  TEN_SURFACE_COATING_OUTPUT_FRACTION,
} from "./access";


/* ── Pool, Output, Control, regeneration ────────────────────────────────── */

export {
  createAuraPool,
  deriveAuraDepletionFraction,
  deriveMaximumAura,
  deriveRawMaximumAura,
  validateAuraPool,
} from "./pool";

export { deriveAuraOutput, deriveAuraOutputLimit } from "./output";

/*
 * Control affects deliberate expenditure COST and nothing else. It does not
 * decide whether an expenditure is permitted — access and the application's
 * own requirements do — which is why there is no availability flag here.
 */
export {
  applyAuraControl,
  CONTROL_DEX_FLOOR,
  CONTROL_DEX_PIVOT,
  deriveAuraControl,
  deriveAuraControlMultiplier,
  deriveAuraExpenditure,
  deriveRawAuraControlMultiplier,
  MORTAL_CONTROL_EXPONENT,
  roundAuraControlMultiplier,
  SUPERHUMAN_CONTROL_EXPONENT,
} from "./control";

/*
 * Recovery requires an explicit context. The unrestricted replenishAura is
 * gone: it restored Aura at the full VIT rate for any hours anybody passed it,
 * which made an ordinary waking day a full heal and rest meaningless.
 */
export type {
  AuraRecoveryContext,
  AuraRecoveryContribution,
  AuraRecoveryMode,
  AuraRecoveryResult,
  AuraRecoverySource,
  AuraSuppression,
} from "./recovery";

export {
  AURA_RECOVERY_MODES,
  AURA_RECOVERY_MODE_MULTIPLIERS,
  AURA_RECOVERY_SOURCES,
  deriveAuraRegeneration,
  deriveAuraRegenerationCapacity,
  deriveRawAuraRegeneration,
  recoverAura,
  resolveAuraRecoveryMultiplier,
} from "./recovery";


/* ── Placement and density ──────────────────────────────────────────────── */

export {
  resolveInternalAuraDensity,
  resolveSurfaceAuraDensity,
} from "./density";

export type {
  AutomaticAuraAllocation,
  ResolveAuraDistributionInput,
  ResolveAuraDistributionResult,
} from "./distribution";

export { resolveAuraDistribution } from "./distribution";

export type { ResolvePassiveInternalAuraInput } from "./passive";

export {
  PSEUDO_CHU_ALLOCATION_ID,
  resolvePassiveInternalAura,
} from "./passive";


/* ── Expenditure ────────────────────────────────────────────────────────── */

/*
 * Physical effort and deliberate projection, with two different efficiency
 * terms that never mix: Stamina scales the first, Control the second.
 */
export type {
  AuraActionCost,
  AuraActionCostRequest,
  PhysicalAuraCost,
} from "./expenditure";

export {
  PHYSICAL_AURA_COST_COEFFICIENT,
  derivePhysicalAuraCost,
  deriveSustainedActivityAuraCost,
  deriveSustainedPhysicalAuraCost,
  resolveActionAuraCostFor,
  resolveAuraActionCost,
} from "./expenditure";


/* ── Upkeep ─────────────────────────────────────────────────────────────── */

export type {
  AuraUpkeepCharge,
  AuraUpkeepCommitment,
  AuraUpkeepPayment,
  AuraUpkeepPeriod,
  AuraUpkeepShutdown,
} from "./upkeep";

export type { AuraUpkeepShutdownReason } from "./upkeep";

export {
  AURA_UPKEEP_PERIODS,
  AURA_UPKEEP_SHUTDOWN_REASONS,
  auraUpkeepSheddingOrder,
  deriveAuraUpkeep,
  findAuraUpkeepIssues,
  isUpkeepActiveAt,
  payAuraUpkeep,
  upkeepRatePerHour,
} from "./upkeep";


/* ── Uncontained leakage ────────────────────────────────────────────────── */

export type {
  AuraCollapse,
  AuraCollapseReason,
  AuraCollapseRequest,
  UncontainedLeakage,
  UncontainedLeakageResult,
} from "./leakage";

export {
  AURA_COLLAPSE_REASONS,
  AURA_COLLAPSE_REQUESTS,
  UNCONTAINED_COLLAPSE_REQUESTS,
  deriveUncontainedLeakage,
  resolveUncontainedLeakage,
  uncontainedCollapse,
} from "./leakage";


/* ── The timeline ───────────────────────────────────────────────────────── */

/*
 * What a caller says happened during an interval, and the one validator that
 * judges all of it before the solver calculates anything.
 *
 * An interval OWNS `[startedAt, endedAt)`. Caller-supplied events and activity
 * changes belong to it only inside that range; an event on the endpoint
 * belongs to the next interval beginning there, or chained advancement would
 * apply it twice. Solver outcomes are different and may land on the endpoint,
 * because they are consequences of the interval rather than inputs to it.
 */
export type {
  AuraActivityChange,
  AuraActivityWindow,
  AuraEventInstant,
  AuraTimeActivity,
  AuraTimelineInput,
  ResolvedAuraTimeline,
  ScheduledAuraEvent,
  ScheduledAuraEventKind,
} from "./timeline";

export {
  SCHEDULED_AURA_EVENT_KINDS,
  resolveAuraTimeline,
} from "./timeline";


/* ── Time ───────────────────────────────────────────────────────────────── */

/*
 * The one function that composes every Aura contribution. Also returns the new
 * wakefulness and Fatigue, because the same interval decides all three and
 * three functions taking the same hours would be three chances to disagree.
 */
export type {
  AdvanceAuraTimeInput,
  AuraRecoverySummary,
  AuraTimelineEvent,
  AuraTimelineEventKind,
  AuraTimeSegment,
  AuraTimeTransition,
} from "./time";

export { AURA_TIMELINE_EVENT_KINDS, advanceAuraTime } from "./time";


/* ── State transitions ──────────────────────────────────────────────────── */

export type { AuraStateTransition } from "./transitions";

/* Aura's runtime-protocol surface: how a domain that is not Aura asks Aura to
 * pay for something. See runtime/ for the protocol itself. */
export {
  AURA_ACTION_COST,
  auraCostRequest,
  createAuraCostHandler,
} from "./runtime";
export type {
  AuraCostHandler,
  AuraCostRequest,
  AuraSpentEvent,
} from "./runtime";

export {
  clearAuraAllocations,
  drainAura,
  reconcileAuraState,
  removeAuraAllocation,
  replaceAuraAllocations,
  settleAuraTransition,
  spendActionAura,
  spendAura,
  spendPhysicalAura,
  upsertAuraAllocation,
} from "./transitions";


/* ── Stored-state validation ────────────────────────────────────────────── */

/*
 * Structural validation of the SHEET only. Whether allocations fit inside
 * accessible Output depends on runtime access, so that ceiling belongs to the
 * resolver and the transitions, not here.
 */
export type {
  AuraAllocationIssue,
  AuraAllocationIssueCode,
} from "./validation";

export {
  auraAllocationIssueToEngineError,
  findAuraAllocationIssues,
  validateAuraState,
} from "./validation";
