"use client";

import { useActionState } from "react";
import { saveProfile } from "@/lib/actions/profile";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const GRADES = ["Grade 10", "Grade 11", "Grade 12", "Teacher", "Alumni"];

export function ProfileForm({
  defaults,
  submitLabel = "Save profile",
}: {
  defaults: {
    nickname: string | null;
    grade: string | null;
    phone: string | null;
    lineId: string | null;
    shirtSize: string | null;
    roleTitle: string | null;
    avatarUrl: string | null;
  };
  submitLabel?: string;
}) {
  const [state, action] = useActionState(saveProfile, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="nickname">
            Nickname
          </label>
          <input
            id="nickname"
            name="nickname"
            required
            defaultValue={defaults.nickname ?? ""}
            placeholder="Ploy"
            className="hs-input"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="grade">
            Grade
          </label>
          <select id="grade" name="grade" defaultValue={defaults.grade ?? ""} className="hs-input">
            <option value="">Select…</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="roleTitle">
            Role title
          </label>
          <input
            id="roleTitle"
            name="roleTitle"
            defaultValue={defaults.roleTitle ?? ""}
            placeholder="Graphic Designer"
            className="hs-input"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="shirtSize">
            Shirt size
          </label>
          <select
            id="shirtSize"
            name="shirtSize"
            defaultValue={defaults.shirtSize ?? ""}
            className="hs-input"
          >
            <option value="">Select…</option>
            {SHIRT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={defaults.phone ?? ""}
            placeholder="08x xxx xxxx"
            className="hs-input"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="lineId">
            LINE ID
          </label>
          <input
            id="lineId"
            name="lineId"
            defaultValue={defaults.lineId ?? ""}
            placeholder="@yourline"
            className="hs-input"
          />
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="avatarUrl">
          Photo link (optional)
        </label>
        <input
          id="avatarUrl"
          name="avatarUrl"
          type="url"
          defaultValue={defaults.avatarUrl ?? ""}
          placeholder="https://drive.google.com/…"
          className="hs-input"
        />
        <p className="mt-1.5 text-xs text-faint">
          Paste a public image link. The portal stores the link, not the file.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok-strong">
          {state.ok}
        </p>
      ) : null}

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
