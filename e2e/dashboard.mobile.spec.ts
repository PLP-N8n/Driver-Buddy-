import { expect, Page, test } from '@playwright/test';
import { createTrip, visitApp } from './helpers';

async function completeAdvancedUnlock(page: Page) {
  await page.evaluate(() => {
    const log = {
      id: 'unlock-log-1',
      date: '2026-04-01',
      provider: 'Bolt',
      revenue: 120,
      hoursWorked: 4,
    };
    window.localStorage.setItem('driver_daily_logs', JSON.stringify([log, { ...log, id: 'unlock-log-2', date: '2026-04-02' }, { ...log, id: 'unlock-log-3', date: '2026-04-03' }]));
    window.localStorage.setItem('driver_player_stats', JSON.stringify({ xp: 0, level: 1, rankTitle: 'Novice Driver', totalLogs: 3 }));
    window.localStorage.setItem('dbt_featuresUnlocked', 'true');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test('mobile dashboard shows dock and bottom navigation actions', async ({ page }) => {
  await visitApp(page);

  await expect(page.getByRole('button', { name: 'Quick add shift' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick add trip' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Quick add expense' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mileage' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expenses' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Work Log' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tax' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
});

test('mobile quick-add trip creates a mileage entry', async ({ page }) => {
  await visitApp(page);
  await completeAdvancedUnlock(page);
  await createTrip(page, { start: 'Home', end: 'Airport', miles: '12' });

  await expect(page.getByText('Mileage log')).toBeVisible();
  await expect(page.getByText('Home')).toBeVisible();
  await expect(page.getByText('Airport')).toBeVisible();
  await expect(page.getByText('12 miles')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Home' }).getByText('Business', { exact: true })).toBeVisible();
});

test('mobile more menu reaches the export modal', async ({ page }) => {
  await visitApp(page);

  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('dialog', { name: 'More actions' })).toBeVisible();

  await page.getByRole('button', { name: 'Download Tax Summary CSV' }).click();
  await expect(page.getByRole('dialog', { name: 'Download tax summary CSV' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mileage log' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Expenses' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Work log' })).toBeChecked();
});
