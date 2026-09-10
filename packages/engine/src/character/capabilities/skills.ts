/*
 * Skills — the concrete things a character can attempt on purpose.
 *
 * Direct Thrust, Wall Sticking, Pick Lock, Fire Blast. Anything a player
 * invents on the spot is an improvised attempt instead — see attempts.ts.
 *
 * ── Mastery is depth ────────────────────────────────────────────────────
 *
 * A Technique widens as it advances; a Skill deepens:
 *
 *   Wall Sticking I    → basic surface adhesion
 *   Wall Sticking II   → controlled movement while adhered
 *   Wall Sticking III  → adhesion under much greater force
 *
 * What a rank means is specific to the Skill, so there is no universal
 * per-rank bonus. A Skill declares its own ranks, and may end its track
 * early: three ranks is a complete Skill if the third is everything the Skill
 * has to give.
 *
 * A Skill may also declare no track at all. Activating a door rune is a thing
 * a character can either do or not do; there is no better way to do it and
 * nothing to advance. Such a Skill is held with NO Mastery rather than held at
 * Mastery I — see mastery.ts's trackMastery() — because a rank that can never
 * change is a rank a player will keep trying to spend Growth Points on.
 *
 * ── Requirements ────────────────────────────────────────────────────────
 *
 * Skills used to carry their own requirement shape — lists of Ability and
 * Technique ids, satisfied if any one list matched. That was a second, weaker
 * copy of rules/requirements.ts, and it could not express "DEX 14" or "Parry
 * II" at all. Skills now use the universal Requirements, so
 *
 *   Riposte: Swordsmanship IV, DEX base 14, Parry II
 *
 * is authorable data rather than a new requirement type.
 *
 * Those are ACQUISITION requirements and they are asked once. What a Skill
 * needs in order to WORK is asked every time it is used, and lives on the
 * application — see applications.ts. Fire Blast is learned with Fire Control
 * and refuses to fire without it, and those are two different checks of the
 * same Trait at two different moments.
 *
 * ── Nen Principles ──────────────────────────────────────────────────────
 *
 * Ten, Ren, Gyō and the rest are Skills conceptually and fit this shape, but
 * each introduces substantial Aura mechanics, so they keep dedicated
 * implementations under foundation/nen/principles/. They are the deliberate
 * exception to "content is data"; nothing else should follow them.
 */

import { findContentStructuralIssues } from "../rules/definitions";

import { composeStructuralValidators, createRegistry } from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";
import type { Effect } from "../rules/effects";
import { physicalExertionLoad } from "../foundation/body/endurance";

import {
  findSkillApplicationIssues,
  type SkillApplicationDefinition,
} from "./applications";

import {
  collectMasteryRankEffects,
  findMasteryTrackIssues,
  STANDARD_MASTERY_MAX,
  trackMastery,
  type MasteryRank,
  type MasteryTrack,
  type MasteryValue,
} from "./mastery";

export type SkillId = string;

/**
 * Engine-owned definition of a Skill.
 *
 * `requirements` gate learning or being granted it; `effects` apply while it
 * is known, with rank-specific ones on the ranks themselves.
 *
 * Execution timing used to live here as a flat `timings` list, which said the
 * only thing about using a Skill the shape could hold. It now lives inside the
 * application, alongside the Action cost, targets, Range, costs, check and
 * outcome that were never expressible at all — and it lives there ONLY. Two
 * places to declare when a Skill may be used is two answers to give a
 * scheduler, and the flat one would have won by being read first.
 */
export interface SkillDefinition extends EffectfulDefinition {
  /**
   * How this Skill may be used, and what using it costs and decides.
   *
   * REQUIRED. A Skill is a concrete thing a character does on purpose — that
   * is the whole definition at the top of this file — so one with no
   * application is an unfinished definition rather than a legitimate kind of
   * capability, and treating it as the latter produced two answers to one
   * question: resolution refused it while the requirement helper read its
   * absent requirement list as an empty one and reported it satisfied.
   *
   * The engine still never INVENTS one. An authoring tool that needs somewhere
   * to start calls minimalSkillApplication(), which writes a real, visible,
   * free-adjudication contract into the content; nothing in resolution or
   * validation supplies it.
   */
  readonly application: SkillApplicationDefinition;

  /**
   * How far this Skill can be deepened, and what each rank of it carries.
   *
   * Absent means the Skill has no Mastery: it is held or it is not.
   */
  readonly mastery?: MasteryTrack;

  /**
   * The Skills this one REPLACES.
   *
   * Declared, never inferred. A name that reads like a successor, a parent
   * Trait, and a prerequisite are all things content authors use for other
   * reasons, so guessing from any of them would silently retire capabilities
   * nobody meant to retire.
   *
   * Holding this one makes each listed Skill subsumed rather than gone:
   * the acquisition stays on the record, requirements naming it are still
   * satisfied, and its effects and grants are inherited by this one instead of
   * applying separately. Chains work — and are checked for cycles by
   * capabilities/dependencies.ts.
   */
  readonly subsumes?: readonly SkillId[];

  /**
   * Whether this may only be acquired once something has unlocked it.
   *
   * Off by default, which is the ordinary case: anything whose prerequisites a
   * character meets is theirs to take up. Turning it on says the prerequisites
   * are NOT the whole gate — a Clan's inner style is closed to outsiders who
   * would otherwise qualify perfectly well, and the Clan's grant is what opens
   * it.
   *
   * An unlock supplies PERMISSION, never prerequisites. Something declared
   * this way and reachable by nobody's unlock can never be acquired at all,
   * which capabilities/dependencies.ts reports.
   */
  readonly requiresUnlock?: boolean;
}

/**
 * A Skill the character knows.
 *
 * The stored rank is optional, and what its absence means depends on the
 * definition rather than on this entry: I for a Skill with a Mastery track,
 * and no Mastery at all for one without. Storing a rank against a Skill that
 * has no track is a validation error — see capabilities/validation.ts.
 */
export interface CharacterSkill {
  readonly skillId: SkillId;
  readonly mastery?: MasteryRank;
}

/*
 * The authored catalog.
 *
 * Each application is written out in full rather than built from shared
 * constants, because the neutral vocabularies live above Character and this
 * file may not import them — see architecture.test.ts. The literals are the
 * same values ONE_ACTION, EXACTLY_ONE_TARGET and the rest denote, and
 * findSkillCatalogIssues() checks every one of them through the neutral
 * validators, so a wrong literal here fails the suite rather than shipping.
 *
 *
 * ── WHAT THESE CONTRACTS DELIBERATELY DO NOT DECIDE ─────────────────────
 *
 * Combat has no check layer, no force-to-Body conversion and no calibrated
 * Aura pricing yet, and this catalog is not the place any of them gets
 * decided by default. An authored number here is a RULE the moment it ships:
 * it reaches players, other content is balanced against it, and nobody
 * afterwards can tell a considered value from a placeholder that survived.
 *
 * So every combat Skill below resolves by GUIDED NARRATIVE — the engine
 * gathers Range, timing, cost and threat and hands the decision to a person —
 * rather than naming an attack scope and an opposed contest nobody has
 * designed. Pick Lock keeps a real fixed DEX check because manipulating a
 * mechanism against a difficulty is not an undecided combat question.
 *
 * Absent for the same reason: Mastery changes (the mechanism is exercised by
 * test content, so a rank's meaning is authored when a rank's meaning is
 * decided) and Fire Blast's Aura price, which should be built at request time
 * from the power the character declares rather than frozen here as one number.
 *
 * What IS authored, and why each is a different kind of claim:
 *
 *   EFFORT is selected from foundation/body/endurance's own named exertion
 *   scale rather than invented — "ordinary-committed" is an existing anchor,
 *   not a number chosen here — and an omitted load would be defaulted by
 *   whoever read it.
 *
 *   AURA is stated even when it cannot be priced. `{ kind: "request-derived" }`
 *   says the price follows the power the character declares; leaving it out
 *   would have been charged as ZERO by Aura expenditure, which is a rule
 *   wearing the costume of a gap.
 *
 *   GEOMETRY is DECLARED but not decided. Range decides eligibility rather
 *   than success, so it cannot be adjudicated away — a profile with no Range
 *   is a punch usable from across the map. But the figures are not this
 *   catalog's to choose: reach belongs to the body doing the reaching, a
 *   Reaction's range to the action it answers, a blast's range and flight to
 *   the power the bender declared. Each is `{ kind: "context-derived" }` with
 *   the profile that must supply it, and NOTHING supplies them yet — a Skill
 *   declared this way cannot be projected into an action profile until the
 *   moment of use hands over a real value, which is the honest state of
 *   affairs rather than a literal standing in for one.
 *
 *   None of that reaches spatial/. A DistanceInterval is still resolved
 *   metres and knows nothing about bodies, Reactions or Aura; the unresolved
 *   half lives here and is gone before a profile exists.
 */
export const SKILL_DEFINITIONS = {
  punch: {
    id: "punch",
    name: "Punch",
    description: "Deliver a trained unarmed strike using the fist.",
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      { type: "hasTechnique", techniqueId: "martial-arts" },
    ],
    application: {
      action: {
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        targets: {
          cardinality: { minimum: 1, maximum: 1 },
          permittedKinds: ["entity", "body-part", "anatomical-point"],
        },
        /* A punch thrown at the ground declares no target and is still aimed. */
        permittedFocusKinds: ["none", "position"],
        /*
         * Reach is a fact about the body throwing the punch, so there is no
         * number to author: a Giant's reach and a child's are not the same
         * 1.5 metres, and writing one would make them so.
         */
        range: { kind: "context-derived", profileId: "body.reach" },
        executionDuration: {
          kind: "context-derived",
          profileId: "combat.action-duration",
        },
        /* Not contextual: a fist arrives when it arrives. */
        travel: { kind: "fixed", value: { kind: "instantaneous" } },
        threatens: "declared-targets",
      },
      role: "offense",
      cost: {
        exertionLoad: physicalExertionLoad("ordinary-committed"),
        /* Burns no deliberate Aura. Stated, because an omitted price is zero. */
        aura: { kind: "none" },
      },
      /*
       * Undecided, and said so. Whether a strike is an opposed contest of two
       * Derived Attributes, a fixed check against a defence value, or
       * something else is Combat's to settle; until it does, the engine
       * assembles the facts and a person calls it.
       */
      check: { kind: "adjudicated" },
      outcome: {
        kind: "guided-narrative",
        guidance: [
          {
            id: "punch-connects",
            summary: "The strike lands on the declared target.",
            consequences: [
              {
                id: "punch-impact",
                summary:
                  "The target takes the force of the blow. The force-to-Body conversion is Combat's and is not yet written.",
              },
            ],
          },
          {
            id: "punch-avoided",
            summary: "The target avoids or absorbs the strike.",
          },
        ],
      },
    },
  },

  parry: {
    id: "parry",
    name: "Parry",
    description: "React to an incoming attack by actively deflecting it.",
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      { type: "techniqueMastery", techniqueId: "martial-arts", minimumMastery: 2 },
    ],
    application: {
      action: {
        /*
         * Reaction only. A parry with nothing incoming is not a parry, and
         * making it available on a Turn would turn it into a free defence
         * nobody had to be threatened to receive.
         */
        allowedTimings: ["reaction"],
        structuredActionCost: { actions: 1 },
        targets: {
          cardinality: { minimum: 1, maximum: 1 },
          permittedKinds: ["entity"],
        },
        permittedFocusKinds: ["none"],
        /*
         * A Reaction's range is the range of what it answers: you can parry
         * what can reach you. Authoring 2 metres would let a Skill deflect a
         * blow it could not have been in the way of, and refuse one it was.
         */
        range: {
          kind: "context-derived",
          profileId: "reaction.trigger-range",
        },
        executionDuration: {
          kind: "context-derived",
          profileId: "combat.reaction-duration",
        },
        travel: { kind: "fixed", value: { kind: "instantaneous" } },
        /* Deflecting an attacker endangers nobody. */
      },
      role: "defense",
      cost: {
        exertionLoad: physicalExertionLoad("ordinary-committed"),
        /* Burns no deliberate Aura. Stated, because an omitted price is zero. */
        aura: { kind: "none" },
      },
      check: { kind: "adjudicated" },
      outcome: {
        kind: "guided-narrative",
        guidance: [
          {
            id: "parry-deflects",
            summary: "The incoming attack is turned aside.",
          },
          {
            id: "parry-fails",
            summary: "The attack comes through the guard.",
          },
        ],
      },
    },
  },

  "defensive-stance": {
    id: "defensive-stance",
    name: "Defensive Stance",
    description: "Enter a trained defensive fighting stance.",
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      { type: "techniqueMastery", techniqueId: "martial-arts", minimumMastery: 3 },
    ],
    application: {
      action: {
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        /*
         * A stance declares nothing and is aimed nowhere. Spelling that as
         * "targets self" would put the character into every consumer's list of
         * affected subjects for an act that affects nobody.
         */
        targets: { cardinality: { minimum: 0, maximum: 0 } },
        permittedFocusKinds: ["none"],
        /* Pointed at nothing, so there is no distance to require. Said, not omitted. */
        range: { kind: "none" },
        executionDuration: {
          kind: "context-derived",
          profileId: "combat.action-duration",
        },
      },
      role: "defense",
      cost: {
        exertionLoad: physicalExertionLoad("light"),
        /* Burns no deliberate Aura. Stated, because an omitted price is zero. */
        aura: { kind: "none" },
      },
      /*
       * The one combat Skill that genuinely decides nothing: settling into a
       * guard is a thing a trained fighter simply does. What the stance is
       * WORTH is a Combat question, and this contract does not answer it.
       */
      check: { kind: "automatic" },
      outcome: {
        kind: "automatic",
        outcome: {
          id: "stance-entered",
          summary: "The fighter settles into a defensive guard.",
        },
      },
    },
  },

  "pick-lock": {
    id: "pick-lock",
    name: "Pick Lock",
    description:
      "Manipulate a mechanical lock using trained lockpicking methods.",
    mastery: { maximumMastery: 5 },
    requirements: [
      { type: "hasTechnique", techniqueId: "lockpicking" },
    ],
    application: {
      action: {
        /*
         * Declared for structured time and used almost entirely outside it.
         * The Action cost is charged only when there is a Round to charge it
         * against; the exertion below is charged either way.
         */
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        targets: {
          cardinality: { minimum: 1, maximum: 1 },
          permittedKinds: ["object"],
        },
        permittedFocusKinds: ["none"],
        /*
         * How close you must be to a lock, and how long it takes, both depend
         * on the lock and on the tools — the task supplies them.
         */
        range: {
          kind: "context-derived",
          profileId: "task.lockpicking-range",
        },
        executionDuration: {
          kind: "context-derived",
          profileId: "task.lockpicking-duration",
        },
      },
      role: "utility",
      cost: {
        exertionLoad: physicalExertionLoad("light"),
        /* Burns no deliberate Aura. Stated, because an omitted price is zero. */
        aura: { kind: "none" },
      },
      /*
       * A real check, and not an undecided one. Manipulating a mechanism
       * against a difficulty the situation supplies is exactly what a fixed
       * DEX check is; no combat mechanic is being pre-empted.
       */
      check: {
        kind: "fixed",
        scope: { kind: "attribute", attribute: "dex" },
        tiePolicy: "succeeds",
      },
      outcome: {
        kind: "fixed",
        success: {
          id: "lock-opens",
          summary: "The mechanism gives and the lock opens.",
          consequences: [
            {
              id: "lock-opened",
              summary: "The lock is open; the host owns what that reveals.",
            },
          ],
        },
        failure: {
          id: "lock-holds",
          summary: "The mechanism does not give.",
        },
      },
    },
  },

  /*
   * The old two-part gate, unchanged in meaning: the capability to bend fire
   * at all, plus training in applying it. What changed is that both halves
   * are now ordinary requirement types rather than a bespoke pair of id
   * lists.
   *
   * And the ACQUISITION half is now only half the story. Fire Control is
   * required to learn Fire Blast and required again, separately, every time it
   * is used — see the application's own requirements. Losing the Trait leaves
   * the Skill on the sheet and makes it inaccessible until it comes back.
   */
  "fire-blast": {
    id: "fire-blast",
    name: "Fire Blast",
    description: "Project fire offensively using trained Firebending.",
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      {
        type: "all",
        requirements: [
          { type: "hasTrait", traitId: "firebending" },
          { type: "hasTechnique", techniqueId: "firebending-forms" },
        ],
      },
    ],
    application: {
      action: {
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        targets: {
          cardinality: { minimum: 1, maximum: 1 },
          permittedKinds: ["entity", "object", "position"],
        },
        permittedFocusKinds: ["none", "position", "direction"],
        /*
         * Reach and flight both follow the power the bender puts behind the
         * blast — the same declaration that prices its Aura — so both come
         * from that context rather than from a pair of numbers frozen here.
         * That fire CROSSES the gap rather than arriving instantly is a fact
         * about fire; how fast is not.
         */
        range: {
          kind: "context-derived",
          profileId: "aura.declared-power.range",
        },
        executionDuration: {
          kind: "context-derived",
          profileId: "combat.action-duration",
        },
        travel: {
          kind: "context-derived",
          profileId: "aura.declared-power.travel",
        },
        threatens: "declared-targets",
      },
      role: "offense",
      requirements: [
        {
          id: "fire-control",
          requirement: { type: "hasTrait", traitId: "firebending" },
          summary: "Fire Blast requires the ability to control fire.",
        },
      ],
      cost: {
        /*
         * The physical effort is authored: it is not the undecided part, and
         * an omitted load would be defaulted by whoever read it.
         */
        exertionLoad: physicalExertionLoad("forceful"),

        /*
         * The Aura price is REQUEST-DERIVED, which is a claim rather than a
         * gap. A blast costs what the bender decides to put behind it, so
         * there is no number to author — and saying nothing would have been
         * worse than guessing one, because Aura expenditure reads an omitted
         * figure as zero and a free Fire Blast resolves perfectly cleanly.
         *
         * Nothing prices this yet. What the declaration buys today is that
         * preparation is TOLD it needs the declared power, instead of
         * charging nothing and moving on.
         */
        aura: {
          kind: "request-derived",
          profileId: "aura.declared-power",
        },
      },
      check: { kind: "adjudicated" },
      outcome: {
        kind: "guided-narrative",
        guidance: [
          {
            id: "blast-lands",
            summary: "The blast reaches what it was aimed at.",
          },
          {
            id: "blast-goes-wide",
            summary: "The blast goes wide; the Aura is spent either way.",
          },
        ],
      },
    },
  },
} as const satisfies Record<string, SkillDefinition>;

const SKILL_REGISTRY = createRegistry<SkillDefinition>(
  "Skill",
  SKILL_DEFINITIONS,
  composeStructuralValidators(
    findContentStructuralIssues,
    findSkillDefinitionStructuralIssues,
  ),
);

export type KnownSkillId = keyof typeof SKILL_DEFINITIONS;

export function isKnownSkillId(skillId: SkillId): boolean {
  return SKILL_REGISTRY.isKnownId(skillId);
}

export function getSkillDefinition(
  skillId: SkillId,
): SkillDefinition | undefined {
  return SKILL_REGISTRY.get(skillId);
}

/**
 * The Mastery track a Skill declares, if it has one.
 *
 * An UNKNOWN id is treated as carrying the standard track rather than as
 * having none. Validation reports the unknown id; reading it as non-mastered
 * here would additionally discard whatever rank the sheet stored against it,
 * which is a second wrong answer to a problem that already has a message.
 */
export function skillMasteryTrack(
  skillId: SkillId,
): MasteryTrack | undefined {
  const definition = getSkillDefinition(skillId);

  if (definition === undefined) return { maximumMastery: STANDARD_MASTERY_MAX };

  return definition.mastery;
}

/** Whether a Skill has Mastery at all. */
export function skillSupportsMastery(skillId: SkillId): boolean {
  return skillMasteryTrack(skillId) !== undefined;
}

/**
 * The Mastery a character entry represents.
 *
 * Null means the Skill has no Mastery, which is NOT the same as not having the
 * Skill — absence from the character's list is what means that.
 */
export function skillMastery(skill: CharacterSkill): MasteryRank | null {
  return trackMastery(skillMasteryTrack(skill.skillId), skill.mastery);
}

/**
 * A character's Skills as the id → Mastery record resolution consumes.
 *
 * A null value is a Skill held with no Mastery, and is as real an entry as a
 * ranked one; a caller must not read it the way it reads a missing key.
 */
export function toSkillMasteryRecord(
  skills: readonly CharacterSkill[] = [],
): Readonly<Record<SkillId, MasteryRank | null>> {
  const record: Record<SkillId, MasteryRank | null> = {};

  for (const skill of skills) {
    record[skill.skillId] = skillMastery(skill);
  }

  return record;
}

/**
 * The maximum rank a Skill allows, or null when it has no Mastery.
 *
 * Unknown ids fall back to the standard maximum rather than throwing.
 */
export function skillMaximumMastery(skillId: SkillId): MasteryRank | null {
  return skillMasteryTrack(skillId)?.maximumMastery ?? null;
}

/**
 * Everything a character knowing this Skill at this Mastery contributes.
 *
 * Ranks are cumulative, so a Skill at III contributes the effects of I, II
 * and III. A Skill with no Mastery still contributes its own effects: having
 * no ranks is not the same as having nothing to give.
 */
export function collectSkillEffects(
  definition: SkillDefinition,
  mastery: MasteryValue | null,
): readonly Effect[] {
  const track = definition.mastery;

  return [
    ...(definition.effects ?? []),
    ...(track === undefined ? [] : collectMasteryRankEffects(track, mastery)),
  ];
}

/*
 * Development-time validation of the authored Skill catalog.
 *
 * Whether the ids a Skill's requirements point at actually exist is checked
 * by catalogs.ts, which can see every domain at once — asking this file to do
 * it would mean importing every catalog a requirement can name.
 */
/*
 * Reads a definition that may be anything.
 *
 * A registered definition arrives from a host, so every structural validator
 * starts by establishing that there is an object to read at all. The universal
 * checks in registry.ts have already refused a non-object by the time these
 * run, but they are exported and callable on their own, and a guard that only
 * holds because of the order two functions happen to be called in is not a
 * guard.
 */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}


/**
 * A Skill's own structure, beyond the universal rule vocabulary.
 *
 * Handed to the registry, so a Skill missing its application or carrying an
 * impossible Mastery threshold is refused rather than stored and complained
 * about later. Catalog-free: everything here is judged against the definition
 * itself and its OWN track, never against another catalog.
 */
export function findSkillDefinitionStructuralIssues(
  definition: unknown,
): readonly string[] {
  const skill = recordOf(definition);

  if (skill === undefined) return [];

  const issues: string[] = [];

  const track = skill["mastery"];

  if (track !== undefined) {
    issues.push(
      ...findMasteryTrackIssues("Skill", String(skill["id"]), track as MasteryTrack)
        .map((issue) => issue.replace(/^Skill "[^"]*" /, "")),
    );
  }

  const application = recordOf(skill["application"]);

  if (application === undefined) {
    /*
     * Required by the type, and checked anyway: a host registers content the
     * compiler never saw. A Skill with no application is an unfinished
     * definition rather than a kind of capability — and `application: null`
     * used to throw here rather than saying so.
     */
    issues.push("declares no application, so there is no way to use it.");

    return issues;
  }

  /*
   * FIELD GUARDS, ahead of a validator that cannot take `unknown`.
   *
   * findSkillApplicationIssues() is the authority on what an application must
   * contain, and it is large, deeply recursive and typed throughout. Widening
   * every field it reaches to `unknown` would be a rewrite of the contract
   * layer; guarding the fields it DEREFERENCES without checking is one block.
   *
   * The list is short, and deliberately not longer. Every other malformed
   * field already produces a proper diagnostic from the validator itself — a
   * missing Range says "must state its Range", which is a better sentence than
   * anything a shape guard would write — so pre-empting those would trade a
   * good message for a generic one to fix a fault that does not exist. What is
   * guarded here is exactly what the hostile sweep in
   * registration-barrier.test.ts found throwing, and that sweep is what keeps
   * the list honest when a field is added.
   */
  const action = recordOf(application["action"]);

  if (action === undefined) {
    issues.push("has an application that declares no action.");

    return issues;
  }

  const targets = recordOf(action["targets"]);

  if (targets === undefined || recordOf(targets["cardinality"]) === undefined) {
    issues.push("has an application whose targets declare no cardinality.");

    return issues;
  }

  const focusKinds = action["permittedFocusKinds"];

  if (focusKinds !== undefined && !Array.isArray(focusKinds)) {
    issues.push("has application focus kinds that are not a list.");

    return issues;
  }

  const declaredRequirements = application["requirements"];

  if (declaredRequirements !== undefined && !Array.isArray(declaredRequirements)) {
    issues.push("has application requirements that are not a list.");

    return issues;
  }

  const declaredChanges = application["masteryChanges"];

  if (declaredChanges !== undefined && !Array.isArray(declaredChanges)) {
    issues.push("has application masteryChanges that are not a list.");

    return issues;
  }

  /*
   * The application is checked against the Skill's OWN track, because the two
   * constrain each other: a trackless Skill may declare no Mastery changes,
   * and a threshold past the end of a real track is a rank nobody reaches.
   */
  for (const error of findSkillApplicationIssues(
    String(skill["id"]),
    application as unknown as SkillApplicationDefinition,
    track as MasteryTrack | undefined,
  )) {
    issues.push(`application: ${error.message}`);
  }

  return issues;
}


/*
 * Only the checks that need OTHER catalogs remain here; the Skill's own
 * structure is refused at registration by the validator above, which
 * findCatalogIssues() also runs over authored content.
 */
export function findSkillCatalogIssues(): readonly string[] {
  return SKILL_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const skillRegistry = SKILL_REGISTRY;
