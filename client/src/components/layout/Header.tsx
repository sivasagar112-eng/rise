import React, { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Bell, BellOff } from 'lucide-react';
import { Alarm } from '../../types/alarm';
import { getNextUpcomingAlarmCountdown } from '../../utils/timeFormat';
import { Haptics } from '../../services/HapticFeedback';

interface HeaderProps {
  theme: 'dark' | 'light';
  alarms: Alarm[];
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onInstantTest?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ theme, alarms, onToggleTheme, onOpenSettings }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const [timePart = '', ampm = ''] = timeStr.split(' ');
  const [hours = '12', minutes = '00'] = timePart.split(':');

  const dateStr = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const subtitle = getNextUpcomingAlarmCountdown(alarms) ?? 'No alarms active';
  const hasAlarms = alarms.some((a) => a.isEnabled);

  const handleToggleTheme = () => {
    Haptics.selection();
    onToggleTheme();
  };

  const handleOpenSettings = () => {
    Haptics.light();
    onOpenSettings();
  };

  return (
    <header className="w-full pt-7 pb-4 px-6 select-none relative z-10 animate-fade-in">
      {/* ── Top Action Bar ── */}
      <div className="flex justify-between items-center mb-6">
        {/* Brand Wordmark: Bold & Prominent */}
        <div>
          <span className="text-2xl sm:text-[28px] font-black tracking-tight text-theme-text">
            Rise
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Theme Toggle Button */}
          <button
            onClick={handleToggleTheme}
            aria-label="Toggle theme"
            className="w-10 h-10 rounded-2xl flex items-center justify-center
                       glass-pill press-spring
                       hover:scale-105 transition-all duration-200"
          >
            {theme === 'dark' ? (
              <Sun size={18} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
            ) : (
              <Moon size={18} className="text-indigo-600" />
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={handleOpenSettings}
            aria-label="Open settings"
            className="w-10 h-10 rounded-2xl flex items-center justify-center
                       glass-pill press-spring
                       hover:scale-105 transition-all duration-200"
          >
            <Settings size={18} className="text-theme-subtext hover:text-theme-text transition-colors" />
          </button>
        </div>
      </div>

      {/* ── High-Precision Live Clock ── */}
      <div className="mb-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[54px] sm:text-[60px] leading-none font-black tracking-tight font-tabular text-theme-text">
            {hours}
          </span>
          <span className="text-[50px] sm:text-[56px] leading-none font-bold text-blue-500 animate-colon select-none">
            :
          </span>
          <span className="text-[54px] sm:text-[60px] leading-none font-black tracking-tight font-tabular text-theme-text">
            {minutes}
          </span>
          <span className="ml-2.5 px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20 self-center">
            {ampm}
          </span>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wider text-theme-subtext mt-2 flex items-center gap-1.5">
          <span>{dateStr}</span>
        </p>
      </div>

      {/* ── Dynamic Next Alarm Pill ── */}
      <div className="mt-4">
        <div
          onClick={() => Haptics.tick()}
          className={`
            inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full text-xs font-semibold
            transition-all duration-300 select-none cursor-pointer press-spring
            ${
              hasAlarms
                ? 'bg-blue-500/10 text-blue-500 border border-blue-500/25 shadow-sm shadow-blue-500/10'
                : 'glass-pill text-theme-subtext'
            }
          `}
        >
          {hasAlarms ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : (
            <BellOff size={13} className="text-theme-muted" />
          )}

          <div className="flex items-center gap-1.5">
            {hasAlarms && <Bell size={12} className="text-blue-500" />}
            <span className="tracking-tight">{subtitle}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
