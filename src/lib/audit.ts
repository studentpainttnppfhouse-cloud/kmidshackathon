import "server-only";
import { db } from "@/lib/db";

/**
 * Append-only record of who did what. Never contains passwords, tokens, or
 * reset codes — only their existence.
 */
export async function audit(
  userId: string | null,
  action: string,
  target?: { type?: string; id?: string; detail?: string },
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action: action.slice(0, 64),
        targetType: target?.type?.slice(0, 32) ?? null,
        targetId: target?.id ?? null,
        detail: target?.detail ?? null,
      },
    });
  } catch {
    // An audit write must never take down the action it is recording.
  }
}
