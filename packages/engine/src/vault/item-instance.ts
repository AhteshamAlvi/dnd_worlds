/*
 * One particular object, as opposed to a kind of object.
 *
 * `gauntlets` is a definition: what reinforced gauntlets are, what they do when
 * worn, how they interact with Shū. It is authored once and shared by every pair
 * in the world.
 *
 * An Item INSTANCE is one pair. It carries what is true of that pair and nothing
 * else: which definition it is, whose it is, where it is, what has happened to
 * it. It does not carry the definition's fields. An instance that copied
 * `equippedEffects` into itself would be a second authority over what gauntlets
 * do, silently diverging from the first the next time the definition is edited —
 * and the divergence would be invisible, because both files would look correct.
 *
 * So resolution READS the definition and never merges it in. `resolveItemInstance`
 * returns the two side by side, the definition object identical to the one in the
 * registry, and refuses outright when the definition is missing: an Item whose
 * rules cannot be found has no mechanics, and inventing defaults for it would
 * give a broken reference a working sword.
 *
 * ── OWNERSHIP IS NOT PLACEMENT, AND NEITHER IS THE FOLDER ───────────────
 *
 * `owner` is legal and narrative stewardship. `placement` is physical position.
 * They are independent, and the interesting cases are the ones where they
 * disagree: a borrowed knife, a confiscated weapon, a rod left at home.
 *
 * The directory is a third thing and is authority over nothing. An instance
 * stored under Gon's bundle means Gon is its long-term steward — the folder is a
 * filing decision — and it may still be owned by somebody else and lying at the
 * bottom of a lake. When the folder and the document disagree, the DOCUMENT is
 * right and the disagreement is worth reporting; nothing here rewrites a field
 * to match a path, and nothing infers an owner from one.
 *
 * ── WHY `containment` SITS ON THE INSTANCE ──────────────────────────────
 *
 * The full Item containment and capacity design is deliberately not settled here
 * — volumes, what fits, what a pack refuses — and this ticket is explicit that it
 * must not be expanded. So the foundation records exactly the two facts the
 * placement graph needs to walk a chain: whether this thing can hold others, and
 * whether it is currently closed.
 *
 * `sealed` is unambiguously instance state: one strongbox is locked and its twin
 * is not. `isContainer` is arguably a fact about the kind, and living here is the
 * narrow choice rather than the pure one — it avoids widening `ItemDefinition`
 * and committing to a capacity model before anyone has designed it. When that
 * design arrives it belongs on the definition, and this field becomes the
 * override it should have been.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
} from "../infrastructure/result";
import { createTraceNode } from "../infrastructure/trace";

import { findVaultEnvelopeIssues, type VaultDocumentEnvelope } from "./document";
import { findVaultReferenceIssues, type VaultReference } from "./references";
import {
  findItemPlacementIssues,
  type ContainerFacts,
  type ItemPlacement,
  type OwnerRef,
} from "./placement";


/**
 * The owner kinds this Vault supports, and why there is only one.
 *
 * A character owner resolves against a real, audited engine identity. An
 * organization owner would need an authoritative organization identity to
 * resolve against, and the repository has none — Axia's groups exist as prose
 * under `World/Axia/Groups/` with no id anything could validate.
 *
 * So `organization` is absent rather than accepted-and-unchecked. An owner kind
 * nothing can resolve is a field that always passes validation and never means
 * anything, which is worse than not having it: it would let a document claim an
 * owner that does not exist and be told it was fine.
 */
export const OWNER_KINDS = ["character"] as const;

export type OwnerKind = typeof OWNER_KINDS[number];


/** Whether this instance can hold other Items, and whether it is closed. */
export interface InstanceContainment {
  readonly sealed?: boolean;
}


export interface ItemInstanceDocument extends VaultDocumentEnvelope {
  readonly kind: "item-instance";

  /** Which kind of thing this is. Never inlined, always referenced. */
  readonly definition: VaultReference<"item-definition">;

  /**
   * Legal and narrative stewardship, if anybody's.
   *
   * ABSENT MEANS UNOWNED OR UNKNOWN, according to this document — it does not
   * mean "owned by whoever's folder this is in". A world Item lying in a ruin has
   * no owner, and that is a fact rather than a gap to fill from the path.
   */
  readonly owner?: OwnerRef;

  /**
   * Where it physically is.
   *
   * Absent is distinct from `{ "parent": "unplaced" }`. Absent is a document that
   * has not said; unplaced is a document asserting the Item is nowhere.
   */
  readonly placement?: ItemPlacement;

  readonly containment?: InstanceContainment;

  /** Free narrative about this particular object. Markdown is fine. */
  readonly notes?: string;
}


export function findItemInstanceIssues(
  candidate: unknown,
  path = "item-instance",
): readonly EngineError[] {
  const envelopeIssues = findVaultEnvelopeIssues(candidate, path);

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return envelopeIssues;
  }

  const errors: EngineError[] = [...envelopeIssues];
  const instance = candidate as Record<string, unknown>;

  if (instance.kind !== "item-instance") {
    errors.push({
      code: "vault.item-instance.kind.wrong",
      message: 'An Item instance document must declare kind "item-instance".',
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: "item-instance",
      actual: describeDiagnosticValue(instance.kind),
    });
  }

  errors.push(
    ...findVaultReferenceIssues(instance.definition, "item-definition", `${path}.definition`),
  );

  if (instance.owner !== undefined) errors.push(...findOwnerIssues(instance.owner, `${path}.owner`));

  /*
   * Absent placement is NOT validated as unplaced and NOT an error here. It is an
   * ordinary state for a document somebody has not finished, and the refusal
   * belongs where a caller actually asks where the Item is — see
   * resolveItemPlacement, which reports `unstated` distinctly.
   */
  if (instance.placement !== undefined) {
    errors.push(...findItemPlacementIssues(instance.placement, `${path}.placement`));
  }

  if (instance.containment !== undefined) {
    const containment = instance.containment;

    if (typeof containment !== "object" || containment === null || Array.isArray(containment)) {
      errors.push({
        code: "vault.item-instance.containment.malformed",
        message: "Containment must be an object.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.containment` },
        required: "{ sealed? }",
        actual: describeDiagnosticValue(containment),
      });
    } else {
      const sealed = (containment as Record<string, unknown>).sealed;

      if (sealed !== undefined && typeof sealed !== "boolean") {
        errors.push({
          code: "vault.item-instance.sealed.invalid",
          message: "Containment sealed must be true or false.",
          audience: "developer",
          subject: { kind: "field", id: `${path}.containment.sealed` },
          required: "boolean",
          actual: describeDiagnosticValue(sealed),
        });
      }
    }
  }

  if (instance.notes !== undefined && typeof instance.notes !== "string") {
    errors.push({
      code: "vault.item-instance.notes.invalid",
      message: "Instance notes must be a string.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.notes` },
      required: "string",
      actual: describeDiagnosticValue(instance.notes),
    });
  }

  return errors;
}


export function findOwnerIssues(candidate: unknown, path: string): readonly EngineError[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [{
      code: "vault.owner.malformed",
      message: "An owner must be an object naming a kind and an id.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: '{ kind: "character", id }',
      actual: describeDiagnosticValue(candidate),
    }];
  }

  const errors: EngineError[] = [];
  const owner = candidate as Record<string, unknown>;

  if (
    typeof owner.kind !== "string" ||
    !(OWNER_KINDS as readonly string[]).includes(owner.kind)
  ) {
    errors.push({
      code: "vault.owner.kind.unsupported",
      message:
        "The only supported owner kind is character. Organization ownership needs an authoritative organization identity, which does not exist yet.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: [...OWNER_KINDS],
      actual: describeDiagnosticValue(owner.kind),
    });
  }

  if (typeof owner.id !== "string" || owner.id.trim().length === 0) {
    errors.push({
      code: "vault.owner.id.invalid",
      message: "An owner must name a non-empty id.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.id` },
      required: "a non-empty id",
      actual: describeDiagnosticValue(owner.id),
    });
  }

  return errors;
}


/** The container facts the placement graph reads off an instance. */
export function containerFactsOf(instance: ItemInstanceDocument): ContainerFacts {
  return instance.containment === undefined
    ? { isContainer: false }
    : { isContainer: true, ...(instance.containment.sealed === undefined
        ? {}
        : { sealed: instance.containment.sealed }) };
}


/* -------------------------------------------------------------------------- */
/* Definition-plus-instance resolution                                        */
/* -------------------------------------------------------------------------- */

/**
 * An instance and its rules, side by side and unmerged.
 *
 * `definition` is the SAME object the registry holds, not a copy and not a
 * merge. A consumer reading `resolved.definition.equippedEffects` is reading the
 * one authority; a consumer reading `resolved.instance.owner` is reading the
 * other. Nothing in between has invented a third shape where a definition field
 * and an instance field sit in the same object and can no longer be told apart.
 */
export interface ResolvedItemInstance<TDefinition> {
  readonly instance: ItemInstanceDocument;
  readonly definition: TDefinition;
}


/**
 * Pair an instance with its definition, or refuse.
 *
 * Refusal is the whole point of the missing-definition branch. An Item whose
 * definition cannot be found has no rules at all — no effects, no integrity, no
 * attack surface — and resolving it to a bare instance would hand every consumer
 * downstream an object that looks resolvable and answers every mechanical
 * question with silence.
 */
export function resolveItemInstance<TDefinition>(
  instance: ItemInstanceDocument,
  lookupDefinition: (id: string) => TDefinition | undefined,
): EngineResult<ResolvedItemInstance<TDefinition>> {
  const trace = {
    root: createTraceNode({
      id: `item-instance.${instance.id}`,
      label: "Item instance resolution",
      inputs: {
        instanceId: { value: instance.id },
        definitionId: { value: instance.definition.id },
      },
    }),
  };

  const definition = lookupDefinition(instance.definition.id);

  if (definition === undefined) {
    return engineFailure(trace, [{
      code: "vault.item-instance.definition.missing",
      message:
        `Item instance "${instance.id}" references the definition "${instance.definition.id}", which is not registered.`,
      audience: "developer",
      subject: { kind: "item-instance", id: instance.id },
      required: "a registered Item definition",
      actual: instance.definition.id,
      resolution: "Add the definition to the Vault, or correct the reference.",
    }]);
  }

  return engineSuccess({ instance, definition }, trace);
}
