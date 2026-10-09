import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "./test/fetch";
import { user } from "./test/fixtures";
import { UsersPage } from "./UsersPage";

const me = user();
const other = user({ id: "u2", email: "bob@example.com", firstName: "Bob", lastName: "Babbage" });

async function fillForm(password = "long enough password", confirm = password) {
  await userEvent.type(screen.getByLabelText("First name"), "Grace");
  await userEvent.type(screen.getByLabelText("Last name"), "Hopper");
  await userEvent.type(screen.getByLabelText("Email"), "grace@example.com");
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.type(screen.getByLabelText("Repeat password"), confirm);
}

describe("UsersPage", () => {
  it("lists users, marking you instead of offering to delete", async () => {
    mockFetch({ "GET /api/users": [other, me] });
    render(<UsersPage currentUser={me} />);
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("bob@example.com")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(rows[2]).getByText("You")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mockFetch({ "GET /api/users": () => json({ error: "Database down" }, 500) });
    render(<UsersPage currentUser={me} />);
    expect(await screen.findByText("Database down")).toBeInTheDocument();
  });

  it("creates a user and adds them in name order", async () => {
    const grace = user({ id: "u3", email: "grace@example.com", firstName: "Grace", lastName: "Hopper" });
    const { calls } = mockFetch({ "GET /api/users": [other, me], "POST /api/users": grace });
    render(<UsersPage currentUser={me} />);
    await screen.findByText("bob@example.com");
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByText("Created Grace Hopper")).toBeInTheDocument();
    expect(calls[1].body).toEqual({ email: "grace@example.com", firstName: "Grace", lastName: "Hopper", password: "long enough password" });
    const emails = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent);
    expect(emails).toEqual(["bob@example.com", "grace@example.com", "ada@example.com"]);
    expect(screen.getByLabelText("First name")).toHaveValue("");
  });

  it("checks the passwords match before sending", async () => {
    const { calls } = mockFetch({ "GET /api/users": [me] });
    render(<UsersPage currentUser={me} />);
    await fillForm("long enough password", "different password");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("shows the server's reason a user can't be created", async () => {
    mockFetch({ "GET /api/users": [me], "POST /api/users": () => json({ error: "A user with email grace@example.com already exists" }, 409) });
    render(<UsersPage currentUser={me} />);
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it("deletes a user after confirmation", async () => {
    const { calls } = mockFetch({ "GET /api/users": [other, me], "DELETE /api/users/u2": () => json(null, 204) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<UsersPage currentUser={me} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("bob@example.com"));
    expect(await screen.findByText("Deleted Bob Babbage")).toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    expect(calls.map((c) => c.method)).toEqual(["GET", "DELETE"]);
  });

  it("does nothing when deletion is cancelled", async () => {
    const { calls } = mockFetch({ "GET /api/users": [other, me] });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<UsersPage currentUser={me} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(calls).toHaveLength(1);
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });
});
