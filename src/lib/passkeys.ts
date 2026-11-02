import "server-only";
import { cookies } from "next/headers";
import { appOrigin } from "@/lib/request";

/**
 * Passkeys (WebAuthn) via @simplewebauthn/server.
 *
 * The challenge lives in a short-lived httpOnly cookie rather than a table:
 * it is single-use, five minutes long, and only ever read back by the same
 * browser that asked for it.
 */
const CHALLENGE_COOKIE = "hs_webauthn";
const CHALLENGE_TTL_S = 5 * 60;

export const RP_NAME = "Hackathon Studio";

export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  const origin = await appOrigin();
  const rpID = process.env.WEBAUTHN_RP_ID?.trim() || new URL(origin).hostname;
  return { rpID, origin };
}

export async function storeChallenge(purpose: "register" | "login", challenge: string) {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, `${purpose}:${challenge}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/passkeys",
    maxAge: CHALLENGE_TTL_S,
  });
}

/** Reads and burns the challenge. */
export async function takeChallenge(purpose: "register" | "login"): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(CHALLENGE_COOKIE)?.value ?? "";
  jar.set(CHALLENGE_COOKIE, "", { path: "/api/passkeys", maxAge: 0 });
  const [p, challenge] = raw.split(":");
  if (p !== purpose || !challenge) return null;
  return challenge;
}

export function labelFromUserAgent(ua: string | null): string {
  if (!ua) return "Passkey";
  const device = /iPhone|iPad/.test(ua)
    ? "iPhone/iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return browser ? `${device} · ${browser}` : device;
}
