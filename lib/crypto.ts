import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "css301-db-schema-control-default-key";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a database connection URI at rest using AES-256-GCM (SDD Section 4.3).
 */
export function encryptConnectionUri(plainUri: string): string {
  if (!plainUri) return plainUri;
  if (plainUri.startsWith(PREFIX)) return plainUri;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainUri, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted connection URI for server-side database pooling.
 */
export function decryptConnectionUri(storedUri: string): string {
  if (!storedUri || !storedUri.startsWith(PREFIX)) {
    return storedUri;
  }

  const payload = storedUri.slice(PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted connection URI.");
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Masks credentials in a PostgreSQL URI so passwords never appear in logs or API responses (SDD Section 5.3).
 */
export function maskConnectionUri(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith(PREFIX)) return "postgresql://****:****@encrypted-vault";

  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return uri.replace(/:([^:@/]+)@/, ":****@");
  }
}

/**
 * Validates that a string is a syntactically valid PostgreSQL connection URI.
 */
export function validatePostgresUri(uri: string): {
  valid: boolean;
  error?: string;
} {
  if (!uri || typeof uri !== "string" || !uri.trim()) {
    return { valid: false, error: "Connection URI is required." };
  }

  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return {
        valid: false,
        error: "Connection URI must use postgres:// or postgresql:// protocol.",
      };
    }
    if (!parsed.hostname) {
      return { valid: false, error: "Connection URI must include a valid host." };
    }
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!dbName) {
      return {
        valid: false,
        error: "Connection URI must specify a target database name.",
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid PostgreSQL connection URI format." };
  }
}
