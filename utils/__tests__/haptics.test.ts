import { describe, it, expect, vi, afterEach } from 'vitest';
import { triggerHaptic } from '../haptics';

// jsdom has navigator but without vibrate. We mock vibrate on demand and
// restore it in afterEach so tests don't interfere with each other.

afterEach(() => {
  if ((navigator as any).vibrate) {
    vi.restoreAllMocks();
  }
  // Remove vibrate so other tests see the jsdom default
  try {
    delete (navigator as any).vibrate;
  } catch { /* not deletable */ }
});

describe('triggerHaptic', () => {
  it('calls navigator.vibrate with light pattern (20ms)', () => {
    const vibrate = vi.fn();
    (navigator as any).vibrate = vibrate;

    triggerHaptic('light');
    expect(vibrate).toHaveBeenCalledWith(20);
  });

  it('calls vibrate with medium pattern (20ms)', () => {
    const vibrate = vi.fn();
    (navigator as any).vibrate = vibrate;

    triggerHaptic('medium');
    expect(vibrate).toHaveBeenCalledWith(20);
  });

  it('calls vibrate with heavy pattern (30ms)', () => {
    const vibrate = vi.fn();
    (navigator as any).vibrate = vibrate;

    triggerHaptic('heavy');
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it('defaults to light when no style is provided', () => {
    const vibrate = vi.fn();
    (navigator as any).vibrate = vibrate;

    triggerHaptic();
    expect(vibrate).toHaveBeenCalledWith(20);
  });

  it('does not throw when navigator.vibrate is missing', () => {
    // jsdom navigator doesn't have vibrate by default
    expect(() => triggerHaptic('light')).not.toThrow();
  });
});
