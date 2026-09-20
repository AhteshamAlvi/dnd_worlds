/*
 * The Detection-based Reaction Gate.
 *
 * Combat already creates Reaction opportunities and queues everybody an Action
 * threatened, then waits to be told whether each Gate passed. This suite covers
 * the adapter that answers it, and the properties that make the answer honest:
 *
 *  - the disadvantages are fixed BEFORE dice are requested, and the required
 *    roll count reports them;
 *  - net advantage is independent advantage MINUS concealment disadvantages,
 *    and a warning reconciles rather than granting automatic success;
 *  - a pass queues the Reaction through the queue's own transition AND breaks
 *    Concealment, together;
 *  - a failure uses the queue's own skip transition and breaks nothing;
 *  - a prepared favourable check cannot be spent on a different threat.
 */

import { describe, expect, it } from "vitest";

import { errorCodesOf, payloadOf } from "./fixtures/result";

import { establishConcealment } from "../character/foundation/senses/concealment/established";
import {
  establishConcealmentState,
  isConcealedFrom,
  recordConcealmentDetection,
  type EstablishedConcealmentState,
} from "../character/foundation/senses/concealment/state";
import type { DetectionRouteCandidate } from "../character/foundation/senses/detection";
import {
  prepareReactionGate,
  settleReactionGate,
  type ReactionGatePreparation,
} from "../gameplay/senses/reaction-gate";
import {
  nextReactionOpportunity,
  openReactionQueue,
  type ReactionQueue,
} from "../gameplay/combat/reaction-queue";
import { setRoundActiveState } from "../gameplay/combat/round";
import { startTurn } from "../gameplay/combat/turn";
import type { CombatRound, ReactionTrigger } from "../gameplay/combat/types";
import type { RuntimeRollSet } from "../runtime/dice";
import type { SensoryIntensity } from "../character/foundation/senses/channels";

import { threeCombatantRound } from "./fixtures/combat";
import {
  PASSIVE_DETECTION_BASE,
  generatedRoute,
  route,
  sensoryProfile,
  sensoryStats,
  source,
} from "./fixtures/senses";

const SIGHT = route();
const HEARING = route({ sense: "hearing", channel: "sound" });

/* Concealment Derived Attribute: round((DEX 12 + WIS 14) / 2) = 13 -> +1. */
const CONCEALMENT_MODIFIER = 1;

/* Sight Detection: round((PER 16 + WIS 14) / 2) = 15 -> +2. */
const SIGHT_DETECTION_MODIFIER = 2;

const TRIGGER: ReactionTrigger = {
  kind: "action",
  actionId: "thrown-knife",
  actorCombatantId: "a",
};


const PROFILE = sensoryProfile();

/*
 * A generated route at the neutral intensity 5, so `received - 5` is zero and
 * the totals below are the observer's alertness alone. The intensity binding
 * has its own cases, which vary it deliberately.
 */
function generated(
  sense: "sight" | "hearing" = "sight",
  intensity = 5,
) {
  return generatedRoute(PROFILE, {
    id: `${sense}-cue`,
    emissions: {
      [sense === "sight" ? "visible-light" : "sound"]: intensity as SensoryIntensity,
    },
  });
}

/** A Round with A's Turn under way, which is what a queue requires. */
function roundInTurn(): CombatRound {
  const round = threeCombatantRound();
  const turn = startTurn("a", round.initiative, round.combatants);

  if (!turn.success) throw new Error("Expected A's Turn to start.");

  return setRoundActiveState(round, turn.turn);
}

function queueThreatening(
  threatened: readonly string[] = ["b", "c"],
): { readonly round: CombatRound; readonly queue: ReactionQueue } {
  const round = roundInTurn();
  const opened = openReactionQueue(round, TRIGGER, threatened);

  if (!opened.success) throw new Error(`Expected a queue: ${opened.reason}`);

  return { round, queue: opened.queue };
}

/**
 * Retained Concealment whose total sits `lead` points above this observer's
 * passive Detection, so the Lead under test is exactly what it says.
 */
function hiddenBy(lead: number): EstablishedConcealmentState {
  const wanted = PASSIVE_DETECTION_BASE + lead - CONCEALMENT_MODIFIER;

  /*
   * A d20 cannot show more than 20, so a Lead beyond that arrives the way it
   * would in play — a good roll plus a persistent modifier for whatever made
   * the hiding place that good.
   */
  const retained = Math.min(20, wanted);
  const cover = wanted - retained;

  return payloadOf(establishConcealmentState({
    attemptId: "attempt-1",
    subjectId: "a",
    sourceId: "a",
    resolution: payloadOf(establishConcealment({
      basis: {
        kind: "character",
        stats: sensoryStats(),
        profile: sensoryProfile(),
      },
      routes: [SIGHT, HEARING],
      dice: { advantage: 0, rolls: [retained] },
      ...(cover === 0 ? {} : {
        modifiers: [{
          source: source("deep-cover", "environment"),
          scope: { kind: "concealment" as const },
          amount: cover,
          channel: "contextual" as const,
        }],
      }),
    })),
    at: 0,
  }));
}

/*
 * Hearing FIRST, and that ordering is load-bearing for the suite rather than
 * for the engine.
 *
 * One established attempt shares one d20, so both routes carry the same
 * Concealment total and the passive sweep is a genuine tie. Ties are broken by
 * canonical route identity — deterministically, so that a scene saved and
 * reloaded prepares the same Gate — and `hearing|sound|...` sorts before
 * `sight|visible-light|...`. Listing the winner at index 0 keeps every
 * settlement below reading "the route that was prepared" instead of a number
 * whose meaning nobody could see.
 */
function routesFor(state: EstablishedConcealmentState): readonly DetectionRouteCandidate[] {
  return [
    { route: generated("hearing"), concealment: state.ratings[1]! },
    { route: generated(), concealment: state.ratings[0]! },
  ];
}

function d20s(...values: readonly number[]): RuntimeRollSet {
  return { purpose: "reaction-detection", sides: 20, values: [...values] };
}

function prepare(options: {
  readonly queue: ReactionQueue;
  readonly concealment: EstablishedConcealmentState | null;
  readonly routes: readonly DetectionRouteCandidate[];
  readonly observerId?: string;
  readonly independentAdvantage?: number;
}) {
  return prepareReactionGate({
    queue: options.queue,
    observerId: options.observerId ?? "b",
    profile: sensoryProfile(),
    sourceId: "a",
    concealment: options.concealment,
    routes: options.routes,
    ...(options.independentAdvantage === undefined
      ? {}
      : { independentAdvantage: options.independentAdvantage }),
  });
}

function settle(options: {
  readonly queue: ReactionQueue;
  readonly preparation: ReactionGatePreparation;
  readonly concealment: EstablishedConcealmentState | null;
  readonly route: DetectionRouteCandidate;
  readonly rolls: RuntimeRollSet;
  readonly observerId?: string;
}) {
  return settleReactionGate({
    queue: options.queue,
    preparation: options.preparation,
    observerId: options.observerId ?? "b",
    profile: sensoryProfile(),
    sourceId: "a",
    concealment: options.concealment,
    route: options.route,
    rolls: options.rolls,
    at: 10,
  });
}


describe("preparation happens before dice exist", () => {
  it("computes the disadvantages and reports the roll count they require", () => {
    const concealment = hiddenBy(7);
    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
    }));

    expect(preparation.lead).toBe(7);
    expect(preparation.concealmentDisadvantages).toBe(2);
    expect(preparation.finalAdvantage).toBe(-2);
    expect(preparation.requiredRollCount).toBe(3);
  });

  it.each([
    [0, 1, 2],
    [4, 1, 2],
    [5, 2, 3],
    [9, 2, 3],
    [10, 3, 4],
    [14, 3, 4],
    [15, 4, 5],
    [40, 4, 5],
  ])("a Lead of %i asks for %i disadvantages and %i dice", (lead, disadvantages, dice) => {
    const concealment = hiddenBy(lead);
    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
    }));

    expect(preparation.concealmentDisadvantages).toBe(disadvantages);
    expect(preparation.requiredRollCount).toBe(dice);
  });

  it("nets independent advantage against the concealment disadvantages", () => {
    const concealment = hiddenBy(7);
    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
      independentAdvantage: 1,
    }));

    expect(preparation.independentAdvantage).toBe(1);
    expect(preparation.concealmentDisadvantages).toBe(2);
    expect(preparation.finalAdvantage).toBe(1 - 2);
  });

  it("lets a warning reconcile to an even check rather than an automatic pass", () => {
    /*
     * Two advantages of warning against a Lead worth two disadvantages is one
     * ordinary d20. Somebody shouting makes you likelier to spot the knife; it
     * does not tell you where it came from.
     */
    const concealment = hiddenBy(6);
    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
      independentAdvantage: 2,
    }));

    expect(preparation.finalAdvantage).toBe(0);
    expect(preparation.requiredRollCount).toBe(1);
    expect(preparation.alreadyDetected).toBe(false);
  });

  it("charges no Lead against a source this combatant already detected", () => {
    const concealment = payloadOf(recordConcealmentDetection(hiddenBy(12), {
      attemptId: "attempt-1",
      observerId: "b",
      at: 1,
    }));

    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
      independentAdvantage: 1,
    }));

    expect(preparation.alreadyDetected).toBe(true);
    expect(preparation.lead).toBe(0);
    expect(preparation.concealmentDisadvantages).toBe(0);
    expect(preparation.finalAdvantage).toBe(1);
  });

  it("charges no Lead when passive Detection just beat the Concealment", () => {
    /*
     * §3.2: a passive win breaks Concealment outright. There is no third,
     * prompted check between that and the Gate — the Gate simply costs nothing
     * extra.
     */
    const concealment = hiddenBy(-2);
    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
    }));

    expect(preparation.alreadyDetected).toBe(true);
    expect(preparation.concealmentDisadvantages).toBe(0);
  });

  it("uses the observer's best route rather than one Gate per sense", () => {
    const concealment = hiddenBy(3);
    const preparation = payloadOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: [
        {
          route: generated(),
          concealment: { ...concealment.ratings[0]!, total: PASSIVE_DETECTION_BASE + 20 },
        },
        { route: generated("hearing"), concealment: concealment.ratings[1]! },
      ],
    }));

    expect(preparation.binding.route?.sense).toBe("hearing");
    expect(preparation.lead).toBe(3);
  });

  it("refuses when the queue has no Gate waiting", () => {
    const { queue } = queueThreatening([]);
    const concealment = hiddenBy(3);

    expect(errorCodesOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }))).toContain("gameplay.senses.reaction-gate.no-opportunity");
  });

  it("refuses a fractional independent advantage", () => {
    const concealment = hiddenBy(3);

    expect(errorCodesOf(prepare({
      queue: queueThreatening().queue,
      concealment,
      routes: routesFor(concealment),
      independentAdvantage: 0.5,
    }))).toContain("gameplay.senses.reaction-gate.advantage.invalid");
  });
});


describe("settlement", () => {
  it("accepts exactly the dice the preparation required", () => {
    const concealment = hiddenBy(7);
    const { queue } = queueThreatening();
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    expect(preparation.requiredRollCount).toBe(3);

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 18, 19),
    }));

    /* Three dice, keeping the LOWEST: disadvantage actually applied. */
    expect(settled.detection.check?.dice.retainedRoll).toBe(18);
  });

  it.each([[2], [4]])("refuses %i dice when three were required", (count) => {
    const concealment = hiddenBy(7);
    const { queue } = queueThreatening();
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(...Array.from({ length: count }, () => 10)),
    }))).toContain("gameplay.senses.reaction-gate.dice.count");
  });

  it("queues the Reaction and breaks Concealment together on a pass", () => {
    const concealment = hiddenBy(0);
    const { queue } = queueThreatening();
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }));

    expect(settled.passed).toBe(true);
    expect(settled.detection.detected).toBe(true);

    /* The queue's own canonical success transition, not a bespoke one. */
    if (settled.queue.phase !== "resolving-gates") throw new Error("unreachable");
    expect(settled.queue.queued).toEqual(["b"]);
    expect(settled.queue.pending).toEqual(["c"]);

    expect(isConcealedFrom(settled.concealment!, "b")).toBe(false);
  });

  it("breaks Concealment for the reacting combatant alone", () => {
    const concealment = hiddenBy(0);
    const { queue } = queueThreatening();
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }));

    expect(isConcealedFrom(settled.concealment!, "c")).toBe(true);
  });

  it("skips the opportunity and preserves Concealment on a failure", () => {
    const concealment = hiddenBy(10);
    const { queue } = queueThreatening();
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(1, 2, 3, 4),
    }));

    expect(settled.passed).toBe(false);

    /* The queue's own canonical skip: nothing queued, nothing spent. */
    if (settled.queue.phase !== "resolving-gates") throw new Error("unreachable");
    expect(settled.queue.queued).toEqual([]);
    expect(settled.queue.pending).toEqual(["c"]);

    /* And the attack having happened revealed nothing. */
    expect(settled.concealment).toBe(concealment);
    expect(isConcealedFrom(settled.concealment!, "b")).toBe(true);
    expect(settled.concealment!.status).toBe("concealed");
  });

  it("rolls the ordinary Reaction check against an already-detected source", () => {
    const concealment = payloadOf(recordConcealmentDetection(hiddenBy(12), {
      attemptId: "attempt-1",
      observerId: "b",
      at: 1,
    }));
    const { queue } = queueThreatening();
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    expect(preparation.requiredRollCount).toBe(1);

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20),
    }));

    expect(settled.detection.observerTotal).toBe(20 + SIGHT_DETECTION_MODIFIER);
    /* Already broken for B, and settling again does not re-record them. */
    expect(settled.concealment!.detectedByObserverIds).toEqual(["b"]);
  });

  it("resolves each threatened combatant's Gate independently, in queue order", () => {
    const concealment = hiddenBy(0);
    const { queue } = queueThreatening();

    expect(nextReactionOpportunity(queue)?.reactingCombatantId).toBe("b");

    const forB = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
      observerId: "b",
    }));

    const afterB = payloadOf(settle({
      queue,
      preparation: forB,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
      observerId: "b",
    }));

    expect(afterB.passed).toBe(true);
    expect(nextReactionOpportunity(afterB.queue)?.reactingCombatantId).toBe("c");

    /* C's own Gate, against the SAME attempt, still concealed from them. */
    const forC = payloadOf(prepare({
      queue: afterB.queue,
      concealment: afterB.concealment,
      routes: routesFor(concealment),
      observerId: "c",
    }));

    expect(forC.alreadyDetected).toBe(false);
    expect(forC.concealmentDisadvantages).toBe(1);

    const afterC = payloadOf(settle({
      queue: afterB.queue,
      preparation: forC,
      concealment: afterB.concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(1, 2),
      observerId: "c",
    }));

    expect(afterC.passed).toBe(false);
    expect(afterC.queue.phase).toBe("resolving-reactions");
    expect(isConcealedFrom(afterC.concealment!, "b")).toBe(false);
    expect(isConcealedFrom(afterC.concealment!, "c")).toBe(true);
  });
});


describe("a prepared Gate cannot be replayed", () => {
  const concealment = hiddenBy(0);

  function preparedForB() {
    const { queue } = queueThreatening();

    return {
      queue,
      preparation: payloadOf(prepare({
        queue,
        concealment,
        routes: routesFor(concealment),
        observerId: "b",
      })),
    };
  }

  it("binds the received intensity, and refuses a threat that got louder", () => {
    /*
     * The intensity is a BASE CONTRIBUTION on the settling check, so a cue
     * that grew between the two calls would be rolled against a Gate that was
     * costed for the quieter one. Binding it is what makes that impossible
     * rather than merely unlikely.
     */
    const { queue, preparation } = preparedForB();

    expect(preparation.binding.receivedIntensity).toBe(5);

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment,
      route: {
        route: generated("hearing", 9),
        concealment: concealment.ratings[1]!,
      },
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });

  it("refuses a threat that got quieter, too", () => {
    const { queue, preparation } = preparedForB();

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment,
      route: {
        route: generated("hearing", 1),
        concealment: concealment.ratings[1]!,
      },
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });

  it("settles happily at the intensity it was prepared against", () => {
    const { queue, preparation } = preparedForB();

    const settled = settle({
      queue,
      preparation,
      concealment,
      route: {
        route: generated("hearing", 5),
        concealment: concealment.ratings[1]!,
      },
      rolls: d20s(20, 19),
    });

    expect(settled.success).toBe(true);
  });

  it("carries the intensity into the settling check's total", () => {
    /*
     * A louder cue makes the Gate easier by exactly `received - 5`, and the
     * preparation is re-made at the new loudness rather than reused — which is
     * the honest way to spend the difference.
     */
    /*
     * A Lead of 6, so neither loudness passively detects. A cue at intensity 9
     * adds +4 to the passive comparison, and a Concealment that only just held
     * would be beaten by the loud case and not the quiet one — which would
     * make this a test about two different situations rather than two
     * loudnesses of one.
     */
    const loud = hiddenBy(6);
    const { queue } = queueThreatening();

    const preparation = payloadOf(prepare({
      queue,
      concealment: loud,
      routes: [{
        route: generated("hearing", 9),
        concealment: loud.ratings[1]!,
      }],
      observerId: "b",
    }));

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment: loud,
      route: {
        route: generated("hearing", 9),
        concealment: loud.ratings[1]!,
      },
      rolls: d20s(...Array.from(
        { length: preparation.requiredRollCount },
        () => 11,
      )),
    }));

    const quiet = hiddenBy(6);
    const quietQueue = queueThreatening().queue;

    const quietPreparation = payloadOf(prepare({
      queue: quietQueue,
      concealment: quiet,
      routes: [{
        route: generated("hearing", 5),
        concealment: quiet.ratings[1]!,
      }],
      observerId: "b",
    }));

    const quietSettled = payloadOf(settle({
      queue: quietQueue,
      preparation: quietPreparation,
      concealment: quiet,
      route: {
        route: generated("hearing", 5),
        concealment: quiet.ratings[1]!,
      },
      rolls: d20s(...Array.from(
        { length: quietPreparation.requiredRollCount },
        () => 11,
      )),
    }));

    expect(settled.detection.observerTotal - quietSettled.detection.observerTotal)
      .toBe(4);
  });

  it("refuses settlement against a different observer", () => {
    const { queue, preparation } = preparedForB();

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
      observerId: "c",
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });

  it("refuses settlement against a different trigger", () => {
    const { preparation } = preparedForB();
    const otherRound = roundInTurn();
    const otherQueue = openReactionQueue(
      otherRound,
      { kind: "action", actionId: "swung-club", actorCombatantId: "a" },
      ["b", "c"],
    );

    if (!otherQueue.success) throw new Error("unreachable");

    expect(errorCodesOf(settle({
      queue: otherQueue.queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });

  it("refuses settlement against a different Concealment attempt", () => {
    const { queue, preparation } = preparedForB();
    const other = payloadOf(establishConcealmentState({
      attemptId: "attempt-2",
      subjectId: "a",
      sourceId: "a",
      resolution: payloadOf(establishConcealment({
        basis: {
          kind: "character",
          stats: sensoryStats(),
          profile: sensoryProfile(),
        },
        routes: [SIGHT, HEARING],
        dice: { advantage: 0, rolls: [4] },
      })),
      at: 0,
    }));

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment: other,
      route: { route: generated(), concealment: other.ratings[0]! },
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });

  it("refuses settlement through a different route", () => {
    const { queue, preparation } = preparedForB();

    expect(preparation.binding.route?.sense).toBe("hearing");

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[1]!,
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });

  it("refuses settlement after the source was detected in the meantime", () => {
    const { queue, preparation } = preparedForB();

    const broken = payloadOf(recordConcealmentDetection(concealment, {
      attemptId: "attempt-1",
      observerId: "b",
      at: 5,
    }));

    expect(errorCodesOf(settle({
      queue,
      preparation,
      concealment: broken,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.stale");
  });
});


describe("no third Detection check exists", () => {
  it("resolves exactly one rolled Detection between declaration and the Gate", () => {
    /*
     * The whole sequence for one threatened combatant: a queue, a preparation
     * that rolls nothing, and one settlement that rolls once. There is no
     * prompted look in between, which is the shape the design rules out.
     */
    const concealment = hiddenBy(3);
    const { queue } = queueThreatening(["b"]);

    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    /* Preparation is passive throughout: no check was resolved. */
    expect(preparation).not.toHaveProperty("check");

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }));

    expect(settled.detection.check).toBeDefined();
    expect(settled.detection.mode).toBe("reaction");
    expect(settled.queue.phase).toBe("resolving-reactions");
  });

  it("does not let a caller reuse one preparation for two settlements", () => {
    const concealment = hiddenBy(0);
    const { queue } = queueThreatening(["b"]);
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    const first = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }));

    /* The queue has moved past the Gate phase; a second settlement has none. */
    expect(errorCodesOf(settle({
      queue: first.queue,
      preparation,
      concealment: first.concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }))).toContain("gameplay.senses.reaction-gate.no-opportunity");
  });
});


describe("the Gate reads the sensory result and Combat stays principle-neutral", () => {
  it("resolves without Combat being told anything about senses or Nen", () => {
    /*
     * The adapter takes a profile and a Concealment state and hands back a
     * queue. Nothing sensory crosses into `gameplay/combat`, which is what lets
     * that module keep importing no Character content at all.
     */
    const concealment = hiddenBy(2);
    const { queue } = queueThreatening(["b"]);
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    const settled = payloadOf(settle({
      queue,
      preparation,
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(20, 19),
    }));

    expect(settled.queue.trigger).toEqual(TRIGGER);
    expect(settled.queue).not.toHaveProperty("profile");
    expect(settled.queue).not.toHaveProperty("concealment");
  });

  it("still lets contextual modifiers reach the rolled check", () => {
    const concealment = hiddenBy(3);
    const { queue } = queueThreatening(["b"]);
    const preparation = payloadOf(prepare({
      queue,
      concealment,
      routes: routesFor(concealment),
    }));

    const settled = payloadOf(settleReactionGate({
      queue,
      preparation,
      observerId: "b",
      profile: sensoryProfile(),
      sourceId: "a",
      concealment,
      route: routesFor(concealment)[0]!,
      rolls: d20s(10, 12),
      modifiers: [{
        source: source("shouted-warning", "environment"),
        scope: { kind: "detection", mode: { kind: "specific", mode: "reaction" } },
        amount: 3,
        channel: "contextual",
      }],
      at: 10,
    }));

    expect(settled.detection.observerTotal).toBe(10 + SIGHT_DETECTION_MODIFIER + 3);
  });
});
