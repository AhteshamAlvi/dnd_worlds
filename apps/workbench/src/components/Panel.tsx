/*
 * Panel — the titled region every part of the workbench is built from.
 *
 * Not a card and not a box: a faint well with no outline, headed by a mono
 * kicker over a mixed-case serif title and a short accent rule. The kicker
 * says what kind of thing this is, the title says which one.
 *
 * Every panel can be expanded to fill the window. The expansion is done
 * purely by repositioning this same <section> — no portal, no second copy of
 * the children — so nothing inside remounts: an open trace stays open, a
 * half-typed field keeps its text, and the Inspector keeps the tab you were
 * on. Rendering the children twice, or moving them into a modal, would throw
 * all of that away every time you clicked expand.
 *
 * Otherwise presentational. Keeping it dumb means panels can be rearranged
 * without dragging behaviour along with them.
 */

import { useEffect, useState, type ReactNode } from "react";

interface PanelProps {
  title: string;

  // The category above the title ("Roster", "Dossier", "History"). Optional
  // so a panel that would only repeat its own title can leave it off.
  kicker?: string | undefined;

  // Explicit `| undefined` because exactOptionalPropertyTypes is on: without
  // it, callers cannot pass a value that might be undefined.
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;

  // Removes body padding, for panels whose content manages its own spacing.
  flush?: boolean | undefined;

  children: ReactNode;
}

export function Panel({
  title,
  kicker,
  subtitle,
  actions,
  flush,
  children,
}: PanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Escape closes, because a thing covering the window always should.
  useEffect(() => {
    if (!expanded) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <>
      {/* Clicking away closes too. Rendered before the panel so it can never
          sit on top of it. */}
      {expanded ? (
        <div
          className="panel-backdrop"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      ) : null}

      <section
        className={expanded ? "panel panel--expanded" : "panel"}
        {...(expanded ? { role: "dialog", "aria-modal": true } : {})}
        aria-label={expanded ? title : undefined}
      >
        <header className="panel__header">
          {kicker ? <span className="panel__kicker">{kicker}</span> : null}

          <div className="panel__titleline">
            <h2 className="panel__title">{title}</h2>
            {subtitle ? (
              <span className="panel__subtitle">{subtitle}</span>
            ) : null}

            <div className="panel__actions">
              {actions}

              {/* Always last, so its position is the same in every panel. */}
              <button
                type="button"
                className="button button--icon"
                aria-expanded={expanded}
                title={expanded ? "Collapse (Esc)" : "Expand"}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "⤡" : "⤢"}
              </button>
            </div>
          </div>
        </header>

        <div
          className={flush ? "panel__body panel__body--flush" : "panel__body"}
        >
          {children}
        </div>
      </section>
    </>
  );
}
