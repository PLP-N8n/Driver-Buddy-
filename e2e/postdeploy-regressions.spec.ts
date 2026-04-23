import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { visitApp } from './helpers';

const receiptPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pN0RkQAAAAASUVORK5CYII=',
  'base64'
);

const seededTrips = [
  {
    id: 'trip-1',
    date: '2026-04-03',
    startLocation: 'Leeds',
    endLocation: 'Bradford',
    startOdometer: 12000,
    endOdometer: 12018,
    totalMiles: 18,
    purpose: 'Business',
    notes: 'Airport run',
  },
];

const seededExpenses = [
  {
    id: 'expense-1',
    date: '2026-04-03',
    category: 'Fuel',
    amount: 25,
    description: 'Fuel',
    hasReceiptImage: false,
    isVatClaimable: false,
  },
];

const seededLogs = [
  {
    id: 'log-1',
    date: '2026-04-03',
    provider: 'Uber',
    revenue: 110,
    hoursWorked: 5,
    milesDriven: 42,
    notes: 'Evening shift',
  },
  {
    id: 'log-2',
    date: '2026-04-02',
    provider: 'Bolt',
    revenue: 95,
    hoursWorked: 4,
    notes: 'Morning shift',
  },
  {
    id: 'log-3',
    date: '2026-04-01',
    provider: 'Uber',
    revenue: 120,
    hoursWorked: 6,
    notes: 'Late shift',
  },
];

async function mockSyncAuth(page: Page) {
  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: `token:${Date.now() + 3_600_000}:sig`,
        expiresIn: 3600,
      }),
    });
  });
}

async function mockSyncSuccess(page: Page) {
  await mockSyncAuth(page);
  await page.route('**/sync/push', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

async function unlockAdvancedFeatures(page: Page) {
  await page.evaluate(() => {
    const logs = [
      { id: 'unlock-log-1', date: '2026-04-01', provider: 'Bolt', revenue: 100, hoursWorked: 4 },
      { id: 'unlock-log-2', date: '2026-04-02', provider: 'Bolt', revenue: 120, hoursWorked: 5 },
      { id: 'unlock-log-3', date: '2026-04-03', provider: 'Bolt', revenue: 140, hoursWorked: 6 },
    ];

    window.localStorage.setItem('driver_daily_logs', JSON.stringify(logs));
    window.localStorage.setItem(
      'driver_player_stats',
      JSON.stringify({ xp: 300, level: 3, rankTitle: 'Pro Driver', totalLogs: 3 })
    );
    window.localStorage.setItem('dbt_featuresUnlocked', 'true');
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
}

async function addExpense(page: Page, description: string, receiptBuffer?: Buffer) {
  await page.getByRole('button', { name: 'Quick add expense' }).click();
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible();
  await page.getByLabel('Amount').fill('24.50');
  await page.getByLabel('Description').fill(description);
  await page.getByLabel('Category').selectOption('Parking/Tolls');

  if (receiptBuffer) {
    await page.locator('#expense-receipt').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: receiptBuffer,
    });
    await expect(page.getByAltText('Receipt preview')).toBeVisible();
  }

  await page.getByRole('button', { name: 'Save expense' }).click();
}

const expenseRow = (page: Page, description: string) =>
  page.locator('article').filter({ has: page.getByText(description, { exact: true }) });

async function seedApp(page: Page) {
  await page.route('**/api/auth/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false }),
    });
  });

  await page.route('**/sync/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false }),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(
    ({ trips, expenses, logs }) => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem('drivertax_onboarded', 'true');
      window.localStorage.setItem('driver_player_stats', JSON.stringify({ xp: 250, level: 3, rankTitle: 'Pro Driver', totalLogs: 5 }));
      window.localStorage.setItem('driver_trips', JSON.stringify(trips));
      window.localStorage.setItem('driver_expenses', JSON.stringify(expenses));
      window.localStorage.setItem('driver_daily_logs', JSON.stringify(logs));
    },
    { trips: seededTrips, expenses: seededExpenses, logs: seededLogs }
  );
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test('sync failures show issue state and log tabs default to list view', async ({ page }) => {
  await seedApp(page);

  await page.waitForTimeout(3500);
  await expect(page.getByTestId('sync-indicator')).toContainText('Sync issue');
  await expect(page.getByTestId('sync-indicator')).not.toContainText('Syncing');

  await page.getByRole('button', { name: 'Mileage' }).click();
  await expect(page.getByRole('heading', { name: 'Mileage log' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add trip' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Expenses' }).click();
  await expect(page.getByRole('heading', { name: 'Expense log' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Work Log' }).click();
  await expect(page.getByRole('heading', { name: 'Work log' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Start shift' })).toHaveCount(0);
});

test('backup and restore round-trips an expense', async ({ page }) => {
  await mockSyncSuccess(page);
  await visitApp(page);
  await unlockAdvancedFeatures(page);
  await addExpense(page, 'Backup parking');

  await expect(page.getByText('Backup parking')).toBeVisible();

  await page.getByRole('button', { name: 'Open settings' }).click();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup JSON' }).click();
  const download = await backupDownload;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const backupContent = await readFile(downloadPath!, 'utf8');

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('drivertax_onboarded', 'true');
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.locator('#restore-backup').setInputFiles({
    name: 'driver-buddy-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupContent),
  });

  await expect(page.getByText('3 work logs and 1 expenses restored successfully').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expenses' })).toBeVisible();
  await page.getByRole('button', { name: 'Expenses' }).click();
  await expect(expenseRow(page, 'Backup parking')).toBeVisible();
  await expect(expenseRow(page, 'Backup parking').getByText('Parking/Tolls')).toBeVisible();
});

test('offline recovery shows an error state then auto-retries successfully', async ({ page }) => {
  await mockSyncSuccess(page);
  await visitApp(page);

  await page.context().setOffline(true);
  await expect(page.getByTestId('offline-banner')).toContainText("You're offline");

  await page.getByRole('button', { name: 'Start Shift' }).click();
  await page.getByLabel(/Start odometer/i).fill('1000');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('button', { name: 'End shift' }).click();
  await page.getByLabel('Earnings').fill('150');
  await page.getByLabel('End odometer').fill('1042');
  await page.getByRole('button', { name: 'Save shift' }).click();

  await expect(page.getByTestId('sync-indicator')).toContainText('Offline');
  await expect(page.getByTestId('sync-indicator')).not.toContainText('Syncing');

  await page.context().setOffline(false);

  await expect(page.getByTestId('sync-indicator')).toContainText('Saved', { timeout: 15_000 });
});

test('receipt thumbnails persist after reload', async ({ page }) => {
  await mockSyncSuccess(page);
  await visitApp(page);
  await unlockAdvancedFeatures(page);
  await addExpense(page, 'Receipt parking', receiptPng);

  await expect(page.getByAltText('Receipt thumbnail for Receipt parking')).toBeVisible();

  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem('driver_expenses');
    return Boolean(raw && raw.includes('Receipt parking'));
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Expenses' }).click();
  await expect(page.getByAltText('Receipt thumbnail for Receipt parking')).toBeVisible();
});
