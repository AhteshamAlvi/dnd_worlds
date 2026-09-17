/*
 * The character-facing sensory adapter.
 *
 * `foundation/senses/` is pure: it knows routes, totals and the binary Detection
 * comparison, and nothing about what a character is currently doing. This layer
 * is where the two meet — a resolved profile, the signatures the host supplied,
 * and live runtime state such as a running Zetsu — without the foundation
 * having to learn any of it.
 */

export { NEN_PRESENCE_EVIDENCE_ID, resolveNenConcealmentModifiers } from "./nen-concealment";

export type { ActiveSearchRequest, ActiveSearchResolution } from "./search";
export { resolveActiveSearch } from "./search";
