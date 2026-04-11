// All dates in this app are UK local time (Europe/London - handles BST/GMT automatically)
const UK_TZ = 'Europe/London';

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
  const today = todayUK();
  const [y, m, d] = today.split('-').map(Number);
  if (y == null || m == null || d == null) {
    throw new Error(`Invalid date: ${today}`);
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

/** Returns the Monday of the ISO week containing dateStr (YYYY-MM-DD) */
export function ukWeekStart(dateStr: string): string {
  // Parse as noon UTC to avoid DST edge cases
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
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
