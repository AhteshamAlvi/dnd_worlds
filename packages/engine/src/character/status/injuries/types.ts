/*
 * Injuries — the CONTENT half.
 *
 * An Injury is anatomical and authored content at once, and the two halves are
 * declared in two places on purpose:
 *
 *   foundation/body/injuries/   ANATOMY. AnatomicalInjuryDefinition — where an
 *                               Injury may sit, whether it needs treatment,
 *                               and the ceiling it puts on natural recovery.
 *                               Body reads all of it.
 *
 *   here                        CONTENT. What the Injury DOES: its Effects,
 *                               and the extra ones treatment state adds.
 *
 * ── Why the split exists ────────────────────────────────────────────────
 *
 * `Effect` is a union over every domain — it names Body selectors, check
 * scopes, Attribute keys and Action capacities — so a Foundation type that
 * mentioned it made Foundation depend on the rules layer sitting on top of it.
 * That was the engine's last upward import, and this file is where it went
 * instead.
 *
 * Splitting the INTERFACE rather than moving the domain is what keeps the
 * pieces where they belong. Manifestation and Recovery are anatomical and stay
 * under Body; Effects are content and come up here. Nothing in Body ever holds
 * an InjuryDefinition — callers look one up and pass it down as the
 * AnatomicalInjuryDefinition it structurally is, so there is no conversion and
 * no second lookup.
 *
 * ── The serialized shape is unchanged ───────────────────────────────────
 *
 * An authored Injury is still one object carrying applicability, recovery,
 * effects and treatmentEffects together. Only the TYPE describing it is split,
 * and InjuryDefinition below re-composes the two halves into exactly the shape
 * that was there before. No stored content needs migrating.
 */

import type { Effect } from "../../rules/effects";
import type { EffectfulDefinition } from "../../rules/content";

import type {
  AnatomicalInjuryDefinition,
} from "../../foundation/body/injuries/types";

/**
 * Reusable authored Injury content — both halves, as authored.
 *
 * `applicability` and `recovery` come from AnatomicalInjuryDefinition, which
 * Body owns. `effects`, `requirements` and `statureAllowances` come from
 * EffectfulDefinition, the shape every catalog domain shares. This interface
 * adds only the one field neither of them has.
 *
 * ── What the Effects mean ───────────────────────────────────────────────
 *
 * `effects` describe what the Injury mechanically does WHILE IT IS MANIFESTED,
 * regardless of treatment state.
 *
 * Manifested, not merely recorded. An Injury applies only while the current
 * form expresses every anatomical identity its location names and the anatomy
 * standing there can host it — see
 * foundation/body/injuries/resolution.ts's resolveInjuryManifestation. A
 * dormant Injury contributes nothing at all: not its `effects`, not its
 * `treatmentEffects`, and no recovery. It is still stored, still valid, and
 * resumes contributing the moment compatible anatomy returns.
 *
 * `treatmentEffects` adds Effects on top of the base `effects` depending on
 * treatment state — see effects.ts for how the two combine. Meaningful only
 * for a treatment-required Injury: one that recovers without treatment has no
 * treatment state to key off, and normally authors only its plain `effects`.
 * Treatment state only ever changes what a MANIFESTED Injury contributes.
 */
export interface InjuryDefinition
  extends AnatomicalInjuryDefinition,
    EffectfulDefinition {
  readonly treatmentEffects?: {
    readonly untreated?: readonly Effect[];
    readonly treated?: readonly Effect[];
  };
}
