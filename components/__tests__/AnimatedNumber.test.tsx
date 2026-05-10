import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AnimatedNumber } from '../AnimatedNumber';

describe('AnimatedNumber', () => {
  it('renders final value after animation', async () => {
    render(<AnimatedNumber value={123} prefix="£" suffix=" earned" />);
    await waitFor(() => {
      expect(screen.getByText('£123 earned')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('respects prefers-reduced-motion and renders immediately', () => {
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

    render(<AnimatedNumber value={456} />);
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  it('formats decimals correctly', async () => {
    render(<AnimatedNumber value={99.5} decimals={1} />);
    await waitFor(() => {
      expect(screen.getByText('99.5')).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
