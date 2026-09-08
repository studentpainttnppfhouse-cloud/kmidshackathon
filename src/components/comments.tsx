"use client";

import { useActionState, useRef, useEffect } from "react";
import { addComment } from "@/lib/actions/assignments";
import type { FormState } from "@/lib/actions/auth";
import { Feedback, SubmitButton } from "@/components/form-bits";
import { DraftKeeper } from "@/components/draft-keeper";
import { Avatar } from "@/components/ui";

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
      <DraftKeeper formKey={`comment:${parentType}:${parentId}`} />
      <Feedback state={state.error ? state : {}} />
      <SubmitButton className="hs-btn hs-btn-secondary" pendingLabel="Posting…">
        Comment
      </SubmitButton>
    </form>
  );
}

export type CommentItem = {
  id: string;
  body: string;
  createdAt: Date;
  user: { id: string; name: string; nickname: string | null; avatarUrl: string | null };
};

/**
 * A thread, plus the box to add to it.
 *
 * Comment bodies are rendered as text nodes — React escapes them — and never
 * through the Markdown renderer. A comment is a sentence to a colleague, not a
 * document, and every construct the renderer would add is one more thing that
 * has to stay safe for no benefit here.
 */
export function Comments({
  parentType,
  parentId,
  viewerId,
  comments,
}: {
  parentType: "assignment" | "document" | "incident";
  parentId: string;
  viewerId: string;
  comments: CommentItem[];
}) {
  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-sm text-faint">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar
                name={comment.user.name}
                nickname={comment.user.nickname}
                url={comment.user.avatarUrl}
                size={30}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2 text-xs text-faint">
                  <span className="font-semibold text-ink">
                    {comment.user.nickname || comment.user.name}
                    {comment.user.id === viewerId ? " (you)" : ""}
                  </span>
                  <time dateTime={comment.createdAt.toISOString()}>
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Asia/Bangkok",
                    }).format(comment.createdAt)}
                  </time>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CommentForm parentType={parentType} parentId={parentId} />
    </div>
  );
}
