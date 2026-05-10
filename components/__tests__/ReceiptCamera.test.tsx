import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptCamera } from '../ReceiptCamera';

describe('ReceiptCamera', () => {
  it('renders camera input label', () => {
    render(<ReceiptCamera onCapture={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/Take photo/i)).toBeInTheDocument();
  });

  it('renders upload area with camera icon', () => {
    render(<ReceiptCamera onCapture={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Take photo or upload/i)).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    render(<ReceiptCamera onCapture={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });
});
