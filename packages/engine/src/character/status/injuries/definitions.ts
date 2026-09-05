/*
 * Authored Injury catalog and registry access.
 *
 * The catalog is CONTENT — its definitions carry Effects — so it lives here
 * rather than under foundation/body/injuries/, which owns the anatomical half
 * and may not name a rules type. See types.ts for the split.
 *
 * Body never calls anything in this file. Callers above Foundation look a
 * definition up here and pass it down as an AnatomicalInjuryDefinition, which
 * it structurally is.
 */

import {
  createRegistry,
} from "../../../infrastructure/registry";

import type {
  AnatomicalInjuryDefinition,
  InjuryId,
} from "../../foundation/body/injuries/types";

import type {
  InjuryDefinition,
} from "./types";


/**
 * Authored Injury catalog.
 *
 * The catalog intentionally remains empty until actual Injury content is
 * authored. Hosts may register their own definitions through the normal
 * content infrastructure.
 */
export const INJURY_DEFINITIONS = {} as const satisfies Record<
  string,
  InjuryDefinition
>;


const INJURY_REGISTRY = createRegistry<InjuryDefinition>(
  "Injury",
  INJURY_DEFINITIONS,
);


export type KnownInjuryId =
  keyof typeof INJURY_DEFINITIONS;


/**
 * Whether an InjuryDefinition exists for the supplied ID.
 */
export function isKnownInjuryId(
  injuryId: InjuryId,
): boolean {
  return INJURY_REGISTRY.isKnownId(injuryId);
}


/**
 * Return an InjuryDefinition when one is registered.
 */
export function getInjuryDefinition(
  injuryId: InjuryId,
): InjuryDefinition | undefined {
  return INJURY_REGISTRY.get(injuryId);
}


/**
 * Every registered Injury definition, authored plus custom.
 *
 * The array Body's inputs take. Returned as InjuryDefinitions rather than
 * narrowed to AnatomicalInjuryDefinitions because the two are the same
 * objects: a caller passing this into resolveInjuryManifestation or
 * ResolveRecoveryInput is handing over the anatomical view of definitions it
 * already holds, with no conversion and no second lookup.
 */
export function listInjuryDefinitions(): readonly InjuryDefinition[] {
  return INJURY_REGISTRY.all();
}


/**
 * The same list, typed as what Foundation actually consumes.
 *
 * A readability alias over listInjuryDefinitions for call sites feeding Body:
 * it documents at the call site that only the anatomical half is being handed
 * over, even though no narrowing happens (and none is needed — InjuryDefinition
 * extends AnatomicalInjuryDefinition).
 */
export function listAnatomicalInjuryDefinitions(): readonly AnatomicalInjuryDefinition[] {
  return INJURY_REGISTRY.all();
}


/**
 * Exposed for the catalog index, which needs every registry in one map.
 */
export const injuryRegistry =
  INJURY_REGISTRY;
