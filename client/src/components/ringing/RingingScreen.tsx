import React, { useState, useEffect, useRef } from 'react';
import { Alarm, DismissalType } from '../../types/alarm';
import { synth } from '../../services/WebAudioSynth';
import { PushupCameraView } from '../dismissal/PushupCameraView';
import { MathChallengeView } from '../dismissal/MathChallengeView';
import { BrightnessCameraView } from '../dismissal/BrightnessCameraView';
import { ClickShakeView } from '../dismissal/ClickShakeView';
import { ObjectMatchCameraView } from '../dismissal/ObjectMatchCameraView';
import { Bell, Volume2, Sparkles } from 'lucide-react';
import { formatTime12h } from '../../utils/timeFormat';
import { Haptics } from '../../services/HapticFeedback';

interface RingingScreenProps {
  alarm: Alarm;
  onDismissVerified: () => void;
}

interface VolumeProgressBarProps {
  rampDurationSeconds?: number;
}

const VolumeProgressBar: React.FC<VolumeProgressBarProps> = ({ rampDurationSeconds = 30 }) => {
  const [volumeProgress, setVolumeProgress] = useState<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    const durationMs = Math.max(5, rampDurationSeconds || 30) * 1000;

    const update = () => {
      if (synth.isPlaying) {
        setVolumeProgress(synth.getRampProgress());
      } else {
        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(100, Math.round((elapsed / durationMs) * 100));
        setVolumeProgress(progress);
      }
    };

    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [rampDurationSeconds]);

  return (
    <div className="w-full max-w-xs flex items-center space-x-2.5 px-4 py-2.5 rounded-2xl glass-card mb-2 shadow-sm">
      <Volume2 size={16} className="text-blue-500 animate-pulse" />
      <div className="flex-1 h-2.5 bg-theme-border/60 rounded-full overflow-hidden p-0.5">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300 rounded-full shadow-sm"
          style={{ width: `${volumeProgress}%` }}
        />
      </div>
      <span className="text-xs font-black font-tabular text-theme-subtext w-10 text-right">
        {volumeProgress}%
      </span>
    </div>
  );
};

export const RingingScreen: React.FC<RingingScreenProps> = ({
  alarm,
  onDismissVerified,
}) => {
  const [effectiveDismissalType] = useState<DismissalType>(() => {
    if (alarm.dismissalType && alarm.dismissalType !== 'RANDOM') {
      return alarm.dismissalType;
    }
    return 'PUSHUP_MATH';
  });

  const handleAllTasksDone = React.useCallback(() => {
    Haptics.success();
    onDismissVerified();
  }, [onDismissVerified]);

  const { timeStr, period } = formatTime12h(alarm.time);

  return (
    <div className="fixed inset-0 z-50 bg-theme-bg text-theme-text flex flex-col justify-between p-6 animate-fade-in overflow-y-auto">
      {/* Top Banner: Alarm Info & No Snooze Philosophy */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center select-none pt-4">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black tracking-wider uppercase mb-2">
          <Bell size={13} className="animate-bounce" />
          <span>WAKE UP — ZERO SNOOZE</span>
        </div>

        <div className="flex items-baseline justify-center space-x-2 mb-1">
          <span className="text-6xl sm:text-7xl font-black tracking-tight font-tabular text-theme-text">
            {timeStr}
          </span>
          <span className="text-2xl font-black tracking-wider text-blue-500 uppercase">
            {period}
          </span>
        </div>

        <div className="text-sm font-extrabold tracking-wide text-theme-subtext mb-3">
          {alarm.label || 'Morning Alarm'}
        </div>

        {/* Volume Ramp Progress Bar */}
        <VolumeProgressBar rampDurationSeconds={alarm.rampDuration || 30} />
      </div>

      {/* Center Action Area: Interactive Camera / Pushup / Math Task */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-center my-4">
        {effectiveDismissalType === 'BRIGHTNESS' ? (
          <BrightnessCameraView onComplete={handleAllTasksDone} />
        ) : effectiveDismissalType === 'CLICK_SHAKE' ||
          (effectiveDismissalType as string) === 'FACE_AWAY' ? (
          <ClickShakeView onComplete={handleAllTasksDone} />
        ) : effectiveDismissalType === 'OBJECT_MATCH' ? (
          <ObjectMatchCameraView onComplete={handleAllTasksDone} />
        ) : effectiveDismissalType === 'MATH' ? (
          <MathChallengeView totalQuestions={3} onComplete={handleAllTasksDone} />
        ) : (
          <PushupCameraView
            targetReps={alarm.pushupTarget || 5}
            onComplete={handleAllTasksDone}
          />
        )}
      </div>

      {/* Bottom Footer */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center pt-3 pb-4 text-center select-none border-t border-theme-border/40">
        <div className="flex items-center gap-1.5 text-[11px] text-theme-subtext font-bold uppercase tracking-widest">
          <Sparkles size={12} className="text-blue-500" />
          <span>Rise Guaranteed Awakening</span>
        </div>
      </div>
    </div>
  );
};
