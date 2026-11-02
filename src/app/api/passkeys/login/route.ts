import { NextResponse, type NextRequest } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/session";
import { RULES, rateLimit, retryMessage } from "@/lib/rate-limit";
import { clientIp, displayIp, userAgent } from "@/lib/request";
import { relyingParty, storeChallenge, takeChallenge } from "@/lib/passkeys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: a discoverable-credential challenge (no username needed). */
export async function GET() {
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await storeChallenge("login", options.challenge);
  return NextResponse.json(options);
}

/** POST: verify the assertion and sign the person in. */
export async function POST(request: NextRequest) {
  const ip = await clientIp();
  const limit = rateLimit(`login:${ip}`, RULES.login);
  if (!limit.ok) return NextResponse.json({ error: retryMessage(limit.retryAfter) }, { status: 429 });

  const fail = "That passkey did not work. Try again or use your password.";
  const challenge = await takeChallenge("login");
  if (!challenge) return NextResponse.json({ error: "That took too long. Try again." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!body?.id) return NextResponse.json({ error: fail }, { status: 400 });

  const passkey = await db.passkey.findUnique({
    where: { credentialId: body.id },
    include: { user: true },
  });
  if (!passkey || !passkey.user || passkey.user.deletedAt || !passkey.user.isActive) {
    await audit(passkey?.userId ?? null, "login.passkey_failed", {
      type: "user",
      id: passkey?.userId,
      detail: passkey ? "Passkey sign-in refused: account is suspended or deleted." : "Passkey sign-in refused: unknown credential.",
    });
    return NextResponse.json({ error: fail }, { status: 400 });
  }

  const { rpID, origin } = await relyingParty();
  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
    });
    if (!verification.verified) throw new Error("not verified");

    await db.passkey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
  } catch (error) {
    await audit(passkey.userId, "login.passkey_failed", {
      type: "user",
      id: passkey.userId,
      detail: `Passkey sign-in failed verification: ${error instanceof Error ? error.message : "unknown"}`.slice(0, 500),
    });
    return NextResponse.json({ error: fail }, { status: 400 });
  }

  const user = passkey.user;
  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id, { userAgent: await userAgent(), ip: await displayIp() });
  await audit(user.id, "login.success", {
    type: "user",
    id: user.id,
    detail: "Signed in with a passkey.",
  });

  return NextResponse.json({ ok: true, redirect: user.profileCompletedAt ? "/dashboard" : "/welcome" });
}
