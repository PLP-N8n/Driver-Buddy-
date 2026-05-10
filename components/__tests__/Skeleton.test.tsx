import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders card variant with correct height', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.firstChild).toHaveClass('h-32');
  });

  it('renders chart variant with correct height', () => {
    const { container } = render(<Skeleton variant="chart" />);
    expect(container.firstChild).toHaveClass('h-40');
  });

  it('renders list variant with correct height', () => {
    const { container } = render(<Skeleton variant="list" />);
    expect(container.firstChild).toHaveClass('h-16');
  });

  it('renders text variant', () => {
    const { container } = render(<Skeleton variant="text" />);
    expect(container.firstChild).toHaveClass('h-4');
  });

  it('uses rectangular variant by default (backwards compatible)', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('rounded-2xl');
  });

  it('shimmer is off by default (backwards compatible)', () => {
    const { container } = render(<Skeleton />);
    const child = container.firstChild?.firstChild;
    expect(child).toBeNull();
  });
});
