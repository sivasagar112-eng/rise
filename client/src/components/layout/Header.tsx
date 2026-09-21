import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Settings, Sun, Moon } from 'lucide-react';
import { Alarm } from '../../types/alarm';
import { getNextUpcomingAlarmCountdown } from '../../utils/timeFormat';

interface HeaderProps {
  theme: 'dark' | 'light';
  alarms: Alarm[];
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onInstantTest?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  alarms,
  onToggleTheme,
  onOpenSettings,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Calculate upcoming alarm time subtitle matching the screenshot (e.g. "Next alarm in 6 minutes")
  const getHeaderSubtitle = () => {
    const countdown = getNextUpcomingAlarmCountdown(alarms);
    if (!countdown) {
      return 'All alarms turned off';
    }
    return countdown;
  };

  return (
    <header className="w-full max-w-md mx-auto pt-5 pb-3 px-6 select-none relative">
      {/* Top action row: Theme Toggle Button directly on top right + Three-dot menu */}
      <div className="flex justify-end items-center space-x-2 mb-3">
        {/* Direct Dark/Light Mode Button on the top right side */}
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-full border border-theme-border bg-theme-card text-theme-text hover:opacity-80 active:scale-95 transition-all shadow-sm flex items-center justify-center"
          aria-label="Toggle Dark and Light Mode"
        >
          {theme === 'dark' ? (
            <Sun size={19} className="text-yellow-400" />
          ) : (
            <Moon size={19} className="text-neutral-700" />
          )}
        </button>

        {/* Three-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-full border border-theme-border bg-theme-card text-theme-subtext hover:text-theme-text transition-colors shadow-sm"
            aria-label="More options"
          >
            <MoreVertical size={18} />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 top-11 w-48 bg-theme-card border border-theme-border rounded-xl shadow-2xl py-1.5 z-50 animate-fade-in text-xs font-medium text-theme-text">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 hover:bg-theme-border/20 text-left transition-colors"
              >
                <Settings size={15} />
                <span>Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Title and Subtitle */}
      <div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-theme-text">
          Alarm
        </h1>
        <p className="text-sm text-theme-subtext mt-1 font-normal">
          {getHeaderSubtitle()}
        </p>
      </div>
    </header>
  );
};
