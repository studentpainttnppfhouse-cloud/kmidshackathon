import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { Logo } from "@/components/brand";
import { Ecg, Mixed, Scallop } from "@/components/ui";
import {
  StickerBandage,
  StickerDroplet,
  StickerStethoscope,
} from "@/components/stickers";
import { ProfileForm } from "@/components/profile-form";
import { decryptField } from "@/lib/crypto";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profileCompletedAt) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col">
      {/* The same pink-panel-into-scallop shape the sign-in page opens with, so
          the first two screens of a new member's life are recognisably one
          place rather than two designs that happen to share a colour. */}
      <div className="hs-band hs-band-pink relative overflow-hidden px-4 pb-14 pt-16 sm:pb-20 sm:pt-24">
        <StickerBandage tilt={-13} className="hs-sticker-scatter left-[8%] top-[16%] h-20 lg:h-28" />
        <StickerDroplet tilt={9} className="hs-sticker-scatter right-[9%] top-[14%] h-20 lg:h-28" />
        <StickerStethoscope
          tilt={-7}
          className="hs-sticker-scatter bottom-[12%] right-[21%] hidden h-20 lg:block lg:h-24"
        />

        <div className="relative z-[2] mx-auto flex w-full max-w-[620px] flex-col items-center gap-3 text-center">
          <Logo size={56} tone="invert" />
          <h1 className="hs-rise hs-rise-2 hs-display">
            <Mixed sticker={<StickerDroplet className="hs-sticker-inline" />}>
              Welcome to Hackathon Studio
            </Mixed>
          </h1>
          <Ecg
            underline
            className="hs-rise hs-rise-3 -mt-0.5 h-9 w-56 text-on-brand/90 sm:w-72"
          />
          <p className="mt-1 max-w-[52ch] text-sm text-on-brand/90 [text-wrap:pretty]">
            One quick setup, then you are in for good. Signed in as{" "}
            <span className="font-semibold text-on-brand">{viewer.email}</span>
          </p>
        </div>
      </div>

      <Scallop from="pink" to="b" />

      <div className="hs-band hs-band-b grow px-4 pb-14 pt-10">
        <div className="mx-auto w-full max-w-2xl">
        <div className="hs-card border-brand/45 p-6">
          <ProfileForm
            submitLabel="Finish setup"
            defaults={{
              nickname: viewer.nickname,
              grade: viewer.grade,
              phone: decryptField(viewer.phone),
              lineId: decryptField(viewer.lineId),
              shirtSize: viewer.shirtSize,
              roleTitle: viewer.roleTitle,
              avatarUrl: viewer.avatarUrl,
            }}
          />
        </div>
        </div>
      </div>
    </main>
  );
}
