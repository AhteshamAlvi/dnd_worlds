# Nenworld — Read Me First (GM)

[[World Building]] › Rulebook

**Nenworld** is a standalone tabletop RPG built on this vault's lore. It uses a d20 core that D&D players will recognize on contact — checks, DCs, advantage, proficiency — bolted to a custom **Aura Engine** that models [[Nen]] the way the lore describes it: a trained, allocated, personal resource governed by [[Conditions]], [[Vows and Limitations|Vows]], and growth earned in play.

This entire Rulebook is **GM material**. Players are meant to discover the world, the races, the map, and the power system through play. Reveal files (or excerpts) as the fiction earns them — a reveal guide is at the bottom of this page.

## The six design commitments

Every rule in this book follows from six decisions (made with the setting's author). When you have to improvise a ruling, improvise in the direction of these:

1. **Everyone starts as fodder.** Player characters begin with no Nen, no abilities, and no fruit powers — ordinary people of their race, with skills and gear justified by backstory. Awakening, the [[Four Major Principles]], divination, and a first [[Hatsu]] are *play*, not character creation. Target pace: a functioning Nen user by the end of the first arc (roughly 4–8 sessions).
2. **The numbers are real.** Power differences are orders of magnitude, not tier labels. A party dealing 30 damage cannot hurt a being with Soak 400 — at all. The correct response to something vastly stronger is escape, concealment, negotiation, or survival. Tier names exist in this book only as descriptive bands and encounter warnings; they never override the math.
3. **Accuracy stays small; magnitude lives elsewhere.** d20 rolls and their modifiers stay bounded forever (roughly −2 to +14). Orders of magnitude are carried by damage multipliers (6d10 ×100), Guard and Soak values, Body HP, Speed Ratings, and aura pools written in k/M notation — never by +50 to hit.
4. **Body and aura are separate.** Living durability (**Body HP**, small numbers for humans) is distinct from aura protection (**Guard**, which scales into the thousands). Attacks resolve in three distinct steps: **accuracy → penetration → damage**. Attacks too weak to penetrate do nothing; there is no chip-damage path to killing something overwhelmingly stronger.
5. **Growth is grown, not granted.** Progression uses Training Points earned per session and in play — but *spending* them always requires an in-fiction justification: training time, a teacher, a breakthrough, or the Do → Notice → Propose → Justify loop from [[Developing a Nen Ability]]. Aura quantity itself grows from actual training time, not points. There are no levels.
6. **Model first; automation executes.** Nenworld is built to be played through a FoundryVTT module that resolves the math, so **computational depth is never traded away for hand-arithmetic convenience.** Where a more accurate, more consistent, more simulation-true mechanic exists — surface-area [[Aura Density and Concentration|aura density]], VIT-scaled regeneration, log-curve [[Nen Techniques (Rules)|Chū]] — this book uses it, and provides a lookup table or rounded shortcut for bare-table play rather than dumbing the mechanic down. Deep at build/level/GM-prep time; simple in the moment because the tool (or a table) carries the load.

**Attribute spine (finalized):** ten attributes, each owning one job — **STR** power (never accuracy), **AGI** move/Evasion, **DEX** all accuracy + precise aura work, **CON** aura pool + stamina, **VIT** Body HP + aura regeneration, **INT** learned knowledge, **WIS** Nen understanding, **PER** noticing + Initiative, **CHA** social, **SPI** Nen manifestation only. (There is no Willpower; [[Attributes and Skills]] explains where its jobs went.)

## What is lore and what is design

The lore pages in [[Nen]], [[Race]], and [[Power System]] are canon and are **never overridden** by this book. Where this book quantifies something the lore left qualitative (how much aura a novice has, what [[Ken]]'s "10 times" means in play, what a [[Vows and Limitations|Vow]] is worth), the rule is a **system-design addition** and the chapter says so, with the reasoning. Where the lore gives numbers ([[Types of Nen|the 100/80/60/40 affinities]], [[En]]'s 2 m minimum and 50 m mastery, Ken ≈ 10× Ten), the rules reproduce them exactly.

Known source anomalies (flagged, not fixed — the vault files were left untouched):
- [[Sein]]'s character file contains a copy of [[Gojo Satoru]]'s Limitless writeup (paste artifact).
- The Blessed Spirits section of [[Spirits]] contains a sentence about Cursed Spirits (paste artifact).
- [[Asta]] is listed as a Mutation "lacks all Nen" *and* as a Specialist with an ability. This book reads that as intended: his mutation *is* the ability (see [[Canon Benchmarks]]).

## Reading order (GM)

1. [[Core Resolution]] — dice, checks, DCs, advantage, degrees, secret rolls.
2. [[Attributes and Skills]] — the 10-attribute array and skill list.
3. [[Scale Speed and Magnitude]] — k/M notation, magnitude dice, Speed Ratings, Scale Factor, and the penetration philosophy. **Read this before the combat chapter or nothing will look right.**
4. [[Aura Statistics]] → [[Aura Density and Concentration]] — the seven aura quantities (pool from CON, regen from VIT, output from Ren) and the surface-area density engine under Gyō/Kō/Chū. **Read the density chapter before the techniques.**
5. [[Awakening and the Path]] → [[Nen Techniques (Rules)]] → [[Types and Affinity (Rules)]] → [[Nen Manifestation]] — how PCs become Nen users, what the fifteen techniques do, and the one thing SPI does (make new Nen *hold*).
6. [[Conditions Vows and Risk (Rules)]] → [[Hatsu Design]] → [[Hatsu Library]] — the power economy and ability construction.
7. [[Combat Core]] → [[Injury Recovery and Conditions]] — fighting, allocation, dying.
8. [[Character Creation]] → [[Sample Characters]] — making the fodder.
9. [[Progression and Training]] — TP, aura growth, training programs.
10. [[Race Rules Overview]] and its two companion files — playable races.
11. [[The World of Sorane]] → [[Society Law and Licenses]] → [[Campaign Frameworks]] — the map and what to run on it.
12. [[Running the Game]] → [[NPCs Creatures and Encounters]] → [[Canon Benchmarks]] — GM craft and calibration.
13. [[Balance and Math]] — the verification appendix: why the numbers hold up, and the failure modes that were designed out.

Reference: [[Glossary and Quick Reference]] · [[Character Sheet]] · [[Devils Fruits (Rules)]] · [[Social Exploration and Investigation]]

## Suggested reveal order for players

Players start knowing only what an ordinary citizen knows (see [[Society Law and Licenses]] for exactly what that is). A workable reveal sequence:

| When | Reveal |
|---|---|
| Session 0 | [[Core Resolution]] basics, [[Attributes and Skills]], [[Character Creation]], their region of [[The World of Sorane]] only |
| First brush with Nen | The public-knowledge primer section of [[Awakening and the Path]] |
| Awakening | [[Aura Statistics]] (their own numbers only), Ten/Zetsu entries of [[Nen Techniques (Rules)]] |
| Learning Gyō/Kō | [[Aura Density and Concentration]] — the surface-area engine, once they concentrate aura for real |
| Training montage | Remaining [[Four Major Principles]] entries; [[Progression and Training]] player-facing tables |
| Water Divination | Their own column of [[Types and Affinity (Rules)]] |
| First Hatsu attempt | [[Conditions Vows and Risk (Rules)]], [[Hatsu Design]], [[Nen Manifestation]] (the SPI roll that seats it) |
| As encountered | Race entries, factions, map regions, everything else |

Nothing else should be assumed known. A player whose character has never seen [[En]] should learn what En does the hard way.
