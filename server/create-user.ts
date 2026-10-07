// Creates a user from the command line, e.g. the first one, which can then
// add others in the app:
//
//   npm run user:create
//   docker compose exec app node server/create-user.ts

import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { pool } from "./db.ts";
import { ApiError } from "./errors.ts";
import { createUser, parseNewUser } from "./users.ts";

// readline echoes what is typed; route its output through here so it can be
// silenced while a password is entered.
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
// The iterator buffers lines, so piped input works as well as typing.
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, hidden = false) {
  process.stdout.write(question);
  muted = hidden;
  try {
    const { value, done } = await lines.next();
    if (done) throw new ApiError(400, "Input ended early");
    return value;
  } finally {
    muted = false;
    if (hidden) process.stdout.write("\n");
  }
}

try {
  const email = await ask("Email: ");
  const firstName = await ask("First name: ");
  const lastName = await ask("Last name: ");
  const password = await ask("Password: ", true);
  if ((await ask("Repeat password: ", true)) !== password) throw new ApiError(400, "Passwords do not match");

  const user = await createUser(parseNewUser({ email, firstName, lastName, password }), "create-user.ts");
  console.log(`Created ${user.firstName} ${user.lastName} <${user.email}>`);
} catch (e) {
  console.error(e instanceof ApiError ? e.message : e);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}
