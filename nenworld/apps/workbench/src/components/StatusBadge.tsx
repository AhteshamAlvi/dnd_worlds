/*
 * StatusBadge — the small marker showing pass / warn / fail / skipped.
 *
 * The workbench uses colour for exactly one thing: outcome. Keeping that in a
 * single component makes it hard to accidentally use these hues decoratively.
 *
 * Colour is never the only signal — a checkmark, a cross, and an exclamation
 * point are distinct shapes, so the badge still reads in greyscale or to
 * someone who can't separate the green from the red. What it no longer
 * carries is the word: "passed" and "failed" cost real width in a roster
 * that's meant to hold many rows, and the glyph plus colour already says
 * which is which. Warn is the one case that still shows a number — a bare
 * "!" can't distinguish one warning from ten, and that count is the whole
 * reason to glance at the badge in the first place.
 *
 * `label` still exists: it's the full sentence ("3 warnings", "failed") a
 * mouse can hover to read and a screen reader announces as this element's
 * accessible name, so removing the visible word doesn't remove the meaning,
 * just where it lives.
 */

export type Status = "ok" | "warn" | "fail" | "muted";

const GLYPHS: Record<Status, string> = {
  ok: "✓",
  warn: "!",
  fail: "✕",
  muted: "◇",
};

interface StatusBadgeProps {
  status: Status;
  label: string;

  // Shown next to the glyph only when status is "warn". Ignored otherwise —
  // callers can pass it unconditionally rather than branching themselves.
  count?: number | undefined;
}

export function StatusBadge({ status, label, count }: StatusBadgeProps) {
  return (
    <span className={`badge badge--${status}`} title={label} aria-label={label}>
      <span aria-hidden="true">{GLYPHS[status]}</span>
      {status === "warn" && count !== undefined ? (
        <span className="badge__count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </span>
  );
}

// Maps an engine outcome onto a badge. Warnings only downgrade a success —
// they never turn one into a failure, which mirrors the engine's own rule that
// warnings are non-blocking.
export function statusFor(
  success: boolean | null,
  warningCount: number,
): Status {
  if (success === null) return "muted";
  if (!success) return "fail";
  return warningCount > 0 ? "warn" : "ok";
}

export function labelFor(success: boolean | null, warningCount: number): string {
  if (success === null) return "skipped";
  if (!success) return "failed";
  return warningCount > 0 ? `${warningCount} warning` : "passed";
}
