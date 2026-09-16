/*
 * Resolving what a character can currently do with their Aura.
 *
 * This file is the whole reason the central Aura resolver never mentions a Nen
 * principle. It takes the two facts a character sheet actually stores about
 * access — are they awakened, and how much Ten do they effectively have — plus
 * an optional explicit override from a later principle resolver, and turns all
 * of them into one flat shape of fractions and permissions.
 *
 * The alternative, which this exists to prevent, is a resolver that asks "is
 * Zetsu active? is Chu active? is Ren active?" and grows a branch per
 * principle. Every one of those branches would be a second place the access
 * rules live, and they would disagree.
 *
 *
 * THE THREE ORDINARY STATES
 * -------------------------
 *
 * UNAWAKENED. Half-open nodes. A real Aura pool that can still be lost
 * involuntarily, no deliberate allocation, no surface Density, and passive
 * internal pseudo-Chu reinforcement drawn from Current Aura rather than from
 * Output.
 *
 * AWAKENED, UNCONTAINED. Effective Ten Mastery 0. The nodes are open, the
 * pseudo-Chu is gone, and nothing has replaced it: zero usable internal
 * Density, no stable surface coating, and Aura leaking away without
 * reinforcing anything. Leakage rate, forced Zetsu and unconsciousness belong
 * to later tickets; what is settled here is that this state reinforces
 * nothing.
 *
 * AWAKENED WITH TEN. Effective Ten Mastery I or higher. Ten is the DEFAULT
 * state — it is on unless something turns it off, not something the character
 * has to declare — and it coats the whole body's surface with the share of
 * physiological Output TEN resolved, leaking the residual TEN resolved, both of
 * which arrive on the access input alongside the rank. Internal Density is
 * still zero.
 *
 * Effective Ten Mastery is consulted for exactly one thing: whether Ten is
 * available. The coating fraction and the residual leak live in
 * nen/principles/ten.ts and are not read here — the coating that file resolves
 * is handed down, never recomputed.
 *
 *
 * WHAT OVERRIDES DO
 * -----------------
 *
 * Each is generic; the principle that supplies one is not named here:
 *
 *   outward-flow     opens a share of Output and pours it outward, replacing
 *                    the coating and every leak while it runs (Ren)
 *   suppressed       closes ordinary Output and the coating (Zetsu)
 *   internal-access  trades the coating for internal placement (Chu)
 *   explicit         every field stated outright
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";

import { STANDARD_MASTERY_MAX } from "../../capabilities/mastery";

import type { AuraAllocation } from "./state";
import type {
  AuraAccessInput,
  AuraAccessOverride,
  AutomaticSurfaceCoating,
  PassiveInternalReinforcement,
  ResolvedAuraAccess,
} from "./types";


/** The lowest effective Ten Mastery at which Ten is available at all. */
const TEN_AVAILABLE_FROM = 1;


/*
 * There is deliberately no TEN_COATING constant here.
 *
 * The coating fraction and the leak that escapes it are both Ten's numbers,
 * and a constant here would be a second copy of one of them, free to drift.
 * Both arrive resolved, on the access input. See ten.ts.
 */

/*
 * There is deliberately no PSEUDO_CHU constant here any more either.
 *
 * The 20% was Aura's second-largest borrowed principle number, after the Ten
 * coating, and it went the same way and for the same reason: an unawakened
 * body's reinforcement efficiency is Chū's, and a copy here could only ever
 * disagree with it. See nen/principles/chu.ts, which owns it, and
 * character/nen/access.ts, which hands the result down.
 */


function invalidFraction(value: unknown): boolean {
  return (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  );
}


function overrideIssues(
  override: AuraAccessOverride,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (
    typeof override.source !== "string" ||
    override.source.trim().length === 0
  ) {
    errors.push({
      code: "aura.access.override.source.missing",
      message: "An Aura access override must name the effect that supplied it.",
      audience: "developer",
      required: "non-empty string",
      actual: String(override.source),
    });
  }

  if (
    override.kind !== "suppressed" &&
    invalidFraction(override.accessFraction)
  ) {
    errors.push({
      code: "aura.access.fraction.invalid",
      message:
        "An Aura access fraction must be a finite number from 0 through 1.",
      audience: "developer",
      required: "finite number between 0 and 1",
      actual: Number.isFinite(override.accessFraction)
        ? override.accessFraction
        : String(override.accessFraction),
    });
  }

  return errors;
}


/*
 * What a supplied Ten coating has to look like to be usable.
 *
 * Checked rather than trusted because this file cannot rebuild it: a coating
 * carrying NaN would flow straight into the budget as an Output commitment and
 * poison every allocation settled against it, and nothing downstream is in a
 * position to notice that the number came from Ten rather than from arithmetic
 * of its own.
 */
function coatingIssues(
  coating: AutomaticSurfaceCoating,
): readonly EngineError[] {
  if (coating.source !== "baseline-ten") {
    return [{
      code: "aura.access.ten_coating.source.invalid",
      message: "The automatic surface coating must name the state that applied it.",
      audience: "developer",
      required: '"baseline-ten"',
      actual: String(coating.source),
    }];
  }

  if (invalidFraction(coating.outputFraction)) {
    return [{
      code: "aura.access.ten_coating.fraction.invalid",
      message:
        "Ten's resolved coating must be a finite share of physiological Output from 0 through 1.",
      audience: "developer",
      required: "finite number between 0 and 1",
      actual: Number.isFinite(coating.outputFraction)
        ? coating.outputFraction
        : String(coating.outputFraction),
    }];
  }

  const leak = coating.leakageRegenerationMultiple;

  if (typeof leak !== "number" || !Number.isFinite(leak) || leak < 0) {
    return [{
      code: "aura.access.ten_coating.leakage.invalid",
      message:
        "A coating's residual leak must be a finite non-negative multiple of Regeneration.",
      audience: "developer",
      required: "finite number >= 0",
      actual: typeof leak === "number" && Number.isFinite(leak)
        ? leak
        : String(leak),
    }];
  }

  return [];
}


/*
 * What a supplied passive reinforcement has to look like to be usable.
 *
 * Checked for the same reason the coating is: this file cannot rebuild it, and
 * a NaN efficiency would reach the density arithmetic as a whole-body internal
 * allocation rather than as an error.
 */
function reinforcementIssues(
  reinforcement: PassiveInternalReinforcement,
): readonly EngineError[] {
  if (
    typeof reinforcement.source !== "string" ||
    reinforcement.source.trim().length === 0
  ) {
    return [{
      code: "aura.access.passive_reinforcement.source.missing",
      message:
        "Passive internal reinforcement must name the effect that produced it.",
      audience: "developer",
      required: "non-empty string",
      actual: String(reinforcement.source),
    }];
  }

  if (invalidFraction(reinforcement.efficiency)) {
    return [{
      code: "aura.access.passive_reinforcement.efficiency.invalid",
      message:
        "Passive internal reinforcement efficiency must be a finite fraction from 0 through 1.",
      audience: "developer",
      required: "finite number between 0 and 1",
      actual: Number.isFinite(reinforcement.efficiency)
        ? reinforcement.efficiency
        : String(reinforcement.efficiency),
    }];
  }

  return [];
}


/*
 * The override branch, flattened.
 *
 * Exhaustive over the union rather than defaulted, so adding a variant is a
 * compile error here instead of a silent fall-through to whatever the last
 * case happened to be.
 *
 * `coating` is Ten's resolved coating, or null when Ten is not available. Each
 * override decides for itself whether it keeps it, because an override is
 * free to refuse a coating from a character who has Ten — and "no coating" and
 * "not containing" are the two conditions this file exists to keep apart.
 */
function resolveOverride(
  override: AuraAccessOverride,
  coating: AutomaticSurfaceCoating | null,
): Omit<ResolvedAuraAccess, "state" | "awakened" | "nodeState"> {
  const base = {
    source: override.source,
    passiveInternalReinforcement: null,
    containedLeakageRegenerationMultiple: 0,
    outwardFlow: false,
  } as const;

  switch (override.kind) {
    /*
     * Ren and anything else that opens Output and pours it outward.
     *
     * The coating is REPLACED, not kept: the two are alternative operating
     * states, and a character never wears both. Nothing leaks either — not
     * the coating's residual, and not the open-node bleed of a character with
     * no containment — because the deliberate flow is what is leaving the
     * body, and the time solver charges exactly that.
     */
    case "outward-flow":
      return {
        ...base,
        accessFraction: override.accessFraction,
        deliberateInternalAccess: false,
        deliberateExternalAccess: true,
        automaticSurfaceCoating: null,
        outwardFlow: true,
        uncontained: false,
      };

    /* Zetsu and anything else that closes ordinary Output and Ten. */
    case "suppressed":
      return {
        ...base,
        accessFraction: 0,
        deliberateInternalAccess: false,
        deliberateExternalAccess: false,
        automaticSurfaceCoating: null,

        /* Suppression closes the nodes. Nothing escapes because nothing is out. */
        uncontained: false,
      };

    /* Chu and anything else that trades the coating for internal placement. */
    case "internal-access":
      return {
        ...base,
        accessFraction: override.accessFraction,
        deliberateInternalAccess: true,
        deliberateExternalAccess: true,
        automaticSurfaceCoating: null,

        /*
         * No coating, but the Aura is inside the body rather than escaping it.
         * This is the case that makes `uncontained` a flag instead of an
         * inference from a missing coating.
         */
        uncontained: false,
      };

    case "explicit": {
      const applied = override.automaticSurfaceCoating ? coating : null;
      const uncontained = override.uncontained ?? false;

      return {
        ...base,
        accessFraction: override.accessFraction,
        deliberateInternalAccess: override.deliberateInternalAccess,
        deliberateExternalAccess: override.deliberateExternalAccess,

        /*
         * The one field an explicit override CANNOT state outright, and it is
         * a boolean for that reason: it asks whether a coating applies, not
         * how big one is, because how big is Ten's question and there is no
         * other answer to it. So asking for a coating from a character with no
         * Ten gets none — the override can waive Ten's coating, and cannot
         * conjure one for somebody who has nothing to coat with.
         */
        automaticSurfaceCoating: applied,

        /* A coating brings its containment's residual leak with it. */
        containedLeakageRegenerationMultiple:
          applied === null || uncontained
            ? 0
            : applied.leakageRegenerationMultiple,
        uncontained,
      };
    }
  }
}


/**
 * Resolve a character's Aura access from awakening, Ten and any override.
 *
 * The one producer of ResolvedAuraAccess.
 */
export function resolveAuraAccess(
  input: AuraAccessInput,
): EngineResult<ResolvedAuraAccess> {
  const traceNode = createTraceNode({
    id: "aura.access.resolve",
    label: "Resolve Aura access",
    formula:
      "unawakened | awakened without Ten | awakened with Ten, unless an explicit override replaces it",
    inputs: {
      awakened: { value: String(input.awakened) },
      previouslyAwakened: { value: String(input.previouslyAwakened ?? false) },
      effectiveTenMastery: {
        value: Number.isFinite(input.effectiveTenMastery)
          ? input.effectiveTenMastery
          : String(input.effectiveTenMastery),
      },
      tenCoating: {
        value: input.tenCoating === undefined
          ? "none"
          : input.tenCoating.outputFraction,
      },
      override: { value: input.override?.kind ?? "none" },
    },
  });

  const errors: EngineError[] = [];

  if (typeof input.awakened !== "boolean") {
    errors.push({
      code: "aura.access.awakened.invalid",
      message: "Aura access requires a boolean awakening state.",
      audience: "developer",
      required: "boolean",
      actual: String(input.awakened),
    });
  }

  if (
    input.previouslyAwakened !== undefined &&
    typeof input.previouslyAwakened !== "boolean"
  ) {
    errors.push({
      code: "aura.access.previously-awakened.invalid",
      message:
        "Whether a character has previously awakened must be a boolean when supplied.",
      audience: "developer",
      required: "boolean",
      actual: String(input.previouslyAwakened),
    });
  }

  /*
   * Currently awakened and never awakened is not a state. It would resolve to
   * open nodes on a body that has never been opened, which is a caller that
   * has mixed up two characters rather than an exotic one.
   */
  if (input.awakened === true && input.previouslyAwakened === false) {
    errors.push({
      code: "aura.access.awakening-history.contradictory",
      message:
        "An awakened character has, by definition, previously awakened.",
      audience: "developer",
      required: "previouslyAwakened to be true or omitted when awakened",
      actual: "false",
    });
  }

  const mastery = input.effectiveTenMastery;

  if (
    !Number.isFinite(mastery) ||
    !Number.isInteger(mastery) ||
    mastery < 0 ||
    mastery > STANDARD_MASTERY_MAX
  ) {
    errors.push({
      code: "aura.access.ten_mastery.invalid",
      message:
        "Effective Ten Mastery must be an integer from 0 through " +
        `${STANDARD_MASTERY_MAX}.`,
      audience: "developer",
      required: `integer from 0 through ${STANDARD_MASTERY_MAX}`,
      actual: Number.isFinite(mastery) ? mastery : String(mastery),
    });
  }

  /*
   * Awakening is authoritative over mastery, not the other way round. Ten is
   * only reachable once the nodes are open, so an unawakened character with a
   * recorded rank is still unawakened.
   */
  const tenAvailable =
    input.awakened === true && mastery >= TEN_AVAILABLE_FROM;

  if (input.tenCoating !== undefined) {
    errors.push(...coatingIssues(input.tenCoating));
  } else if (tenAvailable) {
    /*
     * The one thing this file refuses to guess.
     *
     * A missing coating on a character who HAS Ten is a caller that skipped
     * the Nen projection, and the only two ways to absorb it are both worse
     * than refusing: resolving a coating of zero would report a character in
     * perfect containment as wearing nothing, and inventing a fraction would
     * put a second Ten in this file, which is what the whole correction
     * removed. See character/nen/access.ts for the producer.
     */
    errors.push({
      code: "aura.access.ten_coating.missing",
      message:
        "A character with usable Ten must arrive with the coating Ten resolved.",
      audience: "developer",
      required: "a tenCoating supplied by nen/principles/ten.ts",
      actual: `effective Ten Mastery ${mastery} with no coating`,
      resolution:
        "Build the access input through the Nen projection rather than by hand; it resolves Ten's coating and residual leak from the rank.",
    });
  }

  if (input.passiveInternalReinforcement !== undefined) {
    errors.push(...reinforcementIssues(input.passiveInternalReinforcement));
  }

  if (input.override !== undefined) {
    errors.push(...overrideIssues(input.override));

    /*
     * An override describes something a principle is doing, and an unawakened
     * character has no principles. Supplying one is a caller bug rather than
     * an exotic character, so it is reported instead of quietly winning.
     */
    if (input.awakened === false) {
      errors.push({
        code: "aura.access.override.unawakened",
        message:
          "An Aura access override cannot apply to an unawakened character.",
        audience: "developer",
        required: "awakened character",
        actual: input.override.kind,
      });
    }
  }

  if (errors.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  /*
   * Ten's coating, or nothing. Validation above has already established that
   * an available Ten came with one, so the only null here is a character Ten
   * does not reach.
   */
  const coating = tenAvailable ? input.tenCoating ?? null : null;

  /*
   * Passive internal reinforcement, or nothing.
   *
   * Only a body that has never been opened produces any, so an awakened
   * character's is dropped here whatever was supplied — the same way the
   * coating is dropped for a character with no Ten.
   */
  const reinforcement = input.awakened === true
    ? null
    : input.passiveInternalReinforcement ?? null;

  const payload: ResolvedAuraAccess = ((): ResolvedAuraAccess => {
    if (input.override !== undefined) {
      return {
        state: "override",
        awakened: true,
        nodeState: "open",
        ...resolveOverride(input.override, coating),
      };
    }

    if (!input.awakened) {
      /*
       * Two half-open states, and the difference is the pseudo-Chu.
       *
       * A body that has never been opened produces passive internal
       * reinforcement from 20% of its reserve. Opening it ends that
       * PERMANENTLY: it does not return during a Zetsu, it does not return
       * after a collapse, and it does not return when an exceptional source
       * undoes the awakening itself. So a reverted character is back to
       * half-open nodes and no deliberate access, with nothing reinforcing
       * them — which is strictly worse than never having awakened, and is
       * meant to be.
       */
      const reverted = input.previouslyAwakened === true;

      return {
        state: reverted ? "reverted" : "unawakened",
        source: reverted ? "reverted" : "unawakened",
        awakened: false,
        nodeState: "half-open",

        /*
         * No deliberate Output at all. The pseudo-Chu below is not Output and
         * does not come from this fraction.
         */
        accessFraction: 0,
        deliberateInternalAccess: false,
        deliberateExternalAccess: false,
        automaticSurfaceCoating: null,
        /*
         * Supplied by Chū, never manufactured here — and the `reverted` guard
         * is belt and braces rather than the rule. The projection already
         * returns nothing for a reverted character; this file states the same
         * thing so that a caller who hand-built an input cannot accidentally
         * give one their pseudo-Chū back.
         */
        passiveInternalReinforcement: reverted ? null : reinforcement,

        /* Half-open pores leak at their own rate, which is not containment's. */
        containedLeakageRegenerationMultiple: 0,
        outwardFlow: false,

        /*
         * Half-open nodes leak, but that leakage is what the pseudo-Chu is
         * made of rather than a loss. An ordinary person does not bleed out
         * over two days — and neither does a reverted one, whose nodes are
         * just as shut even though nothing is being made of what escapes.
         */
        uncontained: false,
      };
    }

    if (coating === null) {
      return {
        state: "uncontained",
        source: "awakened-uncontained",
        awakened: true,
        nodeState: "open",
        accessFraction: 0,
        deliberateInternalAccess: false,
        deliberateExternalAccess: true,
        automaticSurfaceCoating: null,
        passiveInternalReinforcement: null,
        containedLeakageRegenerationMultiple: 0,
        outwardFlow: false,

        /*
         * The one baseline state that bleeds. Open nodes, nothing containing
         * them, and no pseudo-Chu to make use of what escapes.
         */
        uncontained: true,
      };
    }

    return {
      state: "ten",
      source: "baseline-ten",
      awakened: true,
      nodeState: "open",

      /*
       * Exactly as much Output as the coating needs, and no more.
       *
       * Baseline Ten opens nothing on its own — deliberately opening Output is
       * a different state that replaces Ten — so the reachable share IS the
       * coating's share. Stating it any other way would leave the budget with a
       * deliberate allowance a character running nothing but Ten has not
       * earned, or with less Output than their own coating commits.
       */
      accessFraction: coating.outputFraction,
      deliberateInternalAccess: false,
      deliberateExternalAccess: true,
      automaticSurfaceCoating: coating,
      passiveInternalReinforcement: null,

      /*
       * Containment is the whole of what Ten does, and how COMPLETELY it
       * contains is the whole of what Ten Mastery buys.
       */
      containedLeakageRegenerationMultiple:
        coating.leakageRegenerationMultiple,
      outwardFlow: false,
      uncontained: false,
    };
  })();

  traceNode.output = {
    state: payload.state,
    source: payload.source,
    accessFraction: payload.accessFraction,
    deliberateInternalAccess: payload.deliberateInternalAccess,
    deliberateExternalAccess: payload.deliberateExternalAccess,
    automaticSurfaceCoating: payload.automaticSurfaceCoating !== null,
    passiveInternalReinforcement:
      payload.passiveInternalReinforcement !== null,
    containedLeakageRegenerationMultiple:
      payload.containedLeakageRegenerationMultiple,
    outwardFlow: payload.outwardFlow,
    uncontained: payload.uncontained,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/* ── Deliberate access ──────────────────────────────────────────────────── */

/*
 * Whether the character can project Aura ON PURPOSE at all.
 *
 * The gate every deliberate expenditure passes and no involuntary one does.
 * An unawakened character's nodes cannot direct anything and a suppressed
 * character's are shut, so neither can spend Aura deliberately — while both
 * can still burn it through physical effort and both can still have it taken
 * from them. That asymmetry is the whole reason this is a named predicate
 * rather than an inline check: three call sites reading two boolean fields
 * would eventually disagree about which combination counts.
 */
export function hasDeliberateAuraAccess(
  access: Pick<
    ResolvedAuraAccess,
    "deliberateInternalAccess" | "deliberateExternalAccess"
  >,
): boolean {
  return access.deliberateInternalAccess || access.deliberateExternalAccess;
}


/** The refusal a deliberate expenditure gets when access is closed. */
export function deliberateAccessError(
  access: Pick<ResolvedAuraAccess, "state" | "source">,
): EngineError {
  return {
    code: "aura.access.deliberate.not_permitted",
    message:
      "This character cannot spend Aura deliberately in their current state.",
    audience: "player",
    required: "an access state permitting deliberate Aura expenditure",
    actual: access.state,
    resolution:
      "Deliberate expenditure needs open Aura nodes and an access state that has not closed ordinary Output. Physical exertion and involuntary loss are unaffected.",
  };
}


/* ── Placement permission ───────────────────────────────────────────────── */

/*
 * Whether the character is allowed to put Aura where these allocations put it.
 *
 * Deliberately NOT part of findAuraAllocationIssues. That predicate judges the
 * character SHEET, and a sheet is well-formed or not regardless of what the
 * character is doing at the time; this depends on runtime access, so the same
 * allocation is legal under Chu and illegal a moment later. The same reasoning
 * keeps the Output ceiling out of sheet validation.
 *
 * An awakened character's internal Density is ZERO unless an access override
 * explicitly permits internal placement. Awakening opens the nodes and ends
 * the unawakened body's passive internal reinforcement; nothing replaces it
 * until the character learns to place Aura inside themselves on purpose.
 */
export function findAuraPlacementIssues(
  allocations: readonly AuraAllocation[],
  access: Pick<
    ResolvedAuraAccess,
    "deliberateInternalAccess" | "deliberateExternalAccess" | "state" | "source"
  >,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  for (const allocation of allocations) {
    const permitted =
      allocation.placement === "internal"
        ? access.deliberateInternalAccess
        : access.deliberateExternalAccess;

    if (permitted) continue;

    errors.push(
      allocation.placement === "internal"
        ? {
          code: "aura.access.internal_placement.not_permitted",
          message:
            "This character's Aura access does not permit placing Aura inside the body.",
          audience: "player",
          required: "an access state permitting internal placement",
          actual: access.state,
          resolution:
            "Internal placement needs an access override that grants it; awakened internal Density is otherwise zero.",
        }
        : {
          code: "aura.access.surface_placement.not_permitted",
          message:
            "This character's Aura access does not permit placing Aura on the body's surface.",
          audience: "player",
          required: "an access state permitting deliberate external Output",
          actual: access.state,
          resolution:
            "Deliberate surface placement needs open Aura nodes and an access state that has not closed ordinary Output.",
        },
    );
  }

  return errors;
}
