# Combat Core

[[00 Read Me First|Rulebook]] › Combat

Rounds are **6 seconds**. Distances are meters. The heart of Nen combat is the **Allocation** step — the lore's aura war ([[Ryū]], [[Kō]], [[Ken]]) made into the turn's central decision. Everything else will feel like D&D on purpose.

## Initiative and surprise

- **Initiative:** d20 + **PER** mod, once per combat — reacting first is *noticing* first, PER's job ([[Attributes and Skills]]). Ties: higher PER.
- **Speed override:** anyone with SR 3+ above an opponent acts before them regardless of the roll ([[Scale Speed and Magnitude]]).
- **Surprise:** attackers unseen and unsensed (Stealth vs Perception; [[Zetsu]]/[[In]] vs Aura Sense/[[Gyō]] for the aura layer) get one **surprise round**. The surprised are *flat-footed*: no reactions, no Allocation — their only Guard is a standing [[Ten]] shroud (rank II+). This is why assassination works in this world, and why masters sleep in Ten IV.

## Your turn

| Piece | You get | Examples |
|---|---|---|
| **Allocation** | Free, at turn start | Commit up to AO into Strike / Guard / Drive / Focus / Fuel |
| **Action** | 1 | Attack (with your attack routine), use an ability, raise [[En]], enter [[Zetsu]], Dash (double move), disengage, aid, stabilize |
| **Move** | 1 | Up to combat move for your SR |
| **Minor** | 1 | Enter [[Ken]]/[[Nen Techniques (Rules)|Kō]]/[[Gyō]] focus, draw/sheathe, shout a sentence, drop prone |
| **Reaction** | 1/round | Dodge (+2 EVA vs one attack you can perceive), Block (move your Guard: treat one location as full-Guard), [[Ryū]] reallocation, readied action, counter (below) |

Allocation has **two axes**: *how much* AO goes to each purpose, and *where on the body* it sits. The first is the familiar lane split; the second is the [[Aura Density and Concentration|density]] layer that decides Soak and concentrated Power.

**Axis 1 — purpose.** At turn start, split up to your **AO** among:

- **Strike** — offense: aura carried into your attacking region. Delivered as damage = (region aura × Efficiency × multipliers) ([[Aura Statistics]]).
- **Guard** — defense: aura spread as a protective layer. **Whole-body Soak = Guard ÷ 10** (this is the density formula for even spread — [[Aura Density and Concentration]]); damage depletes Guard before Body. Refreshes each turn; [[Nen Techniques (Rules)|Ken]] discounts sustained Guard.
- **Drive** — speed: +1 SR for 10/round; each further +1 doubles (20, 40, 80…). Max steps: **1**, +1 at Ren III, + [[Nen Techniques (Rules)|Chū]] SR on top.
- **Focus** — senses: eyes-[[Gyō]] (5/round), [[En]] (radius/round), Chū-sense boosts.
- **Fuel** — abilities ([[Hatsu Design]]) and technique charges (Fū boundary, Jū rejection).

**Axis 2 — location.** Your Strike and Guard aura also has a *distribution* across your body ([[Aura Density and Concentration]]):
- **Even** (default / [[Nen Techniques (Rules)|Ken]]): Guard spread over 100 SU → uniform Soak = Guard ÷ 10, no thin spot to exploit.
- **Concentrated** ([[Gyō]]/[[Kō]]): aura pulled into one region → that region's density (and Soak, and delivered Power) spikes; everywhere else thins.
- **Weighted** ([[Ryū]]): any split, recomputed per region.
At the table you only compute the regions in play (your striking limb, the limb that gets hit). The module computes all of them. **Most fighters below Ren II fight "even" and never touch Axis 2** — concentration is a learned toolkit.

**Committed aura is spent** (× Control — it's flowing out of you; that's what [[Ren]] *is*). Unspent AO doesn't bank. Novices commit small; that's realism, not punishment.

**Default for the unpracticed:** until Ren II, one crude thing per round — all Strike *or* all Guard, even distribution. [[Gyō]] I unlocks concentration; Ren II unlocks splitting purposes; [[Ryū]] unlocks *reshaping* mid-round.

## Attacks: accuracy → penetration → damage

**1 · Accuracy.** Roll d20 + DEX modifier + the relevant combat proficiency (Martial Arts, Weapons, or Marksmanship) against **Evasion = 10 + AGI modifier (+2 shield/style, +2 Dodge reaction)**. DEX represents attack placement, timing, aim, and weapon control. STR does not normally increase accuracy; it contributes to melee Attack Power and governs grapples, shoves, heavy-weapon requirements, and overpowering maneuvers. Abilities use the attribute specified by the ability plus Hatsu proficiency. Speed-gap modifiers from [[Scale Speed and Magnitude]] (±2 at Δ2; auto-hit at Δ5+).

**2 · Penetration.** Attack **Power** (see below) vs the target's **Soak in the struck region** = (region density × 10) + armor + natural (×SF), where region density comes from how they've distributed Guard ([[Aura Density and Concentration]]; even spread = Guard ÷ 10). **If Power ≤ Soak: the hit does nothing** — narrate the bounce; don't roll damage. (Pre-check this against monsters; it saves table time and teaches dread.)

**3 · Damage.** Roll the magnitude dice for the attack's Power ([[Scale Speed and Magnitude]]), subtract Soak, deplete the struck region's **Guard first**, overflow to **Body HP**.

> **Attack Power** = weapon average + **STR mod** (melee, Chū-reinforced if any) + (**Final Region Aura** × Efficiency × vow/boost multipliers). Final Region Aura is your Strike aura after [[Aura Density and Concentration|concentration]] — for an even swing it's just your Strike allocation; for a [[Nen Techniques (Rules)|Kō]] it's nearly your whole AO in one fist. **STR sets how hard the hit is; DEX (step 1) set whether it landed** — they never mix. When in doubt whether it penetrates, compare averages; when rolling, roll the dice.

**Weapons (baseline dice):** unarmed 1d4 · knife 1d6 · sword/axe/spear 1d10 · greatweapon 2d8 · pistol 2d8 · rifle 3d10 · anti-materiel 2d10×10. A Nen user's Strike outgrows these fast — by professional band the weapon is a *shape* for aura ([[Nen Techniques (Rules)|Shū]]), not the damage source. That's canonical: fists exceed missiles ([[Progression and Training]]).

**Multiple attacks:** Martial/Weapons Expert = 2 per Action, Master = 3, Legendary = 4; +1 vs targets 2+ SR slower (cap 5 total). Split Strike among them before rolling.

## The read game (the Nen duel)

Between capable users, combat is information warfare over allocation ([[Ryū]]):

- **Read** (minor action, or free with eyes-Gyō): opposed **PER (Insight) + Gyō rank vs DEX (aura-control) + Ryū rank** — noticing their distribution vs their control in hiding it. Win: learn where their aura sits *right now* ([[Aura Density and Concentration|which regions are dense, which are thin]], or that a Kō is winding up — one fact per read).
- **Exploit:** attacking a read-thin region: its lower density means **lower Soak** — sometimes the difference between bouncing and penetrating. Defending a read strike: **+2 EVA** or pre-shift density to meet it at full local Soak.
- **Feint** (minor): project a false distribution — if your DEX (aura-control) wins, their next Reaction commits to the wrong region ([[Ryū]]'s failure clause).
- **Counter** (reaction; requires Martial Expert+ and a successful read this round): after the enemy misses you, make one attack at your full remaining Strike.

This loop — read, feint, reallocate, exploit — is where the lore's aura chess lives. GMs: NPCs below professional band don't play it (they just swing); masters play it every round.

## Movement and the battlefield

- **Combat move by SR** ([[Scale Speed and Magnitude]]): SR 2 = 30 m … SR 7 = 1 km. At SR 6+, run zones (rooftop, street, plaza) instead of squares.
- **Cover:** +2 EVA (partial) / +5 (heavy); cover has Soak & HP ([[Scale Speed and Magnitude]] objects table) and attacks that beat it keep going (subtract cover Soak from Power, once).
- **Terrain interaction is expected at magnitude:** a P 300 miss demolishes the wall behind ([[Running the Game]] for collateral guidance and why cities fear elite duels).
- **Disengage:** Action, or free if 3+ SR faster.

## Grappling

Opposed **STR Grappling** (attacker) vs **STR Grappling or AGI Acrobatics** (defender). Win: target Grappled (no move; −2 attacks); win by 5+: Restrained (no move, no reactions, attacks vs them at advantage). Escape: action, win the reverse contest. **Scale rule:** a grappler 2+ SF steps larger auto-wins unless the smaller side commits Strike ≥ the larger's STR score as leverage-aura — aura equalizes meat, which is how a Fairy suplexes an Orckin.

## Sustaining techniques under fire

Any Body damage (post-Guard) while maintaining sustained techniques → **CON (Endurance) check** DC 10 + damage÷10 (max +10) — holding aura together while hurt is stamina, not a lost willpower stat. One check covers all held techniques. Fail: they drop at your action's end. [[Nen Techniques (Rules)|Ten]] rank III+ protects itself.

## Nonlethal, called shots, executions

- **Nonlethal:** declare before the roll; a target dropped to 0 Body is unconscious-stable instead of Dying.
- **Called shots:** −5 accuracy for a location; against read-thin or Kō-naked locations that's how giants die. Effects via injuries ([[Injury Recovery and Conditions]]), not bonus damage.
- **Helpless targets** (unconscious, fully restrained *and* unaware): coup de grâce — automatic hit, max dice; if Power beats Soak, target goes straight to Dying with 2 failed saves (or dies, GM's call for NPCs). The only true insta-kill in the game, and it requires *helpless*, per the design brief.

## Worked round (professional duel)

Darun (AP 1.1k, AO 130, Control ×1.4, **DEX 12 (+1)**, STR 14 (+2), Weapons Expert +4, Transmuter, Ten III, Gyō III, Zetsu II, Chū II, Ken II) vs a Coachman puppet (Guard 300 even, Soak 30, attack P 90). Transmuter using raw force runs at adjacent-Enhancement 80%.

*Round 1 — even stance.* Allocation 60 Guard (even → whole-body Soak 6) + 60 Strike (into the sword arm) + 10 eyes-Gyō = 130 AO ✓ (pool ~180).
His attack: sword 1d10 (5.5) + **2 (STR — power only)** + 60 Strike × 0.8 = P ~55. **Penetration: 55 > Soak 30 ✓.** *Accuracy:* d20 **+ 1 (DEX) + 4 (Weapons)** vs EVA 12 — DEX decides the landing, STR was never in the accuracy math. Hits, damage 1d10×10 (P 55 row) = 40 − 30 Soak = **10** into puppet Guard. He's chipping — wrong tool.

*Round 2 — Kō, after a Read.* His PER (Insight) + Gyō III beats the puppet's control: its Guard is even, no thin spot, but also no surprise coming. He commits to [[Nen Techniques (Rules)|Kō]] — the full sequence ([[Aura Density and Concentration]]): Ren gives AO 130 → Gyō III + Zetsu drive ~100% of it into his fist → Ten III contains 94% → **Final fist aura ≈ 122, density ≈ 49**. Chū II reads that density → **+4 STR** (capped). 
Attack Power = 5.5 (blade) + 4 (Chū-STR) + 122 × 0.8 = **P ~107.** Penetration 107 > 30 ✓; damage 2d10×10 (P 107 row) ≈ 100 − 30 = **70** into puppet Guard — nearly 3× the even swing, from the *same* 130 AO, just concentrated. **The price:** every region but that fist is Soak 0 — if the puppet's P 90 counter lands anywhere else, it hits bare Body.
*The lesson players learn:* DEX lands it, STR and concentration make it hurt, density decides *whether* it penetrates, reads decide *where*, and Kō's power buys itself with your own safety.
