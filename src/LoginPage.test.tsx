import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { json, mockFetch } from "./test/fetch";
import { user } from "./test/fixtures";

describe("LoginPage", () => {
  it("logs in and hands over the user", async () => {
    const { calls } = mockFetch({ "POST /api/auth/login": user() });
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(onLogin).toHaveBeenCalledWith(user());
    expect(calls[0].body).toEqual({ email: "ada@example.com", password: "secret password" });
  });

  it("shows the error and clears the password on failure", async () => {
    mockFetch({ "POST /api/auth/login": () => json({ error: "Incorrect email or password" }, 401) });
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("shows the app version", () => {
    render(<LoginPage onLogin={() => {}} />);
    expect(screen.getByText(`Version ${__APP_VERSION__}`)).toBeInTheDocument();
  });
});
