"use client";

import { useActionState, useState } from "react";
import {
  createAnnouncement,
  createFile,
  createForm,
  uploadFileAsset,
} from "@/lib/actions/content";
import type { FormState } from "@/lib/actions/auth";
import { Feedback, SubmitButton } from "@/components/form-bits";
import { formatBytes } from "@/lib/attachments";
import { DraftKeeper } from "@/components/draft-keeper";


const initial: FormState = {};

type Dept = { id: string; name: string };

/**
 * Adding an asset: the file itself, or a link to it.
 *
 * Upload is the default because it is what people expect and what they
 * actually want — the link path exists for the files that genuinely cannot
 * live here. The two modes are one form with one submit button rather than two
 * pages, so choosing wrong costs a click and not a re-typed set of tags.
 */
export function FileForm({
  departments,
  maxBytes,
}: {
  departments: Dept[];
  /** The server's limit, passed down: see the note in components/attachments.tsx. */
  maxBytes: number;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [uploadState, uploadAction] = useActionState(uploadFileAsset, initial);
  const [linkState, linkAction] = useActionState(createFile, initial);
  const [oversize, setOversize] = useState<{ name: string; size: number } | null>(null);

  const state = mode === "upload" ? uploadState : linkState;

  return (
    <form action={mode === "upload" ? uploadAction : linkAction} className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="How to add this asset">
        <button
          type="button"
          onClick={() => setMode("upload")}
          aria-pressed={mode === "upload"}
          className={`hs-btn px-3 py-1.5 text-xs ${mode === "upload" ? "hs-btn-primary" : "hs-btn-ghost"}`}
        >
          Upload the file
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          aria-pressed={mode === "link"}
          className={`hs-btn px-3 py-1.5 text-xs ${mode === "link" ? "hs-btn-primary" : "hs-btn-ghost"}`}
        >
          Link to Drive or Canva
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="file-name">
            Asset name
          </label>
          <input
            id="file-name"
            name="name"
            required
            className="hs-input"
            placeholder="Poster template A3"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="file-dept">
            Department
          </label>
          <select id="file-dept" name="departmentId" required className="hs-input">
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "upload" ? (
        <div>
          <label className="hs-label" htmlFor="file-upload">
            The file
          </label>
          <input
            id="file-upload"
            name="file"
            type="file"
            required
            className="hs-input file:mr-3 file:rounded-lg file:border-0 file:bg-tint file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-deep"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              // Told before the upload rather than after it: on a phone the
              // difference is a minute of watching a progress bar fail.
              if (picked && picked.size > maxBytes) {
                setOversize({ name: picked.name, size: picked.size });
                event.target.value = "";
                return;
              }
              setOversize(null);
            }}
          />
          <p className="mt-1.5 text-xs text-faint">
            Up to {formatBytes(maxBytes)}. It goes into the portal database, so every device that
            signs in can open it and a redeploy does not touch it.
          </p>

          {oversize ? (
            <p role="alert" className="hs-feedback hs-feedback-error mt-2">
              <span aria-hidden="true">⚠</span> {oversize.name} is {formatBytes(oversize.size)}.
              Put it in Drive and switch to &ldquo;Link to Drive or Canva&rdquo; above.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div>
            <label className="hs-label" htmlFor="file-url">
              Drive / Canva link
            </label>
            <input
              id="file-url"
              name="externalUrl"
              type="url"
              required
              className="hs-input"
              placeholder="https://drive.google.com/…"
            />
          </div>

          <div>
            <label className="hs-label" htmlFor="file-kind">
              Kind
            </label>
            <select id="file-kind" name="kind" defaultValue="link" className="hs-input">
              {["link", "image", "pdf", "video", "design", "font", "logo"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="hs-label" htmlFor="file-tags">
          Tags
        </label>
        <input
          id="file-tags"
          name="tags"
          className="hs-input"
          placeholder="brand, event-day, 2026-archive"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="isBrandKit" className="accent-pink-500" />
        Show this in the Brand Kit
      </label>

      <Feedback state={state} />
      <SubmitButton
        className="hs-btn hs-btn-primary"
        pendingLabel={mode === "upload" ? "Uploading…" : "Linking…"}
      >
        {mode === "upload" ? "Upload asset" : "Link asset"}
      </SubmitButton>
    </form>
  );
}

export function AnnouncementForm({
  departments,
  canBroadcast,
  defaultDepartmentId,
}: {
  departments: Dept[];
  canBroadcast: boolean;
  defaultDepartmentId?: string;
}) {
  const [state, action] = useActionState(createAnnouncement, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="hs-label" htmlFor="ann-title">
          Title
        </label>
        <input id="ann-title" name="title" required className="hs-input" />
      </div>

      <div>
        <label className="hs-label" htmlFor="ann-body">
          Message
        </label>
        <textarea id="ann-body" name="body" rows={4} required className="hs-input resize-y" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="ann-scope">
            Who sees this
          </label>
          <select
            id="ann-scope"
            name="scope"
            defaultValue={canBroadcast ? "all" : "department"}
            className="hs-input"
          >
            <option value="department">One department</option>
            <option value="all" disabled={!canBroadcast}>
              All staff{canBroadcast ? "" : " (admin only)"}
            </option>
          </select>
        </div>
        <div>
          <label className="hs-label" htmlFor="ann-dept">
            Department
          </label>
          <select
            id="ann-dept"
            name="departmentId"
            defaultValue={defaultDepartmentId ?? ""}
            className="hs-input"
          >
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="pinned" className="accent-pink-500" />
        Pin to the top
      </label>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="toTeams" className="accent-pink-500" />
        Also push this to Teams
      </label>

      <DraftKeeper formKey="announcement:new" />
      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Posting…">
        Post announcement
      </SubmitButton>
    </form>
  );
}

export function FormRecordForm({ departments }: { departments: Dept[] }) {
  const [state, action] = useActionState(createForm, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="form-title">
            Form name
          </label>
          <input
            id="form-title"
            name="title"
            required
            className="hs-input"
            placeholder="Staff Application 2027"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="form-type">
            Type
          </label>
          <select id="form-type" name="type" defaultValue="external" className="hs-input">
            <option value="external">External (Google Forms)</option>
            <option value="internal">Internal (tracked here)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="form-url">
          Form link
        </label>
        <input id="form-url" name="url" type="url" className="hs-input" placeholder="https://forms.gle/…" />
      </div>

      <div>
        <label className="hs-label" htmlFor="form-responses">
          Responses sheet link
        </label>
        <input id="form-responses" name="responseUrl" type="url" className="hs-input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="form-dept">
            Department
          </label>
          <select id="form-dept" name="departmentId" className="hs-input">
            <option value="">Portal-wide</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hs-label" htmlFor="form-deadline">
            Deadline
          </label>
          <input id="form-deadline" name="deadline" type="date" className="hs-input" />
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="form-desc">
          Description
        </label>
        <textarea id="form-desc" name="description" rows={2} className="hs-input resize-y" />
      </div>

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Adding…">
        Add form
      </SubmitButton>
    </form>
  );
}
