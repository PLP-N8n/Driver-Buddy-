// All dates in this app are UK local time (Europe/London - handles BST/GMT automatically)
export const UK_TZ = 'Europe/London';

/** Returns today's date as YYYY-MM-DD in UK local time */
export function todayUK(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Converts a Date object to YYYY-MM-DD in UK local time */
export function toUKDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Returns the starting calendar year of the current UK tax year (Apr 6 - Apr 5) */
export function getTaxYear(): number {
  return getTaxYearForDate(todayUK());
}

/** Returns the starting calendar year of the UK tax year containing dateStr. */
export function getTaxYearForDate(dateStr: string): number {
  const y = Number.parseInt(dateStr.slice(0, 4), 10);
  const m = Number.parseInt(dateStr.slice(5, 7), 10);
  const d = Number.parseInt(dateStr.slice(8, 10), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  if (m > 4 || (m === 4 && d >= 6)) return y;
  return y - 1;
}

/** Returns the first day of the UK tax year as YYYY-MM-DD */
export function ukTaxYearStart(year?: number): string {
  const y = year ?? getTaxYear();
  return `${y}-04-06`;
}

/** Returns the end of the UK tax year as YYYY-MM-DD */
export function ukTaxYearEnd(year?: number): string {
  const y = year ?? getTaxYear();
  return `${y + 1}-04-05`;
}

/** Returns the configured week start containing dateStr (YYYY-MM-DD) */
export function ukWeekStart(dateStr: string, startDay: 'MON' | 'SUN' = 'MON'): string {
  // Parse as noon UTC to avoid DST edge cases
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = startDay === 'SUN'
    ? (day === 0 ? 0 : -day)
    : (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Returns true if dateStr (YYYY-MM-DD) is today in UK local time */
export function isToday(dateStr: string): boolean {
  return dateStr === todayUK();
}

/** Returns number of calendar days between two YYYY-MM-DD strings */
export function daysBetween(a: string, b: string): number {
  const msA = new Date(`${a}T12:00:00Z`).getTime();
  const msB = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round(Math.abs(msB - msA) / 86_400_000);
}

/** Returns true if dateStr is within the current UK tax year */
export function isInCurrentTaxYear(dateStr: string): boolean {
  const start = ukTaxYearStart();
  const end = ukTaxYearEnd();
  return dateStr >= start && dateStr <= end;
}

/** Filters records with a YYYY-MM-DD date to the current UK tax year. */
export function filterToCurrentTaxYear<T extends { date: string }>(items: T[]): T[] {
  return items.filter((item) => isInCurrentTaxYear(item.date));
}
