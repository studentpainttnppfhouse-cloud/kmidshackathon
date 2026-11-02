"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { isAdmin, requireViewer } from "@/lib/authorize";
import type { FormState } from "@/lib/actions/auth";
import { GEMINI_MODELS, saveGeminiKey, saveGeminiModel } from "@/lib/ai/config";

export async function saveGeminiSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (!isAdmin(viewer)) {
    await audit(viewer.id, "ai.settings_denied", {
      type: "setting",
      detail: "Tried to change the Gemini settings without admin rights (denied)",
    });
    return { error: "Only an admin or the owner can change the AI settings." };
  }

  const key = String(formData.get("apiKey") ?? "").trim();
  const clear = formData.get("clearKey") === "on";
  const model = String(formData.get("model") ?? "");

  if (!(GEMINI_MODELS as readonly string[]).includes(model)) return { error: "Pick a model from the list." };
  if (key && (key.length < 20 || key.length > 200 || /\s/.test(key))) {
    return { error: "That does not look like a Gemini API key." };
  }

  await saveGeminiModel(model);
  if (clear) await saveGeminiKey(null);
  else if (key) await saveGeminiKey(key);

  await audit(viewer.id, "ai.settings_updated", {
    type: "setting",
    detail: `Gemini settings updated: model ${model}${clear ? ", key removed" : key ? ", new key saved (encrypted)" : ""}`,
  });
  revalidatePath("/settings");
  revalidatePath("/assistant");
  return { ok: clear ? "Key removed." : "Saved." };
}
