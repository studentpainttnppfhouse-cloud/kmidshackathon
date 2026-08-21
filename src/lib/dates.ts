const BKK = "Asia/Bangkok";

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: BKK,
  }).format(date);
}

export function formatDateLong(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BKK,
  }).format(date);
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BKK,
  }).format(date);
}

/** For <input type="date">, which wants YYYY-MM-DD. */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(date);
}

export function isOverdue(due: Date | null, status: string): boolean {
  if (!due) return false;
  if (status === "DONE" || status === "APPROVED") return false;
  return due.getTime() < Date.now();
}

export function relativeDue(due: Date | null): string {
  if (!due) return "No due date";
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${formatDate(due)}`;
}

export function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(now = new Date()): Date {
  const d = startOfWeek(now);
  d.setDate(d.getDate() + 7);
  return d;
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}
