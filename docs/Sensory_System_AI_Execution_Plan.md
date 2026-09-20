# SEN-1 — Anatomical Senses, Channel Routes, ESP, and Sensory Gyō

## 1. Starting point

- Branch: `main`
- Commit: `39dd0ed` (`Implement Ken, Gyo and Shu as one integrated feature (KGS-1)`)
- Expected engine baseline: 148 test files / 6,145 tests passing
- Engine typecheck: clean
- Monorepo typecheck: 65 pre-existing Workbench errors across 14 files
- Preserve the untracked `docs/Ken_Gyo_Shu_AI_Execution_Plan.md` and all unrelated user changes.

Start from the latest `main`. If HEAD or the baseline differs, audit the delta before editing and report it rather than silently resetting anything.

## 2. Objective

Replace the closed, anatomy-blind sensory model and hard-coded Eye Gyō adapter with one integrated sensory system in which:

1. functional Anatomical Points produce Sense availability and score;
2. universal registered Senses declare which registered channels they receive;
3. resolved cues carry channel intensities rather than concrete observer Sense ids;
4. routes are generated from emissions, functional receivers, and supplied propagation/exposure facts;
5. Detection still selects one best route and rolls at most once;
6. Concealment becomes channel- and receiver-aware without changing its contest or lifecycle;
7. ESP is an explicitly granted, locating Sense rather than an attribute unlock;
8. Gyō may use either reinforcement focus or sensory-point focus, never both;
9. automatic production of emissions from Items/actions/events remains outside this ticket behind a narrow resolved-cue boundary.

This is a replacement, not a compatibility layer permanently preserving both sensory models.

## 3. Non-negotiable domain boundary

The sensory domain consumes resolved facts:

```ts
interface ResolvedSensoryCue {
  readonly id: string;
  readonly source: ContributionSourceRef;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
  readonly emissions: Readonly<
    Partial<Record<SensoryChannelId, SensoryIntensity>>
  >;
  readonly origin?: SpatialPoint;
}
```

The final names may follow repository conventions, but preserve this ownership:

- Senses decides which functional receivers can accept the resolved channels.
- Senses validates intensity, applies received-intensity modifiers, constructs routes, and resolves checks.
- Senses does **not** inspect Skill, Item, attack, projectile, material, damage, or action definitions to invent emissions.
- Senses does **not** contain a partial automatic-emission composer.
- Callers may supply resolved emissions and propagation/exposure facts directly until the separate game-model composition work exists.
- An explicit host/GM override remains legal at this boundary.

The future producer pipeline is documented separately in `Engine_Event_Composition_Design_Handoff.md` and is not part of SEN-1.

## 4. Existing behavior to preserve

Unless this ticket explicitly changes it:

- passive Detection detects only when `Detection > Concealment`; ties remain concealed;
- active search and Reaction Detection remain the only rolled Detection paths;
- Concealment Lead remains `C - P` after passive failure;
- Reaction disadvantages remain `min(4, 1 + floor(Lead / 5))`;
- independent advantage reconciles before dice are requested;
- exactly `1 + abs(finalAdvantage)` d20s settle the prepared Gate;
- several senses/routes still produce one best route and at most one roll;
- successful Detection breaks established Concealment for that observer;
- a failed Reaction Gate does not break Concealment;
- attacks do not automatically break Concealment;
- Investigation analyzes evidence and is not a second discovery path;
- sensory resolvers never roll their own dice;
- Reaction Gate preparation remains bound against stale settlement inputs.

## 5. Registered vocabulary

### 5.1 Open ids

Replace the closed `SenseId` union and hard-coded `SENSE_IDS` iteration with registry-backed string ids:

```ts
type SenseId = string;
type SensoryChannelId = string;
type SensoryIntensity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
```

Do not validate open ids with a copied array `.includes()` check. Validate them against the authoritative registry at the relevant authored-content or request boundary.

### 5.2 Sense definitions

```ts
interface SenseDefinition {
  readonly id: SenseId;
  readonly name: string;
  readonly family: "basic" | "special";
  readonly receiveChannels: readonly SensoryChannelId[];
  readonly scoreBasis: SenseScoreBasis;
  readonly availability:
    | "anatomical"
    | "granted"
    | "anatomical-or-granted";
}
```

Required score bases:

```ts
type SenseScoreBasis =
  | { readonly kind: "attribute"; readonly attribute: AttributeKey }
  | {
      readonly kind: "attribute-average";
      readonly attributes: readonly AttributeKey[];
    }
  | { readonly kind: "fixed"; readonly score: number };
```

Do not allow arbitrary executable callbacks in registered content. Resolve these data shapes generically.

### 5.3 Channel definitions

Create a registered channel catalog with id, name, description, and any channel-level classification required for validation or UI. A channel does not list receiving Senses. `SenseDefinition.receiveChannels` is the single owner of that relation.

Validate:

- non-empty unique ids and names;
- no duplicate received channels inside one Sense;
- every received channel exists;
- every built-in channel has at least one receiver;
- every intensity is an integer from 1 through 10;
- no cue declares one channel twice;
- registries and their public lookup/query APIs accept registered custom content.

### 5.4 Built-in basic Senses

| Sense | Family | Score basis | Availability | Received channels |
|---|---|---|---|---|
| Sight | basic | PER | anatomical-or-granted | `visible-light` |
| Hearing | basic | PER | anatomical-or-granted | `sound` |
| Smell | basic | PER | anatomical-or-granted | `airborne-chemical` |
| Taste | basic | PER | anatomical-or-granted | `contact-chemical` |
| Touch | basic | PER | anatomical-or-granted | `surface-pressure`, `air-displacement`, `ground-vibration`, `structural-vibration` |

### 5.5 Built-in special Senses

| Sense | Score basis | Availability | Received channels |
|---|---|---|---|
| Thermoreception | PER | anatomical-or-granted | `thermal` |
| Electroreception | PER | anatomical-or-granted | `electric-field` |
| Magnetoreception | PER | anatomical-or-granted | `magnetic-field` |
| Echolocation | PER | anatomical-or-granted | `reflected-sound` |
| Vibration Sense | PER | anatomical-or-granted | `ground-vibration`, `structural-vibration` |
| Life Perception | PER | anatomical-or-granted | `life-presence` |
| Aura Perception | PER | anatomical-or-granted | `aura` |
| Extrasensory Perception (`esp`) | floor-average of PER and SPI | granted | `danger`, `hostile-intent`, `presence`, `metaphysical-anomaly`, `causal-disturbance` |

Future registered Senses and channels must use the same path. No resolver may branch on one of these ids.

## 6. Sensory Anatomical Points

### 6.1 Category and metadata

Add `sensory` to the independent Anatomical Point categories:

```ts
type AnatomicalPointCategory =
  | "fatal"
  | "critical"
  | "joint"
  | "weak"
  | "sensory";
```

A point may be Sensory without carrying a damage category. A Sensory point requires one metadata block, and a non-Sensory point must not carry it:

```ts
interface SensoryAnatomicalPointData {
  readonly footprint: SensoryPointFootprint;
  readonly focus: SensoryFocusMembership;
  readonly functions: readonly AnatomicalPointSensoryFunction[];
}

interface AnatomicalPointSensoryFunction {
  readonly senseId: SenseId;
  readonly contribution: SensoryContribution;
}
```

Body-level structural validation may validate string shape without importing the Sense registry. Cross-catalog validation at the character/content composition boundary must prove that every `senseId` exists. Do not create a body/senses runtime import cycle merely to validate a registry membership early.

### 6.2 Contribution forms

Support fixed contribution for discrete organs and network weighting for distributed anatomy:

```ts
type SensoryContribution =
  | { readonly kind: "fixed"; readonly amount: number }
  | {
      readonly kind: "network-weight";
      readonly networkId: string;
      readonly sensitivity: number;
    };
```

Require finite positive amounts/sensitivities. Fixed healthy contributions may intentionally total above one; do not clamp them. Network contributions are normalized at resolution from present active members.

### 6.3 Footprints

```ts
type SensoryPointFootprint =
  | {
      readonly kind: "host-surface-fraction";
      readonly fraction: number;
    }
  | {
      readonly kind: "absolute";
      readonly squareMetres: number;
    };
```

- Prefer host fractions for biological anatomy.
- Permit absolute area for fixed-size implants, gems, constructs, and exceptional organs.
- Resolve both to one finite positive square-metre area.
- A physical point has one footprint even when it contributes to several Senses.
- Point footprints partition the host's existing area; they do not add area.
- Reject a resolved host whose non-overlapping point footprints exceed its present surface area.
- Preserve Aura placement conservation when a body site is subdivided into sensory point sites plus host remainder.

Centralize the initial Human footprint values beside the Human point definitions. They are calibration constants, not formulas to scatter through Gyō or tests. Use host-relative fractions for the biological Human points; record the chosen values and resulting reference-form square-centimetre areas in the completion report so they can be retuned without changing the model.

### 6.4 Focus membership

```ts
type SensoryFocusMembership =
  | { readonly kind: "local"; readonly cluster: string }
  | {
      readonly kind: "distributed";
      readonly network: string;
      readonly selection: "all-active";
    };
```

The resolved identity of a local sensory cluster is:

```text
(host BodyPart id, Sense id, authored cluster)
```

Distributed networks use their network id and active member set instead.

### 6.5 Functional fraction

Add a point-specific Effect seam conceptually equivalent to:

```ts
interface ModifyAnatomicalPointFunctionEffect {
  readonly type: "modifyAnatomicalPointFunction";
  readonly pointId: CriticalPointId;
  readonly multiplier: number;
}
```

Resolve all applicable multipliers through the existing Effect/contribution architecture. Do not put mutable partial-integrity fields on the derived point instance.

- Active, unimpaired point: functional fraction 1.
- Multipliers reduce or exceptionally improve function according to ordinary modifier validation.
- Suppressed, archived/removed, destroyed, or absent-host point: function 0.
- Partial sensory loss comes from an Injury/condition Effect, not automatically from reaching a Critical tier.

## 7. Human sensory roster

Extend the standard Human point catalog:

| Point | Host selector | Categories | Sense contribution | Focus |
|---|---|---|---|---|
| Existing Left Eye | Head | critical, weak, sensory | Sight fixed 0.50 | local `facial-eyes` |
| Existing Right Eye | Head | critical, weak, sensory | Sight fixed 0.50 | local `facial-eyes` |
| Left Ear | Head | sensory | Hearing fixed 0.50 | local `cranial-hearing` |
| Right Ear | Head | sensory | Hearing fixed 0.50 | local `cranial-hearing` |
| Olfactory Organs | Head | sensory | Smell fixed 1.00 | local `nasal-olfaction` |
| Tongue | Head | sensory | Taste fixed 1.00 | local `oral-taste` |
| Tactile Surface | every eligible exposed Body Part | sensory | Touch network weight from area x sensitivity | distributed `whole-body-touch` |
| Palm | each Hand | sensory | Touch network member with elevated sensitivity | local cluster namespaced by its Hand |

Do not use display names or left/right strings to establish identity. Follow the existing Eye/per-part instance pattern and stable resolved point ids.

Palm footprint is carved out of the Hand tactile footprint. Eye, Ear, Olfactory, Tongue, Palm, and remaining tactile footprints may not overlap or duplicate area in coating placement.

For the Touch network:

```text
weight = resolved tactile area * authored sensitivity
contribution = weight / sum(active network weights)
```

Loss of anatomy renormalizes the remaining network. A local Palm route still uses that Palm's resolved receiver and functional fraction.

## 8. Sensory profile resolution

Replace “all physical senses are automatically available at PER” with anatomy/grant resolution.

For fixed contributors to Sense `s`:

```text
support_s = sum(contribution_p * functionalFraction_p)
```

For a distributed network, resolve normalized point contributions first and then apply each point's functional fraction.

Resolve the final score once:

```text
SenseScore = floor(scoreBasis * support + persistent Sense modifiers)
```

For an attribute-average basis, floor the completed expression once rather than each attribute separately. Do not round individual point contributions.

- Anatomical availability requires positive functional support.
- A grant may make a granted/anatomical-or-granted Sense available without anatomy.
- A suppression wins over anatomy and grants according to existing Effect precedence.
- A profile contains only registered resolved Senses, not an assumed fixed record.
- Provide a safe accessor/query rather than allowing unknown string indexing to manufacture a Sense.
- Preserve contribution provenance and trace the point/function/multiplier sources.

Remove `NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS` and `natural-extrasensory-unlock` completely. High PER/SPI never grants ESP.

## 9. Character-specific sensory Effects

Preserve existing grant/suppress/modify behavior while making it registry-aware, and add channel-scoped effects:

```ts
grantSense
suppressSense
modifySense
grantSenseChannel
suppressSenseChannel
modifySenseChannelReception
```

An ESP grant may restrict the enabled subset of ESP's universal channels:

```ts
interface GrantSenseEffect {
  readonly type: "grantSense";
  readonly sense: SenseId;
  readonly enabledChannels?: readonly SensoryChannelId[];
  readonly amount?: number;
}
```

Validate that enabled channels belong to that Sense. Ordinary grants may omit the restriction and receive the definition's complete channel set.

Night Vision and similar capabilities modify reception of `visible-light`; they do not register duplicate Senses.

## 10. Resolved emissions and intensity

The sensory request accepts one finite integer intensity per channel:

```ts
readonly emissions: Readonly<
  Partial<Record<SensoryChannelId, SensoryIntensity>>
>;
```

- Omit a channel for no emission; zero is invalid.
- Validate every channel against the registry.
- Preserve source/provenance and immutable input.
- Accept caller-supplied propagation/exposure results without building the future automatic producer.

Received intensity contributes exactly once:

```text
intensityModifier = receivedIntensity - 5
```

| Received intensity | Modifier |
|---:|---:|
| 1 | -4 |
| 2 | -3 |
| 3 | -2 |
| 4 | -1 |
| 5 | 0 |
| 6 | +1 |
| 7 | +2 |
| 8 | +3 |
| 9 | +4 |
| 10 | +5 |

Do not count intensity once in raw Perception and again in Detection.

## 11. Receiver and route resolution

### 11.1 Receiver vocabulary

```ts
type SensoryReceiverRef =
  | {
      readonly kind: "anatomical";
      readonly pointIds: readonly CriticalPointId[];
      readonly clusterKey: string;
    }
  | {
      readonly kind: "distributed-network";
      readonly networkId: string;
      readonly pointIds: readonly CriticalPointId[];
    }
  | {
      readonly kind: "granted";
      readonly source: ContributionSourceRef;
    };
```

An event never names the receiving point. The sensory resolver derives compatible receivers from the profile, channel, and caller-supplied exposure/contact/propagation facts.

### 11.2 Route vocabulary

```ts
interface SensoryRoute {
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
  readonly receiver: SensoryReceiverRef;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
}
```

Update route equality, keys, traces, validation, modifiers, retained ratings, candidates, and Reaction Gate bindings. Stable route identity must not depend on array order; normalize point-id sets or provide a canonical receiver key.

### 11.3 Candidate generation

- Match each positive resolved channel against each available Sense receiving it.
- Apply per-character channel grants/suppressions.
- Resolve the compatible anatomical cluster, distributed network, or grant receiver.
- Drop absent, destroyed, fully impaired, unexposed, blocked, or zero-intensity receivers.
- More than one receiver cluster may yield candidates, but the existing sweep still chooses one best route and never one roll per receiver.
- Contact channels resolve against the contacted host/point facts supplied by the caller; callers do not manually select a receiver id.
- Nonanatomical ESP uses its grant receiver.

## 12. Perception, Detection, Investigation, and Concealment

### 12.1 Perception/access

Replace `SensorySignature.sense + reception` as the primary cue vocabulary. Channel compatibility and supplied propagation/exposure determine access.

- No compatible positive-intensity route: inaccessible.
- Compatible route: it may feed ordinary Perception or concealed-subject Detection.
- A concealed threat must not roll uncertain Perception and then Detection for the same cue.
- Standalone Perception continues to return information bands for unconcealed informational stimuli.

Do not keep a second permanent signature API with different answers. A temporary import/migration adapter is allowed only if the audit finds a real supported caller that cannot move atomically; mark it deprecated and remove it before completion if no caller remains.

### 12.2 Detection

Detection receives the generated route and adds `receivedIntensity - 5` as one named base contribution. Preserve passive, active, reaction, margin, best-route, and tie behavior.

### 12.3 Investigation

Sense-specific Investigation uses the anatomy-resolved Sense score and channel/receiver scope when present. Investigation without a Sense remains unchanged.

### 12.4 Concealment

Concealment ratings and retained attempts become route-aware through Sense, channel, receiver, phenomenon, and subject. Preserve one shared established roll and the current observer-relative break lifecycle.

Channel-specific examples must be expressible without principle branches:

- invisibility affects `visible-light`;
- silence affects `sound`;
- scent masking affects `airborne-chemical`;
- thermal masking affects `thermal`;
- Zetsu concealment affects `aura`/Nen routes rather than physical appearance.

### 12.5 Reaction Gate

Preparation and settlement must bind at least:

- trigger;
- reacting combatant;
- observer;
- source;
- attempt;
- complete canonical route including channel and receiver;
- received intensity;
- Concealment total.

Any change refuses settlement as stale. Dice-count validation and queue transitions remain unchanged.

## 13. ESP

### 13.1 Availability and score

- Remove the PER 22/SPI 20 automatic unlock.
- ESP is available only from an explicit grant, innate Trait, exceptional physiology, condition, Ability, or other authorized source.
- Default ESP score is:

```text
floor((PER + SPI) / 2 + persistent ESP modifiers)
```

- A grant may enable only a subset of ESP's registered channels.

### 13.2 Locating property

Successful ESP Detection always locates the danger, presence, intent, anomaly, or disturbance that was detected.

- In combat it opens the ordinary Reaction opportunity with no ESP-specific Reaction restriction.
- If the concealed subject is what the route detected, record ordinary observer-relative detection and break that Concealment.
- Information bands may govern identity, nature, method, strength, or motive; location is the minimum successful result.
- ESP does not replace Investigation.

### 13.3 Gyō eligibility

- Nonanatomical granted ESP has a granted receiver and cannot be targeted by Sensory Gyō.
- ESP from a real Sensory Anatomical Point may be enhanced normally.

This ticket consumes supplied `danger`, `presence`, and related emissions. It does not derive them from attacks or world events.

## 14. Sensory Gyō

### 14.1 Replace Eye Gyō

Generalize the pure Eye table to a Sense-agnostic sensory Gyō table. Remove or rename the Eye-specific public API and delete host-supplied `eyeSiteIds`.

Use discriminated focus modes:

```ts
type GyoFocus = ReinforcementGyoFocus | SensoryGyoFocus;

interface ReinforcementGyoFocus {
  readonly kind: "reinforcement";
  readonly sites: readonly GyoSiteId[];
}

interface SensoryGyoFocus {
  readonly kind: "sensory";
  readonly senseId: SenseId;
  readonly pointIds: readonly CriticalPointId[];
}
```

Existing stored KGS focus payloads lacking a `kind` migrate as reinforcement focus. Do not silently reinterpret them as sensory.

### 14.2 Mutual exclusivity

- Reinforcement focus accepts ordinary body/item sites and preserves existing contiguity rules.
- Sensory focus accepts Sensory Anatomical Point ids and rejects body/item sites.
- One running Gyō cannot carry both focus kinds.
- The shifted sensory share contributes no concentrated attack or defense reinforcement.
- The uniform remainder remains ordinary coating and retains its ordinary protection.

### 14.3 Local grouping

Every selected local point must share:

```text
(host BodyPart id, requested Sense id, authored focus cluster)
```

One point or any subset of that cluster is valid. A rear Head Eye in a different cluster and a Hand Eye on another host cannot join the facial Eyes.

### 14.4 Distributed Touch

- `whole-body-touch` selection includes every active member of that network.
- Arbitrary disconnected subsets of a distributed network are refused.
- Local Palm/fingertip/whisker clusters may be selected independently.
- A Palm focus affects only routes received through that Palm receiver.
- Full-body Touch affects routes received through the selected complete network.

### 14.5 Placement and conservation

Subdivide body sites into point sites and remainder sites without changing total area. Spread shifted Output across selected point footprints at equal density:

```text
shiftedDensity = shiftedOutput / selectedPointArea
pointShiftedAura = shiftedDensity * pointArea
```

Preserve exactly:

```text
uniformOutput + shiftedOutput = activeOutput
sum(boundary site Aura) = activeOutput
```

### 14.6 Impairment order

First resolve the impaired Sense score. Then resolve useful sensory Aura:

```text
effectiveSensoryAura = sum(pointAura * pointFunctionalFraction)
```

Pass that amount through the table once and apply its bonus afterward as a contextual check contribution. Do not multiply the resulting bonus by impairment a second time.

### 14.7 Enhancement table

| Effective sensory Aura | Nen-phenomenon bonus | Ordinary Sense bonus |
|---:|---:|---:|
| `< 1` | +0 | +0 |
| `1–10` | +1 | +1 |
| `>10–100` | +2 | +1 |
| `>100–1,000` | +3 | +2 |
| `>1,000–10,000` | +4 | +2 |
| `>10,000–100,000` | +5 | +3 |
| `>100,000–1,000,000` | +6 | +3 |
| `>1,000,000–10,000,000` | +7 | +4 |
| `>10,000,000–100,000,000` | +8 | +4 |
| `>100,000,000–<800,000,000` | +9 | +5 |
| `>=800,000,000` | +10 | +5 |

Keep the existing threshold-count implementation rather than `ceil(log10())`, preserving exact decade boundaries. Apply one alternative contribution per concrete check:

- Nen phenomenon: full bonus;
- non-Nen phenomenon: ordinary bonus;
- never both;
- sum selected point Aura first, then consult the table once.

Apply Sensory Gyō to Perception, passive/active/Reaction Detection, and sense-specific Investigation. It creates no check and does not directly change Concealment.

## 15. Migration and serialization

- Migrate existing Gyō payloads to `kind: "reinforcement"` without changing their sites or shift.
- Replace supported current sensory signatures/routes with the new cue/route shapes at their one migration or construction boundary.
- If retained Concealment state is serialized, migrate or explicitly version old routes; never guess a receiver when the stored data is insufficient.
- Remove `natural-extrasensory-unlock` from state/result vocabularies.
- Existing explicit Extrasensory grants migrate to `esp` grants with the complete default ESP channel set unless the source already provides a narrower authoritative set.
- JSON round trips preserve registered ids, emissions, intensity, receiver identity, point sets, focus kind, and ESP channel restrictions.
- Do not retain writable aliases for old Eye Gyō or old concrete-sense signatures.

## 16. Expected implementation surface

Audit exact callers before editing. Expected production touch points include:

- `character/foundation/body/critical-points/{types,validation,resolution,special-points,state}.ts`
- `character/foundation/body/resolution.ts`
- `character/foundation/senses/{scopes,types,profile,modifiers,signatures,access,validation,index}.ts`
- `character/foundation/senses/perception/*`
- `character/foundation/senses/detection/*`
- `character/foundation/senses/concealment/*`
- `character/foundation/senses/investigation/*`
- `character/resolution.ts`
- `checks/{scopes,matching,validation,index}.ts`
- `effects`/character effect collection files that own sensory Effects
- `character/foundation/nen/principles/gyo.ts`
- `character/nen/gyo.ts`
- `gameplay/nen/{coating,senses,index}.ts`
- `gameplay/senses/reaction-gate.ts`
- `character/senses/nen-concealment.ts`
- `character/catalogs.ts` or the existing registry/catalog composition seams
- `infrastructure/json.ts` if normalized receiver sets require JSON validation changes
- package barrels, fixtures, migrations, and affected tests

Do not create or modify automatic Item/action/event emission producers in this ticket.

## 17. Execution strategy and agent allocation

Use one primary integrator/writer. Parallel agents may audit and implement isolated pure layers, but they must not concurrently edit shared barrels, sensory scope types, `character/resolution.ts`, `architecture.test.ts`, or shared fixtures.

Recommended sequence:

### Phase A — sequential contract lock

Primary integrator:

1. record exact baseline and dirty tree;
2. map every public `SenseId`, `SensorySignature`, `ConcealmentRoute`, Eye Gyō, and profile caller;
3. introduce registry-backed Sense/channel vocabulary and the resolved cue/route/receiver contracts;
4. keep the tree typecheckable before delegation.

### Phase B — parallel pure work

After Phase A contracts compile:

- Agent 1: Anatomical Point Sensory metadata, validation, resolved footprints, Human roster, and point tests.
- Agent 2: Sense/channel registries, catalog validation, profile arithmetic, ESP grants, and profile tests.
- Agent 3: pure Sensory Gyō table rename/generalization, focus validation, point-area placement math, and pure tests.

Use Sonnet-high or equivalent for these bounded workstreams. Each agent reports files changed, tests run, and unresolved integration assumptions. The primary integrator reviews and merges; agents do not edit shared exports or architecture guards.

### Phase C — sequential composition

Primary integrator, Opus/high or strongest available model:

1. route generation and receiver resolution;
2. Perception/Detection/Investigation integration;
3. channel-aware Concealment state;
4. Reaction Gate binding and settlement;
5. Sensory Gyō gameplay projection;
6. migrations and package exports.

These touch shared contracts and must not be split among independent writers.

### Phase D — parallel test audit, sequential fixes

Agents may independently review coverage for anatomy, senses, Detection/Concealment, and Gyō. Only the primary integrator applies overlapping fixes and architecture guards.

### Phase E — one final verification/commit

Run focused suites, full engine, engine typecheck, monorepo baseline comparison, mutations, searches, and `git diff --check`. Commit only after every mutation is reverted and the worktree contains no accidental files.

## 18. Architecture requirements

Add guards proving:

- Sense and channel definitions each have one production registry owner;
- no production resolver owns a second closed Sense list;
- no resolver branches on built-in special Sense ids;
- channel-to-Sense acceptance is stored only on Sense definitions;
- body foundation does not import sensory runtime/profile resolution;
- sensory foundation does not import Nen principle files;
- automatic Item/action/event emission composition does not appear in sensory files;
- Eye-specific Gyō names and `eyeSiteIds` are gone from production;
- reinforcement and sensory Gyō are discriminated and cannot be combined;
- the sensory bonus table has one production owner;
- Detection still rolls through one selected route, never once per Sense/receiver;
- Reaction Gate settlement compares the complete canonical route and received intensity;
- no automatic PER/SPI ESP unlock remains;
- generic runtime and Aura do not branch on Gyō or Sense ids.

## 19. Required tests

### Registries and validation

- built-in basic/special Sense rows match this ticket exactly;
- custom registered Sense and channel work without resolver edits;
- duplicate/unknown ids, duplicate channels, bad score bases, bad availability, and invalid intensities are refused;
- a new channel may be accepted by a newly registered Sense;
- unknown runtime ids are refused rather than defaulted.

### Anatomical resolution

- Sensory-only point is valid;
- Sensory metadata without category and category without metadata are refused;
- two Human Eyes produce 0.50 each per Head;
- additional Heads produce stable independent instances;
- destroyed/suppressed/absent points contribute zero;
- partial impairment scales only that point;
- eight equal Eyes lose one eighth when one is destroyed;
- score floors after the complete expression;
- healthy totals above one are not clamped;
- footprints partition host area and overcommitment is refused;
- point subdivision preserves coating area and Aura exactly;
- Touch weights normalize from present area/sensitivity;
- Palm area does not duplicate Hand tactile area.

### Profile and Effects

- physical Senses are unavailable without functional anatomy or grant;
- every Human basic Sense resolves from its points;
- grant/suppress/modify and channel Effects preserve provenance;
- Night-Vision-style channel modifier changes visual reception without creating a Sense;
- ESP never unlocks from PER/SPI alone;
- ESP grant resolves floor-average PER/SPI;
- restricted ESP grant receives only its enabled channels.

### Cue and routes

- cue validates one intensity per registered channel;
- intensity 1–10 maps exactly to -4 through +5;
- one emission can generate several receiver candidates;
- incompatible, unavailable, destroyed, blocked, and zero-intensity receivers produce no route;
- receiver point sets have stable canonical identity independent of input order;
- facial Eyes and a Hand Eye are distinct routes;
- event input never names a receiving point;
- host override can supply an exceptional resolved route without changing registries.

### Perception/Detection/Concealment

- concealed cue does not roll Perception before Detection;
- standalone Perception still resolves information bands;
- passive, active, and reaction totals receive intensity once;
- best route wins and only one roll is requested;
- ties still favor Concealment;
- channel-specific Concealment affects only matching routes;
- established ratings retain one shared roll;
- detection breaks only for the observer;
- failed Reaction does not break;
- complete route mismatch or changed intensity makes settlement stale;
- Reaction disadvantage table and dice counts remain exact.

### ESP

- each ESP channel can be independently granted/restricted;
- successful ESP locates its danger/presence/etc.;
- ESP success opens an ordinary Reaction and breaks applicable Concealment;
- nonanatomical ESP cannot be selected by Sensory Gyō;
- anatomical ESP can be selected;
- ESP information beyond location follows the ordinary information-band seam.

### Sensory Gyō

- existing reinforcement payload migrates unchanged;
- reinforcement focus retains current connectivity behavior;
- Sensory focus rejects ordinary body/item sites;
- mixed focus is unrepresentable/refused;
- two facial Eyes may combine;
- rear/Hand Eye cannot join facial Eyes;
- one Eye may be selected alone;
- multi-sense organ requires one requested Sense;
- distributed Touch selects all active network members;
- arbitrary distributed subset is refused;
- Palm bonus applies only to Palm receiver routes;
- shifted sensory share adds no concentrated attack/defense projection;
- uniform remainder still protects normally;
- impaired useful Aura is `sum(pointAura * function)`;
- bonus is applied after impairment and not impaired twice;
- table boundaries remain exact, including `<1`, every decade, and 800 million;
- several selected organs consult the table once;
- Nen and ordinary bonuses are alternatives, never stacked;
- subdivision, JSON round-trip, and adjustment preserve focus kind/points.

## 20. Required mutation checks

Apply each independently, prove at least one test fails, and revert:

1. Restore the closed six-Sense union.
2. Accept an unknown channel.
3. Allow intensity 0 or 11.
4. Change intensity modifier from `I - 5` to `I`.
5. Count intensity in both Perception and Detection.
6. Make all physical Senses automatically available.
7. Restore PER/SPI automatic ESP unlock.
8. Use PER alone for ESP score.
9. Ignore an ESP grant's enabled-channel restriction.
10. ESP success does not locate/break applicable Concealment.
11. Remove `sensory` from valid point categories.
12. Permit Sensory category without metadata.
13. Round each point contribution before summing.
14. Round Sense Score instead of flooring it.
15. Clamp anatomical support to one.
16. Destroyed point keeps contributing.
17. Apply partial impairment after calculating base Sense score.
18. Apply the final Gyō bonus before impairment or multiply it twice.
19. Add sensory point area instead of partitioning its host.
20. Allow point footprints to exceed host area.
21. Duplicate Palm and Hand tactile area.
22. Generate one Detection roll per receiver.
23. Omit channel from route identity.
24. Omit receiver from route identity.
25. Reaction settlement ignores changed intensity.
26. Channel-specific Concealment applies to all channels.
27. Restore `eyeSiteIds` or Sight-only projection.
28. Allow simultaneous reinforcement and sensory focus.
29. Let a Hand Eye join facial Eyes.
30. Let a rear cluster join facial Eyes on the same Head.
31. Let distributed Touch select an arbitrary subset.
32. Treat normal Hand reinforcement as Palm sensory enhancement.
33. Count each selected Eye's Gyō bonus separately.
34. Stack Nen and ordinary sensory bonuses.
35. Give nonanatomical ESP a Gyō target.
36. Branch on a built-in Sense id in the generic resolver.
37. Import Nen into sensory foundation.
38. Add automatic action/Item emission production inside the sensory domain.

If a mutation survives, strengthen the nearest behavioral or architecture test before completion. Document any genuinely unreachable defensive branch rather than manufacturing a meaningless test.

## 21. Explicitly out of scope

- automatic derivation of emissions from attacks, Skills, Items, projectiles, materials, movement, impacts, hazards, or environments;
- automatic `danger` intensity from lethality/urgency/commitment;
- acoustic, optical, chemical, thermal, or Aura propagation simulation;
- new spatial facing, field-of-view, line-of-sight, wind, or occlusion engines;
- authoring every existing Item/Skill/action with sensory profiles;
- Nen Ability mechanics;
- new Nen principles;
- damage/defense formula changes unrelated to sensory impairment;
- a UI for editing Sense/channel/point registries.

## 22. Acceptance criteria

- Sensory ability is produced from functional anatomy or explicit grants.
- Score arithmetic floors once after impairment and persistent modifiers.
- Registered custom Senses/channels work through generic resolution.
- ESP has no automatic attribute unlock, localizes successes, and supports restricted grant variants.
- Cues carry registered channels and intensities, not concrete observer Senses.
- Intensity contributes exactly once as `I - 5`.
- Routes identify Sense, channel, receiver, phenomenon, and subject.
- Detection/Concealment core behavior and the one-roll best-route rule remain intact.
- Eye Gyō is replaced by general Sensory Gyō using measured Anatomical Point footprints.
- Reinforcement and Sensory Gyō cannot coexist in one focus.
- Local and distributed Touch behave as specified.
- Existing KGS reinforcement focus migrates without semantic change.
- No automatic event-emission composer is added.

## 23. Verification

Run focused suites discovered/created for:

```bash
npm test -w @nenworld/engine -- --run \
  src/__tests__/senses-profile.test.ts \
  src/__tests__/senses-perception.test.ts \
  src/__tests__/senses-detection.test.ts \
  src/__tests__/senses-search.test.ts \
  src/__tests__/senses-integration.test.ts \
  src/__tests__/nen-gyo-pure.test.ts \
  src/__tests__/nen-gyo.test.ts \
  src/__tests__/architecture.test.ts

npm test -w @nenworld/engine
npm run typecheck -w @nenworld/engine
npm run typecheck --workspaces --if-present
git diff --check
git status --short
```

Update the focused list to include every new sensory-anatomy, channel-route, ESP, Reaction Gate, and Sensory Gyō suite. Compare the monorepo typecheck's exact error set with the 65-error baseline rather than comparing only the count.

Search production for old APIs and forbidden coupling, including:

```text
EyeGyo
eyeSiteIds
deriveEyeGyoBonuses
natural-extrasensory-unlock
NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS
signature.sense
reception.kind
```

Every remaining match must be justified by migration/history or removed.

## 24. Completion report

Report:

1. review verdict and actual starting commit/baseline;
2. commit, branch, push status, and working-tree state;
3. final Anatomical Point, Sense, channel, route, ESP, and Gyō behavior;
4. exact built-in Human footprint constants and reference-form resolved areas;
5. migrations and removed public APIs;
6. files changed;
7. focused/full tests and both typechecks;
8. every mutation and the test/guard that caught it;
9. intentional deviations with justification;
10. bugs found and whether fixed;
11. deferred automatic event/emission composition work;
12. any remaining risks without expanding scope.
