[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Appendices

The verification appendix. Every claim below was computed, not asserted; the numbers are reproducible from the cited chapters. Where testing found a miss, the fix is documented here — this book does not claim a rule "came from the lore" when it's a balancing invention, and it does not claim balance it didn't check.

## 1–10 · Combat-economy verification (pending)

⚠ **These sections were wiped 2026-08-18, not just flagged.** §§1–10 (accuracy bounds, same-band duel pacing, penetration walls, aura endurance, lore-fidelity spot checks, the density engine, skilled-vs-stronger comparisons, degenerate-strategy closures, known rough edges, the scale-invariance property) all carried specific worked numbers calibrated against the pre-[[Aura Mathematics]] AP/AO curve. They'd already been flagged stale in place since that revision (§11b below); rather than keep republishing numbers everyone already knows are wrong, they've been cleared out until someone actually runs the combat-economy pass. The **qualitative claims are not in doubt and don't need re-verifying from scratch** — penetration should wall off non-adjacent bands, accuracy should stay bounded, same-band fights should hinge on the read game rather than autopilot, exhaustion should be the universal leash, vows should spike damage without jumping bands — only the specific numbers illustrating them need to be recomputed against the current Aura Pool/Output formulas and republished here, section by section, once that pass happens.

This list is the checklist for that pass, in the order the sections used to run: accuracy-bounded hit-chance table (§1) · same-band duel overflow/read-game math (§2) · penetration-wall matchup table across bands and Gillians (§3) · full-commit sustain rounds by band (§4) · lore-fidelity spot checks — Ken≈10×Ten, bunker durability, Mach speeds, En radius upkeep, Yū's aura cost (§5) · the density-engine Kō/Chū/giant reproduction checks (§5b) · skilled-vs-stronger sustain comparison (§6) · vow-spike audit (§7) · degenerate-strategy closure table (§8) · known rough edges (§9) · the scale-invariance property (§10).

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

**What this revision touched, and what it didn't.** [[Aura Statistics]] §§1, 2, and 5 (Pool, Output, Regeneration) and [[Canon Benchmarks]]'s AP/AO figures have been recomputed to match the new curve. **§§1–10 and §12 of this appendix had not** — their worked examples were calibrated against the *old* AP/AO curve and were numerically stale, off by orders of magnitude from what the same characters compute to today. Rather than leave them standing as wrong numbers, they've since been **cleared out** (2026-08-18) pending the dedicated combat-economy pass fixing them honestly requires — see the §§1–10/§12 headers above for the checklist. **The qualitative claims those sections made (penetration walls hold, accuracy stays bounded, skill beats raw pool at ≤2× disparity, the density engine reproduces Kō's old ×2) are not invalidated by this change** — only the illustrative numbers attached to them were, which is why the numbers are gone and the claims are recorded here as the target to re-verify against.

*(Honest label: the magnitude curve M(x) = 50ⁿ·2^(n(n−1)/2), the ×10/×2/×1 pool/output/regen scale factors, the one-significant-figure rounding rule, and the 10%-per-Ren-rank access fraction are this book's inventions — supplied whole by design and verified here against the given benchmark tables, not derived from lore. Only the underlying [[The Standard Slime|Standard Slime measurement scale]] is lore.)*

## 12 · STR Force Factor (physical-Power scaling)

STR has a derived magnitude — **Force Factor = 2^((STR−10)/4)**, ×1.00 at STR 10, ×32 at STR 30 (deadlift 100 kg → 3.2 t) — and the combat bridge is: **Physical Force = weapon-dice average × Force Factor** (melee/thrown only; firearms exempt), with the aura Strike term unchanged ([[Strength]], [[Combat Core]]). The formula itself isn't in question — "strength scales exponentially while the die stays linear" is the load-bearing principle, and the 100 kg/STR-10 anchor plus the per-+4 doubling are labeled design inventions, not lore.

⚠ **Its worked verification against §§1–10 is cleared out for the same reason as those sections** — the Darun-fight recheck and the "bounces off a concentrated defensive Kō (Soak ~490)" figures both depend on the same stale AP/AO baseline. Once §§1–10 are redone, re-run this section against the current numbers: does the Force Factor still leave accuracy untouched, do professional-band fights still barely move, do the penetration walls still hold with high-STR muscle alone, does the STR-to-real-world-deadlift calibration still read honest.

## 13 · The three-track progression overhaul (levels, Stat Points, Growth Points)

The advancement layer was replaced wholesale ([[Rulebook/05 Progression/Progression and Training|Progression and Training]], [[Nen Growth]]). Every figure below was computed, not asserted. **`packages/engine/src/character/progression/` (`levels.ts`, `stats.ts`, `growth.ts`) is the authoritative source for the XP curve, the per-level SP/GP grant, and the Stat Point cost — this section documents what that code does, not the other way around.** Where this section and the engine ever disagree again, the engine wins and this page is the one that's stale.

**XP is a revised curve, not the original supplied one.** An earlier draft of this book used `5 + L + ⌈L²/12⌉` (1,310 total to Level 30); the engine now runs a different-shaped curve instead:

> `XP for the next level = 5 + 0.75L + L³/75`, raw result rounded to one significant figure.

| Level | XP to next | | Level | XP to next |
|---|---:|---|---|---:|
| 1 → 2 | 6 | | 20 → 21 | 100 |
| 5 → 6 | 10 | | 25 → 26 | 200 |
| 10 → 11 | 30 | | 29 → 30 | 400 |
| 15 → 16 | 60 | | **1 → 30 total** | **3,000** |

100 to reach Level 10, 700 to reach Level 20, 3,000 to reach Level 30 — verified in Python against the engine's own `deriveXpToNextLevel`/`deriveLifetimeXpThreshold`. This is a much longer curve than the old one (3,000 vs. 1,310 total XP), which matters below: it does not by itself change how much SP/GP a level is worth, only how much XP it takes to get there.

**The Stat Point cost curve was flattened, not just re-scaled.** The escalating curve below (`1 + ⌊S/8⌋ + ⌈S²/200⌉`) was an earlier draft. The engine instead charges a flat cost:

| Curve | Was (earlier draft) | Now (engine) | Effect |
|---|---|---|---|
| Stat Point cost | `1 + ⌊S/6⌋ + ⌈S²/120⌉`, later `1 + ⌊S/8⌋ + ⌈S²/200⌉` | **flat `1 SP` per point, always** | 10 → 30 falls 157 / 110 → **20**; 10 → 28 falls 132 / 93 → **18** |
| Growth Point cost | `R(R+1)/2`, later `⌈R(R+1)/4⌉` | **pending — never actually decided, pulled from [[Nen Growth]]** | n/a |
| Per level | 8 SP + 8 GP, later 12 SP + 12 GP | **2 SP + 3 GP, every Level including Level 1** | **60 SP / 90 GP** total by Level 30 (not 348 of each) |

With SP flattened, the SP figures below are pure multiplication (points × 1), not a step table. The GP cost curve isn't part of `progression/` — it lives with the Nen mastery mechanics, which haven't been ported into the engine yet, and its numbers are pending a decision rather than standing as settled (see below).

**The foundation cap still makes total mastery cost more than one principle's bill**, independent of what the per-rank price turns out to be: Mastery X in an advanced principle drags every prerequisite to X with it. Computed closures: [[Fū]] needs 5 principles at X (itself + En, Hatsu, Ten, Ren) · [[Kō]] needs 6 · [[Ryū]], [[Jū]], and [[Yū]] need 7 each. That multiplier is settled; what it multiplies is not.

⚠ **The Nen mastery economy was never actually decided and has been pulled rather than left standing as stale numbers.** The GP-cost-per-rank curve, the Breakthrough DC/modifier table, and the "levels alone reach X%" analysis that used to sit here were all early-draft figures tuned against a 12 GP/level supply that no longer exists (the engine now provides 3 GP/level, 90 GP by Level 30 — [[Rulebook/05 Progression/Progression and Training|Progression and Training]] §4). Rather than republish a recomputed-but-still-arbitrary version of that pairing, the specific numbers are gone from [[Nen Growth]] pending a real pass: the GP-cost curve and the Breakthrough odds need to be designed together against the current 90 GP/Level 30 supply, not patched independently.

**Stat side, recomputed.** Starting values for the eight ordinary attributes are now the engine's array (`11, 11, 10, 10, 10, 10, 9, 9`) rather than a value of 10 for all. At a flat 1 SP/point:

- One attribute from 10 to 30 costs **20 SP** — a third of the 60 SP levelling pays out by Level 30. Affordable once, deliberately, if quests carry the rest of the sheet.
- All eight ordinary attributes to 30 (from their actual starting values) costs **160 SP** against that same 60 SP career income — 2.7× beyond a levels-only budget, and **SPI and CHA cannot reach 30 through this track at all**, since ordinary Stat Points can't touch them. That's a stronger version of the old "all ten is out of reach" claim: two of the ten are structurally excluded, not merely expensive.
- The mastery-X gate stays at 28 (**18 SP** from the 10 starting point, flat cost), so the last two points to 30 cost a further **2 SP and unlock nothing mechanical** — 30 remains an achievement past the point of usefulness. ✓

**Downstream figures rechecked.** Control ranks' GP prices were priced off the now-pulled GP cost curve, so they're pending alongside it ([[Nen Growth]]). §§1–3 (accuracy bounds, penetration walls) depend on attribute *values* and density, not on how those values were purchased, and are unaffected. Aura Pool math has since moved on from `30 × 1.6^(CON−10)` to [[Aura Mathematics]]'s CON+VIT curve (§11b below) — CON (and VIT) simply cost Stat Points now, same as before, just feeding a different formula. At the new formula's balanced CON 30 / VIT 30 benchmark the pool is **4B**, and [[Canon Benchmarks|Meruem's own CON 29 anchor]] recomputes to **AP 1B**.

*(Honest labels: mastery thresholds, Catalyst and Breakthrough gates, and the foundation-cap rule are supplied design. The **XP curve**, the **flat Stat Point cost**, and the **2 SP + 3 GP per level grant** are settled — all three per `packages/engine`. The **GP cost curve**, the **Breakthrough DC/modifier table**, the **failure-burn rule**, **Control's GP prices**, **skills costing Stat Points**, the **Hatsu EP budget across I–X**, and the **Ren/Chū continuous scales** remain this book's inventions — the GP-side ones specifically were never actually decided and have been pulled from [[Nen Growth]] rather than left standing, pending a dedicated pass against the current 90 GP/Level 30 supply.)*
