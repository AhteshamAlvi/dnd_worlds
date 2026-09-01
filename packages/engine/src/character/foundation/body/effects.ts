/*
 * Body Effects — the vocabulary, and the one place it is applied.
 *
 * Two jobs live here, and they belong together.
 *
 * The first is the VOCABULARY: what a physical effect is allowed to say.
 * These types are owned by Body rather than by character/rules/ because they
 * describe anatomy, morphology and force — Body's own subject matter — and
 * because rules/effects.ts already imports Body's selector and anatomy types.
 * One direction, one definition, no duplicated union that has to be kept in
 * step by hand.
 *
 * The second is APPLICATION: turning a declared effect into the concrete
 * inputs the physical resolvers already take. Nothing here computes physics.
 * Every effect ends up as one of five ordinary resolver inputs:
 *
 *   scale                  -> a multiplier on Effective Scale
 *   morphology             -> one more MorphologySource layer
 *   anatomy                -> a changed Anatomy and/or Reference Form
 *   intrinsicPhysicalForce -> the per-part force modifier Strength already takes
 *   destructionResistance  -> the BodyPointModifier Body Points already takes
 *
 * That is deliberate. An effect that needed a new formula would be a new
 * physical model smuggled in as content; an effect that can only move an
 * existing input cannot become one.
 *
 *
 * WHY THE INPUT TYPES ARE STRUCTURAL
 *
 * `applyBodyEffects` takes plain `{multiplier, target}` shapes rather than the
 * rules layer's `SourcedBodyModifier`. The rules layer's types carry a
 * `RuleSourceRef` for provenance and satisfy these structurally, so
 * `ResolvedRuleEffects.body` passes straight in — while Body itself never
 * imports from rules and stays a subsystem the rules layer sits on top of,
 * not beside.
 *
 *
 * MODE
 *
 * Base mode applies the base layer alone; resolved mode applies base and then
 * resolved, in that order. That is the same ladder the Attribute layers use
 * (stored -> base -> resolved), and it is what keeps base-mode resolution a
 * strict prefix of resolved-mode resolution rather than a second algorithm.
 */

import {
  DEFAULT_ATTACHMENT_CHILD_POSITION,
  DEFAULT_ATTACHMENT_PARENT_POSITION,
  instantiateAnatomy,
} from "./anatomy/creation";
import { setBodyPartState } from "./anatomy/modification";
import { anatomySlotKey, continuityKey } from "./anatomy/types";
import { combineWithinLayer } from "./morphology/resolution";
import { matchesBodyPartSelector, createBodyPartDefinitionMap } from "./selectors";
import type { Warning } from "../../../infrastructure/diagnostics";
import type { BodyMorphology } from "./types";
import type { BodyResolutionMode } from "./resolution-mode";
import type { BodyPointModifier } from "./body-points/types";
import type { ContinuityStates } from "./continuity";
import type { MorphologySource } from "./morphology/types";
import type { BodyPartSelector } from "./selectors";
import type {
  Anatomy,
  AnatomySlotKey,
  ContinuityKey,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
  BodyPartTypeId,
  ReferenceAnatomySlotId,
  ReferenceForm,
  ReferenceFormAttachment,
  ReferenceFormId,
  ReferenceFormPart,
} from "./anatomy/types";


/* ------------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------------ */

/*
 * Which morphology dimension an effect changes.
 */
export type BodyMorphologyProperty =
  | "length"
  | "bulk"
  | "muscularity"
  | "adiposity";


/*
 * What a Body effect applies to.
 *
 * Absent means the whole body. A selector narrows it to matching BodyParts —
 * "every Arm", "everything tagged limb" — which is how Long Arms says what it
 * means without naming instances that may not exist yet.
 */
export type BodyEffectTarget = BodyPartSelector | undefined;


/*
 * How an anatomy effect changes a body.
 *
 * The four modes differ in TWO independent ways — what happens to the
 * Reference Form, and what happens to the anatomy present — and the
 * combinations are not interchangeable:
 *
 *   addToForm       form grows        anatomy gains the part
 *   removeFromForm  form shrinks      identity stops being manifested
 *   suppress        form UNCHANGED    manifestation hidden, state preserved
 *   replaceForm     form replaced     the new form's anatomy entirely
 *
 * suppress is invalid on a BASE anatomy effect and the type says so. A
 * permanent effect that hides a part without changing the body plan is a
 * contradiction: the form would go on expecting anatomy that permanently is
 * not there, with nothing ever able to resolve the disagreement.
 *
 * None of them deletes anything. Anatomy is instantiated from the form, so a
 * form that stops expecting an Arm simply stops producing one — the identity's
 * persistent state goes dormant and returns intact if a form expressing it
 * does.
 *
 * Note what is absent: damage-driven loss is NOT here and must never be
 * expressed as one of these. Destruction is recorded against continuity state.
 * Routing it through removeFromForm would shrink the Reference Form too, and a
 * form that stops expecting the arm it just lost is a form that has healed.
 */
export type BodyAnatomyOperation =
  | {
      readonly mode: "addToForm";
      readonly slotId: ReferenceAnatomySlotId;
      readonly type: BodyPartTypeId;

      /*
       * What the new anatomy persistently IS. Defaults to an identity derived
       * from the form and slot, which is right for anatomy that corresponds to
       * nothing elsewhere; anything meant to carry state across forms says so.
       */
      readonly continuityKey?: ContinuityKey;

      readonly attachToSlotId?: ReferenceAnatomySlotId;
      readonly site?: string;
      readonly parentPosition?: number;
      readonly childPosition?: number;
    }
  | {
      readonly mode: "removeFromForm";
      readonly slotId: ReferenceAnatomySlotId;
    }
  | {
      readonly mode: "suppress";
      readonly target: BodyPartSelector;
    }
  | {
      readonly mode: "replaceForm";
      readonly referenceFormId: ReferenceFormId;
    };


/** Every anatomy operation a permanent effect may perform. */
export type BaseBodyAnatomyOperation = Exclude<
  BodyAnatomyOperation,
  { readonly mode: "suppress" }
>;




/* ------------------------------------------------------------------------ *
 * Application input
 * ------------------------------------------------------------------------ */

/*
 * One declared physical multiplier. `target` absent means the whole body.
 */
export interface BodyEffectModifier {
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}


export interface BodyEffectMorphologyModifier extends BodyEffectModifier {
  readonly property: BodyMorphologyProperty;
}


export interface BodyEffectAnatomyModifier {
  readonly operation: BodyAnatomyOperation;
}


/*
 * Everything one mode declared, in typed buckets.
 *
 * Structurally satisfied by the rules layer's BodyEffectLayer, which carries
 * the same fields plus provenance.
 */
export interface BodyEffectLayerInput {
  readonly scale: readonly BodyEffectModifier[];
  readonly morphology: readonly BodyEffectMorphologyModifier[];
  readonly anatomy: readonly BodyEffectAnatomyModifier[];
  readonly intrinsicPhysicalForce: readonly BodyEffectModifier[];
  readonly destructionResistance: readonly BodyEffectModifier[];
}


export interface BodyEffectInput {
  readonly base: BodyEffectLayerInput;
  readonly resolved: BodyEffectLayerInput;
}


/*
 * What the physical resolvers are handed once effects have been applied.
 *
 * Both halves of the body come out of here, and in the right order: the
 * effective FORM after every blueprint change, and the ANATOMY instantiated
 * from it. Nothing downstream has to know an Effect was involved.
 */
export interface BodyEffectApplication {
  readonly referenceForm: ReferenceForm;
  readonly anatomy: Anatomy;

  readonly scaleMultiplier: number;

  readonly morphologyLayers: readonly MorphologySource[];

  /*
   * Two records, because Strength resolves two part sets that are keyed
   * differently: the intact Reference Form by slot, and the anatomy present by
   * instance. Merging them into one would work only for as long as every
   * instance happened to be named after its slot.
   */
  readonly intrinsicForceModifierBySlotId: Readonly<Record<string, number>>;
  readonly intrinsicForceModifierByPartId: Readonly<Record<string, number>>;

  readonly bodyPointModifiers: readonly BodyPointModifier[];

  readonly warnings: readonly Warning[];
}


export interface BodyEffectApplicationInput {
  /** The form this character has before any Effect changes it. */
  readonly referenceForm: ReferenceForm;

  /** Persistent per-identity state; what instantiation fills the form with. */
  readonly continuity: ContinuityStates;

  readonly definitions: readonly BodyPartDefinition[];

  /*
   * Every form a `replaceForm` operation may name. Forms are content, so the
   * caller supplies the catalog; an unknown id warns and changes nothing
   * rather than resolving a body against a plan that was never found.
   */
  readonly referenceForms?: readonly ReferenceForm[];

  readonly effects?: BodyEffectInput;

  /** Overrides the instance ids instantiation generates. */
  readonly instanceIdFor?: (part: ReferenceFormPart) => BodyPartId;
}


/* ------------------------------------------------------------------------ *
 * Application
 * ------------------------------------------------------------------------ */

export const NEUTRAL_BODY_EFFECT_LAYER: BodyEffectLayerInput = {
  scale: [],
  morphology: [],
  anatomy: [],
  intrinsicPhysicalForce: [],
  destructionResistance: [],
};


/*
 * The layers one mode sees, in application order.
 *
 * Base mode sees permanent effects only. Resolved mode sees those and then the
 * ones that are only true right now — never the other way round, so that a
 * temporary enlargement never becomes part of what a body permanently is.
 */
function layersForMode(
  effects: BodyEffectInput | undefined,
  mode: BodyResolutionMode,
): readonly BodyEffectLayerInput[] {
  if (effects === undefined) return [];

  return mode === "base" ? [effects.base] : [effects.base, effects.resolved];
}


/*
 * A stand-in BodyPart for a Reference Form slot.
 *
 * Selectors ask about instance identity, type, tags and presence state, and a
 * form slot genuinely has the middle two. Presenting it as an active,
 * undamaged instance is what lets ONE selector implementation serve both the
 * intact form and the anatomy present, instead of a second matcher that would
 * have to be kept in step with this one.
 */
function slotAsPart(
  form: ReferenceForm,
  part: ReferenceFormPart,
): BodyPart {
  return {
    id: part.slotId,
    type: part.type,
    attachment: null,
    referenceFormId: form.id,
    referenceSlotId: part.slotId,
    continuityKey: part.continuityKey,
    state: "active",
    integrity: 1,
  };
}


/*
 * Applies one BLUEPRINT operation: the three that change what a body is
 * supposed to contain.
 *
 * Suppression is deliberately absent. It hides a manifestation without
 * changing the plan, so it cannot be done here — there is no anatomy yet.
 */
function applyFormOperation(
  operation: BodyAnatomyOperation,
  form: ReferenceForm,
  formsById: ReadonlyMap<ReferenceFormId, ReferenceForm>,
  warnings: Warning[],
): ReferenceForm {
  switch (operation.mode) {
    case "replaceForm": {
      const replacement = formsById.get(operation.referenceFormId);

      if (replacement === undefined) {
        warnings.push({
          code: "body.effects.unknown-reference-form",
          message:
            `A Body effect replaces this body's form with ` +
            `"${operation.referenceFormId}", which no loaded content declares. ` +
            "The form is unchanged.",
          audience: "developer",
        });

        return form;
      }

      /*
       * Wholesale. The new plan decides every slot, type, topology and
       * geometry; what the character brings across is their continuity state,
       * which instantiation reconciles against whatever identities this form
       * happens to contain.
       */
      return replacement;
    }

    case "addToForm": {
      if (form.parts.some((part) => part.slotId === operation.slotId)) {
        warnings.push({
          code: "body.effects.duplicate-form-slot",
          message:
            `A Body effect adds slot "${operation.slotId}" to a form that ` +
            "already expects it. The form is unchanged.",
          audience: "developer",
        });

        return form;
      }

      const parentExists =
        operation.attachToSlotId === undefined ||
        form.parts.some((part) => part.slotId === operation.attachToSlotId);

      if (!parentExists) {
        warnings.push({
          code: "body.effects.unknown-attachment-slot",
          message:
            `A Body effect attaches new anatomy to slot ` +
            `"${operation.attachToSlotId}", which this form has no slot for. ` +
            `"${operation.slotId}" was added unattached.`,
          audience: "gm",
        });
      }

      const attachment: ReferenceFormAttachment | null =
        operation.attachToSlotId === undefined || !parentExists
          ? null
          : {
              parentSlotId: operation.attachToSlotId,
              ...(operation.site !== undefined ? { site: operation.site } : {}),
              parentPosition:
                operation.parentPosition ?? DEFAULT_ATTACHMENT_PARENT_POSITION,
              childPosition:
                operation.childPosition ?? DEFAULT_ATTACHMENT_CHILD_POSITION,
            };

      return {
        ...form,
        parts: [
          ...form.parts,
          {
            slotId: operation.slotId,
            type: operation.type,
            continuityKey:
              operation.continuityKey ??
              continuityKey(`${form.id}:${operation.slotId}`),
            attachment,
          },
        ],
      };
    }

    case "removeFromForm": {
      const remaining = form.parts.filter(
        (part) => part.slotId !== operation.slotId,
      );

      if (remaining.length === form.parts.length) {
        warnings.push({
          code: "body.effects.unknown-form-slot",
          message:
            `A Body effect removes slot "${operation.slotId}" from a form ` +
            "that does not expect it. The form is unchanged.",
          audience: "developer",
        });

        return form;
      }

      /*
       * Only the slot named. Anything hanging off it stops being reachable and
       * is reported by form validation rather than silently pruned here, so a
       * body plan that has been cut in half is visible instead of quietly
       * becoming a smaller, valid one.
       */
      return { ...form, parts: remaining };
    }

    case "suppress":
      return form;
  }
}


/*
 * Builds one layer's morphology source.
 *
 * Untargeted contributions become the layer's global values; targeted ones
 * become local values on every slot they reach. Both go through
 * combineWithinLayer, so two effects touching the same dimension in the same
 * layer ADD their deviations — the rule morphology/resolution.ts states.
 */
function morphologySourceFor(
  layer: BodyEffectLayerInput,
  slots: readonly { readonly key: AnatomySlotKey; readonly parts: readonly BodyPart[] }[],
  definitionsByType: ReadonlyMap<BodyPartTypeId, BodyPartDefinition>,
): MorphologySource | undefined {
  if (layer.morphology.length === 0) return undefined;

  const global = combineWithinLayer(
    layer.morphology
      .filter((modifier) => modifier.target === undefined)
      .map((modifier) => ({ [modifier.property]: modifier.multiplier })),
  );

  const local: Record<AnatomySlotKey, Partial<BodyMorphology>> = {};

  const targeted = layer.morphology.filter(
    (modifier) => modifier.target !== undefined,
  );

  for (const slot of slots) {
    const applicable = targeted.filter((modifier) =>
      slot.parts.some((part) => {
        const definition = definitionsByType.get(part.type);

        return (
          definition !== undefined &&
          matchesBodyPartSelector(
            part,
            definition,
            modifier.target as BodyPartSelector,
          )
        );
      }),
    );

    if (applicable.length === 0) continue;

    local[slot.key] = combineWithinLayer(
      applicable.map((modifier) => ({
        [modifier.property]: modifier.multiplier,
      })),
    );
  }

  return { global, local };
}


/*
 * Resolves declared Body Effects into the form, the anatomy, and the inputs
 * the physical resolvers take.
 *
 * The order is the whole shape of the thing and runs strictly one way:
 *
 *   blueprint operations   what this body is supposed to contain
 *        v
 *   instantiate            the form plus this character's continuity state
 *        v
 *   suppression            hide manifestations without changing the plan
 *        v
 *   everything else        targeted against the body that resulted
 *
 * Splitting form operations from manifestation operations is what makes
 * replaceForm real. A transformation changes the blueprint and the anatomy is
 * rebuilt from it, so a character who becomes a wolf has a wolf's anatomy
 * rather than a human's anatomy with a different label on the normalization
 * denominator.
 */
export function applyBodyEffects(
  input: BodyEffectApplicationInput,
  mode: BodyResolutionMode,
): BodyEffectApplication {
  const layers = layersForMode(input.effects, mode);
  const warnings: Warning[] = [];

  const definitionsByType = createBodyPartDefinitionMap(input.definitions);

  /* ---- the blueprint --------------------------------------------------- */

  let referenceForm = input.referenceForm;

  if (layers.length > 0) {
    const formsById = new Map<ReferenceFormId, ReferenceForm>(
      [input.referenceForm, ...(input.referenceForms ?? [])].map((form) => [
        form.id,
        form,
      ]),
    );

    for (const layer of layers) {
      for (const modifier of layer.anatomy) {
        referenceForm = applyFormOperation(
          modifier.operation,
          referenceForm,
          formsById,
          warnings,
        );
      }
    }
  }

  /* ---- the anatomy ----------------------------------------------------- */

  let anatomy = instantiateAnatomy(
    referenceForm,
    input.continuity,
    input.instanceIdFor,
  );

  for (const layer of layers) {
    for (const modifier of layer.anatomy) {
      if (modifier.operation.mode !== "suppress") continue;

      const target = modifier.operation.target;

      for (const part of anatomy.parts) {
        if (part.state !== "active") continue;

        const definition = definitionsByType.get(part.type);

        if (definition === undefined) continue;

        if (!matchesBodyPartSelector(part, definition, target)) continue;

        /*
         * Routed through setBodyPartState because a part that is not active
         * must carry integrity 0 — anatomy/validation.ts enforces it. Nothing
         * is lost: this anatomy is derived, and the persistent integrity is
         * still on the continuity record it came from.
         */
        anatomy = setBodyPartState(anatomy, part.id, "suppressed");
      }
    }
  }

  if (layers.length === 0) {
    return {
      referenceForm,
      anatomy,
      scaleMultiplier: 1,
      morphologyLayers: [],
      intrinsicForceModifierBySlotId: {},
      intrinsicForceModifierByPartId: {},
      bodyPointModifiers: [],
      warnings,
    };
  }

  /* ---- scale ----------------------------------------------------------- */

  let scaleMultiplier = 1;

  for (const layer of layers) {
    for (const modifier of layer.scale) {
      scaleMultiplier *= modifier.multiplier;
    }
  }

  /* ---- the positions everything else can target ------------------------ */

  const slotIndex = new Map<
    AnatomySlotKey,
    { key: AnatomySlotKey; parts: BodyPart[] }
  >();

  const addSlot = (key: AnatomySlotKey, part: BodyPart): void => {
    const existing = slotIndex.get(key);

    if (existing === undefined) {
      slotIndex.set(key, { key, parts: [part] });

      return;
    }

    existing.parts.push(part);
  };

  for (const part of anatomy.parts) {
    addSlot(anatomySlotKey(part.referenceFormId, part.referenceSlotId), part);
  }

  for (const part of referenceForm.parts) {
    addSlot(
      anatomySlotKey(referenceForm.id, part.slotId),
      slotAsPart(referenceForm, part),
    );
  }

  const slots = [...slotIndex.values()];

  /* ---- morphology ------------------------------------------------------ */

  const morphologyLayers: MorphologySource[] = [];

  for (const layer of layers) {
    const source = morphologySourceFor(layer, slots, definitionsByType);

    if (source !== undefined) morphologyLayers.push(source);
  }

  /* ---- intrinsic physical force ---------------------------------------- */

  const intrinsicForceModifierBySlotId: Record<string, number> = {};
  const intrinsicForceModifierByPartId: Record<string, number> = {};

  const forceMultiplierFor = (part: BodyPart): number => {
    const definition = definitionsByType.get(part.type);

    if (definition === undefined) return 1;

    let multiplier = 1;

    for (const layer of layers) {
      for (const modifier of layer.intrinsicPhysicalForce) {
        const matches =
          modifier.target === undefined ||
          matchesBodyPartSelector(part, definition, modifier.target);

        if (matches) multiplier *= modifier.multiplier;
      }
    }

    return multiplier;
  };

  const declaresForce = layers.some(
    (layer) => layer.intrinsicPhysicalForce.length > 0,
  );

  if (declaresForce) {
    for (const part of anatomy.parts) {
      const multiplier = forceMultiplierFor(part);

      if (multiplier !== 1) intrinsicForceModifierByPartId[part.id] = multiplier;
    }

    /*
     * The form is evaluated separately and against its own stand-in parts, not
     * against whatever instance happens to occupy the slot. Strength resolves
     * the intact form independently of what has become of the body.
     */
    for (const part of referenceForm.parts) {
      const multiplier = forceMultiplierFor(slotAsPart(referenceForm, part));

      if (multiplier !== 1) {
        intrinsicForceModifierBySlotId[part.slotId] = multiplier;
      }
    }
  }

  /* ---- destruction resistance ------------------------------------------ */

  const bodyPointModifiers: BodyPointModifier[] = [];

  for (const layer of layers) {
    for (const modifier of layer.destructionResistance) {
      bodyPointModifiers.push({
        selector: modifier.target ?? { all: true },
        operation: {
          kind: "modify-destruction-resistance",
          multiplier: modifier.multiplier,
        },
      });
    }
  }

  return {
    referenceForm,
    anatomy,
    scaleMultiplier,
    morphologyLayers,
    intrinsicForceModifierBySlotId,
    intrinsicForceModifierByPartId,
    bodyPointModifiers,
    warnings,
  };
}
