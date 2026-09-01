/*
 * Body validation, gathered into one surface.
 *
 * Every rule here already existed and still lives in the subsystem that owns
 * it — anatomy structure in anatomy/validation.ts, sensitivity bounds in
 * morphology/validation.ts, and so on. This file adds no rules. It decides
 * WHICH of them a whole body has to satisfy, and tags each failure with the
 * domain it came from so the character layer can turn it into an EngineError
 * without knowing anything about Body's internals.
 *
 * That split matters. Before this existed, seven validators were implemented,
 * exported and tested, and nothing called them on an actual character: a body
 * with an impossible sensitivity or a cyclic Height graph validated clean and
 * then threw somewhere inside resolution. The validators were never the
 * missing piece; the caller was.
 *
 *
 * TWO SWEEPS, AND WHY
 *
 *   findBodyResolutionBlockers   preconditions resolution cannot survive
 *   findBodyValidationIssues     everything a body must satisfy, blockers included
 *
 * The first is what resolveBody itself runs, because a body missing a
 * BodyPartDefinition does not produce a wrong number, it produces a thrown
 * error three modules deep. Turning those into an EngineResult failure at the
 * top is what lets an invalid sheet be REPORTED rather than crash the caller.
 *
 * The second is what character validation runs. It is a superset: a body can
 * be perfectly resolvable and still be illegal — a Human at 240 cm resolves
 * fine and is not a Human.
 */

import { findAgeProfileIssues } from "./age/validation";
import { validateAnatomyData } from "./anatomy/validation";
import {
  findMorphologyValueIssues,
  findSensitivityIssues,
} from "./morphology/validation";
import { validateMeasurementInputs } from "./measurements/validation";
import { validateStructuralCapacityInputs } from "./structure/validation";
import { findStrengthMonotonicityIssues } from "./strength/validation";
import { validateSpeciesStatureBands } from "./stature/validation";
import type {
  DiagnosticAudience,
  DiagnosticSubject,
  EngineError,
} from "../../../infrastructure/diagnostics";
import type { BodyMorphology } from "./types";
import type { SpeciesAgeProfile } from "./age/types";
import type { SpeciesStatureBands } from "./stature/types";
import type { MorphologyResolutionInput } from "./morphology/types";
import type {
  Anatomy,
  AnatomySlotKey,
  BodyPartDefinition,
  BodyPartId,
  ReferenceForm,
} from "./anatomy/types";


/*
 * Which Body subsystem rejected the body.
 *
 * Carried rather than folded into the message so a caller can build a stable
 * error code from it, and so a UI can group failures the way the engine
 * organises them.
 */
export type BodyValidationDomain =
  | "anatomy"
  | "morphology"
  | "measurements"
  | "structure"
  | "strength"
  | "age"
  | "stature";


/*
 * One Body validation failure, flattened.
 *
 * `code` is the owning subsystem's own issue code, unchanged. Rewording it
 * here would mean two vocabularies for one failure and a mapping table to keep
 * in step; the domain tag is enough to make it unambiguous.
 */
export interface BodyValidationIssue {
  readonly domain: BodyValidationDomain;
  readonly code: string;
  readonly message: string;

  readonly partId?: BodyPartId;
  readonly definitionId?: string;
}


/*
 * Everything the full sweep needs.
 *
 * Deliberately the resolver's inputs AND its resolved morphology, rather than
 * a body to re-resolve. Validating against morphology this file computed
 * itself would make it a second implementation of the layer stack, and the
 * two would eventually disagree about which body was being judged.
 */
export interface BodyValidationInput {
  readonly anatomy: Anatomy;
  readonly referenceForm: ReferenceForm;
  readonly definitions: readonly BodyPartDefinition[];

  readonly morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>;
  readonly morphologyBySlotId: Readonly<Record<string, BodyMorphology>>;

  readonly effectiveScale: number;

  readonly adiposeTissueDensityKgPerL?: number;

  /*
   * The morphology a character and their Species authored, checked for values
   * that are not multipliers at all. Separate from the resolved maps because a
   * resolved 0 could come from any layer, and the author needs to know which.
   */
  readonly authoredMorphology?: MorphologyResolutionInput;

  readonly ageProfile?: SpeciesAgeProfile;

  readonly statureBands?: SpeciesStatureBands;
}


function tag(
  domain: BodyValidationDomain,
  issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly partId?: BodyPartId;
    readonly definitionId?: string;
    readonly subjectId?: string;
  }[],
): readonly BodyValidationIssue[] {
  return issues.map((issue) => ({
    domain,
    code: issue.code,
    message: issue.message,
    ...(issue.partId !== undefined ? { partId: issue.partId } : {}),
    ...(issue.definitionId !== undefined
      ? { definitionId: issue.definitionId }
      : issue.subjectId !== undefined
        ? { definitionId: issue.subjectId }
        : {}),
  }));
}


/*
 * The preconditions body resolution cannot proceed without.
 *
 * Exactly the two things the physical resolvers assume rather than check: that
 * every part they will walk has a definition, and that Effective Scale is a
 * number a body can be built at. Both are reported here so resolveBody can
 * fail cleanly instead of throwing from inside measurements or Structural
 * Capacity.
 *
 * Morphology is deliberately NOT supplied to validateMeasurementInputs here.
 * Its resolved-mass check needs morphology that has not been computed yet at
 * the point resolution runs this, and that check is not a precondition — a
 * part resolving to negative mass is a wrong answer, not a crash. The full
 * sweep runs it with morphology in hand.
 */
export function findBodyResolutionBlockers(
  anatomy: Anatomy,
  referenceForm: ReferenceForm,
  definitions: readonly BodyPartDefinition[],
  effectiveScale: number,
): readonly BodyValidationIssue[] {
  const measurements = validateMeasurementInputs(
    anatomy,
    definitions,
    effectiveScale,
  );

  /*
   * Reference Form slots are checked through the Strength validator because
   * that is where the rule already lives — the form is the Strength
   * numerator's part list, and "unknown-reference-form-type" is its own issue
   * code. Only that code is a blocker; the rest of what it reports (non-
   * positive Muscularity, sensitivity bounds) is a wrong answer rather than an
   * impossible one, and belongs to the full sweep.
   */
  const form = findStrengthMonotonicityIssues(
    referenceForm,
    definitions,
    {},
  ).filter((issue) => issue.code === "unknown-reference-form-type");

  return [
    ...tag("measurements", measurements.issues),
    ...tag("strength", form),
  ];
}


/*
 * Every rule a resolved body has to satisfy.
 *
 * Stature is the one rule not decided here. `validateSpeciesStatureBands`
 * checks that the BANDS are coherent; whether this particular body sits inside
 * them is a question about Traits and Conditions, which Body must not know
 * about — see stature/justification.ts.
 */
export function findBodyValidationIssues(
  input: BodyValidationInput,
): readonly BodyValidationIssue[] {
  const issues: BodyValidationIssue[] = [];

  const anatomy = validateAnatomyData(input.anatomy, input.definitions);

  issues.push(...tag("anatomy", anatomy.issues));

  for (const definition of input.definitions) {
    issues.push(...tag("morphology", findSensitivityIssues(definition)));
  }

  const authored = input.authoredMorphology;

  if (authored !== undefined) {
    const sources = [
      ["species", authored.species],
      ["age", authored.age],
      ["character", authored.character],
    ] as const;

    for (const [label, source] of sources) {
      issues.push(
        ...tag(
          "morphology",
          findMorphologyValueIssues(source.global, `${label} (global)`),
        ),
      );

      for (const [slotKey, local] of Object.entries(source.local)) {
        issues.push(
          ...tag(
            "morphology",
            findMorphologyValueIssues(
              local,
              `${label} (${slotKey as AnatomySlotKey})`,
            ),
          ),
        );
      }
    }

    if (
      !Number.isFinite(authored.strengthDevelopmentMuscularity) ||
      authored.strengthDevelopmentMuscularity <= 0
    ) {
      issues.push({
        domain: "morphology",
        code: "invalid-morphology-value",
        message:
          `Strength development Muscularity is ` +
          `${authored.strengthDevelopmentMuscularity}. It is a multiplier ` +
          "around 1 and must be finite and greater than zero.",
      });
    }
  }

  issues.push(
    ...tag(
      "measurements",
      validateMeasurementInputs(
        input.anatomy,
        input.definitions,
        input.effectiveScale,
        input.morphologyByPartId,
        input.adiposeTissueDensityKgPerL,
      ).issues,
    ),
  );

  issues.push(
    ...tag(
      "structure",
      validateStructuralCapacityInputs(
        input.anatomy,
        input.definitions,
        input.morphologyByPartId,
      ).issues,
    ),
  );

  issues.push(
    ...tag(
      "strength",
      findStrengthMonotonicityIssues(
        input.referenceForm,
        input.definitions,
        input.morphologyBySlotId,
      ),
    ),
  );

  if (input.ageProfile !== undefined) {
    issues.push(...tag("age", findAgeProfileIssues(input.ageProfile)));
  }

  if (input.statureBands !== undefined) {
    issues.push(
      ...tag("stature", validateSpeciesStatureBands(input.statureBands).issues),
    );
  }

  return issues;
}


/*
 * Who a Body failure is for.
 *
 * Every one of these is a fact about authored DATA — a definition, a body
 * plan, a Species profile — rather than about a choice anyone made at the
 * table. A player cannot fix a BodyPartDefinition with an out-of-range
 * sensitivity, and telling them about it is noise. Stature is the exception
 * and is not routed through here: an out-of-band height is a GM decision, and
 * stature/justification.ts builds its own errors saying so.
 */
const BODY_ISSUE_AUDIENCE: DiagnosticAudience = "developer";


/*
 * Turns one Body validation issue into an EngineError.
 *
 * The code is `body.<domain>.<the subsystem's own code>`, so a failure is
 * traceable straight back to the module that rejected it, and matches the
 * shape stature/justification.ts already emits (`body.stature.unjustified-height`).
 */
export function toBodyEngineError(
  issue: BodyValidationIssue,
  subject?: DiagnosticSubject,
): EngineError {
  return {
    code: `body.${issue.domain}.${issue.code}`,
    message: issue.message,
    audience: BODY_ISSUE_AUDIENCE,
    ...(subject !== undefined ? { subject } : {}),
    ...(issue.partId !== undefined ? { actual: issue.partId } : {}),
    resolution:
      issue.definitionId !== undefined
        ? `Correct the "${issue.definitionId}" definition, or the body plan referencing it.`
        : "Correct the authored anatomy, morphology or Species profile this body resolves from.",
  };
}
