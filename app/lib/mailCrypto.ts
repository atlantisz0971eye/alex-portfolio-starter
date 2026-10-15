import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const secret = process.env.MAIL_TOKEN_KEY;
  if (!secret || secret.length < 32) return null;
  return createHash("sha256").update(secret).digest();
}

export function mailKeyConfigured() {
  return key() !== null;
}

/** AES-256-GCM so stored refresh tokens are useless without MAIL_TOKEN_KEY. */
export function encryptToken(plain: string) {
  const k = key();
  if (!k) throw new Error("MAIL_TOKEN_KEY is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", new Uint8Array(k), new Uint8Array(iv));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()].map((chunk) => new Uint8Array(chunk)));
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(value: string) {
  const k = key();
  if (!k) throw new Error("MAIL_TOKEN_KEY is not configured");
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized token format");
  const decipher = createDecipheriv("aes-256-gcm", new Uint8Array(k), new Uint8Array(Buffer.from(iv, "base64url")));
  decipher.setAuthTag(new Uint8Array(Buffer.from(tag, "base64url")));
  return Buffer.concat([decipher.update(new Uint8Array(Buffer.from(data, "base64url"))), decipher.final()].map((chunk) => new Uint8Array(chunk))).toString("utf8");
}
