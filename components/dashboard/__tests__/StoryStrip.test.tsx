import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoryStrip } from '../StoryStrip';

describe('StoryStrip', () => {
  it('renders stories and dot indicator', () => {
    render(
      <StoryStrip
        stories={[
          { type: 'recentShift', title: 'Recent', body: '£50', cta: 'View', onCta: vi.fn() },
          { type: 'prediction', title: 'Tip', body: 'Drive tonight', cta: 'Start', onCta: vi.fn() },
        ]}
      />
    );
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Tip')).toBeInTheDocument();
    const dots = document.querySelectorAll('.story-dot');
    expect(dots.length).toBe(2);
  });

  it('shows welcome story when empty', () => {
    render(<StoryStrip stories={[]} />);
    expect(screen.getByText('Welcome to Driver Buddy')).toBeInTheDocument();
  });
});
