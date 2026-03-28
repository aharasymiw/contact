import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function scryptPromise(value: string, salt: string, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(value, salt, keyLength, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey as Buffer);
    });
  });
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptPromise(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, salt, digest] = storedHash.split("$");

  if (scheme !== "scrypt" || !salt || !digest) {
    return false;
  }

  const derivedKey = await scryptPromise(password, salt, 64);
  const storedBuffer = Buffer.from(digest, "hex");

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedKey);
}
