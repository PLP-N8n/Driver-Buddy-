import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PullToRefreshIndicator } from '../PullToRefreshIndicator';

describe('PullToRefreshIndicator', () => {
  it('is hidden when idle', () => {
    const { container } = render(<PullToRefreshIndicator pullState="idle" pullDistance={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows pull text when pulling', () => {
    render(<PullToRefreshIndicator pullState="pulling" pullDistance={40} />);
    expect(screen.getByText('Pull to sync')).toBeInTheDocument();
  });

  it('shows release text when ready', () => {
    render(<PullToRefreshIndicator pullState="ready" pullDistance={100} />);
    expect(screen.getByText('Release to sync')).toBeInTheDocument();
  });

  it('shows syncing text when refreshing', () => {
    render(<PullToRefreshIndicator pullState="refreshing" pullDistance={80} />);
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
  });
});
