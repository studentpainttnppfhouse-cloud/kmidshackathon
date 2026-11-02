"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";
import { saveGeminiSettings } from "@/lib/ai/settings-actions";
import { Feedback, PasswordField, SubmitButton } from "@/components/form-bits";

const initial: FormState = {};

export function AiSettingsForm({
  source,
  model,
  models,
}: {
  source: "settings" | "env" | "none";
  model: string;
  models: string[];
}) {
  const [state, action] = useActionState(saveGeminiSettings, initial);
  const status = {
    settings: "A key is saved (encrypted).",
    env: "Using GEMINI_API_KEY from the server environment.",
    none: "No key set — the assistant is off.",
  }[source];

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">{status}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          id="gemini-key"
          name="apiKey"
          label="Gemini API key"
          autoComplete="off"
          placeholder={source === "settings" ? "Leave blank to keep the saved key" : "AIza…"}
        />
        <div>
          <label className="hs-label" htmlFor="gemini-model">Model</label>
          <select id="gemini-model" name="model" defaultValue={model} className="hs-input">
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      {source === "settings" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clearKey" /> Remove the saved key
        </label>
      ) : null}
      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-secondary" pendingLabel="Saving…">
        Save AI settings
      </SubmitButton>
    </form>
  );
}
