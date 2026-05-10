import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimateInView } from '../AnimateInView';

beforeAll(() => {
  if (typeof IntersectionObserver === 'undefined') {
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      readonly root: Element | null = null;
      readonly rootMargin = '';
      readonly thresholds: ReadonlyArray<number> = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
});

describe('AnimateInView', () => {
  it('renders children', () => {
    render(
      <AnimateInView delay="50ms">
        <div data-testid="child">Card</div>
      </AnimateInView>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders with default delay', () => {
    render(
      <AnimateInView>
        <div data-testid="default">Content</div>
      </AnimateInView>
    );
    expect(screen.getByTestId('default')).toBeInTheDocument();
  });

  it('applies additional className', () => {
    render(
      <AnimateInView className="extra-class">
        <div>Content</div>
      </AnimateInView>
    );
    const wrapper = screen.getByText('Content').parentElement;
    expect(wrapper).toHaveClass('extra-class');
  });
});
