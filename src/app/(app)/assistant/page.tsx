import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin, requireViewer } from "@/lib/authorize";
import { getGeminiConfig } from "@/lib/ai/config";
import { AiChat } from "@/components/ai-chat";
import { Banner, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const viewer = await requireViewer();
  const config = await getGeminiConfig();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Workspace" title="Assistant" />
      {config.apiKey ? (
        <Card>
          <AiChat />
        </Card>
      ) : (
        <Banner tone="warn">
          The assistant is not set up yet.{" "}
          {isAdmin(viewer) ? (
            <Link href="/settings?tab=integrations" className="underline">Add a Gemini API key in Settings.</Link>
          ) : (
            "Ask an admin to add a Gemini API key."
          )}
        </Banner>
      )}
    </div>
  );
}
