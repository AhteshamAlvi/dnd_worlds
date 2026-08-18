/*
 * Tests for the standard body.
 *
 * Pins the 100-SU total, since SU is the denominator of every aura density
 * calculation and a silent change here would move every derived number.
 */

import { describe, expect, it } from "vitest";

import { STANDARD_BODY } from "../character/foundation/body/defaults";

describe("body", () => {
  it("represents the whole body as 100 surface units", () => {
    expect(STANDARD_BODY.surfaceUnits).toBe(100);
  });
});
