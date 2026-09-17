/*
 * Nen's two contributions to the sensory contest, and the boundary they stay
 * behind.
 *
 * Two things flow from Nen into senses and nothing else does:
 *
 *   1. a running ordinary Zetsu makes the character's AURA harder to find;
 *   2. successfully detecting live Aura is evidence, which Investigation may
 *      then analyse.
 *
 * Both arrive here as a translation rather than as a rule. The sensory
 * foundation must not learn what Zetsu is — the moment it branches on a
 * principle id, every future principle needs a branch there too, and the
 * generic contest becomes a switch statement over the Nen chapter. So this file
 * is the seam: it reads the ALREADY-RESOLVED Zetsu contribution and re-states it
 * in the vocabulary the universal check-modifier system already speaks.
 *
 *
 * WHAT ZETSU DOES NOT CONCEAL
 *
 * Everything physical. Footprints, a dropped coin, breathing, body heat, the
 * shape of a person against a wall. Zetsu closes the Aura nodes; it does not
 * make its user invisible, and a Zetsu modifier landing on a sight-of-the-body
 * route would be exactly that. The scope below therefore names the `nen`
 * phenomenon explicitly, and the two subjects a supplied signature may author
 * for live Aura — the character themselves (`entity`) and the supernatural
 * presence itself (`phenomenon`).
 *
 * Two contributions rather than one, for that last reason. A ConcealmentCheck
 * scope carries exactly ONE subject, and a selector that omitted the subject
 * would also match `trace` — Nen residue left behind, which is a different
 * mechanic this ticket deliberately does not author. Any single check matches at
 * most one of the two, so the modifier's VALUE reaches the check exactly once.
 *
 * And nothing for a forced or involuntary suppression, which the Zetsu adapter
 * already refuses to report: those are states a character is in, not an
 * activity they are performing, and rewarding them with a learned rank's bonus
 * would pay a character for being shut down.
 */

import type { CheckModifierContribution } from "../../checks/types";
import type { ConcealmentCheckScopeSelector } from "../foundation/senses/scopes";
import {
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import type { NenState } from "../foundation/nen/types";
import type { NenActivityRuntime } from "../foundation/nen/runtime/types";
import { resolveZetsuAuraConcealment } from "../nen/zetsu";


/**
 * The generic evidence id a successful Detection of live Aura produces.
 *
 * One id, and deliberately only one. "There is Nen here, now" is what the
 * senses can honestly report; which Hatsu it belongs to, whose it is, how
 * strong the Output was and what it was recently used for are separate
 * findings requiring their own authoring, and inventing them here would let
 * Investigation reveal conclusions no rule ever established.
 */
export const NEN_PRESENCE_EVIDENCE_ID = "nen.presence";


/** The subjects a supplied Nen signature may describe. Never `trace`. */
const NEN_PRESENCE_SUBJECTS = ["entity", "phenomenon"] as const;


function nenPresenceScope(
  subject: typeof NEN_PRESENCE_SUBJECTS[number],
): ConcealmentCheckScopeSelector {
  return {
    kind: "concealment",
    phenomenon: { kind: "specific", phenomenon: "nen" },
    subject: { kind: "specific", subject },
  };
}


/**
 * A running ordinary Zetsu, as contextual Concealment modifiers.
 *
 * Contextual rather than persistent: nothing on the character sheet supplies
 * this. It is true only while the activity is actually running and legal, which
 * is runtime state, and a persistent modifier would keep applying after the
 * character dropped Zetsu.
 *
 * An empty list is the ordinary answer — no Zetsu running, or a sealed rank
 * that can no longer legally run — and is not a failure.
 */
export function resolveNenConcealmentModifiers(
  runtime: NenActivityRuntime,
  nen: NenState,
): EngineResult<readonly CheckModifierContribution[]> {
  const resolved = resolveZetsuAuraConcealment(runtime, nen);

  if (!resolved.success) return resolved;

  const contribution = resolved.payload;

  const trace = createTraceNode({
    id: "character.senses.nen.concealment",
    label: "Project Nen suppression into Concealment",
    formula: "a running ordinary Zetsu's rank modifier, scoped to Nen presence only",
    inputs: { available: { value: contribution.available } },
    output: contribution.available ? contribution.modifier : 0,
    children: [resolved.trace.root],
  });

  if (!contribution.available) {
    return engineSuccess([], { root: trace });
  }

  const modifiers = NEN_PRESENCE_SUBJECTS.map((subject) => ({
    /* The activity's own provenance, unchanged — not a source invented here. */
    source: contribution.source,
    scope: nenPresenceScope(subject),
    amount: contribution.modifier,
    channel: "contextual" as const,
  }));

  return engineSuccess(modifiers, { root: trace });
}
