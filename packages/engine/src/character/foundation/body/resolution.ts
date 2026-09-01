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
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import type { EngineError } from "../../../infrastructure/diagnostics";
import type { TraceNode } from "../../../infrastructure/trace";
import type { JsonValue } from "../../../infrastructure/json";

/*
 * Trace output is JSON, and every resolved Body value is deeply readonly.
 * The cast is confined to this one helper rather than sprinkled through every
 * node, so the trace stays a faithful copy of what was resolved instead of a
 * hand-maintained summary that could drift from it.
 */
const traced = (value: unknown): JsonValue => value as JsonValue;

import { applyBodyEffects } from "./effects";
import { individualMorphologyByContinuityKey } from "./continuity";
import {
  findBodyResolutionBlockers,
  toBodyEngineError,
} from "./validation";
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
import type { ContinuityStates } from "./continuity";
import type { BodyEffectInput } from "./effects";
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
  BodyPartId,
  ReferenceForm,
  ReferenceFormPart,
} from "./anatomy/types";
import type { BodyMorphology } from "./types";


export interface BodyResolutionInput {
  /*
   * The body plan this character has before any Effect changes it. Anatomy is
   * instantiated from it and never supplied directly — a stored tree alongside
   * the form it came from is free to disagree with it.
   */
  readonly referenceForm: ReferenceForm;

  /*
   * Everything persistently true of this body's anatomy, by identity. See
   * body/continuity.ts.
   */
  readonly continuity: ContinuityStates;

  /** Overrides the instance ids instantiation generates. */
  readonly instanceIdFor?: (part: ReferenceFormPart) => BodyPartId;

  /*
   * Physical Effects declared by this character's content, split by mode.
   *
   * Applied BEFORE anything is resolved, because they change what there is to
   * resolve — anatomy, the Reference Form, Scale, morphology, force and
   * destruction resistance. `mode` selects which layers participate; see
   * body/effects.ts.
   */
  readonly effects?: BodyEffectInput;

  /*
   * The Reference Forms a `replaceForm` anatomy Effect may name. The body's
   * own form is always available and does not need repeating here.
   */
  readonly referenceForms?: readonly ReferenceForm[];

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

  /*
   * The body every number below was actually resolved from — after Body
   * Effects added, removed, suppressed or replaced anatomy. Exposed because a
   * caller comparing a resolved character against the sheet otherwise has no
   * way to see that an Effect changed the body plan.
   */
  readonly anatomy: Anatomy;
  readonly referenceForm: ReferenceForm;

  readonly effectiveScale: number;

  /*
   * The morphology every physical resolver actually used, in both keyings:
   * by instance for the anatomy present, by Reference Form slot for the intact
   * form. Kept because validation and the stature rule need the SAME numbers
   * the physics used — recomputing them would be a second implementation of
   * the layer stack.
   */
  readonly morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>;
  readonly morphologyBySlotId: Readonly<Record<string, BodyMorphology>>;

  /*
   * The layer stack those maps came from, Body Effect layers included.
   *
   * The stature rule re-resolves this body with the character's own
   * contributions neutralised, which needs the layers still separable — a
   * flattened per-part map cannot be taken apart again. Exposing the stack
   * that was actually used is what keeps stature judging the same body the
   * physics resolved.
   */
  readonly morphologyInput: MorphologyResolutionInput;

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

  /*
   * Effects first. Everything below resolves the body they produced, not the
   * body that was authored — an Arm an Effect added has to be measured, and a
   * limb an Effect suppressed must not be.
   */
  const effects = applyBodyEffects(
    {
      referenceForm: input.referenceForm,
      continuity: input.continuity,
      definitions: input.definitions,
      ...(input.instanceIdFor !== undefined
        ? { instanceIdFor: input.instanceIdFor }
        : {}),
      ...(input.referenceForms !== undefined
        ? { referenceForms: input.referenceForms }
        : {}),
      ...(input.effects !== undefined ? { effects: input.effects } : {}),
    },
    mode,
  );

  const anatomy = effects.anatomy;
  const referenceForm = effects.referenceForm;

  const effectiveScale =
    resolveEffectiveScale(
      input.speciesStandardScale,
      input.ageScale,
      input.characterScale,
    ) * effects.scaleMultiplier;

  const adiposeDensity =
    input.adiposeTissueDensityKgPerL ??
    DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L;

  const children: TraceNode[] = [];

  /*
   * Preconditions, before anything is computed.
   *
   * The physical resolvers assume a validated body and throw on one that is
   * not — an unknown BodyPartDefinition surfaces as an exception three modules
   * down rather than as something a caller can report. Checking here is what
   * makes this function's EngineResult contract real: invalid authored anatomy
   * comes back as a failure with a trace, the same as every other engine entry
   * point.
   */
  const blockers = findBodyResolutionBlockers(
    anatomy,
    referenceForm,
    input.definitions,
    effectiveScale,
  );

  if (blockers.length > 0) {
    return {
      success: false,
      trace: {
        root: createTraceNode({
          id: "body.resolve",
          label: "Resolve Body",
          output: false,
          inputs: {
            parts: { value: anatomy.parts.length },
            referenceFormSlots: { value: referenceForm.parts.length },
            effectiveScale: { value: effectiveScale },
          },
        }),
      },
      warnings: [...effects.warnings],
      errors: blockers.map((issue) =>
        toBodyEngineError(issue),
      ) as NonEmptyArray<EngineError>,
    };
  }

  children.push(
    createTraceNode({
      id: "body.scale",
      label: "Effective Scale",
      formula:
        "speciesStandardScale x ageScale x characterScale x effectMultiplier",
      inputs: {
        speciesStandardScale: { value: input.speciesStandardScale },
        ageScale: { value: input.ageScale },
        characterScale: { value: input.characterScale },
        effectMultiplier: { value: effects.scaleMultiplier },
      },
      output: traced({ effectiveScale }),
    }),
  );

  /* ---- morphology ---------------------------------------------------- */

  /*
   * Effect-declared morphology joins the layer stack rather than replacing
   * anything: Species, age, the character and their Strength development all
   * still apply, and the Effect layers multiply on top in mode order.
   */
  const morphology: MorphologyResolutionInput = {
    ...input.morphology,

    /*
     * The individual layer comes from continuity state rather than from the
     * caller, so that "this character's own arm" cannot be supplied
     * inconsistently with the integrity and destruction sitting beside it.
     */
    individual: individualMorphologyByContinuityKey(input.continuity),

    effectLayers: [
      ...input.morphology.effectLayers,
      ...effects.morphologyLayers,
    ],
  };

  const morphologyByPartId = resolveMorphology(
    morphology,
    morphologyTargetsForAnatomy(anatomy),
  );

  const morphologyBySlotId = resolveMorphology(
    morphology,
    morphologyTargetsForReferenceForm(referenceForm),
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
    anatomy,
    referenceForm,
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
    anatomy,
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

  /*
   * Both contexts get both keyings, and both get the same effect modifiers —
   * applyBodyEffects already selected the layers this mode may see, and only
   * one context is ever read.
   *
   * The two maps are NOT interchangeable. Strength resolves the intact form by
   * slot id and the anatomy present by instance id, and the two coincide only
   * while every instance is still named after the slot it occupies. A
   * regenerated limb ends that.
   */
  const strength = resolveBodyStrength(
    {
      anatomy,
      referenceForm,
      definitions: input.definitions,
      base: {
        morphologyBySlotId,
        morphologyByPartId,
        effectiveScale,
        intrinsicForceModifierBySlotId: effects.intrinsicForceModifierBySlotId,
        intrinsicForceModifierByPartId: effects.intrinsicForceModifierByPartId,
      },
      resolved: {
        morphologyBySlotId,
        morphologyByPartId,
        effectiveScale,
        intrinsicForceModifierBySlotId: effects.intrinsicForceModifierBySlotId,
        intrinsicForceModifierByPartId: effects.intrinsicForceModifierByPartId,
      },
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

  /*
   * Caller-supplied modifiers first, Effect-declared ones after. Destruction
   * resistances multiply, so the order changes nothing arithmetically and is
   * fixed only so a trace reads the same way twice.
   */
  const bodyPointModifiers = [
    ...(input.bodyPointModifiers ?? []),
    ...effects.bodyPointModifiers,
  ];

  const points = resolveBodyPoints({
    anatomy,
    definitions: input.definitions,
    morphologyByPartId,
    effectiveScale,
    constitution: input.constitution,
    ...(bodyPointModifiers.length > 0
      ? { modifiers: bodyPointModifiers }
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
    anatomy,
    input.definitions,
    input.specialPointDefinitions,
  );

  const capability = resolveBodyCapability({
    anatomy,
    points: anatomicalPoints,
    pointStates: input.anatomicalPoints ?? {},
    bodyPoints: points,
    ...(input.inaccessibility !== undefined
      ? { inaccessibility: input.inaccessibility }
      : {}),
  });

  const locomotion = resolveLocomotion(
    anatomy,
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
      anatomy,
      referenceForm,
      effectiveScale,
      morphologyByPartId,
      morphologyBySlotId,
      morphologyInput: morphology,
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
    warnings: [...effects.warnings],
  };
}
