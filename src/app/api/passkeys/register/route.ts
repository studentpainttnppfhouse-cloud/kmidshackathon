import { NextResponse, type NextRequest } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/session";
import { RULES, rateLimit } from "@/lib/rate-limit";
import { userAgent } from "@/lib/request";
import { RP_NAME, labelFromUserAgent, relyingParty, storeChallenge, takeChallenge } from "@/lib/passkeys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: options for adding a passkey to the signed-in account. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Signed out" }, { status: 401 });

  const { rpID } = await relyingParty();
  const existing = await db.passkey.findMany({
    where: { userId: viewer.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: viewer.username || viewer.email,
    userDisplayName: viewer.nickname || viewer.name,
    userID: new TextEncoder().encode(viewer.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as never) : undefined,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });

  await storeChallenge("register", options.challenge);
  return NextResponse.json(options);
}

/** POST: verify the browser's attestation and save the credential. */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Signed out" }, { status: 401 });

  const limit = rateLimit(`write:${viewer.id}`, RULES.write);
  if (!limit.ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  const challenge = await takeChallenge("register");
  if (!challenge) return NextResponse.json({ error: "That took too long. Try again." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as RegistrationResponseJSON | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { rpID, origin } = await relyingParty();
  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("not verified");

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await db.passkey.create({
      data: {
        userId: viewer.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: labelFromUserAgent(await userAgent()).slice(0, 80),
      },
    });
    await audit(viewer.id, "passkey.added", {
      type: "user",
      id: viewer.id,
      detail: "Registered a new passkey for their own account.",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await audit(viewer.id, "passkey.add_failed", {
      type: "user",
      id: viewer.id,
      detail: `Passkey registration failed: ${error instanceof Error ? error.message : "unknown error"}`.slice(0, 500),
    });
    return NextResponse.json({ error: "That passkey could not be saved. Try again." }, { status: 400 });
  }
}
