import "server-only";
import { db } from "@/lib/db";

export type AuditResult = "success" | "failed" | "denied";

export type AuditTarget = {
  type?: string;
  id?: string;
  /** Human-readable description of what happened. */
  detail?: string;
  /** Defaults to "success". */
  result?: AuditResult;
  /** Why it failed or was denied (or any extra context). */
  reason?: string;
};

/**
 * Append-only record of who did what. Never contains passwords, tokens, or
 * reset codes — only their existence.
 */
export async function audit(
  userId: string | null,
  action: string,
  target?: AuditTarget,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: action.slice(0, 64),
        targetType: target?.type?.slice(0, 32) ?? null,
        targetId: target?.id ?? null,
        detail: target?.detail ?? null,
        result: target?.result ?? "success",
        reason: target?.reason ?? null,
      },
    });
  } catch {
    // An audit write must never take down the action it is recording.
  }
}

/** Shorthand for a failed action. */
export function auditFailure(
  userId: string | null,
  action: string,
  reason: string,
  target?: Omit<AuditTarget, "result" | "reason">,
): Promise<void> {
  return audit(userId, action, { ...target, result: "failed", reason });
}

/** Shorthand for an access-denied event. */
export function auditDenied(
  userId: string | null,
  action: string,
  reason: string,
  target?: Omit<AuditTarget, "result" | "reason">,
): Promise<void> {
  return audit(userId, action, { ...target, result: "denied", reason });
}
