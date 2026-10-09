import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./passwords.ts";

describe("passwords", () => {
  it("hashes with scrypt in a self-describing format", async () => {
    const hash = await hashPassword("a long password");
    const [scheme, n, r, p, salt, key] = hash.split("$");
    expect([scheme, n, r, p]).toEqual(["scrypt", String(2 ** 17), "8", "1"]);
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(key, "base64")).toHaveLength(32);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("a long password");
    expect(await verifyPassword("a long password", hash)).toBe(true);
    expect(await verifyPassword("a long passworD", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("verifies hashes made with other cost parameters", async () => {
    // Stored hashes carry their own N, r and p, so the cost can change later.
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.from("0123456789abcdef");
    const key = scryptSync("pw", salt, 32, { N: 1024, r: 8, p: 1 });
    const hash = ["scrypt", 1024, 8, 1, salt.toString("base64"), key.toString("base64")].join("$");
    expect(await verifyPassword("pw", hash)).toBe(true);
  });

  it.each(["", "bcrypt$1$2$3$c2FsdA==$aGFzaA==", "scrypt$1024$8$1$$"])("rejects malformed hash %j", async (stored) => {
    expect(await verifyPassword("anything", stored)).toBe(false);
  });

  it("has a dummy hash that matches no password", async () => {
    expect(DUMMY_HASH).toMatch(/^scrypt\$/);
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
  });
});
