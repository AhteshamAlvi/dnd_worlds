# Nen Techniques (Rules)

[[00 Read Me First|Rulebook]] › Aura Engine

The fifteen techniques from the lore ([[Four Major Principles]], [[Intermediate Techniques]], [[Advanced Techniques]]), statted. They are deliberately *not* fifteen ability buttons: some are sustained states (Ten, Zetsu, Ken), some are allocation verbs (Gyō, Kō, Ryū), some are contests (In), some are resource decisions (En, Jū, Yū). The allocation framework they plug into is defined in [[Combat Core]]; the short version:

> Each round, a Nen user may commit up to their **AO** ([[Aura Statistics]]) split among **Strike** (damage), **Guard** (defense), **Drive** (speed), **Focus** (senses), and **Fuel** (abilities). Techniques change *how well* those commitments convert, and what else you can do with them.

**Ranks.** Every technique has ranks I–V (Learned → Mastered). Rank requirements, TP costs, and training times are in [[Nen Growth]]. A technique used under its listed minimum rank for a stunt simply isn't available. Failure consequences are listed per technique; **Strain** is defined in [[Injury Recovery and Conditions]].

**Concentration.** Maintaining any sustained technique while taking Body damage requires a WIL (Concentration) check, DC 10 + (damage taken ÷ 10, max +10). Fail: the state drops at the end of the current action.

---

## The Four Major Principles

### Ten ("Envelop") — sustained shroud
- **Prereq:** Awakened. Learned first, always.
- **Action:** 1 action to raise. **Cost:** none (it re-routes the leak).
- **Effect:** Stops aura leakage (ends the awakening Leak). Grants a standing shroud: **Guard = 1% of max AP** (min 1), refreshing at the start of your turn; Guard Soak = Guard ÷ 10 as usual. Grants +rank to Composure checks against bloodlust and emotional Nen attacks. From rank III, visibly slows aging (lore: [[Ten]]).
- **Ranks:** I — must hold consciously; Concentration checks when damaged; drops in sleep. II — automatic while awake; upkeep-free. III — shroud 1.5% AP; advantage on checks to hold it under pain. IV — persists asleep or unconscious; shroud 2%. V — shroud 2.5%; cannot be stripped short of 0 AP.
- **Calibration note:** the shroud is set at 1% so that a working [[Ken]] (a professional committing near their AO) lands at the lore's "about 10 times higher than Ten" ([[Ken]]) — verified in [[Balance and Math]].
- **Risks/Failure:** none beyond dropping (and with it your baseline defense against emotional attack).
- **Counters:** any Nen-enhanced attack treats the Ten shroud as ordinary Guard — thin. Ten is a raincoat, not armor ([[Ten]]: "not much" against aura-enhanced attacks).

### Zetsu ("Suppress") — sustained state
- **Prereq:** Ten I.
- **Action:** 1 action to enter or exit (rank IV: reaction). **Cost:** none.
- **Effect:** Nodes closed. Your aura presence vanishes: aura-based detection fails entirely; finding you is mundane Perception vs Stealth. Recovery ×3 ([[Aura Statistics]]). Senses sharpen: +2 to Aura Sense checks, and at rank III+ you may contest [[In]] with WIS + Zetsu rank (the lore's "Zetsu can counter In, though not advised").
- **Defenseless:** while in Zetsu you have **no Guard from any source**, take **double damage from Nen-enhanced attacks** (applied to Body), and resist emotional attacks at disadvantage.
- **Ranks:** I — stationary or slow movement only; any aura use breaks it. II — hold while acting mundanely (running, mundane fighting). III — the counter-In sense; hold under stress. IV — enter as a reaction. V — even gaze-detection of you is DC 36; you read as *absent*, not just quiet.
- **Failure:** taking any Body damage forces a Concentration check to hold; a failed entry (under fire, DC 20) wastes the action.
- **Nearby users notice the *disappearance*:** any Nen user within Aura Sense range when you enter Zetsu may make a passive Aura Sense vs DC 10 + your Zetsu rank ×2 to register the sudden absence ([[Zetsu]] lore).

### Ren ("Refine") — output engine
- **Prereq:** Ten I.
- **Action:** 1 action to flare (minor at rank III+). **Cost:** free to hold in combat; out of combat, sustained Ren costs 1% AP/minute.
- **Effect:** Your **AO becomes available** — Ren rank sets Output % (5/8/12/16/20%; [[Aura Statistics]]). While Ren is up you are *visibly* alight to any Nen user (unless [[In]]).
- **Duration cap** (out-of-combat sustained): I — 2 min · II — 10 min · III — 30 min · IV — 2 h · V — all day. (Lore: a month of training per +10 minutes; that's rank progression, [[Ren]].)
- **Bloodlust:** you may tinge Ren with hostility: creatures within 10 m make a Will (Composure) save vs **10 + WIL mod + Ren rank** or become Frightened of you for 1 round (repeatable, but immune after 2 successes in a scene). Unawakened victims who fail by 10+ are Paralyzed 1 round; prolonged deliberate exposure can hospitalize or kill the unprotected ([[Ren]] lore — and a crime nearly everywhere: [[Society Law and Licenses]]).
- **Failure/Risks:** flaring Ren announces your band to everyone sensing; it *is* the "show me your Ren" gauge.

### Hatsu ("Release") — personal expression
- **Prereq:** Ren I.
- Not an action; a capacity. Hatsu rank gates what your aura can *become*: the Effect Budget of designed abilities ([[Hatsu Design]]), Water Divination potency, and advanced techniques that list it. Trained via category exercises and [[Water Divination]] drills ([[Hatsu Training]]).
- **Ranks:** I — divination-grade expression; may seed a first ability. II — first full ability form; unlocks advanced techniques listing Hatsu II. III — second form / second ability; IV — mature signature ability; V — your Nen answers you like a limb.

---

## Intermediate Techniques

### Gyō ("Focus") — allocation verb + hunting eyes
- **Prereq:** Ren I.
- **Action:** minor. **Cost:** free (reallocates committed aura); *eyes-Gyō* upkeep 5/round.
- **Focus a body part:** concentrate your round's Guard or Strike into one location — that location counts allocation ×1.5 (rank I–II), ×2 (III–IV), ×2.5 (V); everywhere else counts half. (Kō is the extreme case and supersedes.)
- **Eyes:** see aura and hidden constructs. Contested vs [[In]]: your WIS + Gyō rank vs their WIL + In rank (GM rolls hidden). Also reads faint traces (DC 13–20 by age).
- **Risk:** while eyes-Gyō is up you're reading aura, not the mundane — −2 Perception vs ordinary threats.
- **Failure:** none; a lost contest just shows you nothing (the GM never says "you failed").

### In ("Conceal") — active concealment
- **Prereq:** Zetsu II, Ren II.
- **Action:** woven into whatever it hides. **Cost:** +25% of the concealed effect's aura cost (min 5/round).
- **Effect:** Hide an active aura effect — your Ren state, a Strike wind-up, a conjured object, a trap, an emitted construct. Detection requires eyes-Gyō (or Zetsu III sense, or [[En]] contact) *and* winning the opposed check: **WIL + In rank vs WIS + Gyō rank**.
- **Ranks** raise what can be hidden: I — one small static effect · II — your own combat aura (hide your Strike allocations!) · III — moving constructs/projectiles · IV — multi-part ability assemblies · V — near-total (even En must win the contest to feel it).
- **Counters:** experienced users infer In from *absence* — a fighter showing no aura in circumstances that demand it invites a free Insight check DC 16 to suspect ([[In]] lore).
- **Failure:** if your In check loses by 5+, the observer also reads the hidden effect's rough Power.

### En ("Encircle") — sense sphere
- **Prereq:** Ten II, Ren II.
- **Action:** 1 action to extend. **Cost:** upkeep = **radius in meters per round** (2 m = 2/round … 50 m = 50/round). Sustained use: after (WIL mod + 2) minutes continuous, take 1 Strain per additional minute — "extremely tiring" ([[En]]).
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

### Chū ("Infuse") — internal reinforcement
- **Prereq:** Zetsu I, Ren II.
- **Action:** minor. **Cost:** upkeep per round, **internal** — Chū produces no shroud and no glow; it cannot be seen, only its results (inherently concealed without In).
- **Effect:** commit X/round to boost the *body*: **+2 to one physical attribute score per 10 aura** (STR, AGI, DEX, VIT, CON — affects mods, Body-derived values, checks; not Body HP retroactively). **Enhancers pay half** (their "multiplicative return," [[Chū]]).
- **Caps by rank** (total boost): I — +2 · II — +4 · III — +6 *or* +1 [[Scale Speed and Magnitude|SR]] · IV — +8 and +1 SR · V — +10 and +2 SR.
- **Senses:** may boost WIS-perception the same way (Gyō-in-the-eyes for *dynamic vision*: each +2 WIS via Chū also reduces speed-gap Δ by 1 for reaction purposes, max −2).
- **Risks:** sustaining Chū beyond CON mod minutes: 1 Strain/minute. Exceeding rank cap via desperation ([[Progression and Training]], Overreach) injures.
- **Interactions:** with [[Shū]] III+: infuse a weapon — its dice step up one magnitude row. With Kō/Ryū as below. This is the technique that turns "non-Enhancers achieve Mach speeds" from lore into rules — Drive + Chū SR stacking; see [[Combat Core]].

---

## Advanced Techniques

### Kō ("Temper") — everything, one point
- **Prereq:** Ten II, Zetsu II, Ren III, Gyō II (Shū II if on a weapon).
- **Action:** minor to set; lasts until your next turn.
- **Effect:** ALL aura committed this round goes to **one body part or weapon**. Offensive: your Strike there counts **×2 effect** (damage = weapon + 2 × Strike × Efficiency). Defensive: Guard concentrates — that part's Soak = Guard ÷ 5 instead of ÷ 10.
- **The price:** everywhere else, Guard 0, Soak from armor only, Body exposed. Getting hit anywhere but the Kō point while in Kō is how Nen users die ([[Kō]] lore: "sure to be destroyed").
- **Telegraph:** an observer who wins an Insight vs your Deception (or reads flows with Gyō eyes) learns the Kō location before it lands.
- **Ranks:** I — offensive only, set at turn start · II — defensive use · III — set as part of an attack (no tell until the swing) · IV — hold Kō through a missed strike · V — Kō twice in a round (two attacks or attack + block), each at full price.
- **Failure:** none mechanical; the risk *is* the failure mode.

### Ryū ("Flow") — real-time reallocation
- **Prereq:** Gyō III, Ken II, Chū II (Shū optional).
- **Action:** the upgrade is that allocation stops being turn-locked: you may **reallocate as a reaction** (once per round at rank I, twice at III, unlimited at V).
- **Effect:** split allocations by body part in any percentages (70% right fist / 30% everywhere, mid-block 80% to the shin that's about to take the kick). Enables the **read game**: when you attack or are attacked, opposed WIS (Insight, + Gyō rank) vs WIL (Deception, + Ryū rank) — the winner learns (or hides) where the aura sits *this instant*. An attacker who reads a thin part targets it: that location counts half Guard. A defender who reads the strike pre-allocates: +2 EVA or meet it at full local Guard.
- **Risk:** slow flows telegraph — if your Ryū rank is 2+ below your opponent's Gyō rank, they read you at advantage ([[Ryū]] lore: movements give away the next move).
- **Failure:** a lost read against a feint (their Deception) commits your reaction to the wrong limb: the real strike hits your *half-Guard* value.

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
