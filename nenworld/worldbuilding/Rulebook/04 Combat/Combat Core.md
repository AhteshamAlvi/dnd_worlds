# Combat Core

[[00 Read Me First|Rulebook]] › Combat

Rounds are **6 seconds**. Distances are meters. The heart of Nen combat is the **Allocation** step — the lore's aura war ([[Ryū]], [[Kō]], [[Ken]]) made into the turn's central decision. Everything else will feel like D&D on purpose.

## Initiative and surprise

- **Initiative:** d20 + AGI mod, once per combat. Ties: higher AGI.
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

## Allocation

At the start of your turn, split any amount up to your **AO** among:

- **Strike** — adds damage to your attacks this round: split freely among your attacks; each point adds ×Efficiency damage ([[Aura Statistics]]).
- **Guard** — your defensive pool this round: **Guard Soak = Guard ÷ 10**; damage depletes Guard before Body ([[Injury Recovery and Conditions]]). Refreshes (re-buys) each turn; [[Nen Techniques (Rules)|Ken]] discounts sustained Guard.
- **Drive** — speed: +1 SR for 10/round; each further +1 doubles the cost (20, 40, 80…). Max Drive steps: **1**, +1 more at Ren III, +[[Nen Techniques (Rules)|Chū]]'s SR bonuses on top.
- **Focus** — senses: eyes-Gyō (5/round), En (radius/round), Chū-sense boosts.
- **Fuel** — abilities ([[Hatsu Design]]) and technique charges (Fū boundary, Jū rejection).

**Committed aura is spent** (deducted at your Control multiplier — it's flowing out of you; that's what [[Ren]] *is*). Unspent AO doesn't bank. Novices should commit small; that's realism, not punishment.

**Default for the unpracticed:** until Ren II, a user can only do one crude thing per round with aura — all Strike *or* all Guard (no split). [[Gyō]] I unlocks focusing; Ren II unlocks true splits; Ryū unlocks *changing* mid-round.

## Attacks: accuracy → penetration → damage

**1 · Accuracy.** d20 + attribute mod (STR heavy melee / DEX light-or-ranged) + proficiency (Martial Arts / Weapons / Marksmanship; abilities use Hatsu rank) **vs Evasion = 10 + AGI mod (+2 shield/style, +2 Dodge reaction)**. Speed-gap modifiers from [[Scale Speed and Magnitude]] (±2 at Δ2; auto-hit at Δ5+).

**2 · Penetration.** Attack **Power** (see below) vs target's **total Soak = Guard÷10 + armor + natural (×SF)**. **If Power ≤ Soak: the hit does nothing** — narrate the bounce; don't roll damage. (Pre-check this before rolling accuracy against monsters; it saves table time and teaches dread.)

**3 · Damage.** Roll the magnitude dice for the attack's Power ([[Scale Speed and Magnitude]]), subtract Soak, deplete **Guard pool first**, overflow to **Body HP**.

> **Attack Power** = weapon average + STR mod (melee) + (Strike aura × Efficiency × any multipliers). Kō doubles the Strike term. When in doubt whether it penetrates, compare the *average*; when rolling, roll the dice.

**Weapons (baseline dice):** unarmed 1d4 · knife 1d6 · sword/axe/spear 1d10 · greatweapon 2d8 · pistol 2d8 · rifle 3d10 · anti-materiel 2d10×10. A Nen user's Strike outgrows these fast — by professional band the weapon is a *shape* for aura ([[Nen Techniques (Rules)|Shū]]), not the damage source. That's canonical: fists exceed missiles ([[Progression and Training]]).

**Multiple attacks:** Martial/Weapons Expert = 2 per Action, Master = 3, Legendary = 4; +1 vs targets 2+ SR slower (cap 5 total). Split Strike among them before rolling.

## The read game (the Nen duel)

Between capable users, combat is information warfare over allocation ([[Ryū]]):

- **Read** (minor action, or free with eyes-Gyō): opposed **WIS Insight + Gyō rank vs WIL Deception + Ryū rank**. Win: learn where their aura sits *right now* (Guard split, Strike load, or that a Kō is coming — one fact per read).
- **Exploit:** attacking a read-thin location: that location counts **half Guard**. Defending a read strike: **+2 EVA** or meet it at full local Guard (your choice).
- **Feint** (minor): offer a false read — if your Deception wins, their next Reaction is committed wrong (Ryū's failure clause).
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

Any Body damage (post-Guard) while maintaining sustained techniques → **WIL Concentration** DC 10 + damage÷10 (max +10), one check covers all held techniques. Fail: they drop at your action's end. [[Nen Techniques (Rules)|Ten]] rank III+ protects itself.

## Nonlethal, called shots, executions

- **Nonlethal:** declare before the roll; a target dropped to 0 Body is unconscious-stable instead of Dying.
- **Called shots:** −5 accuracy for a location; against read-thin or Kō-naked locations that's how giants die. Effects via injuries ([[Injury Recovery and Conditions]]), not bonus damage.
- **Helpless targets** (unconscious, fully restrained *and* unaware): coup de grâce — automatic hit, max dice; if Power beats Soak, target goes straight to Dying with 2 failed saves (or dies, GM's call for NPCs). The only true insta-kill in the game, and it requires *helpless*, per the design brief.

## Worked round (professional duel)

Darun (AP 1.1k, AO 130, Control ×1.4, Transmuter, Ken II, Gyō II) vs a Coachman puppet (Guard 300 flat, Soak 30, attack P 90).

*Allocation:* Darun commits 60 Guard (Ken stance, round 2+ costs 30) + 60 Strike + 10 eyes-Gyō = 130 AO ✓, pool cost ~180 round one.
*His attack:* sword 1d10 + 2 (STR) + 60 Strike × 0.8 (TRA using raw force = adjacent ENH) = P ~55 average. **Penetration check: 55 > Soak 30 ✓.** Hits (d20+2+4 vs EVA 12), rolls 1d10×10 (P 55 row) = 40 → −30 Soak = 10 into puppet Guard. He's chipping — wrong tool.
*Round two, after a Read* (his Insight+Gyō 2 wins): the puppet's Guard sits forward — he flanks (thin side counts 150 Guard, Soak 15), switches allocation to 100 Strike + 30 Ken: P ~95, damage roll 80 −15 = 65 into thin Guard. Now it's a fight.
*The lesson players learn:* penetration math decides *whether* you can win; reads decide *how fast*; pool economy decides *if you can afford to*.
