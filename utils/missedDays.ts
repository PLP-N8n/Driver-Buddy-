import { DailyWorkLog } from '../types';
import { todayUK, toUKDateString } from './ukDate';

const formatDateKey = (date: Date) => toUKDateString(date);

export function getMissedDays(dailyLogs: DailyWorkLog[], dayOffDates: string[]): string[] {
  const today = new Date(`${todayUK()}T12:00:00Z`);

  const loggedDates = new Set(dailyLogs.map((log) => log.date));
  const dayOffDateSet = new Set(dayOffDates);
  const missedDays: string[] = [];

  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - offset);
    const dateKey = formatDateKey(date);

    if (loggedDates.has(dateKey) || dayOffDateSet.has(dateKey)) {
      continue;
    }

    missedDays.push(dateKey);
  }

  return missedDays.slice(0, 7);
}
