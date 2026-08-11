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

// 24-hour clock by explicit hour cycle: "en" would otherwise render 2:32 PM,
// and the reading these timestamps get is a comparison between neighbouring
// posts, not a time someone says out loud.
const sameYearClockFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const otherYearClockFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
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

/**
 * Date and time of day for a reading where posts sit minutes apart:
 * "Jul 5, 14:32", with the year once it differs from the current one. Renders
 * in the environment's time zone; invalid input renders nothing, as with
 * `relativeTime`.
 */
export const preciseTime = (iso: string, now: Date): string => {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  return then.getFullYear() === now.getFullYear()
    ? sameYearClockFormat.format(then)
    : otherYearClockFormat.format(then);
};
