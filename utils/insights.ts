import { DailyWorkLog, Expense, ExpenseCategory, ProviderSplit, Settings, Trip } from '../types';
import { buildProjection, calculateMileageClaim } from './tax';
import { toUKDateString, ukWeekStart } from './ukDate';

type InsightCandidate = {
  message: string;
  weight: number;
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const formatPence = (value: number) => `${Math.round(value * 100)}p`;

const formatEfficiency = (value: number) => value.toFixed(value >= 10 ? 1 : 2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');

const formatCurrency = (value: number) => `£${value.toFixed(2)}`;

const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);

const formatDateKey = (date: Date) => toUKDateString(date);

const getWeekRange = (dateValue: string, startDay: Settings['workWeekStartDay']) => {
  const start = parseDate(ukWeekStart(dateValue, startDay));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start: formatDateKey(start),
    end: formatDateKey(end),
  };
};

const getProviderEntries = (log: DailyWorkLog): ProviderSplit[] => {
  if (log.providerSplits?.length) {
    return log.providerSplits;
  }

  return [
    {
      provider: log.provider || 'Other',
      revenue: log.revenue,
      jobCount: log.jobCount,
    },
  ];
};

const getProviderPerformance = (logs: DailyWorkLog[]) => {
  const providers = new Map<string, { revenue: number; hours: number }>();

  for (const log of logs) {
    const entries = getProviderEntries(log);
    const totalSplitRevenue = entries.reduce((sum, entry) => sum + entry.revenue, 0) || log.revenue || 0;

    for (const entry of entries) {
      const share = totalSplitRevenue > 0 ? entry.revenue / totalSplitRevenue : 1 / entries.length;
      const hours = log.hoursWorked * share;
      const current = providers.get(entry.provider) ?? { revenue: 0, hours: 0 };
      providers.set(entry.provider, {
        revenue: current.revenue + entry.revenue,
        hours: current.hours + hours,
      });
    }
  }

  return [...providers.entries()]
    .map(([provider, values]) => ({
      provider,
      revenuePerHour: values.hours > 0 ? values.revenue / values.hours : 0,
      hours: values.hours,
      revenue: values.revenue,
    }))
    .filter((provider) => provider.hours > 0 && provider.revenue > 0)
    .sort((left, right) => right.revenuePerHour - left.revenuePerHour);
};

const getWeekLogs = (logs: DailyWorkLog[], dateValue: string, startDay: Settings['workWeekStartDay']) => {
  const { start, end } = getWeekRange(dateValue, startDay);
  return logs.filter((log) => log.date >= start && log.date <= end);
};

const getBusinessMilesFromTrips = (trips: Trip[], start?: string, end?: string) =>
  trips
    .filter(
      (trip) =>
        trip.purpose === 'Business' &&
        (start == null || trip.date >= start) &&
        (end == null || trip.date <= end)
    )
    .reduce((sum, trip) => sum + trip.totalMiles, 0);

const getFuelCostPerMile = (logs: DailyWorkLog[]) => {
  const fuelSpend = logs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
  // Operational shift insights still use the per-log snapshot. See Trip records
  // for canonical mileage used in tax and allowance calculations.
  const miles = logs.reduce((sum, log) => sum + (log.milesDriven ?? 0), 0);
  return {
    fuelSpend,
    miles,
    costPerMile: miles > 0 ? fuelSpend / miles : 0,
  };
};

const getTaxProjection = (logs: DailyWorkLog[], settings: Settings, trips: Trip[]) => {
  const totalRevenue = logs.reduce((sum, log) => sum + log.revenue, 0);
  const totalMiles = getBusinessMilesFromTrips(trips);
  const totalExpenses = logs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
  const manualAllowances = settings.manualAllowances.reduce((sum, allowance) => sum + allowance.amount, 0);
  const simplifiedDeduction =
    calculateMileageClaim(totalMiles, settings.businessRateFirst10k, settings.businessRateAfter10k) +
    manualAllowances;
  const actualDeduction = totalExpenses + manualAllowances;
  const deductionUsed = settings.claimMethod === 'ACTUAL' ? actualDeduction : simplifiedDeduction;

  return {
    estimatedLiability: buildProjection(totalRevenue, deductionUsed, {
      isScottishTaxpayer: settings.isScottishTaxpayer,
    }).estimatedLiability,
    taxSaved: totalRevenue * (settings.taxSetAsidePercent / 100),
  };
};

const FUEL_EXPENSE_CATEGORIES = new Set<ExpenseCategory>([
  ExpenseCategory.FUEL,
  ExpenseCategory.PUBLIC_CHARGING,
  ExpenseCategory.HOME_CHARGING,
]);

const FIXED_EXPENSE_CATEGORIES = new Set<ExpenseCategory>([
  ExpenseCategory.PHONE,
  ExpenseCategory.INSURANCE,
  ExpenseCategory.SUBSCRIPTIONS,
  ExpenseCategory.BANK_CHARGES,
]);

export function generateInsights(
  today: DailyWorkLog,
  history: DailyWorkLog[],
  settings: Settings,
  trips: Trip[] = [],
  allExpenses: Expense[] = []
): string[] {
  const candidates: InsightCandidate[] = [];
  const revenue = today.revenue || 0;
  const expenses = today.expensesTotal ?? 0;
  // Today-card messaging uses the shift snapshot. See Trip records for
  // canonical mileage used in tax and allowance calculations.
  const miles = today.milesDriven ?? 0;
  const fuelLiters = today.fuelLiters ?? 0;
  const taxToSetAside = revenue * (settings.taxSetAsidePercent / 100);
  const kept = revenue - taxToSetAside - expenses;
  const profitPercent = revenue > 0 ? (kept / revenue) * 100 : 0;
  const costPerMile = miles > 0 ? expenses / miles : 0;
  const previousDays = history
    .filter((log) => log.id !== today.id && log.date <= today.date)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3);
  const recentAverage =
    previousDays.length > 0
      ? previousDays.reduce((sum, log) => sum + log.revenue, 0) / previousDays.length
      : null;

  if (profitPercent > 75) {
    candidates.push({ message: `Strong day - you kept ${formatPercent(profitPercent)} of earnings`, weight: 26 });
  }

  if (profitPercent < 50 && revenue > 0) {
    candidates.push({ message: 'Tough day - high costs reduced take-home', weight: 34 });
  }

  if (recentAverage !== null && revenue > recentAverage) {
    candidates.push({ message: 'Above your recent average - great shift', weight: 22 });
  }

  if (recentAverage !== null && revenue < recentAverage) {
    candidates.push({ message: 'Below your recent average', weight: 20 });
  }

  if (expenses === 0) {
    candidates.push({ message: 'No expenses logged - great cost control', weight: 18 });
  }

  if (costPerMile > 0) {
    candidates.push({ message: `Your cost per mile today: ${formatPence(costPerMile)}`, weight: 12 });
  }

  if (miles > 100) {
    candidates.push({ message: `High mileage day - ${Math.round(miles)} miles claimed`, weight: 16 });
  }

  if (fuelLiters > 0 && miles > 0) {
    candidates.push({ message: `Fuel efficiency: ${formatEfficiency(miles / fuelLiters)} miles per litre`, weight: 10 });
  }

  const sevenDayStart = parseDate(today.date);
  sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);
  const lastSevenDays = history.filter((log) => log.date >= formatDateKey(sevenDayStart) && log.date <= today.date);
  const providerPerformance = getProviderPerformance(lastSevenDays);

  if (providerPerformance.length >= 2) {
    const bestProvider = providerPerformance[0];
    const nextProvider = providerPerformance[1];
    if (bestProvider && nextProvider) {
      const gap = bestProvider.revenuePerHour - nextProvider.revenuePerHour;

      if (gap > 0.5) {
        candidates.push({
          message: `${bestProvider.provider} paid ${formatCurrency(gap)}/hr more than ${nextProvider.provider} over last 7 days`,
          weight: 92,
        });
      }
    }
  }

  const currentWeekLogs = getWeekLogs(history, today.date, settings.workWeekStartDay);
  const previousWeekDate = parseDate(today.date);
  previousWeekDate.setUTCDate(previousWeekDate.getUTCDate() - 7);
  const previousWeekLogs = getWeekLogs(history, formatDateKey(previousWeekDate), settings.workWeekStartDay);
  const currentFuelTrend = getFuelCostPerMile(currentWeekLogs);
  const previousFuelTrend = getFuelCostPerMile(previousWeekLogs);

  if (previousFuelTrend.costPerMile > 0 && currentFuelTrend.costPerMile > previousFuelTrend.costPerMile) {
    const increase = ((currentFuelTrend.costPerMile - previousFuelTrend.costPerMile) / previousFuelTrend.costPerMile) * 100;

    if (increase >= 5) {
      candidates.push({
        message: `Fuel cost per mile rose ${formatPercent(increase)} this week`,
        weight: 84,
      });
    }
  }

  const currentRevenuePerMile =
    currentFuelTrend.miles > 0 ? currentWeekLogs.reduce((sum, log) => sum + log.revenue, 0) / currentFuelTrend.miles : 0;
  const previousRevenuePerMile =
    previousFuelTrend.miles > 0 ? previousWeekLogs.reduce((sum, log) => sum + log.revenue, 0) / previousFuelTrend.miles : 0;

  if (previousRevenuePerMile > 0 && currentRevenuePerMile > 0 && currentRevenuePerMile < previousRevenuePerMile * 0.9) {
    const extraMiles = ((previousRevenuePerMile / currentRevenuePerMile) - 1) * 100;
    candidates.push({
      message: `You drove ${formatPercent(extraMiles)} more miles for the same earnings vs last week`,
      weight: 78,
    });
  }

  const taxProjection = getTaxProjection(history, settings, trips);

  if (taxProjection.estimatedLiability > 0 && taxProjection.taxSaved < taxProjection.estimatedLiability * 0.9) {
    candidates.push({
      message: `You're ${formatCurrency(taxProjection.estimatedLiability - taxProjection.taxSaved)} short of your tax pot target`,
      weight: 88,
    });
  }

  if (allExpenses.length > 0) {
    const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange(today.date, settings.workWeekStartDay);
    const { start: lastWeekStart, end: lastWeekEnd } = getWeekRange(formatDateKey(previousWeekDate), settings.workWeekStartDay);

    const thisWeekFuel = allExpenses
      .filter((e) => FUEL_EXPENSE_CATEGORIES.has(e.category) && e.date >= thisWeekStart && e.date <= thisWeekEnd)
      .reduce((sum, e) => sum + e.amount, 0);
    const lastWeekFuel = allExpenses
      .filter((e) => FUEL_EXPENSE_CATEGORIES.has(e.category) && e.date >= lastWeekStart && e.date <= lastWeekEnd)
      .reduce((sum, e) => sum + e.amount, 0);

    if (lastWeekFuel > 5 && thisWeekFuel > lastWeekFuel) {
      const fuelIncrease = ((thisWeekFuel - lastWeekFuel) / lastWeekFuel) * 100;
      if (fuelIncrease >= 15) {
        candidates.push({
          message: `Fuel costs up ${formatPercent(fuelIncrease)} this week — ${formatCurrency(thisWeekFuel - lastWeekFuel)} more than last week`,
          weight: 84,
        });
      }
    }

    const thirtyDayStart = parseDate(today.date);
    thirtyDayStart.setUTCDate(thirtyDayStart.getUTCDate() - 29);
    const thirtyDayStartStr = formatDateKey(thirtyDayStart);
    const recentExpenses = allExpenses.filter((e) => e.date >= thirtyDayStartStr && e.date <= today.date);
    const totalRecentAmount = recentExpenses.reduce((sum, e) => sum + e.amount, 0);

    if (totalRecentAmount > 20) {
      const categoryTotals = new Map<ExpenseCategory, number>();
      for (const e of recentExpenses) {
        categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount);
      }

      const topEntry = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topEntry) {
        const [topCat, topCatTotal] = topEntry;
        const topCatPercent = (topCatTotal / totalRecentAmount) * 100;
        if (topCatPercent > 40 && topCat !== ExpenseCategory.OTHER) {
          candidates.push({
            message: `${topCat} is ${formatPercent(topCatPercent)} of running costs this month — ${formatCurrency(topCatTotal)}`,
            weight: 72,
          });
        }
      }

      const otherTotal = categoryTotals.get(ExpenseCategory.OTHER) ?? 0;
      if (otherTotal > 10 && otherTotal / totalRecentAmount > 0.2) {
        candidates.push({
          message: `${formatCurrency(otherTotal)} logged as 'Other' this month — recategorising helps your tax deductions`,
          weight: 76,
        });
      }
    }

    const last10Shifts = history
      .filter((log) => log.id !== today.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
    if (last10Shifts.length >= 5) {
      const shiftDates = new Set(last10Shifts.map((log) => log.date));
      const expenseDatesWithShift = new Set(allExpenses.filter((e) => shiftDates.has(e.date)).map((e) => e.date));
      const loggingRate = expenseDatesWithShift.size / last10Shifts.length;
      if (loggingRate < 0.3) {
        candidates.push({
          message: `Expenses logged on ${expenseDatesWithShift.size} of your last ${last10Shifts.length} shifts — missed claims add up`,
          weight: 68,
        });
      }
    }

    const thisMonthStart = `${today.date.slice(0, 7)}-01`;
    const fixedTotal = allExpenses
      .filter((e) => FIXED_EXPENSE_CATEGORIES.has(e.category) && e.date >= thisMonthStart && e.date <= today.date)
      .reduce((sum, e) => sum + e.amount, 0);
    if (fixedTotal > 30) {
      candidates.push({
        message: `Fixed costs this month: ${formatCurrency(fixedTotal)} — check they're all logged for your tax return`,
        weight: 60,
      });
    }
  }

  return [...new Map(candidates.sort((left, right) => right.weight - left.weight).map((item) => [item.message, item])).values()]
    .slice(0, 3)
    .map((item) => item.message);
}
