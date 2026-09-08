import React, { useState, useEffect } from 'react';
import { Alarm } from '../../types/alarm';
import { synth } from '../../services/WebAudioSynth';
import { PushupCameraView } from '../dismissal/PushupCameraView';
import { MathChallengeView } from '../dismissal/MathChallengeView';
import { BrightnessCameraView } from '../dismissal/BrightnessCameraView';
import { FaceAwayCameraView } from '../dismissal/FaceAwayCameraView';
import { ObjectMatchCameraView } from '../dismissal/ObjectMatchCameraView';
import { Bell, Volume2 } from 'lucide-react';

interface RingingScreenProps {
  alarm: Alarm;
  onDismissVerified: () => void;
}

export const RingingScreen: React.FC<RingingScreenProps> = ({
  alarm,
  onDismissVerified,
}) => {
  const [volumeProgress, setVolumeProgress] = useState<number>(0);

  // Track volume ramp up
  useEffect(() => {
    const timer = setInterval(() => {
      setVolumeProgress(synth.getRampProgress());
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const handleAllTasksDone = () => {
    onDismissVerified();
  };

  return (
    <div className="fixed inset-0 z-50 bg-theme-bg text-theme-text flex flex-col justify-between p-6 animate-fade-in overflow-y-auto">
      {/* Top Banner: Alarm Info & No Snooze Philosophy */}
      <div className="w-full max-w-md mx-auto flex flex-col items-center select-none pt-2">
        <div className="flex items-center space-x-2 text-xs font-semibold tracking-wider text-theme-subtext uppercase mb-1">
          <Bell size={14} className="animate-bounce text-blue-500" />
          <span>ALARM FIRING — NO SNOOZE</span>
        </div>

        <div className="text-5xl sm:text-6xl font-normal tracking-tight font-tabular mb-1 text-theme-text">
          {alarm.time}
        </div>
        <div className="text-sm font-medium tracking-wide text-theme-subtext mb-3">
          {alarm.label}
        </div>

        {/* Volume Ramp Progress Bar */}
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
      </div>

      {/* Center Action Area: Interactive Camera / Pushup / Math Task */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-center my-4">
        {alarm.dismissalType === 'PUSHUP_MATH' && (
          <PushupCameraView
            targetReps={alarm.pushupTarget || 5}
            onComplete={handleAllTasksDone}
          />
        )}

        {alarm.dismissalType === 'BRIGHTNESS' && (
          <BrightnessCameraView onComplete={handleAllTasksDone} />
        )}

        {alarm.dismissalType === 'FACE_AWAY' && (
          <FaceAwayCameraView onComplete={handleAllTasksDone} />
        )}

        {alarm.dismissalType === 'OBJECT_MATCH' && (
          <ObjectMatchCameraView
            onComplete={handleAllTasksDone}
          />
        )}

        {alarm.dismissalType === 'MATH' && (
          <MathChallengeView totalQuestions={3} onComplete={handleAllTasksDone} />
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
