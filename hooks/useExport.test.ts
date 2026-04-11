import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type DailyWorkLog, type Expense, ExpenseCategory, type Trip } from '../types';
import { useExport } from './useExport';

const trips: Trip[] = [
  {
    id: 'trip-1',
    date: '2026-04-03',
    startLocation: 'Leeds',
    endLocation: 'Bradford',
    startOdometer: 1000,
    endOdometer: 1020,
    totalMiles: 20,
    purpose: 'Business',
    notes: 'Airport run',
  },
];

const expenses: Expense[] = [
  {
    id: 'expense-1',
    date: '2026-04-03',
    category: ExpenseCategory.PARKING,
    amount: 12.5,
    description: 'Station parking',
    hasReceiptImage: false,
    isVatClaimable: false,
  },
];

const dailyLogs: DailyWorkLog[] = [
  {
    id: 'log-1',
    date: '2026-04-03',
    provider: 'Uber',
    hoursWorked: 5,
    revenue: 145,
    jobCount: 8,
    fuelLiters: 12,
  },
];

function renderExportHook() {
  const trackEvent = vi.fn();
  const triggerTextDownload = vi.fn();
  const queueDownload = vi.fn((_: number, fn: () => void) => fn());
  const setShowExportModal = vi.fn();

  const hook = renderHook(() =>
    useExport({
      trips,
      expenses,
      dailyLogs,
      settings: DEFAULT_SETTINGS,
      trackEvent,
      triggerTextDownload,
      queueDownload,
      setShowExportModal,
    })
  );

  return { ...hook, trackEvent, triggerTextDownload, queueDownload, setShowExportModal };
}

describe('useExport', () => {
  it('CSV export produces correct headers and rows', () => {
    const { result, triggerTextDownload, setShowExportModal } = renderExportHook();

    act(() => {
      result.current.handleExport();
    });

    expect(triggerTextDownload).toHaveBeenCalledWith(
      'DriverTax_Export.csv',
      expect.stringContaining('"Date","Purpose","Start","End","Start Odo","End Odo","Total Miles","Notes"')
    );

    const csvContent = triggerTextDownload.mock.calls[0]?.[1] as string;
    expect(csvContent).toContain('"2026-04-03","Business","Leeds","Bradford","1000","1020","20","Airport run"');
    expect(csvContent).toContain('"2026-04-03","Parking/Tolls","12.5","Station parking"');
    expect(csvContent).toContain('"2026-04-03","Uber","5","145","8","12"');
    expect(setShowExportModal).toHaveBeenCalledWith(false);
  });

  it('tax pack export includes mileage, expenses, and earnings sections', () => {
    const { result, triggerTextDownload } = renderExportHook();

    act(() => {
      result.current.handleHmrcSummaryExport();
    });

    const htmlContent = triggerTextDownload.mock.calls[0]?.[1] as string;

    expect(htmlContent).toContain('Earnings by Platform');
    expect(htmlContent).toContain('Expenses by Category');
    expect(htmlContent).toContain('Mileage and Allowances');
  });
});
