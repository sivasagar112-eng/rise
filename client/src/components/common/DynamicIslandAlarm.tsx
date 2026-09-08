import React from 'react';
import { Alarm } from '../../types/alarm';
import { Hourglass, RotateCw, X } from 'lucide-react';

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
  const getTaskSubtitle = () => {
    if (alarm.dismissalType === 'PUSHUP_MATH') {
      return `Pushups • ${alarm.pushupTarget || 5} reps`;
    }
    if (alarm.dismissalType === 'BRIGHTNESS') {
      return 'Light Check • Turn lights on';
    }
    if (alarm.dismissalType === 'FACE_AWAY') {
      return 'Face-Away • Get out of bed';
    }
    if (alarm.dismissalType === 'OBJECT_MATCH') {
      return 'Object Scan • Scan item';
    }
    return 'Math Challenge';
  };

  return (
    <div
      onClick={onPress}
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md cursor-pointer select-none"
      style={{
        animation: 'dynamicIslandExpand 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#252528]/95 text-white rounded-[26px] border border-white/10 shadow-2xl backdrop-blur-2xl transition-all duration-200 active:scale-[0.98]">
        {/* Left: Hourglass Icon matching image */}
        <div className="flex items-center space-x-3.5 flex-1 min-w-0">
          <div className="flex items-center justify-center shrink-0">
            <Hourglass size={28} className="text-blue-500 fill-blue-500/20 stroke-[2.2]" />
          </div>

          {/* Center Text: Bold Title + Subtitle */}
          <div className="flex flex-col truncate">
            <span className="text-xl font-bold tracking-tight text-white leading-tight">
              Time's up
            </span>
            <span className="text-xs text-neutral-400 font-medium tracking-wide truncate mt-0.5">
              Alarm • {alarm.time} • {getTaskSubtitle()}
            </span>
          </div>
        </div>

        {/* Right: Circular Action Buttons matching image */}
        <div className="flex items-center space-x-2 shrink-0 ml-3">
          {/* Blue Circular Action Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPress?.();
            }}
            className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 active:scale-90 text-white flex items-center justify-center transition-all shadow-md"
            aria-label="Start Task"
          >
            <RotateCw size={18} className="stroke-[2.5]" />
          </button>

          {/* Dark Circular Dismiss Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onDismiss) {
                onDismiss();
              } else {
                onPress?.();
              }
            }}
            className="w-10 h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600 active:scale-90 text-neutral-300 flex items-center justify-center transition-all"
            aria-label="Close"
          >
            <X size={18} className="stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
