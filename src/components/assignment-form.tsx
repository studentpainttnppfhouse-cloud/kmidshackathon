"use client";

import { useActionState } from "react";
import { createAssignment, updateAssignment } from "@/lib/actions/assignments";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import { toDateInput } from "@/lib/dates";
import type { AssignmentStatus, Priority } from "@prisma/client";

const initial: FormState = {};

export type PickerUser = { id: string; name: string; nickname: string | null };
export type PickerDept = { id: string; name: string };

export function AssignmentForm({
  departments,
  people,
  canAssignOthers,
  canApprove,
  assignment,
}: {
  departments: PickerDept[];
  people: PickerUser[];
  canAssignOthers: boolean;
  canApprove: boolean;
  assignment?: {
    id: string;
    title: string;
    description: string | null;
    departmentId: string;
    dueDate: Date | null;
    priority: Priority;
    status: AssignmentStatus;
    linkUrl: string | null;
    recurrence: string | null;
    assigneeIds: string[];
  };
}) {
  const [state, action] = useActionState(
    assignment ? updateAssignment : createAssignment,
    initial,
  );

  return (
    <form action={action} className="space-y-4">
      {assignment ? <input type="hidden" name="id" value={assignment.id} /> : null}

      <div>
        <label className="hs-label" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={assignment?.title ?? ""}
          placeholder="Collect signed MOU from BDMS"
          className="hs-input"
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={assignment?.description ?? ""}
          placeholder="What done looks like, and anything the assignee needs to know."
          className="hs-input resize-y"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="departmentId">
            Department
          </label>
          <select
            id="departmentId"
            name="departmentId"
            required
            defaultValue={assignment?.departmentId ?? departments[0]?.id ?? ""}
            className="hs-input"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="dueDate">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={toDateInput(assignment?.dueDate)}
            className="hs-input"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="priority">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={assignment?.priority ?? "MEDIUM"}
            className="hs-input"
          >
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={assignment?.status ?? "NOT_STARTED"}
            className="hs-input"
          >
            {STATUS_ORDER.map((s) => (
              <option
                key={s}
                value={s}
                disabled={!canApprove && (s === "APPROVED" || s === "DONE")}
              >
                {STATUS_LABEL[s]}
                {!canApprove && (s === "APPROVED" || s === "DONE") ? " (head only)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="hs-label">Assigned to</legend>
        {canAssignOthers ? (
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-[10px] border border-[#ecd7e3] bg-white p-2 sm:grid-cols-2">
            {people.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-pink-50"
              >
                <input
                  type="checkbox"
                  name="assigneeIds"
                  value={p.id}
                  defaultChecked={assignment?.assigneeIds.includes(p.id)}
                  className="accent-pink-500"
                />
                <span className="truncate">{p.nickname || p.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="rounded-[10px] bg-pink-50 px-3 py-2.5 text-sm text-muted">
            Members can only create tasks for themselves. Ask your head to
            reassign it.
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="linkUrl">
            Linked document (optional)
          </label>
          <input
            id="linkUrl"
            name="linkUrl"
            type="url"
            defaultValue={assignment?.linkUrl ?? ""}
            placeholder="https://docs.google.com/…"
            className="hs-input"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="recurrence">
            Repeats (optional)
          </label>
          <input
            id="recurrence"
            name="recurrence"
            defaultValue={assignment?.recurrence ?? ""}
            placeholder="Every Tuesday"
            className="hs-input"
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.ok}
        </p>
      ) : null}

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
        {assignment ? "Save changes" : "Create task"}
      </SubmitButton>
    </form>
  );
}
