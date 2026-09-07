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
    "runtime.operation.discardable-transaction-draft": {
        id: "runtime.operation.discardable-transaction-draft",
        question:
            "A coordinated operation touches several domains' state. The first coordinator committed each cost as it went and returned only events and outcomes, leaving handlers to publish their results through closures and a committedState() accessor. Where does the new state actually live, and what happens to it when a later step fails?",
        chosen:
            "SUPERSEDES the commit-as-you-go half of runtime.costs.invalid-spends-nothing-failed-attempt-pays. The whole operation runs against a DRAFT: a map from domain to that domain's state, seeded from the caller's originals. Handlers are pure — they receive the draft's value for their domain and return a replacement, capturing nothing and writing nothing. On success the completed draft IS the result, returned as CoordinatedOutcome.states. On any failure at any step the draft is discarded and the caller keeps exactly what they had. committedState() and every equivalent side channel are removed.",
        rationale:
            "The old shape broke its own headline promise. Costs were committed and THEN effects were routed, so an unhandled effect request returned a FAILURE after the Aura had already left the pool — a failed operation that spent something, which is the single outcome this protocol exists to make impossible. It was not a missing check but a missing capability: with nothing to roll back to, the coordinator could only detect the problem after it had caused it. A draft removes the category, because abandoning an operation costs nothing by construction rather than by remembering to undo. Returning the draft also collapses two sources of truth into one: a side channel put the authoritative Aura state somewhere the coordinator could not see and the type system could not check, so a caller reading `states` and a caller reading `committedState()` could legitimately disagree about what happened.",
    },
    "runtime.costs.cumulative-against-the-draft": {
        id: "runtime.costs.cumulative-against-the-draft",
        question:
            "An operation may raise several costs against one owner — two Aura expenditures, two Actions. Each was prepared against the state the operation started with. Is that the same balance every time?",
        chosen:
            "No. Each cost prepares against the DRAFT AS IT STANDS, so the second sees the first one's deduction. Costs owned by one domain are cumulative, and an operation whose combined cost exceeds the resource is rejected whole. Partial payment remains prohibited unless a request explicitly allows it.",
        rationale:
            "Preparing every cost against the original state made affordability a per-cost question when it is a per-operation one: two 60-Aura costs each validated happily against a 100-Aura pool, and the character spent 120 they did not have. The bug is subtle precisely because each individual check was correct. Chaining the draft is not a special cumulative-cost rule bolted on top — it is what 'the state as it stands' already meant, applied consistently, and it needs no grouping by resource because the draft is the grouping.",
    },
    "runtime.effects.simultaneous-batch-settlement": {
        id: "runtime.effects.simultaneous-batch-settlement",
        question:
            "Several effects land on one owner at one instant. The coordinator sorted them deterministically and applied them one at a time, which is reproducible. Is reproducible enough?",
        chosen:
            "No. Effects sharing an owner and an effective time are handed to that owner as a BATCH with one pre-batch state, and the owner returns one combined replacement. Every member is calculated from the state handed over, not from a running total. Deterministic ordering still fixes the event log and the order batches are dispatched; it may not decide a mechanical result.",
        rationale:
            "Reproducible and correct are different properties. Applying simultaneous effects one at a time lets the second read the first's result, so two effects that genuinely happen at one instant produce an answer that depends on the sort key — stable, but arbitrary, and wrong in the same way the Aura solver was wrong when it applied recovery before drains at a single timestamp. Aura's fix was to net simultaneous contributions and clamp once; this is the same fix at the coordinator level, generalised: the owner is the only thing that knows how its simultaneous changes combine, so it is given all of them and one starting point and asked once.",
    },
    "runtime.requests.routing-base-domain-payloads": {
        id: "runtime.requests.routing-base-domain-payloads",
        question:
            "What belongs on the shared request type? The first version put a numeric `requested` on the base, so every request carried an amount.",
        chosen:
            "Only routing: request id, kind, phase, operation id, timestamps, source domain and target owner. Amounts move to QuantitativeRequest, which genuinely quantitative requests extend. Domain-specific fields belong to the domain's own request type. `upkeepPerHour` is likewise removed from the shared ActiveApplication shape.",
        rationale:
            "A required field that some requests must lie about is a field on the wrong type, and the symptom was visible: removing a fully healed Injury is not a quantity, so it shipped `requested: 1` — a placeholder meaning 'one Injury, I suppose' that every consumer then had to know to ignore. Placeholder values are worse than absent ones because they type-check, read as data, and quietly answer questions nobody asked. Generic upkeep failed the same way from the other direction: whether an upkeep is per hour or per Round, which reserve pays it, whether it scales with Output and what suspension does to it are domain questions, and one shared number silently commits every future domain to one set of answers.",
    },
    "runtime.ownership.domain-and-entity-id": {
        id: "runtime.ownership.domain-and-entity-id",
        question:
            "The ownership matrix names domains — aura, body, character-status, combat — and the first coordinator keyed requests, events and the transaction draft by domain alone. Is a domain enough to address a piece of state?",
        chosen:
            "SUPERSEDES the domain-only routing in runtime.requests.typed-cross-domain-changes and the domain-keyed draft in runtime.operation.discardable-transaction-draft. Every request, event and stored state names a RuntimeOwnerRef — a domain AND a stable entity id — and the draft is keyed by ownerKey(), \"aura:gon\". Simultaneous effects group by effective time and COMPLETE target owner. Handlers stay registered per domain, because the rules are per domain; what differs is the state each call is handed.",
        rationale:
            "A domain names a KIND of state, not an instance of one, and almost every interesting operation involves two characters. Keyed by domain alone, Gon's Aura and Killua's Aura shared one slot: the second write won, and a fight between two people resolved as though one person were hitting themselves. The batching consequence was worse than the storage one, because it was silent — two characters' damage grouped into one batch and applied to whichever Body the coordinator fetched, producing a plausible number attributed to the wrong person. Keeping handlers per domain is the other half of the decision: duplicating the Aura mechanic per character would be the multi-copy failure the request system exists to prevent, so there is one handler and it is handed whichever pool the request names.",
    },
    "runtime.validation.phases-and-handler-outcomes": {
        id: "runtime.validation.phases-and-handler-outcomes",
        question:
            "The coordinator trusted its callers and its handlers about two things: that a request in the cost list was a cost, and that a handler's reported outcomes corresponded to the requests it was given. Both were checked loosely or not at all.",
        chosen:
            "Both are enforced. Only \"cost\" requests may appear in operation.costs and only \"effect\" requests may enter settlement; a misplaced one discards the draft. Outcome ids must match their requests EXACTLY — missing, duplicated, unexpected and mismatched ids are all refused — and any reported amount must be finite and non-negative. A malformed prepared cost is reported rather than thrown on.",
        rationale:
            "The phases carry different atomicity guarantees, so running one as the other is not a harmless mix-up: an effect priced as a cost becomes refusable when it was never meant to be, and a cost settled as an effect applies before anything has been priced. Outcome checking by COUNT rather than identity was the subtler gap — a handler that answered one request twice and dropped another had the right total and the wrong answer, and the dropped request reported nothing at all while the operation succeeded. Amounts are checked because a NaN or negative actual flows straight into an event and a caller's arithmetic without ever being questioned, and \"healed -3 Body Points\" reads as data rather than as the bug it is. The malformed-prepared-cost guard exists because a throw escapes the transaction and takes the trace with it, which is strictly worse than a reported failure that leaves every original state intact.",
    },
    "runtime.context.resolved-per-owner": {
        id: "runtime.context.resolved-per-owner",
        question:
            "Owner-keyed state gave each character their own Aura pool, and the Aura cost handler was still constructed with ONE character's resolution context — their Attributes, their Aura access, their Control multiplier. Whose body is a cost calculated against?",
        chosen:
            "The owner the request names. createAuraCostHandler takes a lookup, (owner) => AuraTransitionContext | undefined, resolved from request.to at prepare time. One handler stays registered for the domain. A missing context REFUSES the operation and never falls back to another owner's. The lookup must be a pure read: returning a different context for one owner within an operation, or mutating anything reachable through it, would be the state side channel the returned draft exists to replace.",
        rationale:
            "Separate pools with a shared calculation is arguably worse than a shared pool, because the numbers look individual and are not: Killua's Aura was debited using Gon's Maximum Aura, and the result was a confident, plausible, wrong figure with nothing anywhere to contradict it. It survived the owner-keying pass precisely because that pass fixed WHERE state lived without asking what the arithmetic read. Refusing a missing context rather than defaulting is the same argument as refusing missing state: a fallback that silently substitutes somebody else's body is indistinguishable from a correct answer at the call site, and the first symptom would be a balance query months later. One handler rather than one per character is deliberate — duplicating the Aura mechanic per owner is the multi-copy failure the request system exists to prevent.",
    },
    "runtime.state.addressed-never-created": {
        id: "runtime.state.addressed-never-created",
        question:
            "A request names an owner the operation supplied no state for. The coordinator passed the resulting `undefined` to the handler and let it decide.",
        chosen:
            "The coordinator refuses before the handler is called, with a typed failure naming the missing owner key and listing the ones it does have. `undefined` never reaches a handler, and an explicitly-undefined entry counts as absent rather than as empty state. Creating state must be an operation somebody wrote.",
        rationale:
            "Handing `undefined` to a handler puts every one of them one step from inventing a resource out of nothing, because `(state as number) ?? 100` is the natural way to write past a missing value and it reads as defensive rather than as dangerous. A character's Aura would then spring into existence on the first typo in an owner id, with a plausible default, and the operation would succeed. Refusing early also gets the diagnosis right: the error names the owner that was addressed and the owners that exist, which is the actual bug, rather than surfacing later as an arithmetic oddity inside a domain that was handed nothing.",
    },
    "runtime.outcomes.quantitative-must-be-complete": {
        id: "runtime.outcomes.quantitative-must-be-complete",
        question:
            "Handlers report requested-versus-actual so that caps, resists and shortfalls are visible. Both figures were optional, and the full-payment check only ran when `actual` happened to be present.",
        chosen:
            "A QuantitativeRequest gets a complete answer or the operation is refused: both figures present, both finite and non-negative, and the reported `requested` equal to what was asked. A quantitative prepared cost must state what it will pay. Non-quantitative requests continue to report no amounts at all.",
        rationale:
            "Optionality made omission a way PAST the rule it guarded. The partial-payment check was written as 'if an amount was reported and it is short, refuse', so a handler that reported no amount could underpay a cost that explicitly forbids underpayment, and nothing downstream could say how much had actually left the pool. Requiring the echo of `requested` closes the quieter half: a handler reporting a figure other than the one it was given makes the log describe an operation nobody performed, and requested-versus-actual is worthless if the left-hand side is also the handler's opinion. Non-quantitative requests stay exempt because that is the entire reason amounts left the shared base — a removal has nothing to count, and demanding a number would reintroduce the placeholder the base was cleaned of.",
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
    "actions.targets.optional-and-zero": {
        id: "actions.targets.optional-and-zero",
        question:
            "Combat modelled an Action's subjects as targetCombatantIds, and the surrounding assumption everywhere was that an attack has a target. A punch thrown at the ground, a stance, an En expansion and a wall of flame across a corridor all have no target and are all things a character does.",
        chosen:
            "Target cardinality is a minimum and a nullable maximum, and zero is an ordinary value. A profile expresses none (0,0), optional (0,1), exactly one (1,1), one or more (1,null) or any number (0,null); a selection is a flat list that may be empty when the profile permits it. There is no recursive 'multiple' target containing other targets.",
        rationale:
            "Making zero targets exotic forces every aimed action to invent a target, and the invention is always the ground or the actor themselves. Downstream that is unrecoverable: nothing can later tell which entries were subjects and which were placeholders for geometry, so a collateral-damage rule and a declared-target rule end up reading the same list and disagreeing about it. A minimum and a maximum also collapses five special cases into one comparison, which is why a heal requiring exactly one recipient and a stance requiring none are the same code path with different numbers. The maximum is null rather than Infinity so an unbounded profile survives JSON, and the collection is flat because a nested target makes 'how many targets does this have' a tree walk that every consumer would answer slightly differently.",
    },
    "actions.focus.separate-from-targets": {
        id: "actions.focus.separate-from-targets",
        question:
            "Where an action is AIMED and WHO it is aimed at were the same field. A ground punch, a cone, and a charge along a route each need aim and may have no subject at all.",
        chosen:
            "Declared goal, declared targets, and action focus are three independent fields on an intent, and suggested and final affected subjects are two more produced later. Focus is a closed union of none, direction, position, path, and area placement. The declared goal is narrative text that nothing parses, dispatches on, or reads as mechanics.",
        rationale:
            "These five are the ones that get merged in a hurry and cannot be separated afterwards. Targets are subjects, focus is geometry, and an action may have either, both, or neither: a stance has neither, a heal has a target and no focus, a ground punch has a focus and no target. Keeping the goal as unparsed text is deliberate in the other direction — it is exactly the information a rules engine normally discards and a GM adjudicating an unusual attempt normally wants, and the moment anything dispatches on its wording, players are writing code by phrasing.",
    },
    "spatial.units.metres-only": {
        id: "spatial.units.metres-only",
        question:
            "Distance had no shared representation. Movement worked in metres per Round, Range did not exist yet, and hosts natively speak in squares, hexes, feet, or nothing at all.",
        chosen:
            "Every distance in the engine is metres. Positions are metric coordinates in metres or opaque host references; there are no squares, hexes, feet, or grid units anywhere in the engine, and conversion is the host's, done once where the grid size is actually known.",
        rationale:
            "A square is 1.5 m in one system and 5 ft in another, squares and hexes disagree about diagonals, and a table with no map has neither — so a mechanic written in grid units means something different on every host it runs on, silently. Metres is the only unit that still works when there is no grid, which is the case the engine must support because most play is not on a battle map. A straight-line distance and a travelled path length are also given different types rather than both being bare numbers, because they are almost never the same figure and confusing them produces a plausible wrong answer rather than an error.",
    },
    "spatial.geometry.host-supplied": {
        id: "spatial.geometry.host-supplied",
        question:
            "Walls, cover, obstruction, line of effect, occupancy, and whether a mover can actually reach a destination all decide whether a mechanic works, and all require a model of the world the engine does not have.",
        chosen:
            "The host supplies geometry as facts and the engine decides whether the supplied facts satisfy the mechanic. Missing facts carry their own diagnostic code, spatial.fact.missing, distinct from both invalid data and ordinary rule failure. There is deliberately no containment function answering who is inside an area.",
        rationale:
            "The host already has a scene graph, a renderer, and a user looking at it; an engine answer would be a second, poorer occupancy model competing with the real one, and the two would disagree in front of the players. The three-way split of diagnostics is what makes this usable rather than merely principled: 'the wall is in the way' is the character's problem, 'I cannot tell whether the wall is in the way' is the host's, and 'this position has no coordinates' is the developer's, and a caller that cannot tell them apart either refuses things a GM should be able to override or commits corrupt operations. Refusing to compare positions in different spatial contexts belongs to the same rule — the engine does not know whether two contexts are adjacent, nested, or unrelated, and a plausible wrong distance is worse than a refusal.",
    },
    "spatial.range.inclusive-intervals-half-open-bands": {
        id: "spatial.range.inclusive-intervals-half-open-bands",
        question:
            "Range requirements must include their declared endpoints — a target at exactly 10 metres is within a 10 metre Range — while Range bands must not overlap. Those two rules cannot both hold under one boundary convention: two inclusive bands that meet at 5 metres both contain 5 metres.",
        chosen:
            "Two shapes with two conventions, named so they cannot be confused. A DistanceInterval is a requirement and is inclusive at both minimumMetres and maximumMetres. A RangeBand is a partition and is half-open: inclusive at fromMetresInclusive, exclusive at toMetresExclusive, with only the final band permitted to be unbounded.",
        rationale:
            "Forcing one convention would have broken whichever concept lost. Inclusive bands make exactly one distance belong to two bands, and the engine would then be picking between them by array order — a gameplay outcome decided by authoring order, which is the class of thing this engine refuses elsewhere for dice. Half-open requirements would put a target at exactly 10 metres outside a 10 metre Range, contradicting what every written rule means by 'up to 10 metres'. The field names carry the convention rather than a comment, because a reader who gets this backwards writes an off-by-one that only fires on round numbers, which is precisely the input a playtester uses.",
    },
    "actions.layering.neutral-above-targeting-and-spatial": {
        id: "actions.layering.neutral-above-targeting-and-spatial",
        question:
            "Where a neutral action vocabulary sits relative to Character, Body, Combat, and the host, given that it needs Body Part identities, spatial primitives, and check scopes, and that Combat will eventually consume it.",
        chosen:
            "spatial/ and targeting/ sit above the infrastructure, time, checks, runtime and Character foundation layer; actions/ sits above those; Combat and other consumers sit above actions/. targeting/ may type-import BodyPartId and CriticalPointId and nothing else from Character. actions/ may not import Combat, Character, or content catalogs, and Character may not import spatial/, targeting/, or actions/. The actions/ to runtime/ edge is permitted now, before it is used. Every one of these is enforced by architecture.test.ts against the source text.",
        rationale:
            "Reusing the Body identities rather than redeclaring them is the same argument that moved the sensory vocabulary to one declaration: two string aliases are mutually assignable, so a targeting id and an anatomy id could be swapped forever without a compiler complaint. The reverse ban matters more than it looks — a Character file importing the neutral eligibility shape would mean the Character-aware adapter had been written inside the layer it was supposed to sit above, reversing the arrow with nothing to notice. Permitting the runtime edge before anything uses it is deliberate: withdrawing it as unused tidying would make later action preparation look like it was eroding a boundary rather than using one that was always intended. The host ban is checked as 'no non-relative import in these three domains' rather than by grepping for 'grid' or 'token', because the prose explaining why those are absent would fail a word search.",
    },
    "actions.eligibility.provisional-findings-are-supplied": {
        id: "actions.eligibility.provisional-findings-are-supplied",
        question:
            "Action preparation must report whether the actor may do this, and Character rules already own Character requirements. Having actions/ evaluate requirements itself would create a second requirement system; having it import Character rules would reverse the layering.",
        chosen:
            "actions/ defines only a normalised finding — an id, a status of satisfied, unsatisfied or unresolved, and the name of the domain that decided it. Character-aware adapters evaluate Requirement data and hand findings in; actions/ aggregates them without importing Character rules or understanding any Character-specific requirement variant. Folding several findings, a definite unsatisfied outranks an unresolved.",
        rationale:
            "Two requirement systems eventually disagree, and the one that loses is whichever is not the source of truth for the content author — so the shape here is deliberately too thin to re-decide anything. The three statuses exist because 'no' and 'I could not tell' are different answers with different remedies: unresolved is usually a missing host fact or a Body nobody supplied, and reporting it as a failure sends a GM to overrule a rule that never objected. Unsatisfied outranking unresolved follows from what the caller does next — an action with one failed requirement is blocked whether or not something else is still unanswered, and reporting 'unresolved' there would send them hunting for a fact that would not have helped. The richer shape belongs to the ticket that builds preparation; this is the smallest contract that lets it be built.",
    },
    "runtime.dice.purpose-owns-its-rolls": {
        id: "runtime.dice.purpose-owns-its-rolls",
        question:
            "Runtime dice arrived as a flat array of single rolls, each naming its purpose, and a second roll for the same purpose was rejected as runtime.dice.duplicate. Check dice accept a list of rolls so advantage can retain one of them. The two models had never met, and under the runtime rule advantage was not expressible at all.",
        chosen:
            "A purpose owns an ordered set of rolls: one RuntimeRollSet per purpose, carrying the die size and the values in rolled order, and a requirement that states purpose, sides and count. Two SETS for one purpose remains an error. Order within a purpose is meaningful; order between purposes is not, and validation returns the same answer whatever order the sets arrived in.",
        rationale:
            "The old rejection was right about the real problem and wrong about the fix. Two d20s in a flat array genuinely are ambiguous — nothing says which is which — and picking either one would have been the engine deciding a gameplay outcome by array order, which is the thing this dice module exists to prevent. Putting the pair inside the purpose removes the ambiguity instead of removing the capability. The count on the REQUIREMENT is what makes the set checkable: without it the engine would infer advantage from however many dice happened to arrive, so a caller who sent one die too many would silently be granted advantage they never rolled for. Explicit indices were the alternative and were rejected as a way of writing an array without admitting to it.",
    },
    "runtime.dice.one-projection-into-checks": {
        id: "runtime.dice.one-projection-into-checks",
        question:
            "With runtime dice and check dice reconciled, something has to convert one into the other, and the obvious third option was a shared 'effective roll' structure sitting between them.",
        chosen:
            "Exactly two dice vocabularies, with one sanctioned crossing: projectCheckDice() in runtime/, which takes a validated roll set plus the check's advantage level and produces CheckDiceInput. runtime/ -> checks/ is the permitted direction; checks/ never imports runtime/, and check-dice.ts is the only runtime file allowed to reach into checks/. No third shared die type exists, and a test fails if one is declared.",
        rationale:
            "The two layers answer questions neither can answer for the other. Runtime asks whether the OPERATION got the dice it required — count, size, purpose, nothing missing and nothing extra — and deliberately does not know what advantage is, because a pair of d20s is the same pair whether it was rolled with advantage, with disadvantage, or by a GM who wanted a spare. Checks ask which number the character uses, which is a rule about a check rather than a property of a die. A middle vocabulary would have given a wrong number three places to hide and would have grown a copy of both neighbours' rules; the direction is fixed rather than merely documented because checks/ is used from Character Foundation, which knows nothing about operations. The advantage level crossing with the dice rather than being inferred from them is what lets the projection catch a caller claiming advantage the operation never supplied rolls for.",
    },
    "checks.dice.structured-failure-not-thrown": {
        id: "checks.dice.structured-failure-not-thrown",
        question:
            "resolveCheckDice() threw a RangeError on an empty roll pool, and four sensory resolvers threw RangeError for missing dice, a mismatched sensory route, or a missing sensory profile. Everything else in the engine reports invalid input as data.",
        chosen:
            "resolveCheckDice, resolveCheck, resolveFixedCheck and resolveOpposedCheck return EngineResult, and so do the Concealment, Detection, Perception and Investigation resolvers and the passive-Detection candidate sweep. Empty pools, malformed faces, a roll count contradicting the advantage level, missing dice, mismatched routes and a missing sensory profile are all typed failures now. Two RangeErrors survive on purpose: the PASSIVE Concealment and Detection resolvers refusing a non-passive request.",
        rationale:
            "A single throwing path in an otherwise value-returning system is worse than a consistently throwing one, because it is invisible: every caller that handles diagnostics correctly still crashes on the one input nobody wrapped, and 'the host supplied no dice' is an ordinary thing for a host to get wrong rather than an exceptional one. The line drawn for what still throws is caller DATA versus wrong FUNCTION: a mismatched sensory route is two resolutions the caller handed in together and belongs in the result, while reaching the passive resolver with an active request is the dispatch above it having called the wrong function. Returning that second one as a value would let a genuine engine bug be handled as though the character had merely failed to perceive something. The expected roll count also moved into one exported helper both the request validator and the resolver read, because they previously agreed only by coincidence — one computed it inline, the other stated it in a comment — and every sensory resolver calls the resolver directly without going through the validator.",
    },
    "actions.proposal.preparation-owns-the-preview": {
        id: "actions.proposal.preparation-owns-the-preview",
        question:
            "Turning an intent into something a GM can look at needs a place to live. The candidates were a new orchestration module above everything, Combat (which already schedules things), or actions/ itself.",
        chosen:
            "actions/preparation.ts, inside the domain that already owns profiles and intents. One pipeline, no fourth module. It computes the intent-versus-profile check, the Range measurement, the dice requirement, the travel arithmetic, and one conclusion of its own — the disposition — from findings every other domain supplied.",
        rationale:
            "A separate orchestration layer would have needed its own copy of what a profile permits in order to say anything useful about an intent, and two descriptions of the same thing drift. Combat was the worse option for the reason this whole phase exists: a proposal that lives in Combat cannot be produced outside one, and most play is outside one. Keeping preparation next to the vocabulary it reads also keeps the dependency list honest — the ONLY things it reaches for are the domains that own the questions it asks, and an architecture test says so.",
    },
    "actions.proposal.non-committing-by-construction": {
        id: "actions.proposal.non-committing-by-construction",
        question:
            "A proposal reports what an action would cost, what it would roll, and who it would affect. The cheap version computes that by starting to do it and reporting what happened so far.",
        chosen:
            "Preparation is pure. It spends no Aura or Actions, consumes no Items, damages no Body, applies no Condition, moves nothing, advances no clock, emits no committed event, mutates nothing it was handed, and never calls the coordinator. Costs are carried as unsent RuntimeRequests; dice are carried as requirements, not values. Tests deep-freeze every input before calling, so an accidental write throws, and a source-level test fails if preparation ever imports the coordinator.",
        rationale:
            "A preview that quietly charges something is the most expensive bug available to this design, because it fires every time a GM looks at an option and decides against it — and the symptom is resources draining with nobody having acted, which reads as a balance problem rather than a bug. Freezing the inputs rather than diffing them afterwards is deliberate: a diff notices a mutation that already happened, while a frozen object turns the write itself into the failure, at the line that did it. The source check on the coordinator import exists because purity here is one convenient refactor away from being lost, and nothing else would notice.",
    },
    "actions.proposal.three-resolution-approaches": {
        id: "actions.proposal.three-resolution-approaches",
        question:
            "How an attempt gets settled. The obvious split is two ways — the rules decide, or the GM decides — and the obvious trigger is whether Combat is running.",
        chosen:
            "Three approaches, selected per action and never inferred from Combat: mechanical (the rules can propose the result), guided-narrative (the engine gathers every fact and suggestion it can and stops short of deciding), and free-adjudication (the GM supplies the substance, with engine assistance). Both of the latter two produce a requires-adjudication disposition, and neither ever produces an automatic outcome.",
        rationale:
            "Tying the approach to Combat is wrong in both directions: an attack roll during a conversation is still an attack roll, and talking a guard into looking away is still a judgement call on someone's Turn. The missing middle is the one that matters — a system with only 'resolve it' and 'the GM decides' drops every unusual attempt into a hole with no Range check, no cost, no facts, and leaves the GM reconstructing by hand what the engine already knew. Guided narrative is most of what a GM actually wants from a tool: all the work, none of the verdict.",
    },
    "actions.proposal.disposition-from-aggregated-findings": {
        id: "actions.proposal.disposition-from-aggregated-findings",
        question:
            "A proposal must say whether the action can proceed. Collapsing that to a boolean loses the difference between a rule saying no and the engine not knowing — and the second is usually the GM's cue to supply a fact rather than to refuse anything.",
        chosen:
            "Six dispositions — ineligible, spatially-invalid, missing-facts, check-dependent, resolvable, requires-adjudication — computed from findings the owning domains decided. A definite refusal outranks an open question; among refusals the least recoverable one leads, so a character who lacks the requirement AND is out of Range reads as ineligible rather than as spatially-invalid.",
        rationale:
            "Every one of the six is a different thing for a GM to do next, and a boolean makes all six look like 'no'. Ranking a refusal above an unresolved question follows the same argument as the eligibility fold: the attempt is blocked either way and answering the open question would not have helped. Ranking ineligibility above Range is what makes spatially-invalid worth having — it then means precisely 'the only thing wrong is where you are standing', rather than 'something spatial was among the problems', and telling a player to move when moving cannot help is worse than saying nothing. Every finding stays on the proposal regardless; the disposition only decides which one leads.",
    },
    "actions.proposal.unevaluated-occupancy-is-not-an-empty-area": {
        id: "actions.proposal.unevaluated-occupancy-is-not-an-empty-area",
        question:
            "Suggested affected subjects are supplied by the host, because working out who a blast catches needs occupancy the engine does not own. Carried as a bare array, an empty list means both 'the host looked and the area is empty' and 'nobody ever ran the query'.",
        chosen:
            "AffectedSubjectSuggestion carries an explicit `evaluated` flag beside the subjects, and preparation defaults to { evaluated: false, subjects: [] } when the field is omitted. Naming subjects while claiming nothing was evaluated is refused as a structural contradiction.",
        rationale:
            "The two states mean opposite things to settlement, and the dangerous one is silent: an unrun geometry query committed as a verified empty area is an action that affects nobody, succeeds, and leaves nothing anywhere saying why. Undefined-versus-empty would have encoded the same distinction, and was rejected because `?? []` is the natural way to write past an optional array and reads as defensive rather than as destroying an answer. The flag has to be looked at. Defaulting to false rather than true is the same instinct as refusing missing state elsewhere: the engine says 'no answer' unless somebody actually supplied one. Note the same absent-versus-empty hazard exists in principle for cost requests; it is not modelled there because those are priced synchronously by engine-owned domains rather than by a host query that may not have run.",
    },
    "actions.adjudication.one-central-layer": {
        id: "actions.adjudication.one-central-layer",
        question:
            "The GM can overrule any rule-level result: success, margin, requirements, Range, costs, durations, who was affected, what happened. The obvious implementation is an optional override beside each of those fields, in the domain that owns it.",
        chosen:
            "One adjudication layer over the finished ActionProposal. No domain below it has an override field or has heard of a GM. Overrides arrive as a decision — accept, modify, or replace — and every change is recorded as provenance in one list. An architecture test fails if the words for GM adjudication appear in code under checks/, spatial/, targeting/, runtime/, gameplay/ or character/.",
        rationale:
            "Scattered overrides fail three ways at once. Every domain grows a second code path that only runs when a person intervened, which is by construction the least exercised code in the system and the most likely to be wrong at the worst moment. Nothing can answer 'what did the GM change here' without walking the whole object graph, so the log a table wants after a contentious ruling cannot be produced. And the GM's private reasoning ends up stored on structures that were designed to be handed to players. Keeping authority in one layer leaves every domain below it a pure rules engine, which is also what makes them testable without inventing a GM.",
    },
    "actions.adjudication.integrity-is-not-negotiable": {
        id: "actions.adjudication.integrity-is-not-negotiable",
        question:
            "If GM authority over rule-level results is total, what is left for the engine to refuse? An override is either respected or it is not, and a rules engine that argues with the GM is worse than useless.",
        chosen:
            "Rule-level authority is total; technical integrity is absolute. The engine refuses an adjudication naming a different operation than its proposal, a non-finite total or margin, a negative cost, an override of a finding or a cost request that does not exist, a dice override for a purpose nobody rolled, and a die face the die does not have. It also refuses an 'accept' that carries changes. Everything else the GM says stands.",
        rationale:
            "The line is not how much power the GM has — it is total — but whether the engine can still describe what happened without lying. A NaN margin is not a ruling, and a cost override for a request nobody made would silently do nothing while reading as a decision that was honoured. Refusing a face the die does not have is the interesting case: a GM who wants a result better than a d20 can show should say so on the total or the outcome, both of which are theirs to set, and a 40 on a d20 would produce a total nobody could explain afterwards. Refusing accept-with-changes protects the provenance itself: the record would otherwise say the GM accepted a proposal beside a list of things the GM changed.",
    },
    "actions.adjudication.secret-rolls-by-ordering": {
        id: "actions.adjudication.secret-rolls-by-ordering",
        question:
            "A GM must be able to secretly replace a rolled value. The rolled value must then never appear in check resolution, a public result, an event, a diagnostic, or any trace a player can reach. The obvious implementation carries both numbers through and strips the original on the way out.",
        chosen:
            "Ordering, not filtering, and no third dice vocabulary. The override is applied while building an EFFECTIVE roll set, and only that set is projected into CheckDiceInput. The original is written to exactly one place — the AdjudicatedRoll on the GM's view — and is never passed to anything downstream.",
        rationale:
            "Filtering on the way out fails the first time someone adds a field, and there is no test that notices, because the leak looks exactly like the feature. Ordering makes the guarantee structural: the check resolver is never handed the original, so no amount of tracing inside it can expose one — there is nothing there to expose. Adding an 'effective roll' type between runtime and check dice was the other option and was rejected for the reason 2B-0 rejected it: three dice vocabularies give a wrong number a third place to hide. The tests for this were verified by deliberately reintroducing each leak and confirming the suite fails; the first version of the parent-trace test did NOT fail that way and was rewritten to assert identity rather than to search for the day's secret.",
    },
    "actions.adjudication.two-views-built-separately": {
        id: "actions.adjudication.two-views-built-separately",
        question:
            "Public and GM-private information have to be separated. One result object with a private field on it, or a filter applied to a single view, are both simpler.",
        chosen:
            "Two objects returned together. The public view is BUILT field by field from things explicitly marked as revealed; it is never the private view with things removed. Players are shown detail on a four-step ladder — narrative, outcome, total, roll — and no level ever reveals an original roll. The EngineResult's own trace IS the public trace.",
        rationale:
            "A private field on a shared object leaks the moment anything serializes it, and serialization is exactly what a host does. Building the public view additively is what makes this survive later tickets: adding a field to the GM view does not add it to the public one, whereas a filter has to be updated by whoever adds the field, and they will not. The parent trace is the public one because an EngineResult's trace is the thing most likely to be rendered without anybody thinking about audience. The engine is not promising authorization — it has no idea who is asking — only that a host handing the public view to players cannot leak by accident, because that object never held the secret.",
    },
    "character.actions.adapter-owns-the-seam": {
        id: "character.actions.adapter-owns-the-seam",
        question:
            "Neutral action preparation needs Character-owned inputs — eligibility findings, the governing contribution, the assembled check modifiers — and must not import Character rules to get them. Until now that was left to 'whatever the caller does', which is not a boundary but the absence of one.",
        chosen:
            "character/actions/preparation.ts. It may import neutral actions/, Character rules and the canonical check-invocation path, and supplies exactly three things: normalised eligibility findings, the governing base contribution for the action's check scope, and the modifiers assembled through collectCharacterCheckModifiers(). Neutral actions/ may never import it, and nothing else under character/ may import it either. It refuses sensory check scopes, and an opposed check is assembled by calling it once per participant.",
        rationale:
            "The second ban matters as much as the first: a Character file reaching for the adapter would pull the neutral vocabulary back down into the layer that is supposed to sit underneath, and the layering test would still pass because the import would be Character-to-Character. Refusing sensory scopes is the same instinct — a sensory governing score depends on the sense, the route and the profile, the sensory resolvers already compute it, and answering here would be a second source that drifts the first time a sense gains a modifier. There is deliberately no two-sided entry point for opposed checks, because a call taking both characters would have to decide which one is the initiator, and that is the calling mechanic's question rather than a Character's.",
    },
    "character.actions.unrecorded-is-not-unmet": {
        id: "character.actions.unrecorded-is-not-unmet",
        question:
            "A requirement asking for a Trait, evaluated against a half-built sheet whose Trait list has never been recorded, currently reads as 'does not have it'. Character collections are optional precisely so an unfinished sheet can still be resolved.",
        chosen:
            "The adapter reports such a requirement as UNRESOLVED, with a diagnostic naming the collection that is missing, and reads that from the Character itself rather than from the RequirementContext.",
        rationale:
            "Reporting an unrecorded Trait list as a failed requirement refuses an action for a reason that is not true yet — it is not known yet, which is a different answer with a different remedy, and the proposal's dispositions already distinguish them. It is read from the Character because buildRequirementContext() collapses every absent collection to an empty array on the way in, so by the time a requirement is evaluated 'never recorded' and 'recorded, and none' are already the same value. That collapse is fine for a boolean evaluator and wrong for a finding a GM will read. SUPERSEDED by requirements.presence.absent-is-not-empty: the collapse was removed at its source, the rules layer now answers with a three-valued disposition, and this adapter reads that answer instead of inspecting the Character itself.",
    },
    "actions.consequences.the-owner-routes-the-change": {
        id: "actions.consequences.the-owner-routes-the-change",
        question:
            "A GM ruling that something happens has to become a state change. Letting the GM or the host construct RuntimeRequest objects directly means picking request ids, naming phases and addressing owners — every one a chance to build something the coordinator refuses, by the person least placed to debug it.",
        chosen:
            "High-level builders, one per supported concept, each of which knows which of three channels its concept belongs to: runtime (the engine owns the state, so it becomes a request), host (the engine does not own it, so it comes back as typed work), or unresolved (nobody owns it yet, so it comes back as a diagnostic). Settlement partitions them and never guesses.",
        rationale:
            "The three channels are not a convenience, they are the honest answer to who owns what. Body Points, Aura and Conditions are the engine's. Position is not — spatial/ has said since it was written that the host owns occupancy and geometry — so displacement is host-facing however much it looks like a mechanic. What anyone now believes is not the engine's either: the sensory domain resolves whether a cue was perceived and holds no state about belief. Sorting that out inside the builders means a GM asks for the effect they want and the routing is already decided correctly.",
    },
    "actions.consequences.host-facing-is-a-success": {
        id: "actions.consequences.host-facing-is-a-success",
        question:
            "The engine has no terrain model, no object durability model and no position for anything. When an action tears up the ground, the obvious options are to invent a model, to fail, or to say nothing happened.",
        chosen:
            "A fourth option: describe the change precisely and hand it back as a typed host-facing consequence, on a SUCCESSFUL settlement. The engine never claims to have mutated state it does not own, and returned state lists only owners it actually changed.",
        rationale:
            "Inventing a terrain model to look complete is how a system acquires a second, worse copy of something the host already has — the same argument that kept occupancy out of spatial/. Reporting it as an error would be worse than either: hosts that see errors on successful actions learn to ignore errors. Saying nothing happened is the only genuinely unacceptable option, because the GM's ruling would silently evaporate. The ground-impact fixture asserts this directly: two world changes come back as work, and the returned state contains one owner, the Aura pool that was actually charged.",
    },
    "actions.consequences.bp-only-no-sp-conversion": {
        id: "actions.consequences.bp-only-no-sp-conversion",
        question:
            "applyBodyDamage() takes Body Points. Some damage is denominated in Stamina Points, and no SP-to-BP conversion exists anywhere in the engine or the Rulebook.",
        chosen:
            "BP damage routes to the Body normally. SP-denominated damage returns unresolved, with a diagnostic naming the amount and the body it was meant for, and an explicit note that no conversion exists. No rate is invented, not even a placeholder.",
        rationale:
            "This is the single most tempting place in the phase to write a plausible constant, and the failure mode is invisible: an SP figure passed to a BP function is not rejected, it is silently reinterpreted, and the resulting injuries look exactly like correctly calculated ones. An explicit refusal is recoverable at any point later; a wrong exchange rate buried in a damage log is discovered, if at all, as a balance complaint months afterwards. The diagnostic is addressed to the GM rather than to a developer because the recovery is a ruling — state the damage in BP, or record it narratively — not a code change.",
    },
    "actions.settlement.finalize-then-commit-once": {
        id: "actions.settlement.finalize-then-commit-once",
        question:
            "Where the check is resolved, and how many times an action may touch the coordinator.",
        chosen:
            "Adjudication resolves the check with the effective dice; settlement takes the already-finalized action and runs the coordinator exactly once, supplying no dice at all. Ineligible, spatially-invalid and missing-facts refuse to settle and charge nothing. A resolved MISS settles normally and pays what it cost. Combat is not involved in any of it, and this is where Phase 2 stops before Combat is touched.",
        rationale:
            "Passing the dice down to the coordinator would give the operation a second opportunity to roll, and the two answers would eventually differ with nothing able to reconcile them afterwards. Refusing to settle an action with an unanswered question is the conservative half of the same instinct that made preparation refuse to fabricate geometry: committing quietly would spend Aura on something nobody established could happen, and the GM already has a recorded way to proceed anyway — override the finding. A miss is deliberately not in that list: a resolved failure is a settled outcome, and Aura spent on a punch that missed is spent. Stopping here, with the whole non-Combat path proven end to end, is what makes the Combat tickets a refactor against a working system rather than a redesign of one.",
    },
    "requirements.presence.absent-is-not-empty": {
        id: "requirements.presence.absent-is-not-empty",
        question:
            "buildRequirementContext() answered `?? []` for every optional Character collection, so by the time a requirement was evaluated an unrecorded Trait list and a recorded empty one were the same value. Every consumer then reported the first as \"the character does not have that Trait\".",
        chosen:
            "Absence is preserved through the context builder, and requirements resolve to three answers rather than two: satisfied, unsatisfied, unresolved. A membership question against an absent collection is unresolved; against a recorded collection it is decided, empty or not. Attributes and Level are always present and therefore always decidable.",
        rationale:
            "Character collections are optional on purpose — the Workbench builds a sheet incrementally, and an engine that only accepts finished characters cannot help finish one. The cost of that choice was a confident wrong answer: \"you lack that Trait\" and \"nobody has said what Traits you have\" have different remedies, and only the first is a refusal. The collapse was fixed at its source rather than worked around by each consumer, because the previous ticket had already demonstrated the alternative — the action adapter recovered the distinction by re-reading the Character, which meant two interpretations of missing data and only one of them documented. AMENDED by requirements.presence.known-membership-is-not-symmetric: the first version keyed Traits off the AUTHORED list and so lost granted ones, which was too blunt.",
    },
    "requirements.presence.compound-propagation": {
        id: "requirements.presence.compound-propagation",
        question:
            "How all, any and not combine three values instead of two, and in particular whether a definite answer or an open question wins when both are present.",
        chosen:
            "all: unsatisfied if any member is, else unresolved if any member is, else satisfied. any: satisfied if any member is, else unresolved if any member is, else unsatisfied. not: inverts the two definite answers and leaves unresolved alone.",
        rationale:
            "Each rule is the three-valued form of the short-circuit the two-valued version already had — `all` stops at a false, `any` stops at a true — so a definite answer wins exactly when it already decides the whole expression, and the unknown members genuinely could not have changed it. This also keeps the boolean helper's behaviour identical for every input that used to be decidable, which is what made the migration safe. `not` leaving unresolved alone is the rule people get wrong: not knowing whether they have it is not knowing whether they lack it, and inverting an unknown into a definite answer would manufacture the exact confidence this change removes.",
    },
    "requirements.presence.boolean-helper-is-lossy-on-purpose": {
        id: "requirements.presence.boolean-helper-is-lossy-on-purpose",
        question:
            "Whether meetsRequirement() should be deleted, now that it cannot express the third answer.",
        chosen:
            "Kept, defined as `resolveRequirement(...) === \"satisfied\"`, and documented as treating unresolved as false. Capability validation was migrated off it and now emits a distinct unresolved-skill-requirements / unresolved-technique-requirements issue whose message says the sheet is incomplete rather than that a prerequisite failed. UI-facing helpers such as satisfiesSkillRequirements() stay boolean, with tri-state siblings beside them.",
        rationale:
            "Collapsing unresolved to false is the RIGHT answer for a caller asking whether something may proceed — an unfinished sheet should not offer a capability whose prerequisites nobody can confirm — and the WRONG answer for a caller explaining why, because both non-satisfied values arrive as the same `false`. Deleting the helper would have pushed every gating call site into a comparison it does not care about; leaving it undocumented was how the original defect spread. So the rule is stated where the function is defined and enforced by where it is no longer used: nothing that produces a diagnostic reads it. Severity was deliberately not changed — an unresolved capability requirement is still a blocking validation error, exactly as the collapsed version was, so this ticket changed what the message SAYS without changing which characters validate.",
    },
    "requirements.presence.known-membership-is-not-symmetric": {
        id: "requirements.presence.known-membership-is-not-symmetric",
        question:
            "Preserving absence was not enough on its own. Keying a collection's completeness to whether the AUTHORED list exists meant a Trait a Species GRANTS read as unresolved on a sheet whose Traits nobody had written down — even though the engine could see the Trait perfectly well.",
        chosen:
            "The context carries two facts rather than one: the lists hold everything the engine can actually see, including granted Traits, Skills and Techniques, and `incomplete` names the collections the sheet has not filled in. A known id is satisfied even when the collection is incomplete; an unknown id is unsatisfied only when it is complete; an unknown id in an incomplete collection is unresolved. A recorded Mastery rank is definitive in both directions, since the same Skill cannot appear twice.",
        rationale:
            "Presence and absence are not symmetric, and the first version treated them as though they were. Seeing the id settles the question outright — a granted Trait is on the character whether or not anybody has finished the sheet — while not seeing it settles nothing, because the id may be in the part nobody has recorded. Collapsing both into one 'is this collection recorded' flag threw away answers the engine already had, which is the mirror image of the original defect: the first bug invented certainty, this one would have discarded it. `incomplete` is a list rather than a per-field flag so that a context saying nothing about completeness is treated as complete, which is what every hand-built context and every finished sheet already means.",
    },
    "requirements.presence.incomplete-data-warns": {
        id: "requirements.presence.incomplete-data-warns",
        question:
            "An unresolved capability requirement was a blocking validation error, exactly as the collapsed version had been. That makes a half-built sheet fail to validate for a prerequisite nobody has established it fails.",
        chosen:
            "unresolved-skill-requirements and unresolved-technique-requirements are warnings. Confirmed unsatisfied requirements remain errors. The warning folds the resolution text into its message, since a Warning has no field for it.",
        rationale:
            "Same reasoning as the missing-Species warning that predates this: the Workbench is where characters get finished, and an engine that refuses to resolve a half-built one cannot help build it. What matters is that this is a DIAGNOSTIC severity and not a rules decision — demoting the warning makes the sheet resolvable and does nothing to the requirement, which is still unresolved everywhere it counts. The action adapter still reports unresolved eligibility, the proposal still reads missing-facts, and settlement still refuses to commit; a test walks that whole path on a warning-only sheet precisely so the two cannot quietly converge later.",
    },
    "combat.characterization.describes-behaviour-not-intent": {
        id: "combat.characterization.describes-behaviour-not-intent",
        question:
            "Combat is roughly 5,500 lines across nine files and had essentially no behavioural test coverage — the only tests touching it imported a duration constant. It is about to be refactored to schedule neutral actions. What should the tests written first assert?",
        chosen:
            "What the code DOES, not what the rules say it should. 173 characterization tests across six files cover the Action economy, Initiative ordering and rotation, Turn and Reaction lifecycles, the Round lifecycle, the orchestration sequences, and structural validation. Where behaviour appears to contradict a settled rule, the test still pins the behaviour and a comment marks it CHARACTERIZED, NOT ENDORSED.",
        rationale:
            "A characterization suite that quietly asserts the intended rule instead of the real one is worse than no suite at all: the refactor it exists to protect would then silently 'fix' a discrepancy nobody decided to change, and the tests would go green while the game changed underneath them. Pinning the real behaviour makes every deliberate change to it visible as a failing test somebody has to look at. Tests build Rounds through startRound() and spend through resolveCombatAction() wherever possible rather than hand-assembling state, so each one describes something a caller can actually reach.",
    },
    "combat.characterization.three-gaps-found": {
        id: "combat.characterization.three-gaps-found",
        question:
            "Writing the suite surfaced three places where Combat's behaviour does not match what the surrounding documentation and rules imply. Fix them, or record them?",
        chosen:
            "Recorded, and pinned as tests, not fixed. (1) `bonusAction` is carried on a CombatAction and read by NOTHING — not validated, not counted, not limited to one; the rule 'Bonus Actions do not consume an additional Action' holds only because nothing consumes anything for them. (2) Nothing limits how many Reactions a combatant opens per Round; the only brake is the shared Round Action pool. (3) Affectedness is read solely from `targetCombatantIds`, so a position-focused Action cannot create a Reaction opportunity for a collateral combatant, and a declared target who ends up unaffected still gets one.",
        rationale:
            "All three are rules decisions rather than defects in the code as specified, and a characterization ticket is the wrong place to make them — the whole point of writing the tests first is to have a baseline that does not move while the refactor happens. The third is the one the neutral-action wrapper exists to address, and it is exactly the distinction the earlier phases built: declared targets are not affected subjects. The first two are genuinely open and need somebody to decide what the rule is before code enforces one.",
    },
    "combat.wrapper.schedules-rather-than-owns": {
        id: "combat.wrapper.schedules-rather-than-owns",
        question:
            "Combat held its own copy of what an Action is: an actor, a cost, a source, and a list of who it points at. With a neutral action model in place, how much of that should Combat keep?",
        chosen:
            "A CombatAction REFERENCES a neutral intent by id and keeps only what the encounter layer adds: which Combatant is acting, what the Action economy charges, and who was explicitly endangered. Skills, goals, focus, targeting validity, Range, checks, resource mutation, adjudication and consequences all stay in the layers that already own them. The structured cost is read through the neutral accessor rather than recomputed, so the 'charged only inside structured time' rule has one implementation.",
        rationale:
            "Copying the targets into Combat was what made Combat a second authority on who an action affects, and a second authority is the thing this whole phase existed to remove. Referencing the intent also settles a subtler question the old shape could not answer: the same intent is resolvable outside a fight with no wrapper at all, which is only demonstrable if Combat adds something rather than duplicating something. An architecture test now fails if any file under gameplay/ imports character/, mentions targetCombatantIds, or mentions bonusAction — the three ways this boundary would quietly come back.",
    },
    "combat.reactions.threat-not-target": {
        id: "combat.reactions.threat-not-target",
        question:
            "A Reaction opportunity was created for any combatant named in an Action's targetCombatantIds. That rule is wrong in both directions and the wrapper had to replace it with something.",
        chosen:
            "Reactions read an explicit THREAT list and nothing else. An action profile declares whether using it endangers its declared targets (`threatens`, default \"none\"); the wrapper maps those targets onto participating Combatants and hands Combat the result. A position-focused action threatens nobody unless somebody explicitly names who is endangered, and only a profile that already declares itself threatening may carry such names. Hazards with no actor supply a CredibleThreat directly and open Reactions through their own path.",
        rationale:
            "Being pointed at is not being endangered: a heal names a recipient and provokes no dodge, which the old rule could not express at all. Being endangered does not require being pointed at either: a boulder threatens whoever is under it and declares nothing, and forcing it through the target model would mean inventing a combatant who threw it. The three lists stay distinct for the reason the earlier tickets separated them — declared targets are what a player chose, credible threats are what warrants a Reaction, and finalized affected subjects are what settlement decided. Notably a collateral combatant gets NO Reaction from being affected: affectedness is known after resolution, and a Reaction exists to be taken before it. A threatened combatant keeps their opportunity even when the blow misses, because you duck what was coming rather than what landed.",
    },
    "combat.actions.bonus-action-removed-not-implemented": {
        id: "combat.actions.bonus-action-removed-not-implemented",
        question:
            "`bonusAction` sat on every CombatAction and was read by nothing: not validated, not counted, not limited to one. The wrapper had to either keep it, implement it, or drop it.",
        chosen:
            "Removed from the canonical model. Bonus Actions get a dedicated ticket that defines authorization, limits, resolution and cost semantics before any code carries the field again.",
        rationale:
            "Keeping it would have carried dead data that reads like a feature into the new model, and the documented rule — 'Bonus Actions do not consume an additional Action' — held only because nothing consumed anything for them. Implementing it inside a refactor is worse: authorization and limits are rules nobody has written, and a mechanic invented as a side effect of a wrapper is a mechanic nobody decided. Removing it makes the absence visible, which is the honest state until somebody designs it.",
    },
    "combat.api.stays-internal-for-now": {
        id: "combat.api.stays-internal-for-now",
        question:
            "Whether Combat should be exported from src/index.ts now that it wraps neutral actions and has a supported surface.",
        chosen:
            "It stays internal. src/index.ts continues to export Combat Ability and the Round duration and nothing else from gameplay/. No internal helper was exported to make testing convenient; the characterization and integration suites import module paths directly, as every other suite in this repo does.",
        rationale:
            "Nothing outside the engine consumes Combat yet, and an exported surface is a promise that is cheaper to make than to withdraw — the same reasoning that kept progression unexported until a consumer asked for it. The specific temptation this records refusing is exporting helpers purely so a test can reach them: tests here reach modules by path, so the public barrel stays a statement about what hosts may rely on rather than a byproduct of how the suite is written. When a host needs Combat, the surface gets chosen deliberately and this entry gets superseded.",
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
