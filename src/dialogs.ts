// Modal replacements for window.alert() and window.confirm(). confirmDialog()
// and alertDialog() queue a dialog and return a promise; DialogHost.tsx,
// rendered once by Root, shows the queue one dialog at a time.

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Label of the button that confirms; default "OK". */
  confirmLabel?: string;
  /** Label of the button that cancels; default "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as destructive, and focuses Cancel instead. */
  danger?: boolean;
}

export interface PendingDialog extends ConfirmOptions {
  /** false for an alert: one button, and closing it any way dismisses it. */
  cancellable: boolean;
  resolve: (ok: boolean) => void;
}

let queue: PendingDialog[] = [];
const listeners = new Set<() => void>();

function setQueue(next: PendingDialog[]) {
  queue = next;
  listeners.forEach((l) => l());
}

export const subscribeDialogs = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The dialog to show now, if any. */
export const currentDialog = (): PendingDialog | undefined => queue[0];

/** Closes the current dialog: `ok` is true for its confirm button. */
export function settleDialog(ok: boolean) {
  const [current, ...rest] = queue;
  if (!current) return;
  setQueue(rest);
  current.resolve(current.cancellable ? ok : true);
}

/** Cancels every open and queued dialog. */
export function closeAllDialogs() {
  const pending = queue;
  setQueue([]);
  for (const d of pending) d.resolve(!d.cancellable);
}

/** Asks a yes/no question; resolves true if confirmed. */
export const confirmDialog = (options: ConfirmOptions) =>
  new Promise<boolean>((resolve) => setQueue([...queue, { ...options, cancellable: true, resolve }]));

/** Shows a message; resolves when it is dismissed. */
export const alertDialog = (options: { title: string; message: string }) =>
  new Promise<void>((resolve) => setQueue([...queue, { ...options, cancellable: false, resolve: () => resolve() }]));
