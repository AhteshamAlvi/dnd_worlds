/*
 * Display formatting.
 *
 * Everything here is arithmetic about pixels and characters, never about the
 * world. Turning 853.184 into "853.184" is this file's job; deciding that the
 * number is 853.184 is the engine's.
 *
 * Note what is deliberately absent: there is no function that *applies*
 * TraceRounding. The engine declares rounding modes as a type but ships no
 * implementation of them, and writing one here would put the meaning of an
 * engine concept inside the UI — where Foundry and Obsidian could not reach
 * it. Until the engine exports an applier, the workbench shows the raw value
 * and names the rounding that was requested but not performed.
 */

import type { JsonValue, TraceRounding } from "@nenworld/engine";

// Groups thousands and trims trailing zeros. NaN and Infinity are spelled out
// rather than rendered as blanks, so a bad value is never invisible.
export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

// Describes a rounding instruction in words. Reports what the engine asked
// for; does not carry it out.
export function describeRounding(rounding: TraceRounding): string {
  switch (rounding.mode) {
    case "integer":
      return "integer";
    case "fixed":
      return `${rounding.digits} decimal places`;
    case "significant":
      return `${rounding.digits} significant figures`;
  }
}

// Renders any JsonValue for inline display. Objects and arrays collapse to
// compact JSON so they fit on one row in the trace tree.
export function formatJsonValue(value: JsonValue | undefined): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;

  return JSON.stringify(value);
}

// Clock time for the event log. The date is irrelevant inside one session.
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour12: false });
}

// Pretty-prints anything for the raw JSON inspector.
export function formatJsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
