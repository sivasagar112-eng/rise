import React, { useState, useRef } from 'react';
import { Alarm } from '../../types/alarm';
import { Trash2 } from 'lucide-react';

interface AlarmCardProps {
  alarm: Alarm;
  onToggle: (id: string) => void;
  onEdit: (alarm: Alarm) => void;
  onDelete?: (id: string) => void;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AlarmCard: React.FC<AlarmCardProps> = ({
  alarm,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Convert 24h (e.g. "06:46" or "18:30") to 12h format
  const formatTime12h = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hours12 = h % 12 === 0 ? 12 : h % 12;
    const minutesStr = String(m).padStart(2, '0');
    return { timeStr: `${hours12}:${minutesStr}`, period };
  };

  const { timeStr, period } = formatTime12h(alarm.time);

  const getSubtitle = () => {
    if (alarm.daysOfWeek.length === 0) {
      return 'Ring once';
    }
    if (alarm.daysOfWeek.length === 7) {
      return 'Every day';
    }
    if (alarm.daysOfWeek.length === 5 && [1, 2, 3, 4, 5].every(d => alarm.daysOfWeek.includes(d))) {
      return 'Weekdays';
    }
    if (alarm.daysOfWeek.length === 2 && [0, 6].every(d => alarm.daysOfWeek.includes(d))) {
      return 'Weekends';
    }
    return alarm.daysOfWeek.map(d => DAYS_SHORT[d]).join(', ');
  };

  const getMethodBadge = () => {
    switch (alarm.dismissalType) {
      case 'PUSHUP_MATH':
        return `${alarm.pushupTarget || 5} Pushups`;
      case 'BRIGHTNESS':
        return 'Light Check';
      case 'FACE_AWAY':
        return 'Face-Away';
      case 'OBJECT_MATCH':
        return 'Object Scan';
      case 'MATH':
        return 'Math Challenge';
      default:
        return '';
    }
  };

  // Long press handlers
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    isLongPressRef.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    touchStartPosRef.current = { x: clientX, y: clientY };

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([60]);
      }
      setShowDeleteModal(true);
    }, 550);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!longPressTimerRef.current) return;
    const moveX = e.touches[0].clientX;
    const moveY = e.touches[0].clientY;
    const diffX = Math.abs(moveX - touchStartPosRef.current.x);
    const diffY = Math.abs(moveY - touchStartPosRef.current.y);

    // If user is scrolling, cancel long press
    if (diffX > 10 || diffY > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClick = () => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    onEdit(alarm);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([60]);
    }
    setShowDeleteModal(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteModal(false);
    if (onDelete) {
      onDelete(alarm.id);
    }
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
        className="w-full rounded-2xl p-5 mb-3 transition-all duration-200 cursor-pointer select-none bg-theme-card border border-theme-border shadow-sm hover:opacity-95 active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          {/* Left Side: Time and Schedule */}
          <div className="flex-1 pr-4">
            <div className="flex items-baseline space-x-1.5">
              <span
                className={`text-4xl sm:text-5xl font-normal tracking-tight font-tabular transition-colors ${
                  alarm.isEnabled ? 'text-theme-text' : 'text-theme-muted'
                }`}
              >
                {timeStr}
              </span>
              <span
                className={`text-sm font-semibold tracking-wider transition-colors ${
                  alarm.isEnabled ? 'text-theme-text' : 'text-theme-muted'
                }`}
              >
                {period}
              </span>
            </div>

            <div className="mt-1 flex items-center space-x-2 text-sm text-theme-subtext">
              <span>{getSubtitle()}</span>
              <span className="opacity-40">•</span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-theme-border bg-theme-bg text-theme-text font-medium">
                {getMethodBadge()}
              </span>
            </div>
          </div>

          {/* Right Side: Capsule Switch Toggle */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggle(alarm.id);
            }}
            className="cursor-pointer"
          >
            <div
              className={`w-[52px] h-[30px] rounded-full transition-colors duration-200 relative p-[3px] flex items-center ${
                alarm.isEnabled
                  ? 'bg-blue-500'
                  : 'bg-neutral-300 dark:bg-[#3A3A3C]'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                  alarm.isEnabled ? 'translate-x-[22px]' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Long Press Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteModal(false);
          }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#1a1a1c] border border-white/10 rounded-3xl p-6 text-center text-white shadow-2xl space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 size={26} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Delete Alarm?</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Are you sure you want to remove the <strong className="text-white">{timeStr} {period}</strong> alarm ({alarm.label || 'Alarm'})?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={confirmDelete}
                className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-2"
              >
                <Trash2 size={15} />
                <span>Delete Alarm</span>
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-neutral-300 rounded-xl text-xs font-semibold transition-colors"
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
