/*
 * ConfirmDialog — a modal the user has to answer before something
 * irreversible happens.
 *
 * The workbench's usual confirmation is the two-click button (click ✕, the
 * button turns into "confirm?", click again). That is the right weight for
 * discarding something the app itself generated. It is not the right weight
 * for deleting a character someone named and built, which is a real file
 * leaving a git-tracked vault — so that case escalates to this, which cannot
 * be dismissed by the pointer drifting off a button.
 *
 * A popover, so per the visual language it is the one place a shadow is
 * allowed. Escape and the backdrop both cancel; the cancel button takes focus
 * on open, so the dangerous option is never the one a stray Return lands on.
 */

import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;

  // The consequence, in prose. Whatever is being acted on should appear here
  // by name so the dialog is answerable without looking behind it.
  children: ReactNode;

  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;

  // Styles the confirm button as destructive. On by default because that is
  // what a dialog like this is nearly always for.
  danger?: boolean | undefined;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Escape closes, because a thing covering the window always should. The
  // listener is on window rather than the dialog so it works no matter where
  // focus went afterwards.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <>
      {/* Rendered before the dialog so it can never sit on top of it. */}
      <div
        className="panel-backdrop panel-backdrop--modal"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 className="confirm__title" id="confirm-title">
          {title}
        </h2>

        <div className="confirm__body">{children}</div>

        <div className="confirm__actions">
          <button
            type="button"
            className="button"
            ref={cancelRef}
            onClick={onCancel}
          >
            cancel
          </button>

          <button
            type="button"
            className={danger ? "button button--danger" : "button"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
