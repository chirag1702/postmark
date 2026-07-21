import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit, standard for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const VERSION_PREFIX = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  cachedKey = key;
  return key;
}

/** Encrypts a plaintext token. Storage format: "v1.<base64(iv|authTag|ciphertext)>" */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `${VERSION_PREFIX}.${payload.toString("base64")}`;
}

export function decryptToken(stored: string): string {
  const [version, body] = stored.split(".");
  if (version !== VERSION_PREFIX || !body) {
    throw new Error("Unrecognized token payload format");
  }
  const payload = Buffer.from(body, "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
