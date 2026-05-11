import { expect, Page } from '@playwright/test';

export async function visitApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('drivertax_onboarded', 'true');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /Start Shift|Log your first shift/i })).toBeVisible();
}

export async function createTrip(page: Page, trip: { start: string; end: string; miles: string }) {
  await page.getByRole('button', { name: 'Quick add trip' }).click();
  await expect(page.getByRole('dialog', { name: 'Add trip' })).toBeVisible();
  await page.getByLabel('Start location').fill(trip.start);
  await page.getByLabel('End location').fill(trip.end);
  await page.getByLabel('Miles driven').fill(trip.miles);
  await page.getByRole('button', { name: 'Save trip' }).click();
}

export async function completeWorkDay(
  page: Page,
  options: { startOdometer: string; earnings: string; miles: string; fuelAmount?: string; litres?: string }
) {
  const startShiftButton = page.getByRole('button', { name: 'Start Shift' });
  if (await startShiftButton.isVisible().catch(() => false)) {
    await startShiftButton.click();
    await page.getByLabel(/Start odometer/i).fill(options.startOdometer);
    await page.getByRole('button', { name: 'Start shift', exact: true }).click();

    await expect(page.getByText(/Session running/i)).toBeVisible();
    await page.getByRole('button', { name: 'End shift' }).click();
  } else {
    await page.getByRole('button', { name: 'Log your first shift' }).click();
    await expect(page.getByText('Quick add shift')).toBeVisible();
    await page.getByLabel('Hours').fill('4');
  }
  await page.getByLabel('Earnings').fill(options.earnings);
  await page.getByLabel('End odometer').fill(String(Number(options.startOdometer) + Number(options.miles)));

  if (options.fuelAmount) {
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.getByLabel('Fuel amount').fill(options.fuelAmount);
    if (options.litres) {
      await page.getByLabel(/Litres/i).fill(options.litres);
    }
  }

  await page.getByRole('button', { name: 'Save shift' }).click();
}
