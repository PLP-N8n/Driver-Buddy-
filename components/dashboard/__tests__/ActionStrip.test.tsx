import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionStrip } from '../ActionStrip';

describe('ActionStrip', () => {
  it('shows Start Shift and Add shift when no active session', () => {
    render(
      <ActionStrip
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={true}
        onStartShift={vi.fn()}
        onEndShift={vi.fn()}
        onQuickAddRevenue={vi.fn()}
        onAddShift={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Start Shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add shift/i })).toBeInTheDocument();
  });

  it('shows End shift and Quick Add when session is active', () => {
    render(
      <ActionStrip
        activeSession={{ startedAt: new Date().toISOString() }}
        activeDurationHours={2.5}
        hasAnyLoggedShifts={true}
        onStartShift={vi.fn()}
        onEndShift={vi.fn()}
        onQuickAddRevenue={vi.fn()}
        onAddShift={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /End shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ £10 quick add/i })).toBeInTheDocument();
  });

  it('shows Log your first shift in empty state', () => {
    const onAddShift = vi.fn();
    render(
      <ActionStrip
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={false}
        onStartShift={vi.fn()}
        onEndShift={vi.fn()}
        onQuickAddRevenue={vi.fn()}
        onAddShift={onAddShift}
      />
    );
    const btn = screen.getByRole('button', { name: /Log your first shift/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onAddShift).toHaveBeenCalledOnce();
  });
});
