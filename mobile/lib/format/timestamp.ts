const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function calendarDay(value: Date): number {
  return (
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS
  );
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatInboxTimestamp(
  value: string | Date,
  now = new Date()
): string {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '';

  const elapsedMs = Math.max(0, now.getTime() - timestamp.getTime());
  if (elapsedMs < MINUTE_MS) return 'Just now';
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m`;

  if (isSameDay(timestamp, now)) {
    return timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const elapsedDays = calendarDay(now) - calendarDay(timestamp);
  if (elapsedDays === 1) return 'Yesterday';
  if (elapsedDays > 1 && elapsedDays < 7) {
    return timestamp.toLocaleDateString([], { weekday: 'short' });
  }

  return timestamp.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
