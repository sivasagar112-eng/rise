import React, { useState, useEffect, useRef } from 'react';
import { Alarm, DismissalType } from '../../types/alarm';
import { synth } from '../../services/WebAudioSynth';
import { PushupCameraView } from '../dismissal/PushupCameraView';
import { MathChallengeView } from '../dismissal/MathChallengeView';
import { BrightnessCameraView } from '../dismissal/BrightnessCameraView';
import { ClickShakeView } from '../dismissal/ClickShakeView';
import { ObjectMatchCameraView } from '../dismissal/ObjectMatchCameraView';
import { Bell, Volume2 } from 'lucide-react';
import { formatTime12h } from '../../utils/timeFormat';

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

  // Track volume ramp up in isolated component so RingingScreen and camera views do NOT re-render
  useEffect(() => {
    startTimeRef.current = Date.now();
    const durationMs = Math.max(5, rampDurationSeconds || 30) * 1000;

    const update = () => {
      // If web audio synth is active, read its ramp; otherwise calculate based on elapsed time from alarm trigger
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
    <div className="w-full max-w-xs flex items-center space-x-2 px-3 py-2 rounded-xl border border-theme-border bg-theme-card mb-2 shadow-sm">
      <Volume2 size={15} className="text-theme-subtext" />
      <div className="flex-1 h-2 bg-theme-border rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-300 rounded-full"
          style={{ width: `${volumeProgress}%` }}
        />
      </div>
      <span className="text-xs font-medium font-tabular text-theme-subtext w-9 text-right">
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
    if (!alarm.dismissalType || alarm.dismissalType === 'RANDOM') {
      const tasks: DismissalType[] = ['PUSHUP_MATH', 'OBJECT_MATCH', 'MATH', 'BRIGHTNESS', 'CLICK_SHAKE'];
      return tasks[Math.floor(Math.random() * tasks.length)];
    }
    return alarm.dismissalType;
  });

  const handleAllTasksDone = React.useCallback(() => {
    onDismissVerified();
  }, [onDismissVerified]);

  return (
    <div className="fixed inset-0 z-50 bg-theme-bg text-theme-text flex flex-col justify-between p-6 animate-fade-in overflow-y-auto">
      {/* Top Banner: Alarm Info & No Snooze Philosophy */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center select-none pt-2">
        <div className="flex items-center space-x-2 text-xs font-semibold tracking-wider text-theme-subtext uppercase mb-1">
          <Bell size={14} className="animate-bounce text-blue-500" />
          <span>ALARM FIRING — NO SNOOZE</span>
        </div>

        {(() => {
          const { timeStr, period } = formatTime12h(alarm.time);
          return (
            <div className="flex items-baseline justify-center space-x-2 mb-1">
              <span className="text-5xl sm:text-6xl font-normal tracking-tight font-tabular text-theme-text">
                {timeStr}
              </span>
              <span className="text-xl sm:text-2xl font-bold tracking-wider text-blue-500">
                {period}
              </span>
            </div>
          );
        })()}
        <div className="text-sm font-medium tracking-wide text-theme-subtext mb-3">
          {alarm.label}
        </div>

        {/* Volume Ramp Progress Bar (Isolated to prevent camera re-renders) */}
        <VolumeProgressBar rampDurationSeconds={alarm.rampDuration || 30} />
      </div>

      {/* Center Action Area: Interactive Camera / Pushup / Math Task */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-center my-4">
        {effectiveDismissalType === 'BRIGHTNESS' ? (
          <BrightnessCameraView onComplete={handleAllTasksDone} />
        ) : effectiveDismissalType === 'CLICK_SHAKE' || (effectiveDismissalType as string) === 'FACE_AWAY' ? (
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

      {/* Bottom Footer: just the brand tagline — no manual override buttons */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center pt-2 pb-4 text-center select-none border-t border-theme-border/40">
        <span className="text-[10px] text-theme-subtext/60 tracking-widest uppercase font-medium">
          Zero Snooze Guarantee
        </span>
      </div>
    </div>
  );
};
