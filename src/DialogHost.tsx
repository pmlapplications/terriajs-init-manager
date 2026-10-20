// Shows the dialogs queued by confirmDialog() and alertDialog() (dialogs.ts),
// one at a time and on top of any other modal. Escape or a click outside
// cancels a confirmation and dismisses a message.

import { useEffect, useSyncExternalStore } from "react";
import { currentDialog, settleDialog, subscribeDialogs } from "./dialogs";

export function DialogHost() {
  const current = useSyncExternalStore(subscribeDialogs, currentDialog);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Don't let a modal underneath close too.
      e.stopImmediatePropagation();
      settleDialog(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [current]);

  if (!current) return null;
  const { title, message, confirmLabel = "OK", cancelLabel = "Cancel", danger = false, cancellable } = current;

  return (
    <div className="modal-backdrop dialog-backdrop" onClick={() => settleDialog(false)}>
      <div
        className="modal dialog"
        role={cancellable ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-message" className="dialog-message">
          {message}
        </p>
        <div className="modal-actions">
          {cancellable && (
            <button type="button" className="btn" autoFocus={danger} onClick={() => settleDialog(false)}>
              {cancelLabel}
            </button>
          )}
          <button type="button" className={`btn ${danger ? "danger" : "primary"}`} autoFocus={!danger} onClick={() => settleDialog(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
