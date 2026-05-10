import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthlyDrillDown } from '../MonthlyDrillDown';

describe('MonthlyDrillDown', () => {
  it('renders calendar grid', () => {
    render(
      <MonthlyDrillDown
        month={4}
        year={2026}
        dailyLogs={[{ id: '1', date: '2026-05-10', revenue: 80, provider: 'Uber', hoursWorked: 3 }]}
        onDayClick={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('May 2026')).toBeInTheDocument();
  });

  it('calls onDayClick when cell tapped', () => {
    const onDayClick = vi.fn();
    render(
      <MonthlyDrillDown
        month={4}
        year={2026}
        dailyLogs={[{ id: '1', date: '2026-05-10', revenue: 80, provider: 'Uber', hoursWorked: 3 }]}
        onDayClick={onDayClick}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('10'));
    expect(onDayClick).toHaveBeenCalledWith('2026-05-10');
  });
});
