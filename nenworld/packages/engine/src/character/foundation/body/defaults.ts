/*
 * Ready-made Body values.
 *
 * Keeps the shape in types.ts separate from the concrete instances the
 * engine and its fixtures reach for.
 */

import { STANDARD_BODY_SURFACE_UNITS } from "../../../constants/surface-units";
import type { Body } from "./types";

// Standard whole-body representation used by the initial engine.
export const STANDARD_BODY: Body = {
  surfaceUnits: STANDARD_BODY_SURFACE_UNITS,
};
