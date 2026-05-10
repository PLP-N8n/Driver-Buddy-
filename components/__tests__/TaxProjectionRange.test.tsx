import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaxProjectionRange } from '../TaxProjectionRange';

describe('TaxProjectionRange', () => {
  it('renders three projections', () => {
    render(
      <TaxProjectionRange
        currentProjection={5000}
        conservativeProjection={4500}
        optimisticProjection={6000}
        requiredWeeklyAverage={200}
        weeksRemaining={10}
      />
    );
    expect(screen.getByText('£4,500.00')).toBeInTheDocument();
    expect(screen.getByText('£5,000.00')).toBeInTheDocument();
    expect(screen.getByText('£6,000.00')).toBeInTheDocument();
  });

  it('shows required weekly average when above zero', () => {
    render(
      <TaxProjectionRange
        currentProjection={5000}
        conservativeProjection={4500}
        optimisticProjection={6000}
        requiredWeeklyAverage={200}
        weeksRemaining={10}
      />
    );
    expect(screen.getByText(/You need to average/)).toBeInTheDocument();
  });
});
