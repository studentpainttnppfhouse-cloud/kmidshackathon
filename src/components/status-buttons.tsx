"use client";

import { useTransition } from "react";
import { setAssignmentStatus } from "@/lib/actions/assignments";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import type { AssignmentStatus } from "@prisma/client";

/**
 * Moving a card is one tap. On a phone at 7 AM nobody opens a detail page to
 * change a dropdown.
 */
export function StatusButtons({
  id,
  current,
  canApprove,
}: {
  id: string;
  current: AssignmentStatus;
  canApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Change status">
      {STATUS_ORDER.map((s) => {
        const active = s === current;
        const locked = !canApprove && (s === "APPROVED" || s === "DONE");
        return (
          <button
            key={s}
            type="button"
            disabled={pending || active || locked}
            title={locked ? "Only a department head can approve." : undefined}
            onClick={() => startTransition(() => setAssignmentStatus(id, s))}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-brand text-white"
                : locked
                  ? "cursor-not-allowed bg-slate-50 text-slate-300"
                  : "bg-pink-50 text-pink-700 hover:bg-pink-100"
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
