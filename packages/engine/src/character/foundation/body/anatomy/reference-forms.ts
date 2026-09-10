/*
 * Reference Forms as content.
 *
 * A form is a complete anatomical blueprint — what parts a body of this kind
 * has, how they connect, and what each one persistently is — and it is a
 * catalog domain like any other. That is the change that makes transformation
 * possible at all: a form used to be reachable only through the Species that
 * declared it, so nothing could target one except by being that Species.
 *
 * Making forms independently addressable means a Trait, a Condition, a Nen
 * ability or an Item can name one. A were-form, a partial mutation and a
 * summoned shape are all the same mechanism pointed at different content, and
 * none of them has to be a Species to exist.
 *
 * Species now reference a form by id rather than owning the only copy, so
 * there is exactly one authoritative definition of what a Human body is
 * arranged like.
 *
 *
 * WHAT A FORM OWNS, AND WHAT IT MUST NOT
 *
 *   owns     slots, BodyPart types, continuity identities, topology, geometry
 *   not      morphology, damage, recovery, Injuries, anything about a person
 *
 * The second list is the character's, keyed by continuity identity, which is
 * what lets one form be worn by any number of different bodies — and what lets
 * one body wear any number of forms without losing itself.
 */

import { createRegistry } from "../../../../infrastructure/registry";
import type { Definition } from "../../../../infrastructure/registry";
import { createReferenceForm } from "./creation";
import {
  STANDARD_HUMANOID_BODY_PART_SPECS,
  STANDARD_HUMANOID_FORM_ID,
} from "./standard-humanoid";
import type {
  ReferenceForm,
  ReferenceFormId,
  ReferenceFormPart,
} from "./types";


/*
 * One authored body plan.
 *
 * Structurally a ReferenceForm plus the name and description every catalog
 * definition carries, so a definition can be handed straight to anything that
 * wants a form without being unwrapped first.
 */
export interface ReferenceFormDefinition extends Definition, ReferenceForm {
  readonly parts: readonly ReferenceFormPart[];
}


/*
 * The Basic Human Standard's own body plan.
 *
 * Built from the same specs the standard anatomy is instantiated from, so the
 * catalog entry and the reference body cannot disagree about what a Human is.
 */
export const STANDARD_HUMANOID_FORM: ReferenceFormDefinition = {
  ...createReferenceForm(
    STANDARD_HUMANOID_BODY_PART_SPECS,
    STANDARD_HUMANOID_FORM_ID,
  ),
  name: "Standard Humanoid",
  description:
    "The Basic Human Standard body plan: a torso pair, a neck and head, two " +
    "arms with hands, and two legs with feet.",
};


export const REFERENCE_FORM_DEFINITIONS = {
  [STANDARD_HUMANOID_FORM_ID]: STANDARD_HUMANOID_FORM,
} as const satisfies Record<string, ReferenceFormDefinition>;


function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}


function isPositionOnAxis(value: unknown): boolean {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
}


/**
 * One body plan's shape and topology.
 *
 * A form is a graph, and the three ways a graph can be wrong are all
 * properties of the form ALONE — which is what makes them registration
 * questions rather than catalog ones. A duplicate slot means two parts claim
 * one anatomical position. An attachment naming a slot the form does not
 * contain is a limb attached to nothing. More than one rootless part is two
 * disconnected bodies wearing one name, and none at all is a cycle.
 *
 * What is NOT checked here is whether each part's `type` names a BodyPart
 * definition that exists. A form may legitimately be registered before the
 * parts it is built from, so that reference is checked after every catalog has
 * loaded.
 */
export function findReferenceFormDefinitionStructuralIssues(
  definition: unknown,
): readonly string[] {
  const form = recordOf(definition);

  if (form === undefined) return [];

  const parts = form["parts"];

  if (!Array.isArray(parts)) return ["needs a list of parts."];
  if (parts.length === 0) return ["declares no parts, so it is not a body."];

  const issues: string[] = [];
  const slotIds = new Set<string>();
  let roots = 0;

  for (const [index, candidate] of parts.entries()) {
    const part = recordOf(candidate);

    if (part === undefined) {
      issues.push(`has a part at position ${index} that is not a part.`);
      continue;
    }

    for (const field of ["slotId", "type", "continuityKey"] as const) {
      const value = part[field];

      if (typeof value !== "string" || value.trim().length === 0) {
        issues.push(`has a part with no ${field}.`);
      }
    }

    const slotId = part["slotId"];

    if (typeof slotId === "string") {
      if (slotIds.has(slotId)) {
        issues.push(`declares slot "${slotId}" more than once.`);
      }

      slotIds.add(slotId);
    }

    const attachment = part["attachment"];

    if (attachment === null) {
      roots += 1;
      continue;
    }

    const joint = recordOf(attachment);

    if (joint === undefined) {
      issues.push(`has a part whose attachment is neither a joint nor null.`);
      continue;
    }

    for (const field of ["parentPosition", "childPosition"] as const) {
      if (!isPositionOnAxis(joint[field])) {
        issues.push(`has an attachment ${field} outside 0..1.`);
      }
    }
  }

  /*
   * Checked after the walk, because a parent may legitimately appear later in
   * the list than its child — order within a form carries no meaning.
   */
  const parentBySlot = new Map<string, string>();

  for (const candidate of parts) {
    const part = recordOf(candidate);
    const joint = recordOf(part?.["attachment"]);

    if (part === undefined || joint === undefined) continue;

    const parentSlotId = joint["parentSlotId"];

    if (typeof parentSlotId !== "string" || !slotIds.has(parentSlotId)) {
      issues.push(
        `attaches a part to "${String(parentSlotId)}", which the form does not contain.`,
      );

      continue;
    }

    const slotId = part["slotId"];

    if (typeof slotId === "string") parentBySlot.set(slotId, parentSlotId);
  }

  if (roots === 0) {
    issues.push("has no root part, so every part hangs off another.");
  } else if (roots > 1) {
    issues.push(`has ${roots} root parts, so it describes more than one body.`);
  }

  /*
   * REACHABILITY, which is a different question from "is there a root".
   *
   * Counting roots and checking every parent exists is not acyclicity, and the
   * gap is not hypothetical: a form with a perfectly good root plus two slots
   * parented to each other has exactly one root and no dangling parent, and is
   * still two disconnected components with a cycle in the second. A slot
   * parented to itself passes both checks in the same way.
   *
   * So every slot has to actually REACH the root by walking its parent chain.
   * A chain that revisits a slot is a cycle; a chain longer than the form is
   * the same thing seen from the other end. Both are reported once per slot
   * that cannot get home, rather than once per edge, because the fix is to the
   * slot's own attachment.
   */
  if (roots === 1) {
    for (const slotId of slotIds) {
      const visited = new Set<string>([slotId]);

      let current = slotId;

      for (;;) {
        const parent = parentBySlot.get(current);

        /* No parent: this is the root, and the walk got home. */
        if (parent === undefined) break;

        if (visited.has(parent)) {
          issues.push(
            `has a part chain from "${slotId}" that loops instead of reaching the root.`,
          );

          break;
        }

        visited.add(parent);
        current = parent;
      }
    }
  }

  return issues;
}


const REFERENCE_FORM_REGISTRY = createRegistry<ReferenceFormDefinition>(
  "Reference Form",
  REFERENCE_FORM_DEFINITIONS,
  findReferenceFormDefinitionStructuralIssues,
);


export type KnownReferenceFormId = keyof typeof REFERENCE_FORM_DEFINITIONS;


export function isKnownReferenceFormId(formId: ReferenceFormId): boolean {
  return REFERENCE_FORM_REGISTRY.isKnownId(formId);
}


export function getReferenceFormDefinition(
  formId: ReferenceFormId,
): ReferenceFormDefinition | undefined {
  return REFERENCE_FORM_REGISTRY.get(formId);
}


export const referenceFormRegistry = REFERENCE_FORM_REGISTRY;


/**
 * What can be wrong with the Reference Form catalog itself.
 *
 * These domains had no catalog check while they had no rules to check. They
 * have real shape validators now, and the registry runs the same one over
 * AUTHORED content that the barrier runs over registered content — so this is
 * how the engine's own catalog is held to the rules it imposes on a host.
 */
export function findReferenceFormCatalogIssues(): readonly string[] {
  return REFERENCE_FORM_REGISTRY.findCatalogIssues();
}
