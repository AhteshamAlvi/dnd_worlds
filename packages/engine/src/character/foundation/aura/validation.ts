/*
 * Structural validation for stored Aura state.
 *
 * The split against distribution resolution is deliberate and is about what
 * each layer can actually know.
 *
 * HERE: everything decidable from the sheet alone — Current Aura against the
 * pool CON and VIT derive, and whether each allocation is a well-formed
 * record. A duplicate allocation id or a negative amount is malformed no
 * matter what the character is doing at the time.
 *
 * NOT here: whether the allocations fit inside the character's accessible
 * Output. Accessible Output depends on runtime Nen state — which principles
 * are active, what Ren is open to — so a character who is legal at rest and
 * over-allocated mid-Ren is not a character with an invalid SHEET. That limit
 * belongs to resolveAuraDistribution, which is handed the Output figure.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import type { Attributes } from "../attributes/types";
import { validateAuraPool } from "./pool";
import type { AuraAllocation, CharacterAuraState } from "./state";
import { AURA_COVERAGES, AURA_PLACEMENTS } from "./types";


export type AuraAllocationIssueCode =
  | "aura.allocation.id.missing"
  | "aura.allocation.id.duplicate"
  | "aura.allocation.amount.invalid"
  | "aura.allocation.coverage.invalid"
  | "aura.allocation.placement.invalid"
  | "aura.allocation.continuity.missing";

export interface AuraAllocationIssue {
  readonly code: AuraAllocationIssueCode;
  readonly message: string;

  /** Where in the allocation list, so a UI can point at the offending row. */
  readonly index: number;

  readonly allocationId?: string;
  readonly actual?: unknown;
}


function isValidCoverage(value: unknown): boolean {
  return (AURA_COVERAGES as readonly unknown[]).includes(value);
}

function isValidPlacement(value: unknown): boolean {
  return (AURA_PLACEMENTS as readonly unknown[]).includes(value);
}


/*
 * Every way one list of allocations can be malformed.
 *
 * Shared by validateAuraState and resolveAuraDistribution rather than written
 * twice: an allocation that the sheet rejects must not be one distribution
 * silently accepts, and the only reliable way to guarantee that is one
 * predicate.
 *
 * Ids matter more than they look. They are how a caller removes or updates one
 * allocation, and how a resolved allocation points back at the stored one it
 * came from — a whole-body allocation expands into one resolved record per
 * part, all carrying the same allocationId. Duplicate ids make that mapping
 * ambiguous in a way nothing downstream can recover from.
 */
export function findAuraAllocationIssues(
  allocations: readonly AuraAllocation[],
): readonly AuraAllocationIssue[] {
  const issues: AuraAllocationIssue[] = [];
  const seen = new Set<string>();

  allocations.forEach((allocation, index) => {
    const id = allocation.id;

    if (typeof id !== "string" || id.trim().length === 0) {
      issues.push({
        code: "aura.allocation.id.missing",
        message: "Every Aura allocation needs a non-empty id.",
        index,
        actual: id,
      });
    } else if (seen.has(id)) {
      issues.push({
        code: "aura.allocation.id.duplicate",
        message: `More than one Aura allocation uses the id "${id}".`,
        index,
        allocationId: id,
        actual: id,
      });
    } else {
      seen.add(id);
    }

    if (!Number.isFinite(allocation.aura) || allocation.aura < 0) {
      issues.push({
        code: "aura.allocation.amount.invalid",
        message: "Allocated Aura must be a finite non-negative number.",
        index,
        ...(typeof id === "string" ? { allocationId: id } : {}),
        actual: Number.isFinite(allocation.aura)
          ? allocation.aura
          : String(allocation.aura),
      });
    }

    if (!isValidCoverage(allocation.coverage)) {
      issues.push({
        code: "aura.allocation.coverage.invalid",
        message:
          `Aura allocation coverage must be one of: ${AURA_COVERAGES.join(", ")}.`,
        index,
        ...(typeof id === "string" ? { allocationId: id } : {}),
        actual: allocation.coverage,
      });
    }

    if (!isValidPlacement(allocation.placement)) {
      issues.push({
        code: "aura.allocation.placement.invalid",
        message:
          `Aura placement must be one of: ${AURA_PLACEMENTS.join(", ")}.`,
        index,
        ...(typeof id === "string" ? { allocationId: id } : {}),
        actual: allocation.placement,
      });
    }

    /*
     * A localized allocation with no identity to target is not "localized to
     * nowhere", it is unusable: distribution has nothing to look up, and the
     * allocation would be silently dropped as unmanifested every time.
     */
    if (allocation.coverage === "localized") {
      const key: unknown = allocation.continuityKey;

      if (typeof key !== "string" || key.trim().length === 0) {
        issues.push({
          code: "aura.allocation.continuity.missing",
          message:
            "A localized Aura allocation must name the continuity identity it covers.",
          index,
          ...(typeof id === "string" ? { allocationId: id } : {}),
          actual: key,
        });
      }
    }
  });

  return issues;
}


/*
 * Diagnostics cross the JSON boundary, so whatever malformed value was found
 * has to arrive as something serializable. A number stays a number; anything
 * else is described rather than embedded.
 */
function reportable(value: unknown): string | number | boolean | null {
  if (value === null) return null;

  switch (typeof value) {
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "string":
    case "boolean":
      return value;
    default:
      return String(value);
  }
}

export function auraAllocationIssueToEngineError(
  issue: AuraAllocationIssue,
): EngineError {
  return {
    code: issue.code,
    message: issue.message,
    audience: "player",
    required: `allocations.${issue.index} must be a well-formed Aura allocation`,
    actual: issue.actual === undefined ? issue.index : reportable(issue.actual),
  };
}


/*
 * The whole of a character's stored Aura, judged together.
 *
 * Pool and allocations are validated in one pass so a sheet gets told about
 * both at once rather than about the pool, then about the allocations after
 * the pool is fixed.
 */
export function validateAuraState(
  state: CharacterAuraState,
  attributes: Attributes,
): EngineResult<CharacterAuraState> {
  const allocations = state.allocations ?? [];
  const poolResult = validateAuraPool(state.current, attributes);
  const allocationIssues = findAuraAllocationIssues(allocations);

  const errors: EngineError[] = [
    ...(poolResult.success ? [] : poolResult.errors),
    ...allocationIssues.map(auraAllocationIssueToEngineError),
  ];

  const traceNode = createTraceNode({
    id: "aura.state.validate",
    label: "Validate stored Aura state",
    formula:
      "current Aura within the derived pool; every allocation well-formed",
    inputs: {
      current: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
      allocations: { value: allocations.length },
    },
    output: errors.length === 0,
    children: [poolResult.trace.root],
  });

  if (errors.length > 0) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: state,
    trace: { root: traceNode },
    warnings: [],
  };
}
