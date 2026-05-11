import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlatformBreakdownCard } from '../PlatformBreakdownCard';

const makeLog = (overrides: any) => ({
  id: '1',
  date: '2026-05-01',
  provider: 'Uber',
  hoursWorked: 2,
  revenue: 20,
  ...overrides,
});

describe('PlatformBreakdownCard', () => {
  it('renders week/month/year tabs', () => {
    render(<PlatformBreakdownCard logs={[makeLog({})]} />);
    expect(screen.getByRole('button', { name: /Week/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Year/i })).toBeInTheDocument();
  });

  it('switches tabs on click', () => {
    render(<PlatformBreakdownCard logs={[makeLog({})]} />);
    const monthBtn = screen.getByRole('button', { name: /Month/i });
    fireEvent.click(monthBtn);
    expect(monthBtn).toHaveClass('bg-brand');
  });
});
