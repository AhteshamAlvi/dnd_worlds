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

- **"Ken ≈ 10× Ten"** ([[Ken]]): initial design had Ten's shroud at 2% of AP → came out 4.5×, **failed.** Fixed: shroud = 1% (ranks I–II) — a working professional's Ken (~100 committed, whole-body Soak via density = 100/100×10 = 10) over their Ten shroud (11 → Soak ~1) = **9–10×.** ✓ Recorded in [[Nen Techniques (Rules)]]. *(Honest label: both percentages are design inventions; only the 10× ratio is lore.)*
- **"More durable than a bunker… force of tactical missiles"** ([[Progression and Training]]): elite Enhancer Kō delivers ~its full AO into one fist (P ~900+ at AO 960, × Enhancement × any vows) vs bunker wall (Soak 60, HP 2k) → down in a couple of blows; elite Ken Guard 600 → whole-body Soak 60 = bunker-grade skin. ✓ (The old "×2 Kō = P 1,280" is gone; the density engine delivers ~AO instead, landing at the same order of magnitude — see §5b.)
- **"Mach speeds for powerful non-Enhancers"**: elite Drive + Chū stack reaches SR 6–7 (≈ Mach 1) at sustainable cost; Enhancers exceed it (half-cost Chū). ✓
- **En 2 m minimum / 50 m mastery** ([[En]]): reproduced as rank I/V radii, upkeep = radius/round makes 50 m "extremely tiring" for anyone below elite (50/round vs a pro's AO 120). ✓
- **Yū "consumes far more aura than any other technique"** ([[Yū]]): 20 HP of internal repair ≈ 700 pool from a professional's 1,100 — day-scale, never combat-spam. ✓

## 5b · The density engine (surface-area revision)

The concentration mechanics ([[Aura Density and Concentration]]) were verified to *reproduce* the legacy magnitudes while removing the "×2 Kō" fudge — the numbers didn't move, the reason did:

- **Kō ≈ old ×2, emergent.** Pro AO 130, fist 2.5 SU, Gyō III (70%) + Zetsu (→~100%) + Ten III (94% containment): final fist aura **122**, offensive Power (×0.8 TRA) **98.** Old model: 2 × 60 Strike × 0.8 = **96.** Match within 2%. ✓ The ×2 was always "put your whole output in one point"; the surface-area math *is* that, with a reason and a leak (Ten containment) the old hack couldn't express.
- **No double-dip for abilities.** A basic strike concentrated by Kō ≈ 2× a balanced (half-AO) strike — the ×2 lives there, for basic strikes only. An *ability* already commits full Fuel, so Kō adds it no damage, only spatial concentration and nakedness. This closes the old exploit of stacking "×2 Kō" on top of a full-Fuel ability nuke (which is why [[Hatsu Library|Mountain Splitter]] dropped from a mispriced P 675 to a correct P 225).
- **Defensive Kō beats offensive Kō** ([[Kō]] lore): same 122 fist aura, *defending*, gives local Soak = density × 10 = **488** — four times the 122 it would *deliver* attacking. So a defensive Kō turns aside an offensive Kō head-on, while a hit anywhere else (Soak 0) is lethal. The asymmetry is the physics (penetration is pressure/area; damage is total energy), and it hands the lore its exact ruling for free. ✓
- **Chū stays bounded.** With k = 1 (Enhancers k = 2), the log curve gives whole-body Chū (density ~2) **+2** (Enhancer +3), a Kō-concentrated fist (density ~49) **+6 base / Enhancer +11 → rank-capped at +10.** Diminishing returns *plus* the rank cap mean density can spike 40× while the attribute bonus rises only from +2 to a capped +10 — no runaway, and the reinforcement stays a supplement to the aura-Power, never the main event. ✓
- **The giant paradox, from one rule.** A 17.5 m Giant (10,000 SU) with AO 10,000 sits at normal density **1** (unfocused Soak 10) — a human elite's Kō delivers ~900 into it, piercing easily; yet the same giant *concentrating* its 250 SU fist reaches Soak 376 and delivers ~9,400. Durable-but-diffuse unless focused, catastrophic when focused — both fall out of the surface-area denominator with no special-case rule. ✓

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

## 11 · The attribute overhaul (CON pool, VIT regen, SPI manifestation)

Verifying the finalized attribute spine ([[Attributes and Skills]]) behaves:

- **AP is a derived stat, no cap.** Max AP = 30 × 1.6^(CON−10), computed directly from CON exactly as Body HP is computed from VIT — there is no ceiling and no separate accumulator. The exponential maps CON straight onto the power bands: CON 10 → 30 (fresh), 16 → 503 (pro), 20 → 3.3k (elite), 24 → 22k (master), 29 → 250k (apex/[[Canon Benchmarks|Meruem]]). Every legacy band-pool survives; it's now *keyed to a constitution score* instead of grown toward a wall. Growth = raising CON (a hard-won breakthrough that ×1.6s the pool), and Nen-tempering uniquely pushes CON past the mundane 20 — the mechanism of superhuman Nen users. Rarity is arithmetic (twelve breakthroughs to Master), not a cap. ✓
- **CON and VIT are genuinely independent, both clean derivations.** Pool = f(CON) (size); regen = f(VIT) (rate): resting = VIT÷2 % of max per hour. CON 20 / VIT 8 = a 3.3k pool refilling at 4%/hr (a hoard that trickles); CON 14 / VIT 16 = a 197 pool refilling at 8%/hr (a cup that refills between fights). VIT drives HP *and* regen; nothing drives VIT. Neither stat dominates the other — one sizes, one paces — which was the whole reason to split them. ✓
- **DEX ≠ accuracy inflation.** Moving all accuracy to DEX and all precise-aura to DEX did not touch the bounded −2…+14 band (§1) — DEX is one attribute mod like any other; the read game (PER vs DEX) and In contests (DEX vs PER) are opposed rolls, not stacking bonuses. ✓
- **SPI touches no combat number.** SPI was removed from pool, output, Soak, damage, and accuracy entirely; it appears only on the [[Nen Manifestation]] roll (make new Nen *hold*) and on Spirit saves (resist Nen-on-soul). A high-SPI prodigy and a low-SPI grinder of equal CON/VIT/DEX are *mechanically identical in a fight* — the prodigy's edge is entirely in what they can bring into being. This is exactly the design intent (talent ≠ power), and it means no balance check in §§1–10 depends on SPI at all. ✓
- **Willpower's removal left no orphaned checks.** Every former WIL call re-homed: Concentration/Composure → CON, reading/Initiative → PER, Manipulation-resistance → Spirit (SPI). A full-text sweep confirms zero remaining WIL references outside the "where it went" note. ✓

None of §§1–7's results move under the overhaul — the pool/output/Soak *magnitudes* are unchanged, only their attribute sources are renamed and split. The overhaul is a re-rooting, not a rebalance, and the canary checks still pass.
