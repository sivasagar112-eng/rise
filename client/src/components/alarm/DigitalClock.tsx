import React, { useState, useEffect } from 'react';
import { Alarm } from '../../types/alarm';

interface DigitalClockProps {
  alarms: Alarm[];
}

export const DigitalClock: React.FC<DigitalClockProps> = ({ alarms }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();

  // Find next upcoming enabled alarm
  const getNextAlarmNotice = (): string | null => {
    const enabledAlarms = alarms.filter((a) => a.isEnabled);
    if (!enabledAlarms.length) return null;

    const currentMinutesOfDay = now.getHours() * 60 + now.getMinutes();
    let minDiff = Infinity;
    let nextAlarmTime = '';

    for (const alarm of enabledAlarms) {
      const [h, m] = alarm.time.split(':').map(Number);
      const alarmMinutesOfDay = h * 60 + m;

      let diff = alarmMinutesOfDay - currentMinutesOfDay;
      if (diff <= 0) {
        diff += 24 * 60; // Next day
      }
      if (diff < minDiff) {
        minDiff = diff;
        nextAlarmTime = alarm.time;
      }
    }

    const diffHours = Math.floor(minDiff / 60);
    const diffMins = minDiff % 60;
    return `NEXT IN ${diffHours}H ${diffMins}M (${nextAlarmTime})`;
  };

  const nextNotice = getNextAlarmNotice();

  return (
    <div className="w-full max-w-md mx-auto py-8 px-6 text-center select-none">
      {/* Date */}
      <div className="text-xs font-mono tracking-widest text-theme-subtext uppercase mb-2">
        {dateStr}
      </div>

      {/* Dieter Rams Clock Display */}
      <div className="flex items-baseline justify-center space-x-1 font-mono">
        <span className="text-6xl sm:text-7xl font-light tracking-tighter text-theme-text font-tabular">
          {hours}
        </span>
        <span className="text-5xl sm:text-6xl font-extralight text-theme-muted animate-pulse-subtle">
          :
        </span>
        <span className="text-6xl sm:text-7xl font-light tracking-tighter text-theme-text font-tabular">
          {minutes}
        </span>
        <span className="text-xs font-mono text-theme-muted font-tabular ml-2 tracking-wider">
          {seconds}s
        </span>
      </div>

      {/* Next Alarm Pill */}
      {nextNotice && (
        <div className="mt-3 inline-block">
          <span className="text-[10px] font-mono tracking-wider px-2.5 py-1 border border-theme-border bg-theme-card text-theme-subtext">
            {nextNotice}
          </span>
        </div>
      )}
    </div>
  );
};
