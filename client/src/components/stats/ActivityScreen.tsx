import React, { useState } from 'react';
import { StorageService } from '../../services/StorageService';
import { WakeLogItem } from '../../types/alarm';
import { CheckCircle2, Flame, Clock, Award, Trash2 } from 'lucide-react';

export const ActivityScreen: React.FC = () => {
  const [logs, setLogs] = useState<WakeLogItem[]>(StorageService.getWakeLogs);
  const currentStreak = StorageService.calculateStreak();

  const handleClearHistory = () => {
    if (confirm('Clear all saved wake activity history?')) {
      localStorage.removeItem('rise_wakelogs_v1');
      setLogs([]);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const avgResponse = logs.length > 0
    ? Math.round(logs.reduce((acc, curr) => acc + curr.responseTimeSeconds, 0) / logs.length)
    : 0;

  return (
    <div className="w-full max-w-md mx-auto py-4 space-y-6 select-none animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-theme-text">
            Activity
          </h2>
          <p className="text-sm text-theme-subtext mt-0.5">
            Saved wake-up records and consistency
          </p>
        </div>

        {logs.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="p-2 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Clear history"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak Card */}
        <div className="rounded-2xl p-4 bg-theme-card border border-theme-border shadow-sm">
          <div className="flex items-center space-x-2 text-orange-500 mb-1">
            <Flame size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Streak</span>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-4xl font-bold text-theme-text font-tabular">
              {currentStreak}
            </span>
            <span className="text-xs text-theme-subtext font-medium">Days</span>
          </div>
          <span className="text-[11px] text-theme-subtext mt-1 block">
            Dismissed &lt;10 mins
          </span>
        </div>

        {/* Reaction Time */}
        <div className="rounded-2xl p-4 bg-theme-card border border-theme-border shadow-sm">
          <div className="flex items-center space-x-2 text-blue-500 mb-1">
            <Clock size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Avg Wake Speed</span>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-bold text-theme-text font-tabular">
              {avgResponse > 0 ? formatSeconds(avgResponse) : '--'}
            </span>
          </div>
          <span className="text-[11px] text-theme-subtext mt-1 block">
            Verification speed
          </span>
        </div>
      </div>

      {/* Saved Activity Logs List */}
      <div className="space-y-3">
        <div className="text-xs font-bold tracking-wider uppercase text-theme-subtext">
          SAVED WAKE SESSIONS ({logs.length})
        </div>

        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-theme-border p-8 text-center text-theme-subtext text-xs space-y-2">
            <Award size={28} className="mx-auto text-neutral-400" />
            <p className="font-semibold text-theme-text text-sm">No activity recorded yet</p>
            <p>Every time you wake up and complete your pushups or math tasks, the verified record will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {logs.map((log) => {
              const dateObj = new Date(log.dismissedAt);
              const dateFormatted = dateObj.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                weekday: 'short',
              });
              const timeFormatted = dateObj.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });

              return (
                <div
                  key={log.id}
                  className="rounded-2xl p-4 bg-theme-card border border-theme-border shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-theme-text">
                        {dateFormatted} • {timeFormatted}
                      </div>
                      <div className="text-xs text-theme-subtext mt-0.5">
                        {log.dismissalType.replace('_', ' ')} • Verified
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-semibold text-theme-text font-tabular">
                      {formatSeconds(log.responseTimeSeconds)}
                    </span>
                    <span className="block text-[10px] text-green-600 font-medium">
                      Dismissed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
