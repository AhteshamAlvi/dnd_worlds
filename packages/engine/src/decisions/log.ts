/*
 * Decision log: id -> { question, chosen, rationale, ruleSource }.
 *
 * The Rulebook is frozen, so every place the engine resolves an ambiguity or
 * contradiction gets an entry here and a `decisionId` on the emitted
 * TraceNode. That keeps the engine's divergence from the book visible in the
 * workbench without editing the book.
 *
 * Entries still to write once the mechanics land: rank scale (I-V vs I-X),
 * multi-region aura composition.
 */

import type { RuleSource } from "../infrastructure/trace";

export interface EngineDecision {
    readonly id: string;

    // What the Rulebook left open or said twice in two ways.
    readonly question: string;

    // What the engine does about it.
    readonly chosen: string;

    // Why that choice, in terms a GM reading the trace would accept.
    readonly rationale: string;

    readonly ruleSource?: RuleSource;
}

export const ENGINE_DECISIONS = {
    "body.surface-area.retires-surface-units": {
        id: "body.surface-area.retires-surface-units",
        question:
            "Aura density was denominated in Surface Units, an abstract 100-unit body total taken from the Rulebook. The per-region SU table sums to 101 while the text and every worked example divide by 100, and the engine had been carrying 100 as an acknowledged placeholder because Body had no area measurement of its own.",
        chosen:
            "Surface Units are retired. Every BodyPartDefinition now authors a real external surfaceAreaCm2, the Basic Human Standard totals 16,900 cm2 (1.69 m2), and surface Aura density is Aura per square metre of actually covered anatomy.",
        rationale:
            "The 101-vs-100 discrepancy stopped mattering once the denominator became a measurement rather than a partition of an abstract whole. Real area also fixes what the placeholder could not: a constant 100 gave a Giant a human denominator, so surface density was independent of the body it was on. Surface Area scales as Scale squared while Volume scales as Scale cubed, which is the divergence that makes a large creature harder to armour in Aura and is unrepresentable with a fixed total. Area is authored per part rather than derived from Volume so that thin anatomy — a wing — can carry high area against low volume.",
        ruleSource: {
            file: "03 Aura Engine/Aura Density and Concentration.md",
        },
    },
    "aura.control.dex-22-pivot": {
        id: "aura.control.dex-22-pivot",
        question:
            "Aura Control's cost multiplier was a single quartic in x = (DEX - 25)/5, rounded to one decimal place, with perfect control at DEX 25 and nothing defined above DEX 30. Three things about that shape were unusable: it made a maximum supported DEX a developer error rather than an extraordinary character, one decimal place collapsed DEX 15 through 19 into two answers, and placing perfection at 25 left almost no mortal range above it.",
        chosen:
            "Two power curves meeting at DEX 22, which is now perfect control at exactly x1.0. Below it, (1 + (D - 22)/20) ^ -log4(5), rounded to two significant figures, holding flat at the DEX 7 result below 7. Above it, (1 + (D - 22)/10) ^ -2.75, rounded to one significant figure, with no upper bound.",
        rationale:
            "The exponents are chosen so each curve's own endpoint is exact rather than approximately right: -log4(5) is the exponent for which the DEX 7 base of one quarter produces exactly x5, and both branches pass through x1.0 at the pivot by construction. Moving the pivot to 22 puts perfect control at the top of the ordinary human range and leaves 23 through 30 as a meaningful superhuman band instead of a three-point tail. The split rounding follows the curves rather than a single house rule: below the pivot the multiplier moves slowly enough that one significant figure would flatten four DEX points into one answer, and above it the multiplier falls fast enough that two would imply precision the progression does not have. Rounding is part of the calculation, not display, so two characters whose raw curves differ in the third decimal genuinely pay the same. The superhuman branch stays defined, positive and falling forever, so a Giant with superhuman DEX resolves rather than erroring.",
        ruleSource: {
            file: "03 Aura Engine/Aura Statistics.md",
            section: "Aura Control",
        },
    },
    "aura.unawakened.pseudo-chu-from-current-aura": {
        id: "aura.unawakened.pseudo-chu-from-current-aura",
        question:
            "An unawakened character is reinforced by their own Aura, but the engine described that reinforcement as a physiological Output trickle. Output is what a body forces out through open Aura nodes, and an unawakened character's nodes are half-open, so the model gave them a spending budget the fiction says they do not have.",
        chosen:
            "Unawakened reinforcement is passive internal pseudo-Chu drawn from CURRENT AURA at a fixed 20% conversion efficiency, distributed through the whole present body by Volume. It consumes no Output capacity, competes for no Output budget, and deducts nothing from the reserve. It is reported separately from the Output-denominated distribution, and it disappears the moment the character awakens.",
        rationale:
            "Denominating it in Current Aura rather than Output is what makes the two states describable at once: an unawakened character has an accessible Output of zero and is still reinforced, which an Output trickle cannot express without contradicting itself. It also gives the effect the right dynamics for free — the reinforcement weakens as the character is drained and recovers as they are not, because it is drawn from the reserve continuously rather than paid for once. The 20% is an efficiency, not a cost, so nothing is deducted for it. Awakening removing it outright is deliberate and is what makes an awakened character without Ten genuinely worse off than an ordinary person: open nodes stop producing the passive effect and nothing replaces it until they learn to place Aura on purpose.",
        ruleSource: {
            file: "03 Aura Engine/Awakening and the Path.md",
        },
    },
    "aura.endurance.single-reserve": {
        id: "aura.endurance.single-reserve",
        question:
            "Physical effort has to cost something, and Stamina already exists as a Derived Attribute. The obvious reading is a second expendable bar — Current and Maximum Stamina — spent by exertion and recovered by rest, sitting beside the Aura pool.",
        chosen:
            "There is no Stamina bar. Aura is the character's only expendable reserve, and physical effort is paid out of it: cost = Maximum Aura x 0.001 x Exertion Load x (10 / Stamina). Stamina stays a derived score and becomes an EFFICIENCY multiplier on that cost, with no current, maximum, spent or recovered value of its own.",
        rationale:
            "A second bar needs its own maximum, its own recovery rule, its own exhaustion thresholds, and an answer to what happens when one pool is empty and the other is not — four decisions with no fictional basis, since the source material has exactly one energy a body runs on. Scaling cost by MAXIMUM AURA is what makes one reserve work across the power range: a superhuman's ordinary punch and an ordinary person's ordinary punch are both Exertion Load 1, the same relative effort, and the superhuman pays vastly more absolute Aura for a vastly more destructive punch. Their higher Stamina then makes it a smaller share of a much larger pool, so being powerful is simultaneously more expensive and more sustainable, which is the intended shape. Load is deliberately relative to the actor and supplied by Combat: Aura must never infer whether a punch was strenuous, and a superhuman pulling a blow down to human force is doing something LIGHT for them.",
        ruleSource: {
            file: "03 Aura Engine/Aura Statistics.md",
        },
    },
    "body.fatigue.wakefulness-and-depletion": {
        id: "body.fatigue.wakefulness-and-depletion",
        question:
            "Fatigue has to answer two different questions with one number — how long has this character been awake, and how drained are they — and neither the maximum a body can stay awake nor the shape of the curve between fresh and unconscious was specified.",
        chosen:
            "Fatigue is derived, never stored: clamp(10r^2 + depletionBand, 0, 10), floored once at the end. r is hours awake over a maximum that scales logarithmically with Maximum Aura, max(1, floor(2 + log10(A_max / 10))) days. Aura depletion contributes a banded 0 to +5. Wakefulness is the only stored value, and only sleep reduces it, at two waking hours per hour slept.",
        rationale:
            "Logarithmic wakefulness is what keeps one scale usable across nine orders of magnitude of Aura: an ordinary person gets two days and a character with a hundred thousand times the reserve gets seven, not two hundred thousand. Flooring to whole days makes the answer plannable. The quadratic is chosen for its SHAPE rather than its endpoints — half way to the limit is 2.5 Fatigue and functional, three quarters is 5.6 and impaired, and the last stretch arrives fast, which is how staying up actually works; a linear curve would make the first eight hours of a day cost the same as the eight before collapse. It reaches exactly 10 at the limit, so the wakefulness limit blacks a character out on its own. Depletion is BANDED rather than curved because it is the half a GM reads off a sheet mid-scene, and the bands preserve the existing calibration that roughly two thirds drained is worth +2. Physical exertion is deliberately not a third component: exertion spends Aura, depletion already charges for it, and a third term would bill the same effort twice. Only the total is floored, and the raw components survive on the result so a sheet can show how close the next level is.",
        ruleSource: {
            file: "03 Aura Engine/Aura Statistics.md",
        },
    },
    "time.continuous-resolution.boundaries": {
        id: "time.continuous-resolution.boundaries",
        question:
            "Time-based Aura was resolved by summing every contribution across whatever span a caller submitted and clamping once at the end. That made the answer depend on how the span was divided: a character 100 Aura short of full, recovering 5,000/hour while paying 100/hour of upkeep, ended two hours later either 100 down or exactly full, depending on whether the GM advanced once or twice.",
        chosen:
            "Continuous resolution at calculated boundaries. An interval is split wherever the active rates change — the pool filling, the pool emptying, an upkeep becoming unaffordable, a collapse, an activity or suppression change, a timed effect starting or expiring, a scheduled action, the interval's end — and each segment is integrated at constant rates. Boundary times are solved for algebraically, never stepped towards. Recovery is netted against expenditure UNCAPPED and only the pool is clamped.",
        rationale:
            "advance(T) must equal advance(T/N) applied N times, because a rules engine may not give a different answer for a UI that refreshes every second than for a GM who clicks once. Splitting at exactly the instants the old model smeared over is what delivers it: the two answers above differ precisely because the moment the pool filled fell inside the span, and now that moment is a segment boundary. Uncapping recovery is the other half — capping it against missing Aura before netting is what let a full character's upkeep either be free or unpayable depending on subdivision, where the truth is that incoming regeneration pays it and the surplus is discarded. Boundaries are calculated rather than simulated because stepping would be slower AND less accurate, and would reintroduce the dependence on step size the whole exercise removes. Verified at 1, 2, 5, 60 and 600 subdivisions, and at 28,800 one-second steps across eight hours.",
        ruleSource: {
            file: "03 Aura Engine/Aura Statistics.md",
        },
    },
    "time.upkeep.exact-shutdown": {
        id: "time.upkeep.exact-shutdown",
        question:
            "A maintained Aura effect the character cannot afford for a whole submitted interval: does it run, or not? The first implementation required affordability for the entire span and treated anything less as inactive throughout.",
        chosen:
            "Upkeep is charged continuously until the exact instant the reserve can no longer carry it, and shuts down there with that timestamp reported. 150 Aura against a 100/hour upkeep across two hours runs for ninety minutes, is charged 150, shuts down at start + 1.5 hours, and the remaining half hour resolves without it. When several effects are running and the balance cannot carry them all, the lowest priority is shed first and shedding stops as soon as what remains is sustainable; equal priorities break by commitment id rather than by the order the caller built the array in.",
        rationale:
            "Interval-wide affordability made the result depend on how the caller chopped up time in the most visible possible way — the same Ren was up for the whole of four one-hour advances and down for the whole of one four-hour advance. It was also simply wrong about the fiction: an effect that ran for ninety minutes did run for ninety minutes and did whatever it does for them. Reporting the exact instant matters for the same reason: a player needs to know when they lost it, and 'sometime in the last two hours' is not an answer. Breaking priority ties by id rather than array order is what keeps a character from losing a different effect depending on how the scene assembled its list.",
        ruleSource: {
            file: "03 Aura Engine/Aura Statistics.md",
        },
    },
    "time.character.lazy-projection": {
        id: "time.character.lazy-projection",
        question:
            "A character sheet has to show Aura, wakefulness and Fatigue as of the current game clock, but stored state is only a snapshot from whenever it was last written. The obvious approach is a tick that walks every character every few seconds and writes their state forward.",
        chosen:
            "Each character stores one timestamp, resolvedAt, recording when their stored state was last committed. Sheets PROJECT from there to the clock's current reading through the same coordinator a committed advance uses, and persist nothing. An advance may only start exactly at resolvedAt, which is checked.",
        rationale:
            "A tick costs in proportion to the size of the world rather than to what is happening in it, and puts the answer at the mercy of how often it ran — the same dependence on update frequency the continuous solver exists to remove. Projection costs nothing for an NPC nobody is looking at and one calculation when somebody looks. Running the SAME coordinator is what stops a display disagreeing with a save: a separate read-only estimator would drift, and the drift would surface as a value jumping the moment anything persisted. The resolvedAt check is what makes double application impossible — a system with both a live clock and a manual time skip will eventually try to charge the same hour twice, and rejecting it is better than absorbing it.",
    },
    "time.combat-round.two-seconds": {
        id: "time.combat-round.two-seconds",
        question:
            "How long is a Combat Round? The Rulebook's Combat Core quotes a six-second reference turn, Combat Time then says a Round's fictional length is not a flat constant at all but whatever the active Combat Scale's differential produces, and Scale Speed and Magnitude tabulates combat movement against the old flat six. Three answers, and the engine had been carrying a fourth: time/duration.ts said two seconds while foundation/attributes/speed.ts said six.",
        chosen:
            "One canonical Combat Round of TWO seconds, declared once in time/duration.ts as SECONDS_PER_COMBAT_ROUND and re-exported to Combat callers as COMBAT_ROUND_DURATION_SECONDS. One hour is exactly 1,800 Rounds. Every system that needs a Round length imports it; no other file may declare one, and a test enforces that against the source text.",
        rationale:
            "The variable-length reading is unimplementable as a conversion rate: Aura upkeep quoted per Round has to become a per-hour rate for the endurance model, and a Round whose length depends on the encounter's Scale makes that conversion undefined outside an encounter. Two seconds rather than six because the Round is now the unit movement is denominated in, and a shorter Round is what keeps a Move a single committed burst rather than a span long enough to contain a change of mind. The number mattering less than the singleness of it is the real point — the six survived in movement for as long as it did precisely because it was a second declaration nothing compared against the first, and a stale constant that only ever multiplies is invisible until someone checks the anchor by hand.",
        ruleSource: {
            file: "04 Combat/Combat Time.md",
        },
    },
    "movement.speed.round-denominated-accelerating-curve": {
        id: "movement.speed.round-denominated-accelerating-curve",
        question:
            "Speed converted to a velocity of 10/3 m/s at Speed 10 and doubled every three points forever. Three things about that were unusable: it was anchored to a three-second Move that no longer existed, a constant proportional gain made the last points of the ladder buy exactly what the first did, and nothing said what the top of the scale was supposed to mean.",
        chosen:
            "Speed is denominated in metres per ROUND and accelerates. With x = (S - 10) / 20, RoundMovement(S) = 6 x 2 ^ (5x + 1.866248611111173x^2). Speed 10 is exactly 6 metres per two-second Round (3 m/s) and Speed 30 is exactly 700 (350 m/s). Velocity is the allowance divided by the imported Round length. The conversion takes the CONTINUOUS Speed position — the mean of the continuous Strength ladder position and resolved AGI — and rounding to two significant figures happens only at the sheet.",
        rationale:
            "Two anchors and a curve between them, rather than one anchor and a slope, is what lets the top of the ladder mean something: 350 m/s puts Speed 30 barely past the engine's 343 m/s reference speed of sound, so breaking it is a landmark a character arrives at rather than a threshold the curve sails through. The quadratic term is not chosen for elegance — the linear five doublings across the span is chosen first, and 1.866248611111173 is whatever makes the upper anchor land on exactly 700 rather than approximately there, which is why it is carried to full double precision. The exponent's slope stays positive far below Speed 1, so the curve is finite, positive and monotonic across the supported range without clamping. Denominating in metres per Round rather than m/s is what removes movement's ability to disagree with the clock: there is one Round length, movement imports it, and a velocity is one division away. Taking the continuous position matters more here than anywhere else on the ladder, because Strength is a logarithm of Structural Capacity: two characters 40% apart in real force both display STR 16, and flooring before converting made them move identically.",
        ruleSource: {
            file: "01 Core Rules/Scale Speed and Magnitude.md",
        },
    },
    "movement.move.round-action-capacity-divisor": {
        id: "movement.move.round-action-capacity-divisor",
        question:
            "A Move is one Action, so how far is it? The engine divided the Round by ACTIONS PER TURN, which meant a creature granted a third Action per Turn covered three full Moves in the same Round a two-Action creature covered two in — a 50% speed bonus attached to a sequencing mechanic, priced as though it were nothing.",
        chosen:
            "A Round holds ONE movement allowance. MoveShare = 1 / RoundActionCapacity and MoveDistance = CurrentRoundMovement x MoveShare, so spending every Round Action on Move covers exactly the Round allowance and no arrangement of Actions covers more. The divisor is SNAPSHOTTED at Round start after start-of-Round modifiers and is fixed for that Round. Actions per Turn affect sequencing only and appear in neither formula. Reaction Moves draw on the same allowance. Forced or granted movement must declare whether it charges against the cap.",
        rationale:
            "Dividing one allowance is the only form of the rule under which the action economy cannot be traded for ground: more Actions buy finer control over when a character moves, which is worth having, rather than more distance, which was never intended to be for sale. Snapshotting the divisor is what makes the arithmetic conserve — a two-Action character who has Moved once has spent half their Round, and re-dividing when they lose an Action would retroactively make that half the whole thing, so an effect that never mentioned movement could rob them of ground they had already banked. Losing Actions still costs, and costs the right way: the shares remain and the character has no Action left to spend on one. Consumption is tracked as a COUNT of Moves rather than an accumulating distance because adding a share at a time drifts, and the drift surfaces as a character who cannot quite reach a square they have exactly enough movement for; counting makes capacity/capacity exactly one. Grants are required to declare their relationship to the cap because both answers are legitimate and neither is safe to default: a free step that ignored the cap is an unpriced movement bonus, and a shove that consumed it punishes the victim for being shoved.",
    },
    "movement.presentation.two-significant-figures": {
        id: "movement.presentation.two-significant-figures",
        question:
            "Movement figures off an exponential curve are not round numbers — Speed 16 is 19.0659 metres and a third of it is 6.3553. How much of that does a character sheet show, and does the engine calculate with the shown value?",
        chosen:
            "Two significant figures at the SHEET only. Stored positions, Round allowances, Move shares and consumed distance all keep full double precision, and nothing in the engine consumes presentMovementMeters's output.",
        rationale:
            "This is deliberately the opposite of the Aura Control decision, where rounding is part of the calculation so that two characters whose raw curves differ in the third decimal genuinely pay the same. Movement ACCUMULATES, and that is the whole difference: a multiplier is applied once, but a Move share is added up to ten times within a Round, and rounding it first is exactly how a character ends the Round having travelled 5.9 or 6.1 metres against a 6-metre allowance. Two figures rather than one because movement spans four orders of magnitude across the ladder and one figure would collapse Speed 12 through 14 into a single displayed distance.",
    },
    "movement.speed.canonical-score-owns-base-movement": {
        id: "movement.speed.canonical-score-owns-base-movement",
        question:
            "Speed averages STR and AGI, and STR arrives as a continuous logarithm of Structural Capacity. Base movement can consume either the integer Derived Attribute a sheet shows, or the continuous position underneath it. movement.speed.round-denominated-accelerating-curve chose the continuous position, on the reasoning that flooring discarded up to a fifth of a doubling of genuine force.",
        chosen:
            "SUPERSEDES that half of the earlier decision. Base movement consumes the canonical integer Speed — round((STR + AGI) / 2), the Derived Attribute — and nothing else. The continuous Strength ladder position does not reach movement at any point, and movement does not reconstruct Speed from its Attributes. The curve, its anchors and its shape are unchanged.",
        rationale:
            "The precision was real and it bought the wrong thing. Two characters 25% apart in scale both resolve to STR 10, AGI 10 and Speed 10 while their ladder positions are 10.00 and 10.64 — so under the continuous version they covered 6.00 and 6.55 metres a Round with two identical character sheets and nothing on either one accounting for the difference. A rules engine may not answer 'why is that one faster' with a number the sheet does not carry. The invariant EQUAL CANONICAL SPEED = EQUAL BASE MOVEMENT is worth more than the fifth of a doubling, because it is what makes movement explicable at the table and comparable between characters. It deliberately does not promise equal PERFORMANCE: a swimmer and a sprinter of one Speed will differ, through mode, propulsion, gait and integrity factors that a GM can point at, and every one of those is inspectable in a way a logarithm of Structural Capacity is not.",
        ruleSource: {
            file: "01 Core Rules/Scale Speed and Magnitude.md",
        },
    },
    "movement.resolution.mode-propulsion-gait-integrity": {
        id: "movement.resolution.mode-propulsion-gait-integrity",
        question:
            "Base movement is one number, and a great many things will eventually modify it — Sprint, Crawl, Climb, Swim, Flight, the limbs doing the work, how those limbs are arranged, and how damaged they currently are. Left unnamed, each of those arrives as a multiplication at whichever call site its author happened to be looking at.",
        chosen:
            "Four named factors, declared now and resolved later: Resolved = Base(Speed) x Mode x Propulsion x Gait x Integrity. Mode is the inherent rate of a movement mode; Propulsion is the strength and suitability of the parts producing it; Gait is their number, arrangement, symmetry, specialization and coordination; Integrity is how usable they currently are. Only Integrity is implemented — it is the existing locomotion fraction, bounded to [0, 1]. The other three are fixed at 1 and reported on every result. Limb count is an INPUT to gait, never a modifier of its own.",
        rationale:
            "Naming an empty slot costs nothing and fixes where the answer goes. The alternative is not 'no factors' but 'four factors nobody declared', discovered one at a time as Swim, then encumbrance, then a Trait each multiply the same number somewhere else — at which point their order and their interaction are accidents rather than decisions. Splitting propulsion from gait specifically is what makes non-humanoid movement describable: a naturally tripedal creature has an efficient tripedal gait while a quadruped down to three usable legs has a disrupted one, and the two are indistinguishable to anything that treats a leg count as a multiplier. Gait must always compare against the creature's INTENDED body plan, which is why it cannot be a lookup table on a number of limbs. Integrity is bounded to [0, 1] rather than left open because an unbounded integrity is a movement bonus mechanism waiting to be discovered by accident: the first '1.2 for a powerful runner' would have become one, and strong limbs are propulsion's job.",
    },
    "movement.input.normalized-boundaries": {
        id: "movement.input.normalized-boundaries",
        question:
            "The Speed curve is an exponential, so it answers ANY input with confident forward motion — a NaN Speed, a negative Speed, a Speed of 40, an integrity of 1.5. None of these is refusable in the ordinary way, because these are pure derivations with no EngineResult to fail into.",
        chosen:
            "One normalization boundary per quantity. Speed: non-finite or <= 0 produces zero movement; otherwise round to the canonical integer and clamp into 1..30. Integrity: non-finite or <= 0 produces 0, above 1 clamps to 1. Round Action Capacity: one shared helper flooring to a non-negative integer, used by every helper that divides or records a capacity. Speed 30 is the ordinary base-curve ceiling, and anything faster arrives as an explicit modifier on the result rather than as a larger number fed to the exponential.",
        rationale:
            "The order inside the Speed rule is the part worth recording: zero and negative Speed exit BEFORE the clamp to 1, because 'this does not move' and 'this moves very slowly' are different claims and merging them would have turned every NaN into a Speed 1 character covering 1.6 metres a Round. Clamping at 30 rather than extrapolating is a statement about what the curve is calibrated for: it was fitted between two anchors in the mortal range, and feeding it 40 answers 39 kilometres a Round with an authority it has not earned. One capacity helper rather than three matching implementations, because two normalizations that merely agree today are two that can disagree after an edit, and a share helper flooring differently from the ledger would hand out Move shares the ledger could not spend.",
    },
    "movement.ledger.one-allowance-two-spenders": {
        id: "movement.ledger.one-allowance-two-spenders",
        question:
            "A Round's movement can be spent by a Move the character chooses and by a charged grant somebody else applies — a shove, a pull, a repositioning Technique. Both draw on one finite allowance, so what happens when a grant has already consumed the whole Round and the character still holds an unspent Action?",
        chosen:
            "The Move is REFUSED before the Action is spent, with the existing allowance-spent reason. `movesSpent` does not increment and the ledger is returned untouched. A partially consumed allowance is a different case and still succeeds: the Move covers whatever distance remains, which may be short of a full share, and spends the Action because the Move was performed. Charged grants are clamped to the remaining allowance and RECORDED clamped. Refusal precedence is fixed: no Round Actions, then no Move shares remaining, then no charged distance remaining.",
        rationale:
            "The ledger previously let the exhausted case through as a SUCCESS of zero metres, which is the worst of the three available answers: a caller counting successful Moves believed it happened, the Action was consumed either way, and nothing in the result said the character had not moved. Refusing before the Action is spent is what makes the outcome match the fiction — a character who has already been shoved their whole Round's distance has not used their Action, they have run out of ground. Short Moves are deliberately NOT refused, because a Move that covers one metre instead of three is a Move that happened and the Action is genuinely gone. Recording charged grants clamped rather than as offered keeps the field truthful: the consumption is clamped regardless, so an unclamped total can only ever mislead whoever reads it into thinking a 100-metre shove moved someone 100 metres across a 6-metre Round.",
    },
    "runtime.state.outlives-combat": {
        id: "runtime.state.outlives-combat",
        question:
            "Where does a temporarily-true fact live? Ren is up, a transformation is running, a Condition has four rounds left. The two obvious homes are the permanent Character — a renActive boolean beside the mastery — and the Combat encounter, which is where most of these matter.",
        chosen:
            "A third place: shared Runtime State, which exists outside Combat and is not part of the Character. Combat ATTACHES to it and owns only what an encounter owns — remaining Actions, Turn, Reaction, Initiative. Attaching and detaching carries every other section by reference, unchanged. Runtime State is composed from per-domain sections rather than being one object every domain may write.",
        rationale:
            "Both obvious homes fail on the same fact: an activation is not scoped to an encounter and is not part of what a character IS. Ren goes up in a corridor, survives a fight starting, and is still up after it ends — so Combat owning it would mean importing every active application on entry and exporting them on exit, a copy in each direction and a place for the two to disagree. Putting it on the permanent Character fails at the first save instead: every load has to decide whether someone who was mid-Ren when the session ended is still in Ren, and every migration carries a field that was never meant to persist. Sections rather than one bag because the ownership matrix is only enforceable if there is a shape to violate; a single untyped object lets any domain edit any other domain's data invisibly. The Combat slot is a GENERIC parameter and this layer never names a Combat type, because runtime sits below gameplay and an import the other way would reverse the layering the architecture tests exist to hold.",
    },
    "runtime.transition.state-authoritative-events-explain": {
        id: "runtime.transition.state-authoritative-events-explain",
        question:
            "A state-changing operation has to return the new state and some account of what happened. Event sourcing makes the events primary and derives state by folding them; the alternative makes state primary and treats events as a record.",
        chosen:
            "State is authoritative and events are explanatory. Nothing in the engine rebuilds state by folding events, so an event may be dropped, batched, filtered or ignored with no consequence for correctness. Transitions return TransitionResult<TState, TChange> = EngineResult<TransitionOutcome<...>>, reusing the existing envelope rather than introducing a second top-level success/failure shape.",
        rationale:
            "A fold is a second implementation of every calculation, and it has to be kept in step with the first forever. The day they disagree, the character sheet and the event log are both plausible and one of them is wrong, with nothing to say which — a failure mode this engine already avoids elsewhere by having exactly one place each rule lives. Building on EngineResult rather than beside it is the same argument at the type level: two envelopes means every caller checks two shapes and every helper is written twice. The outcome is generic over state and changes only; the original design was generic over events and requests too, which cannot be ROUTED, because a coordinator dispatching a mixed list needs a supertype and four unrelated per-domain types do not provide one. Events and requests are therefore a shared discriminated base that domains extend.",
    },
    "runtime.costs.invalid-spends-nothing-failed-attempt-pays": {
        id: "runtime.costs.invalid-spends-nothing-failed-attempt-pays",
        question:
            "An attack that misses and an attack that was never legal both end with the attacker having accomplished nothing. Does the engine treat them the same way?",
        chosen:
            "No, and the difference is the load-bearing distinction in the protocol. An operation that cannot BEGIN — unknown target, missing mastery, unaffordable, malformed dice — fails, commits no cost, applies no effect and leaves every input unchanged. An operation that begins and then goes badly SUCCEEDS, keeps its committed costs, and reports the miss as an event inside the successful transition. A resist, immunity or cap is likewise an actual of zero rather than a failure. Mandatory costs commit atomically through two-phase prepare/commit handlers, and partial payment is refused unless a request explicitly allows it.",
        rationale:
            "Collapsing the two is wrong in whichever direction it collapses. Treating a miss as a failure refunds the Aura and the Action every time somebody swings and misses, which makes missing free and makes the action economy meaningless. Treating an illegal operation as a success charges a character for a wiring bug and makes the bug indistinguishable from bad luck in the log. Atomicity needs the two-phase handler specifically: 'validate every cost, then commit every cost' is unimplementable when a domain's only entry point validates and applies in one call, because by the time the second cost refuses the first is already spent and the coordinator has nothing it is allowed to roll back to. Partial payment is refused by default because a half-paid cost is a mechanic nobody designed — a mechanic that wants one has to say so and report both figures.",
    },
    "runtime.requests.typed-cross-domain-changes": {
        id: "runtime.requests.typed-cross-domain-changes",
        question:
            "Nen activation costs Aura, an attack damages a Body, recovery finishes an Injury that lives on Character status. How does one domain change state another domain owns?",
        chosen:
            "It does not. It raises a typed request naming the owning domain, and the owner validates and applies its own rule, then reports requested against actual. Cost requests resolve before commitment; effect requests resolve after. requestId is IDENTITY rather than content — two separate 10-damage requests to one target are both honoured, while the same id arriving twice is refused as a cycle. Consequence depth is bounded at 8.",
        rationale:
            "The alternative is not 'a domain reaches into another domain', it is 'every domain carries a partial copy of the other's rules'. Four systems need Aura spent; without requests, four of them learn what an Aura cost is, and the fourth copy is the one that disagrees about the Control multiplier. Routing through the owner also makes the boundary auditable: a request names both ends, so a domain acting outside its own state is visible in the data rather than only in a review. Identity rather than content-hashing is what lets legitimate repetition through — two identical shoves are two real shoves — while still catching the genuine bug, which is a request producing itself. The depth bound exists to catch non-termination rather than to constrain design: every consequence chain anybody has designed is finite and far shorter than eight, so hitting it means a request is producing itself and is reported as an engine bug.",
    },
    "runtime.dice.caller-supplied-and-validated-first": {
        id: "runtime.dice.caller-supplied-and-validated-first",
        question:
            "The engine resolves checks, so something has to produce the numbers. Rolling them internally is one line and removes a whole class of caller mistakes.",
        chosen:
            "Dice are caller input. No gameplay outcome in this engine is randomly generated; the only Math.random in the tree is a UUID fallback in infrastructure/id.ts, which produces an identity rather than a result, and never decides anything. Rolls are identified by PURPOSE rather than by position, and are validated — present, finite integer, right die, in range, not ambiguously duplicated — before any cost commits. Operation ids and timestamps are likewise supplied rather than generated. This is not a dice roller and does not become one.",
        rationale:
            "Determinism is the whole return. Given one starting state, context, command, time and set of dice, this engine returns the same state, events, changes, warnings, errors and trace — which makes a session replayable and a bug report reproducible from its inputs. An internal roll breaks that on the first attempt, and a generated operation id or an internally-read clock breaks it just as completely for facts that look nothing like dice. Validating BEFORE commitment rather than at the point of use is what makes a malformed roll cost the character nothing: a caller who forgot to supply the attack roll must not have already paid for the swing. Purposes rather than positions because two d20s in an array are ambiguous, and picking either one would be the engine deciding a gameplay outcome by array order — the same failure the simultaneous-event work removed from Aura.",
    },
    "runtime.time.single-character-coordinator": {
        id: "runtime.time.single-character-coordinator",
        question:
            "The runtime protocol defines how state changes are shaped, and character/time/ already coordinates applying one interval across Aura, wakefulness, Fatigue and recovery. Should the time coordinator be reshaped to wear the new types?",
        chosen:
            "No. character/time/ remains the single character-time integration point, unchanged, and its conformance to the protocol's meanings is documented rather than restated in the protocol's type names. No second time coordinator is created. Existing transitions migrate incrementally as their domains are developed, not through a repository-wide rewrite.",
        rationale:
            "The coordinator already satisfies every property the protocol asks for — deterministic, atomic at a timestamp, immutable in its inputs, interval-invariant across 28,800 one-second steps, rejecting stale and gapped intervals. Reshaping it would therefore change no behaviour while putting a 22-test invariance suite and the half-open ownership rules at risk, which is a poor trade at any time and a particularly poor one in a phase whose purpose is to establish a protocol rather than to move calculations. The same reasoning governs the wider migration: a protocol proves itself on representative operations, and rewriting thirty legacy transitions at once would mix an enormous diff of mechanical churn into the one change where the design still needs to be reviewable.",
    },
    "attributes.derived.rounding-direction": {
        id: "attributes.derived.rounding-direction",
        question:
            "Derived Attributes are the mean of two to five Attributes, so a half-point tie is common (PER 16 + WIS 13 averages 14.5). The Rulebook says to round to the nearest whole number but does not say which way a tie goes.",
        chosen:
            "Ties round upward, toward positive infinity — 14.5 becomes 15, and -14.5 becomes -14. This is JavaScript's Math.round, used directly rather than wrapped.",
        rationale:
            "Rounding half up is the ordinary tabletop reading of 'round to the nearest whole number' and favors the character, which is the right default for a value they are rolling with. It is worth recording because it is asymmetric across zero: a Derived Attribute CAN go negative once Conditions and injuries push the contributing Attributes below the stored 1-30 range, and at that point 'up' means 'smaller in magnitude' rather than 'better'. A GM comparing two heavily-penalized characters should know the tie-break is directional, not magnitude-based.",
    },
} as const satisfies Record<string, EngineDecision>;

export type KnownDecisionId = keyof typeof ENGINE_DECISIONS;

export function getEngineDecision(
    decisionId: string,
): EngineDecision | undefined {
    return Object.prototype.hasOwnProperty.call(ENGINE_DECISIONS, decisionId)
        ? ENGINE_DECISIONS[decisionId as KnownDecisionId]
        : undefined;
}
