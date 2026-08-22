"use client";

import { useActionState } from "react";
import { createAssignment, updateAssignment } from "@/lib/actions/assignments";
import type { FormState } from "@/lib/actions/auth";
import { Feedback, SubmitButton } from "@/components/form-bits";
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
  defaultDepartmentId,
  defaultAssigneeIds = [],
}: {
  departments: PickerDept[];
  people: PickerUser[];
  canAssignOthers: boolean;
  canApprove: boolean;
  defaultDepartmentId?: string;
  defaultAssigneeIds?: string[];
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
            defaultValue={assignment?.departmentId ?? defaultDepartmentId ?? departments[0]?.id ?? ""}
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
                  defaultChecked={
                    assignment
                      ? assignment.assigneeIds.includes(p.id)
                      : defaultAssigneeIds.includes(p.id)
                  }
                  className="accent-pink-500"
                />
                <span className="truncate">{p.nickname || p.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <>
            {/* A member files work for themselves. The checkbox grid is not
                shown, so the ownership still has to be posted — otherwise the
                task lands with nobody on it. */}
            {people.slice(0, 1).map((p) => (
              <input key={p.id} type="hidden" name="assigneeIds" value={p.id} />
            ))}
            <p className="rounded-[10px] bg-pink-50 px-3 py-2.5 text-sm text-muted">
              Members file tasks for themselves. Ask your head to reassign it to somebody else.
            </p>
          </>
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

      <Feedback state={state} />

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
        {assignment ? "Save changes" : "Create task"}
      </SubmitButton>
    </form>
  );
}
