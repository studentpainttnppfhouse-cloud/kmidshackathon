import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import { getSettings, setSetting } from "@/lib/settings";

export const AI_SETTING_KEYS = {
  geminiKey: "ai_gemini_key",
  geminiModel: "ai_gemini_model",
} as const;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"] as const;

export type GeminiConfig = {
  apiKey: string | null;
  model: string;
  source: "settings" | "env" | "none";
};

/** The key saved in Settings wins; GEMINI_API_KEY is the fallback. */
export async function getGeminiConfig(): Promise<GeminiConfig> {
  const stored = await getSettings([AI_SETTING_KEYS.geminiKey, AI_SETTING_KEYS.geminiModel]);
  const model = stored[AI_SETTING_KEYS.geminiModel] || DEFAULT_GEMINI_MODEL;
  const saved = decryptField(stored[AI_SETTING_KEYS.geminiKey]);
  if (saved) return { apiKey: saved, model, source: "settings" };
  const env = process.env.GEMINI_API_KEY?.trim();
  if (env) return { apiKey: env, model, source: "env" };
  return { apiKey: null, model, source: "none" };
}

export async function saveGeminiKey(key: string | null): Promise<void> {
  await setSetting(AI_SETTING_KEYS.geminiKey, key ? (encryptField(key) ?? "") : "");
}

export async function saveGeminiModel(model: string): Promise<void> {
  await setSetting(AI_SETTING_KEYS.geminiModel, model);
}
