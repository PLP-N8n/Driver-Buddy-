import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RealTimeTaxMeter } from '../RealTimeTaxMeter';

const baseProps = {
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

describe('RealTimeTaxMeter size prop', () => {
  it('renders hero size with tax meter ring', () => {
    render(<RealTimeTaxMeter {...baseProps} size="hero" />);
    expect(document.querySelector('.tax-meter-foreground')).toBeTruthy();
  });

  it('does not render ring in compact size', () => {
    render(<RealTimeTaxMeter {...baseProps} size="compact" />);
    expect(document.querySelector('.tax-meter-foreground')).toBeFalsy();
  });
});
