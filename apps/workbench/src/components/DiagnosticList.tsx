/*
 * DiagnosticList — renders the engine's warnings and errors in full.
 *
 * The plan is explicit that "something went wrong" is never acceptable, so
 * every field the engine provides is shown: the code, the audience it was
 * written for, the subject it concerns, what was required against what was
 * actually supplied, and the suggested resolution.
 */

import type { EngineError, Warning } from "@nenworld/engine";
import { formatJsonValue } from "../utilities/format";

interface DiagnosticListProps {
  errors: readonly EngineError[];
  warnings: readonly Warning[];
}

export function DiagnosticList({ errors, warnings }: DiagnosticListProps) {
  if (errors.length === 0 && warnings.length === 0) {
    return <p className="note">No diagnostics. Every step passed cleanly.</p>;
  }

  return (
    <div>
      {errors.map((error, index) => (
        <DiagnosticRow
          key={`${error.code}-${index}`}
          kind="error"
          diagnostic={error}
        />
      ))}

      {warnings.map((warning, index) => (
        <DiagnosticRow
          key={`${warning.code}-${index}`}
          kind="warning"
          diagnostic={warning}
        />
      ))}
    </div>
  );
}

interface DiagnosticRowProps {
  kind: "error" | "warning";
  // Warning is structurally a subset of EngineError, so one row renders both.
  diagnostic: EngineError | Warning;
}

function DiagnosticRow({ kind, diagnostic }: DiagnosticRowProps) {
  // `required`, `actual` and `resolution` exist only on EngineError, so they
  // are read through a narrowed view rather than assumed present.
  const details = diagnostic as EngineError;

  return (
    <div className={`diagnostic diagnostic--${kind}`}>
      {/* The glyph is what distinguishes an error from a warning without
          relying on the colour it's printed in. */}
      <span className="diagnostic__glyph" aria-hidden="true">
        {kind === "error" ? "✕" : "!"}
      </span>

      <div className="diagnostic__message">{diagnostic.message}</div>

      <div className="diagnostic__code">
        {diagnostic.code}
        <span> · {diagnostic.audience}</span>
        {diagnostic.subject ? (
          <span>
            {" "}
            · {diagnostic.subject.kind}:{diagnostic.subject.id}
          </span>
        ) : null}
      </div>

      {details.required !== undefined || details.actual !== undefined ? (
        <div className="diagnostic__detail">
          required {formatJsonValue(details.required)} · actual{" "}
          {formatJsonValue(details.actual)}
        </div>
      ) : null}

      {details.resolution ? (
        <div className="diagnostic__resolution">→ {details.resolution}</div>
      ) : null}
    </div>
  );
}
