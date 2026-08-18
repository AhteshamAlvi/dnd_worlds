/*
 * StatRow — a label/value line with tabular numerals so digits align down the
 * column. Used anywhere the workbench reports an engine-derived figure.
 */

import type { ReactNode } from "react";

interface StatRowProps {
  label: string;
  value: ReactNode;

  // A short trailing note, e.g. a unit or a caveat.
  note?: string | undefined;

  // Brass-highlights the value; reserve it for the headline number of a panel.
  emphasis?: boolean | undefined;
}

export function StatRow({ label, value, note, emphasis }: StatRowProps) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>

      <span
        className={
          emphasis ? "stat__value stat__value--emphasis" : "stat__value"
        }
      >
        {value}
        {note ? <span className="stat__note"> {note}</span> : null}
      </span>
    </div>
  );
}
