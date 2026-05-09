const PATTERNS: Record<string, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 20],
  error: [40, 100, 40],
};

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';

export function triggerHaptic(pattern: HapticPattern = 'light'): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    const value = PATTERNS[pattern];
    if (value === undefined) return;
    navigator.vibrate(value);
  } catch {
    // ignore unsupported vibrate calls
  }
}
