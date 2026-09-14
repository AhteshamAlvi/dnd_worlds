/*
 * The active-Nen lifecycle transitions.
 *
 * One operation per kind of change, and one shared stop for every way an
 * activity can end — cancellation, suppression, sealing, interruption,
 * collapse and access loss differ in cause, authority and resumability, all of
 * which are recorded, and in nothing else.
 */

export {
  activateNenActivity,
  adjustNenActivity,
  advanceNenActivities,
  resumeNenActivity,
  stopNenActivity,
} from "./transitions";

export type {
  NenActivationRequest,
  NenActivityEvent,
  NenActivityTransition,
  NenAdjustRequest,
  NenAdvanceRequest,
  NenResumeRequest,
  NenStopRequest,
} from "./transitions";
