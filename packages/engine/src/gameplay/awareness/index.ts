/*
 * Threat awareness: the layer between a prepared danger and a Reaction Gate.
 *
 * ECP-1 left danger projected and available and nothing consuming it. This
 * domain consumes it — through SEN-1's real reception, routes and Detection,
 * never through the intensity number itself — and produces the awareness
 * bindings the Reaction Gate needs, plus the deliberate warning by which one
 * character tells another.
 *
 * The dependency direction is one-way and checked in architecture.test.ts.
 * This domain reads composition, Senses and Combat; none of them reads it. In
 * particular composition stays the only automatic producer of resolved cues:
 * a warning goes through `composeSensoryCues` exactly as a Skill does.
 */

export {
  findThreatIdentityIssues,
  sameThreatIdentity,
  threatIdentity,
  type ThreatIdentity,
  type ThreatIdentityInput,
  type ThreatSubject,
  type ThreatTiming,
} from "./identity";

export {
  EFFECT_TIMELINESS,
  affectsThreat,
  authoredEffectPoint,
  compareEffectToImpact,
  defaultEffectPoint,
  findEffectPointIssues,
  type ActionEffectPoint,
  type EffectTimeliness,
} from "./timing";

export {
  PARTICIPANT_RELATIONSHIPS,
  RELATIONSHIP_BINDING_OWNER,
  alliedCandidates,
  findRelationshipFactSetIssues,
  isParticipantRelationship,
  relationshipBetween,
  relationshipRevision,
  type ParticipantRelationship,
  type ParticipantRelationshipFact,
  type RelationshipFactSet,
  type RelationshipQuerySpec,
} from "./relationships";

export {
  AWARENESS_GATE_DISPOSITIONS,
  AWARENESS_ORIGINS,
  createThreatAwareness,
  mayAttemptDetection,
  mayOpenGate,
  recordDetectionAttempt,
  recordGateDisposition,
  subjectAwareness,
  type AwarenessGateDisposition,
  type AwarenessOrigin,
  type AwarenessRouteRecord,
  type DetectionAttemptRecord,
  type SubjectAwareness,
  type ThreatAwareness,
} from "./awareness";

export {
  ENDANGERMENT_SOURCES,
  endangeredSubjects,
  isEndangered,
  type EndangeredSubject,
  type EndangeredSubjects,
  type EndangeredSubjectsInput,
  type EndangermentSource,
} from "./subjects";

export {
  COARSE_DIRECTIONS,
  coarseDirection,
  describeDangerDisclosure,
  receiveComposedCue,
  requireReception,
  type CoarseDirection,
  type DangerDisclosure,
  type ThreatReception,
  type ThreatReceptionFailure,
  type ThreatReceptionInput,
} from "./reception";

export {
  OBSERVER_REFUSALS,
  selectAlliedObserver,
  type AlliedObserverCandidate,
  type AlliedObserverInput,
  type AlliedObserverSelection,
  type ObserverRefusal,
} from "./observer";

export {
  composeWarningCues,
  declareWarning,
  warningCombatAction,
  type CommunicationMethodRef,
  type PreparedWarning,
  type WarningDeclarationInput,
  type WarningEmission,
  type WarningEmissionInput,
} from "./warning";

export {
  resolveWarningRecipient,
  warningConcealmentRelief,
  type WarningRecipientFailure,
  type WarningRecipientInput,
  type WarningRecipientOutcome,
} from "./recipients";

export {
  GATE_VALIDITIES,
  THREAT_GATE_KINDS,
  authorizeGateResponse,
  bindThreatGate,
  orderThreatGates,
  revalidateThreatGate,
  type AuthorizedGateResponse,
  type GateRevalidation,
  type GateRevalidationInput,
  type GateValidity,
  type PendingThreatGate,
  type ThreatGateBinding,
  type ThreatGateKind,
} from "./gates";
