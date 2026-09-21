/*
 * Where a thing is, derived rather than stored.
 *
 * An Item instance records ONE fact about its position: its direct parent. A
 * sword records that it is in a scabbard. The scabbard records that it is on a
 * belt. The belt records that it is worn by Gon. Nothing records where the sword
 * is, because the sword's location is not a fact about the sword — it is the
 * answer to a walk, and it changes when Gon walks without anything about the
 * sword changing at all.
 *
 * The alternative is to copy the location onto every descendant, and it fails
 * the first time somebody moves the belt. Three documents then disagree about
 * where one sword is, all three are equally authoritative, and there is no way
 * to tell which one is stale. So the rule is absolute: a location is written on
 * exactly the node that is directly at it, and every descendant resolves.
 *
 * ── FOUR PARENTS, EXACTLY ONE OF THEM ───────────────────────────────────
 *
 * character   held or worn. Direct physical engagement by a person.
 * container   inside another Item instance.
 * location    directly at a place in the world.
 * unplaced    deliberately nowhere — destroyed, not yet introduced, abstract.
 *
 * Two parents is not a richer placement, it is a contradiction: an Item held by
 * Gon *and* at the docks has two answers to one question and no way to pick.
 * So the discriminant is checked strictly — a placement carrying a field
 * belonging to a different parent is refused rather than having the extra
 * quietly ignored, because ignoring it means the document says something the
 * engine does not read.
 *
 * ── WHY SHEATHED IS NOT AN ENGAGEMENT ───────────────────────────────────
 *
 * Direct character engagement is `held` and `worn` and will stay two values.
 * Sheathed, pocketed, packed and quivered are all the same fact — the Item is
 * inside a container that the character is engaging — and each of them added as
 * an engagement kind would be a second way to say something containment already
 * says, immediately disagreeing with it about whether a sheathed sword is in
 * your hand.
 *
 * A sheathed sword is: sword → scabbard (container) → belt (container) → worn.
 * Every question about it — is it on him, can he reach it, where is it — falls
 * out of that chain, and drawing it is one placement change rather than a
 * transition between two engagement enums.
 *
 * ── WHAT THIS FILE DOES NOT OWN ─────────────────────────────────────────
 *
 * Exact world coordinates. A `locationId` names a place the HOST knows about;
 * the engine owns custody and containment and has no opinion about metres. When
 * the host cannot say where a character is, the answer is `unavailable` — not
 * "nowhere", and emphatically not a guess. A missing fact and a known absence
 * are different, and a system that conflates them reports a sword as lost when
 * the truth is that nobody asked the map.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode } from "../infrastructure/trace";


/*
 * Plain string aliases, for the reason CharacterId is one: these cross JSON
 * files, index entries and host props at every edge, and branding them would
 * buy an unwrap at each of them.
 */
export type ItemInstanceId = string;
export type PlacementCharacterId = string;
export type LocationId = string;


/**
 * The two ways a character directly engages an object.
 *
 * Deliberately the same two words the equipment runtime already uses for
 * equipped states, because they mean the same thing. `carried` is absent: an
 * Item a character has but is not holding or wearing is in something — a pack,
 * a pocket, a belt — and that is containment.
 */
export const ITEM_ENGAGEMENT_KINDS = ["held", "worn"] as const;

export type ItemEngagementKind = typeof ITEM_ENGAGEMENT_KINDS[number];

export function isItemEngagementKind(value: unknown): value is ItemEngagementKind {
  return typeof value === "string" &&
    (ITEM_ENGAGEMENT_KINDS as readonly string[]).includes(value);
}


export type ItemPlacement =
  | {
      readonly parent: "character";
      readonly characterId: PlacementCharacterId;
      readonly engagement: ItemEngagementKind;
    }
  | { readonly parent: "container"; readonly containerId: ItemInstanceId }
  | { readonly parent: "location"; readonly locationId: LocationId }
  | { readonly parent: "unplaced" };


export const PLACEMENT_PARENTS = ["character", "container", "location", "unplaced"] as const;

/*
 * Exactly the fields each parent may carry. Used to refuse a placement that
 * names two parents' worth of fields — which is the whole mechanism preventing
 * `{ parent: "character", characterId: "gon", locationId: "docks" }` from being
 * read as "held by Gon" with a silently discarded second answer.
 */
const PLACEMENT_FIELDS: Readonly<Record<ItemPlacement["parent"], readonly string[]>> = {
  character: ["parent", "characterId", "engagement"],
  container: ["parent", "containerId"],
  location: ["parent", "locationId"],
  unplaced: ["parent"],
};

const FIELD_OWNERS: Readonly<Record<string, ItemPlacement["parent"]>> = {
  characterId: "character",
  engagement: "character",
  containerId: "container",
  locationId: "location",
};


export function findItemPlacementIssues(
  candidate: unknown,
  path = "placement",
): readonly EngineError[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [{
      code: "vault.placement.malformed",
      message: "A placement must be an object naming exactly one parent.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: [...PLACEMENT_PARENTS],
      actual: describeDiagnosticValue(candidate),
    }];
  }

  const placement = candidate as Record<string, unknown>;
  const parent = placement.parent;

  if (
    typeof parent !== "string" ||
    !(PLACEMENT_PARENTS as readonly string[]).includes(parent)
  ) {
    return [{
      code: "vault.placement.parent.unknown",
      message: "A placement must name one of the four parents.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.parent` },
      required: [...PLACEMENT_PARENTS],
      actual: describeDiagnosticValue(parent),
    }];
  }

  const errors: EngineError[] = [];
  const allowed = PLACEMENT_FIELDS[parent as ItemPlacement["parent"]];

  /*
   * Every field that does not belong to this parent, reported as the conflict it
   * is when it belongs to a DIFFERENT parent. "You have named two parents" is a
   * far more useful message than "unexpected property", and it is the case that
   * actually happens: somebody edits a placement from container to location and
   * leaves the old field behind.
   */
  for (const key of Object.keys(placement)) {
    if (allowed.includes(key)) continue;

    const owner = FIELD_OWNERS[key];

    errors.push(
      owner === undefined
        ? {
            code: "vault.placement.field.unexpected",
            message: `A ${parent} placement has no "${key}" field.`,
            audience: "developer",
            subject: { kind: "field", id: `${path}.${key}` },
            required: allowed.join(", "),
            actual: key,
          }
        : {
            code: "vault.placement.parent.conflict",
            message:
              `This placement names two parents: "${parent}" and "${owner}" (via "${key}"). An Item has exactly one.`,
            audience: "developer",
            subject: { kind: "field", id: `${path}.${key}` },
            required: "exactly one parent",
            actual: [parent, owner],
          },
    );
  }

  const requireId = (field: string): void => {
    const value = placement[field];

    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({
        code: "vault.placement.id.invalid",
        message: `A ${parent} placement needs a non-empty "${field}".`,
        audience: "developer",
        subject: { kind: "field", id: `${path}.${field}` },
        required: "a non-empty id",
        actual: describeDiagnosticValue(value),
      });
    }
  };

  switch (parent) {
    case "character":
      requireId("characterId");

      if (!isItemEngagementKind(placement.engagement)) {
        errors.push({
          code: "vault.placement.engagement.unknown",
          message:
            "A character placement must say held or worn. Sheathed, pocketed and packed are containment.",
          audience: "developer",
          subject: { kind: "field", id: `${path}.engagement` },
          required: [...ITEM_ENGAGEMENT_KINDS],
          actual: describeDiagnosticValue(placement.engagement),
        });
      }
      break;

    case "container":
      requireId("containerId");
      break;

    case "location":
      requireId("locationId");
      break;

    case "unplaced":
      break;
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* What the world can be asked                                                */
/* -------------------------------------------------------------------------- */

/**
 * A placement lookup's three answers, which are three different situations.
 *
 * `unstated` is an Item instance that exists and says nothing about where it is.
 * That is NOT the same as `{ parent: "unplaced" }`, which is a deliberate claim
 * that the Item is nowhere. One is an unanswered question and the other is an
 * answer, and treating the first as the second turns every half-finished
 * document into a confident assertion that its Item does not exist anywhere.
 */
export type PlacementLookup =
  | { readonly status: "stated"; readonly placement: ItemPlacement }
  | { readonly status: "unstated" }
  | { readonly status: "unknown-item" };


/** What a container instance is, as the graph needs to know it. */
export interface ContainerFacts {
  readonly isContainer: boolean;

  /**
   * Whether the container is currently closed against reaching into it.
   *
   * Affects accessibility only, never possession or location. A locked strongbox
   * in your pack is unquestionably yours and unquestionably where you are; you
   * simply cannot get at what is inside it.
   */
  readonly sealed?: boolean;
}


/** Where the host says a character is. */
export type LocationFact =
  | { readonly status: "known"; readonly locationId: LocationId }
  | { readonly status: "unknown" };


/**
 * Everything the graph asks of the world, and nothing more.
 *
 * An interface rather than a document set, so a test proving cycle detection can
 * state four placements instead of building four valid Item instance documents,
 * and so the engine never learns how any of this was loaded.
 */
export interface PlacementWorld {
  readonly placementOf: (itemInstanceId: ItemInstanceId) => PlacementLookup;
  readonly containerFactsOf: (itemInstanceId: ItemInstanceId) => ContainerFacts | undefined;
  readonly locationOfCharacter: (characterId: PlacementCharacterId) => LocationFact;
}


/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

export type PlacementRoot =
  | {
      readonly kind: "character";
      readonly characterId: PlacementCharacterId;
      readonly engagement: ItemEngagementKind;
    }
  | { readonly kind: "location"; readonly locationId: LocationId }
  | { readonly kind: "unplaced" };


export type EffectiveLocation =
  | { readonly status: "at"; readonly locationId: LocationId }
  | { readonly status: "unplaced" }
  | { readonly status: "unavailable"; readonly reason: "character-location-unknown" };


export interface ResolvedPlacement {
  readonly itemInstanceId: ItemInstanceId;

  /**
   * The container instances between this Item and its root, nearest first.
   *
   * Empty when the Item is placed directly. This is the evidence for every
   * derived answer below, which is why it is returned rather than consumed
   * internally: a host showing "in scabbard, on belt" has the chain already.
   */
  readonly containerAncestry: readonly ItemInstanceId[];

  readonly root: PlacementRoot;

  /** The character engaging the root, when the root is a character. */
  readonly holder?: PlacementCharacterId;

  readonly effectiveLocation: EffectiveLocation;

  /**
   * Whether every container in the chain is open.
   *
   * Recorded here rather than recomputed by each consumer, because "can you
   * reach it" is asked by accessibility, by equipment and by any UI listing an
   * inventory, and three walks of the same chain are three chances to disagree.
   */
  readonly reachableThroughContainers: boolean;
}


/*
 * A hard ceiling on the walk, independent of cycle detection.
 *
 * Cycle detection already terminates every closed loop, so this exists for the
 * other shape: a pathologically deep chain, hand-written or generated, that
 * would resolve correctly but spend a long time doing it inside a synchronous
 * engine call. Refusing at a depth no real container nest approaches is cheaper
 * than being unbounded.
 */
const MAX_CONTAINER_DEPTH = 64;


/**
 * Walk an Item's ancestry to its root and derive where it effectively is.
 *
 * Every failure is an `EngineFailure` with its own code, because they are
 * genuinely different problems: a missing parent is a broken document, a
 * wrong-kind parent is an Item placed inside something that is not a container,
 * and a cycle is two documents each claiming to hold the other. A caller that
 * could not tell them apart could not act on any of them.
 */
export function resolveItemPlacement(
  itemInstanceId: ItemInstanceId,
  world: PlacementWorld,
): EngineResult<ResolvedPlacement> {
  const trace = {
    root: createTraceNode({
      id: `placement.${itemInstanceId}`,
      label: "Effective placement",
      inputs: { itemInstanceId: { value: itemInstanceId } },
    }),
  };

  const fail = (...errors: NonEmptyArray<EngineError>): EngineResult<ResolvedPlacement> =>
    engineFailure(trace, errors);

  const containerAncestry: ItemInstanceId[] = [];
  const seen = new Set<ItemInstanceId>([itemInstanceId]);
  let sealedSomewhere = false;
  let current = itemInstanceId;

  for (;;) {
    const lookup = world.placementOf(current);

    if (lookup.status === "unknown-item") {
      return fail({
        code: current === itemInstanceId
          ? "vault.placement.item.unknown"
          : "vault.placement.parent.missing",
        message: current === itemInstanceId
          ? `No Item instance "${current}" exists in this Vault.`
          : `Item "${itemInstanceId}" is inside "${current}", which does not exist.`,
        audience: "developer",
        subject: { kind: "item-instance", id: current },
        required: "an Item instance present in the Vault",
        actual: current,
      });
    }

    if (lookup.status === "unstated") {
      return fail({
        code: "vault.placement.unstated",
        message: current === itemInstanceId
          ? `Item "${current}" does not state where it is.`
          : `Item "${itemInstanceId}" is inside "${current}", which does not state where IT is.`,
        audience: "developer",
        subject: { kind: "item-instance", id: current },
        required: 'a placement, or an explicit { "parent": "unplaced" }',
        actual: null,
      });
    }

    const placement = lookup.placement;

    if (placement.parent === "container") {
      const parentId = placement.containerId;

      /*
       * Cycle detection before anything else about the parent, so that a
       * two-node loop is reported as a cycle rather than as whichever of its
       * members the walk happened to reach twice first. Self-containment is the
       * one-node case and needs no separate branch.
       */
      if (seen.has(parentId)) {
        return fail({
          code: "vault.placement.cycle",
          message: `Containment cycle: ${[...seen, parentId].join(" -> ")}.`,
          audience: "developer",
          subject: { kind: "item-instance", id: itemInstanceId },
          required: "an acyclic containment chain",
          actual: [...seen, parentId],
        });
      }

      const facts = world.containerFactsOf(parentId);

      if (facts === undefined) {
        return fail({
          code: "vault.placement.parent.missing",
          message: `Item "${itemInstanceId}" is inside "${parentId}", which does not exist.`,
          audience: "developer",
          subject: { kind: "item-instance", id: parentId },
          required: "an Item instance present in the Vault",
          actual: parentId,
        });
      }

      if (!facts.isContainer) {
        return fail({
          code: "vault.placement.parent.wrong-kind",
          message: `Item "${itemInstanceId}" is inside "${parentId}", which is not a container.`,
          audience: "developer",
          subject: { kind: "item-instance", id: parentId },
          required: "a container",
          actual: parentId,
        });
      }

      if (facts.sealed === true) sealedSomewhere = true;

      containerAncestry.push(parentId);
      seen.add(parentId);
      current = parentId;

      if (containerAncestry.length > MAX_CONTAINER_DEPTH) {
        return fail({
          code: "vault.placement.too-deep",
          message: `Containment chain from "${itemInstanceId}" exceeds ${MAX_CONTAINER_DEPTH} containers.`,
          audience: "developer",
          subject: { kind: "item-instance", id: itemInstanceId },
          required: `at most ${MAX_CONTAINER_DEPTH} containers`,
          actual: containerAncestry.length,
        });
      }

      continue;
    }

    const root: PlacementRoot = placement.parent === "character"
      ? {
          kind: "character",
          characterId: placement.characterId,
          engagement: placement.engagement,
        }
      : placement.parent === "location"
      ? { kind: "location", locationId: placement.locationId }
      : { kind: "unplaced" };

    return engineSuccess(
      {
        itemInstanceId,
        containerAncestry,
        root,
        ...(root.kind === "character" ? { holder: root.characterId } : {}),
        effectiveLocation: effectiveLocationOf(root, world),
        reachableThroughContainers: !sealedSomewhere,
      },
      trace,
    );
  }
}


function effectiveLocationOf(
  root: PlacementRoot,
  world: PlacementWorld,
): EffectiveLocation {
  switch (root.kind) {
    case "location":
      return { status: "at", locationId: root.locationId };

    case "unplaced":
      return { status: "unplaced" };

    case "character": {
      /*
       * The one place the engine defers to the host. Custody is the engine's;
       * where a person is standing is the map's, and when the map has not been
       * asked the honest answer is "unavailable" rather than a location the
       * engine made up or a `null` a caller will read as "nowhere".
       */
      const fact = world.locationOfCharacter(root.characterId);

      return fact.status === "known"
        ? { status: "at", locationId: fact.locationId }
        : { status: "unavailable", reason: "character-location-unknown" };
    }
  }
}


/* -------------------------------------------------------------------------- */
/* Possession and accessibility                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether a character physically has an Item, as opposed to owning it.
 *
 * These come apart constantly and the difference matters: Gon's fishing rod left
 * at home is his and is not on him, and a system that equated the two would
 * either let him fish from a different island or stop calling the rod his the
 * moment he put it down.
 *
 * Possession is custody: the Item's root is this character, directly or through
 * any depth of containers they are engaging. Ownership is a field on the
 * document and is not consulted here at all.
 */
export function isPossessedBy(
  resolved: ResolvedPlacement,
  characterId: PlacementCharacterId,
): boolean {
  return resolved.root.kind === "character" && resolved.root.characterId === characterId;
}


/**
 * Whether a character can get at an Item right now.
 *
 * Possession plus an unobstructed chain. Strictly narrower than possession,
 * never wider: an Item you cannot reach may still be yours and still be on you.
 */
export function isAccessibleTo(
  resolved: ResolvedPlacement,
  characterId: PlacementCharacterId,
): boolean {
  return isPossessedBy(resolved, characterId) && resolved.reachableThroughContainers;
}


/* -------------------------------------------------------------------------- */
/* Transfer                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The two kinds of handover, which differ in exactly one respect.
 *
 * A TEMPORARY SEPARATION moves an Item without changing whose it is. Lending a
 * knife, dropping a pack, being disarmed, leaving a rod at home: placement
 * changes, ownership does not, and the Item's storage home does not either.
 *
 * A PERMANENT STEWARDSHIP TRANSFER changes whose it is. The file may move to
 * another bundle to reflect that, and the Item's id does not change when it
 * does — a gift is the same object under new management, not a new object.
 */
export const TRANSFER_KINDS = ["temporary-separation", "permanent-stewardship"] as const;

export type TransferKind = typeof TRANSFER_KINDS[number];


/** Who owns an Item: a stable reference, or nobody. */
export interface OwnerRef {
  readonly kind: "character";
  readonly id: PlacementCharacterId;
}


export interface TransferRequest {
  readonly itemInstanceId: ItemInstanceId;
  readonly kind: TransferKind;

  readonly fromPlacement: ItemPlacement;
  readonly toPlacement: ItemPlacement;

  readonly fromOwner?: OwnerRef;

  /** Required for a permanent transfer, refused for a temporary separation. */
  readonly toOwner?: OwnerRef;
}


export interface PlannedTransfer {
  /** Unchanged, always. Stated in the result so a test can assert it. */
  readonly itemInstanceId: ItemInstanceId;

  readonly placement: ItemPlacement;
  readonly owner?: OwnerRef;

  readonly ownerChanged: boolean;
  readonly placementChanged: boolean;
}


function sameOwner(left: OwnerRef | undefined, right: OwnerRef | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;

  return left.kind === right.kind && left.id === right.id;
}


function samePlacement(left: ItemPlacement, right: ItemPlacement): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}


/**
 * Whether a transfer is legitimate, and what the Item looks like afterwards.
 *
 * Validation only: nothing is written, no file moves, and the caller applies the
 * plan. That separation is what makes the multi-document case atomic at this
 * level — a transfer touching an Item, a giver and a receiver is refused or
 * approved as one answer here, so filesystem orchestration never finds itself
 * halfway through and holding two authoritative copies of one Item.
 */
export function validateTransfer(
  request: TransferRequest,
  world: PlacementWorld,
): EngineResult<PlannedTransfer> {
  const trace = {
    root: createTraceNode({
      id: `placement.transfer.${request.itemInstanceId}`,
      label: "Transfer validation",
      inputs: {
        itemInstanceId: { value: request.itemInstanceId },
        kind: { value: request.kind },
      },
    }),
  };

  const errors: EngineError[] = [
    ...findItemPlacementIssues(request.toPlacement, "toPlacement"),
  ];

  if (!(TRANSFER_KINDS as readonly string[]).includes(request.kind)) {
    errors.push({
      code: "vault.transfer.kind.unknown",
      message: "A transfer must be a temporary separation or a permanent stewardship transfer.",
      audience: "developer",
      subject: { kind: "item-instance", id: request.itemInstanceId },
      required: [...TRANSFER_KINDS],
      actual: describeDiagnosticValue(request.kind),
    });
  }

  if (request.kind === "temporary-separation" && request.toOwner !== undefined) {
    /*
     * The rule that keeps "lend" from meaning "give". Refused rather than
     * ignored: a caller that supplied a new owner meant to change ownership, and
     * silently dropping that intention while reporting success is how a borrowed
     * sword becomes the borrower's without anybody deciding it should.
     */
    if (!sameOwner(request.fromOwner, request.toOwner)) {
      errors.push({
        code: "vault.transfer.temporary.owner-changed",
        message:
          "A temporary separation moves an Item without changing its owner. Use a permanent stewardship transfer to change owner.",
        audience: "developer",
        subject: { kind: "item-instance", id: request.itemInstanceId },
        required: "the same owner",
        actual: request.toOwner.id,
      });
    }
  }

  if (request.kind === "permanent-stewardship" && request.toOwner === undefined) {
    errors.push({
      code: "vault.transfer.permanent.owner-missing",
      message: "A permanent stewardship transfer must name the new owner.",
      audience: "developer",
      subject: { kind: "item-instance", id: request.itemInstanceId },
      required: "a new owner",
      actual: null,
    });
  }

  /*
   * An Item may not be placed inside itself or inside anything it already
   * contains. Checked by resolving the DESTINATION container's ancestry and
   * looking for this Item in it, which catches the whole family — self-nesting,
   * the two-node swap, and the deep loop — with one question.
   */
  if (request.toPlacement.parent === "container") {
    const destination = request.toPlacement.containerId;

    if (destination === request.itemInstanceId) {
      errors.push({
        code: "vault.transfer.self-containment",
        message: `Item "${request.itemInstanceId}" cannot be placed inside itself.`,
        audience: "developer",
        subject: { kind: "item-instance", id: request.itemInstanceId },
        required: "a different container",
        actual: destination,
      });
    } else {
      const destinationPlacement = resolveItemPlacement(destination, world);

      if (
        destinationPlacement.success &&
        destinationPlacement.payload.containerAncestry.includes(request.itemInstanceId)
      ) {
        errors.push({
          code: "vault.transfer.cycle",
          message:
            `Placing "${request.itemInstanceId}" inside "${destination}" would create a containment cycle.`,
          audience: "developer",
          subject: { kind: "item-instance", id: request.itemInstanceId },
          required: "an acyclic containment chain",
          actual: [request.itemInstanceId, ...destinationPlacement.payload.containerAncestry],
        });
      }
    }
  }

  const [first, ...rest] = errors;

  if (first !== undefined) return engineFailure(trace, [first, ...rest]);

  const owner = request.kind === "permanent-stewardship" ? request.toOwner : request.fromOwner;

  return engineSuccess(
    {
      itemInstanceId: request.itemInstanceId,
      placement: request.toPlacement,
      ...(owner === undefined ? {} : { owner }),
      ownerChanged: !sameOwner(request.fromOwner, owner),
      placementChanged: !samePlacement(request.fromPlacement, request.toPlacement),
    },
    trace,
  );
}
