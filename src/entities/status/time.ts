const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const sameYearFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});
const otherYearFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * Compact relative timestamp for the card header: "now", "5m", "3h", "2d",
 * then a calendar date past a week ("Jul 5", with the year once it differs).
 * Future dates (clock skew between instance and client) clamp to "now".
 */
export const relativeTime = (iso: string, now: Date): string => {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return then.getFullYear() === now.getFullYear()
    ? sameYearFormat.format(then)
    : otherYearFormat.format(then);
};
