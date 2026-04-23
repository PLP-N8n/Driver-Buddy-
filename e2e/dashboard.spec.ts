import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { completeWorkDay, visitApp } from './helpers';

async function unlockAdvancedFeatures(page: Page) {
  await page.evaluate(() => {
    window.localStorage.setItem(
      'driver_player_stats',
      JSON.stringify({ xp: 0, level: 1, rankTitle: 'Novice Driver', totalLogs: 3 })
    );
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test('shows the empty dashboard state for a new user', async ({ page }) => {
  await visitApp(page);

  await expect(page.getByText(/Ready for today\?/i)).toBeVisible();
  await expect(page.getByText('Track your earnings')).toBeVisible();
  await expect(page.getByText('Track your mileage')).toBeVisible();
  await expect(page.getByText('See your real take-home')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick add shift' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick add trip' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick add expense' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mileage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expenses' })).toBeVisible();
});

test('downloads the accountant export CSV from settings', async ({ page }) => {
  await visitApp(page);
  await completeWorkDay(page, {
    startOdometer: '1000',
    earnings: '150',
    miles: '42',
    fuelAmount: '20',
    litres: '10',
  });
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Download Accountant CSV' }).click();
  await expect(page.getByRole('dialog', { name: 'Download tax summary CSV' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Expenses' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Expenses' })).not.toBeChecked();

  const exportDialog = page.getByRole('dialog', { name: 'Download tax summary CSV' });
  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download Tax Summary CSV' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('DriverBuddy_Export.csv');

  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, 'utf8');

  expect(content).toContain('MILEAGE LOG');
  expect(content).toContain('PERFORMANCE LOG');
  expect(content).not.toContain('EXPENSES LOG');
});

test('downloads the tax summary report from the reporting page', async ({ page }) => {
  await visitApp(page);
  await completeWorkDay(page, {
    startOdometer: '1000',
    earnings: '150',
    miles: '42',
    fuelAmount: '20',
    litres: '10',
  });
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Tax' }).click();
  const mainContent = page.locator('main');
  await expect(mainContent.getByText('Tax pot', { exact: true })).toBeVisible();
  await expect(mainContent.getByText('Weekly target', { exact: true })).toBeVisible();
  await expect(mainContent.getByText('Key dates', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Accountant CSV' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('tax-summary.csv');

  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, 'utf8');

  expect(content).toContain('"Category","Value"');
  expect(content).toContain('"Revenue"');
  expect(content).toContain('"Estimated Liability"');
});

test('completes a work day and rolls the results into dashboard totals', async ({ page }) => {
  await visitApp(page);
  await completeWorkDay(page, {
    startOdometer: '1000',
    earnings: '150',
    miles: '42',
    fuelAmount: '20',
    litres: '10',
  });

  await expect(page.getByText(/Shift done/i)).toBeVisible();
  await expect(page.getByText('£150.00', { exact: true })).toBeVisible();
  await expect(page.getByText('£100.00', { exact: true })).toBeVisible();
  await expect(page.getByText('£30.00', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText(/This tax year/i)).toBeVisible();
  await expect(page.getByText('42 mi')).toBeVisible();
  await expect(page.getByText(/18\.90/)).toBeVisible();
  await expect(page.getByText('Recent shifts')).toBeVisible();
});

test('adds an expense and shows it in the expense list', async ({ page }) => {
  await visitApp(page);
  await unlockAdvancedFeatures(page);

  await page.getByRole('button', { name: 'Quick add expense' }).click();
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible();

  await page.getByLabel('Amount').fill('24.50');
  await page.getByLabel('Description').fill('Airport parking');
  await page.getByLabel('Category').selectOption('Parking/Tolls');
  await page.getByRole('button', { name: 'Save expense' }).click();

  await expect(page.getByRole('heading', { name: 'Expense log' })).toBeVisible();
  await expect(page.getByText('Airport parking')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Airport parking' }).getByText('Parking/Tolls')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Airport parking' }).getByText(/24\.50/)).toBeVisible();
});

test('persists settings after reload', async ({ page }) => {
  await visitApp(page);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByLabel('Vehicle registration').fill('AB12 CDE');
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByLabel('Vehicle registration')).toHaveValue('AB12 CDE');
});
