import { useMemo } from 'react';
import { RecurringExpense, Settings } from '../types';
import { ukWeekStart } from '../utils/ukDate';

export function useRecurringExpensesDue(
  recurringExpenses: RecurringExpense[],
  today: string,
  workWeekStartDay: Settings['workWeekStartDay']
): RecurringExpense[] {
  return useMemo(() => {
    const currentMonth = today.slice(0, 7);
    const weekStart = ukWeekStart(today, workWeekStartDay);
    const currentMonthNum = parseInt(today.slice(5, 7), 10);

    return recurringExpenses.filter((item) => {
      const last = item.lastLoggedDate;

      if (item.frequency === 'monthly') {
        return !last || last.slice(0, 7) !== currentMonth;
      }

      if (item.frequency === 'weekly') {
        return !last || last < weekStart;
      }

      if (item.frequency === 'annual') {
        return item.monthOfYear === currentMonthNum && (!last || last.slice(0, 7) !== currentMonth);
      }

      return false;
    });
  }, [recurringExpenses, today, workWeekStartDay]);
}
