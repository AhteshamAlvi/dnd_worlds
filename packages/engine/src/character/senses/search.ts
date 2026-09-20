/*
 * Deliberately looking for something.
 *
 * The second of the two ways a concealed subject is ever found, and the only
 * one the searcher chooses. The first is passive Detection winning on its own;
 * everything else is the Reaction Gate, which is a different question asked at a
 * different moment.
 *
 *
 * WHY A SEARCH CARRIES NO CONCEALMENT LEAD
 *
 * The Lead penalty measures one specific failure: you did not passively notice
 * the attack coming, so recognising it in the instant before it lands is hard.
 * That is a statement about SURPRISE, and a character who has stopped, decided
 * to look, and spent the time to do it is not surprised. Charging them the
 * penalty anyway would mean the better an ambusher hid, the worse a methodical
 * search performed — which reads backwards, and would make searching
 * pointless in exactly the situation searching exists for.
 *
 * So a search is an ordinary rolled Detection against the retained total, ties
 * failing, with whatever contextual advantage the circumstances supply.
 *
 *
 * WHAT THIS DOES NOT CHARGE
 *
 * Time, Actions, or attention. The foundation has no idea what a search costs,
 * and guessing would put a second action-economy in the sensory domain. The
 * caller arrives having already authorized and paid for the search, and hands
 * in the dice that were rolled for it.
 */

import type { CheckModifierContribution, CheckDiceInput } from "../../checks/types";
import {
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import {
  concealmentRatingForRoute,
  isConcealedFrom,
  recordConcealmentDetection,
  type EstablishedConcealmentState,
} from "../foundation/senses/concealment";
import { resolveDetectionCheck } from "../foundation/senses/detection";
import type { DetectionResolution } from "../foundation/senses/detection";
import { sensoryFailure } from "../foundation/senses/diagnostics";
import {
  sensoryRouteTermsKey,
  type GeneratedSensoryRoute,
} from "../foundation/senses/routes";
import type { ResolvedSensoryProfile } from "../foundation/senses/types";
import { NEN_PRESENCE_EVIDENCE_ID } from "./nen-concealment";


export interface ActiveSearchRequest {
  readonly observerId: string;
  readonly profile: ResolvedSensoryProfile;

  /**
   * The route being searched through.
   *
   * ONE route, chosen by the caller, and generated rather than authored. A
   * search is a deliberate act with a direction — you look, or you listen —
   * and handing in every route the searcher has would be asking for a free
   * roll per organ.
   */
  readonly route: GeneratedSensoryRoute;

  readonly concealment: EstablishedConcealmentState;

  /** Already rolled and already paid for by the caller. */
  readonly dice: CheckDiceInput;

  readonly modifiers?: readonly CheckModifierContribution[];

  /** Ordering value for the Concealment transition a success produces. */
  readonly at: number;
}


export interface ActiveSearchResolution {
  readonly detection: DetectionResolution;

  /**
   * The Concealment state AFTER the search.
   *
   * Returned rather than mutated, and returned even on a failure — where it is
   * the unchanged input, which is the point: a missed search leaves the subject
   * exactly as hidden as they were.
   */
  readonly concealment: EstablishedConcealmentState;

  /** Generic evidence the search produced, for Investigation to analyse. */
  readonly evidenceIds: readonly string[];
}


export function resolveActiveSearch(
  request: ActiveSearchRequest,
): EngineResult<ActiveSearchResolution> {
  const traceId = "character.senses.search";
  const label = "Resolve an active search";
  const route = request.route.route;

  if (!isConcealedFrom(request.concealment, request.observerId)) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.search.already-detected",
      message: "This observer has already detected the subject; there is nothing to search for.",
      audience: "developer",
      required: "a subject still concealed from this observer",
      actual: request.observerId,
    });
  }

  const rating = concealmentRatingForRoute(request.concealment, route);

  if (rating === undefined) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.search.route.uncovered",
      message: "This Concealment attempt does not cover the route being searched.",
      audience: "developer",
      required: request.concealment.ratings
        .map((entry) => sensoryRouteTermsKey(entry.route))
        .join(" | "),
      actual: sensoryRouteTermsKey(route),
    });
  }

  const detected = resolveDetectionCheck({
    mode: "active",
    profile: request.profile,
    route: request.route,
    concealment: rating,
    dice: request.dice,
    ...(request.modifiers === undefined ? {} : { modifiers: request.modifiers }),
  });

  if (!detected.success) return detected;

  const detection = detected.payload;

  const finish = (
    concealment: EstablishedConcealmentState,
  ): EngineResult<ActiveSearchResolution> =>
    engineSuccess({
      detection,
      concealment,
      evidenceIds: detection.detected && route.phenomenon === "nen"
        ? [NEN_PRESENCE_EVIDENCE_ID]
        : [],
    }, {
      root: createTraceNode({
        id: traceId,
        label,
        formula: "rolled Detection against retained Concealment, ties failing, no Lead penalty",
        inputs: {
          observer: { value: request.observerId },
          route: { value: sensoryRouteTermsKey(route) },
        },
        output: detection.detected,
        children: [detection.trace],
      }),
    });

  if (!detection.detected) return finish(request.concealment);

  const broken = recordConcealmentDetection(request.concealment, {
    attemptId: request.concealment.attemptId,
    observerId: request.observerId,
    at: request.at,
  });

  if (!broken.success) return broken;

  return finish(broken.payload);
}
