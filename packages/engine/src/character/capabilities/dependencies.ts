/*
 * The capability dependency graph, checked against itself.
 *
 * Content is data, which is the point — and it means an author can write a
 * Skill that requires a Technique that requires that Skill. Nothing about
 * either definition is malformed; the two are simply impossible together, and
 * nobody finds out until a player asks why the Skill will not appear in any
 * picker. That is the class of mistake this file exists to catch, at load, in
 * a message rather than in a support question.
 *
 * ── Why a plain cycle check is the wrong tool ───────────────────────────
 *
 * The obvious implementation walks the requirement graph and rejects every
 * cycle it finds. It rejects perfectly good content:
 *
 *   Skill A requires Technique B OR Trait C
 *   Technique B requires Skill A
 *   Trait C is obtainable on its own
 *
 * There is a cycle in that graph — A depends on B depends on A — and the
 * content works: take Trait C, then Skill A, then Technique B. What matters is
 * not whether the graph has a loop but whether each capability is REACHABLE
 * from a standing start, and `any` branches mean reachability is a boolean
 * question rather than a structural one.
 *
 * So this computes a least fixed point instead. Start with nothing acquired;
 * repeatedly add every capability whose requirements are satisfiable by what
 * has already been added; stop when a round adds nothing. Whatever is left out
 * can never be acquired by anybody, in any order, and THAT is the error.
 *
 * ── What counts as satisfiable ──────────────────────────────────────────
 *
 * Non-capability requirements — Attributes, Level, Species, Clans, Conditions,
 * Items — are treated as satisfiable. They are external to this graph and a
 * character can go and get them; a Skill wanting DEX 16 is demanding, not
 * impossible. `not` is satisfiable for the same reason in reverse: declining
 * to have something is always available.
 *
 * Unknown ids are ALSO treated as satisfiable, which sounds wrong and is not:
 * catalogs.ts already reports every unresolved reference, and treating them as
 * blockers here would bury that one real message under a cascade of derived
 * ones about everything downstream.
 *
 * ACCESS grants and subsumption widen reachability. Anything a reachable
 * capability GIVES is itself reachable — that is what "a seeded grant cycle
 * resolves to a stable closure" means — and anything a reachable capability
 * subsumes is reachable through it, because a replacement satisfies
 * requirements naming what it replaced. An entirely UNSEEDED grant cycle adds
 * nothing, since neither end is ever reached to do the granting.
 *
 * An UNLOCK does not widen reachability, and that distinction is the mode's
 * entire meaning. It supplies permission and no prerequisites, so a Clan
 * offering a Skill whose requirements can never be met has issued a real
 * invitation to something still unlearnable. Treating an offer as a grant here
 * would hide exactly the deadlocks this file exists to find. It works the
 * other way too: a capability declared `requiresUnlock` is reachable only if
 * something reachable offers it, so an offer nobody can ever make is caught
 * as well.
 */

import {
  capabilityGrantMode,
  type CapabilityGrantMode,
  type Effect,
} from "../rules/effects";
import type { Requirement } from "../rules/requirements";
import type {
  RequirementContext,
  RuleSourceRef,
} from "../rules/resolution";

import {
  getTraitDefinition,
  isKnownTraitId,
  traitRegistry,
} from "../identity/traits";

import {
  getSkillDefinition,
  isKnownSkillId,
  skillMasteryTrack,
  skillRegistry,
} from "./skills";

import {
  getTechniqueDefinition,
  isKnownTechniqueId,
  techniqueMasteryTrack,
  techniqueRegistry,
} from "./techniques";

import {
  evaluateCapabilityAcquisition,
  type CapabilityAcquisitionEvaluation,
  type CapabilityKind,
  type CapabilityRef,
} from "./lifecycle";

import type { MasteryRankDefinition } from "./mastery";

/* -------------------------------------------------------------------------- */
/* Catalog-aware capability lookup                                            */
/* -------------------------------------------------------------------------- */

/*
 * The one place that can answer a question about a capability without knowing
 * its kind first.
 *
 * It lives here rather than in lifecycle.ts because it needs all three
 * catalogs, and lifecycle.ts is imported BY one of them — identity/traits.ts
 * folds its Traits with the shared resolver. A value import of the Trait
 * catalog down there would close that loop.
 */

/** Whether any catalog knows this capability. */
export function isKnownCapability(capability: CapabilityRef): boolean {
  switch (capability.kind) {
    case "trait":
      return isKnownTraitId(capability.id);

    case "skill":
      return isKnownSkillId(capability.id);

    case "technique":
      return isKnownTechniqueId(capability.id);
  }
}


/**
 * The acquisition requirements a capability declares.
 *
 * Undefined for an id no catalog knows, which is a different answer from an
 * empty list: nothing to read versus nothing to ask.
 */
export function capabilityRequirements(
  capability: CapabilityRef,
): readonly Requirement[] | undefined {
  switch (capability.kind) {
    case "trait":
      return getTraitDefinition(capability.id)?.requirements ?? [];

    case "skill":
      return getSkillDefinition(capability.id)?.requirements ?? [];

    case "technique":
      return getTechniqueDefinition(capability.id)?.requirements ?? [];
  }
}


/** What this capability declares it replaces. */
export function capabilitySubsumes(
  capability: CapabilityRef,
): readonly string[] {
  switch (capability.kind) {
    case "trait":
      return getTraitDefinition(capability.id)?.subsumes ?? [];

    case "skill":
      return getSkillDefinition(capability.id)?.subsumes ?? [];

    case "technique":
      return getTechniqueDefinition(capability.id)?.subsumes ?? [];
  }
}


/**
 * Whether the capability may only be taken up once something has unlocked it.
 */
export function capabilityRequiresUnlock(
  capability: CapabilityRef,
): boolean {
  switch (capability.kind) {
    case "trait":
      return getTraitDefinition(capability.id)?.requiresUnlock ?? false;

    case "skill":
      return getSkillDefinition(capability.id)?.requiresUnlock ?? false;

    case "technique":
      return getTechniqueDefinition(capability.id)?.requiresUnlock ?? false;
  }
}


/** The capability's own effects, before any rank is reached. */
function capabilityEffects(capability: CapabilityRef): readonly Effect[] {
  switch (capability.kind) {
    case "trait":
      return getTraitDefinition(capability.id)?.effects ?? [];

    case "skill":
      return getSkillDefinition(capability.id)?.effects ?? [];

    case "technique":
      return getTechniqueDefinition(capability.id)?.effects ?? [];
  }
}


/** The authored ranks of a capability's Mastery track, if it has one. */
function capabilityRanks(
  capability: CapabilityRef,
): readonly MasteryRankDefinition[] {
  switch (capability.kind) {
    case "trait":
      /* Traits have no Mastery, and no path by which they could gain one. */
      return [];

    case "skill":
      return skillMasteryTrack(capability.id)?.ranks ?? [];

    case "technique":
      return techniqueMasteryTrack(capability.id)?.ranks ?? [];
  }
}


function capabilityMaximumMastery(capability: CapabilityRef): number {
  switch (capability.kind) {
    case "trait":
      return 0;

    case "skill":
      return skillMasteryTrack(capability.id)?.maximumMastery ?? 0;

    case "technique":
      return techniqueMasteryTrack(capability.id)?.maximumMastery ?? 0;
  }
}


/**
 * Every capability in every catalog, authored and registered alike.
 *
 * Registered ones are included on purpose: a GM's homebrew Technique can
 * deadlock against an authored Skill exactly as easily as two authored ones,
 * and it reaches the same picker.
 */
function everyCapability(): readonly CapabilityRef[] {
  return [
    ...traitRegistry.all().map(
      (definition): CapabilityRef => ({ kind: "trait", id: definition.id }),
    ),
    ...techniqueRegistry.all().map(
      (definition): CapabilityRef => ({ kind: "technique", id: definition.id }),
    ),
    ...skillRegistry.all().map(
      (definition): CapabilityRef => ({ kind: "skill", id: definition.id }),
    ),
  ];
}


/**
 * Evaluate whether a character may acquire a capability, reading the
 * capability's requirements from the catalogs.
 *
 * The catalog-aware form of lifecycle.ts's evaluator. An id no catalog knows
 * is `unresolved` rather than `unsatisfied`: the engine cannot judge
 * requirements it cannot read, and reporting a definite refusal for a missing
 * definition would send an author looking for a prerequisite instead of for
 * the typo.
 */
export function evaluateAcquisition(
  capability: CapabilityRef,
  context: RequirementContext,
  unlockedBy: readonly RuleSourceRef[] = [],
): CapabilityAcquisitionEvaluation {
  const requirements = capabilityRequirements(capability);

  if (requirements === undefined || !isKnownCapability(capability)) {
    return {
      capability,
      disposition: "unresolved",
      unlocked: unlockedBy.length > 0,
      requiresUnlock: false,
      acquisition: "unresolved",
      requirements: [],
    };
  }

  return evaluateCapabilityAcquisition({
    capability,
    requirements,
    context,
    unlockedBy,
    requiresUnlock: capabilityRequiresUnlock(capability),
  });
}


/* -------------------------------------------------------------------------- */
/* Reachability                                                               */
/* -------------------------------------------------------------------------- */

/*
 * A node is a capability at a rank.
 *
 * Rank 0 is "acquired, with no Mastery" — what a Trait or a trackless Skill
 * has. Rank n >= 1 is Mastery n. Modelling ranks as separate nodes is what
 * lets the analysis catch a pair of Skills whose SECOND ranks require each
 * other while their first ranks are perfectly obtainable.
 */
function nodeKey(capability: CapabilityRef, rank: number): string {
  return `${capability.kind}:${capability.id}@${rank}`;
}


/** The rank a capability is at the moment it is acquired. */
function acquisitionRank(capability: CapabilityRef): number {
  return capabilityMaximumMastery(capability) > 0 ? 1 : 0;
}


interface Reachability {
  readonly reached: ReadonlySet<string>;

  /**
   * Nodes something obtainable OFFERS.
   *
   * Returned alongside the reachable set so the reporter can tell which of the
   * two gates is shut. Recomputing it there would be a second implementation
   * of "who can ever unlock this", and the two would eventually disagree.
   */
  readonly unlocked: ReadonlySet<string>;

  readonly capabilities: readonly CapabilityRef[];
}


/**
 * Whether a requirement can be met by somebody whose reachable capabilities
 * are `reached`.
 *
 * Monotone in `reached`, apart from `not`, which is answered as satisfiable
 * outright — declining to have something is always possible, and treating it
 * as a blocker would make the fixed point non-monotone and the analysis
 * order-dependent.
 */
function requirementReachable(
  requirement: Requirement,
  reached: ReadonlySet<string>,
): boolean {
  switch (requirement.type) {
    case "hasSkill":
      return capabilityReachable({ kind: "skill", id: requirement.skillId }, 0, reached);

    case "skillMastery":
      return capabilityReachable(
        { kind: "skill", id: requirement.skillId },
        requirement.minimumMastery,
        reached,
      );

    case "hasTechnique":
      return capabilityReachable(
        { kind: "technique", id: requirement.techniqueId },
        0,
        reached,
      );

    case "techniqueMastery":
      return capabilityReachable(
        { kind: "technique", id: requirement.techniqueId },
        requirement.minimumMastery,
        reached,
      );

    case "hasTrait":
      return capabilityReachable({ kind: "trait", id: requirement.traitId }, 0, reached);

    case "all":
      return requirement.requirements.every((child) =>
        requirementReachable(child, reached),
      );

    case "any":
      return requirement.requirements.some((child) =>
        requirementReachable(child, reached),
      );

    case "not":
      return true;

    default:
      /* Attributes, Level, Species, Clans, Conditions, Items: external. */
      return true;
  }
}


/**
 * Whether a capability is reachable at least at `rank`.
 *
 * `rank` 0 means "at all". An unknown capability answers yes, so that one
 * unresolved reference produces one message from catalogs.ts rather than a
 * cascade of unreachability from here.
 */
function capabilityReachable(
  capability: CapabilityRef,
  rank: number,
  reached: ReadonlySet<string>,
): boolean {
  if (!isKnownCapability(capability)) return true;

  /*
   * A rank the target's track does not go up to — or a rank asked of a
   * capability that has no track at all — is answered as satisfiable for the
   * same reason an unknown id is: catalogs.ts already says exactly that, by
   * name, and blocking here would follow one accurate message with a second,
   * vaguer one about everything downstream of it.
   */
  if (rank > capabilityMaximumMastery(capability)) return true;

  const wanted = Math.max(rank, acquisitionRank(capability));

  return reached.has(nodeKey(capability, wanted));
}


/**
 * The least fixed point: everything anybody could ever acquire, and at what
 * rank.
 */
function computeReachability(): Reachability {
  const capabilities = everyCapability();

  const reached = new Set<string>();

  /*
   * Ids an ACCESS grant hands over, which bypass their own requirements
   * because the character is given the thing rather than qualifying for it.
   */
  const granted = new Set<string>();

  /*
   * Ids something reachable OFFERS.
   *
   * Kept apart from `granted`, and that separation is the whole meaning of the
   * mode. An unlock supplies permission and no prerequisites, so a Skill whose
   * requirements can never be met is not rescued by a Clan offering it — the
   * invitation is real and the Skill is still unlearnable. Folding the two
   * together would make every unlock a grant with extra words, and would hide
   * exactly the deadlocks this analysis exists to find.
   */
  const unlocked = new Set<string>();

  const grantsOf = (
    effects: readonly Effect[],
  ): readonly { readonly target: CapabilityRef; readonly mode: CapabilityGrantMode }[] =>
    effects.flatMap((effect) => {
      switch (effect.type) {
        case "grantTrait":
          return [{
            target: { kind: "trait", id: effect.traitId } as CapabilityRef,
            mode: capabilityGrantMode(effect.mode),
          }];

        case "grantSkill":
          return [{
            target: { kind: "skill", id: effect.skillId } as CapabilityRef,
            mode: capabilityGrantMode(effect.mode),
          }];

        case "grantTechnique":
          return [{
            target: { kind: "technique", id: effect.techniqueId } as CapabilityRef,
            mode: capabilityGrantMode(effect.mode),
          }];

        default:
          return [];
      }
    });

  for (let round = 0; round < capabilities.length * 4 + 8; round += 1) {
    let added = false;

    const reach = (capability: CapabilityRef, rank: number): void => {
      const key = nodeKey(capability, rank);

      if (reached.has(key)) return;

      reached.add(key);
      added = true;

      /*
       * Reaching a capability makes what it replaces reachable through it:
       * the replacement satisfies requirements naming the older one, so an
       * author is not obliged to keep a retired Technique acquirable.
       */
      for (const subsumedId of capabilitySubsumes(capability)) {
        const subsumed: CapabilityRef = { kind: capability.kind, id: subsumedId };

        if (subsumedId === capability.id) continue;

        granted.add(nodeKey(subsumed, acquisitionRank(subsumed)));
      }

      /* And what it grants, at whichever rank grants it. */
      const effects = rank <= acquisitionRank(capability)
        ? capabilityEffects(capability)
        : (capabilityRanks(capability).find((one) => one.rank === rank)
            ?.effects ?? []);

      for (const { target, mode } of grantsOf(effects)) {
        const key = nodeKey(target, acquisitionRank(target));

        if (mode === "unlocked-for-acquisition") {
          unlocked.add(key);
        } else {
          granted.add(key);
        }
      }
    };

    for (const capability of capabilities) {
      const base = acquisitionRank(capability);

      if (!reached.has(nodeKey(capability, base))) {
        const key = nodeKey(capability, base);

        const requirements = capabilityRequirements(capability) ?? [];

        /*
         * Two gates, and an access grant skips both. Qualifying for something
         * gated on an unlock is not enough on its own, and neither is being
         * offered something whose prerequisites are impossible.
         */
        const qualifies = requirements.every((requirement) =>
          requirementReachable(requirement, reached),
        );

        const permitted =
          !capabilityRequiresUnlock(capability) || unlocked.has(key);

        if (granted.has(key) || (qualifies && permitted)) {
          reach(capability, base);
        }
      }

      if (!reached.has(nodeKey(capability, base))) continue;

      /*
       * Ranks climb one at a time. Rank n is reachable only from rank n-1, so
       * a rank whose own requirements are impossible seals off everything
       * above it — which is exactly what a Mastery progression cycle does.
       */
      const maximum = capabilityMaximumMastery(capability);

      for (let rank = base + 1; rank <= maximum; rank += 1) {
        if (reached.has(nodeKey(capability, rank))) continue;

        if (!reached.has(nodeKey(capability, rank - 1))) break;

        const authored = capabilityRanks(capability).find(
          (one) => one.rank === rank,
        );

        const satisfiable = (authored?.requirements ?? []).every((requirement) =>
          requirementReachable(requirement, reached),
        );

        if (!satisfiable) break;

        reach(capability, rank);
      }
    }

    if (!added) break;
  }

  return { reached, unlocked, capabilities };
}


/* -------------------------------------------------------------------------- */
/* Catalog issues                                                             */
/* -------------------------------------------------------------------------- */

const KIND_LABELS: Readonly<Record<CapabilityKind, string>> = {
  trait: "Trait",
  technique: "Technique",
  skill: "Skill",
};


/**
 * Which OTHER catalog knows this id, if the one that should does not.
 *
 * Turns "unknown Technique" into "that is a Skill", which is the actual
 * mistake behind most cross-kind subsumption.
 */
function otherKindHolding(
  kind: CapabilityKind,
  id: string,
): CapabilityKind | undefined {
  const kinds: readonly CapabilityKind[] = ["trait", "technique", "skill"];

  return kinds.find(
    (other) => other !== kind && isKnownCapability({ kind: other, id }),
  );
}


function findSubsumptionIssues(
  capabilities: readonly CapabilityRef[],
): readonly string[] {
  const issues: string[] = [];

  for (const capability of capabilities) {
    const label = KIND_LABELS[capability.kind];

    for (const id of capabilitySubsumes(capability)) {
      if (id === capability.id) {
        issues.push(`${label} "${capability.id}" subsumes itself.`);
        continue;
      }

      if (!isKnownCapability({ kind: capability.kind, id })) {
        const other = otherKindHolding(capability.kind, id);

        issues.push(
          other === undefined
            ? `${label} "${capability.id}" subsumes unknown ${label} "${id}".`
            : `${label} "${capability.id}" subsumes "${id}", which is a ${KIND_LABELS[other]} — subsumption replaces like with like.`,
        );
      }
    }
  }

  /*
   * Cycles are found per capability rather than by one global colouring,
   * because the message should name the capability an author can open.
   */
  for (const capability of capabilities) {
    const seen = new Set<string>();

    /*
     * The direct self-edge is dropped, because it already has its own, better
     * message above. Reporting "subsumes itself" and "is part of a cycle" for
     * one line of one definition describes a single mistake twice.
     */
    const pending = capabilitySubsumes(capability).filter(
      (id) => id !== capability.id,
    );

    let cyclic = false;

    while (pending.length > 0) {
      const next = pending.pop();

      if (next === undefined) continue;

      if (next === capability.id) {
        cyclic = true;
        break;
      }

      if (seen.has(next)) continue;

      seen.add(next);

      pending.push(...capabilitySubsumes({ kind: capability.kind, id: next }));
    }

    if (cyclic) {
      issues.push(
        `${KIND_LABELS[capability.kind]} "${capability.id}" is part of a subsumption cycle, so nothing in it can ever be the surviving capability.`,
      );
    }
  }

  return issues;
}


/*
 * A Trait is something a character IS, and the things a character is do not
 * have training prerequisites.
 *
 * Ambidextrous is the case that makes this concrete. It is learnable, and the
 * way it is learned is that a GM awards it after the training — not that its
 * definition names a Skill nobody would otherwise take. Letting a Trait
 * require a Skill would also invert the dependency the rest of the system
 * relies on, since Skills and Techniques routinely require Traits.
 */
function findTraitPrerequisiteIssues(): readonly string[] {
  const issues: string[] = [];

  const forbidden = new Set([
    "hasSkill",
    "skillMastery",
    "hasTechnique",
    "techniqueMastery",
  ]);

  const walk = (
    traitId: string,
    requirement: Requirement,
    where: string,
  ): void => {
    if (forbidden.has(requirement.type)) {
      issues.push(
        `Trait "${traitId}"${where} requires ${requirement.type}, but a Trait may not depend on Skills or Techniques.`,
      );

      return;
    }

    if (requirement.type === "all" || requirement.type === "any") {
      for (const child of requirement.requirements) walk(traitId, child, where);
    }

    if (requirement.type === "not") walk(traitId, requirement.requirement, where);
  };

  for (const trait of traitRegistry.all()) {
    for (const requirement of trait.requirements ?? []) {
      walk(trait.id, requirement, "");
    }
  }

  return issues;
}


/**
 * Every way the capability graph fails to hold together.
 *
 * Returns strings for the same reason every other catalog check does: these
 * join one development-time list a host prints beside the file it loaded.
 */
export function findCapabilityDependencyIssues(): readonly string[] {
  const issues: string[] = [];

  const { reached, unlocked, capabilities } = computeReachability();

  issues.push(...findSubsumptionIssues(capabilities));
  issues.push(...findTraitPrerequisiteIssues());

  for (const capability of capabilities) {
    const label = KIND_LABELS[capability.kind];

    const base = acquisitionRank(capability);

    if (!reached.has(nodeKey(capability, base))) {
      /*
       * WHICH gate is shut, not merely that one is.
       *
       * The fixes are entirely different — write a prerequisite somebody can
       * meet, or write the content that offers this — and a capability gated
       * both ways with a perfectly good invitation would otherwise be reported
       * as possibly needing an invitation. So both gates are asked here,
       * against the settled reachable set, rather than inferred from the
       * declaration alone.
       */
      const key = nodeKey(capability, base);

      const qualifies = (capabilityRequirements(capability) ?? []).every(
        (requirement) => requirementReachable(requirement, reached),
      );

      const permitted =
        !capabilityRequiresUnlock(capability) || unlocked.has(key);

      const reason = permitted
        ? "its prerequisites cannot all be satisfied by anything that is itself obtainable"
        : qualifies
          ? "it requires an unlock, and nothing obtainable unlocks it"
          : "it requires an unlock that nothing obtainable supplies, and its prerequisites cannot all be satisfied either";

      issues.push(`${label} "${capability.id}" can never be acquired: ${reason}.`);

      continue;
    }

    const maximum = capabilityMaximumMastery(capability);

    for (let rank = base + 1; rank <= maximum; rank += 1) {
      if (reached.has(nodeKey(capability, rank))) continue;

      /*
       * Only the FIRST unreachable rank is reported. Everything above it is
       * unreachable for the same reason, and saying so eight more times
       * describes one problem as nine.
       */
      const authored = capabilityRanks(capability).find(
        (one) => one.rank === rank,
      );

      if ((authored?.requirements ?? []).length > 0) {
        issues.push(
          `${label} "${capability.id}" can never reach Mastery ${rank}: that rank's requirements cannot all be satisfied by anything that is itself obtainable.`,
        );
      }

      break;
    }
  }

  return issues;
}


/**
 * Whether a capability could ever be acquired by anybody.
 *
 * Exposed so a Workbench can grey out a definition it has just been handed
 * without re-running the whole catalog check, and so tests can ask the
 * question directly.
 */
export function isCapabilityEverAcquirable(
  capability: CapabilityRef,
): boolean {
  const { reached } = computeReachability();

  return reached.has(nodeKey(capability, acquisitionRank(capability)));
}


/**
 * The same question about one Mastery rank.
 */
export function isMasteryRankEverReachable(
  capability: CapabilityRef,
  rank: number,
): boolean {
  const { reached } = computeReachability();

  return reached.has(nodeKey(capability, rank));
}
