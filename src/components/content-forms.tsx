"use client";

import { useActionState, useRef, useState } from "react";
import { createAnnouncement, createFile, createForm } from "@/lib/actions/content";
import type { FormState } from "@/lib/actions/auth";
import { Feedback, SubmitButton } from "@/components/form-bits";
import { formatBytes } from "@/lib/uploads";


const initial: FormState = {};

type Dept = { id: string; name: string };

function DepartmentField({ departments, id }: { departments: Dept[]; id: string }) {
  return (
    <div>
      <label className="hs-label" htmlFor={id}>
        Department
      </label>
      <select id={id} name="departmentId" required className="hs-input">
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function BrandKitToggle() {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" name="isBrandKit" className="accent-pink-500" />
      Show this in the Brand Kit
    </label>
  );
}

/**
 * Two ways to file an asset, one form.
 *
 * Uploading posts to a route handler rather than through a Server Action —
 * actions cap the request body, and a 12 MB poster is over that cap. A plain
 * multipart form has no such limit, and works with JavaScript off; the size
 * check below is a courtesy so a 40 MB video fails instantly instead of after
 * two minutes of school Wi-Fi.
 */
export function FileForm({
  departments,
  maxBytes,
  error,
}: {
  departments: Dept[];
  maxBytes: number;
  error?: string;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      {/* Two plain buttons rather than ARIA tabs: they swap the form below
          rather than revealing a panel, and aria-pressed says exactly that. */}
      <div className="hs-no-print flex gap-2">
        {(["upload", "link"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={`hs-btn ${mode === option ? "hs-btn-primary" : "hs-btn-secondary"}`}
          >
            {option === "upload" ? "Upload a file" : "Link something"}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <form
          action="/files/upload"
          method="post"
          encType="multipart/form-data"
          onSubmit={(event) => {
            const chosen = fileInput.current?.files?.[0];
            if (chosen && chosen.size > maxBytes) {
              event.preventDefault();
              setTooBig(
                `${chosen.name} is ${formatBytes(chosen.size)} — the limit is ${formatBytes(maxBytes)}. Put it in Drive and link it instead.`,
              );
              return;
            }
            setUploading(true);
          }}
          className="space-y-4"
        >
          <div>
            <label className="hs-label" htmlFor="upload-file">
              File
            </label>
            <input
              id="upload-file"
              ref={fileInput}
              name="file"
              type="file"
              required
              className="hs-input"
              onChange={() => setTooBig(null)}
              aria-describedby="upload-file-hint"
            />
            <p id="upload-file-hint" className="mt-1 text-xs text-faint">
              Stored in the database, so it survives every deploy. Up to{" "}
              {formatBytes(maxBytes)}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="hs-label" htmlFor="upload-name">
                Asset name
              </label>
              <input
                id="upload-name"
                name="name"
                className="hs-input"
                placeholder="Leave blank to use the filename"
              />
            </div>
            <DepartmentField departments={departments} id="upload-dept" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="hs-label" htmlFor="upload-desc">
                Description
              </label>
              <input id="upload-desc" name="description" className="hs-input" />
            </div>
            <div>
              <label className="hs-label" htmlFor="upload-tags">
                Tags
              </label>
              <input
                id="upload-tags"
                name="tags"
                className="hs-input"
                placeholder="brand, event-day, print"
              />
            </div>
          </div>

          <BrandKitToggle />

          {tooBig ? <Feedback state={{ error: tooBig }} /> : null}
          {error && !tooBig ? <Feedback state={{ error }} /> : null}

          <button type="submit" disabled={uploading} className="hs-btn hs-btn-primary">
            {uploading ? "Uploading…" : "Upload file"}
          </button>
        </form>
      ) : (
        <LinkAssetForm departments={departments} />
      )}
    </div>
  );
}

function LinkAssetForm({ departments }: { departments: Dept[] }) {
  const [state, action] = useActionState(createFile, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="file-name">
            Asset name
          </label>
          <input id="file-name" name="name" required className="hs-input" placeholder="Poster template A3" />
        </div>
        <DepartmentField departments={departments} id="file-dept" />
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <BrandKitToggle />

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Linking…">
        Link asset
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
