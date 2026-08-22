/**
 * TiDB Cloud Serverless refuses every connection that is not TLS:
 *
 *   ERROR HY000 (1105): Connections using insecure transport are prohibited
 *
 * Prisma's MySQL connector only negotiates TLS when the connection string asks
 * for it, and the string TiDB Cloud shows under "Connect" does not always carry
 * the parameter. Rather than depend on whoever pastes DATABASE_URL into Render
 * remembering the suffix, every entry point — the app, the Prisma CLI, the seed
 * script — runs the URL through here first.
 *
 * Only TiDB Cloud hosts are touched. A local MySQL without a certificate keeps
 * working, and an explicit ssl* parameter of any kind is always left alone, so
 * `?sslaccept=accept_invalid_certs` remains available as an escape hatch.
 */

/** Any of these means somebody already made a deliberate TLS choice. */
const TLS_PARAMS = [
  "sslaccept",
  "sslmode",
  "sslcert",
  "sslidentity",
  "sslpassword",
  "sslca",
];

const TLS_PARAM_PATTERN = new RegExp(`[?&](${TLS_PARAMS.join("|")})=`, "i");
const TIDB_CLOUD_HOST = /(^|\.)tidbcloud\.com$/i;
const TIDB_CLOUD_FALLBACK = /@[^/@]*\.tidbcloud\.com[:/?]/i;

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// Both checks consult the parsed URL *and* the raw string. An unencoded "#" or
// "?" in a password parses without throwing but lands the real host in the
// fragment, so the parsed view alone would quietly miss a TiDB address.
function hasTlsParam(raw: string, url: URL | null): boolean {
  if (url && TLS_PARAMS.some((param) => url.searchParams.has(param))) return true;
  return TLS_PARAM_PATTERN.test(raw);
}

function isTidbCloud(raw: string, url: URL | null): boolean {
  if (url && TIDB_CLOUD_HOST.test(url.hostname)) return true;
  return TIDB_CLOUD_FALLBACK.test(raw);
}

/**
 * Adds `sslaccept=strict` to a TiDB Cloud connection string that is missing it.
 * Anything else — a local MySQL, an empty value, a string that already makes a
 * TLS choice — is returned untouched.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;

  const trimmed = raw.trim();
  const url = parse(trimmed);

  if (hasTlsParam(trimmed, url)) return trimmed;
  if (!isTidbCloud(trimmed, url)) return trimmed;

  return `${trimmed}${trimmed.includes("?") ? "&" : "?"}sslaccept=strict`;
}

/** The connection string the app should actually dial, read from the env. */
export function resolveDatabaseUrl(): string | undefined {
  return normalizeDatabaseUrl(process.env.DATABASE_URL);
}
