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
