import React, { useEffect, useRef, useState } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { Dumbbell, RefreshCw, Check, FlipHorizontal, ShieldAlert } from 'lucide-react';

interface PushupCameraViewProps {
  targetReps: number;
  onComplete: () => void;
}

type PushupPhase = 'CALIBRATING' | 'READY' | 'GOING_DOWN' | 'BOTTOM' | 'GOING_UP' | 'FINISHED';

export const PushupCameraView: React.FC<PushupCameraViewProps> = ({
  targetReps,
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Calibration & Depth tracking
  const calibrationFramesRef = useRef(0);
  const baselineLumRef = useRef<number | null>(null);
  const smoothedDepthRef = useRef(0);

  // Time & Kinematics state tracking (prevents false / automatic counts)
  const phaseRef = useRef<PushupPhase>('CALIBRATING');
  const descentStartMsRef = useRef<number>(0);
  const bottomStartMsRef = useRef<number>(0);
  const hasValidBottomRef = useRef(false);
  const lastRepMsRef = useRef<number>(0);
  const repsRef = useRef(0);

  const [reps, setReps] = useState(0);
  const [depthProgress, setDepthProgress] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('CALIBRATING');
  const [guidance, setGuidance] = useState('Calibrating camera... Place phone on floor under your chest');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Flip front/rear camera
  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Manual rep increment fallback (emergency override if camera is blocked)
  const handleManualRep = () => {
    if (repsRef.current < targetReps && !completedRef.current) {
      repsRef.current += 1;
      setReps(repsRef.current);
      synth.playRepChirp();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([70]);
      }

      if (repsRef.current >= targetReps) {
        completedRef.current = true;
        setIsComplete(true);
        setPhase('FINISHED');
        setGuidance(`${targetReps} Pushups Completed!`);
        setTimeout(() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          onComplete();
        }, 700);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    calibrationFramesRef.current = 0;
    baselineLumRef.current = null;
    smoothedDepthRef.current = 0;
    hasValidBottomRef.current = false;
    phaseRef.current = 'CALIBRATING';
    descentStartMsRef.current = 0;
    bottomStartMsRef.current = 0;
    setPhase('CALIBRATING');
    setGuidance('Calibrating camera... Place phone on floor under your chest');

    const tick = () => {
      if (!mounted || completedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        const W = 120;
        const H = 90;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, W, H);
          const { data } = ctx.getImageData(0, 0, W, H);

          // Center bounding box (chest target: middle 50% of the screen)
          const minX = Math.floor(W * 0.25);
          const maxX = Math.floor(W * 0.75);
          const minY = Math.floor(H * 0.25);
          const maxY = Math.floor(H * 0.75);

          let centerLumSum = 0;
          let centerPixelCount = 0;

          for (let y = 0; y < H; y += 2) {
            for (let x = 0; x < W; x += 2) {
              const idx = (y * W + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;

              if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                centerLumSum += lum;
                centerPixelCount++;
              }
            }
          }

          const currentCenterLum = centerPixelCount > 0 ? centerLumSum / centerPixelCount : 128;

          // 1. Initial 35 frames (~1.2s): Calibrate baseline ambient lighting and camera auto-gain
          if (calibrationFramesRef.current < 35) {
            calibrationFramesRef.current++;
            if (baselineLumRef.current === null) {
              baselineLumRef.current = currentCenterLum;
            } else {
              baselineLumRef.current = baselineLumRef.current * 0.85 + currentCenterLum * 0.15;
            }
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          // Once calibrated, set to READY if first time
          if (phaseRef.current === 'CALIBRATING') {
            phaseRef.current = 'READY';
            setPhase('READY');
            setGuidance('Get in plank position. Lower your chest down towards the phone.');
          }

          const baseLum = baselineLumRef.current || 128;

          // 2. Physical Proximity Occlusion Signal:
          // In a real pushup, when your chest lowers directly above the phone lens on the floor:
          // The center region is heavily blocked/shaded by your body (luminance drops significantly).
          // Notice: We strictly measure LUMINANCE SHADING (depth), NOT frame movement speed!
          const lumDrop = Math.max(0, baseLum - currentCenterLum);
          const occlusionDropRatio = lumDrop / Math.max(25, baseLum * 0.50);
          const rawDepth = Math.min(100, Math.round(occlusionDropRatio * 100));

          // Smooth depth with moderate alpha to filter high-frequency sensor flicker
          smoothedDepthRef.current = smoothedDepthRef.current * 0.75 + rawDepth * 0.25;
          const currentDepth = Math.max(0, Math.min(100, Math.round(smoothedDepthRef.current)));
          setDepthProgress(currentDepth);

          const now = performance.now();

          // 3. Strict Pushup Kinematics State Machine:
          // State 1: READY (User is at the top of pushup plank)
          if (phaseRef.current === 'READY') {
            if (currentDepth >= 35) {
              // Started descending
              phaseRef.current = 'GOING_DOWN';
              descentStartMsRef.current = now;
              hasValidBottomRef.current = false;
              setPhase('GOING_DOWN');
              setGuidance('Lowering... Go deeper!');
            }
          }
          // State 2: GOING_DOWN (User is lowering body)
          else if (phaseRef.current === 'GOING_DOWN') {
            if (currentDepth >= 60) {
              // Reached target depth!
              phaseRef.current = 'BOTTOM';
              bottomStartMsRef.current = now;
              setPhase('BOTTOM');
              setGuidance('Good depth! Hold briefly and push up!');
            } else if (currentDepth < 25 && now - descentStartMsRef.current < 200) {
              // Transient noise/bounce: revert to READY without counting
              phaseRef.current = 'READY';
              setPhase('READY');
              setGuidance('Get into plank position.');
            }
          }
          // State 3: BOTTOM (User chest reached bottom position)
          else if (phaseRef.current === 'BOTTOM') {
            const timeAtBottom = now - bottomStartMsRef.current;
            if (timeAtBottom >= 220) {
              // Sustained bottom hold validated (proves it wasn't a 1-frame camera flicker)
              hasValidBottomRef.current = true;
            }

            if (currentDepth < 45) {
              // Pushing back up
              if (hasValidBottomRef.current) {
                phaseRef.current = 'GOING_UP';
                setPhase('GOING_UP');
                setGuidance('Pushing back up...');
              } else {
                // Left bottom too quickly (no real hold)
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Go deeper and hold bottom briefly.');
              }
            }
          }
          // State 4: GOING_UP (User is pushing body back up)
          else if (phaseRef.current === 'GOING_UP') {
            if (currentDepth <= 25) {
              // Back to top position!
              const totalRepDuration = now - descentStartMsRef.current;
              const timeSinceLastRep = now - lastRepMsRef.current;

              // Biological human constraint:
              // Real pushups take between 0.9s and 6.0s, with at least 1.0s cooldown between reps
              if (totalRepDuration >= 900 && totalRepDuration <= 6000 && timeSinceLastRep >= 1000) {
                lastRepMsRef.current = now;
                repsRef.current += 1;
                setReps(repsRef.current);
                synth.playRepChirp();

                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                  navigator.vibrate([80, 40, 80]);
                }

                if (repsRef.current >= targetReps) {
                  completedRef.current = true;
                  phaseRef.current = 'FINISHED';
                  setIsComplete(true);
                  setPhase('FINISHED');
                  setGuidance(`${targetReps} Pushups Completed!`);
                  setTimeout(() => {
                    if (streamRef.current) {
                      streamRef.current.getTracks().forEach((t) => t.stop());
                      streamRef.current = null;
                    }
                    onComplete();
                  }, 700);
                  return;
                } else {
                  phaseRef.current = 'READY';
                  setPhase('READY');
                  setGuidance(`Rep ${repsRef.current} counted! Next rep...`);
                }
              } else {
                // Too fast to be a real human pushup (cheat prevention)
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Rep too fast. Do controlled pushups.');
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    // Camera acquisition with resilient play
    const initCamera = async () => {
      setCameraError(null);
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const playVideo = () => {
            videoRef.current?.play().catch((e) => console.warn('Play interrupted:', e));
          };
          videoRef.current.onloadedmetadata = playVideo;
          videoRef.current.onloadeddata = playVideo;
          playVideo();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: any) {
        console.error('Camera stream access failed:', err);
        if (mounted) {
          setCameraError(err?.message || 'Camera permission required for pushup tracking.');
        }
      }
    };

    initCamera();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode, onComplete, targetReps]);

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      {/* Header Tag */}
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <Dumbbell size={14} className="text-blue-500" />
        <span>STEP 1: PHYSICAL VERIFICATION</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Do {targetReps} Pushups
      </h2>
      <p className="text-xs text-theme-subtext max-w-xs mb-4 min-h-[32px] flex items-center justify-center">
        {guidance}
      </p>

      {/* Video Viewfinder Container */}
      <div className="relative w-full max-w-xs aspect-4/3 bg-black rounded-2xl border-2 border-theme-border overflow-hidden mb-4 shadow-lg">
        {cameraError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-white bg-neutral-900">
            <ShieldAlert size={36} className="text-amber-400 mb-2" />
            <p className="text-xs font-semibold mb-3">{cameraError}</p>
            <button
              onClick={handleManualRep}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold"
            >
              Manual Count Instead
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover opacity-85 ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder Target Framing Guidelines */}
        <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
          <div className="flex justify-between items-start w-full">
            {/* Flip Camera Button */}
            <button
              onClick={handleToggleCamera}
              className="pointer-events-auto p-2 bg-black/60 hover:bg-black/80 active:scale-95 rounded-full text-white transition-all backdrop-blur-md"
              aria-label="Switch Camera"
            >
              <FlipHorizontal size={16} />
            </button>
            <div className="text-[10px] font-bold text-white/90 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10">
              {phase === 'CALIBRATING' ? 'CALIBRATING...' : 'MOTION SENSOR ACTIVE'}
            </div>
          </div>

          {/* Depth Travel Gauge on left side */}
          <div className="absolute left-3 top-12 bottom-12 w-2.5 bg-black/40 rounded-full overflow-hidden flex flex-col justify-end border border-white/20">
            {/* Target line at 60% */}
            <div className="absolute left-0 right-0 top-[40%] border-t border-dashed border-amber-400 z-10" />
            <div
              className={`w-full transition-all duration-100 rounded-full ${
                depthProgress >= 60 ? 'bg-green-400 shadow-glow' : 'bg-blue-500'
              }`}
              style={{ height: `${depthProgress}%` }}
            />
          </div>

          {/* Center Target Chest Area */}
          <div
            className={`self-center w-36 h-28 border rounded-xl flex flex-col items-center justify-center transition-colors ${
              depthProgress >= 60
                ? 'border-green-400 bg-green-500/20'
                : 'border-dashed border-white/40 bg-black/20'
            }`}
          >
            <span className="text-[10px] text-white/80 tracking-wider font-semibold uppercase">
              CHEST TARGET
            </span>
            <span className="text-[9px] text-white/60">
              {depthProgress >= 60 ? 'DEPTH REACHED ✓' : `${depthProgress}%`}
            </span>
          </div>

          {/* Phase Status Badge */}
          <div className="w-full text-center text-xs text-white font-bold bg-black/70 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'CALIBRATING'
              ? 'CALIBRATING LIGHT...'
              : phase === 'GOING_DOWN'
              ? 'LOWERING...'
              : phase === 'BOTTOM'
              ? 'PUSH UP NOW!'
              : phase === 'GOING_UP'
              ? 'ASCENDING...'
              : phase === 'FINISHED'
              ? 'COMPLETED!'
              : 'READY IN POSITION'}
          </div>
        </div>

        {/* Complete Checkmark Overlay */}
        {isComplete && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in z-20">
            <Check size={52} className="text-green-400 mb-2 animate-bounce" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {targetReps} Pushups Verified
            </span>
          </div>
        )}
      </div>

      {/* Big Bold Rep Counter */}
      <div className="flex items-baseline justify-center space-x-2 mb-4">
        <span className="text-6xl font-bold tracking-tight text-theme-text font-tabular">
          {reps}
        </span>
        <span className="text-2xl font-light text-theme-muted">/ {targetReps}</span>
        <span className="text-xs tracking-wider font-semibold text-theme-subtext ml-2 uppercase">
          Reps
        </span>
      </div>

      {/* Manual Count Fallback */}
      <div className="flex flex-col items-center space-y-1.5">
        <button
          onClick={handleManualRep}
          className="text-xs font-semibold tracking-wide py-2.5 px-4 rounded-xl border border-theme-border bg-theme-card hover:opacity-80 active:scale-95 text-theme-text transition-all flex items-center space-x-2 shadow-sm"
        >
          <RefreshCw size={13} />
          <span>Manual Count (+1 Rep)</span>
        </button>
        <span className="text-[11px] text-theme-subtext">Phone position tricky? Tap to count rep</span>
      </div>
    </div>
  );
};
