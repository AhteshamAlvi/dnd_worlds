/*
 * Capability lifecycle: how a character comes to have something, and what
 * happens to it afterwards.
 *
 * Five different relationships used to share one word. A character could
 * "have" a Skill because they trained it, because an Item was lending it to
 * them, because their Clan had opened its style to them, because an Injury had
 * awarded it permanently, or because a newer Technique had absorbed the older
 * one it came from. The engine recorded all five the same way, so removing an
 * Item and forgetting a discipline were the same event.
 *
 * ── The three grant modes ───────────────────────────────────────────────
 *
 * effects.ts owns the vocabulary, because the mode is a field on the grant
 * Effect. What it MEANS is this file's business:
 *
 *   granted-while-present   access for as long as a source supplies it
 *   unlocked-for-acquisition permission to acquire, and nothing more
 *   granted-permanently     an award, keepable once written to the sheet
 *
 * ── Acquisition is a moment, not a condition ────────────────────────────
 *
 * A definition's `requirements` are ACQUISITION requirements: what has to be
 * true when the character takes it up. They are not a lease. Losing Fire
 * Control later does not erase Flame Lance, because the character learned
 * Flame Lance and learning happened. Whether they can still USE it is a
 * different question, asked of the application at execution time, and that
 * belongs to Ticket 3.3.
 *
 * Mastery-rank requirements are ADVANCEMENT requirements — what a further rank
 * asks — and live on the rank, not here.
 *
 * ── What this file will not do ──────────────────────────────────────────
 *
 * Everything here is pure. Evaluating acquisition spends no Growth Points,
 * advances no Mastery, and returns a new value rather than editing the
 * character it was asked about. An award is a RECORD of something to write
 * down, handed back to a caller that owns the writing.
 */

import type { Character } from "../types";

import {
  resolveRequirement,
  type RequirementContext,
  type RequirementDisposition,
  type RuleSourceRef,
} from "../rules/resolution";

import type { Requirement } from "../rules/requirements";

/*
 * TYPE-ONLY, and that is structural rather than stylistic. This file is
 * imported by identity/traits.ts as well as by the Skill and Technique
 * resolvers, so a value import of any catalog here would close a cycle. What
 * needs a definition looked up — a capability's requirements, what it subsumes
 * — is answered a layer up, in capabilities/dependencies.ts, which can see all
 * three catalogs without anything below it seeing back.
 */
import type { CharacterTrait } from "../identity/traits";
import type { CharacterSkill } from "./skills";
import type { CharacterTechnique } from "./techniques";

/*
 * Re-exported rather than redeclared. The kinds and the modes are properties
 * of the grant Effects, so effects.ts declares them; a second declaration here
 * would be two vocabularies for one fact, and the architecture suite would be
 * right to object.
 */
export {
  CAPABILITY_KINDS,
  CAPABILITY_GRANT_MODES,
  DEFAULT_CAPABILITY_GRANT_MODE,
  capabilityGrantMode,
  isCapabilityGrantMode,
} from "../rules/effects";

export type {
  CapabilityGrantMode,
  CapabilityKind,
  CapabilityRef,
} from "../rules/effects";

import type {
  CapabilityGrantMode,
  CapabilityKind,
  CapabilityRef,
} from "../rules/effects";

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether a capability the character's record mentions is actually theirs to
 * use.
 *
 * available:
 *   Theirs, and usable as far as the lifecycle is concerned.
 *
 * subsumed:
 *   Superseded by something else they have. It stays on the record — the
 *   acquisition happened and requirements naming it are still met — but it no
 *   longer contributes on its own account. See capabilities/resolution.ts.
 *
 * inaccessible:
 *   On the record without current access. What an unlock produces before it is
 *   taken up: the character MAY acquire it and does not have it.
 *
 * Application-specific inaccessibility — a Skill retained but unusable right
 * now — is Ticket 3.3's, and is a different question from this one.
 */
export const CAPABILITY_AVAILABILITIES = [
  "available",
  "subsumed",
  "inaccessible",
] as const;

export type CapabilityAvailability =
  typeof CAPABILITY_AVAILABILITIES[number];


export function isCapabilityAvailability(
  value: unknown,
): value is CapabilityAvailability {
  return typeof value === "string" &&
    (CAPABILITY_AVAILABILITIES as readonly string[]).includes(value);
}


/* -------------------------------------------------------------------------- */
/* Capability references                                                      */
/* -------------------------------------------------------------------------- */

export function capabilityRef(
  kind: CapabilityKind,
  id: string,
): CapabilityRef {
  return { kind, id };
}


export function isSameCapability(
  left: CapabilityRef,
  right: CapabilityRef,
): boolean {
  return left.kind === right.kind && left.id === right.id;
}


/**
 * A stable string for a capability, for use as a map key.
 *
 * The kind is part of it deliberately: a Skill and a Technique may share an
 * id, and collapsing them would let a Technique satisfy a Skill requirement.
 */
export function capabilityKey(capability: CapabilityRef): string {
  return `${capability.kind}:${capability.id}`;
}


/* -------------------------------------------------------------------------- */
/* Acquisition eligibility                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One requirement and what the character makes of it.
 *
 * The list is returned alongside the overall disposition so a UI can say WHICH
 * prerequisite is missing rather than only that one is. Keeping the requirement
 * itself rather than a rendered string means the caller phrases it; the engine
 * does not own anybody's wording.
 */
export interface RequirementResolution {
  readonly requirement: Requirement;
  readonly disposition: RequirementDisposition;
}


/**
 * Whether a character may take up a capability, and why.
 *
 * `unlocked` is orthogonal to `disposition`. An unlock grants permission, not
 * eligibility: a Clan opening its style to a member does not thereby give them
 * the Attributes the style asks for. Both have to be true for the character to
 * acquire something that is gated on both, and content that is unlocked by
 * nothing at all is simply not gated that way.
 */
export interface CapabilityAcquisitionEvaluation {
  readonly capability: CapabilityRef;
  readonly disposition: RequirementDisposition;
  readonly unlocked: boolean;
  readonly requirements: readonly RequirementResolution[];
}


export interface EvaluateCapabilityAcquisitionInput {
  readonly capability: CapabilityRef;

  /**
   * The capability's own acquisition requirements.
   *
   * Passed in rather than looked up, so this file needs no catalog and the
   * evaluator can be run against a definition a host has not registered yet.
   * capabilities/dependencies.ts has the catalog-aware form.
   */
  readonly requirements: readonly Requirement[];

  readonly context: RequirementContext;

  /** Sources currently unlocking this capability, if any. */
  readonly unlockedBy?: readonly RuleSourceRef[];
}


/**
 * Evaluate whether a character may acquire a capability.
 *
 * PURE, and deliberately incapable of the things a caller might expect it to
 * do: it spends nothing, advances nothing, and writes nothing. It also never
 * reads missing information as failure — an unfinished sheet produces
 * `unresolved`, which is a different answer from "no" with a different remedy.
 *
 * An id no catalog knows resolves to `unresolved` through the catalog-aware
 * wrapper, for the same reason: the engine cannot judge requirements it cannot
 * read, and validation reports the unknown id separately.
 */
export function evaluateCapabilityAcquisition(
  input: EvaluateCapabilityAcquisitionInput,
): CapabilityAcquisitionEvaluation {
  const { capability, context, requirements } = input;

  const unlocked = (input.unlockedBy ?? []).length > 0;

  const resolutions: RequirementResolution[] = requirements.map(
    (requirement) => ({
      requirement,
      disposition: resolveRequirement(requirement, context),
    }),
  );

  const dispositions = resolutions.map((one) => one.disposition);

  /*
   * `all` semantics, and the same precedence resolveRequirement uses: a
   * definite refusal outranks not-knowing, because one unmet prerequisite
   * settles the whole question however much else is unrecorded.
   */
  const disposition: RequirementDisposition =
    dispositions.includes("unsatisfied")
      ? "unsatisfied"
      : dispositions.includes("unresolved")
        ? "unresolved"
        : "satisfied";

  return { capability, disposition, unlocked, requirements: resolutions };
}


/* -------------------------------------------------------------------------- */
/* The shared lifecycle fold                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A source currently supplying a capability, and on what terms.
 *
 * The mode travels with the source because two sources can supply the same
 * capability differently — an Item lending it while a Clan unlocks it — and a
 * caller asking why the character still has something after selling the Item
 * needs to see which of them was which.
 */
export interface CapabilityGrantSource {
  readonly source: RuleSourceRef;
  readonly mode: CapabilityGrantMode;
}


/**
 * One grant, kind-agnostic.
 *
 * Skills, Techniques and Traits each name their id field differently in the
 * Effect that produced this; the fold below works on the shared shape.
 */
export interface CapabilityGrantEntry {
  readonly id: string;
  readonly source: RuleSourceRef;
  readonly mode: CapabilityGrantMode;
}


/**
 * The lifecycle half of a resolved capability: everything that is true of it
 * regardless of whether its kind has Mastery.
 *
 * Skills and Techniques extend this with their rank; Traits use it as it is,
 * which is what keeps "a Trait has no Mastery" true rather than merely
 * unpopulated.
 */
export interface CapabilityLifecycleEntry {
  readonly id: string;

  readonly isAuthored: boolean;
  readonly isGranted: boolean;
  readonly grantedBy: readonly CapabilityGrantSource[];

  readonly availability: CapabilityAvailability;
  readonly unlockedBy: readonly RuleSourceRef[];
  readonly subsumedBy: readonly CapabilityRef[];
}


export interface CapabilityLifecycle {
  /** Every capability of this kind the character's record has something to say about. */
  readonly entries: Readonly<Record<string, CapabilityLifecycleEntry>>;

  /**
   * Which subsumed capabilities each available one carries the contributions
   * of.
   *
   * Each subsumed id appears under EXACTLY ONE inheritor, which is what stops
   * a capability subsumed by two different replacements from applying its
   * effects twice.
   */
  readonly inherited: Readonly<Record<string, readonly string[]>>;
}


export interface FoldCapabilityLifecycleInput {
  readonly kind: CapabilityKind;

  /** Ids the character's own sheet lists, in sheet order. */
  readonly authoredIds: readonly string[];

  readonly grants: readonly CapabilityGrantEntry[];

  /** What one capability declares it replaces. Injected; see the import note. */
  readonly subsumes: (id: string) => readonly string[];
}


/**
 * Everything a capability's transitive `subsumes` chain reaches, excluding
 * itself.
 *
 * Cycle-safe by construction. Bad data is reported by
 * capabilities/dependencies.ts, and resolution has to terminate on it anyway —
 * a character sheet should not hang because two Techniques claim to replace
 * each other.
 */
function subsumptionClosure(
  id: string,
  subsumes: (id: string) => readonly string[],
): readonly string[] {
  const reached = new Set<string>();
  const pending = [...subsumes(id)];

  while (pending.length > 0) {
    const next = pending.pop();

    if (next === undefined) continue;

    /* Self-subsumption is meaningless rather than fatal: ignore and move on. */
    if (next === id || reached.has(next)) continue;

    reached.add(next);

    pending.push(...subsumes(next));
  }

  return [...reached];
}


/**
 * Fold authored capabilities, grants, unlocks and subsumption into one record
 * per capability.
 *
 * SHARED by all three kinds on purpose. The rules about what a grant mode does
 * and what subsumption means are the same for a Trait and for a Skill, and the
 * one time they were written twice — Traits had their own resolver — the two
 * copies immediately disagreed about whether a granted capability could also be
 * authored.
 *
 * The three modes land differently:
 *
 * - granted-while-present and granted-permanently supply ACCESS, so they put
 *   the capability in the record as available;
 * - unlocked-for-acquisition supplies PERMISSION, so on its own it produces an
 *   `inaccessible` entry carrying `unlockedBy` and nothing else. That entry is
 *   the record of an offer, not of a possession.
 */
export function foldCapabilityLifecycle(
  input: FoldCapabilityLifecycleInput,
): CapabilityLifecycle {
  const { kind, authoredIds, grants, subsumes } = input;

  const accessSources = new Map<string, CapabilityGrantSource[]>();
  const unlockSources = new Map<string, RuleSourceRef[]>();

  const sameSource = (left: RuleSourceRef, right: RuleSourceRef): boolean =>
    left.type === right.type && left.id === right.id;

  for (const grant of grants) {
    if (grant.mode === "unlocked-for-acquisition") {
      const existing = unlockSources.get(grant.id) ?? [];

      if (!existing.some((source) => sameSource(source, grant.source))) {
        existing.push(grant.source);
      }

      unlockSources.set(grant.id, existing);

      continue;
    }

    const existing = accessSources.get(grant.id) ?? [];

    /*
     * One entry per source AND mode. The same Item granting the same Skill
     * twice is one provenance; an Item lending it and an Injury awarding it
     * are two, and losing one must leave the other visible.
     */
    if (
      !existing.some(
        (recorded) =>
          sameSource(recorded.source, grant.source) &&
          recorded.mode === grant.mode,
      )
    ) {
      existing.push({ source: grant.source, mode: grant.mode });
    }

    accessSources.set(grant.id, existing);
  }

  /* Authored order first, then whatever grants added, so output is stable. */
  const authored = new Set(authoredIds);

  const held: string[] = [
    ...authoredIds.filter((id, index) => authoredIds.indexOf(id) === index),
    ...[...accessSources.keys()].filter((id) => !authored.has(id)),
  ];

  /*
   * A capability is subsumed only by something that is not itself subsumed.
   *
   * With A <- B <- C all held, C is the live one and both A and B answer to
   * it; attributing A to B as well would name a replacement that has itself
   * been replaced. And if the declarations form a cycle there are no live ones
   * at all, so nothing is subsumed and everything still applies — degrading to
   * "all of it" beats degrading to "none of it" on data that is already known
   * to be wrong.
   */
  const closures = new Map<string, readonly string[]>();

  for (const id of held) closures.set(id, subsumptionClosure(id, subsumes));

  const anySubsumed = new Set<string>();

  for (const reached of closures.values()) {
    for (const id of reached) anySubsumed.add(id);
  }

  const roots = held.filter((id) => !anySubsumed.has(id));

  const subsumedBy = new Map<string, CapabilityRef[]>();
  const inherited: Record<string, string[]> = {};
  const claimed = new Set<string>();

  for (const root of roots) {
    inherited[root] = [];

    for (const id of closures.get(root) ?? []) {
      const existing = subsumedBy.get(id) ?? [];

      existing.push({ kind, id: root });

      subsumedBy.set(id, existing);

      /* First inheritor carries the contributions; the rest only claim it. */
      if (!claimed.has(id)) {
        claimed.add(id);
        inherited[root]!.push(id);
      }
    }
  }

  const entries: Record<string, CapabilityLifecycleEntry> = {};

  const record = (
    id: string,
    isAuthored: boolean,
    grantedBy: readonly CapabilityGrantSource[],
  ): void => {
    const replacedBy = subsumedBy.get(id) ?? [];

    const hasAccess = isAuthored || grantedBy.length > 0;

    entries[id] = {
      id,

      isAuthored,
      isGranted: grantedBy.length > 0,
      grantedBy,

      availability: replacedBy.length > 0
        ? "subsumed"
        : hasAccess
          ? "available"
          : "inaccessible",

      unlockedBy: unlockSources.get(id) ?? [],
      subsumedBy: replacedBy,
    };
  };

  for (const id of held) {
    record(id, authored.has(id), accessSources.get(id) ?? []);
  }

  /*
   * A capability nobody holds directly but which something they hold replaces.
   * It goes on the record so that requirements naming the older capability are
   * still met by the newer one, which is the point of declaring subsumption at
   * all.
   */
  for (const id of subsumedBy.keys()) {
    if (entries[id] === undefined) record(id, false, []);
  }

  /* And an offer nobody has taken up yet. */
  for (const id of unlockSources.keys()) {
    if (entries[id] === undefined) record(id, false, []);
  }

  return { entries, inherited };
}


/**
 * Whether a lifecycle entry describes something the character can actually
 * use.
 *
 * A subsumed capability counts: the character has it, through its replacement,
 * and requirements naming it are met. An inaccessible one does not — an unlock
 * is an offer.
 */
export function isHeldCapability(
  entry: Pick<CapabilityLifecycleEntry, "availability">,
): boolean {
  return entry.availability !== "inaccessible";
}


/* -------------------------------------------------------------------------- */
/* Permanent awards                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A capability the character has been permanently given, and by what.
 *
 * Produced by resolution and consumed by whoever owns the character's stored
 * state. It is a RECORD of something to write down, not the writing: resolution
 * is pure, so an Injury that permanently awards a Trait cannot reach into the
 * sheet and add it. The host commits the award when it is ready to, and the
 * award says enough to explain itself in a changelog afterwards.
 */
export interface CapabilityAward {
  readonly capability: CapabilityRef;
  readonly source: RuleSourceRef;
}


/**
 * The awards a set of grants amounts to.
 *
 * Only granted-permanently produces one. A while-present grant is on loan and
 * a permanent one is a gift, and the difference is exactly whether the
 * character keeps it after the giver is gone.
 */
export function collectCapabilityAwards(
  kind: CapabilityKind,
  grants: readonly CapabilityGrantEntry[],
): readonly CapabilityAward[] {
  const awards: CapabilityAward[] = [];

  for (const grant of grants) {
    if (grant.mode !== "granted-permanently") continue;

    const alreadyRecorded = awards.some(
      (award) =>
        award.capability.id === grant.id &&
        award.source.type === grant.source.type &&
        award.source.id === grant.source.id,
    );

    if (alreadyRecorded) continue;

    awards.push({ capability: { kind, id: grant.id }, source: grant.source });
  }

  return awards;
}


/**
 * The three authored capability lists an award can land in.
 */
export interface CapabilityAcquisitions {
  readonly traits: readonly CharacterTrait[];
  readonly techniques: readonly CharacterTechnique[];
  readonly skills: readonly CharacterSkill[];
}


/**
 * Write a set of awards into a character's authored capability lists.
 *
 * IDEMPOTENT, which is the whole reason this is a function rather than three
 * pushes at the call site. The same award is produced on every resolution for
 * as long as the awarding content applies, so committing it twice must be
 * indistinguishable from committing it once — otherwise a Trait awarded by a
 * permanent Injury accumulates a duplicate entry per save.
 *
 * An award adds the capability at its baseline: no stored Mastery, which
 * capabilities/mastery.ts reads as I on a track and as no Mastery without one.
 * A capability the character already has is left exactly as it is, rank
 * included — an award must never overwrite training.
 */
export function commitCapabilityAwards(
  current: CapabilityAcquisitions,
  awards: readonly CapabilityAward[],
): CapabilityAcquisitions {
  const traits = [...current.traits];
  const techniques = [...current.techniques];
  const skills = [...current.skills];

  const traitIds = new Set(traits.map((trait) => trait.traitId));
  const techniqueIds = new Set(
    techniques.map((technique) => technique.techniqueId),
  );
  const skillIds = new Set(skills.map((skill) => skill.skillId));

  for (const award of awards) {
    const { kind, id } = award.capability;

    if (kind === "trait" && !traitIds.has(id)) {
      traitIds.add(id);
      traits.push({ traitId: id });
    }

    if (kind === "technique" && !techniqueIds.has(id)) {
      techniqueIds.add(id);
      techniques.push({ techniqueId: id });
    }

    if (kind === "skill" && !skillIds.has(id)) {
      skillIds.add(id);
      skills.push({ skillId: id });
    }
  }

  return { traits, techniques, skills };
}


/**
 * The same commit against a whole Character.
 *
 * Returns a NEW Character; the one passed in is untouched, which is the rule
 * resolution follows everywhere and the reason awards exist as data at all.
 */
export function commitCapabilityAwardsToCharacter(
  character: Character,
  awards: readonly CapabilityAward[],
): Character {
  const committed = commitCapabilityAwards(
    {
      traits: character.traits ?? [],
      techniques: character.techniques ?? [],
      skills: character.skills ?? [],
    },
    awards,
  );

  return {
    ...character,
    traits: committed.traits,
    techniques: committed.techniques,
    skills: committed.skills,
  };
}
