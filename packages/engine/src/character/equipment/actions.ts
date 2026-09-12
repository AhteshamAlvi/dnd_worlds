/*
 * Connecting equip, unequip and Item use to the neutral action pipeline.
 *
 * This is a declared SEAM, exactly as `character/actions/` and
 * `capabilities/applications.ts` are: it composes the neutral `actions/`,
 * `targeting/` and `spatial/` vocabularies so an Item operation can be
 * prepared, adjudicated and settled through them, and it is one of the few
 * files under `character/` architecture.test.ts permits to import upward at
 * all. Nothing else under `character/equipment/` may reach into those three
 * domains; `types.ts` imports only the `ItemUseApplication` TYPE from here,
 * which is erased at compile time and adds no runtime edge back into it.
 *
 *
 * WHAT AN ITEM OPERATION IS
 *
 * Equip, unequip and use are the three things a character can deliberately do
 * with one owned entry. All three become an `ActionIntent` against an
 * `ActionProfile`, so they get the same preparation, adjudication and
 * settlement machinery every other action gets — a GM can adjudicate an
 * equip attempt exactly as they would a Skill, and an Item use can threaten
 * declared targets, ask a check, and travel across Range.
 *
 * Equip and unequip get an ENGINE-OWNED DEFAULT application: putting a thing
 * on or taking it off is the same neutral shape for every Item — no targets,
 * no focus but "none", one Action, instantaneous — so nothing is authored for
 * it. A USE is different: drinking a potion and throwing a grenade are not
 * the same shape of attempt, so an Item that wants to be used through the
 * action pipeline declares its own `ItemUseApplication`.
 *
 *
 * WHAT PREPARATION DOES NOT COMMIT
 *
 * Preparing an Item operation calls the SAME pure resolvers `resolveItemUse()`
 * and `resolveEquipmentTransition()` already use, purely to turn their
 * disposition into eligibility findings. The `nextCharacter` they compute is
 * read for nothing and discarded — preparation proves the attempt IS possible
 * against the character as they stand right now, and nothing about that proof
 * survives to settlement. Settlement re-reads the character fresh from the
 * runtime draft and re-runs the same resolver again, which is what makes a
 * stale attempt (the entry moved, ran out, or the character lost a
 * requirement between preparation and settlement) fail at commit rather than
 * silently applying an answer that is no longer true. See runtime.ts.
 */

import {
  findActionProfileIssues,
  prepareAction,
  type ActionCheckProfile,
  type ActionFocus,
  type ActionFocusKind,
  type ActionPreparationInput,
  type ActionProfile,
  type ActionProposal,
  type ActionSourceRef,
  type ActionTiming,
  type ActorRef,
  type ActionSpatialInput,
  type EligibilityFinding,
  type ResolutionApproach,
  type StructuredActionCost,
  ONE_ACTION,
  type ExecutionContext,
  type ThreatDeclaration,
} from "../../actions";
import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import type { DistanceInterval, SpatialTravel } from "../../spatial";
import {
  findDistanceIntervalIssues,
  findTravelIssues,
} from "../../spatial";
import {
  NO_TARGETS,
  findTargetSpecificationIssues,
  type TargetSelection,
  type TargetSpecification,
} from "../../targeting";
import type { GameDuration, GameTimestamp } from "../../time/types";
import { isValidCheckScope } from "../../checks";

import type { ResolvedCharacter } from "../resolution";
import type { NamedRequirementResolution } from "../rules/resolution";
import type { Effect } from "../rules/effects";

import { resolveEquipmentTransition } from "./transitions";
import { resolveItemUse } from "./use";
import {
  findImplementRequirementListIssues,
  type ImplementRequirement,
} from "./implements";
import type { InventoryItemRef } from "./references";
import type { ItemEquipmentState } from "./state";
import type { ItemDefinition } from "./types";
import type { ItemDefinitionLookup } from "./validation";
import {
  itemOperationCostRequest,
  ITEM_OPERATION_COST,
} from "./runtime";


/* -------------------------------------------------------------------------- */
/* The USE action application                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How an active Item use is presented to the neutral action pipeline.
 *
 * Presentation only: timing, targets, focus, Range, the check, whether it
 * threatens what it targets. It never duplicates `useEffects`,
 * `useRequirements` or `consumesOnUse` on `ItemDefinition`, which stay the
 * single source of truth for what a use actually does — see `use.ts`.
 */
export interface ItemUseApplication {
  readonly allowedTimings: readonly ActionTiming[];
  readonly structuredActionCost: StructuredActionCost;
  readonly targets: TargetSpecification;
  readonly permittedFocusKinds?: readonly ActionFocusKind[];
  readonly range?: DistanceInterval;
  readonly executionDuration: GameDuration;
  readonly travel?: SpatialTravel;
  readonly check?: ActionCheckProfile;
  readonly threatens?: ThreatDeclaration;

  /**
   * Roles this use selects a concrete implement for — a bow's use naming an
   * "ammunition" role, say. Absent means the use names no implement roles of
   * its own; see implements.ts.
   */
  readonly implements?: readonly ImplementRequirement[];
}


export function findItemUseApplicationIssues(
  application: ItemUseApplication,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (application.allowedTimings.length === 0) {
    errors.push({
      code: "equipment.actions.use-application.timings.empty",
      message: "A use application with no allowed timings can never be attempted in structured time.",
      audience: "developer",
      required: "at least one allowed timing",
      actual: "empty list",
    });
  }

  if (
    !Number.isInteger(application.structuredActionCost.actions) ||
    application.structuredActionCost.actions < 0
  ) {
    errors.push({
      code: "equipment.actions.use-application.action-cost.invalid",
      message: "A use application's Action cost must be a non-negative whole number.",
      audience: "developer",
      required: "integer >= 0",
      actual: String(application.structuredActionCost.actions),
    });
  }

  errors.push(...findTargetSpecificationIssues(application.targets));

  if (application.range !== undefined) {
    errors.push(...findDistanceIntervalIssues(application.range));
  }

  if (
    !Number.isFinite(application.executionDuration) ||
    application.executionDuration < 0
  ) {
    errors.push({
      code: "equipment.actions.use-application.execution-duration.invalid",
      message: "A use application's execution duration must be a finite, non-negative game duration.",
      audience: "developer",
      required: "finite milliseconds >= 0",
      actual: String(application.executionDuration),
    });
  }

  if (application.travel !== undefined) {
    errors.push(...findTravelIssues(application.travel));
  }

  if (application.implements !== undefined) {
    errors.push(...findImplementRequirementListIssues(application.implements));
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* Performance contributions (Ticket 4.6)                                    */
/* -------------------------------------------------------------------------- */

/**
 * A typed attack fact an Item contributes when selected for a role.
 *
 * Presentation of facts, not a formula: `effects` is resolved through the
 * same `resolveRuleEffects()` every other Effect source uses (see
 * `contributions.ts`), and `check`/`range`/`travel`/`threatens` describe the
 * attempt in the same neutral vocabulary `ItemUseApplication` does. Nothing
 * here computes a hit, a margin or damage — that belongs to the combat/body
 * formula that consumes this fact, which this ticket does not build.
 */
export interface ItemAttackContribution {
  readonly effects?: readonly Effect[];
  readonly check?: ActionCheckProfile;
  readonly range?: DistanceInterval;
  readonly travel?: SpatialTravel;
  readonly threatens?: ThreatDeclaration;
}


/** A typed defense fact an Item contributes when selected for a role. */
export interface ItemDefenseContribution {
  readonly effects?: readonly Effect[];
  readonly range?: DistanceInterval;
}


/*
 * `effects` is deliberately NOT validated here. Every rule-bearing Item field
 * — possessed, equipped, used, and now attack/defense — is walked by
 * collectRuleBundles() and checked at the registration barrier, through the
 * same structural Effect validator every other source uses. Checking it again
 * here would be a second opinion about the same question, free to drift.
 */
export function findItemAttackContributionIssues(
  contribution: ItemAttackContribution,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (contribution.check !== undefined && !isValidCheckScope(contribution.check.scope)) {
    errors.push({
      code: "equipment.actions.attack-contribution.check.invalid",
      message: "An attack contribution's check must name a known check scope.",
      audience: "developer",
      required: "a valid CheckScope",
      actual: JSON.stringify(contribution.check.scope),
    });
  }

  if (contribution.range !== undefined) {
    errors.push(...findDistanceIntervalIssues(contribution.range));
  }

  if (contribution.travel !== undefined) {
    errors.push(...findTravelIssues(contribution.travel));
  }

  return errors;
}


export function findItemDefenseContributionIssues(
  contribution: ItemDefenseContribution,
): readonly EngineError[] {
  return contribution.range === undefined
    ? []
    : [...findDistanceIntervalIssues(contribution.range)];
}


/* -------------------------------------------------------------------------- */
/* Item operations                                                            */
/* -------------------------------------------------------------------------- */

export type ItemOperation = "equip" | "unequip" | "use";


/** One attempt at an Item operation, in the caller's own vocabulary. */
export interface ItemOperationIntentInput {
  readonly operation: ItemOperation;
  readonly item: InventoryItemRef;
  readonly actor: ActorRef;
  readonly declaredGoal?: string;
  readonly targets: TargetSelection;
  readonly focus: ActionFocus;
  readonly executionContext: ExecutionContext;

  /** Required for "equip" and "unequip"; ignored for "use". */
  readonly destination?: ItemEquipmentState;
}


function itemOperationProfileId(
  operation: ItemOperation,
  item: InventoryItemRef,
): string {
  /*
   * The operation AND the entryId, so two entries of one definition — and a
   * definition attempted two different ways — never share an identity.
   */
  return `item-operation:${operation}:${item.entryId}`;
}


const ITEM_TRANSITION_APPLICATION: {
  readonly allowedTimings: readonly ActionTiming[];
  readonly structuredActionCost: StructuredActionCost;
  readonly targets: TargetSpecification;
  readonly permittedFocusKinds: readonly ActionFocusKind[];
  readonly executionDuration: GameDuration;
  readonly threatens: ThreatDeclaration;
} = {
  /*
   * The engine-owned default. Equipping or unequipping is a deliberate act
   * that costs one Action and touches nobody but the actor — no target, no
   * aim, no Range, no check, no threat. A capability that wants any of those
   * for putting something on is describing a different mechanic (a Skill or
   * Technique that happens to equip something), not this one.
   */
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: NO_TARGETS },
  permittedFocusKinds: ["none"],
  executionDuration: 0,
  threatens: "none",
};


/**
 * The neutral ActionProfile for one Item operation.
 *
 * Equip and unequip always succeed in building one — the application is
 * engine-owned. A use fails here when the Item declares no
 * `useApplication`, or declares a structurally invalid one; that is a content
 * authoring gap, reported the same way a malformed authored Skill application
 * would be.
 */
export function buildItemOperationProfile(
  operation: ItemOperation,
  definition: ItemDefinition,
  item: InventoryItemRef,
): EngineResult<ActionProfile> {
  const id = itemOperationProfileId(operation, item);
  const source: ActionSourceRef = {
    type: "item",
    id: definition.id,
    instanceId: item.entryId,
  };

  const trace = {
    root: createTraceNode({
      id: "character.equipment.actions.profile",
      label: "Build Item operation profile",
      inputs: {
        operation: { value: operation },
        itemId: { value: definition.id },
        entryId: { value: item.entryId },
      },
      output: id,
    }),
  };

  if (operation !== "use") {
    const profile: ActionProfile = { id, source, ...ITEM_TRANSITION_APPLICATION };

    return engineSuccess(profile, trace);
  }

  const application = definition.useApplication;

  if (application === undefined) {
    return engineFailure(trace, [{
      code: "equipment.actions.use.application-missing",
      message:
        `Item "${definition.id}" declares no useApplication, so it cannot be ` +
        "attempted through the action pipeline.",
      audience: "developer",
      required: "ItemDefinition.useApplication",
      actual: "absent",
    }] as NonEmptyArray<EngineError>);
  }

  const issues = findItemUseApplicationIssues(application);

  if (issues.length > 0) {
    return engineFailure(trace, issues as NonEmptyArray<EngineError>);
  }

  const profile: ActionProfile = {
    id,
    source,
    allowedTimings: application.allowedTimings,
    structuredActionCost: application.structuredActionCost,
    targets: application.targets,
    ...(application.permittedFocusKinds === undefined
      ? {}
      : { permittedFocusKinds: application.permittedFocusKinds }),
    ...(application.range === undefined ? {} : { range: application.range }),
    executionDuration: application.executionDuration,
    ...(application.travel === undefined ? {} : { travel: application.travel }),
    ...(application.check === undefined ? {} : { check: application.check }),
    threatens: application.threatens ?? "none",
  };

  const profileIssues = findActionProfileIssues(profile);

  if (profileIssues.length > 0) {
    return engineFailure(trace, profileIssues as NonEmptyArray<EngineError>);
  }

  return engineSuccess(profile, trace);
}


/* -------------------------------------------------------------------------- */
/* Eligibility, by dry-running the pure resolvers                             */
/* -------------------------------------------------------------------------- */

function requirementFindings(
  resolutions: readonly NamedRequirementResolution[],
): readonly EligibilityFinding[] {
  return resolutions.map((resolution) => ({
    id: resolution.id,
    status: resolution.disposition,
    decidedBy: "character",
    ...(resolution.summary === undefined ? {} : { summary: resolution.summary }),
  }));
}


/**
 * Whether an Item operation is currently possible, without applying it.
 *
 * Calls the same pure resolver settlement will call again, and reads only its
 * `disposition` and `requirements` — `nextCharacter` is never touched. A
 * malformed reference, definition or requirement context is the resolver's
 * own EngineFailure and is returned as-is: that is a broken question, not an
 * eligibility answer.
 */
function evaluateItemOperationEligibility(
  resolved: ResolvedCharacter,
  intent: ItemOperationIntentInput,
  getItemDefinition: ItemDefinitionLookup,
): EngineResult<readonly EligibilityFinding[]> {
  if (intent.operation === "use") {
    const result = resolveItemUse({ resolved, item: intent.item }, getItemDefinition);

    if (!result.success) return result;

    const resolution = result.payload;

    switch (resolution.disposition) {
      case "executed":
        return engineSuccess(
          requirementFindings(resolution.requirements),
          result.trace,
        );

      case "not-usable":
        return engineSuccess([{
          id: "equipment.use.not-usable",
          status: "unsatisfied",
          decidedBy: "equipment",
          summary: "This Item declares nothing to use.",
        }], result.trace);

      case "quantity-unavailable":
        return engineSuccess([{
          id: "equipment.use.quantity",
          status: "unsatisfied",
          decidedBy: "equipment",
          summary: `Nothing left in this entry (quantity ${resolution.quantity}).`,
        }], result.trace);

      case "requirements-unsatisfied":
      case "requirements-unresolved":
        return engineSuccess(
          requirementFindings(resolution.requirements),
          result.trace,
        );
    }
  }

  if (intent.destination === undefined) {
    return engineFailure(
      {
        root: createTraceNode({
          id: "character.equipment.actions.eligibility",
          label: "Evaluate Item operation eligibility",
          output: "destination_missing",
        }),
      },
      [{
        code: "equipment.actions.destination.missing",
        message: `An "${intent.operation}" operation must declare a destination state.`,
        audience: "developer",
        required: "held, worn, or carried",
        actual: "absent",
      }] as NonEmptyArray<EngineError>,
    );
  }

  const result = resolveEquipmentTransition({
    resolved,
    item: intent.item,
    destination: intent.destination,
  }, getItemDefinition);

  if (!result.success) return result;

  const resolution = result.payload;

  switch (resolution.disposition) {
    case "available":
      return engineSuccess(
        requirementFindings(resolution.requirements),
        result.trace,
      );

    case "already-in-state":
      return engineSuccess([{
        id: "equipment.transition.already-in-state",
        status: "unsatisfied",
        decidedBy: "equipment",
        summary: `This entry is already ${resolution.state}.`,
      }], result.trace);

    case "not-concrete-object":
      return engineSuccess([{
        id: "equipment.transition.not-concrete-object",
        status: "unsatisfied",
        decidedBy: "equipment",
        summary:
          `Only a stack of exactly one may be held or worn (quantity ${resolution.quantity}).`,
      }], result.trace);

    case "requirements-unsatisfied":
    case "requirements-unresolved":
      return engineSuccess(
        requirementFindings(resolution.requirements),
        result.trace,
      );
  }
}


/* -------------------------------------------------------------------------- */
/* Preparation                                                                */
/* -------------------------------------------------------------------------- */

export interface ItemOperationPreparationInput {
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;

  /** The character as they stand right now. Read, never applied. */
  readonly resolved: ResolvedCharacter;

  readonly definition: ItemDefinition;
  readonly intent: ItemOperationIntentInput;
  readonly approach: ResolutionApproach;

  /**
   * How to resolve an itemId to its definition.
   *
   * The unbound resolvers ask for one rather than assuming a global catalog —
   * see resolveEquipmentTransition()/resolveItemUse(). A caller with the
   * engine's own catalog passes `getItemDefinition` from equipment/index.ts.
   */
  readonly getItemDefinition: ItemDefinitionLookup;

  readonly spatial?: ActionSpatialInput;
  readonly checkAdvantage?: number;
}


/**
 * Prepare one Item operation as a neutral ActionProposal.
 *
 * Validates the reference, the definition, the character as they stand right
 * now, the operation's requirements, and the intent against its profile —
 * and applies none of it. The single mandatory cost request this attaches
 * (`itemOperationCostRequest`) is what settlement re-validates and commits;
 * see runtime.ts.
 */
export function prepareItemOperation(
  input: ItemOperationPreparationInput,
): EngineResult<ActionProposal> {
  const { intent } = input;

  const profileResult = buildItemOperationProfile(
    intent.operation,
    input.definition,
    intent.item,
  );

  if (!profileResult.success) return profileResult;

  const profile = profileResult.payload;

  const eligibilityResult = evaluateItemOperationEligibility(
    input.resolved,
    intent,
    input.getItemDefinition,
  );

  if (!eligibilityResult.success) return eligibilityResult;

  const characterId = input.resolved.character.id;

  const costRequest = itemOperationCostRequest({
    requestId: `${input.operationId}:${ITEM_OPERATION_COST}:${intent.item.entryId}`,
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: { domain: "character", id: characterId },
    to: { domain: "character", id: characterId },
    operation: intent.operation,
    item: intent.item,
    ...(intent.destination === undefined ? {} : { destination: intent.destination }),
  });

  const preparationInput: ActionPreparationInput = {
    operationId: input.operationId,
    profile,
    intent: {
      id: `${input.operationId}:${itemOperationProfileId(intent.operation, intent.item)}`,
      profileId: profile.id,
      actor: intent.actor,
      ...(intent.declaredGoal === undefined ? {} : { declaredGoal: intent.declaredGoal }),
      targets: intent.targets,
      focus: intent.focus,
      executionContext: intent.executionContext,
    },
    approach: input.approach,
    eligibility: eligibilityResult.payload,
    costRequests: [costRequest],
    ...(input.spatial === undefined ? {} : { spatial: input.spatial }),
    ...(input.checkAdvantage === undefined ? {} : { checkAdvantage: input.checkAdvantage }),
  };

  return prepareAction(preparationInput);
}
