import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProfitTaxChart } from '../ProfitTaxChart';

describe('ProfitTaxChart', () => {
  it('renders paths for each layer', () => {
    render(
      <ProfitTaxChart
        data={[
          { month: 'Jan', profit: 100, tax: 20, deductions: 30 },
        ]}
      />
    );
    const paths = document.querySelectorAll('path');
    expect(paths.length).toBe(3);
  });
});
