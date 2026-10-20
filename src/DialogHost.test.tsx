import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DialogHost } from "./DialogHost";
import { alertDialog, confirmDialog } from "./dialogs";
import { dialogOpen, openDialog } from "./test/dialogs";

const ask = (options: Partial<Parameters<typeof confirmDialog>[0]> = {}) => {
  let answer: Promise<boolean>;
  act(() => {
    answer = confirmDialog({ title: "Delete it?", message: "It can't be undone.", ...options });
  });
  return answer!;
};

describe("DialogHost", () => {
  it("shows nothing until asked", () => {
    render(<DialogHost />);
    expect(dialogOpen()).toBe(false);
  });

  it("resolves a confirmation true or false", async () => {
    render(<DialogHost />);
    const yes = ask({ confirmLabel: "Delete" });
    const dialog = await openDialog();
    expect(screen.getByRole("dialog", { name: "Delete it?" })).toHaveAccessibleDescription("It can't be undone.");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await yes).toBe(true);
    expect(dialogOpen()).toBe(false);

    const no = ask();
    await userEvent.click((await openDialog()).getByRole("button", { name: "Cancel" }));
    expect(await no).toBe(false);
  });

  it("cancels on Escape or a click outside", async () => {
    render(<DialogHost />);
    const escaped = ask();
    await openDialog();
    await userEvent.keyboard("{Escape}");
    expect(await escaped).toBe(false);

    const outside = ask();
    await openDialog();
    await userEvent.click(document.querySelector(".dialog-backdrop")!);
    expect(await outside).toBe(false);
  });

  it("focuses Cancel for a destructive action, and the confirm button otherwise", async () => {
    render(<DialogHost />);
    ask({ danger: true, confirmLabel: "Delete" });
    expect((await openDialog()).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    ask({ confirmLabel: "Replace" });
    expect((await openDialog()).getByRole("button", { name: "Replace" })).toHaveFocus();
  });

  it("shows a message with one button, and queues dialogs in order", async () => {
    render(<DialogHost />);
    let shown!: Promise<void>;
    act(() => {
      shown = alertDialog({ title: "Could not open", message: "Server error" });
    });
    const next = ask({ title: "Next?" });
    expect(screen.getByRole("alertdialog", { name: "Could not open" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    await shown;
    expect(screen.getByRole("dialog", { name: "Next?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(await next).toBe(true);
  });
});
