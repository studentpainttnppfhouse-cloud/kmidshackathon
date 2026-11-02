import { isAdmin, type Viewer } from "@/lib/authorize";
import { getGeminiConfig, GEMINI_MODELS } from "@/lib/ai/config";
import { Card, SectionTitle } from "@/components/ui";
import { AiSettingsForm } from "@/components/ai-settings-form";

/** Gemini key and model. Admin and owner only; renders nothing for others. */
export async function AiSettings({ viewer }: { viewer: Viewer }) {
  if (!isAdmin(viewer)) return null;
  const config = await getGeminiConfig();
  return (
    <Card id="ai-assistant">
      <SectionTitle>AI assistant (Gemini)</SectionTitle>
      <AiSettingsForm source={config.source} model={config.model} models={[...GEMINI_MODELS]} />
    </Card>
  );
}
