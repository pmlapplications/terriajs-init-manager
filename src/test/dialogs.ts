import { waitFor, within } from "@testing-library/react";

/** Queries inside the open confirmation or message (DialogHost.tsx), once it appears. */
export const openDialog = async () =>
  within(
    await waitFor(() => {
      const dialog = document.querySelector<HTMLElement>(".modal.dialog");
      if (!dialog) throw new Error("No dialog is open");
      return dialog;
    }),
  );

/** True while a confirmation or message is showing. */
export const dialogOpen = () => document.querySelector(".modal.dialog") !== null;
