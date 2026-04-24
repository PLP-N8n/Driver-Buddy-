import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelDailyReminder,
  getNextReminderDate,
  parseReminderTime,
  scheduleDailyReminder,
} from './reminderService';

describe('reminderService', () => {
  afterEach(() => {
    cancelDailyReminder();
    vi.useRealTimers();
  });

  it('parses valid 24-hour reminder times', () => {
    expect(parseReminderTime('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseReminderTime('18:30')).toEqual({ hours: 18, minutes: 30 });
    expect(parseReminderTime('23:59')).toEqual({ hours: 23, minutes: 59 });
  });

  it('rejects invalid reminder times', () => {
    expect(parseReminderTime('24:00')).toBeNull();
    expect(parseReminderTime('18:60')).toBeNull();
    expect(parseReminderTime('6:00')).toBeNull();
    expect(parseReminderTime('')).toBeNull();
  });

  it('schedules the next reminder today when the time has not passed', () => {
    const now = new Date(2026, 3, 24, 17, 59, 30);
    const next = getNextReminderDate('18:00', now);

    expect(next).toEqual(new Date(2026, 3, 24, 18, 0, 0, 0));
  });

  it('schedules the next reminder tomorrow when the time has passed', () => {
    const now = new Date(2026, 3, 24, 18, 0, 1);
    const next = getNextReminderDate('18:00', now);

    expect(next).toEqual(new Date(2026, 3, 25, 18, 0, 0, 0));
  });

  it('fires an in-app reminder when browser notifications are unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 24, 17, 59, 30));
    const onInAppReminder = vi.fn();

    scheduleDailyReminder(
      { reminderEnabled: true, reminderTime: '18:00' },
      { onInAppReminder }
    );

    await vi.advanceTimersByTimeAsync(30_000);

    expect(onInAppReminder).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending reminder timer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 24, 17, 59, 30));
    const onInAppReminder = vi.fn();

    scheduleDailyReminder(
      { reminderEnabled: true, reminderTime: '18:00' },
      { onInAppReminder }
    );
    cancelDailyReminder();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(onInAppReminder).not.toHaveBeenCalled();
  });
});
