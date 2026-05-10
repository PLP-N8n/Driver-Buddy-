import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from '../Toast';

describe('Toast', () => {
  it('renders message and has role="alert"', () => {
    render(<Toast message="Saved!" type="success" duration={4000} onClose={vi.fn()} />);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders error type with correct icon', () => {
    render(<Toast message="Failed!" type="error" duration={4000} onClose={vi.fn()} />);
    expect(screen.getByText('Failed!')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
