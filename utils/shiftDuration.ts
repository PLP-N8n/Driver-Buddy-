const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const parseClockMinutes = (value: string): number | null => {
  const [hoursText, minutesText] = value.split(':');
  const hours = Number.parseInt(hoursText ?? '', 10);
  const minutes = Number.parseInt(minutesText ?? '', 10);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

export const calculateClockShiftDurationHours = (
  startTime: string,
  endTime: string,
  breakMinutes = 0
): number | null => {
  const startMinutes = parseClockMinutes(startTime);
  const endMinutes = parseClockMinutes(endTime);

  if (startMinutes == null || endMinutes == null) {
    return null;
  }

  const adjustedEndMinutes = endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const workedMinutes = adjustedEndMinutes - startMinutes - Math.max(0, breakMinutes);
  return Math.max(0, workedMinutes / 60);
};

export const calculateTimestampShiftDurationHours = (startedAt: string, endedAt: string): number => {
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();

  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return 0;
  }

  const adjustedEndedMs = endedMs < startedMs ? endedMs + MS_PER_DAY : endedMs;
  return Math.max(0, (adjustedEndedMs - startedMs) / MS_PER_HOUR);
};
