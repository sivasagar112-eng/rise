import React, { useState, useRef } from 'react';
import { Alarm } from '../../types/alarm';
import { Trash2, Dumbbell, Smartphone, Calculator, Sun, Scan } from 'lucide-react';
import { formatTime12h } from '../../utils/timeFormat';
import { Haptics } from '../../services/HapticFeedback';

interface AlarmCardProps {
  alarm: Alarm;
  onToggle: (id: string) => void;
  onEdit: (alarm: Alarm) => void;
  onDelete?: (id: string) => void;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const taskMeta: Record<
  string,
  { label: string; icon: React.ReactNode; bg: string; text: string; border: string }
> = {
  PUSHUP_MATH: {
    label: 'Push-ups',
    icon: <Dumbbell size={12} strokeWidth={2.4} />,
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  CLICK_SHAKE: {
    label: 'Taps + Shake',
    icon: <Smartphone size={12} strokeWidth={2.4} />,
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  MATH: {
    label: 'Math Puzzles',
    icon: <Calculator size={12} strokeWidth={2.4} />,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  BRIGHTNESS: {
    label: 'Turn on Lights',
    icon: <Sun size={12} strokeWidth={2.4} />,
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
  },
  OBJECT_MATCH: {
    label: 'Scan Object',
    icon: <Scan size={12} strokeWidth={2.4} />,
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/20',
  },
};

export const AlarmCard: React.FC<AlarmCardProps> = ({ alarm, onToggle, onEdit, onDelete }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pressed, setPressed] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { timeStr, period } = formatTime12h(alarm.time);

  const getSubtitle = () => {
    if (alarm.daysOfWeek.length === 0) return 'Ring once';
    if (alarm.daysOfWeek.length === 7) return 'Every day';
    if (alarm.daysOfWeek.length === 5 && [1, 2, 3, 4, 5].every((d) => alarm.daysOfWeek.includes(d)))
      return 'Weekdays';
    if (alarm.daysOfWeek.length === 2 && [0, 6].every((d) => alarm.daysOfWeek.includes(d)))
      return 'Weekends';
    return alarm.daysOfWeek.map((d) => DAYS_SHORT[d]).join(', ');
  };

  const task = taskMeta[alarm.dismissalType] ?? taskMeta['PUSHUP_MATH'];

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    isLongPressRef.current = false;
    setPressed(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    touchStartPosRef.current = { x: clientX, y: clientY };

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      Haptics.heavy();
      setPressed(false);
      setShowDeleteModal(true);
    }, 480);
  };

  const handleTouchEnd = () => {
    setPressed(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!longPressTimerRef.current) return;
    const diffX = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
    const diffY = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
    if (diffX > 8 || diffY > 8) {
      setPressed(false);
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClick = () => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    Haptics.light();
    onEdit(alarm);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    Haptics.heavy();
    setShowDeleteModal(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.error();
    setShowDeleteModal(false);
    onDelete?.(alarm.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.selection();
    onToggle(alarm.id);
  };

  return (
    <>
      <div
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onContextMenu={handleContextMenu}
        style={{
          transform: pressed ? 'scale(0.975)' : 'scale(1)',
          transition: pressed
            ? 'transform 90ms cubic-bezier(0.34,1.56,0.64,1), opacity 90ms ease, box-shadow 90ms ease'
            : 'transform 260ms cubic-bezier(0.34,1.56,0.64,1), opacity 260ms ease, box-shadow 260ms ease',
          opacity: pressed ? 0.88 : alarm.isEnabled ? 1 : 0.58,
        }}
        className={`
          w-full rounded-[26px] p-5 mb-3.5 cursor-pointer select-none
          card-premium stagger-item
          ${alarm.isEnabled ? 'ring-1 ring-blue-500/10' : ''}
        `}
      >
        <div className="flex items-center justify-between">
          {/* ── Left: Time & Information ── */}
          <div className="flex-1 pr-4 min-w-0">
            <div className="flex items-baseline space-x-2">
              <span
                className={`text-[46px] leading-none font-black tracking-tight font-tabular transition-colors duration-220 ${
                  alarm.isEnabled ? 'text-theme-text' : 'text-theme-muted'
                }`}
              >
                {timeStr}
              </span>
              <span
                className={`text-sm font-bold tracking-wider uppercase transition-colors duration-220 ${
                  alarm.isEnabled ? 'text-blue-500' : 'text-theme-muted'
                }`}
              >
                {period}
              </span>
            </div>

            {/* Label, Schedule & Task Badge */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {alarm.label && alarm.label !== 'Alarm' && (
                <span className="text-xs font-bold text-theme-text truncate max-w-[140px]">
                  {alarm.label}
                </span>
              )}

              <span className="text-xs text-theme-subtext font-medium">{getSubtitle()}</span>

              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${task.bg} ${task.text} ${task.border}`}
              >
                {task.icon}
                <span>
                  {task.label}
                  {alarm.dismissalType === 'PUSHUP_MATH' && alarm.pushupTarget
                    ? ` ×${alarm.pushupTarget}`
                    : ''}
                </span>
              </div>
            </div>
          </div>

          {/* ── Right: Tactile Spring Toggle Switch ── */}
          <div onClick={handleToggle} className="shrink-0 press-spring pl-1">
            <div
              className={`
                w-[54px] h-[32px] rounded-full relative p-[3px] flex items-center cursor-pointer
                toggle-track
                ${
                  alarm.isEnabled
                    ? 'bg-blue-600 shadow-[0_0_16px_rgba(37,99,235,0.45)]'
                    : 'bg-[var(--toggle-off)]'
                }
              `}
            >
              <div
                className={`
                  w-[26px] h-[26px] rounded-full bg-white toggle-thumb shadow-md
                  ${alarm.isEnabled ? 'translate-x-[22px]' : 'translate-x-0'}
                `}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Long-Press Delete Modal ── */}
      {showDeleteModal && (
        <div
          onClick={() => setShowDeleteModal(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#14151C] border border-white/10 rounded-3xl p-6 text-center text-white shadow-2xl space-y-4 sheet-up"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-500/12 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 size={26} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Delete Alarm?</h3>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                Remove the{' '}
                <strong className="text-white font-semibold">
                  {timeStr} {period}
                </strong>{' '}
                alarm{alarm.label ? ` — "${alarm.label}"` : ''}?
              </p>
            </div>
            <div className="space-y-2.5 pt-1">
              <button
                onClick={confirmDelete}
                className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-sm font-extrabold transition-all shadow-lg shadow-red-500/25 press-spring flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                Delete Alarm
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="w-full py-3 bg-white/8 hover:bg-white/12 text-neutral-300 rounded-2xl text-sm font-semibold transition-colors press-spring"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
