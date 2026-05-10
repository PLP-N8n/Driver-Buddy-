import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkBackfillCalendar } from '../BulkBackfillCalendar';

describe('BulkBackfillCalendar', () => {
  it('renders missed days', () => {
    render(<BulkBackfillCalendar missedDays={['2026-05-01', '2026-05-02']} selectedDays={[]} onToggleDay={vi.fn()} />);
    expect(screen.getByText('1 May')).toBeInTheDocument();
  });

  it('toggles selection on click', () => {
    const onToggle = vi.fn();
    render(<BulkBackfillCalendar missedDays={['2026-05-01']} selectedDays={[]} onToggleDay={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('2026-05-01');
  });

  it('highlights selected days with brand background', () => {
    render(<BulkBackfillCalendar missedDays={['2026-05-01']} selectedDays={['2026-05-01']} onToggleDay={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-brand');
    expect(button.className).toContain('text-white');
  });

  it('renders unselected days with border style', () => {
    render(<BulkBackfillCalendar missedDays={['2026-05-01']} selectedDays={[]} onToggleDay={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('border');
    expect(button.className).toContain('text-slate-300');
  });
});
