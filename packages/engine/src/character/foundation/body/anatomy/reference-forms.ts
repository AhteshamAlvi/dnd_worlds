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


const REFERENCE_FORM_REGISTRY = createRegistry<ReferenceFormDefinition>(
  "Reference Form",
  REFERENCE_FORM_DEFINITIONS,
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
