import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTransition } from '../PageTransition';

describe('PageTransition', () => {
  it('renders children', () => {
    render(
      <PageTransition activeKey="dashboard">
        <div data-testid="content">Hello</div>
      </PageTransition>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('applies animate-page-in class when not reduced motion', () => {
    render(
      <PageTransition activeKey="dashboard">
        <div>Content</div>
      </PageTransition>
    );
    const wrapper = screen.getByText('Content').parentElement;
    expect(wrapper).toHaveClass('animate-page-in');
  });
});
