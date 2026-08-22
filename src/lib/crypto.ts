import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encryption at rest for the handful of fields that are genuinely personal.
 *
 * Most of what the portal stores is work: task titles, document links, who owns
 * what. Losing a copy of that is embarrassing. Two columns are different —
 * `phone` and `lineId` are direct contact details for school students, which
 * under PDPA is personal data with a real person on the other end of it. A
 * database snapshot that leaks those is a different kind of incident.
 *
 * So they are stored as AES-256-GCM ciphertext. The key is derived from
 * AUTH_SECRET, which Render generates and holds outside the repository.
 *
 * What this does and does not buy:
 *
 *   - It protects a *stolen database*: a dumped TiDB table, a leaked backup, a
 *     misconfigured export. That is the realistic threat for a project this
 *     size and it is exactly what this stops.
 *   - It does not protect against an attacker who already has the running app,
 *     because the app must be able to read these fields to show them. Nothing
 *     short of client-side encryption would, and that would break the directory.
 *
 * Two properties matter for not breaking a live portal:
 *
 *   - Reading tolerates plaintext. Rows written before this existed still
 *     display; they get encrypted the next time their owner saves.
 *   - With no AUTH_SECRET set, writing stays plaintext instead of throwing, and
 *     a warning is logged once. A local checkout without a secret must still
 *     run, and silently storing something the deployment cannot decrypt later
 *     is worse than storing it in the clear knowingly.
 */

const PREFIX = "enc.v1.";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

let warned = false;

function key(): Buffer | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16 || secret.startsWith("replace-me")) {
    if (!warned) {
      warned = true;
      console.warn(
        "[crypto] AUTH_SECRET is not set — phone numbers and LINE IDs will be stored unencrypted. " +
          "Generate one with `openssl rand -base64 32`.",
      );
    }
    return null;
  }
  // A KDF, not the raw string: AUTH_SECRET is base64 text of arbitrary length
  // and AES needs exactly 32 bytes.
  return createHash("sha256").update(`hackathon-studio:field:${secret}`).digest();
}

export function encryptionAvailable(): boolean {
  return key() !== null;
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return null;

  const k = key();
  if (!k) return plain;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, body]).toString("base64");
}

export function decryptField(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") return null;
  if (!stored.startsWith(PREFIX)) return stored; // written before encryption existed

  const k = key();
  if (!k) return null; // ciphertext with no key: show nothing rather than gibberish

  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
    const body = raw.subarray(IV_BYTES + 16);

    const decipher = createDecipheriv(ALGORITHM, k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // A rotated AUTH_SECRET, or a truncated column. Neither should 500 a page.
    return null;
  }
}

/**
 * Constant-time comparison for one-time codes that arrive in a URL.
 *
 * Kept here rather than in session.ts so that every code path — invites,
 * resets, form links — reaches for the same one.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // Hashing first keeps the compare constant-time even when the lengths differ,
  // which a plain length check leaks.
  const ah = createHash("sha256").update(ab).digest();
  const bh = createHash("sha256").update(bb).digest();
  return timingSafeEqual(ah, bh);
}
