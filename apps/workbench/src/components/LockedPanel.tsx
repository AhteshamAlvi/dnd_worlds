/*
 * LockedPanel — marks a region of the workbench whose engine domain doesn't
 * exist yet (Traits, Nen, Hatsu, Combat...).
 *
 * Deliberately visible rather than hidden. Per the workbench's own operating
 * principle, gaps in the engine are shown, not faked or omitted — a locked
 * panel doubles as a roadmap of what's still to build, in front of you while
 * you work rather than in a separate document.
 *
 * Reserved, not dead. The title and reason stay at full readability and the
 * area is hatched rather than greyed out: this is space held open for
 * something specific, which is a different statement from a disabled control.
 * The UNRESOLVED stamp is the workbench's fourth state, distinct from
 * pass/warn/fail — see .locked-panel and .unresolved in index.css.
 */

interface LockedPanelProps {
  reason: string;

  // What's reserved here. Optional for the older call sites that only ever
  // had a sentence to show.
  title?: string | undefined;
}

export function LockedPanel({ reason, title }: LockedPanelProps) {
  return (
    <div className="locked-panel">
      <span className="locked-panel__stamp">Unresolved</span>

      {title ? <h3 className="locked-panel__title">{title}</h3> : null}

      <p className="locked-panel__reason">{reason}</p>
    </div>
  );
}
