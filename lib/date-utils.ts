/**
 * Comprehensive Date & Time utilities locked to Pakistan Standard Time (PKT, UTC+5).
 * Timezone: Asia/Karachi (Karachi / Islamabad).
 */

export const PKT_TIMEZONE = 'Asia/Karachi';

/**
 * Formats a date string or timestamp into full Pakistan Date & Time (e.g., "25 Sep 2026, 01:15 AM").
 */
export function formatPKTDateTime(
  date: string | number | Date | null | undefined,
  includeSeconds = false
): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';

    return d.toLocaleString('en-PK', {
      timeZone: PKT_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    });
  } catch {
    return String(date);
  }
}

/**
 * Formats only the time in PKT (e.g., "01:15:22 AM" or "01:15 AM").
 */
export function formatPKTTime(
  date: string | number | Date | null | undefined,
  includeSeconds = true
): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';

    return d.toLocaleTimeString('en-PK', {
      timeZone: PKT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    });
  } catch {
    return String(date);
  }
}

/**
 * Formats only the date in PKT (e.g., "25 Sep 2026").
 */
export function formatPKTDate(date: string | number | Date | null | undefined): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';

    return d.toLocaleDateString('en-PK', {
      timeZone: PKT_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

/**
 * Returns today's date in YYYY-MM-DD formatted in Pakistan Time (Asia/Karachi).
 */
export function getPKTTodayDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PKT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Returns the current date/time as an ISO string or formatted for display.
 */
export function getPKTCurrentTimeFormatted(): string {
  return formatPKTTime(new Date(), true);
}
