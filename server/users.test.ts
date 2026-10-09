import { describe, expect, it } from "vitest";
import { ApiError } from "./errors.ts";
import { parseNewUser } from "./users.ts";

const valid = { email: " ada@example.com ", firstName: " Ada ", lastName: "Lovelace", password: "0123456789" };

describe("parseNewUser", () => {
  it("trims names and email but not the password", () => {
    expect(parseNewUser({ ...valid, password: " 0123456789 " })).toEqual({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      password: " 0123456789 ",
    });
  });

  it.each([
    [null, "Email is required"],
    ["text", "Email is required"],
    [{ ...valid, email: "ada@example" }, "Email address is not valid"],
    [{ ...valid, email: "a da@example.com" }, "Email address is not valid"],
    [{ ...valid, password: "012345678" }, "Password must be at least 10 characters"],
    [{ ...valid, password: 1234567890 }, "Password must be at least 10 characters"],
    [{ ...valid, password: "x".repeat(1025) }, "Password is too long"],
    [{ ...valid, firstName: "" }, "First name is required"],
    [{ ...valid, lastName: 3 }, "Last name is required"],
  ])("rejects %j", (body, message) => {
    expect(() => parseNewUser(body)).toThrow(new ApiError(400, message));
    try {
      parseNewUser(body);
    } catch (e) {
      expect((e as ApiError).status).toBe(400);
    }
  });
});
