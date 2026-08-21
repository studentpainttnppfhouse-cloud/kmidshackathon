"use client";

import { useActionState } from "react";
import {
  createAnnouncement,
  createDocument,
  createFile,
  createForm,
} from "@/lib/actions/content";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { DOC_STATUS_LABEL } from "@/lib/constants";
import type { DocStatus } from "@prisma/client";

const initial: FormState = {};

type Dept = { id: string; name: string };

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function DocumentForm({
  departments,
  canApprove,
}: {
  departments: Dept[];
  canApprove: boolean;
}) {
  const [state, action] = useActionState(createDocument, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="doc-title">
            Title
          </label>
          <input id="doc-title" name="title" required className="hs-input" placeholder="Partnership deck v4" />
        </div>
        <div>
          <label className="hs-label" htmlFor="doc-dept">
            Department
          </label>
          <select id="doc-dept" name="departmentId" required className="hs-input">
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="doc-url">
          Google Doc / Slides link
        </label>
        <input
          id="doc-url"
          name="externalUrl"
          type="url"
          required
          className="hs-input"
          placeholder="https://docs.google.com/document/d/…"
        />
        <p className="mt-1.5 text-xs text-faint">
          The portal indexes the document. The content stays in Google, where
          comments and version history already work.
        </p>
      </div>

      <div>
        <label className="hs-label" htmlFor="doc-desc">
          Description
        </label>
        <textarea id="doc-desc" name="description" rows={2} className="hs-input resize-y" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="doc-status">
            Status
          </label>
          <select id="doc-status" name="status" defaultValue="DRAFT" className="hs-input">
            {(Object.keys(DOC_STATUS_LABEL) as DocStatus[]).map((s) => (
              <option
                key={s}
                value={s}
                disabled={!canApprove && (s === "APPROVED" || s === "PUBLISHED")}
              >
                {DOC_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hs-label" htmlFor="doc-tags">
            Tags
          </label>
          <input
            id="doc-tags"
            name="tags"
            className="hs-input"
            placeholder="sponsor, deck, 2027"
          />
        </div>
      </div>

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Adding…">
        Add document
      </SubmitButton>
    </form>
  );
}

export function FileForm({ departments }: { departments: Dept[] }) {
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

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="isBrandKit" className="accent-pink-500" />
        Show this in the Brand Kit
      </label>

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
