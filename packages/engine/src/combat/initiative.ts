/*
 * Initiative resolution and rotation for Combat.
 *
 * Initiative determines the order in which combatants are offered Turn
 * states during a Round.
 *
 * Initiative is rerolled from scratch at the beginning of every Round.
 * No Initiative ordering persists between Rounds.
 *
 * The engine itself does not generate randomness. A host such as the
 * Workbench or Foundry module should automatically generate the underlying
 * Initiative rolls and supply the resulting values here.
 *
 * This module does NOT currently determine:
 *
 * - which Attribute or Derived Attribute Initiative uses
 * - the Initiative roll formula
 * - Initiative modifiers
 * - how Initiative ties are broken
 *
 * Those rules have not yet been established.
 *
 * Equal Initiative values are therefore surfaced as unresolved ties rather
 * than being silently ordered through array position or another arbitrary
 * fallback.
 */

import type {
  CombatantId,
  CombatantRoundState,
  InitiativeEntry,
  InitiativeOrder,
} from "./types";


// ---------------------------------------------------------------------------
// Initiative issues
// ---------------------------------------------------------------------------

export const INITIATIVE_ISSUE_CODES = [
  "combatants-empty",
  "combatant-id-duplicate",
  "entry-combatant-duplicate",
  "entry-combatant-unknown",
  "entry-combatant-missing",
  "entry-value-invalid",
  "initiative-tie",
] as const;

export type InitiativeIssueCode =
  typeof INITIATIVE_ISSUE_CODES[number];


export interface InitiativeIssue {
  readonly code: InitiativeIssueCode;

  readonly combatantIds: readonly CombatantId[];

  readonly message: string;
}


// ---------------------------------------------------------------------------
// Initiative resolution
// ---------------------------------------------------------------------------

export interface InitiativeResolutionSuccess {
  readonly success: true;

  readonly order: InitiativeOrder;
}


export interface InitiativeResolutionFailure {
  readonly success: false;

  readonly issues: readonly InitiativeIssue[];
}


export type InitiativeResolution =
  | InitiativeResolutionSuccess
  | InitiativeResolutionFailure;


// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

function countIds(
  ids: readonly CombatantId[],
): ReadonlyMap<CombatantId, number> {
  const counts = new Map<CombatantId, number>();

  for (const id of ids) {
    counts.set(
      id,
      (counts.get(id) ?? 0) + 1,
    );
  }

  return counts;
}


function findDuplicateIds(
  ids: readonly CombatantId[],
): readonly CombatantId[] {
  return Array.from(countIds(ids).entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
}


function findCombatantRoundState(
  combatants: readonly CombatantRoundState[],
  combatantId: CombatantId,
): CombatantRoundState | undefined {
  return combatants.find(
    (combatant) =>
      combatant.combatantId === combatantId,
  );
}


// ---------------------------------------------------------------------------
// Initiative entry validation
// ---------------------------------------------------------------------------

/*
 * Finds structural problems with a set of Initiative entries.
 *
 * A valid Round must have exactly one Initiative entry for every
 * participating combatant.
 */
export function findInitiativeEntryIssues(
  combatantIds: readonly CombatantId[],
  entries: readonly InitiativeEntry[],
): readonly InitiativeIssue[] {
  const issues: InitiativeIssue[] = [];

  if (combatantIds.length === 0) {
    issues.push({
      code: "combatants-empty",
      combatantIds: [],
      message:
        "Initiative cannot be resolved without at least one combatant.",
    });

    return issues;
  }

  const duplicateCombatantIds =
    findDuplicateIds(combatantIds);

  if (duplicateCombatantIds.length > 0) {
    issues.push({
      code: "combatant-id-duplicate",
      combatantIds: duplicateCombatantIds,
      message:
        "Combat contains duplicate combatant ids.",
    });
  }

  const entryIds = entries.map(
    (entry) => entry.combatantId,
  );

  const duplicateEntryIds =
    findDuplicateIds(entryIds);

  if (duplicateEntryIds.length > 0) {
    issues.push({
      code: "entry-combatant-duplicate",
      combatantIds: duplicateEntryIds,
      message:
        "A combatant may have only one Initiative entry in a Round.",
    });
  }

  const knownCombatantIds =
    new Set(combatantIds);

  const unknownEntryIds =
    Array.from(new Set(
      entryIds.filter(
        (id) => !knownCombatantIds.has(id),
      ),
    ));

  if (unknownEntryIds.length > 0) {
    issues.push({
      code: "entry-combatant-unknown",
      combatantIds: unknownEntryIds,
      message:
        "Initiative contains entries for combatants who are not participating in Combat.",
    });
  }

  const entryIdSet =
    new Set(entryIds);

  const missingCombatantIds =
    combatantIds.filter(
      (id) => !entryIdSet.has(id),
    );

  if (missingCombatantIds.length > 0) {
    issues.push({
      code: "entry-combatant-missing",
      combatantIds: missingCombatantIds,
      message:
        "Every participating combatant must receive an Initiative result for the Round.",
    });
  }

  const invalidValueIds =
    entries
      .filter(
        (entry) =>
          !Number.isFinite(entry.value),
      )
      .map(
        (entry) => entry.combatantId,
      );

  if (invalidValueIds.length > 0) {
    issues.push({
      code: "entry-value-invalid",
      combatantIds: invalidValueIds,
      message:
        "Initiative values must be finite numbers.",
    });
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Tie detection
// ---------------------------------------------------------------------------

/*
 * Returns groups of combatants sharing the same Initiative value.
 *
 * Only groups containing at least two combatants are returned.
 */
export function findInitiativeTies(
  entries: readonly InitiativeEntry[],
): readonly (readonly InitiativeEntry[])[] {
  const byValue =
    new Map<number, InitiativeEntry[]>();

  for (const entry of entries) {
    const existing =
      byValue.get(entry.value);

    if (existing !== undefined) {
      existing.push(entry);
      continue;
    }

    byValue.set(
      entry.value,
      [entry],
    );
  }

  return Array.from(byValue.values())
    .filter(
      (group) => group.length > 1,
    );
}


/*
 * Converts unresolved Initiative ties into validation issues.
 *
 * No tie-breaking policy is applied here because that rule has not yet
 * been defined.
 */
export function findInitiativeTieIssues(
  entries: readonly InitiativeEntry[],
): readonly InitiativeIssue[] {
  return findInitiativeTies(entries)
    .map((group) => ({
      code: "initiative-tie" as const,
      combatantIds: group.map(
        (entry) => entry.combatantId,
      ),
      message:
        // findInitiativeTies only returns groups of two or more entries.
        `Initiative tie at value ${group[0]!.value}; ` +
        "a tie-breaking rule must resolve this before Initiative order can be established.",
    }));
}


// ---------------------------------------------------------------------------
// Initiative ordering
// ---------------------------------------------------------------------------

/*
 * Resolves a fresh Initiative order for one Round.
 *
 * Initiative is always ordered from highest value to lowest value.
 *
 * This function should be called again with fresh Initiative results at
 * the beginning of every new Round.
 *
 * It deliberately refuses to resolve equal values until a formal
 * tie-breaking rule exists.
 */
export function resolveInitiativeOrder(
  combatantIds: readonly CombatantId[],
  entries: readonly InitiativeEntry[],
): InitiativeResolution {
  const structuralIssues =
    findInitiativeEntryIssues(
      combatantIds,
      entries,
    );

  if (structuralIssues.length > 0) {
    return {
      success: false,
      issues: structuralIssues,
    };
  }

  const tieIssues =
    findInitiativeTieIssues(entries);

  if (tieIssues.length > 0) {
    return {
      success: false,
      issues: tieIssues,
    };
  }

  const order =
    [...entries].sort(
      (a, b) => b.value - a.value,
    );

  return {
    success: true,
    order,
  };
}


// ---------------------------------------------------------------------------
// Initiative lookup
// ---------------------------------------------------------------------------

export function findInitiativeEntry(
  order: InitiativeOrder,
  combatantId: CombatantId,
): InitiativeEntry | undefined {
  return order.find(
    (entry) =>
      entry.combatantId === combatantId,
  );
}


/*
 * Returns the zero-based Initiative position of a combatant.
 *
 * Returns null when the combatant is not present.
 */
export function findInitiativeIndex(
  order: InitiativeOrder,
  combatantId: CombatantId,
): number | null {
  const index =
    order.findIndex(
      (entry) =>
        entry.combatantId === combatantId,
    );

  return index === -1
    ? null
    : index;
}


// ---------------------------------------------------------------------------
// Initiative eligibility
// ---------------------------------------------------------------------------

/*
 * A combatant remains eligible to receive another Turn during the current
 * Round while they have at least one Round Action remaining.
 *
 * The per-Turn Action cap has no effect on this eligibility.
 */
export function isInitiativeEligible(
  combatantId: CombatantId,
  combatants: readonly CombatantRoundState[],
): boolean {
  const combatant =
    findCombatantRoundState(
      combatants,
      combatantId,
    );

  return (
    combatant !== undefined &&
    combatant.remainingActions > 0
  );
}


/*
 * Returns whether at least one combatant is still eligible to receive a
 * Turn in the current Round.
 */
export function hasInitiativeEligibleCombatant(
  order: InitiativeOrder,
  combatants: readonly CombatantRoundState[],
): boolean {
  return order.some(
    (entry) =>
      isInitiativeEligible(
        entry.combatantId,
        combatants,
      ),
  );
}


// ---------------------------------------------------------------------------
// First Initiative position
// ---------------------------------------------------------------------------

/*
 * Finds the first combatant in Initiative order who still has Round
 * Actions available.
 *
 * Normally this is used when the Round begins.
 */
export function findFirstEligibleInitiativeIndex(
  order: InitiativeOrder,
  combatants: readonly CombatantRoundState[],
): number | null {
  for (
    let index = 0;
    index < order.length;
    index += 1
  ) {
    const entry = order[index];

    if (entry === undefined) continue;

    if (
      isInitiativeEligible(
        entry.combatantId,
        combatants,
      )
    ) {
      return index;
    }
  }

  return null;
}


// ---------------------------------------------------------------------------
// Initiative rotation
// ---------------------------------------------------------------------------

/*
 * Finds the next combatant eligible for a Turn after the supplied
 * Initiative position.
 *
 * Initiative wraps around continuously:
 *
 *   A -> B -> C -> A -> B -> C -> ...
 *
 * Combatants with zero remaining Round Actions are skipped.
 *
 * The search includes a wrapped return to the same combatant. This matters
 * when every other combatant has exhausted their Actions but one combatant
 * still has Actions remaining.
 *
 * Returns null only when no combatant has Actions remaining.
 */
export function findNextEligibleInitiativeIndex(
  order: InitiativeOrder,
  currentIndex: number,
  combatants: readonly CombatantRoundState[],
): number | null {
  if (order.length === 0) {
    return null;
  }

  if (
    !Number.isInteger(currentIndex) ||
    currentIndex < 0 ||
    currentIndex >= order.length
  ) {
    return null;
  }

  for (
    let offset = 1;
    offset <= order.length;
    offset += 1
  ) {
    const index =
      (currentIndex + offset) %
      order.length;

    const entry = order[index];

    if (entry === undefined) continue;

    if (
      isInitiativeEligible(
        entry.combatantId,
        combatants,
      )
    ) {
      return index;
    }
  }

  return null;
}


/*
 * Convenience helper returning the next eligible Initiative entry rather
 * than its index.
 */
export function findNextEligibleInitiativeEntry(
  order: InitiativeOrder,
  currentIndex: number,
  combatants: readonly CombatantRoundState[],
): InitiativeEntry | null {
  const nextIndex =
    findNextEligibleInitiativeIndex(
      order,
      currentIndex,
      combatants,
    );

  if (nextIndex === null) {
    return null;
  }

  return order[nextIndex] ?? null;
}