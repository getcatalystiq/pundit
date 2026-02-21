import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derive an encryption key using HKDF from the master ENCRYPTION_KEY.
 * Uses a purpose string to create per-use derived keys.
 */
function deriveKey(masterKeyHex: string, purpose: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  return crypto.hkdfSync(
    "sha256",
    masterKey,
    Buffer.alloc(0), // no salt
    purpose,
    32
  ) as unknown as Buffer;
}

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)"
    );
  }
  return key;
}

/**
 * Encrypt plaintext using AES-256-GCM with HKDF-derived key.
 * Uses AAD (Additional Authenticated Data) to bind ciphertext to its context.
 */
export function encrypt(
  plaintext: string,
  aad?: string
): {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
} {
  const key = deriveKey(getMasterKey(), "pundit-tenant-creds");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  if (aad) {
    cipher.setAAD(Buffer.from(aad));
  }

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return { encrypted, iv, tag };
}

/**
 * Decrypt ciphertext using AES-256-GCM with HKDF-derived key.
 * AAD must match what was used during encryption.
 */
export function decrypt(
  encrypted: Buffer,
  iv: Buffer,
  tag: Buffer,
  aad?: string
): string {
  const key = deriveKey(getMasterKey(), "pundit-tenant-creds");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  if (aad) {
    decipher.setAAD(Buffer.from(aad));
  }

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
