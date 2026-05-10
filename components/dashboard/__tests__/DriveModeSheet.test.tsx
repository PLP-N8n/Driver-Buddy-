import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DriveModeSheet } from '../DriveModeSheet';

describe('DriveModeSheet', () => {
  const mockPrediction = {
    provider: 'Uber',
    startOdometer: 10000,
    estimatedMiles: 45,
    estimatedHours: 4,
    estimatedRevenueAvg: 80,
    fuelLikely: true,
    estimatedRevenueMin: 50,
    estimatedRevenueMax: 110,
    confidence: 'high' as const,
  };

  it('pre-fills provider and odometer', () => {
    render(
      <DriveModeSheet show prediction={mockPrediction} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByText('Uber')).toBeInTheDocument();
    expect(screen.getByText(/End odometer: 10045 mi/)).toBeInTheDocument();
  });

  it('returns null when show is false', () => {
    const { container } = render(
      <DriveModeSheet show={false} prediction={mockPrediction} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onSave with revenue when Save tapped', () => {
    const onSave = vi.fn();
    render(
      <DriveModeSheet show prediction={mockPrediction} onClose={vi.fn()} onSave={onSave} />
    );
    const input = screen.getByPlaceholderText('80');
    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /Save shift/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ revenue: 75, provider: 'Uber' }));
  });

  it('calls onClose when Cancel is tapped', () => {
    const onClose = vi.fn();
    render(
      <DriveModeSheet show prediction={mockPrediction} onClose={onClose} onSave={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
