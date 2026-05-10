import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleSection } from '../CollapsibleSection';

describe('CollapsibleSection', () => {
  it('shows content when expanded by default', () => {
    render(
      <CollapsibleSection title="Platform" defaultExpanded>
        <div data-testid="content">Breakdown</div>
      </CollapsibleSection>
    );
    expect(screen.getByTestId('content')).toBeVisible();
  });

  it('hides content after clicking header', () => {
    render(
      <CollapsibleSection title="Platform" defaultExpanded>
        <div data-testid="content">Breakdown</div>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByRole('button', { name: /Platform/i }));
    expect(screen.queryByTestId('content')).not.toBeVisible();
  });
});
