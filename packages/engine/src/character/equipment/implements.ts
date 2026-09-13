/*
 * Selected implements: naming WHICH owned object fills an authored role, and
 * how well it fills it.
 *
 * A Skill, a Technique's application (once one exists), a Trait's application
 * (likewise) or an Item's own use can all authors a ROLE — "the weapon", "the
 * arrow", "the catalyst" — without knowing which concrete object a particular
 * character will point at it. `SelectedImplement` is how a caller answers
 * that at attempt time, `ImplementRequirement` is how the authored content
 * states what the role will accept, and `resolveSelectedImplements()` is the
 * one place selection is validated and compatibility graded, so every later
 * stage reads `ImplementResolution[]` and never repeats the lookup.
 *
 *
 * SELECTION NAMES THE OBJECT; COMPATIBILITY GRADES IT
 *
 * These are two different questions on purpose. "Is this InventoryItemRef a
 * real, owned, usable object" is answered once, structurally, the same way
 * every other reference in this engine is (see references.ts). "How well does
 * the Item it names satisfy THIS role" is a four-way authored judgement —
 * preferred, compatible, improvised, incompatible — and it is not a
 * disqualification by itself: an application that sets `allowImprovised` on a
 * role is explicitly choosing to let a graded-down object stand in.
 *
 *
 * PREFERRED VS COMPATIBLE IS A PROPERTY OF THE REQUIREMENT, NOT THE ITEM
 *
 * `ImplementRequirement` carries two family lists: `acceptedFamilies` (any
 * membership in it grades "compatible") and an optional `preferredFamilies`
 * subset (membership grades "preferred" instead). A "blunt weapon" role can
 * accept clubs and maces broadly while preferring maces specifically, without
 * an Item ever declaring an opinion about which roles it is good at — the
 * SAME mace is merely compatible for a role that prefers warhammers and
 * preferred for one that does not distinguish.
 *
 *
 * WHAT THIS FILE DOES NOT DO
 *
 * It does not perform combat math, apply Effects, consume anything, or decide
 * Shū compatibility — that is a different, whole-Item verdict or  and is
 * explicitly a separate concept (see Ticket 4.6's `shuInteraction`). It does
 * not invent hand or slot occupancy: two roles may both resolve to the same
 * two hands without this file knowing there are two hands to run out of. And
 * it never repeats a catalog lookup a caller already did — the definition
 * lookup it needs is supplied, exactly as resolveEquipmentTransition() and
 * resolveItemUse() take one, for the same reason.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceInputs } from "../../infrastructure/trace";

import type { ResolvedCharacter } from "../resolution";

import type { ItemFamilyId } from "./families";
import {
  describeInventoryReferenceIssue,
  resolveInventoryItemRef,
  type InventoryItemRef,
} from "./references";
import { ITEM_EQUIPMENT_STATES, isItemEquipmentState, type ItemEquipmentState } from "./state";
import { resolveItemFunctionality } from "./integrity";
import {
  describeItemDefinitionIssue,
  findItemCoreDefinitionIssues,
  resolveItemDefinition,
  type ItemDefinitionLookup,
} from "./validation";
import { findItemFamilyIssues } from "./families";


/*
 * A RECORD, and an array is not one.
 *
 * `[]` is `typeof "object"` and not null, so the old guard let an array
 * through as a well-formed object with none of the fields set — which read as
 * "an attack contribution that declares nothing", a perfectly legal thing to
 * author, rather than as the malformed value it is.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


/* -------------------------------------------------------------------------- */
/* Authored contract                                                         */
/* -------------------------------------------------------------------------- */

export type ImplementCompatibility =
  | "preferred"
  | "compatible"
  | "improvised"
  | "incompatible";

export const IMPLEMENT_COMPATIBILITIES: readonly ImplementCompatibility[] = [
  "preferred",
  "compatible",
  "improvised",
  "incompatible",
];


/**
 * What an authored role will accept, and how it is graded.
 *
 * `role` is the stable id the application's own logic and any
 * `ImplementCondition` (Ticket 4.7) address this slot by — "weapon",
 * "ammunition", "catalyst" — unique within the application that declares it.
 */
export interface ImplementRequirement {
  readonly role: string;

  /** How many selections this role requires, at minimum and at most. */
  readonly minimum: number;
  readonly maximum: number;

  /** Family membership that grades a selection "compatible". */
  readonly acceptedFamilies: readonly ItemFamilyId[];

  /**
   * The subset of `acceptedFamilies` that grades "preferred" instead.
   *
   * Every id here must also appear in `acceptedFamilies` — a family the role
   * prefers but does not otherwise accept is a contradiction, not a stronger
   * preference, and is refused at authoring time by
   * `findImplementRequirementIssues()`.
   */
  readonly preferredFamilies?: readonly ItemFamilyId[];

  /** Which engagement states may fill this role. Omitted means any state. */
  readonly permittedStates?: readonly ItemEquipmentState[];

  /**
   * Whether an Item matching neither family list may still fill this role,
   * graded "improvised" rather than refused outright.
   */
  readonly allowImprovised?: boolean;
}


/**
 * Everything wrong with one authored role.
 *
 * Takes `unknown` and proves the record before reading a field off it. A role
 * arriving as `42` inside a Skill's `implements` used to reach
 * `requirement.role.trim()` and throw out of the validator whose entire job
 * was to report that it was not a role.
 */
export function findImplementRequirementIssues(
  value: unknown,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [{
      code: "equipment.implements.requirement.invalid",
      message: "An implement requirement must be an object.",
      audience: "developer",
      required: "an ImplementRequirement object",
      actual: String(value),
    }];
  }

  const requirement = value as Partial<Record<keyof ImplementRequirement, unknown>>;

  const errors: EngineError[] = [];
  const where = `Implement role "${String(requirement.role)}"`;

  if (
    typeof requirement.role !== "string" ||
    requirement.role.trim().length === 0
  ) {
    errors.push({
      code: "equipment.implements.role.missing",
      message: "An implement requirement must name a non-empty role.",
      audience: "developer",
      required: "non-empty string",
      actual: String(requirement.role),
    });
  }

  const minimum = requirement.minimum;
  const maximum = requirement.maximum;

  if (!Number.isInteger(minimum) || (minimum as number) < 0) {
    errors.push({
      code: "equipment.implements.cardinality.minimum.invalid",
      message: `${where} must declare a non-negative integer minimum.`,
      audience: "developer",
      required: "integer >= 0",
      actual: String(minimum),
    });
  }

  if (!Number.isInteger(maximum) || (maximum as number) < 0) {
    errors.push({
      code: "equipment.implements.cardinality.maximum.invalid",
      message: `${where} must declare a non-negative integer maximum.`,
      audience: "developer",
      required: "integer >= 0",
      actual: String(maximum),
    });
  } else if (
    Number.isInteger(minimum) &&
    (maximum as number) < (minimum as number)
  ) {
    errors.push({
      code: "equipment.implements.cardinality.inverted",
      message: `${where}'s maximum is below its minimum.`,
      audience: "developer",
      required: `>= ${String(minimum)}`,
      actual: String(maximum),
    });
  }

  const accepted = requirement.acceptedFamilies;

  if (
    !Array.isArray(accepted) ||
    accepted.length === 0 ||
    accepted.some((id) => typeof id !== "string" || id.trim().length === 0)
  ) {
    errors.push({
      code: "equipment.implements.families.empty",
      message: `${where} must accept at least one Item family.`,
      audience: "developer",
      required: "one or more non-empty family ids",
      actual: Array.isArray(accepted)
        ? String(accepted.length)
        : String(accepted),
    });
  } else {
    /*
     * A family accepted twice says nothing the first mention did, and the two
     * readings of why an author wrote it — "it counts double" and "I meant a
     * second family" — are both wrong in ways nothing downstream can see.
     */
    const seen = new Set<string>();

    for (const id of accepted as readonly string[]) {
      if (seen.has(id)) {
        errors.push({
          code: "equipment.implements.families.duplicate",
          message: `${where} accepts family "${id}" more than once.`,
          audience: "developer",
          required: "each family accepted once",
          actual: id,
        });
      }

      seen.add(id);
    }

    if (requirement.preferredFamilies !== undefined) {
      const preferred = requirement.preferredFamilies;

      if (
        !Array.isArray(preferred) ||
        preferred.some((id) => typeof id !== "string" || id.trim().length === 0)
      ) {
        errors.push({
          code: "equipment.implements.preferred-families.invalid",
          message: `${where}'s preferred families must be a list of non-empty ids.`,
          audience: "developer",
          required: "array of non-empty strings",
          actual: String(preferred),
        });
      } else {
        const preferredSeen = new Set<string>();

        for (const id of preferred as readonly string[]) {
          if (!seen.has(id)) {
            errors.push({
              code: "equipment.implements.preferred-families.not-accepted",
              message:
                `${where} prefers family "${id}", which it does not also accept.`,
              audience: "developer",
              required: "every preferred family also accepted",
              actual: id,
            });
          }

          if (preferredSeen.has(id)) {
            errors.push({
              code: "equipment.implements.preferred-families.duplicate",
              message: `${where} prefers family "${id}" more than once.`,
              audience: "developer",
              required: "each family preferred once",
              actual: id,
            });
          }

          preferredSeen.add(id);
        }
      }
    }
  }

  if (requirement.permittedStates !== undefined) {
    const states = requirement.permittedStates;

    if (!Array.isArray(states) || states.length === 0) {
      errors.push({
        code: "equipment.implements.permitted-states.empty",
        message:
          `${where}'s permitted states must be a non-empty list, or omitted for any state.`,
        audience: "developer",
        required: "one or more states, or omit the field",
        actual: Array.isArray(states) ? "empty list" : String(states),
      });
    } else {
      const seenStates = new Set<string>();

      for (const state of states as readonly unknown[]) {
        if (!isItemEquipmentState(state)) {
          errors.push({
            code: "equipment.implements.permitted-states.invalid",
            message: `${where} names an unknown engagement state.`,
            audience: "developer",
            required: [...ITEM_EQUIPMENT_STATES],
            actual: String(state),
          });

          continue;
        }

        if (seenStates.has(state)) {
          errors.push({
            code: "equipment.implements.permitted-states.duplicate",
            message: `${where} permits the "${state}" state more than once.`,
            audience: "developer",
            required: "each state permitted once",
            actual: state,
          });
        }

        seenStates.add(state);
      }
    }
  }

  if (
    requirement.allowImprovised !== undefined &&
    typeof requirement.allowImprovised !== "boolean"
  ) {
    errors.push({
      code: "equipment.implements.allow-improvised.invalid",
      message: `${where}'s allowImprovised must be true or false when present.`,
      audience: "developer",
      required: "boolean, or omit the field",
      actual: String(requirement.allowImprovised),
    });
  }

  return errors;
}


/**
 * Every authored role in one application's declaration, checked together.
 *
 * Takes `unknown` for the LIST as well as for each entry, because
 * `implements: 42` on a Skill application is exactly as registerable as a
 * malformed role inside a real list, and the old signature made the caller
 * responsible for proving the list first — which two of the three callers
 * did not do.
 *
 * The per-role checks are `findImplementRequirementIssues()`; this adds the
 * one thing only visible across the whole list — a role declared twice, which
 * would make a selection naming it ambiguous about which requirement it
 * answers to. Shared by every caller that embeds `ImplementRequirement[]` —
 * a Skill's application, an Item's own use application — so the duplicate-role
 * rule cannot drift between them.
 */
export function findImplementRequirementsIssues(
  value: unknown,
): readonly EngineError[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    return [{
      code: "equipment.implements.requirements.invalid",
      message: "An implement requirement list must be a list.",
      audience: "developer",
      required: "array of ImplementRequirement, or omit the field",
      actual: String(value),
    }];
  }

  const errors: EngineError[] = [];
  const roles = new Set<string>();

  for (const requirement of value as readonly unknown[]) {
    errors.push(...findImplementRequirementIssues(requirement));

    const role = isRecord(requirement) ? requirement["role"] : undefined;

    if (typeof role !== "string") continue;

    if (roles.has(role)) {
      errors.push({
        code: "equipment.implements.role.duplicate",
        message: `Role "${role}" is declared more than once.`,
        audience: "developer",
        required: "each role declared once",
        actual: role,
      });
    }

    roles.add(role);
  }

  return errors;
}


/**
 * The previous name, kept as an alias so the three call sites that already
 * import it keep reading the way they read. One implementation either way.
 */
export const findImplementRequirementListIssues = findImplementRequirementsIssues;


/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

/** One caller's answer to one authored role: which owned object fills it. */
export interface SelectedImplement {
  readonly role: string;
  readonly item: InventoryItemRef;
}


/** One role, resolved: the object that fills it, and how well it does. */
export interface ImplementResolution {
  readonly role: string;
  readonly item: InventoryItemRef;
  readonly itemId: string;
  readonly compatibility: ImplementCompatibility;

  /**
   * The resolved Item's own family membership and current engagement state,
   * captured here so a later stage — an `ImplementCondition` (Ticket 4.7) —
   * can filter on them without a second catalog or inventory lookup. Both are
   * facts about the SAME moment this resolution was produced; if the entry's
   * state changes afterward, this resolution is stale exactly the way an
   * Item operation's proposal is (see equipment/runtime.ts) and a caller
   * re-resolving implements gets a fresh answer.
   */
  readonly families: readonly ItemFamilyId[];
  readonly state: ItemEquipmentState;

  /**
   * The resolved entry's current integrity, for a durable Item — Ticket 4.8.
   * Absent on a non-durable Item's entry. Present-but-undefined-on-the-entry
   * (a durable Item nobody has damaged yet) reads as the Item's own maximum,
   * captured here rather than left for `contributions.ts` to re-derive.
   */
  readonly integrity?: number;
}


export type ImplementSelectionIssueKind =
  | "role-unknown"
  | "role-below-minimum"
  | "role-above-maximum"
  | "duplicate-selection"
  | "entry-shared-across-roles"
  | "invalid-reference"
  | "character-mismatch"
  | "unknown-entry"
  | "invalid-entry"
  | "quantity-zero"
  | "state-not-permitted"
  | "definition-unknown"
  | "definition-invalid"
  | "broken"
  | "incompatible";


/** One precise reason a selection did not resolve. */
export interface ImplementSelectionIssue {
  readonly kind: ImplementSelectionIssueKind;
  readonly role: string;
  readonly item?: InventoryItemRef;
  readonly message: string;
}


export interface ImplementSelectionResolution {
  /** Present for every selection that resolved cleanly, issues or not. */
  readonly resolutions: readonly ImplementResolution[];

  /** Empty means every role's cardinality and every selection is sound. */
  readonly issues: readonly ImplementSelectionIssue[];
}


export interface SelectImplementsInput {
  readonly resolved: ResolvedCharacter;
  readonly requirements: readonly ImplementRequirement[];

  /** What the caller chose. Host data — validated, never trusted. */
  readonly selections: unknown;

  /**
   * Whether one entry may be named by more than one role in this call.
   *
   * False unless the application explicitly says otherwise, because letting
   * one arrow simultaneously BE the ammunition and the improvised catalyst is
   * the same object counted twice by whatever consumes the resolutions.
   */
  readonly allowSharedEntries?: boolean;
}


function structuralError(code: string, message: string): EngineError {
  return {
    code,
    message,
    audience: "developer",
  };
}


function isSelectedImplementShape(value: unknown): value is SelectedImplement {
  if (!isRecord(value)) return false;

  const role = value["role"];
  const item = value["item"];

  return typeof role === "string" && role.trim().length > 0 &&
    isRecord(item) &&
    typeof item["characterId"] === "string" &&
    typeof item["entryId"] === "string";
}


function traceOf(inputs: TraceInputs, output: string): { readonly root: ReturnType<typeof createTraceNode> } {
  return {
    root: createTraceNode({
      id: "character.equipment.implements",
      label: "Resolve Selected Implements",
      formula:
        "each role's cardinality and every selection's reference are validated; family membership grades compatibility",
      inputs,
      output,
    }),
  };
}


function gradeCompatibility(
  requirement: ImplementRequirement,
  families: readonly ItemFamilyId[],
): ImplementCompatibility {
  const preferred = new Set(requirement.preferredFamilies ?? []);
  const accepted = new Set(requirement.acceptedFamilies);

  if (families.some((family) => preferred.has(family))) return "preferred";
  if (families.some((family) => accepted.has(family))) return "compatible";

  return requirement.allowImprovised === true ? "improvised" : "incompatible";
}


/**
 * Validate a set of selections against a set of authored roles, and grade
 * each resolved selection's compatibility.
 *
 * Pure. Reads the character and the catalog; commits nothing and consumes
 * nothing. `resolutions` and `issues` are independent: a role that failed its
 * cardinality still reports issues for whatever WAS selected against it, so a
 * caller sees every problem in one pass rather than one at a time.
 */
export function resolveSelectedImplements(
  input: SelectImplementsInput,
  getItemDefinition: ItemDefinitionLookup,
): EngineResult<ImplementSelectionResolution> {
  const inputs: TraceInputs = {
    roles: { value: input.requirements.length },
  };

  if (!Array.isArray(input.selections)) {
    return engineFailure(traceOf(inputs, "selections_invalid"), [
      structuralError(
        "equipment.implements.selections.invalid",
        "The selected implements must be an array.",
      ),
    ] as NonEmptyArray<EngineError>);
  }

  const malformed = input.selections.filter(
    (candidate) => !isSelectedImplementShape(candidate),
  );

  if (malformed.length > 0) {
    return engineFailure(traceOf(inputs, "selection_invalid"), [
      structuralError(
        "equipment.implements.selection.invalid",
        "Every selected implement must be a well-formed { role, item }.",
      ),
    ] as NonEmptyArray<EngineError>);
  }

  const selections = input.selections as readonly SelectedImplement[];
  const knownRoles = new Set(input.requirements.map((requirement) => requirement.role));

  const issues: ImplementSelectionIssue[] = [];

  for (const selection of selections) {
    if (!knownRoles.has(selection.role)) {
      issues.push({
        kind: "role-unknown",
        role: selection.role,
        item: selection.item,
        message: `"${selection.role}" is not a role this application declares.`,
      });
    }
  }

  /* One entry filling two roles, unless the caller explicitly permits it. */
  if (input.allowSharedEntries !== true) {
    const seenByEntry = new Map<string, string>();

    for (const selection of selections) {
      const key = `${selection.item.characterId}:${selection.item.entryId}`;
      const owningRole = seenByEntry.get(key);

      if (owningRole !== undefined && owningRole !== selection.role) {
        issues.push({
          kind: "entry-shared-across-roles",
          role: selection.role,
          item: selection.item,
          message:
            `This entry already fills role "${owningRole}" and may not also fill "${selection.role}".`,
        });

        continue;
      }

      seenByEntry.set(key, selection.role);
    }
  }

  const resolutions: ImplementResolution[] = [];

  for (const requirement of input.requirements) {
    const matched = selections.filter((selection) => selection.role === requirement.role);

    const seenEntries = new Set<string>();

    for (const selection of matched) {
      const entryKey = `${selection.item.characterId}:${selection.item.entryId}`;

      if (seenEntries.has(entryKey)) {
        issues.push({
          kind: "duplicate-selection",
          role: requirement.role,
          item: selection.item,
          message: `The same entry was selected twice for role "${requirement.role}".`,
        });

        continue;
      }

      seenEntries.add(entryKey);

      const found = resolveInventoryItemRef(
        selection.item,
        input.resolved.character.id,
        input.resolved.character.items,
      );

      if (!found.ok) {
        const kindByIssue: Record<typeof found.issue, ImplementSelectionIssueKind> = {
          "invalid-reference": "invalid-reference",
          "character-mismatch": "character-mismatch",
          "unknown-entry": "unknown-entry",
          "invalid-entry": "invalid-entry",
        };

        issues.push({
          kind: kindByIssue[found.issue],
          role: requirement.role,
          item: selection.item,
          message: describeInventoryReferenceIssue(found.issue),
        });

        continue;
      }

      const entry = found.entry;

      if (entry.quantity <= 0) {
        issues.push({
          kind: "quantity-zero",
          role: requirement.role,
          item: selection.item,
          message: "This entry has nothing left in it.",
        });

        continue;
      }

      if (
        requirement.permittedStates !== undefined &&
        !requirement.permittedStates.includes(entry.state)
      ) {
        issues.push({
          kind: "state-not-permitted",
          role: requirement.role,
          item: selection.item,
          message: `This entry is ${entry.state}, which role "${requirement.role}" does not permit.`,
        });

        continue;
      }

      /*
       * The DEFINITION, proved before it is read.
       *
       * `definition?.families ?? []` used to stand here, and it quietly turned
       * a missing Item into an improvised one: an entry naming a definition no
       * catalog holds graded "improvised" against any role with
       * `allowImprovised`, so a typo in an itemId — or a host that dropped a
       * definition between sessions — became a usable club. Improvisation is a
       * judgement about a REAL object that does not match the role; there is
       * no object here to judge.
       */
      const lookup = resolveItemDefinition(getItemDefinition, entry.itemId);

      if (!lookup.ok) {
        issues.push({
          kind: lookup.issue === "unknown" ? "definition-unknown" : "definition-invalid",
          role: requirement.role,
          item: selection.item,
          message: lookup.issue === "unknown"
            ? `This entry names Item "${entry.itemId}", which no catalog defines.`
            : `The catalog answered Item "${entry.itemId}" with something that is not an Item definition.`,
        });

        continue;
      }

      const definition = lookup.definition;

      const definitionIssues = [
        ...findItemCoreDefinitionIssues(definition).map(describeItemDefinitionIssue),
        ...findItemFamilyIssues(definition.families).map((issue) => issue.message),
      ];

      if (definitionIssues.length > 0) {
        issues.push({
          kind: "definition-invalid",
          role: requirement.role,
          item: selection.item,
          message:
            `Item "${entry.itemId}" ${definitionIssues.join("; ")}.`,
        });

        continue;
      }

      /*
       * And whether it is still an object that works. A sword at zero
       * integrity fills no role unless its own brokenBehavior says it does —
       * see integrity.ts. Asked here rather than left to whatever consumes the
       * resolution, so an Item refused as an implement cannot still turn up
       * contributing an attack.
       */
      const functionality = resolveItemFunctionality(definition, entry.integrity);

      if (!functionality.selectableAsImplement) {
        issues.push({
          kind: "broken",
          role: requirement.role,
          item: selection.item,
          message: `This Item is ${functionality.state} and fills no role.`,
        });

        continue;
      }

      const families = definition.families ?? [];
      const compatibility = gradeCompatibility(requirement, families);

      if (compatibility === "incompatible") {
        issues.push({
          kind: "incompatible",
          role: requirement.role,
          item: selection.item,
          message: `This Item's family does not satisfy role "${requirement.role}".`,
        });

        continue;
      }

      resolutions.push({
        role: requirement.role,
        item: {
          characterId: input.resolved.character.id,
          entryId: entry.entryId,
        },
        itemId: entry.itemId,
        compatibility,
        families,
        state: entry.state,
        ...(definition.integrity === undefined
          ? {}
          : { integrity: entry.integrity ?? definition.integrity.maximum }),
      });
    }

    const acceptedCount = matched.length - issues.filter(
      (issue) => issue.role === requirement.role,
    ).length;

    if (acceptedCount < requirement.minimum) {
      issues.push({
        kind: "role-below-minimum",
        role: requirement.role,
        message:
          `Role "${requirement.role}" needs at least ${requirement.minimum} implement(s); ${acceptedCount} resolved.`,
      });
    } else if (acceptedCount > requirement.maximum) {
      issues.push({
        kind: "role-above-maximum",
        role: requirement.role,
        message:
          `Role "${requirement.role}" permits at most ${requirement.maximum} implement(s); ${acceptedCount} resolved.`,
      });
    }
  }

  return engineSuccess(
    { resolutions, issues },
    traceOf(inputs, issues.length === 0 ? "satisfied" : "issues"),
  );
}
