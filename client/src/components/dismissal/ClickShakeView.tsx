import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Check, Zap, Sparkles, HandMetal } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';

interface ClickShakeViewProps {
  onComplete: () => void;
}

const TOTAL_TAPS = 100;
const TOTAL_SHAKES = 5;

export const ClickShakeView: React.FC<ClickShakeViewProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'TAPPING' | 'TRANSITION' | 'SHAKING' | 'COMPLETED'>('TAPPING');
  const [tapCount, setTapCount] = useState<number>(0);
  const [shakeCount, setShakeCount] = useState<number>(0);
  const [isPressing, setIsPressing] = useState<boolean>(false);
  const [showFallbackShake, setShowFallbackShake] = useState<boolean>(false);
  const [permissionRequested, setPermissionRequested] = useState<boolean>(false);

  const completedRef = useRef(false);
  const lastTapTimeRef = useRef<number>(0);
  const lastShakeTimeRef = useRef<number>(0);
  const lastXRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const lastZRef = useRef<number>(0);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Finish challenge
  const handleFinalSuccess = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('COMPLETED');
    synth.playSuccessTone();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([80, 50, 80, 50, 160]);
    }
    setTimeout(() => {
      onCompleteRef.current();
    }, 1000);
  }, []);

  // 1. PHASE: TAPPING (100 Taps)
  const handleTap = useCallback((e?: React.SyntheticEvent) => {
    if (phase !== 'TAPPING' || completedRef.current) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const now = performance.now();
    // Anti-macro / bounce: 15ms minimum between taps (allows fast two-thumb tapping up to 15+ taps/sec)
    if (now - lastTapTimeRef.current < 15) return;
    lastTapTimeRef.current = now;

    setTapCount((prev) => {
      const next = prev + 1;

      // Haptic and audio feedback per tap
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      synth.playTapTone(600 + (next % 25) * 12);

      // Milestone feedback at 25, 50, 75
      if (next === 25 || next === 50 || next === 75) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([20, 20, 40]);
        }
      }

      // 100 Taps reached!
      if (next >= TOTAL_TAPS) {
        setPhase('TRANSITION');
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([100, 40, 100]);
        }
        synth.playRepChirp();

        // Switch to SHAKING phase
        setTimeout(() => {
          setPhase('SHAKING');
        }, 800);
      }

      return next;
    });
  }, [phase]);

  // 2. PHASE: SHAKING (5 Shakes)
  const registerShake = useCallback(() => {
    if (completedRef.current) return;

    setShakeCount((prev) => {
      const next = prev + 1;

      synth.playShakeChirp();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([50, 30, 70]);
      }

      if (next >= TOTAL_SHAKES) {
        handleFinalSuccess();
      }

      return next;
    });
  }, [handleFinalSuccess]);

  // Accelerometer listener for shaking
  useEffect(() => {
    if (phase !== 'SHAKING' || completedRef.current) return;

    // Show fallback shake button after 3 seconds in case device lacks accelerometer or permissions
    const fallbackTimer = setTimeout(() => {
      setShowFallbackShake(true);
    }, 3000);

    // Request iOS device motion permission if required
    if (
      !permissionRequested &&
      typeof (DeviceMotionEvent as any) !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      setPermissionRequested(true);
      (DeviceMotionEvent as any).requestPermission().catch(() => {});
    }

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      if (completedRef.current) return;

      const acc = event.acceleration || event.accelerationIncludingGravity;
      if (!acc) return;

      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;

      const deltaX = Math.abs(x - lastXRef.current);
      const deltaY = Math.abs(y - lastYRef.current);
      const deltaZ = Math.abs(z - lastZRef.current);

      lastXRef.current = x;
      lastYRef.current = y;
      lastZRef.current = z;

      const totalDelta = deltaX + deltaY + deltaZ;
      const now = performance.now();

      // Detection threshold: totalDelta > 13 m/s² with 350ms cooldown between shakes
      if (totalDelta > 13 && now - lastShakeTimeRef.current > 350) {
        lastShakeTimeRef.current = now;
        registerShake();
      }
    };

    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('devicemotion', handleDeviceMotion);
    };
  }, [phase, permissionRequested, registerShake]);

  // Calculations for progress ring
  const tapPercentage = Math.min(100, Math.round((tapCount / TOTAL_TAPS) * 100));
  const circleRadius = 88;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (tapPercentage / 100) * circumference;

  return (
    <div className="w-full flex flex-col items-center select-none text-center px-4 animate-fade-in">
      {/* Challenge Title Banner */}
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <Zap size={14} className="text-amber-400 fill-amber-400/20" />
        <span>ENERGY OVERDRIVE</span>
      </div>

      {phase === 'COMPLETED' ? (
        <div className="flex flex-col items-center justify-center my-8 space-y-3 animate-scale-in">
          <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center shadow-lg shadow-green-500/20">
            <Check size={48} className="text-green-400 stroke-[3]" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">ALARM DISMISSED!</h2>
          <p className="text-xs text-neutral-400">100 Taps + 5 Shakes Completed. You're wide awake!</p>
        </div>
      ) : phase === 'TRANSITION' ? (
        <div className="flex flex-col items-center justify-center my-10 space-y-4 animate-scale-in">
          <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center animate-bounce">
            <Sparkles size={40} className="text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-amber-400 tracking-tight">100 TAPS COMPLETED!</h2>
          <p className="text-sm font-semibold text-white animate-pulse">
            Now vigorously shake your phone 5 times!
          </p>
        </div>
      ) : phase === 'SHAKING' ? (
        /* PHASE 2: 5 SHAKES */
        <div className="flex flex-col items-center w-full max-w-xs my-4 animate-fade-in">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
            Shake Your Phone
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            Shake vigorously {TOTAL_SHAKES - shakeCount} more time{TOTAL_SHAKES - shakeCount === 1 ? '' : 's'}
          </p>

          {/* Animated Shaking Phone */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="w-32 h-32 rounded-3xl bg-neutral-900 border-2 border-amber-500/40 flex flex-col items-center justify-center shadow-2xl shadow-amber-500/10 animate-[wiggle_0.4s_ease-in-out_infinite]">
              <Smartphone size={56} className="text-amber-400" />
              <span className="text-[10px] font-bold text-amber-300 mt-1 uppercase tracking-wider">
                SHAKE IT!
              </span>
            </div>
          </div>

          {/* 5 Shake Progress Pills */}
          <div className="flex items-center justify-center gap-2.5 my-6 w-full">
            {Array.from({ length: TOTAL_SHAKES }).map((_, idx) => {
              const isDone = idx < shakeCount;
              return (
                <div
                  key={idx}
                  className={`h-12 flex-1 rounded-xl flex items-center justify-center border-2 transition-all duration-300 ${
                    isDone
                      ? 'bg-green-500/20 border-green-500 text-green-400 shadow-md shadow-green-500/20 scale-105'
                      : 'bg-neutral-900/60 border-neutral-800 text-neutral-600'
                  }`}
                >
                  {isDone ? (
                    <Check size={20} className="stroke-[3]" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-sm font-bold text-neutral-300">
            {shakeCount} of {TOTAL_SHAKES} Shakes
          </div>

          {/* Fallback button if sensor doesn't respond */}
          {showFallbackShake && (
            <button
              onClick={registerShake}
              className="mt-6 px-5 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 active:scale-95 border border-neutral-700 text-xs font-bold text-amber-300 transition-all flex items-center gap-2"
            >
              <HandMetal size={14} />
              <span>Tap to Register Shake ({TOTAL_SHAKES - shakeCount} left)</span>
            </button>
          )}
        </div>
      ) : (
        /* PHASE 1: 100 TAPS */
        <div className="flex flex-col items-center w-full max-w-xs my-3 animate-fade-in">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
            Tap 100 Times
          </h2>
          <p className="text-xs text-neutral-400 mb-5">
            Tap the button as fast as you can to wake up!
          </p>

          {/* Large Circular Tap Button with Progress Ring */}
          <div className="relative flex items-center justify-center my-2 select-none">
            {/* SVG Progress Ring */}
            <svg
              className="w-56 h-56 -rotate-90 pointer-events-none drop-shadow-md"
              viewBox="0 0 200 200"
            >
              {/* Background Track */}
              <circle
                cx="100"
                cy="100"
                r={circleRadius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="10"
              />
              {/* Progress Arc */}
              <circle
                cx="100"
                cy="100"
                r={circleRadius}
                fill="none"
                stroke={tapPercentage >= 80 ? '#22c55e' : tapPercentage >= 50 ? '#f59e0b' : '#3b82f6'}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-100"
              />
            </svg>

            {/* Tap Surface */}
            <button
              type="button"
              onPointerDown={(e) => {
                setIsPressing(true);
                handleTap(e);
              }}
              onPointerUp={() => setIsPressing(false)}
              onPointerLeave={() => setIsPressing(false)}
              style={{ touchAction: 'manipulation' }}
              className={`absolute w-44 h-44 rounded-full flex flex-col items-center justify-center border-4 transition-transform duration-75 outline-none cursor-pointer ${
                isPressing ? 'scale-90' : 'scale-100 active:scale-90'
              } ${
                tapPercentage >= 80
                  ? 'bg-gradient-to-br from-green-500/30 to-green-600/10 border-green-500/50 shadow-lg shadow-green-500/20'
                  : tapPercentage >= 50
                  ? 'bg-gradient-to-br from-amber-500/30 to-amber-600/10 border-amber-500/50 shadow-lg shadow-amber-500/20'
                  : 'bg-gradient-to-br from-blue-600/30 to-blue-700/10 border-blue-500/50 shadow-lg shadow-blue-500/20'
              }`}
            >
              <span className="text-4xl font-black font-tabular tracking-tight text-white leading-none">
                {tapCount}
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-neutral-400 mt-1">
                / {TOTAL_TAPS} TAPS
              </span>
              <span className="text-[10px] font-bold text-amber-400 mt-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                {tapPercentage}%
              </span>
            </button>
          </div>

          <div className="mt-4 text-xs font-semibold text-neutral-400">
            {TOTAL_TAPS - tapCount} taps remaining
          </div>

          {/* Subtext info */}
          <div className="mt-2 text-[10px] text-neutral-500 uppercase tracking-wider">
            Part 1 of 2: 100 Taps → Then 5 Shakes
          </div>
        </div>
      )}
    </div>
  );
};
