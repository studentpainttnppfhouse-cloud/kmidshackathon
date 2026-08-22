"use client";

import { useTransition } from "react";
import { ConfirmButton } from "@/components/chrome";

/**
 * A destructive server action behind a confirmation dialog.
 *
 * The action is a Server Action passed down as a prop, so the authorisation
 * check stays where it belongs — on the server, inside the action — and this
 * component only decides whether the call is made at all. A client component
 * cannot grant itself permission by rendering the button.
 */
export function ConfirmDelete({
  action,
  label = "Delete",
  title,
  body,
  confirmLabel = "Delete it",
  className = "hs-btn hs-btn-danger px-3 py-1.5 text-xs",
}: {
  action: () => Promise<void>;
  label?: string;
  title: string;
  body?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <ConfirmButton
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      className={className}
      onConfirm={() => start(() => void action())}
    >
      {pending ? "Deleting…" : label}
    </ConfirmButton>
  );
}
