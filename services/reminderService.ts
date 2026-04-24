import type { Settings } from '../types';

export const DAILY_REMINDER_NOTIFICATION_TAG = 'driver-buddy-daily-log-reminder';
export const DAILY_REMINDER_ACTION_URL = '/?action=add-shift';

const REMINDER_TITLE = 'Driver Buddy';
const REMINDER_BODY = 'Still need to log today?';
const SERVICE_WORKER_READY_TIMEOUT_MS = 1000;

export type ReminderPermissionState = NotificationPermission | 'unsupported';
type ReminderSettings = Pick<Settings, 'reminderEnabled' | 'reminderTime'>;

interface ReminderCallbacks {
  onInAppReminder?: () => void;
  onNotificationClick?: () => void;
}

interface DailyReminderNotificationOptions extends NotificationOptions {
  actions?: Array<{ action: string; title: string }>;
  badge?: string;
  renotify?: boolean;
}

let reminderTimerId: number | null = null;
let scheduleGeneration = 0;

function clearReminderTimer() {
  if (reminderTimerId !== null && typeof window !== 'undefined') {
    window.clearTimeout(reminderTimerId);
  }
  reminderTimerId = null;
}

export function parseReminderTime(reminderTime: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(reminderTime);
  if (!match) return null;

  const [, hourValue, minuteValue] = match;
  if (hourValue === undefined || minuteValue === undefined) return null;

  return {
    hours: Number(hourValue),
    minutes: Number(minuteValue),
  };
}

export function getNextReminderDate(reminderTime: string, now = new Date()): Date | null {
  const parsed = parseReminderTime(reminderTime);
  if (!parsed) return null;

  const nextReminder = new Date(now);
  nextReminder.setHours(parsed.hours, parsed.minutes, 0, 0);

  if (nextReminder.getTime() <= now.getTime()) {
    nextReminder.setDate(nextReminder.getDate() + 1);
  }

  return nextReminder;
}

export function getReminderPermission(): ReminderPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
}

export async function ensureReminderPermission(): Promise<ReminderPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (Notification.permission !== 'default') {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  const ready = navigator.serviceWorker.ready.catch(() => null);
  const timeout = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS);
  });

  return Promise.race([ready, timeout]);
}

function getReminderActionUrl(): string {
  if (typeof window === 'undefined') return DAILY_REMINDER_ACTION_URL;
  return new URL(DAILY_REMINDER_ACTION_URL, window.location.origin).href;
}

async function closeDisplayedReminderNotifications() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const notifications = await registration?.getNotifications?.({ tag: DAILY_REMINDER_NOTIFICATION_TAG });
    notifications?.forEach((notification) => notification.close());
  } catch {
    // Best-effort cleanup only. Timer cancellation is the important part.
  }
}

async function showDailyReminderNotification(callbacks: ReminderCallbacks, shouldShow: () => boolean) {
  if (!shouldShow()) return;

  if (getReminderPermission() !== 'granted') {
    if (shouldShow()) callbacks.onInAppReminder?.();
    return;
  }

  const notificationOptions: DailyReminderNotificationOptions = {
    body: REMINDER_BODY,
    tag: DAILY_REMINDER_NOTIFICATION_TAG,
    renotify: true,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: getReminderActionUrl() },
    actions: [{ action: 'add-shift', title: 'Log shift' }],
  };

  try {
    const registration = await getReadyServiceWorkerRegistration();
    if (!shouldShow()) return;

    if (registration?.showNotification) {
      await registration.showNotification(REMINDER_TITLE, notificationOptions);
      return;
    }

    if (!shouldShow()) return;
    const notification = new Notification(REMINDER_TITLE, notificationOptions);
    notification.onclick = (event) => {
      event.preventDefault();
      notification.close();
      window.focus();
      callbacks.onNotificationClick?.();
    };
  } catch {
    if (shouldShow()) callbacks.onInAppReminder?.();
  }
}

export function scheduleDailyReminder(settings: ReminderSettings, callbacks: ReminderCallbacks = {}) {
  scheduleGeneration += 1;
  const generation = scheduleGeneration;
  clearReminderTimer();

  if (typeof window === 'undefined' || !settings.reminderEnabled || !settings.reminderTime) {
    return { status: 'disabled' as const };
  }

  const nextReminder = getNextReminderDate(settings.reminderTime);
  if (!nextReminder) {
    return { status: 'invalid-time' as const };
  }

  const delay = Math.max(0, nextReminder.getTime() - Date.now());
  reminderTimerId = window.setTimeout(() => {
    void showDailyReminderNotification(callbacks, () => generation === scheduleGeneration).finally(() => {
      if (generation === scheduleGeneration) {
        scheduleDailyReminder(settings, callbacks);
      }
    });
  }, delay);

  return { status: 'scheduled' as const, nextReminderAt: nextReminder.toISOString() };
}

export function cancelDailyReminder() {
  scheduleGeneration += 1;
  clearReminderTimer();
  void closeDisplayedReminderNotifications();
}
