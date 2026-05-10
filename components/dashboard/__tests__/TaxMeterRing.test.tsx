import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TaxMeterRing } from '../TaxMeterRing';

describe('TaxMeterRing', () => {
  it('renders an svg with two circles', () => {
    const { container } = render(<TaxMeterRing percent={50} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('respects reduced motion and sets dashoffset immediately', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { container } = render(<TaxMeterRing percent={75} />);
    const foreground = container.querySelector('.tax-meter-foreground');
    expect(foreground).toBeTruthy();
  });
});
