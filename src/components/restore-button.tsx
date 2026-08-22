"use client";

import { useTransition } from "react";
import { ConfirmButton } from "@/components/chrome";

/**
 * The opposite of ConfirmDelete: a server action that puts something back.
 *
 * Same shape and the same reasoning — the action arrives as a prop, so the
 * permission check lives on the server and this component only decides whether
 * the call happens at all.
 */
export function RestoreButton({
  action,
  label = "Restore",
  title,
  body,
  confirmLabel = "Restore it",
  className = "hs-btn hs-btn-secondary px-3 py-1.5 text-xs",
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
      {pending ? "Restoring…" : label}
    </ConfirmButton>
  );
}
