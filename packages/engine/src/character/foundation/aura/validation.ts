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
  | "aura.allocation.uniform.weighted"
  | "aura.allocation.weights.invalid"
  | "aura.allocation.authorization.missing"
  | "aura.allocation.authorization.mismatched";

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
 * Who the allocations being validated belong to, when that is known.
 *
 * Optional because most validation is of a sheet in isolation, where there is
 * no second party to bind an authorization to. When an owner IS supplied — the
 * resolution path always supplies one — a differential grant issued for
 * somebody else is refused, which is the difference between an authorization
 * and a token anybody can carry.
 */
export interface AuraAllocationValidationContext {
  readonly owner?: string;
}


/*
 * The differential rules, split out so they read as one block rather than as
 * four more branches in an already long loop.
 */
function findDifferentialIssues(
  allocation: AuraAllocation,
  index: number,
  owner: string | undefined,
): readonly AuraAllocationIssue[] {
  const issues: AuraAllocationIssue[] = [];
  const id = allocation.id;
  const at = typeof id === "string" ? { allocationId: id } : {};

  const weights: unknown = (allocation as { readonly weights?: unknown }).weights;

  if (!Array.isArray(weights) || weights.length === 0) {
    issues.push({
      code: "aura.allocation.weights.invalid",
      message:
        "A differential Aura allocation must name at least one weighted identity.",
      index,
      ...at,
      actual: weights,
    });
  } else {
    let total = 0;
    let malformed = false;

    for (const entry of weights as readonly unknown[]) {
      const weight = (entry as { readonly weight?: unknown })?.weight;
      const key = (entry as { readonly continuityKey?: unknown })?.continuityKey;

      if (
        typeof key !== "string" || key.trim().length === 0 ||
        typeof weight !== "number" || !Number.isFinite(weight) || weight < 0
      ) {
        malformed = true;
        break;
      }

      total += weight;
    }

    /*
     * A total of zero is refused rather than normalized. Dividing by it gives
     * NaN shares, and treating it as "no Aura anywhere" would silently accept
     * a request that placed the character's Output nowhere at all.
     */
    if (malformed || total <= 0) {
      issues.push({
        code: "aura.allocation.weights.invalid",
        message:
          "Differential weights must each name an identity and a finite " +
          "non-negative weight, and must total more than zero.",
        index,
        ...at,
        actual: malformed ? "malformed entry" : total,
      });
    }
  }

  const authorization = (allocation as {
    readonly authorization?: {
      readonly allocationId?: unknown;
      readonly source?: unknown;
      readonly owner?: unknown;
      readonly grantedBy?: unknown;
    };
  }).authorization;

  if (
    authorization === null || typeof authorization !== "object" ||
    typeof authorization.allocationId !== "string" ||
    typeof authorization.owner !== "string" ||
    typeof authorization.grantedBy !== "string" ||
    authorization.grantedBy.trim().length === 0
  ) {
    issues.push({
      code: "aura.allocation.authorization.missing",
      message:
        "A differential Aura allocation must carry an authorization naming " +
        "the allocation, its source, its owner and what granted it.",
      index,
      ...at,
      actual: authorization === undefined ? "absent" : "malformed",
    });

    return issues;
  }

  /*
   * The bindings, which are the whole mechanism.
   *
   * A grant that only had to EXIST would be a token: copied onto another
   * allocation or handed to another character it would still pass, and the
   * mastery gate it stands for would be gone. Each of these three is a way
   * that copy is caught.
   */
  const mismatches: string[] = [];

  if (authorization.allocationId !== id) {
    mismatches.push(
      `allocation ${String(authorization.allocationId)} != ${String(id)}`,
    );
  }

  if (authorization.source !== (allocation.source ?? undefined)) {
    mismatches.push(
      `source ${String(authorization.source)} != ${String(allocation.source)}`,
    );
  }

  if (owner !== undefined && authorization.owner !== owner) {
    mismatches.push(`owner ${authorization.owner} != ${owner}`);
  }

  if (mismatches.length > 0) {
    issues.push({
      code: "aura.allocation.authorization.mismatched",
      message:
        "A differential Aura authorization was granted for something other " +
        "than the allocation it is attached to.",
      index,
      ...at,
      actual: mismatches.join("; "),
    });
  }

  return issues;
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
  context: AuraAllocationValidationContext = {},
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
     * A UNIFORM allocation that narrows itself in any way.
     *
     * The case the coverage union cannot catch on its own. TypeScript's
     * excess-property check only fires on object literals, and stored state
     * arrives from a host as a plain parsed object — so a caller who wants
     * uneven Aura without asking for it can label a narrowed placement
     * "whole-body" and hope somebody reads the field. Nobody would:
     * distribution ignores what it does not know about, and the allocation
     * would resolve as uniform while LOOKING authorized to a reader.
     *
     * All three narrowing fields are refused, not just weights. `continuityKey`
     * in particular is how the removed `localized` coverage selected one part,
     * and leaving it unchecked would let a stale save — or a caller who
     * remembered the old shape — keep the bypass alive under the new name.
     */
    if (allocation.coverage === "whole-body") {
      const narrowing = (["weights", "continuityKey", "excluding"] as const)
        .filter((field) =>
          (allocation as unknown as Readonly<Record<string, unknown>>)[field] !==
            undefined
        );

      if (narrowing.length > 0) {
        issues.push({
          code: "aura.allocation.uniform.weighted",
          message:
            "A whole-body Aura allocation covers every eligible part at equal " +
            "density and cannot select, weight or exclude any of them. Use " +
            "differential coverage, which requires authorization.",
          index,
          ...(typeof id === "string" ? { allocationId: id } : {}),
          actual: narrowing.join(", "),
        });
      }
    }

    if (allocation.coverage === "differential") {
      issues.push(
        ...findDifferentialIssues(allocation, index, context.owner),
      );
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
