# Nen Techniques (Rules)

[[00 Read Me First|Rulebook]] › Aura Engine

The fifteen techniques from the lore ([[Four Major Principles]], [[Intermediate Techniques]], [[Advanced Techniques]]), statted. **Each owns a distinct mechanical job** — the design refuses to let any two be the same lever. Some are sustained states (Ten, Zetsu, Ken), some are concentration math (Gyō, Kō, Ryū — all resolved by the surface-area engine in [[Aura Density and Concentration]]), some are contests (In), some are resource decisions (En, Jū, Yū). The allocation framework they plug into is defined in [[Combat Core]]; the short version:

> Each round, a Nen user projects up to their **AO** ([[Aura Statistics]]) and decides two things: **how much** goes to Strike (offense), Guard (defense), Drive (speed), Focus (senses), and Fuel (abilities) — and **where on the body** it sits ([[Aura Density and Concentration|density]]). Techniques change how well those convert, how concentrated they get, and what else you can do with them.

**The division of labor** (read this once and the rest follows):
- **[[Ten]]** — *contains* aura: sets how much concentrated aura stays put instead of leaking (containment %).
- **[[Ren]]** — *outputs* aura: sets AO, the amount of pool you can project this round (never the pool itself).
- **[[Gyō]]** — *concentrates* aura: moves it from the rest of the body into one region (transfer %).
- **[[Zetsu]]** — *suppresses* aura: shuts regions off, enabling near-total transfer during Kō.
- **[[Chū]]** — *converts* aura density into physical reinforcement of the flesh.
- **[[Kō]]** — the four above run to their limit, one point. Emergent, not a multiplier.

**Ranks.** Every technique has ranks I–V (Learned → Mastered). Rank requirements, TP costs, and training times are in [[Nen Growth]]. A technique used under its listed minimum rank for a stunt simply isn't available. Failure consequences are listed per technique; **Strain** is defined in [[Injury Recovery and Conditions]].

**Concentration under fire.** Maintaining any sustained technique while taking Body damage requires a **CON (Endurance)** check, DC 10 + (damage taken ÷ 10, max +10) — holding aura together while hurt is stamina, not a lost "willpower" stat. Fail: the state drops at the end of the current action. [[Ten]] III+ holds itself.

---

## The Four Major Principles

### Ten ("Envelop") — containment + shroud
- **Prereq:** Awakened. Learned first, always.
- **Action:** 1 action to raise. **Cost:** none (it re-routes the leak).
- **Primary job — containment.** Ten sets how much of your aura *stays where you put it* instead of leaking away. This is the **containment %** in every concentration calculation ([[Aura Density and Concentration]]): I 80% · II 88% · III 94% · IV 98% · V 100%. A low-Ten fighter who concentrates via [[Gyō]] or [[Kō]] loses a fifth of the aura they move; a Ten V master loses none. **Ten is why concentration works at all** — without it, aura poured into a fist just boils back off.
- **Shroud.** Also grants a standing defense: **Guard = 1% of max AP** (min 1), refreshing at the start of your turn; whole-body Soak = Guard ÷ 10 (the density math, [[Aura Density and Concentration]]). Grants +rank to Composure (CHA) saves against bloodlust and emotional Nen. From rank III, visibly slows aging ([[Ten]]).
- **Ranks:** I — must hold consciously; Concentration (CON) checks when damaged; drops in sleep; containment 80%. II — automatic while awake, upkeep-free; containment 88%. III — shroud 1.5% AP; holds itself under pain; containment 94%. IV — persists asleep or unconscious; shroud 2%; containment 98%. V — shroud 2.5%; cannot be stripped short of 0 AP; **containment 100%** (nothing you concentrate ever leaks).
- **Calibration note:** the shroud is set at 1% so that a working [[Ken]] lands at the lore's "about 10 times higher than Ten" ([[Ken]]) — verified in [[Balance and Math]].
- **Counters:** any Nen-enhanced attack treats the Ten shroud as ordinary thin Guard. Ten is a raincoat, not armor ([[Ten]]: "not much" against aura-enhanced attacks). But its *containment* role is not optional flavor — strip a fighter's Ten (drive them to exhaustion) and their Kō leaks 20%+ of its power.

### Zetsu ("Suppress") — suppression state
- **Prereq:** Ten I.
- **Action:** 1 action to enter or exit (rank IV: reaction). **Cost:** none.
- **Primary job — suppression.** Zetsu shuts aura flow off in a region or the whole body. Two uses: (1) **whole-body**, your presence vanishes — aura detection fails entirely, finding you is mundane Perception vs Stealth, and Regeneration ×3 ([[Aura Statistics]]); (2) **selective**, during [[Kō]], Zetsu suppresses every region *except* the one you're concentrating into — which is what lets [[Gyō]]'s transfer approach 100% and drops every other region's Soak to zero ([[Aura Density and Concentration]]). Zetsu is the "off switch" that makes total concentration possible.
- **Senses sharpen** (whole-body): +2 to Aura Sense (PER), and at rank III+ you may contest [[In]] with **PER + Zetsu rank** (the lore's "Zetsu can counter In, though not advised").
- **Defenseless:** while in whole-body Zetsu you have **no Guard from any source**, take **double damage from Nen-enhanced attacks** (applied to Body), and resist emotional attacks at disadvantage.
- **Ranks:** I — stationary or slow movement only; any aura use breaks it. II — hold while acting mundanely. III — the counter-In sense; hold under stress. IV — enter as a reaction. V — even gaze-detection is DC 36; you read as *absent*.
- **Failure:** taking any Body damage forces a Concentration (CON) check to hold; a failed entry (under fire, DC 20) wastes the action.
- **Nearby users notice the *disappearance*:** any Nen user within Aura Sense range when you enter Zetsu may make a passive Aura Sense (PER) vs DC 10 + your Zetsu rank ×2 to register the sudden absence ([[Zetsu]]).

### Ren ("Refine") — output engine
- **Prereq:** Ten I.
- **Action:** 1 action to flare (minor at rank III+). **Cost:** free to hold in combat; out of combat, sustained Ren costs 1% AP/minute.
- **Primary job — output.** Ren sets how much of your pool you can **project this round**: Output % by rank (5/8/12/16/20%; [[Aura Statistics]]). **Ren governs output, never pool** — a huge-CON reservoir does nothing for you in a given round beyond what your Ren can pipe out of it. While Ren is up you are *visibly* alight to any Nen user (unless [[In]]).
- **Duration cap** (out-of-combat sustained): I — 2 min · II — 10 min · III — 30 min · IV — 2 h · V — all day. (Lore: a month of training per +10 minutes, [[Ren]].)
- **Bloodlust:** you may tinge Ren with hostility: creatures within 10 m make a **Composure (CHA)** save vs **10 + Ren rank + your CHA mod** or become Frightened of you for 1 round (repeatable, but immune after 2 successes in a scene). [[Ten]] adds its rank to the save. Unawakened victims who fail by 10+ are Paralyzed 1 round; prolonged deliberate exposure can hospitalize or kill the unprotected ([[Ren]] — and a crime nearly everywhere: [[Society Law and Licenses]]).
- **Failure/Risks:** flaring Ren announces your band to everyone sensing; it *is* the "show me your Ren" gauge.

### Hatsu ("Release") — personal expression
- **Prereq:** Ren I.
- Not an action; a capacity. Hatsu rank gates what your aura can *become*: the Effect Budget of designed abilities ([[Hatsu Design]]), Water Divination potency, and advanced techniques that list it. Trained via category exercises and [[Water Divination]] drills ([[Hatsu Training]]).
- **Ranks:** I — divination-grade expression; may seed a first ability. II — first full ability form; unlocks advanced techniques listing Hatsu II. III — second form / second ability; IV — mature signature ability; V — your Nen answers you like a limb.

---

## Intermediate Techniques

### Gyō ("Focus") — concentration + hunting eyes
- **Prereq:** Ren I.
- **Action:** minor. **Cost:** free (it redistributes aura you're already projecting); *eyes-Gyō* upkeep 5/round.
- **Primary job — concentration.** Gyō moves aura *out of the rest of the body into one region*, and your **Gyō rank sets the transfer %**: I 40% · II 55% · III 70% · IV 85% · V 100%. The full five-step calculation (normal region aura → outside aura → transfer × containment → density) lives in [[Aura Density and Concentration]]. In plain terms: focus your fist and it hits with a large fraction of your whole output; focus your eyes and you see aura that was invisible. The concentrated region gains density (harder Soak if defending, bigger delivered aura if striking); every other region thins.
- **Eyes-Gyō:** concentrate aura into the eyes → see aura and hidden constructs. Contest vs [[In]]: your **PER + Gyō rank** vs their **DEX + In rank** (GM rolls hidden). Reads faint traces (DC 13–20 by age). The *amount* of Gyō needed rises with the In it's fighting — a canon relationship the transfer-% makes literal (higher Gyō rank pulls more aura into the eyes → beats stronger In).
- **Risk:** while eyes-Gyō is up you're reading aura, not the mundane — −2 Perception vs ordinary threats.
- **Failure:** none; a lost contest just shows you nothing (the GM never says "you failed").

### In ("Conceal") — active concealment
- **Prereq:** Zetsu II, Ren II.
- **Action:** woven into whatever it hides. **Cost:** +25% of the concealed effect's aura cost (min 5/round).
- **Effect:** Hide an active aura effect — your Ren state, a Strike wind-up, a conjured object, a trap, an emitted construct. Detection requires eyes-Gyō (or Zetsu III sense, or [[En]] contact) *and* winning the opposed check: **DEX + In rank vs PER + Gyō rank** (concealment is precise aura-control — DEX; detection is noticing — PER).
- **Ranks** raise what can be hidden: I — one small static effect · II — your own combat aura (hide your per-region [[Aura Density and Concentration|distribution]]!) · III — moving constructs/projectiles · IV — multi-part ability assemblies · V — near-total (even En must win the contest to feel it).
- **Counters:** experienced users infer In from *absence* — a fighter showing no aura in circumstances that demand it invites a free Insight check DC 16 to suspect ([[In]] lore).
- **Failure:** if your In check loses by 5+, the observer also reads the hidden effect's rough Power.

### En ("Encircle") — sense sphere
- **Prereq:** Ten II, Ren II.
- **Action:** 1 action to extend. **Cost:** upkeep = **radius in meters per round** (2 m = 2/round … 50 m = 50/round). Sustained use: after (CON mod + 2) minutes continuous, take 1 Strain per additional minute — "extremely tiring" ([[En]]).
- **Radius by rank:** I — 2 m · II — 5 m · III — 10 m · IV — 25 m · V — 50 m. (Beyond 50 m is ability territory: [[Hatsu Design]].)
- **Effect:** within the sphere you feel **shape and movement automatically** — no check against anything unconcealed; blind-fighting inside is free; +2 effective SR for defense vs attackers inside ([[Scale Speed and Magnitude]]); Nen users within are recognized as users. Concealed things contest with In.
- **Risk:** your En brushes people — any Nen user touched by it may passive-sense *you* (it's your aura). En is loud.
- **Failure:** dropping below upkeep collapses the sphere; sudden collapse in view of a user telegraphs your fatigue.

### Shū ("Enfold") — extend to objects
- **Prereq:** Ten II.
- **Action:** minor. **Cost:** the object shares your allocations (no premium).
- **Effect:** one held object counts as a body part: it receives Guard (object Soak + your Guard share; a Shū-wrapped sword doesn't snap against Guard it couldn't cut), and your **Strike** allocation may ride the weapon (weapon dice + Strike effect as damage).
- **Ranks:** I — one handheld object · II — object persists 1 round after leaving your hand (a thrown wrench that still bites) · III — flexible/segmented (chains, whips, cloth) and fired ammunition (full flight) · IV — two objects or one large (a door, a beam) · V — worn armor as second skin, fine tools (a Shū lockpick with feedback).
- **Failure:** if the object leaves your hand beyond your rank's allowance, the aura strips off it immediately.

### Ken ("Fortify") — sustained defense stance
- **Prereq:** Ten II, Ren II.
- **Action:** minor to enter. **Cost:** your Guard allocation, with a **stance discount**: maintaining the same Guard value in consecutive rounds costs only half after the first round.
- **Effect:** whole-body, even coverage — Guard from Ken cannot be "read thin" (immune to the Ryū read-game below). Guard value multiplier: ×1 (I–II), ×1.25 (III–IV), ×1.5 (V). At rank IV you may hold a 2 m tactile mini-[[En]] while in Ken.
- The lore's "Ken ≈ 10 × Ten" emerges naturally: a professional's Ken runs ~10× their Ten shroud ([[Balance and Math]] shows the check).
- **Risk:** honest and boring — Ken outlasts, it never surprises. Against [[Kō]] of similar magnitude, Ken holds ([[Kō]] lore); against much bigger Kō, nothing holds.
- **Failure:** Concentration loss drops you to bare Ten.

### Chū ("Infuse") — density into flesh
- **Prereq:** Zetsu I, Ren II.
- **Action:** minor. **Cost:** the aura you direct inward per round, **internal** — Chū produces no shroud and no glow; it cannot be seen, only its results (inherently concealed without In).
- **Primary job — conversion.** Chū directs aura *inward* (via [[Zetsu]]) and converts its **density** into physical reinforcement. It does not "add aura to your muscles" flatly; it tempers the flesh in proportion to how *dense* the infusion is ([[Aura Density and Concentration]]):
> **attribute bonus = round( k × log₂(1 + density) )**, k = 1 (**k = 2 Enhancers**), capped by rank.
  Density = aura directed into the region ÷ its SU. Whole-body Chū (spread over 100 SU) reinforces evenly but modestly; Chū poured into one limb (or riding a [[Kō]]) tempers that limb enormously — the density table in [[Aura Density and Concentration]] gives the numbers, and Enhancers reach every tier at half the density (their "multiplicative return," [[Chū]]).
- **What it reinforces:** a physical attribute *score* — STR (→ Attack Power), VIT (→ Body durability), AGI/DEX (→ speed, reflex, execution), or the senses (dynamic vision → −1 speed-gap Δ per +2, max −2).
- **Caps by rank** (final bonus): I — +2 · II — +4 · III — +6 *or* +1 [[Scale Speed and Magnitude|SR]] · IV — +8 and +1 SR · V — +10 and +2 SR.
- **Risks:** sustaining Chū beyond CON mod minutes: 1 Strain/minute. Exceeding the rank cap via desperation ([[Progression and Training]], Overreach) injures.
- **Interactions:** with [[Shū]] III+: infuse a weapon (its dice step up one magnitude row). Chū is a component of [[Kō]] (below) and the engine behind "non-Enhancers achieve Mach speeds" — density-fed AGI/SR plus Drive; see [[Combat Core]].

---

## Advanced Techniques

### Kō ("Temper") — total concentration (emergent)
- **Prereq:** Ten II, Zetsu II, Ren III, Gyō II (Shū II if on a weapon), Chū II.
- **Action:** minor to set; lasts until your next turn.
- **Effect — not a multiplier, a sequence.** Kō is [[Ren]] + [[Gyō]] + [[Zetsu]] + [[Ten]] + [[Chū]] run to their limit on **one region** ([[Aura Density and Concentration]] walks the full arithmetic). In order: Ren sets AO → Gyō transfers aura from every other region into the one point → Zetsu suppresses everywhere else, pushing transfer toward 100% → Ten contains it → compute Final Region Aura and Density → Chū converts that density into limb reinforcement.
  - **Offensive Kō:** Attack Power = weapon/unarmed base + Chū-reinforced STR mod + (Final Region Aura × Efficiency × multipliers). With Zetsu+Ten mastered, Final Region Aura ≈ your **entire AO** delivered through one fist — the old "×2 Strike" landed here by accident; this lands here by physics ([[Balance and Math]] confirms the magnitudes match).
  - **Defensive Kō:** that region's Soak = Density × 10. Because all AO sits in ~2.5 SU, density (and thus local Soak) is enormous — which is exactly why defensive Kō turns aside offensive Kō of similar magnitude ([[Kō]] lore), and why the far larger *delivered* number of an offensive Kō still can't punch through it head-on.
- **The price is literal:** every other region sits at Soak 0 (Zetsu suppressed it). A hit anywhere but the Kō point lands on bare Body — "sure to be destroyed" ([[Kō]]).
- **Telegraph:** an observer who wins Insight (PER) vs your aura-control Deception (DEX), or reads flows with eyes-Gyō, learns the Kō region before it lands.
- **Ranks:** I — offensive only, set at turn start · II — defensive use · III — set as part of an attack (no tell until the swing) · IV — hold Kō through a missed strike · V — Kō twice in a round, each fully computed.
- **Failure:** none mechanical; the risk *is* the failure mode. (Low [[Ten]] bleeds power out of it — containment %; low [[Gyō]] can't transfer enough — the sequence rewards the whole toolkit.)

### Ryū ("Flow") — real-time reallocation
- **Prereq:** Gyō III, Ken II, Chū II (Shū optional).
- **Action:** the upgrade is that allocation stops being turn-locked: you may **reallocate as a reaction** (once per round at rank I, twice at III, unlimited at V).
- **Effect:** redistribute your per-region [[Aura Density and Concentration|density]] in any percentages (70% right fist / 30% everywhere, mid-block 80% to the shin about to take the kick), recomputing Soak per region on the fly. Enables the **read game**: when you attack or are attacked, opposed **PER (Insight) + Gyō rank vs DEX (aura-control) + Ryū rank** — the winner learns (or hides) where the aura sits *this instant*. An attacker who reads a thin region targets it (that region's lower density → lower Soak); a defender who reads the strike pre-shifts density there (+2 EVA or meet it at full local Soak).
- **Risk:** slow flows telegraph — if your Ryū rank is 2+ below your opponent's Gyō rank, they read you at advantage ([[Ryū]] lore: movements give away the next move).
- **Failure:** a lost read against a feint (their DEX aura-control) commits your reaction to the wrong limb: the real strike lands on your thinned region.

### Fū ("Enclose") — the boundary
- **Prereq:** En III, Hatsu II.
- **Action:** 1 action. **Cost:** En radius upkeep + a committed **boundary charge** X per round.
- **Effect:** your En becomes a shell: you lose all interior sensing (blind inside!) but the boundary itself becomes a defined Rule of Nen. Anything **crossing** is sensed instantly and precisely regardless of speed (treat your reaction SR as equal to the crosser's, for defense). Foreign Nen crossing inward loses Power: **−X × 0.5 (rank I) / ×0.75 (II) / ×1.0 (III) / ×1.25 (IV) / ×1.5 (V)**; area-of-effect abilities lose **double** that ([[Fū]]: "hard resistance to AoE").
- Effects *originating inside* the boundary are untouched — Fū is a wall, not a dampening field ([[Fū]] lore).
- **Ranks** also govern shaping: III — anchor the boundary to terrain; IV — asymmetric boundaries (dome, corridor); V — persistent boundary sustained at half upkeep.
- **Unique styles:** Conditions can weaponize the boundary (see Benevolent Shrine in [[Canon Benchmarks]]) — that's ability design, priced in [[Hatsu Design]].
- **Failure:** upkeep lapse pops it loudly; everyone inside feels the release.

### Jū ("Reject") — internal nullification
- **Prereq:** Ken II, Chū III, Hatsu II.
- **Action:** 1 action to raise; sustained. **Cost:** committed X per round, all inward.
- **Effect:** contest foreign Nen effects **currently on you** (Manipulation strings, curses, parasitic constructs, debuffs): your rejection power = **X × 0.4 × rank**. If rejection ≥ the effect's committed/stored Power, it's suppressed this round; maintain for 3 consecutive rounds to break it. Because Jū is *general* resistance vs a *specific* ability, you must reach the ability's Power — which typically means committing 2–3× its cost ([[Jū]] and [[Manipulation]] lore: specific beats general unless much stronger).
- **The price:** while Jū is up you have **no external Nen at all** — no Guard from aura, no Strike, no abilities. Armor and friends are what stands between you and harm.
- **Ranks:** raise the multiplier via rank (above) and at IV allow *walking* Jū (move and act mundanely); at V, purge lingering curses over hours instead of days.
- **Failure:** dropping Jū before the third round lets the suppressed effect reassert instantly.

### Yū ("Heal") — forced regeneration
- **Prereq:** Ren III, Hatsu II, Gyō III, Chū III, **Control 4+**.
- **Action:** full concentration, every round; no other Nen use of any kind while channeling ([[Yū]]: "completely vulnerable"). **This is the most aura-hungry technique in the game** ([[Yū]] lore), tuned so it cannot be combat spam:
- **Conversion:** 10 aura → 1 Body HP (surface wounds) · 25 → 1 (internal, organs) · 50 → 1 (regeneration of lost tissue; limbs regrow over daily sessions, total cost = 50 × the limb's HP share).
- **Hard limits:** cannot restore the brain (destruction = death, always); cannot create blood (but Chū can double natural blood recovery with fluids — the lore's water-drinking clause); broken bones must be set first or heal wrong.
- **Injuries** ([[Injury Recovery and Conditions]]) can be bought off at their listed Yū price.
- **Ranks:** I — surface only · II — internal · III — regeneration · IV — treat *others* (double cost) · V — halve all conversion costs.
- **Risks:** channeling in the open is an execution invitation. Botched work (failed INT Medicine check DC 13 for complex repairs) sets the wrong thing at half cost paid.
- **Design note:** costs are set so a professional (AP ~1k) can undo a bad wound with a day's pool, not mid-fight — preserving the lethality of injuries while keeping the lore's promise that Nen medicine exists ([[Balance and Math]]).

---

## Instinctive technique use

Animals, [[Monsters]], and low [[Hollow]]s can hold instinct-grade Principles (Zetsu especially, [[Nen and Nature]]) and rarely one intermediate technique, always rank I–II equivalent, never [[Hatsu]] and never advanced techniques. Stat them with the technique listed and no rank progression — instinct doesn't train.
