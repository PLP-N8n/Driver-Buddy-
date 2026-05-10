import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BentoHero } from '../BentoHero';

const mockTaxMeterProps = {
  trips: [],
  expenses: [],
  dailyLogs: [],
  settings: {
    taxSetAsidePercent: 20,
    claimMethod: 'SIMPLIFIED',
    businessRateFirst10k: 0.45,
    businessRateAfter10k: 0.25,
    manualAllowances: [],
  } as any,
  onNavigateToTax: vi.fn(),
};

describe('BentoHero', () => {
  it('renders tax meter and four tiles', () => {
    render(
      <BentoHero
        taxMeterProps={mockTaxMeterProps}
        todayRevenue={0}
        weekRevenue={0}
        weeklyRevenueTarget={500}
        weekProgressPercent={0}
        taxSaved={0}
        totalBusinessMiles={0}
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={false}
        onTileClick={vi.fn()}
      />
    );

    expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
    expect(screen.getByText('Week Progress')).toBeInTheDocument();
    expect(screen.getByText('Tax Saved')).toBeInTheDocument();
    expect(screen.getByText('Miles Logged')).toBeInTheDocument();
  });

  it('shows empty hints when no data', () => {
    render(
      <BentoHero
        taxMeterProps={mockTaxMeterProps}
        todayRevenue={0}
        weekRevenue={0}
        weeklyRevenueTarget={500}
        weekProgressPercent={0}
        taxSaved={0}
        totalBusinessMiles={0}
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={false}
        onTileClick={vi.fn()}
      />
    );

    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(1);
  });
});
