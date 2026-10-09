// The command-line entry points, run as real processes against the test database.

import { spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { VERSION } from "../version.ts";
import { Client, resetDatabase } from "./helpers.ts";

beforeAll(resetDatabase);
afterAll(() => pool.end());

/** Runs a server script with `input` on stdin; resolves with its output and exit code. */
function run(script: string, input: string, env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

describe("create-user.ts", () => {
  it("creates a user who can log in", async () => {
    const { code, stdout } = await run("server/create-user.ts", "cli@example.com\nCli\nUser\ncli password 1\ncli password 1\n");
    expect(stdout).toContain("Created Cli User <cli@example.com>");
    expect(code).toBe(0);
    expect((await new Client().login("cli@example.com", "cli password 1")).status).toBe(200);
    const { rows } = await pool.query("select created_by from app_user where email = 'cli@example.com'");
    expect(rows[0].created_by).toBe("create-user.ts");
  });

  it("doesn't echo the password", async () => {
    const { stdout } = await run("server/create-user.ts", "echo@example.com\nE\nU\nsecret password\nsecret password\n");
    expect(stdout).not.toContain("secret password");
  });

  it.each([
    ["mismatched passwords", "x@example.com\nX\nY\nfirst password\nsecond password\n", "Passwords do not match"],
    ["input that ends early", "x@example.com\nX\n", "Input ended early"],
    ["an invalid user", "not-an-email\nX\nY\npassword123\npassword123\n", "Email address is not valid"],
  ])("fails on %s", async (_label, input, message) => {
    const { code, stderr } = await run("server/create-user.ts", input);
    expect(stderr).toContain(message);
    expect(code).toBe(1);
  });
});

describe("index.ts", () => {
  it("serves the API on PORT and logs the version", async () => {
    const port = String(40000 + Math.floor(Math.random() * 20000));
    const child = spawn(process.execPath, ["server/index.ts"], { env: { ...process.env, PORT: port } });
    try {
      const line = await new Promise<string>((resolve, reject) => {
        child.stdout.on("data", (d) => resolve(String(d)));
        child.on("exit", (code) => reject(new Error(`Exited with ${code}`)));
      });
      expect(line).toContain(`TerriaJS Init Manager ${VERSION} listening on http://localhost:${port}`);
      const res = await fetch(`http://localhost:${port}/api/health`);
      expect(await res.json()).toEqual({ ok: true, version: VERSION });
    } finally {
      child.kill();
    }
  });
});
