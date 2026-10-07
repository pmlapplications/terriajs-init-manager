// Password hashing with Node's built-in scrypt.

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

// OWASP-recommended scrypt cost (N=2^17, r=8, p=1). maxmem must cover 128*N*r.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const maxmem = (n: number, r: number) => 256 * n * r;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: maxmem(Number(n), Number(r)),
  });
  return timingSafeEqual(key, expected);
}

// Verified against when the email is unknown, so a failed login takes the same
// time whether or not the account exists.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));
