import { Alarm } from '../types/alarm';

/**
 * Converts 24-hour time string ("18:28") to 12-hour format ("6:28", "PM").
 */
export function formatTime12h(time24: string): {
  timeStr: string;
  period: 'AM' | 'PM';
  formatted: string;
} {
  if (!time24 || !time24.includes(':')) {
    return { timeStr: '7:00', period: 'AM', formatted: '7:00 AM' };
  }

  const [h, m] = time24.split(':').map(Number);
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const hours12 = h % 12 === 0 ? 12 : h % 12;
  const minutesStr = String(isNaN(m) ? 0 : m).padStart(2, '0');
  const timeStr = `${hours12}:${minutesStr}`;

  return {
    timeStr,
    period,
    formatted: `${timeStr} ${period}`,
  };
}

/**
 * Calculates the exact remaining duration until a given alarm will fire,
 * taking into account repeating days of the week.
 */
export function getTimeUntilAlarm(
  alarmTime: string,
  daysOfWeek: number[] = []
): {
  diffMs: number;
  totalMinutes: number;
  formattedText: string;
} {
  const now = new Date();
  const [h, m] = (alarmTime || '07:00').split(':').map(Number);

  let target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    h,
    m,
    0,
    0
  );

  if (daysOfWeek && daysOfWeek.length > 0 && daysOfWeek.length < 7) {
    // Find next matching day of week
    let found = false;
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + dayOffset,
        h,
        m,
        0,
        0
      );
      if (candidate.getTime() > now.getTime() && daysOfWeek.includes(candidate.getDay())) {
        target = candidate;
        found = true;
        break;
      }
    }
    if (!found) {
      target.setDate(target.getDate() + 1);
    }
  } else {
    // Single alarm or everyday
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
  }

  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const totalMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let durationStr = '';
  if (days > 0) {
    durationStr = `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) {
      durationStr += `, ${hours} hr${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      durationStr += `, ${minutes} min`;
    }
  } else if (hours > 0) {
    durationStr = `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) {
      durationStr += ` ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
  } else {
    durationStr = `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  return {
    diffMs,
    totalMinutes,
    formattedText: `Next alarm in ${durationStr}`,
  };
}

/**
 * Calculates the next upcoming alarm countdown among all enabled alarms.
 */
export function getNextUpcomingAlarmCountdown(alarms: Alarm[]): string | null {
  const enabledAlarms = alarms.filter((a) => a.isEnabled);
  if (enabledAlarms.length === 0) {
    return null;
  }

  let minDiffMs = Infinity;
  let nextFormattedText = '';

  for (const alarm of enabledAlarms) {
    const { diffMs, formattedText } = getTimeUntilAlarm(alarm.time, alarm.daysOfWeek);
    if (diffMs < minDiffMs) {
      minDiffMs = diffMs;
      nextFormattedText = formattedText;
    }
  }

  return nextFormattedText || null;
}
