# Core Resolution

[[00 Read Me First|Rulebook]] › Core Rules

Nenworld resolves uncertainty with a **d20 check**. Everything a D&D player knows about rolling high still applies. What's different is the division of labor: the d20 decides *whether* something works; **magnitude** (see [[Scale Speed and Magnitude]]) decides *how hard it hits*. The d20's modifiers stay small forever.

## The basic check

> **d20 + attribute modifier + proficiency bonus vs DC**

- **Attribute modifier** — from one of the ten attributes ([[Attributes and Skills]]). Human range roughly −2 to +5; hard ceiling in practice +10 (attribute 30, reachable only by extreme races and decades of Nen reinforcement).
- **Proficiency bonus** — from a skill or technique rank: Untrained +0, Trained +2, Expert +4, Master +6, Legendary +8. Bought with Training Points ([[Progression and Training]]).
- Situational modifiers should be handled with **advantage/disadvantage**, not stacking +1s. If you're tempted to add a third numeric modifier, use advantage instead.

**Design note.** Modifiers are bounded (max ≈ +18 for a legendary master with attribute 30) because power in this game is expressed through Guard, damage magnitude, and Speed Rating — a Vasto Lorde doesn't hit *more accurately* than a boxer by +50; it hits with force no boxer can survive or stop. This is a system-design decision that implements the lore's insistence that skill and raw power are different things ([[Nen at the Table]]).

## Difficulty Classes

| DC | Band | Physical example | Nen example |
|---|---|---|---|
| 5 | Trivial | Climb a ladder | Feel your own aura after awakening |
| 8 | Easy | Hit a stationary target | Hold [[Ten]] while walking (novice) |
| 10 | Routine | Pick a cheap lock | Maintain [[Ren]] while jogging |
| 13 | Moderate | Scale a wall with gear | Notice a clumsy [[In]] with [[Gyō]] |
| 16 | Hard | Leap between rooftops | Hold [[Ten]] while in severe pain |
| 20 | Very hard | Free-climb wet cliff | First [[Zetsu]] under fire |
| 24 | Heroic | Catch a thrown knife | Read an opponent's allocation mid-[[Ryū]] |
| 28 | Legendary | Olympic feat under fire | Pierce a master's [[In]] |
| 32 | Mythic | Beyond unaided humans | Detect a Zetsu-hidden master by gaze alone |
| 36–40 | "Impossible" | — | Feats the world will retell for a century |

**Setting DCs:** default to 13. Ask "could a trained professional do this reliably?" — yes: 10–13; only the gifted: 16–20; only the world's best: 24–28; storybook: 32+. Never set a DC above 28 for something the plot requires to happen.

## Opposed checks

Both sides roll their check; **higher total wins, defender wins ties.** Used for: stealth vs perception, [[In]] vs [[Gyō]], deception vs insight, grappling, chase legs. When one side is *passive* (not actively contesting), use their **passive score = 10 + modifiers** as the DC instead of rolling.

## Degrees of success

Margins matter at the table only when the rule or GM says they do; when they do:

- **Beat DC by 5+** — strong success: extra information, faster, quieter, or +1 effect step.
- **Beat DC by 10+** — exceptional: the best plausible version of the outcome.
- **Miss by 1–4** — near miss: fail forward — succeed at a cost, or fail with a visible reason you could fix.
- **Miss by 5+** — clean failure, and the situation moves against you.

## Criticals

- **Natural 20** — the check succeeds if success was possible at all, and counts as beating the DC by 5 more than it did. On attacks: maximize the damage dice before applying the multiplier (see [[Scale Speed and Magnitude]]). A nat 20 never lets you do something whose magnitude you lack — you cannot crit through Soak you can't penetrate.
- **Natural 1** — the check fails if failure was possible, and the GM may add a complication. On attacks: a miss that grants the enemy your openings (they learn one fact about your allocation or ability).

## Advantage and disadvantage

Exactly as in D&D: roll 2d20, take the higher (advantage) or lower (disadvantage). They don't stack; one source of each cancels. Standing sources in Nenworld:

| Situation | Effect |
|---|---|
| Attacking a foe who can't perceive you ([[In]], [[Zetsu]], stealth) | Advantage |
| Attacking with a body part the enemy read via [[Gyō]]/[[Ryū]] read | They defend with advantage-equivalent (+2 EVA) |
| Speed Rating 2+ above opponent | Advantage on attack or +2 EVA (see [[Scale Speed and Magnitude]]) |
| Acting while Exhausted (0 aura) | Disadvantage on everything |
| Maintaining a technique while taking Body damage | Concentration check or lose it ([[Nen Techniques (Rules)]]) |
| Emotional resonance with a Vow or ability theme | Advantage (GM call, reward sincerity) |

## Passive scores and secret rolls

Two scores are always "on":

- **Passive Perception** = 10 + PER mod + Perception proficiency.
- **Passive Aura Sense** = 10 + PER mod + Aura Sense proficiency (only for the awakened; see [[Aura Statistics]]). *(Both are PER now — sensing is noticing; [[Attributes and Skills]].)*

**The GM rolls secretly** whenever the *result would leak information the character can't have*: detecting [[In]], noticing a tail, insight against a good liar, Water Divination quirks, whether a Vow's sincerity held, anything about an enemy's remaining aura. Players roll everything else, including their own death saves — dying in the open is a rule of this game (see [[Injury Recovery and Conditions]]).

**When not to roll:** if failure is boring and success is certain given time, don't roll — spend time. If both outcomes are the same, don't roll. If the character's magnitude settles it (Soak 400 vs a knife), never roll — narrate. Rolling is for stakes + uncertainty + consequence, nothing else. See [[Running the Game]].

## Adjudicating uncertain Nen interactions

When two Nen effects collide and no rule covers it (it will happen weekly — the lore promises novel abilities):

1. **Magnitude first.** Compare aura committed × efficiency on each side. A 10× disparity isn't a contest; narrate it.
2. **Specificity beats generality** at similar magnitude ([[Manipulation]] lore: a specific ability beats general resistance like [[Jū]] unless the Jū is much stronger — implemented as: the general side needs 2× the committed aura to stop a specific ability).
3. **Conditions are absolute.** If an ability's [[Conditions|Condition]] isn't met, it doesn't function, regardless of magnitude.
4. Still genuinely uncertain? **Opposed SPI checks** (talent decides whose Nen prevails when preparation ties — [[Nen Manifestation]]), each side adding +1 per full 25% more aura committed than the other (cap +4). This is the only place raw aura touches a d20.

Rule 3 beats rule 2; rule 2 beats rule 4. Rule 1 is a lens, not a step you can skip.
