import React, { useEffect } from 'react';
import { Alarm } from '../../types/alarm';
import { AlarmClock, RotateCw, X } from 'lucide-react';
import { formatTime12h } from '../../utils/timeFormat';
import { Haptics } from '../../services/HapticFeedback';

interface DynamicIslandAlarmProps {
  alarm: Alarm;
  onPress?: () => void;
  onDismiss?: () => void;
}

export const DynamicIslandAlarm: React.FC<DynamicIslandAlarmProps> = ({
  alarm,
  onPress,
  onDismiss,
}) => {
  useEffect(() => {
    Haptics.warning();
  }, []);

  const getTaskSubtitle = () => {
    if (alarm.dismissalType === 'PUSHUP_MATH') return '10 push-ups';
    if (alarm.dismissalType === 'BRIGHTNESS') return 'Turn on lights';
    if (alarm.dismissalType === 'CLICK_SHAKE') return '100 taps + shake';
    if (alarm.dismissalType === 'OBJECT_MATCH') return 'Scan an object';
    return '3 math equations';
  };

  const { formatted } = formatTime12h(alarm.time);

  return (
    <div
      onClick={() => {
        Haptics.medium();
        onPress?.();
      }}
      className="fixed top-3 left-1/2 z-50 w-[92%] max-w-[400px] cursor-pointer select-none"
      style={{
        transform: 'translateX(-50%)',
        animation: 'islandExpand 400ms cubic-bezier(0.16,1,0.3,1) forwards',
      }}
    >
      <div
        className="
          flex items-center justify-between px-4 py-3.5
          rounded-[28px] text-white
          border border-white/15
          press-spring
        "
        style={{
          background: 'rgba(16, 17, 24, 0.96)',
          backdropFilter: 'blur(36px) saturate(190%)',
          WebkitBackdropFilter: 'blur(36px) saturate(190%)',
          boxShadow:
            '0 12px 36px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {/* Left: Icon & Text */}
        <div className="flex items-center gap-3.5 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-blue-500/20 text-blue-400 border border-blue-500/30"
            style={{ boxShadow: '0 0 14px rgba(59,130,246,0.3)' }}
          >
            <AlarmClock size={20} strokeWidth={2.4} className="animate-bounce" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-black tracking-tight leading-tight text-white">
              Wake Up · {formatted}
            </p>
            <p className="text-[11px] text-neutral-400 font-semibold truncate mt-0.5">
              Task: {getTaskSubtitle()}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              Haptics.medium();
              onPress?.();
            }}
            aria-label="Start task"
            className="
              w-9 h-9 rounded-full bg-blue-600 text-white
              flex items-center justify-center
              hover:bg-blue-500 press-pop
              shadow-lg shadow-blue-500/30
            "
          >
            <RotateCw size={16} strokeWidth={2.6} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              Haptics.light();
              (onDismiss ?? onPress)?.();
            }}
            aria-label="Close"
            className="
              w-9 h-9 rounded-full text-neutral-300
              flex items-center justify-center
              hover:bg-white/10 press-spring
            "
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
  );
};
