"use client";

import { useActionState, useRef, useEffect } from "react";
import { addComment } from "@/lib/actions/assignments";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function CommentForm({
  parentType,
  parentId,
}: {
  parentType: "assignment" | "document" | "incident";
  parentId: string;
}) {
  const [state, action] = useActionState(addComment, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // A posted comment leaves an empty box, not the text you just sent.
    if (state.ok !== undefined && !state.error) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="parentType" value={parentType} />
      <input type="hidden" name="parentId" value={parentId} />
      <label className="sr-only" htmlFor="comment-body">
        Comment
      </label>
      <textarea
        id="comment-body"
        name="body"
        rows={3}
        required
        placeholder="Add a comment…"
        className="hs-input resize-y"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="hs-btn hs-btn-secondary" pendingLabel="Posting…">
        Comment
      </SubmitButton>
    </form>
  );
}
