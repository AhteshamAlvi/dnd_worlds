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
  ACTION_FOCUS_KINDS,
  THREAT_DECLARATIONS,
  findActionProfileIssues,
  findAllowedTimingsIssues,
  isActionFocusKind,
  isThreatDeclaration,
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
import { findEffectsValidationIssues } from "../rules/validation";

import { resolveEquipmentTransition } from "./transitions";
import { resolveItemUse } from "./use";
import {
  findImplementRequirementsIssues,
  type ImplementRequirement,
} from "./implements";
import {
  describeInventoryReferenceIssue,
  resolveInventoryItemRef,
  type InventoryItemRef,
} from "./references";
import type { ItemEquipmentState } from "./state";
import type { ItemDefinition } from "./types";
import {
  ITEM_DEFINITION_OUTCOME_CODES,
  describeItemDefinitionOutcome,
  findItemStructuralIssues,
  resolveItemDefinition,
  type ItemDefinitionLookup,
} from "./validation";
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


function surfaceError(
  code: string,
  message: string,
  required: NonNullable<EngineError["required"]>,
  actual: unknown,
): EngineError {
  return {
    code,
    message,
    audience: "developer",
    required,
    actual: typeof actual === "string" ? actual : String(actual),
  };
}


/**
 * Everything wrong with one Item's use application.
 *
 * Takes `unknown` and proves every compound field before reading it. It used
 * to take a typed `ItemUseApplication` on nothing but the caller's word, and
 * a host's `useApplication: 42` reached `application.allowedTimings.length`
 * and threw — out of the validator whose job was to report it. The same held
 * one level in: `structuredActionCost` was dereferenced unchecked, and
 * `targets` went straight to the neutral target validator, which had every
 * right to assume a specification.
 */
export function findItemUseApplicationIssues(
  value: unknown,
): readonly EngineError[] {
  if (!isRecord(value)) {
    return [surfaceError(
      "equipment.actions.use-application.invalid",
      "A use application must be an object.",
      "an ItemUseApplication object",
      value,
    )];
  }

  const application = value as Partial<Record<keyof ItemUseApplication, unknown>>;
  const errors: EngineError[] = [];

  const timings = application.allowedTimings;

  if (!Array.isArray(timings) || timings.length === 0) {
    errors.push(surfaceError(
      "equipment.actions.use-application.timings.empty",
      "A use application with no allowed timings can never be attempted in structured time.",
      "at least one allowed timing",
      Array.isArray(timings) ? "empty list" : timings,
    ));
  } else {
    /*
     * The CONTENTS, through the neutral validator every other consumer of the
     * timing vocabulary already uses. Proving the field is an array and
     * stopping there accepted `["acton"]` and `["action", "action"]` — a typo
     * that matches no timing and a repeat that says nothing the first entry
     * did — which is exactly the silent-typo failure every closed vocabulary
     * in this engine is guarded against.
     */
    errors.push(
      ...findAllowedTimingsIssues(timings as readonly ActionTiming[]),
    );
  }

  const cost = application.structuredActionCost;

  if (!isRecord(cost)) {
    errors.push(surfaceError(
      "equipment.actions.use-application.action-cost.missing",
      "A use application must declare a structured Action cost.",
      "a StructuredActionCost object",
      cost,
    ));
  } else if (
    !Number.isInteger(cost["actions"]) ||
    (cost["actions"] as number) < 0
  ) {
    errors.push(surfaceError(
      "equipment.actions.use-application.action-cost.invalid",
      "A use application's Action cost must be a non-negative whole number.",
      "integer >= 0",
      cost["actions"],
    ));
  }

  /*
   * The neutral validators below are entitled to their own typed inputs — they
   * are shared with every other consumer of those vocabularies and must not
   * grow a second guard each. So the SHAPE is proved here and the CONTENT is
   * proved there, which is the same division the selector boundary settled on.
   */
  if (!isRecord(application.targets)) {
    errors.push(surfaceError(
      "equipment.actions.use-application.targets.missing",
      "A use application must declare a target specification.",
      "a TargetSpecification object",
      application.targets,
    ));
  } else {
    errors.push(
      ...findTargetSpecificationIssues(application.targets as unknown as TargetSpecification),
    );
  }

  if (application.permittedFocusKinds !== undefined) {
    const kinds = application.permittedFocusKinds;

    if (!Array.isArray(kinds) || kinds.length === 0) {
      errors.push(surfaceError(
        "equipment.actions.use-application.focus-kinds.empty",
        "A use application's permitted focus kinds must be a non-empty list, or omitted.",
        "one or more focus kinds, or omit the field",
        Array.isArray(kinds) ? "empty list" : kinds,
      ));
    } else {
      const seen = new Set<string>();

      for (const kind of kinds as readonly unknown[]) {
        if (!isActionFocusKind(kind)) {
          errors.push(surfaceError(
            "equipment.actions.use-application.focus-kinds.invalid",
            "A use application names an unknown focus kind.",
            [...ACTION_FOCUS_KINDS],
            kind,
          ));

          continue;
        }

        if (seen.has(kind)) {
          errors.push(surfaceError(
            "equipment.actions.use-application.focus-kinds.duplicate",
            `A use application permits the "${kind}" focus kind more than once.`,
            "each focus kind permitted once",
            kind,
          ));

          continue;
        }

        seen.add(kind);
      }
    }
  }

  if (application.range !== undefined) {
    if (!isRecord(application.range)) {
      errors.push(surfaceError(
        "equipment.actions.use-application.range.invalid",
        "A use application's Range must be a distance interval.",
        "a DistanceInterval object, or omit the field",
        application.range,
      ));
    } else {
      errors.push(
        ...findDistanceIntervalIssues(application.range as unknown as DistanceInterval),
      );
    }
  }

  if (
    typeof application.executionDuration !== "number" ||
    !Number.isFinite(application.executionDuration) ||
    application.executionDuration < 0
  ) {
    errors.push(surfaceError(
      "equipment.actions.use-application.execution-duration.invalid",
      "A use application's execution duration must be a finite, non-negative game duration.",
      "finite milliseconds >= 0",
      application.executionDuration,
    ));
  }

  if (application.travel !== undefined) {
    if (!isRecord(application.travel)) {
      errors.push(surfaceError(
        "equipment.actions.use-application.travel.invalid",
        "A use application's travel must be a spatial travel object.",
        "a SpatialTravel object, or omit the field",
        application.travel,
      ));
    } else {
      errors.push(...findTravelIssues(application.travel as unknown as SpatialTravel));
    }
  }

  if (application.check !== undefined) {
    if (!isRecord(application.check)) {
      errors.push(surfaceError(
        "equipment.actions.use-application.check.invalid",
        "A use application's check must be an action check profile.",
        "an ActionCheckProfile object, or omit the field",
        application.check,
      ));
    } else if (!isValidCheckScope((application.check as unknown as unknown as ActionCheckProfile).scope)) {
      errors.push(surfaceError(
        "equipment.actions.use-application.check.scope.invalid",
        "A use application's check must name a known check scope.",
        "a valid CheckScope",
        JSON.stringify((application.check as unknown as unknown as ActionCheckProfile).scope),
      ));
    }
  }

  errors.push(...findImplementRequirementsIssues(application.implements));

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
 * WHERE A CONTRIBUTION'S NESTED EFFECTS ARE CHECKED, AND WHY IT IS TWICE-SHAPED
 *
 * `attack.effects` and `defense.effects` are walked by `collectRuleBundles()`
 * and checked at the registration barrier through the same structural Effect
 * validator every other source uses. That covered REGISTRATION and nothing
 * else: `resolveItemPerformanceContribution()` asks these validators directly,
 * against a definition a host's own lookup supplied, and they proved only that
 * `effects` was a list before handing its contents to `resolveRuleEffects()` —
 * whose switch ends in a deliberate `never` guard. A malformed Effect reaching
 * it does not return a failure. It throws.
 *
 * So the complete validators below DO check nested Effects, and the composer
 * the registry is handed (`findItemActionSurfaceIssues`) deliberately does
 * not: at registration `findContentStructuralIssues` has already walked the
 * same list, and reporting one fault twice under two vocabularies is the
 * double-answer this file's neighbours are careful to avoid. Two callers, one
 * rule, each asking the half nobody else asked.
 */
function findItemContributionEffectIssues(
  where: "attack" | "defense",
  effects: unknown,
): readonly EngineError[] {
  if (effects === undefined || !Array.isArray(effects)) return [];

  return findEffectsValidationIssues(effects, "effects").map((issue) =>
    surfaceError(
      `equipment.actions.${where}-contribution.effects.${issue.type}`,
      `${where === "attack" ? "An attack" : "A defense"} contribution's Effect at ${issue.path} is malformed: ${issue.type}.`,
      "a well-formed Effect",
      issue.path,
    )
  );
}


/**
 * Everything wrong with an attack contribution EXCEPT its nested Effects.
 *
 * Takes `unknown`. `attack: 42` used to reach `contribution.check` and read a
 * property off a number — which JavaScript obligingly returns `undefined` for,
 * so the Item registered and the fault surfaced later as a contribution that
 * declared nothing.
 */
function findItemAttackFactIssues(value: unknown): readonly EngineError[] {
  if (value === undefined) return [];

  if (!isRecord(value)) {
    return [surfaceError(
      "equipment.actions.attack-contribution.invalid",
      "An Item's attack contribution must be an object.",
      "an ItemAttackContribution object, or omit the field",
      value,
    )];
  }

  const contribution = value as Partial<Record<keyof ItemAttackContribution, unknown>>;
  const errors: EngineError[] = [];

  if (contribution.check !== undefined) {
    if (!isRecord(contribution.check)) {
      errors.push(surfaceError(
        "equipment.actions.attack-contribution.check.malformed",
        "An attack contribution's check must be an action check profile.",
        "an ActionCheckProfile object, or omit the field",
        contribution.check,
      ));
    } else if (
      !isValidCheckScope((contribution.check as unknown as ActionCheckProfile).scope)
    ) {
      errors.push(surfaceError(
        "equipment.actions.attack-contribution.check.invalid",
        "An attack contribution's check must name a known check scope.",
        "a valid CheckScope",
        JSON.stringify((contribution.check as unknown as ActionCheckProfile).scope),
      ));
    }
  }

  if (contribution.range !== undefined) {
    if (!isRecord(contribution.range)) {
      errors.push(surfaceError(
        "equipment.actions.attack-contribution.range.malformed",
        "An attack contribution's Range must be a distance interval.",
        "a DistanceInterval object, or omit the field",
        contribution.range,
      ));
    } else {
      errors.push(
        ...findDistanceIntervalIssues(contribution.range as unknown as DistanceInterval),
      );
    }
  }

  if (contribution.travel !== undefined) {
    if (!isRecord(contribution.travel)) {
      errors.push(surfaceError(
        "equipment.actions.attack-contribution.travel.malformed",
        "An attack contribution's travel must be a spatial travel object.",
        "a SpatialTravel object, or omit the field",
        contribution.travel,
      ));
    } else {
      errors.push(
        ...findTravelIssues(contribution.travel as unknown as SpatialTravel),
      );
    }
  }

  /*
   * A CLOSED vocabulary, and it was going unread. `threatens` decides whether
   * the attack threatens what it targets, and an unrecognised value falls past
   * every `=== "declared-targets"` comparison downstream — so a typo does not
   * fail, it silently disarms the weapon.
   */
  if (
    contribution.threatens !== undefined &&
    !isThreatDeclaration(contribution.threatens)
  ) {
    errors.push(surfaceError(
      "equipment.actions.attack-contribution.threatens.invalid",
      "An attack contribution's threat declaration is not one the engine knows.",
      [...THREAT_DECLARATIONS],
      contribution.threatens,
    ));
  }

  if (contribution.effects !== undefined && !Array.isArray(contribution.effects)) {
    errors.push(surfaceError(
      "equipment.actions.attack-contribution.effects.invalid",
      "An attack contribution's effects must be a list.",
      "array of Effects, or omit the field",
      contribution.effects,
    ));
  }

  return errors;
}


function findItemDefenseFactIssues(value: unknown): readonly EngineError[] {
  if (value === undefined) return [];

  if (!isRecord(value)) {
    return [surfaceError(
      "equipment.actions.defense-contribution.invalid",
      "An Item's defense contribution must be an object.",
      "an ItemDefenseContribution object, or omit the field",
      value,
    )];
  }

  const contribution = value as Partial<Record<keyof ItemDefenseContribution, unknown>>;
  const errors: EngineError[] = [];

  if (contribution.range !== undefined) {
    if (!isRecord(contribution.range)) {
      errors.push(surfaceError(
        "equipment.actions.defense-contribution.range.malformed",
        "A defense contribution's Range must be a distance interval.",
        "a DistanceInterval object, or omit the field",
        contribution.range,
      ));
    } else {
      errors.push(
        ...findDistanceIntervalIssues(contribution.range as unknown as DistanceInterval),
      );
    }
  }

  if (contribution.effects !== undefined && !Array.isArray(contribution.effects)) {
    errors.push(surfaceError(
      "equipment.actions.defense-contribution.effects.invalid",
      "A defense contribution's effects must be a list.",
      "array of Effects, or omit the field",
      contribution.effects,
    ));
  }

  return errors;
}


/** Everything wrong with an attack contribution, nested Effects included. */
export function findItemAttackIssues(value: unknown): readonly EngineError[] {
  return [
    ...findItemAttackFactIssues(value),
    ...findItemContributionEffectIssues(
      "attack",
      isRecord(value) ? value["effects"] : undefined,
    ),
  ];
}


/** Everything wrong with a defense contribution, nested Effects included. */
export function findItemDefenseIssues(value: unknown): readonly EngineError[] {
  return [
    ...findItemDefenseFactIssues(value),
    ...findItemContributionEffectIssues(
      "defense",
      isRecord(value) ? value["effects"] : undefined,
    ),
  ];
}


/*
 * The previous names, kept as aliases. Same implementations; renaming three
 * call sites and two barrels would be a diff about spelling.
 */
export const findItemAttackContributionIssues = findItemAttackIssues;
export const findItemDefenseContributionIssues = findItemDefenseIssues;


/**
 * Every structural fault on the Item surfaces that are built from the NEUTRAL
 * vocabularies — the use application, the attack fact, the defense fact.
 *
 * Split from `findItemStructuralIssues()` in validation.ts for one reason, and
 * it is a layering reason rather than a taste one: these three surfaces
 * compose `actions/`, `targeting/` and `spatial/`, which only this seam file
 * may import (architecture.test.ts holds that line), and validation.ts sits
 * below the seam. `equipment/index.ts` composes both into the one validator
 * the registry is handed, so registration still checks every surface — see
 * its `composeStructuralValidators()` call, and the parity sweep in
 * registration-barrier.test.ts that would fail if either half were dropped.
 *
 * Nested contribution Effects are the one thing it leaves alone, because
 * `findContentStructuralIssues` walks them at the same barrier — see the
 * header above `findItemContributionEffectIssues()`.
 *
 * Strings rather than typed issues, because the consumer is a registration
 * refusal a person reads — the same contract `findItemStructuralIssues()` has.
 */
export function findItemActionSurfaceIssues(
  candidate: unknown,
): readonly string[] {
  if (!isRecord(candidate)) return [];

  const definition = candidate as Partial<Record<keyof ItemDefinition, unknown>>;

  const issues: EngineError[] = [
    ...(definition.useApplication === undefined
      ? []
      : findItemUseApplicationIssues(definition.useApplication)),
    ...findItemAttackFactIssues(definition.attack),
    ...findItemDefenseFactIssues(definition.defense),
  ];

  return issues.map((issue) => `${issue.message} (${issue.code})`);
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

      case "broken":
        return engineSuccess([{
          id: "equipment.use.broken",
          status: "unsatisfied",
          decidedBy: "equipment",
          summary: `This Item is ${resolution.state} and cannot be used.`,
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

  readonly intent: ItemOperationIntentInput;
  readonly approach: ResolutionApproach;

  /**
   * How to resolve an itemId to its definition.
   *
   * The ONE path to a definition now, and the reason the `definition` field
   * that used to sit above this one is gone. A caller supplying both handed
   * preparation two answers to "what Item is this": the entry said one thing
   * and the argument said another, and the profile, the source, the Action
   * cost, the targets, the Range and the settlement request were all built
   * from the argument. A potion's entry prepared with a grenade's definition
   * produced a perfectly well-formed proposal to throw a potion, sourced to
   * the grenade, which settlement would then re-resolve as the potion it
   * always was.
   *
   * So the entry names the definition and this lookup resolves it. A caller
   * with the engine's own catalog passes `getItemDefinition` from
   * equipment/index.ts; a host passes its own, exactly as
   * resolveEquipmentTransition() and resolveItemUse() already ask.
   */
  readonly getItemDefinition: ItemDefinitionLookup;

  readonly spatial?: ActionSpatialInput;
  readonly checkAdvantage?: number;
}


function preparationFailure(
  output: string,
  error: EngineError,
): EngineResult<ActionProposal> {
  return engineFailure(
    {
      root: createTraceNode({
        id: "character.equipment.actions.preparation",
        label: "Prepare Item operation",
        inputs: { stage: { value: output } },
        output,
      }),
    },
    [error] as NonEmptyArray<EngineError>,
  );
}


export function prepareItemOperation(
  input: ItemOperationPreparationInput,
): EngineResult<ActionProposal> {
  const { intent } = input;
  const character = input.resolved.character;

  /* ---------------------------------------------------------------------- */
  /* Provenance: the entry, its owner, and the definition it names          */
  /* ---------------------------------------------------------------------- */

  const found = resolveInventoryItemRef(intent.item, character.id, character.items);

  if (!found.ok) {
    return preparationFailure(found.issue, {
      code: `equipment.actions.preparation.${found.issue.replace(/-/g, "_")}`,
      message: describeInventoryReferenceIssue(found.issue),
      audience: "developer",
      required: "a resolvable entry owned by the acting character",
      actual: found.issue,
    });
  }

  const entry = found.entry;

  /*
   * And whether the ACTOR is the owner.
   *
   * `resolveInventoryItemRef` proves the reference names an entry of the
   * resolved character; it says nothing about who is acting. Preparing Killua's
   * equip against Gon's resolved sheet used to produce a proposal whose actor
   * was Killua and whose cost request was addressed to Gon's inventory — an
   * action one character takes on another character's belongings, with nothing
   * in the proposal saying so.
   */
  if (intent.actor.id !== character.id) {
    return preparationFailure("actor_mismatch", {
      code: "equipment.actions.preparation.actor_mismatch",
      message:
        `The acting character "${intent.actor.id}" does not own entry "${entry.entryId}".`,
      audience: "developer",
      required: `an entry owned by "${intent.actor.id}"`,
      actual: character.id,
    });
  }

  const lookup = resolveItemDefinition(input.getItemDefinition, entry.itemId);

  if (!lookup.ok) {
    /*
     * The identity check used to live HERE, as an `if (definition.id !==
     * entry.itemId)` a few lines below, and it was the only one in the engine.
     * Eight other consumers — transitions, use, implement selection,
     * contributions, integrity, its runtime handler, the envelope and
     * inventory validation — read whatever the lookup returned. A rule one
     * caller enforces is a rule the other eight do not have, so it moved into
     * the shared boundary every one of them already goes through.
     */
    const code = ITEM_DEFINITION_OUTCOME_CODES[lookup.issue];

    return preparationFailure(code, {
      code: `equipment.actions.preparation.${code}`,
      message: describeItemDefinitionOutcome(lookup),
      audience: "developer",
      required: `the definition named by the entry ("${entry.itemId}")`,
      actual: lookup.issue === "mismatched" ? String(lookup.actualId) : entry.itemId,
    });
  }

  const definition = lookup.definition;

  /* Validated before it is read, with the same rules registration applies. */
  const definitionIssues = findItemStructuralIssues(definition);

  if (definitionIssues.length > 0) {
    return preparationFailure("definition_invalid", {
      code: "equipment.actions.preparation.definition_invalid",
      message: `Item "${entry.itemId}" ${definitionIssues.join(" ")}`,
      audience: "developer",
      required: "a structurally sound Item definition",
      actual: definitionIssues[0] ?? "malformed",
    });
  }

  const profileResult = buildItemOperationProfile(
    intent.operation,
    definition,
    { characterId: character.id, entryId: entry.entryId },
  );

  if (!profileResult.success) return profileResult;

  const profile = profileResult.payload;

  const eligibilityResult = evaluateItemOperationEligibility(
    input.resolved,
    intent,
    input.getItemDefinition,
  );

  if (!eligibilityResult.success) return eligibilityResult;

  const characterId = character.id;

  /*
   * Built from the ENTRY, not from the caller's reference. They agree by now —
   * the lookup above proved it — and building from the proven value is what
   * keeps them agreeing if the reference ever gains a field.
   */
  const item: InventoryItemRef = { characterId, entryId: entry.entryId };

  const costRequest = itemOperationCostRequest({
    requestId: `${input.operationId}:${ITEM_OPERATION_COST}:${entry.entryId}`,
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: { domain: "character", id: characterId },
    to: { domain: "character", id: characterId },
    operation: intent.operation,
    item,
    ...(intent.destination === undefined ? {} : { destination: intent.destination }),
  });

  const preparationInput: ActionPreparationInput = {
    operationId: input.operationId,
    profile,
    intent: {
      id: `${input.operationId}:${itemOperationProfileId(intent.operation, item)}`,
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
