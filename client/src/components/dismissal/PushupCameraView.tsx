import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  const mountedRef = useRef(true);

  // Core Motion Tracking (Sum of Absolute Differences)
  const baselineRef = useRef<Float32Array | null>(null);
  const calibrationFramesRef = useRef(0);
  const smoothedDiffRef = useRef(0);
  const maxDiffSeenRef = useRef(20); // Dynamic target scaling

  // Time & Kinematics state tracking
  const phaseRef = useRef<PushupPhase>('CALIBRATING');
  const descentStartMsRef = useRef<number>(0);
  const bottomStartMsRef = useRef<number>(0);
  const hasValidBottomRef = useRef(false);
  const lastRepMsRef = useRef<number>(0);
  const repsRef = useRef(0);

  const [reps, setReps] = useState(0);
  const [depthProgress, setDepthProgress] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('CALIBRATING');
  const [guidance, setGuidance] = useState('Get in plank position & hold still...');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Flip front/rear camera
  const handleToggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Manual rep increment fallback
  const handleManualRep = useCallback(() => {
    if (repsRef.current < targetReps && !completedRef.current) {
      repsRef.current += 1;
      setReps(repsRef.current);
      synth.playRepChirp();

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
  }, [targetReps, onComplete]);

  useEffect(() => {
    mountedRef.current = true;
    calibrationFramesRef.current = 0;
    smoothedDiffRef.current = 0;
    maxDiffSeenRef.current = 20;
    baselineRef.current = null;
    hasValidBottomRef.current = false;
    phaseRef.current = 'CALIBRATING';
    descentStartMsRef.current = 0;
    bottomStartMsRef.current = 0;
    
    // Explicitly reset all UI state in case of camera flip re-render
    setPhase('CALIBRATING');
    setDepthProgress(0);
    setGuidance('Get in plank position & hold still...');

    // 1 second of calibration at ~30fps
    const CALIBRATION_FRAMES = 30; 

    const tick = () => {
      if (!mountedRef.current || completedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Force play if Android WebView unexpectedly paused it
      if (video && video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }

      if (video && canvas && video.readyState >= 2) {
        const W = 64;
        const H = 48; // Low res for extremely fast pixel processing
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, W, H);
          const { data } = ctx.getImageData(0, 0, W, H);

          if (!baselineRef.current) {
            baselineRef.current = new Float32Array(W * H);
          }
          const baseline = baselineRef.current;

          let diffSum = 0;

          // Universal optical displacement algorithm (SAD)
          // Works flawlessly for both Floor and Wall modes without needing to know which one it is.
          for (let i = 0; i < W * H; i++) {
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            if (calibrationFramesRef.current < CALIBRATION_FRAMES) {
              // Build clean baseline by averaging frames
              baseline[i] = baseline[i] === 0 ? lum : baseline[i] * 0.8 + lum * 0.2;
            } else {
              // Calculate displacement from baseline
              const diff = Math.abs(lum - baseline[i]);
              diffSum += diff;

              // Very slowly absorb lighting changes into baseline ONLY when user is still (READY)
              if (phaseRef.current === 'READY' && smoothedDiffRef.current < 8) {
                baseline[i] = baseline[i] * 0.98 + lum * 0.02;
              }
            }
          }

          if (calibrationFramesRef.current < CALIBRATION_FRAMES) {
            calibrationFramesRef.current++;
            if (calibrationFramesRef.current === CALIBRATION_FRAMES) {
              phaseRef.current = 'READY';
              setPhase('READY');
              setGuidance('Ready! Lower yourself down.');
            }
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          const avgDiff = diffSum / (W * H);
          smoothedDiffRef.current = smoothedDiffRef.current * 0.7 + avgDiff * 0.3;
          const currentDiff = smoothedDiffRef.current;

          // Auto-scale target depth based on user's actual range of motion
          if (currentDiff > maxDiffSeenRef.current) {
            // Cap the max reference so it doesn't get unreachably high if the camera gets bumped
            maxDiffSeenRef.current = Math.min(50, currentDiff);
          }
          
          // Target is 75% of their max observed displacement, clamped between 18 and 38
          const dynamicTarget = Math.max(18, Math.min(38, maxDiffSeenRef.current * 0.75));

          const rawDepth = (currentDiff / dynamicTarget) * 100;
          const depth = Math.min(100, Math.max(0, Math.round(rawDepth)));
          setDepthProgress(depth);

          const now = performance.now();

          // === KINEMATICS STATE MACHINE ===
          // Prevents cheating (hand waves, head bobs) by enforcing strict timing & depth gates
          
          if (phaseRef.current === 'READY') {
            if (depth >= 30) {
              phaseRef.current = 'GOING_DOWN';
              descentStartMsRef.current = now;
              hasValidBottomRef.current = false;
              setPhase('GOING_DOWN');
              setGuidance('Keep going down...');
            }
          } 
          else if (phaseRef.current === 'GOING_DOWN') {
            if (depth >= 85) {
              // Must take at least 150ms to reach bottom (filters out fast hand wipes across lens)
              if (now - descentStartMsRef.current >= 150) {
                phaseRef.current = 'BOTTOM';
                bottomStartMsRef.current = now;
                setPhase('BOTTOM');
                setGuidance('Push back up!');
              }
            } else if (depth < 20 && now - descentStartMsRef.current > 300) {
              // Aborted rep
              phaseRef.current = 'READY';
              setPhase('READY');
              setGuidance('Lower yourself fully.');
            }
          } 
          else if (phaseRef.current === 'BOTTOM') {
            if (now - bottomStartMsRef.current >= 150) {
              hasValidBottomRef.current = true; // Proves they held the bottom briefly
            }
            if (depth <= 60) {
              if (hasValidBottomRef.current) {
                phaseRef.current = 'GOING_UP';
                setPhase('GOING_UP');
                setGuidance('Almost there...');
              } else {
                // Rushed the bottom (bounce), reset
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Hold the bottom for a moment.');
              }
            }
          } 
          else if (phaseRef.current === 'GOING_UP') {
            if (depth <= 25) {
              const duration = now - descentStartMsRef.current;
              // A real human pushup takes between 0.7s and 8s
              if (duration >= 700 && duration <= 8000 && (now - lastRepMsRef.current) >= 800) {
                countRep(now);
              } else {
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Rep too fast or incomplete.');
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    const countRep = (now: number) => {
      lastRepMsRef.current = now;
      repsRef.current += 1;
      setReps(repsRef.current);
      synth.playRepChirp();

      // VIBRATION REMOVED per user request

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
      } else {
        phaseRef.current = 'READY';
        setPhase('READY');
        setGuidance(`Rep ${repsRef.current} counted! Next rep...`);
      }
    };

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

        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;

          const tryPlay = () => {
            if (!video) return;
            const playPromise = video.play();
            if (playPromise) {
              playPromise.catch(() => {
                setTimeout(() => {
                  if (mountedRef.current && video.paused) video.play().catch(() => {});
                }, 500);
              });
            }
          };

          video.onloadedmetadata = tryPlay;
          video.onloadeddata = tryPlay;
          video.oncanplay = tryPlay;
          tryPlay();
        }

        rafRef.current = requestAnimationFrame(tick);
      } catch (err: any) {
        if (mountedRef.current) {
          setCameraError(err?.message || 'Camera permission required for tracking.');
        }
      }
    };

    initCamera();

    return () => {
      mountedRef.current = false;
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
      <style dangerouslySetInnerHTML={{ __html: `
        video::-webkit-media-controls { display: none !important; }
        video::-webkit-media-controls-enclosure { display: none !important; }
        video::-webkit-media-controls-panel { display: none !important; }
      `}} />
      
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <Dumbbell size={14} className="text-blue-500" />
        <span>PUSHUP VERIFICATION</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Do {targetReps} Pushups
      </h2>
      <p className="text-xs text-theme-subtext max-w-xs mb-4 min-h-[32px] flex items-center justify-center">
        {guidance}
      </p>

      <div className="text-[10px] mb-2 px-3 py-1 rounded-full border border-theme-border bg-theme-card text-theme-subtext font-semibold">
        🚀 Universal Motion Track
      </div>

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
            disablePictureInPicture
            controls={false}
            style={{ pointerEvents: 'none' }}
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
          <div className="flex justify-between items-start w-full">
            <button
              onClick={handleToggleCamera}
              className="pointer-events-auto p-2 bg-black/60 hover:bg-black/80 active:scale-95 rounded-full text-white transition-all backdrop-blur-md"
              aria-label="Switch Camera"
            >
              <FlipHorizontal size={16} />
            </button>
            <div className="text-[10px] font-bold text-white/90 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10">
              {phase === 'CALIBRATING' ? 'CALIBRATING...' : 'SENSOR ACTIVE'}
            </div>
          </div>

          <div className="absolute left-3 top-12 bottom-12 w-2.5 bg-black/40 rounded-full overflow-hidden flex flex-col justify-end border border-white/20">
            <div className="absolute left-0 right-0 top-[15%] border-t border-dashed border-amber-400 z-10" />
            <div
              className={`w-full transition-all duration-100 rounded-full ${
                depthProgress >= 85 ? 'bg-green-400 shadow-glow' : 'bg-blue-500'
              }`}
              style={{ height: `${depthProgress}%` }}
            />
          </div>

          <div
            className={`self-center w-40 h-32 border rounded-xl flex flex-col items-center justify-center transition-colors ${
              depthProgress >= 85
                ? 'border-green-400 bg-green-500/20'
                : 'border-dashed border-white/40 bg-black/20'
            }`}
          >
            <span className="text-[10px] text-white/80 tracking-wider font-semibold uppercase">
              MOTION TARGET
            </span>
            <span className="text-[9px] text-white/60">
              {depthProgress >= 85 ? 'DEPTH REACHED ✓' : `${depthProgress}%`}
            </span>
          </div>

          <div className="w-full text-center text-xs text-white font-bold bg-black/70 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'CALIBRATING'
              ? 'STAY STILL...'
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

        {isComplete && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in z-20">
            <Check size={52} className="text-green-400 mb-2 animate-bounce" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {targetReps} Pushups Verified
            </span>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-center space-x-2 mb-4">
        <span className="text-6xl font-bold tracking-tight text-theme-text font-tabular">
          {reps}
        </span>
        <span className="text-2xl font-light text-theme-muted">/ {targetReps}</span>
        <span className="text-xs tracking-wider font-semibold text-theme-subtext ml-2 uppercase">
          Reps
        </span>
      </div>

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
