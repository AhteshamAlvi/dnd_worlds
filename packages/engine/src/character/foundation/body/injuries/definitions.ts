/*
 * Authored Injury catalog and registry access.
 *
 * See types.ts for what an Injury is; this file only owns the catalog of
 * reusable InjuryDefinitions and how a caller looks one up.
 */

import {
  createRegistry,
} from "../../../../infrastructure/registry";

import type {
  InjuryDefinition,
  InjuryId,
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
 * Exposed for the catalog index, which needs every registry in one map.
 */
export const injuryRegistry =
  INJURY_REGISTRY;
