import "server-only";
import { db } from "@/lib/db";

/**
 * Portal-wide switches, read from the `settings` table.
 *
 * Everything here is a display decision rather than a permission: hiding the
 * Event Day panel takes it out of the navigation, it does not make the page
 * safe to visit. The page itself still checks who is asking, because a hidden
 * link is not access control — anybody who has been to /event once has the URL.
 */

export const SETTING_KEYS = {
  archiveMode: "archive_mode",
  eventPanel: "event_panel_visible",
  contactLine: "contact_line",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isArchiveMode(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.archiveMode)) === "1";
}

/**
 * Event Day is hidden until somebody turns it on.
 *
 * The run sheet is empty for most of the year and a nav item that leads to an
 * empty page reads as a broken portal. Absent setting means hidden, so a fresh
 * deployment starts tidy.
 */
export async function isEventPanelVisible(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.eventPanel)) === "1";
}
