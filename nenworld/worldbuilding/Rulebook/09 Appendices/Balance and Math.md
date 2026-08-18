[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Appendices

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

- **"Ken ≈ 10× Ten"** ([[Ken]]): initial design had Ten's shroud at 2% of AP → came out 4.5×, **failed.** Fixed: shroud = 1% (ranks II–IV) — a working professional's Ken (~100 committed, whole-body Soak via density = 100/100×10 = 10) over their Ten shroud (11 → Soak ~1) = **9–10×.** ✓ Recorded in [[Nen Principles (Rules)]]. *(Honest label: both percentages are design inventions; only the 10× ratio is lore.)*
- **"More durable than a bunker… force of tactical missiles"** ([[Rulebook/05 Progression/Progression and Training]]): elite Enhancer Kō delivers ~its full AO into one fist (P ~900+ at AO 960, × Enhancement × any vows) vs bunker wall (Soak 60, HP 2k) → down in a couple of blows; elite Ken Guard 600 → whole-body Soak 60 = bunker-grade skin. ✓ (The old "×2 Kō = P 1,280" is gone; the density engine delivers ~AO instead, landing at the same order of magnitude — see §5b.)
- **"Mach speeds for powerful non-Enhancers"**: elite Drive + Chū stack reaches SR 6–7 (≈ Mach 1) at sustainable cost; Enhancers exceed it (half-cost Chū). ✓
- **En 2 m minimum / 50 m mastery** ([[En]]): reproduced as rank II / X radii, upkeep = radius/round makes 50 m "extremely tiring" for anyone below elite (50/round vs a pro's AO 120). ✓
- **Yū "consumes far more aura than any other principle"** ([[Yū]]): 20 HP of internal repair ≈ 700 pool from a professional's 1,100 — day-scale, never combat-spam. ✓

## 5b · The density engine (surface-area revision)

The concentration mechanics ([[Aura Density and Concentration]]) were verified to *reproduce* the legacy magnitudes while removing the "×2 Kō" fudge — the numbers didn't move, the reason did:

- **Kō ≈ old ×2, emergent.** Pro AO 130, fist 2.5 SU, Gyō VI (70%) + Zetsu (→~100%) + Ten VI (94% containment): final fist aura **122**, offensive Power (×0.8 TRA) **98.** Old model: 2 × 60 Strike × 0.8 = **96.** Match within 2%. ✓ The ×2 was always "put your whole output in one point"; the surface-area math *is* that, with a reason and a leak (Ten containment) the old hack couldn't express.
- **No double-dip for abilities.** A basic strike concentrated by Kō ≈ 2× a balanced (half-AO) strike — the ×2 lives there, for basic strikes only. An *ability* already commits full Fuel, so Kō adds it no damage, only spatial concentration and nakedness. This closes the old exploit of stacking "×2 Kō" on top of a full-Fuel ability nuke (which is why [[Hatsu Library|Mountain Splitter]] dropped from a mispriced P 675 to a correct P 225).
- **Defensive Kō beats offensive Kō** ([[Kō]] lore): same 122 fist aura, *defending*, gives local Soak = density × 10 = **488** — four times the 122 it would *deliver* attacking. So a defensive Kō turns aside an offensive Kō head-on, while a hit anywhere else (Soak 0) is lethal. The asymmetry is the physics (penetration is pressure/area; damage is total energy), and it hands the lore its exact ruling for free. ✓
- **Chū stays bounded.** With k = 1 (Enhancers k = 2), the log curve gives whole-body Chū (density ~2) **+2** (Enhancer +3), a Kō-concentrated fist (density ~49) **+6 base / Enhancer +11 → rank-capped at +10.** Diminishing returns *plus* the rank cap mean density can spike 40× while the attribute bonus rises only from +2 to a capped +10 — no runaway, and the reinforcement stays a supplement to the aura-Power, never the main event. ✓
- **The giant paradox, from one rule.** A 17.5 m Giant (10,000 SU) with AO 10,000 sits at normal density **1** (unfocused Soak 10) — a human elite's Kō delivers ~900 into it, piercing easily; yet the same giant *concentrating* its 250 SU fist reaches Soak 376 and delivers ~9,400. Durable-but-diffuse unless focused, catastrophic when focused — both fall out of the surface-area denominator with no special-case rule. ✓

## 6 · Skilled-but-weaker vs stronger-but-sloppier

Fern-type (AP 900, AO 110, Control 4 ×1.25) vs brute (AP 1,500, AO 180, Control 1 ×2.0) — the brute out-commits her 180 to 110 every round and *pays double*: sustain 4.2 rounds vs her 6.5. At round 4 the brute is empty (Exhausted: disadvantage, no principles, Guard 0) with her at ~350 pool. If she survives four rounds — Guard the spikes, give ground, make him chase — she wins walking. **Control and pacing beat raw pool at ≤2× disparity; at ≥3× pool disparity, magnitude wins anyway.** That boundary (skill closes one gap, not two) is the game's core fairness claim, now verified.

## 7 · Vow spike audit (does ×5 break the ladder?)

T2 pro with a maximum ×5 vow stack: one P 600 hit — a T3-grade *moment* on a T2 pool (7 rounds sustain unchanged, Guard unchanged). Vows make glass cannons and martyrs, not band-jumpers: damage spikes, durability doesn't, economy doesn't. Runaway requires stacking that the ×5 product cap and two-narrow-vow limit ([[Conditions Vows and Risk (Rules)]]) forbid — both caps are **balancing inventions**, labeled as such there; the lore ceiling ("your own depths stop believing") is the fiction wrapped around them.

## 8 · Degenerate strategies (found and closed)

| Strategy | Closure | Where |
|---|---|---|
| Chip-siege anything huge | P ≤ Soak = 0, no roll | [[Scale Speed and Magnitude]] |
| Zetsu regen mid-fight | Defenseless + double Nen damage | [[Nen Principles (Rules)]] |
| Permanent En radar | Radius/round upkeep + Strain clock | same |
| Yū combat heal-tank | Full-action lock + 10–50:1 rates | same |
| Vow lawyer-ing | Sincerity audit; spirit-binding clause | [[Conditions Vows and Risk (Rules)]] + [[Running the Game]] |
| Downtime rank-stuffing | Throughput limit | [[Rulebook/05 Progression/Progression and Training]] |
| Overdraw as free fuel | 1 HP : 2 aura + compounding Strain | [[Injury Recovery and Conditions]] |
| Minion-swarm walls | Sub-threshold minions add zero | [[NPCs Creatures and Encounters]] |
| Guard-stacking passivity | Guard is per-round flow, not a battery; economy punishes turtling | [[Combat Core]] |
| Fairy grapple absurdity | Leverage-aura clause (aura equalizes, size doesn't win alone) | [[Combat Core]] |

## 9 · Known rough edges (watch in play)

Honesty section — items verified *survivable*, not *perfect*:
- **T4+ full-commit sustain (4.5 rounds)** runs a hair under the 5–6 target; masters end fights abruptly. Intended flavor, but if it feels twitchy, let Ken's discount apply to one more allocation slot at rank X.
- **Control 4 at low AP** (Fern pattern) is the strongest legal early build; the gate is fiction (Control 4 needs a rare teacher — [[Nen Growth]]). GMs who hand out Control-4 teachers cheap will see why the gate exists.
- **AoE fuel surcharge (×1.5)** may still underprice large-radius control against minion-heavy tables; if AoE dominates, raise to ×2 — single knob, no cascade.
- **The Nen-null compensation package** ([[Humans and Subtypes (Races)]]) is deliberately *not* equal at high band; it's a premise, priced for the story it buys, and says so.

## 10 · The scale-invariance property (why this all keeps working)

Because damage dice, Guard, Soak, and pools all scale by the same ×10 notation while d20s never scale, **any fight between beings within ~2× of each other plays identically at every magnitude** — same hit rates, same ~5-round economy, same read game — and any fight beyond ~3× isn't a fight, at every magnitude. One engine, checked at T1–T2, T2–T3, T3–T4, and T4-vs-Gillian above, holds from alley fodder to [[Canon Benchmarks|Meruem]] with no tier rules and no compression. That property is the whole architecture; if a future house rule breaks proportionality (a flat bonus that doesn't scale, a percentage that touches d20s), this appendix is the canary — rerun its checks.

## 11 · The attribute overhaul (CON pool, VIT regen, SPI manifestation)

Verifying the finalized attribute spine ([[Attributes and Skills]]) behaves:

- **AP is a derived stat, no cap.** *(Superseded by §11b below — kept here as historical record.)* This section originally verified Max AP = 30 × 1.6^(CON−10), computed directly from CON exactly as Body HP is computed from VIT — there is no ceiling and no separate accumulator. The exponential mapped CON straight onto the power bands: CON 10 → 30 (fresh), 16 → 503 (pro), 20 → 3.3k (elite), 24 → 22k (master), 29 → 250k (apex/[[Canon Benchmarks|Meruem]]). Growth = raising CON (a hard-won breakthrough that ×1.6s the pool), and Nen-tempering uniquely pushes CON past the mundane 20 — the mechanism of superhuman Nen users. Rarity is arithmetic (twelve breakthroughs to Master), not a cap. The CON-only formula and the specific figures above are no longer current; see §11b.
- **CON and VIT are genuinely independent, both clean derivations.** *(Still true; the mechanism changed, not the claim.)* Pool now reads CON and VIT jointly, as their average (§11b); regen still = f(VIT) alone (rate). VIT drives HP *and* regen; nothing drives VIT. Neither stat dominates the other — one paces, and the two together size the reservoir — which was the whole reason to split them. ✓
- **DEX ≠ accuracy inflation.** Moving all accuracy to DEX and all precise-aura to DEX did not touch the bounded −2…+14 band (§1) — DEX is one attribute mod like any other; the read game (PER vs DEX) and In contests (DEX vs PER) are opposed rolls, not stacking bonuses. ✓
- **SPI touches no combat number.** SPI was removed from pool, output, Soak, damage, and accuracy entirely; it appears only on the [[Nen Manifestation]] roll (make new Nen *hold*) and on Spirit saves (resist Nen-on-soul). A high-SPI prodigy and a low-SPI grinder of equal CON/VIT/DEX are *mechanically identical in a fight* — the prodigy's edge is entirely in what they can bring into being. This is exactly the design intent (talent ≠ power), and it means no balance check in §§1–10 depends on SPI at all. ✓
- **Willpower's removal left no orphaned checks.** Every former WIL call re-homed: Concentration/Composure → CON, reading/Initiative → PER, Manipulation-resistance → Spirit (SPI). A full-text sweep confirms zero remaining WIL references outside the "where it went" note. ✓

None of §§1–7's results moved under *that* overhaul — the pool/output/Soak *magnitudes* were unchanged, only their attribute sources were renamed and split. That overhaul was a re-rooting, not a rebalance. §11b below is a different kind of change.

## 11b · The Aura Mathematics revision (magnitude curve replaces the CON-only exponential)

§11 verified `Max AP = 30 × 1.6^(CON−10)`, CON-only. That formula has since been **replaced wholesale** by [[Aura Mathematics]]: Maximum Aura Pool now reads the *average* of CON and VIT through an accelerating quadratic-exponent curve, and Aura Output is no longer `AP × Ren%` but a two-stage model — a CON-derived physiological ceiling, accessed via a Ren-derived fraction, capped by Current Aura. Unlike §11's attribute overhaul, **this one does move the numbers**, deliberately: it's a new formula, not a re-rooting of the old one.

Every formula, benchmark table, and rounding example supplied for this revision was checked in Python and matched exactly (see [[Aura Mathematics]] for the full derivation). Recomputed at the CON = VIT baseline this book already used throughout:

| CON = VIT | Old AP (30×1.6^(CON−10)) | New AP | Old AO (≈Ren-rank % of pool) | New Physiological Output Capacity |
|--:|--:|--:|--:|--:|
| 10 | 30 | 10 | ~1 | 2 |
| 17 | ~1.4k | 3k | ~140 | 600 |
| 20 | 3.3k | 50k | ~330–660 | 10,000 |
| 22 | 8.4k | 400k | ~840–1.7k | 80,000 |
| 24 | 22k | 3M | ~2.2k–4.4k | 700,000 |
| 25 | 40k | 10M | ~4k–8k | 2,000,000 |
| 29 | 250k | 1B | — | 200,000,000 |
| 30 | 363k | 4B | — | 800,000,000 |

**What this revision touched, and what it didn't.** [[Aura Statistics]] §§1, 2, and 5 (Pool, Output, Regeneration) and [[Canon Benchmarks]]'s AP/AO figures have been recomputed to match the new curve. **§§1–10 and §12 of this appendix have not.** Their worked examples — Fern at AP 900/AO 110, a "T2 pro AO 130," "master P 2.5k," the Darun figures reused in §12's STR Force Factor check — were calibrated against the *old* AP/AO curve and are now numerically stale, off by orders of magnitude from what the same characters compute to today. They're flagged here rather than silently left wrong or silently rewritten: fixing them honestly means re-running the whole combat-economy calibration (accuracy, Guard, Soak, damage pacing in §§2, 4, 6, 7), which is a combat-balance pass in its own right, not a byproduct of an Aura-reserve formula change. **Treat §§1–10 and §12's specific numeric examples as provisional pending that dedicated pass; the qualitative claims they make (penetration walls hold, accuracy stays bounded, skill beats raw pool at ≤2× disparity, the density engine reproduces Kō's old ×2) are not invalidated by this change — only the illustrative numbers attached to them are.**

*(Honest label: the magnitude curve M(x) = 50ⁿ·2^(n(n−1)/2), the ×10/×2/×1 pool/output/regen scale factors, the one-significant-figure rounding rule, and the 10%-per-Ren-rank access fraction are this book's inventions — supplied whole by design and verified here against the given benchmark tables, not derived from lore. Only the underlying [[The Standard Slime|Standard Slime measurement scale]] is lore.)*

## 12 · STR Force Factor (physical-Power scaling)

STR gained a derived magnitude — **Force Factor = 2^((STR−10)/4)**, ×1.00 at STR 10, ×32 at STR 30 (deadlift 100 kg → 3.2 t) — and the combat bridge is: **Physical Force = weapon-dice average × Force Factor** (melee/thrown only; firearms exempt), with the aura Strike term unchanged ([[Strength]], [[Combat Core]]). Verifying it does **not** disturb §§1–10:

- **The exponential lives on the physical term, never on the d20.** Force Factor multiplies a damage-side Power, exactly like the ×10 magnitude notation and Impact = speed × SF already do ([[Scale Speed and Magnitude]]). Accuracy stays the bounded −2…+14 band (§1); STR's *modifier* (not its Force Factor) remains the d20 term for grapple/Athletics/carry. ✓
- **Professional-band fights don't move.** The Darun worked example ([[Combat Core]]): R1 even swing 5.5 × ×2.0 (STR 14) + 48 aura = **P 59** (was ~55); R2 Kō with Chū +4 STR → ×4.0 (STR 18) → 5.5 × 4 + 98 aura = **P 120** (was ~107). Shifts of +4/+13 on Powers of ~55–110 — inside rounding, no verified result changes. At professional STR (12–16) the Force Factor is ×1.4–2.8, so muscle stays a minor addend next to aura; *fists still exceed missiles via aura, not meat.* ✓
- **The penetration walls hold, and high STR earns real teeth.** A pure-muscle bare fist (zero aura) is P 7 at STR 16, P 14 at STR 20, P 34 at STR 25, **P 80 at STR 30.** Each pierces an even guard (Soak ~8) as a superhuman brute should, and **every one bounces off a concentrated defensive Kō (Soak ~490)** — the §3 wall is intact. A ×32 muscle fist reaching T2–T3 Power *only at STR 30* (apex/Nen-tempered/racial, per the ladder) is the intended "megaton strength" of the lore, correctly gated behind a score almost no one has. ✓
- **Human calibration is honest.** STR 20 (the once-a-generation record) = 566 kg deadlift, just past the real all-time equipped record (~500 kg); STR 19 = 476 kg ≈ the real raw-ish ceiling. The mundane cap lands where reality runs out, and 21+ is flagged superhuman-only. ✓

The Force Factor is an addition to STR's *physical* magnitude, not a rebalance of aura combat — §§1–10's canary checks were rerun above and still pass. *(Honest label: the 100 kg/50 kg STR-10 anchors and the per-+4 doubling are design inventions chosen to land the human cap on reality; only "strength scales exponentially while the die stays linear" is the load-bearing principle.)*

## 13 · The three-track progression overhaul (levels, Stat Points, Growth Points)

The advancement layer was replaced wholesale ([[Rulebook/05 Progression/Progression and Training|Progression and Training]], [[Nen Growth]]). Every figure below was computed, not asserted.

**XP is the supplied curve, unchanged.** `5 + L + ⌈L²/12⌉` gives 7 / 13 / 24 / 39 / 59 / 83 / 105 at levels 1 / 5 / 10 / 15 / 20 / 25 / 29, summing to **1,310** for 1 → 30 (119 to reach 10, 502 to reach 20). ✓

**Both cost curves were then loosened to raise the ceiling**, on the brief that a level-30 character going all out — levels *and* quests — should be able to reach total mastery of one advanced principle, while doing it everywhere stays impossible.

| Curve | Was | Now | Effect |
|---|---|---|---|
| Stat Point cost | `1 + ⌊S/6⌋ + ⌈S²/120⌉` | **`1 + ⌊S/8⌋ + ⌈S²/200⌉`** | 10 → 30 falls 157 → **110**; 10 → 28 falls 132 → **93** |
| Growth Point cost | `R(R+1)/2` | **`⌈R(R+1)/4⌉`** | one principle to X falls 220 → **113** |
| Per level | 8 SP + 8 GP | **12 SP + 12 GP** | 348 of each across 29 level-ups |

Both remain strictly increasing per step (SP 2 → 9, GP 1 → 28), so every additional point and rank still costs more than the last.

**The foundation cap is what makes total mastery expensive, not the curve.** Mastery X in an advanced principle drags every prerequisite to X with it. Computed closures: [[Fū]] needs 5 principles at X (itself + En, Hatsu, Ten, Ren) · [[Kō]] needs 6 · [[Ryū]], [[Jū]], and [[Yū]] need 7 each. So the cheapest complete advanced mastery is **5 × 113 = 565 GP nominal**, and the dearest is 791.

**Breakthrough variance was the real wall, and it was fixed rather than ignored.** Under the old all-or-nothing failure rule a Fū-X path cost **1,113 GP in expectation** at SPI +4 — twice the nominal price, and unreachable. Two changes bring it into range:

1. **Failure destroys half the committed GP** (9 / 12 / 14 at VIII / IX / X), not all of it.
2. **An explicit modifier table** ([[Nen Growth]]), making +4 to +8 over raw SPI the *expected* state of a prepared attempt rather than a rarity.

Expected GP for one principle taken to X, and for the cheapest advanced path:

| Total modifier | p(VIII / IX / X) | Per principle to X | Fū path (×5) |
|---|---|---:|---:|
| +4 | 50% / 35% / 15% | 223 | 1,113 |
| +6 | 60% / 45% / 25% | 175 | 875 |
| +8 | 70% / 55% / 35% | 152 | **761** |
| +10 | 80% / 65% / 45% | 139 | 693 |

**The three targets, checked.**

- *Levels alone cannot buy an advanced X.* 29 level-ups pay **348 GP** against a 761-expected path at +8. A levels-only character reaches **43%** of it. ✓
- *Levels plus a campaign of questing can.* At +8 the shortfall is ~413 GP from quests, roughly matching what levelling paid — so questing is genuinely required, and roughly doubles a dedicated character's income. ✓
- *Everything at X stays impossible.* All fifteen principles to X costs **1,695 GP nominal** and ~2,280 in expectation, against ~760 for an all-out career — and all ten attributes to 30 costs **1,100 SP** against 348 from levels. Both are three to four times beyond a completionist's entire budget. ✓

**Stat side.** One attribute from 10 to 30 now costs **110 SP**, about a third of what levelling pays across a whole career: affordable once, deliberately, if quests carry the rest of the sheet. A second pinnacle is not something a career has room for. The mastery-X gate stays at 28 (**93 SP**), so the last two points to 30 cost a further **17 SP and unlock nothing mechanical** — 30 remains an achievement past the point of usefulness, exactly as specified. ✓

**Downstream figures rechecked.** Control ranks were rescaled with the GP curve (2 / 4 / 7 / 11 for Control 2–5, holding their old share of a principle's cost). §§1–3 (accuracy bounds, penetration walls) depend on attribute *values* and density, not on how those values were purchased, and are unaffected. Aura Pool math has since moved on from `30 × 1.6^(CON−10)` to [[Aura Mathematics]]'s CON+VIT curve (§11b below) — CON (and VIT) simply cost Stat Points now, same as before, just feeding a different formula. At the new formula's balanced CON 30 / VIT 30 benchmark the pool is **4B**, and [[Canon Benchmarks|Meruem's own CON 29 anchor]] recomputes to **AP 1B**.

⚠ **Watch in play.** DC 22 for Mastery X is still unreachable on a bare d20 + SPI at average SPI (+0 gives 0%). That is now intentional — the modifier table is the route, and X is meant to be a prepared, supported, once-in-a-career attempt. If it proves too fiddly at the table, drop DC X to 20 rather than inflating SPI.

*(Honest labels: the XP formula, mastery thresholds, Catalyst and Breakthrough gates, and the foundation-cap rule are supplied design. The **two cost curves**, the **12 SP + 12 GP per level** grant, the **half-loss failure rule**, the **Breakthrough modifier table**, **Control's GP prices**, **skills costing Stat Points**, the **Hatsu EP budget across I–X**, and the **Ren/Chū continuous scales** are this book's inventions, chosen to land the supplied curves on the power bands this book already had.)*
