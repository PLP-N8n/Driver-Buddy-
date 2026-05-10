import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlatformBarChart } from '../PlatformBarChart';

describe('PlatformBarChart', () => {
  it('renders horizontal bars', () => {
    render(
      <PlatformBarChart
        data={[
          { provider: 'Uber', revenue: 500 },
          { provider: 'Bolt', revenue: 300 },
        ]}
      />
    );
    const bars = document.querySelectorAll('rect');
    expect(bars.length).toBe(2);
  });
});
