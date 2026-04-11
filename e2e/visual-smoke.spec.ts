import { Page, test } from '@playwright/test';
import { ukTaxYearStart } from '../utils/ukDate';

const baseSettings = {
  vehicleReg: '',
  driverRoles: ['TAXI'],
  colorTheme: 'DARK',
  claimMethod: 'SIMPLIFIED',
  mileageTrackingEnabled: false,
  weeklyRevenueTarget: 700,
  businessRateFirst10k: 0.45,
  businessRateAfter10k: 0.25,
  vehicleTax: 0,
  reminderEnabled: false,
  reminderTime: '18:00',
  taxSetAsidePercent: 20,
  maintenanceSetAsidePercent: 10,
  debtSetAsidePercent: 0,
  debts: [],
  debtStrategy: 'AVALANCHE',
  financialYearStartOdometer: 45000,
  financialYearStartDate: ukTaxYearStart(2025),
  lastOdometerCheckDate: '2026-04-04',
  manualAllowances: [],
  dayOffDates: [],
};

const advancedStats = { xp: 0, level: 1, rankTitle: 'Novice Driver', totalLogs: 15 };

const predictionLogs = [
  { id: 'log-1', date: '2026-03-14', provider: 'Uber', hoursWorked: 5, revenue: 110, expensesTotal: 12, milesDriven: 48 },
  { id: 'log-2', date: '2026-03-15', provider: 'Bolt', hoursWorked: 6, revenue: 180, expensesTotal: 16, milesDriven: 70, fuelLiters: 12 },
  { id: 'log-3', date: '2026-03-16', provider: 'Uber', hoursWorked: 4, revenue: 90, expensesTotal: 10, milesDriven: 42 },
  { id: 'log-4', date: '2026-03-17', provider: 'Uber', hoursWorked: 5, revenue: 105, expensesTotal: 11, milesDriven: 46 },
  { id: 'log-5', date: '2026-03-18', provider: 'Bolt', hoursWorked: 5, revenue: 115, expensesTotal: 12, milesDriven: 50 },
  { id: 'log-6', date: '2026-03-20', provider: 'Uber', hoursWorked: 5, revenue: 100, expensesTotal: 11, milesDriven: 45 },
  { id: 'log-7', date: '2026-03-21', provider: 'Bolt', hoursWorked: 6, revenue: 190, expensesTotal: 17, milesDriven: 72, fuelLiters: 14 },
  { id: 'log-8', date: '2026-03-28', provider: 'Bolt', hoursWorked: 6.5, revenue: 210, expensesTotal: 18, milesDriven: 78, fuelLiters: 15 },
  { id: 'log-9', date: '2026-03-29', provider: 'Uber', hoursWorked: 4, revenue: 95, expensesTotal: 10, milesDriven: 40 },
  { id: 'log-10', date: '2026-03-30', provider: 'Uber', hoursWorked: 5, revenue: 108, expensesTotal: 12, milesDriven: 44 },
  { id: 'log-11', date: '2026-03-31', provider: 'Bolt', hoursWorked: 5, revenue: 118, expensesTotal: 12, milesDriven: 52 },
  { id: 'log-12', date: '2026-04-01', provider: 'Uber', hoursWorked: 4, revenue: 92, expensesTotal: 10, milesDriven: 39 },
  { id: 'log-13', date: '2026-04-02', provider: 'Uber', hoursWorked: 5, revenue: 102, expensesTotal: 11, milesDriven: 43 },
  { id: 'log-14', date: '2026-04-03', provider: 'Uber', hoursWorked: 5, revenue: 112, expensesTotal: 11, milesDriven: 47 },
];

const predictionTrips = predictionLogs.map((log, index) => ({
  id: `trip-${index + 1}`,
  date: log.date,
  startLocation: 'Home',
  endLocation: 'City',
  startOdometer: 45000 + index * 50,
  endOdometer: 45000 + index * 50 + (log.milesDriven ?? 0),
  totalMiles: log.milesDriven ?? 0,
  purpose: 'Business',
  notes: '',
}));

const predictionExpenses = [
  { id: 'expense-1', date: '2026-03-15', category: 'Fuel', amount: 28, description: 'Fuel', hasReceiptImage: false, liters: 12 },
  { id: 'expense-2', date: '2026-03-21', category: 'Fuel', amount: 30, description: 'Fuel', hasReceiptImage: false, liters: 14 },
  { id: 'expense-3', date: '2026-04-02', category: 'Parking/Tolls', amount: 9, description: 'City parking', hasReceiptImage: false },
];

const reengagementLogs = [
  { id: 're-1', date: '2026-03-24', provider: 'Uber', hoursWorked: 5, revenue: 96, expensesTotal: 10, milesDriven: 42 },
  { id: 're-2', date: '2026-03-27', provider: 'Uber', hoursWorked: 4.5, revenue: 101, expensesTotal: 9, milesDriven: 44 },
  { id: 're-3', date: '2026-03-30', provider: 'Bolt', hoursWorked: 5, revenue: 109, expensesTotal: 11, milesDriven: 47 },
];

async function mockDate(page: Page, isoValue: string) {
  await page.addInitScript(({ iso }) => {
    const fixedDate = new Date(iso);
    const OriginalDate = Date;

    class MockDate extends OriginalDate {
      constructor();
      constructor(value: string | number | Date);
      constructor(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number);
      constructor(
        ...args:
          | []
          | [string | number | Date]
          | [number, number, number?, number?, number?, number?, number?]
      ) {
        if (args.length === 0) {
          super(fixedDate.toISOString());
          return;
        }

        if (args.length === 1) {
          super(args[0]);
          return;
        }

        super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
      }

      static now() {
        return fixedDate.getTime();
      }
    }

    // @ts-expect-error test-only Date shim
    window.Date = MockDate;
  }, { iso: isoValue });
}

async function loadState(page: Page, state: Record<string, unknown>) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate((payload) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('drivertax_onboarded', 'true');
    Object.entries(payload).forEach(([key, value]) => {
      window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }, state);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test.use({ viewport: { width: 375, height: 812 } });

test('captures intelligence, tax, and trust visual states', async ({ page }) => {
  await mockDate(page, '2026-04-04T10:00:00.000Z');

  await loadState(page, {
    driver_settings: baseSettings,
    driver_player_stats: advancedStats,
    driver_daily_logs: predictionLogs,
    driver_trips: predictionTrips,
    driver_expenses: predictionExpenses,
    dbt_lastBackfillPrompt: '2026-04-04',
    dbt_milestones_seen: ['streak_7', 'logs_10', 'revenue_1000'],
  });
  await page.getByTestId('habit-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/habit-card-streak.png', fullPage: false });

  await loadState(page, {
    driver_settings: { ...baseSettings, dayOffDates: ['2026-04-01', '2026-04-02', '2026-04-03'] },
    driver_player_stats: { xp: 0, level: 1, rankTitle: 'Novice Driver', totalLogs: 3 },
    driver_daily_logs: reengagementLogs,
    dbt_lastBackfillPrompt: '2026-04-04',
    dbt_milestones_seen: ['first_log'],
  });
  await page.getByTestId('habit-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/habit-card-reengagement.png', fullPage: false });

  await loadState(page, {
    driver_settings: baseSettings,
    driver_player_stats: advancedStats,
    driver_daily_logs: predictionLogs,
    driver_trips: predictionTrips,
    driver_expenses: predictionExpenses,
    dbt_lastBackfillPrompt: '2026-04-04',
    dbt_milestones_seen: ['streak_7', 'logs_10', 'revenue_1000'],
  });
  await page.getByTestId('prediction-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/prediction-card.png', fullPage: false });

  await loadState(page, {
    driver_settings: baseSettings,
    driver_player_stats: advancedStats,
    driver_daily_logs: predictionLogs,
    driver_trips: predictionTrips,
    driver_expenses: predictionExpenses,
    dbt_lastBackfillPrompt: '2026-04-04',
  });
  await page.getByRole('button', { name: 'Tax' }).click();
  await page.getByTestId('tax-pack-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/tax-pack-section.png', fullPage: false });

  await loadState(page, {
    driver_settings: baseSettings,
    driver_player_stats: advancedStats,
    driver_daily_logs: predictionLogs,
    driver_trips: predictionTrips,
    driver_expenses: predictionExpenses,
    dbt_lastBackfillPrompt: '2026-04-04',
    dbt_lastSyncAt: '2026-04-04T10:00:00.000Z',
  });
  await page.getByTestId('sync-indicator').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/trust-saved-indicator.png', fullPage: false });

  await loadState(page, {
    driver_settings: baseSettings,
    driver_player_stats: advancedStats,
    driver_daily_logs: predictionLogs,
    dbt_lastBackfillPrompt: '2026-04-04',
  });
  await page.context().setOffline(true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/offline-banner.png', fullPage: false });
  await page.context().setOffline(false);

  await loadState(page, {
    driver_settings: baseSettings,
    driver_player_stats: advancedStats,
    driver_daily_logs: predictionLogs,
    driver_trips: predictionTrips,
    driver_expenses: predictionExpenses,
    dbt_lastBackfillPrompt: '2026-04-04',
    dbt_lastSyncAt: '2026-04-04T10:00:00.000Z',
  });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByTestId('settings-your-data-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/settings-your-data.png', fullPage: false });
});
