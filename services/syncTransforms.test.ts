import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type DailyWorkLog, type Expense, ExpenseCategory, type Trip } from '../types';
import { applyPulledExpenses, applyPulledShiftWorkLogs, buildSyncPayload, sanitizeExpenseForStorage } from './syncTransforms';

describe('syncTransforms', () => {
  it('buildSyncPayload includes all changed records', () => {
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
        updatedAt: '2026-04-03T20:00:00.000Z',
      },
    ];
    const expenses: Expense[] = [
      {
        id: 'expense-1',
        date: '2026-04-03',
        category: ExpenseCategory.PUBLIC_CHARGING,
        amount: 40,
        description: 'Rapid charge',
        receiptId: 'receipt-1',
        hasReceiptImage: true,
        isVatClaimable: false,
        energyQuantity: 18.5,
        energyUnit: 'kWh',
        scope: 'mixed',
        businessUsePercent: 75,
        deductibleAmount: 30,
        nonDeductibleAmount: 10,
        vehicleExpenseType: 'running_cost',
        taxTreatment: 'partially_deductible',
        linkedShiftId: 'log-1',
        sourceType: 'manual',
        reviewStatus: 'edited',
        updatedAt: '2026-04-03T20:05:00.000Z',
      },
    ];
    const dailyLogs: DailyWorkLog[] = [
      {
        id: 'log-1',
        date: '2026-04-03',
        provider: 'Uber',
        hoursWorked: 6,
        revenue: 180,
        notes: 'Evening shift',
        linkedTripId: 'trip-1',
        updatedAt: '2026-04-03T20:10:00.000Z',
        providerSplits: [
          { provider: 'Uber', revenue: 120, jobCount: 8 },
          { provider: 'Deliveroo', revenue: 60, jobCount: 4 },
        ],
      },
    ];

    const payload = buildSyncPayload(trips, expenses, dailyLogs, DEFAULT_SETTINGS);

    expect(payload.workLogs).toHaveLength(1);
    expect(payload.shifts).toHaveLength(1);
    expect(payload.shiftEarnings).toHaveLength(2);
    expect(payload.mileageLogs).toHaveLength(1);
    expect(payload.expenses).toHaveLength(1);
    expect(payload.settings).toEqual(DEFAULT_SETTINGS);
    expect(payload.shifts[0]).toEqual(
      expect.objectContaining({
        id: 'log-1',
        total_earnings: 180,
        start_odometer: 1000,
        end_odometer: 1020,
        business_miles: 20,
        updatedAt: '2026-04-03T20:10:00.000Z',
      })
    );
    expect(payload.shiftEarnings[0]).toEqual(
      expect.objectContaining({
        shift_id: 'log-1',
      })
    );
    expect(payload.expenses[0]).toEqual(
      expect.objectContaining({
        id: 'expense-1',
        hasImage: true,
        scope: 'mixed',
        businessUsePercent: 75,
        deductibleAmount: 30,
        nonDeductibleAmount: 10,
        vehicleExpenseType: 'running_cost',
        taxTreatment: 'partially_deductible',
        linkedShiftId: 'log-1',
        sourceType: 'manual',
        reviewStatus: 'edited',
        updatedAt: '2026-04-03T20:05:00.000Z',
      })
    );
    const syncedExpense = payload.expenses[0];
    expect(syncedExpense).toBeDefined();
    expect(JSON.parse(syncedExpense!.description)).toEqual(
      expect.objectContaining({
        description: 'Rapid charge',
        energyQuantity: 18.5,
        energyUnit: 'kWh',
      })
    );
  });

  it('sanitizeExpenseForStorage strips blob URLs', () => {
    const sanitized = sanitizeExpenseForStorage({
      id: 'expense-blob',
      date: '2026-04-03',
      category: ExpenseCategory.OTHER,
      amount: 12,
      description: 'Blob receipt',
      receiptUrl: 'blob:https://driver-buddy.test/receipt-1',
      hasReceiptImage: true,
    });

    expect(sanitized.receiptUrl).toBeUndefined();
    expect(sanitized.hasReceiptImage).toBe(true);
  });

  it('applyPulledExpenses merges without duplicates', () => {
    const localExpenses: Expense[] = [
      {
        id: 'expense-1',
        date: '2026-04-05',
        category: ExpenseCategory.PARKING,
        amount: 21,
        description: 'Local newer parking',
        hasReceiptImage: false,
        updatedAt: '2026-04-05T12:00:00.000Z',
      },
    ];

    const merged = applyPulledExpenses(
      [
        {
          id: 'expense-1',
          date: '2026-04-03',
          category: ExpenseCategory.PARKING,
          amount: 10,
          description: JSON.stringify({ description: 'Remote older parking' }),
          has_image: 0,
          updated_at: '2026-04-03T12:00:00.000Z',
        },
        {
          id: 'expense-2',
          date: '2026-04-04',
          category: ExpenseCategory.FUEL,
          amount: 45,
          description: JSON.stringify({ description: 'Remote fuel', receiptId: 'receipt-2' }),
          has_image: 1,
        },
      ],
      localExpenses
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((expense) => expense.id === 'expense-1')?.amount).toBe(21);
    expect(merged.find((expense) => expense.id === 'expense-2')).toEqual(
      expect.objectContaining({
        description: 'Remote fuel',
        receiptId: 'receipt-2',
      })
    );
  });

  it('applyPulledExpenses uses updated_at instead of date when resolving conflicts', () => {
    const merged = applyPulledExpenses(
      [
        {
          id: 'expense-1',
          date: '2026-04-10',
          category: ExpenseCategory.PARKING,
          amount: 10,
          description: JSON.stringify({ description: 'Remote stale edit on later date' }),
          has_image: 0,
          updated_at: '2026-04-03T12:00:00.000Z',
        },
      ],
      [
        {
          id: 'expense-1',
          date: '2026-04-05',
          category: ExpenseCategory.PARKING,
          amount: 21,
          description: 'Local newer edit',
          hasReceiptImage: false,
          updatedAt: '2026-04-05T12:00:00.000Z',
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.amount).toBe(21);
    expect(merged[0]?.description).toBe('Local newer edit');
  });

  it('applyPulledExpenses restores synced energy quantity metadata', () => {
    const merged = applyPulledExpenses([
      {
        id: 'expense-charge',
        date: '2026-04-08',
        category: ExpenseCategory.PUBLIC_CHARGING,
        amount: 16.75,
        description: JSON.stringify({
          description: 'Rapid charger',
          energyQuantity: 24.8,
          energyUnit: 'kWh',
        }),
        has_image: 0,
        updated_at: '2026-04-08T12:00:00.000Z',
      },
    ]);

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'expense-charge',
        category: ExpenseCategory.PUBLIC_CHARGING,
        description: 'Rapid charger',
        energyQuantity: 24.8,
        energyUnit: 'kWh',
      }),
    ]);
  });

  it('applyPulledExpenses restores synced tax classification fields', () => {
    const merged = applyPulledExpenses([
      {
        id: 'expense-classified',
        date: '2026-04-09',
        category: ExpenseCategory.FUEL,
        amount: 100,
        description: JSON.stringify({ description: 'Mixed-use fuel' }),
        has_image: 0,
        scope: 'mixed',
        business_use_percent: 60,
        deductible_amount: 60,
        non_deductible_amount: 40,
        vehicle_expense_type: 'running_cost',
        tax_treatment: 'partially_deductible',
        linked_shift_id: 'shift-123',
        source_type: 'bank_import',
        review_status: 'pending',
        updated_at: '2026-04-09T12:00:00.000Z',
      },
    ]);

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'expense-classified',
        scope: 'mixed',
        businessUsePercent: 60,
        deductibleAmount: 60,
        nonDeductibleAmount: 40,
        vehicleExpenseType: 'running_cost',
        taxTreatment: 'partially_deductible',
        linkedShiftId: 'shift-123',
        sourceType: 'bank_import',
        reviewStatus: 'pending',
      }),
    ]);
  });

  it('applyPulledShiftWorkLogs recreates local work logs from shift rows', () => {
    const merged = applyPulledShiftWorkLogs(
      [
        {
          id: 'shift-1',
          date: '2026-04-06',
          status: 'completed',
          primary_platform: 'Uber',
          hours_worked: 5,
          total_earnings: 150,
          started_at: '2026-04-06T10:00:00Z',
          ended_at: '2026-04-06T15:00:00Z',
          business_miles: 42,
          fuel_liters: 12,
          job_count: 10,
          notes: 'Lunch rush',
        },
      ],
      [
        { id: 'earning-1', shift_id: 'shift-1', platform: 'uber', amount: 90, job_count: 6 },
        { id: 'earning-2', shift_id: 'shift-1', platform: 'deliveroo', amount: 60, job_count: 4 },
      ]
    );

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'shift-1',
        provider: 'Uber',
        hoursWorked: 5,
        revenue: 150,
        milesDriven: 42,
        providerSplits: [
          { provider: 'Uber', revenue: 90, jobCount: 6 },
          { provider: 'Deliveroo', revenue: 60, jobCount: 4 },
        ],
      }),
    ]);
  });
});
