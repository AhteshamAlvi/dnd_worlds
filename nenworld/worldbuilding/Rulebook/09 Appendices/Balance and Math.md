# Balance and Math

[[00 Read Me First|Rulebook]] › Appendices

The verification appendix. Every claim below was computed, not asserted; the numbers are reproducible from the cited chapters. Where testing found a miss, the fix is documented here — this book does not claim a rule "came from the lore" when it's a balancing invention, and it does not claim balance it didn't check.

## 1 · Accuracy stays bounded (design commitment #3)

| Matchup | Hit chance |
|---|---|
| T1 vs T1 (+4 vs EVA 13) | 60% |
| T2 vs T2 (+6 vs EVA 13) | 70% |
| T3 vs T3 (+8 vs EVA 14) | 75% |
| T4 vs T4 (+10 vs EVA 15) | 80% |
| T1 attacking T4 | 50% |
| T4 attacking T1 | 90% |

A novice can *touch* a master half the time. Touching isn't hurting — penetration is the wall, exactly as designed. Accuracy drift across four bands is 20 points, not 200: the d20 layer never needs big numbers.

## 2 · Same-band duels are decided by play, not autopilot

T2 mirror (Darun-type: AO 130, 60 Guard/60 Strike/10 Focus, Ken discount): attack P 68, target Soak 7, DPR ≈ 42 into a 60/round Guard refresh → **overflow zero.** Two equal professionals on autopilot *cannot* kill each other.
What breaks the stalemate, in intended order: **reads** (a won read halves local Guard: overflow ≈ 14/round → drop in ~2.5 rounds), **Kō spikes** (P 188 through the same Guard), **feints**, **positioning**, and **economy** (full-combat sustain ≈ 7.6 rounds at Ken discount — first to exhaust loses everything at once). The read game isn't garnish; it's the win condition. ✓ matches [[Combat Core]]'s claim.

## 3 · The penetration walls hold (design commitment #2)

| Attack | Target | Result |
|---|---|---|
| T1 novice, P 25 | T2 pro, Soak 12 | 13 damage — novices *matter* one band up |
| T1 novice, P 25 | T3 elite, Soak 40 | **nothing** |
| T2 pro, P 120 | T4 master, Soak 200 | **nothing** |
| T3 elite Kō, P 800 | T4 master, Soak 200 | 600 — elites threaten masters only via Kō/vows |
| 20 riflemen, P 16 each | Gillian, Soak 800 | **nothing, forever** — no action-economy workaround |
| T3 elite, P 800 | Gillian, Soak 800 | **nothing** (equal is not enough — P must *exceed* Soak) |
| T4 master, P 2.5k | Gillian, Soak 800 | 1.7k — this is whose job Gillians are |

The adjacent-band overlap is deliberate: N and N+1 interact at the top of N's effort (Kō, vows, reads); N and N+2 do not interact by force at all. Escape, concealment, negotiation, survival — the brief's exact list — are the *only* moves left, and the math is what enforces it.

## 4 · Aura endurance (fights end before they bore)

Full-commit rounds by band exemplar: T1 ≈ 10 · T2 ≈ 6 · T3 ≈ 5.7 · T4 ≈ 4.5 · T5 ≈ 5. The convergence to ~5–6 rounds of *all-out* war at every band above novice is intended pacing (higher Ren % ↔ higher Control efficiency cancel). Fights at partial commitment run 10–20 rounds; nobody fights those on purpose. **Exhaustion is the universal leash:** the strongest thing in any fight still has a fuel gauge, which is why 5 novices who cannot scratch a professional's Guard (39 DPR vs 100/round refresh — zero overflow) still win *if he's dumb enough to spend everything first* (39 DPR vs Body 36 once his Guard is gone). Checked both directions. ✓

## 5 · Lore-fidelity spot checks

- **"Ken ≈ 10× Ten"** ([[Ken]]): initial design had Ten's shroud at 2% of AP → came out 4.5×, **failed.** Fixed: shroud = 1% (ranks I–II) — a working professional's Ken (~100–120 committed) over their Ten (11) = **~10×.** ✓ The fix is recorded in [[Nen Techniques (Rules)]] with a calibration note. *(Honest label: both percentages are design inventions; only the 10× ratio is lore.)*
- **"More durable than a bunker… force of tactical missiles"** ([[Progression and Training]]): elite Enhancer Kō = P 1,280 vs bunker wall (Soak 60, HP 2k) → down in 2 hits; elite Ken Guard 600 → Soak 60 = bunker-grade skin. ✓
- **"Mach speeds for powerful non-Enhancers"**: elite Drive + Chū stack reaches SR 6–7 (≈ Mach 1) at sustainable cost; Enhancers exceed it (half-cost Chū). ✓
- **En 2 m minimum / 50 m mastery** ([[En]]): reproduced as rank I/V radii, upkeep = radius/round makes 50 m "extremely tiring" for anyone below elite (50/round vs a pro's AO 120). ✓
- **Yū "consumes far more aura than any other technique"** ([[Yū]]): 20 HP of internal repair ≈ 700 pool from a professional's 1,100 — day-scale, never combat-spam. ✓

## 6 · Skilled-but-weaker vs stronger-but-sloppier

Fern-type (AP 900, AO 110, Control 4 ×1.25) vs brute (AP 1,500, AO 180, Control 1 ×2.0) — the brute out-commits her 180 to 110 every round and *pays double*: sustain 4.2 rounds vs her 6.5. At round 4 the brute is empty (Exhausted: disadvantage, no techniques, Guard 0) with her at ~350 pool. If she survives four rounds — Guard the spikes, give ground, make him chase — she wins walking. **Control and pacing beat raw pool at ≤2× disparity; at ≥3× pool disparity, magnitude wins anyway.** That boundary (skill closes one gap, not two) is the game's core fairness claim, now verified.

## 7 · Vow spike audit (does ×5 break the ladder?)

T2 pro with a maximum ×5 vow stack: one P 600 hit — a T3-grade *moment* on a T2 pool (7 rounds sustain unchanged, Guard unchanged). Vows make glass cannons and martyrs, not band-jumpers: damage spikes, durability doesn't, economy doesn't. Runaway requires stacking that the ×5 product cap and two-narrow-vow limit ([[Conditions Vows and Risk (Rules)]]) forbid — both caps are **balancing inventions**, labeled as such there; the lore ceiling ("your own depths stop believing") is the fiction wrapped around them.

## 8 · Degenerate strategies (found and closed)

| Strategy | Closure | Where |
|---|---|---|
| Chip-siege anything huge | P ≤ Soak = 0, no roll | [[Scale Speed and Magnitude]] |
| Zetsu regen mid-fight | Defenseless + double Nen damage | [[Nen Techniques (Rules)]] |
| Permanent En radar | Radius/round upkeep + Strain clock | same |
| Yū combat heal-tank | Full-action lock + 10–50:1 rates | same |
| Vow lawyer-ing | Sincerity audit; spirit-binding clause | [[Conditions Vows and Risk (Rules)]] + [[Running the Game]] |
| Downtime rank-stuffing | Throughput limit | [[Progression and Training]] |
| Overdraw as free fuel | 1 HP : 2 aura + compounding Strain | [[Injury Recovery and Conditions]] |
| Minion-swarm walls | Sub-threshold minions add zero | [[NPCs Creatures and Encounters]] |
| Guard-stacking passivity | Guard is per-round flow, not a battery; economy punishes turtling | [[Combat Core]] |
| Fairy grapple absurdity | Leverage-aura clause (aura equalizes, size doesn't win alone) | [[Combat Core]] |

## 9 · Known rough edges (watch in play)

Honesty section — items verified *survivable*, not *perfect*:
- **T4+ full-commit sustain (4.5 rounds)** runs a hair under the 5–6 target; masters end fights abruptly. Intended flavor, but if it feels twitchy, let Ken's discount apply to one more allocation slot at rank V.
- **Control 4 at low AP** (Fern pattern) is the strongest legal early build; the gate is fiction (Control 4 needs a rare teacher — [[Nen Growth]]). GMs who hand out Control-4 teachers cheap will see why the gate exists.
- **AoE fuel surcharge (×1.5)** may still underprice large-radius control against minion-heavy tables; if AoE dominates, raise to ×2 — single knob, no cascade.
- **The Nen-null compensation package** ([[Humans and Subtypes (Races)]]) is deliberately *not* equal at high band; it's a premise, priced for the story it buys, and says so.

## 10 · The scale-invariance property (why this all keeps working)

Because damage dice, Guard, Soak, and pools all scale by the same ×10 notation while d20s never scale, **any fight between beings within ~2× of each other plays identically at every magnitude** — same hit rates, same ~5-round economy, same read game — and any fight beyond ~3× isn't a fight, at every magnitude. One engine, checked at T1–T2, T2–T3, T3–T4, and T4-vs-Gillian above, holds from alley fodder to [[Canon Benchmarks|Meruem]] with no tier rules and no compression. That property is the whole architecture; if a future house rule breaks proportionality (a flat bonus that doesn't scale, a percentage that touches d20s), this appendix is the canary — rerun its checks.
