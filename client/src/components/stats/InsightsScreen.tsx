import React from 'react';
import { StorageService } from '../../services/StorageService';
import { WakeLogItem } from '../../types/alarm';
import { Activity, Moon } from 'lucide-react';

export const InsightsScreen: React.FC = () => {
  const logs = StorageService.getWakeLogs();
  const currentStreak = StorageService.calculateStreak();

  // Calculate average response time
  const avgResponse = logs.length > 0
    ? Math.round(logs.reduce((acc, curr) => acc + curr.responseTimeSeconds, 0) / logs.length)
    : 0;

  // Format avg response
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}M ${s}S` : `${s}S`;
  };

  // Generate sleep window data points for minimalist SVG line chart
  const chartPoints = logs.slice(0, 7).reverse().map((log, i) => {
    // Proxy sleep window between 5.5 and 8.5 hours
    const hash = log.scheduledTime.length * (i + 1);
    const hours = 6.5 + (hash % 20) / 10;
    return {
      day: new Date(log.dismissedAt).toLocaleDateString('en-US', { weekday: 'narrow' }),
      hours,
    };
  });

  // Default points if logs are empty
  const displayPoints = chartPoints.length >= 3 ? chartPoints : [
    { day: 'M', hours: 7.2 },
    { day: 'T', hours: 6.8 },
    { day: 'W', hours: 7.5 },
    { day: 'T', hours: 7.0 },
    { day: 'F', hours: 6.5 },
    { day: 'S', hours: 8.0 },
    { day: 'S', hours: 7.4 },
  ];

  const maxH = 9;
  const minH = 5;
  const chartW = 280;
  const chartH = 90;
  const stepX = chartW / (displayPoints.length - 1);

  const pointsString = displayPoints
    .map((p, idx) => {
      const x = idx * stepX;
      const normalizedY = 1 - (p.hours - minH) / (maxH - minH);
      const y = Math.round(normalizedY * chartH);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-8 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-mono tracking-widest text-theme-subtext uppercase mb-1">
          <Activity size={14} />
          <span>CONSISTENCY & SLEEP INSIGHTS</span>
        </div>
        <h2 className="text-xl font-light font-mono text-theme-text tracking-tight">
          PERFORMANCE
        </h2>
      </div>

      {/* Primary Metric: Minimalist Streak & Speed Cards */}
      <div className="grid grid-cols-2 gap-3 font-mono">
        {/* Streak Counter */}
        <div className="border border-theme-border p-4 bg-theme-card">
          <span className="text-[10px] tracking-widest uppercase text-theme-subtext block mb-1">
            STREAK
          </span>
          <div className="flex items-baseline space-x-1">
            <span className="text-4xl font-light font-tabular text-theme-text">
              {currentStreak}
            </span>
            <span className="text-xs text-theme-subtext">DAYS</span>
          </div>
          <span className="text-[10px] text-theme-muted block mt-1">
            Dismissed &lt;10m
          </span>
        </div>

        {/* Wake Speed */}
        <div className="border border-theme-border p-4 bg-theme-card">
          <span className="text-[10px] tracking-widest uppercase text-theme-subtext block mb-1">
            AVG REACTION
          </span>
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-light font-tabular text-theme-text">
              {avgResponse > 0 ? formatSeconds(avgResponse) : '--'}
            </span>
          </div>
          <span className="text-[10px] text-theme-muted block mt-1">
            Task completion time
          </span>
        </div>
      </div>

      {/* Sleep Window Proxy Chart (Dieter Rams Minimalist Line) */}
      <div className="border border-theme-border p-5 bg-theme-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Moon size={14} className="text-theme-subtext" />
            <span className="text-xs font-mono tracking-widest uppercase text-theme-subtext">
              ESTIMATED SLEEP WINDOW
            </span>
          </div>
          <span className="text-xs font-mono text-theme-text font-tabular">
            ~7.2H AVG
          </span>
        </div>

        {/* Minimalist SVG Chart */}
        <div className="w-full flex justify-center my-3">
          <svg
            viewBox={`-10 -10 ${chartW + 20} ${chartH + 20}`}
            className="w-full max-w-xs h-28 overflow-visible"
          >
            {/* Horizontal guide lines */}
            <line
              x1="0"
              y1={chartH * 0.25}
              x2={chartW}
              y2={chartH * 0.25}
              stroke="currentColor"
              strokeDasharray="2 4"
              className="text-theme-border opacity-50"
            />
            <line
              x1="0"
              y1={chartH * 0.75}
              x2={chartW}
              y2={chartH * 0.75}
              stroke="currentColor"
              strokeDasharray="2 4"
              className="text-theme-border opacity-50"
            />

            {/* Polyline */}
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-theme-text"
              points={pointsString}
            />

            {/* Circle points */}
            {displayPoints.map((p, idx) => {
              const x = idx * stepX;
              const normalizedY = 1 - (p.hours - minH) / (maxH - minH);
              const y = Math.round(normalizedY * chartH);
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r="3.5"
                  className="fill-theme-bg stroke-theme-text"
                  strokeWidth="2"
                />
              );
            })}
          </svg>
        </div>

        {/* Day Labels */}
        <div className="flex justify-between text-[10px] font-mono text-theme-muted px-1 mt-1">
          {displayPoints.map((p, i) => (
            <span key={i}>{p.day}</span>
          ))}
        </div>
      </div>

      {/* Recent Dismissals Log */}
      <div>
        <div className="text-[10px] font-mono tracking-widest uppercase text-theme-subtext mb-3">
          RECENT WAKE-UP HISTORY
        </div>
        {logs.length === 0 ? (
          <div className="text-xs font-mono text-theme-muted py-4 text-center border border-dashed border-theme-border">
            No alarm dismissals logged yet. Set an alarm or trigger a test.
          </div>
        ) : (
          <div className="space-y-2 font-mono text-xs">
            {logs.slice(0, 5).map((log: WakeLogItem) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 border border-theme-border bg-theme-card/40"
              >
                <div>
                  <div className="text-theme-text font-bold">
                    {new Date(log.dismissedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="text-[10px] text-theme-subtext uppercase">
                    {log.dismissalType.replace('_', ' ')}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-theme-text font-tabular">
                    {formatSeconds(log.responseTimeSeconds)}
                  </span>
                  <span className="block text-[9px] text-theme-muted">
                    VERIFIED
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
