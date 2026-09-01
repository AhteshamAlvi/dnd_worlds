/*
 * The root Body resolver.
 *
 * Orchestration only. Every formula belongs to a submodule and stays there;
 * this file decides the ORDER, which is the one thing no submodule can know.
 *
 * The order is not a style choice — it is the dependency graph, and it runs
 * strictly one way:
 *
 *   Species / Age / Character morphology / Effects
 *        v
 *   Effective Scale, Reference Form, Anatomy
 *        v
 *   Morphology            (slot-keyed persistent values -> per-part)
 *        v
 *   Measurements          form and present, identical formulas
 *        v
 *   Structural Capacity
 *        |
 *        +--> Strength    SC x force factor -> normalized SP
 *        |
 *        +--> Body Points SC x build x CON x destruction resistance
 *                  v
 *             Capability  accessibility, effectiveness
 *                  v
 *             Locomotion
 *
 * Constitution enters at Body Points and NOWHERE else. Structural Capacity,
 * Intrinsic SP, normalized SP and therefore Strength never read it, which is
 * what makes "resolve attributes, then Body, then Strength" an ordering rather
 * than a cycle.
 *
 * Nothing here reads a Derived Attribute, and nothing in body/ imports from
 * attributes/. Body produces physical values; the Attribute layer consumes
 * them.
 */

import { createTraceNode } from "../../../infrastructure/trace";
import type { EngineResult } from "../../../infrastructure/result";
import type { TraceNode } from "../../../infrastructure/trace";
import type { JsonValue } from "../../../infrastructure/json";

/*
 * Trace output is JSON, and every resolved Body value is deeply readonly.
 * The cast is confined to this one helper rather than sprinkled through every
 * node, so the trace stays a faithful copy of what was resolved instead of a
 * hand-maintained summary that could drift from it.
 */
const traced = (value: unknown): JsonValue => value as JsonValue;

import { resolveBodyCapability } from "./capability";
import { resolveLocomotion } from "./locomotion";
import { resolveBodyMeasurementViews } from "./measurements/resolution";
import {
  morphologyTargetsForAnatomy,
  morphologyTargetsForReferenceForm,
  resolveMorphology,
} from "./morphology/resolution";
import { resolveBodyPoints } from "./body-points/resolution";
import { resolveCriticalPoints } from "./critical-points/resolution";
import { resolveBodyStructuralCapacity } from "./structure/resolution";
import { resolveBodyStrength } from "./strength/resolution";
import { resolveEffectiveScale } from "./scale";
import { DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L } from "./measurements/resolution";

import type { AnatomicalPointStates } from "./critical-points/state";
import type { BodyPointModifier } from "./body-points/types";
import type { BodyResolutionMode } from "./resolution-mode";
import type { InaccessibilitySource } from "./capability";
import type { MorphologyResolutionInput } from "./morphology/types";
import type { ResolvedBodyCapability } from "./capability";
import type { ResolvedBodyMeasurementViews } from "./measurements/types";
import type { ResolvedBodyPoints } from "./body-points/types";
import type { ResolvedBodyStrength } from "./strength/types";
import type { ResolvedBodyStructuralCapacity } from "./structure/types";
import type { ResolvedCriticalPoints } from "./critical-points/types";
import type { ResolvedLocomotion } from "./locomotion";
import type { SpecialPointDefinition } from "./critical-points/types";
import type {
  Anatomy,
  BodyPartDefinition,
  ReferenceForm,
} from "./anatomy/types";


export interface BodyResolutionInput {
  readonly anatomy: Anatomy;
  readonly referenceForm: ReferenceForm;

  readonly definitions: readonly BodyPartDefinition[];
  readonly specialPointDefinitions: readonly SpecialPointDefinition[];

  readonly morphology: MorphologyResolutionInput;

  readonly speciesStandardScale: number;
  readonly ageScale: number;
  readonly characterScale: number;

  readonly constitution: number;

  readonly adiposeTissueDensityKgPerL?: number;

  readonly anatomicalPoints?: AnatomicalPointStates;
  readonly bodyPointModifiers?: readonly BodyPointModifier[];
  readonly inaccessibility?: readonly InaccessibilitySource[];

  readonly mode?: BodyResolutionMode;
}


export interface ResolvedBody {
  readonly mode: BodyResolutionMode;

  readonly effectiveScale: number;

  readonly measurements: ResolvedBodyMeasurementViews;
  readonly structure: ResolvedBodyStructuralCapacity;
  readonly strength: ResolvedBodyStrength;
  readonly points: ResolvedBodyPoints;
  readonly anatomicalPoints: ResolvedCriticalPoints;
  readonly capability: ResolvedBodyCapability;
  readonly locomotion: ResolvedLocomotion;
}


/*
 * Resolves a body completely, with a trace that explains every number.
 *
 * The trace is per-part, not merely per-stage. A root-only trace can say a
 * Giant is normalized 10,000 and cannot say why this Arm weighs what it does,
 * which is the question people actually bring. Each stage node therefore
 * carries its own per-part outputs and the factors that produced them.
 */
export function resolveBody(
  input: BodyResolutionInput,
): EngineResult<ResolvedBody> {
  const mode = input.mode ?? "resolved";

  const effectiveScale = resolveEffectiveScale(
    input.speciesStandardScale,
    input.ageScale,
    input.characterScale,
  );

  const adiposeDensity =
    input.adiposeTissueDensityKgPerL ??
    DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L;

  const children: TraceNode[] = [];

  children.push(
    createTraceNode({
      id: "body.scale",
      label: "Effective Scale",
      formula: "speciesStandardScale x ageScale x characterScale",
      inputs: {
        speciesStandardScale: { value: input.speciesStandardScale },
        ageScale: { value: input.ageScale },
        characterScale: { value: input.characterScale },
      },
      output: traced({ effectiveScale }),
    }),
  );

  /* ---- morphology ---------------------------------------------------- */

  const morphologyByPartId = resolveMorphology(
    input.morphology,
    morphologyTargetsForAnatomy(input.anatomy),
  );

  const morphologyBySlotId = resolveMorphology(
    input.morphology,
    morphologyTargetsForReferenceForm(input.referenceForm),
  );

  children.push(
    createTraceNode({
      id: "body.morphology",
      label: "Morphology",
      formula: "product of species, age, character, strength-development layers",
      output: traced({ byPartId: morphologyByPartId, bySlotId: morphologyBySlotId }),
    }),
  );

  /* ---- measurements --------------------------------------------------- */

  const measurements = resolveBodyMeasurementViews(
    input.anatomy,
    input.referenceForm,
    input.definitions,
    morphologyByPartId,
    morphologyBySlotId,
    effectiveScale,
    adiposeDensity,
  );

  children.push(
    createTraceNode({
      id: "body.measurements",
      label: "Length, Size and Mass",
      formula:
        "size = refSize x scale^3 x length x bulk x adiposity; " +
        "mass = leanMass x scale^3 x length x bulk x composition + adiposeMass",
      inputs: { adiposeTissueDensityKgPerL: { value: adiposeDensity } },
      output: traced({
        form: {
          sizeL: measurements.form.totalSizeL,
          massKg: measurements.form.totalMassKg,
          parts: measurements.form.parts,
        },
        present: {
          sizeL: measurements.present.totalSizeL,
          massKg: measurements.present.totalMassKg,
          heightCm: measurements.present.heightCm,
          parts: measurements.present.parts,
        },
      }),
    }),
  );

  /* ---- structure ------------------------------------------------------ */

  const structure = resolveBodyStructuralCapacity(
    input.anatomy,
    input.definitions,
    morphologyByPartId,
    effectiveScale,
  );

  children.push(
    createTraceNode({
      id: "body.structure",
      label: "Structural Capacity",
      formula: "refSC x effectiveScale^2 x muscularityStructuralFactor",
      output: traced({ totalStructuralCapacity: structure.totalStructuralCapacity, parts: structure.parts }),
    }),
  );

  /* ---- strength ------------------------------------------------------- */

  const strength = resolveBodyStrength(
    {
      anatomy: input.anatomy,
      referenceForm: input.referenceForm,
      definitions: input.definitions,
      base: { morphologyByPartId: morphologyBySlotId, effectiveScale },
      resolved: { morphologyByPartId, effectiveScale },
    },
    { mode },
  );

  children.push(
    createTraceNode({
      id: "body.strength",
      label: "Strength Points and normalization",
      formula:
        "normalizedBodySP = 100 x referenceFormIntrinsicSP / " +
        "referenceFormAnatomicalCapacity",
      output: traced({
        referenceFormIntrinsicSP: strength.referenceFormIntrinsicSP,
        referenceFormAnatomicalCapacity:
          strength.referenceFormAnatomicalCapacity,
        normalizedBodySP: strength.normalizedBodySP,
        presentIntrinsicSP: strength.presentIntrinsicSP,
        formParts: strength.formParts,
        presentParts: strength.presentParts,
      }),
    }),
  );

  /* ---- body points ---------------------------------------------------- */

  const points = resolveBodyPoints({
    anatomy: input.anatomy,
    definitions: input.definitions,
    morphologyByPartId,
    effectiveScale,
    constitution: input.constitution,
    ...(input.bodyPointModifiers !== undefined
      ? { modifiers: input.bodyPointModifiers }
      : {}),
  });

  children.push(
    createTraceNode({
      id: "body.points",
      label: "Body Points and integrity",
      formula: "SC x buildFactor x 2^((CON - 10) / 2) x destructionResistance",
      inputs: { constitution: { value: input.constitution } },
      output: traced({
        aggregateMaximumBP: points.aggregateMaximumBP,
        parts: points.parts,
      }),
    }),
  );

  /* ---- points, capability, locomotion --------------------------------- */

  const anatomicalPoints = resolveCriticalPoints(
    input.anatomy,
    input.definitions,
    input.specialPointDefinitions,
  );

  const capability = resolveBodyCapability({
    anatomy: input.anatomy,
    points: anatomicalPoints,
    pointStates: input.anatomicalPoints ?? {},
    bodyPoints: points,
    ...(input.inaccessibility !== undefined
      ? { inaccessibility: input.inaccessibility }
      : {}),
  });

  const locomotion = resolveLocomotion(
    input.anatomy,
    input.definitions,
    capability,
  );

  children.push(
    createTraceNode({
      id: "body.capability",
      label: "Accessibility and effectiveness",
      formula: "effectiveness = bpFraction x 0.50^destroyedUpstreamJoints",
      output: traced({ parts: capability.parts }),
    }),
    createTraceNode({
      id: "body.locomotion",
      label: "Locomotor condition",
      formula: "mean over chains of min(part effectiveness, 0 if inaccessible)",
      output: traced({ fraction: locomotion.fraction, chains: locomotion.chains }),
    }),
  );

  return {
    success: true,
    payload: {
      mode,
      effectiveScale,
      measurements,
      structure,
      strength,
      points,
      anatomicalPoints,
      capability,
      locomotion,
    },
    trace: {
      root: createTraceNode({
        id: "body.resolve",
        label: "Resolve Body",
        children,
      }),
    },
    warnings: [],
  };
}
