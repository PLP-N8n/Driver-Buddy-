import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevenueTrendChart } from '../RevenueTrendChart';

describe('RevenueTrendChart', () => {
  it('renders bars for each week', () => {
    render(
      <RevenueTrendChart
        data={[
          { week: 'W1', revenue: 100 },
          { week: 'W2', revenue: 200 },
        ]}
      />
    );
    const bars = document.querySelectorAll('rect');
    expect(bars.length).toBe(2);
  });

  it('shows empty state when no data', () => {
    render(<RevenueTrendChart data={[]} />);
    expect(screen.getByText('Log shifts to see trends')).toBeInTheDocument();
  });
});
