import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroTile } from '../HeroTile';

describe('HeroTile', () => {
  it('renders label and animated number', async () => {
    render(<HeroTile label="Revenue" value={120} prefix="£" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByText(/120/)).toBeInTheDocument());
  });

  it('shows empty state with hint', () => {
    render(<HeroTile label="Miles" value={0} isEmpty emptyHint="Log a shift" />);
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('Log a shift')).toBeInTheDocument();
  });

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<HeroTile label="Test" value={1} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders progress bar when progress is given', () => {
    render(<HeroTile label="Week" value={50} progress={60} />);
    const bar = document.querySelector('.hero-tile-progress-bar');
    expect(bar).toBeTruthy();
    expect(bar).toHaveStyle({ width: '60%' });
  });
});
