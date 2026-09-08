import React, { useEffect, useRef, useState, useCallback } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { Dumbbell, RefreshCw, Check, FlipHorizontal, ShieldAlert } from 'lucide-react';

interface PushupCameraViewProps {
  targetReps: number;
  onComplete: () => void;
}

type PushupPhase = 'CALIBRATING' | 'READY' | 'GOING_DOWN' | 'BOTTOM' | 'GOING_UP' | 'FINISHED';
type DetectionMode = 'AUTO' | 'FLOOR' | 'WALL';

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

  // Calibration & Detection
  const calibrationFramesRef = useRef(0);
  const baselineLumRef = useRef<number | null>(null);
  const baselineCentroidsRef = useRef<number[]>([]);
  const smoothedDepthRef = useRef(0);
  const detectionModeRef = useRef<DetectionMode>('AUTO');

  // Wall-mode tracking: vertical centroid Y position
  const prevCentroidYRef = useRef<number | null>(null);
  const smoothedCentroidYRef = useRef(0);
  const centroidBaselineYRef = useRef<number | null>(null);
  const centroidMinYRef = useRef<number>(Infinity);
  const centroidMaxYRef = useRef<number>(0);
  const wallDirectionRef = useRef<'NONE' | 'DOWN' | 'UP'>('NONE');
  const wallBottomHeldRef = useRef(false);
  const wallBottomStartRef = useRef(0);

  // Time & Kinematics state tracking (prevents false / automatic counts)
  const phaseRef = useRef<PushupPhase>('CALIBRATING');
  const descentStartMsRef = useRef<number>(0);
  const bottomStartMsRef = useRef<number>(0);
  const hasValidBottomRef = useRef(false);
  const lastRepMsRef = useRef<number>(0);
  const repsRef = useRef(0);

  // Previous frame for motion delta (anti-hand-wave)
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);

  const [reps, setReps] = useState(0);
  const [depthProgress, setDepthProgress] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('CALIBRATING');
  const [guidance, setGuidance] = useState('Calibrating camera...');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('AUTO');

  // Flip front/rear camera
  const handleToggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Manual rep increment fallback (emergency override if camera is blocked)
  const handleManualRep = useCallback(() => {
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
  }, [targetReps, onComplete]);

  useEffect(() => {
    mountedRef.current = true;
    calibrationFramesRef.current = 0;
    baselineLumRef.current = null;
    baselineCentroidsRef.current = [];
    smoothedDepthRef.current = 0;
    hasValidBottomRef.current = false;
    phaseRef.current = 'CALIBRATING';
    descentStartMsRef.current = 0;
    bottomStartMsRef.current = 0;
    detectionModeRef.current = 'AUTO';
    prevCentroidYRef.current = null;
    smoothedCentroidYRef.current = 0;
    centroidBaselineYRef.current = null;
    centroidMinYRef.current = Infinity;
    centroidMaxYRef.current = 0;
    wallDirectionRef.current = 'NONE';
    wallBottomHeldRef.current = false;
    prevFrameRef.current = null;
    setPhase('CALIBRATING');
    setGuidance('Calibrating camera...');

    const CALIBRATION_FRAMES = 15; // ~0.5s at 30fps — fast calibration

    const tick = () => {
      if (!mountedRef.current || completedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      const videoReady = video && (video.readyState >= 2 || video.videoWidth > 0);

      if (video && canvas && videoReady) {
        const W = 120;
        const H = 90;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, W, H);
          const imageData = ctx.getImageData(0, 0, W, H);
          const { data } = imageData;

          // === COMPUTE METRICS ===

          // Center bounding box (chest target: middle 50% of the screen)
          const minX = Math.floor(W * 0.25);
          const maxX = Math.floor(W * 0.75);
          const minY = Math.floor(H * 0.25);
          const maxY = Math.floor(H * 0.75);

          let centerLumSum = 0;
          let centerPixelCount = 0;
          let totalLumSum = 0;
          let totalPixels = 0;

          // For wall mode: compute centroid of motion (changed pixels)
          let motionWeightedYSum = 0;
          let motionWeightedXSum = 0;
          let motionPixelCount = 0;
          let largeMotionPixels = 0; // track how many pixels changed significantly

          for (let y = 0; y < H; y += 2) {
            for (let x = 0; x < W; x += 2) {
              const idx = (y * W + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;

              totalLumSum += lum;
              totalPixels++;

              if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                centerLumSum += lum;
                centerPixelCount++;
              }

              // Motion detection: compare with previous frame
              if (prevFrameRef.current) {
                const prevR = prevFrameRef.current[idx];
                const prevG = prevFrameRef.current[idx + 1];
                const prevB = prevFrameRef.current[idx + 2];
                const prevLum = 0.299 * prevR + 0.587 * prevG + 0.114 * prevB;
                const lumDiff = Math.abs(lum - prevLum);

                if (lumDiff > 15) { // Significant pixel change
                  motionPixelCount++;
                  motionWeightedYSum += y;
                  motionWeightedXSum += x;
                  if (lumDiff > 25) largeMotionPixels++;
                }
              }
            }
          }

          // Save current frame for next-frame delta
          prevFrameRef.current = new Uint8ClampedArray(data);

          const currentCenterLum = centerPixelCount > 0 ? centerLumSum / centerPixelCount : 128;
          const motionRatio = totalPixels > 0 ? motionPixelCount / totalPixels : 0;
          const motionCentroidY = motionPixelCount > 5 ? motionWeightedYSum / motionPixelCount : H / 2;

          // === CALIBRATION PHASE ===
          if (calibrationFramesRef.current < CALIBRATION_FRAMES) {
            calibrationFramesRef.current++;
            if (baselineLumRef.current === null) {
              baselineLumRef.current = currentCenterLum;
            } else {
              baselineLumRef.current = baselineLumRef.current * 0.8 + currentCenterLum * 0.2;
            }
            // Collect centroid Y samples for wall-mode baseline
            if (motionPixelCount > 5) {
              baselineCentroidsRef.current.push(motionCentroidY);
            }

            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          // === AUTO-DETECT MODE (on first post-calibration frame) ===
          if (phaseRef.current === 'CALIBRATING') {
            phaseRef.current = 'READY';
            setPhase('READY');

            // Set centroid baseline from calibration samples
            if (baselineCentroidsRef.current.length > 3) {
              const sorted = [...baselineCentroidsRef.current].sort((a, b) => a - b);
              centroidBaselineYRef.current = sorted[Math.floor(sorted.length / 2)]; // median
            } else {
              centroidBaselineYRef.current = H / 2;
            }
            smoothedCentroidYRef.current = centroidBaselineYRef.current || H / 2;

            setGuidance('Get in position. Place phone against wall or on floor.');
          }

          const baseLum = baselineLumRef.current || 128;
          const now = performance.now();

          // === DETERMINE DETECTION MODE ===
          // Floor mode: luminance drops heavily (body over phone on floor)
          // Wall mode: see a person's body oscillating up/down in the video
          // Auto-detect: if large luminance drop > 40% from baseline → floor mode
          //              if significant vertical motion with body-sized area → wall mode
          const lumDropRatio = (baseLum - currentCenterLum) / Math.max(1, baseLum);

          if (detectionModeRef.current === 'AUTO') {
            if (lumDropRatio > 0.35) {
              detectionModeRef.current = 'FLOOR';
              setDetectionMode('FLOOR');
              setGuidance('Floor mode detected. Lower your chest to the phone.');
            } else if (motionRatio > 0.15) {
              // Large portion of frame is moving = person in front of camera
              detectionModeRef.current = 'WALL';
              setDetectionMode('WALL');
              setGuidance('Wall mode detected. Do pushups in front of the camera.');
            }
          }

          // ============================================================
          // FLOOR MODE — Occlusion depth detection
          // ============================================================
          if (detectionModeRef.current === 'FLOOR' || detectionModeRef.current === 'AUTO') {
            const lumDrop = Math.max(0, baseLum - currentCenterLum);
            const occlusionDropRatio = lumDrop / Math.max(25, baseLum * 0.50);
            const rawDepth = Math.min(100, Math.round(occlusionDropRatio * 100));

            // ANTI-CHEAT: In floor mode, a hand wave only covers ~5-15% of pixels.
            // A real body occluding the phone covers >30% of center pixels changing.
            // If motion area is too small AND depth is high, it's likely a hand wave.
            const centerMotionPixels = (() => {
              if (!prevFrameRef.current) return 0;
              let cnt = 0;
              for (let y = minY; y < maxY; y += 2) {
                for (let x = minX; x < maxX; x += 2) {
                  const idx = (y * W + x) * 4;
                  const r = data[idx];
                  const g = data[idx + 1];
                  const b = data[idx + 2];
                  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                  // Compare to baseline luminance — if very dark compared to baseline = occluded
                  if (lum < baseLum * 0.5) cnt++;
                }
              }
              return cnt;
            })();
            const occlusionCoverage = centerPixelCount > 0 ? centerMotionPixels / centerPixelCount : 0;

            // Only register depth if occlusion covers at least 25% of center frame
            // This prevents hand-wave false positives (hand covers only ~10%)
            const adjustedDepth = occlusionCoverage > 0.20 ? rawDepth : Math.min(rawDepth, 20);

            smoothedDepthRef.current = smoothedDepthRef.current * 0.7 + adjustedDepth * 0.3;
            const currentDepth = Math.max(0, Math.min(100, Math.round(smoothedDepthRef.current)));
            setDepthProgress(currentDepth);

            // === KINEMATICS STATE MACHINE (Floor Mode) ===
            if (phaseRef.current === 'READY') {
              if (currentDepth >= 35) {
                phaseRef.current = 'GOING_DOWN';
                descentStartMsRef.current = now;
                hasValidBottomRef.current = false;
                setPhase('GOING_DOWN');
                setGuidance('Lowering... Go deeper!');
              }
            } else if (phaseRef.current === 'GOING_DOWN') {
              if (currentDepth >= 55) {
                phaseRef.current = 'BOTTOM';
                bottomStartMsRef.current = now;
                setPhase('BOTTOM');
                setGuidance('Good depth! Hold briefly and push up!');
              } else if (currentDepth < 20 && now - descentStartMsRef.current < 200) {
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Get into plank position.');
              }
            } else if (phaseRef.current === 'BOTTOM') {
              const timeAtBottom = now - bottomStartMsRef.current;
              if (timeAtBottom >= 200) {
                hasValidBottomRef.current = true;
              }
              if (currentDepth < 40) {
                if (hasValidBottomRef.current) {
                  phaseRef.current = 'GOING_UP';
                  setPhase('GOING_UP');
                  setGuidance('Pushing back up...');
                } else {
                  phaseRef.current = 'READY';
                  setPhase('READY');
                  setGuidance('Go deeper and hold bottom briefly.');
                }
              }
            } else if (phaseRef.current === 'GOING_UP') {
              if (currentDepth <= 20) {
                const totalRepDuration = now - descentStartMsRef.current;
                const timeSinceLastRep = now - lastRepMsRef.current;
                if (totalRepDuration >= 800 && totalRepDuration <= 7000 && timeSinceLastRep >= 900) {
                  countRep(now);
                } else {
                  phaseRef.current = 'READY';
                  setPhase('READY');
                  setGuidance('Rep too fast. Do controlled pushups.');
                }
              }
            }
          }

          // ============================================================
          // WALL MODE — Vertical body centroid oscillation
          // ============================================================
          if (detectionModeRef.current === 'WALL') {
            // Track the vertical centroid of motion (the person's body moving up/down)
            const rawCentroidY = motionPixelCount > 10 ? motionCentroidY : smoothedCentroidYRef.current;
            smoothedCentroidYRef.current = smoothedCentroidYRef.current * 0.7 + rawCentroidY * 0.3;
            const currentY = smoothedCentroidYRef.current;

            // Track min/max centroid Y to normalize depth
            const baseY = centroidBaselineYRef.current || (H / 2);
            // Going DOWN in pushup = centroid moves DOWN in frame (higher Y)
            // Going UP in pushup = centroid moves UP in frame (lower Y)
            const yDeviation = currentY - baseY; // positive = lower position
            const normalizedDepth = Math.min(100, Math.max(0, Math.round((yDeviation / (H * 0.25)) * 100)));

            setDepthProgress(normalizedDepth);

            // ANTI-CHEAT for wall mode: require significant body-sized motion
            // A hand wave has motionRatio < 0.10, a full body moving has motionRatio > 0.15
            const isBodyMotion = motionRatio > 0.10;

            if (phaseRef.current === 'READY') {
              if (normalizedDepth >= 30 && isBodyMotion) {
                phaseRef.current = 'GOING_DOWN';
                descentStartMsRef.current = now;
                hasValidBottomRef.current = false;
                wallDirectionRef.current = 'DOWN';
                setPhase('GOING_DOWN');
                setGuidance('Going down... Keep going!');
              }
            } else if (phaseRef.current === 'GOING_DOWN') {
              if (normalizedDepth >= 50 && isBodyMotion) {
                phaseRef.current = 'BOTTOM';
                bottomStartMsRef.current = now;
                wallBottomStartRef.current = now;
                setPhase('BOTTOM');
                setGuidance('Bottom position! Push back up!');
              } else if (normalizedDepth < 15 && now - descentStartMsRef.current < 250) {
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Get in position in front of camera.');
              }
            } else if (phaseRef.current === 'BOTTOM') {
              const timeAtBottom = now - bottomStartMsRef.current;
              if (timeAtBottom >= 180) {
                hasValidBottomRef.current = true;
              }
              if (normalizedDepth < 35) {
                if (hasValidBottomRef.current) {
                  phaseRef.current = 'GOING_UP';
                  wallDirectionRef.current = 'UP';
                  setPhase('GOING_UP');
                  setGuidance('Pushing up...');
                } else {
                  phaseRef.current = 'READY';
                  setPhase('READY');
                  setGuidance('Hold at bottom longer.');
                }
              }
            } else if (phaseRef.current === 'GOING_UP') {
              if (normalizedDepth <= 15) {
                const totalRepDuration = now - descentStartMsRef.current;
                const timeSinceLastRep = now - lastRepMsRef.current;
                if (totalRepDuration >= 700 && totalRepDuration <= 8000 && timeSinceLastRep >= 800) {
                  countRep(now);
                } else {
                  phaseRef.current = 'READY';
                  setPhase('READY');
                  setGuidance('Too fast. Do controlled pushups.');
                }
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
      } else {
        phaseRef.current = 'READY';
        setPhase('READY');
        setGuidance(`Rep ${repsRef.current} counted! Next rep...`);
      }
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
              playPromise.catch((e) => {
                console.warn('Pushup play attempt:', e);
                setTimeout(() => {
                  video.play().catch(() => {});
                }, 200);
              });
            }
          };

          video.onloadedmetadata = tryPlay;
          video.onloadeddata = tryPlay;
          video.oncanplay = tryPlay;
          tryPlay();
        }

        // Start processing loop immediately
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: any) {
        console.error('Camera stream access failed:', err);
        if (mountedRef.current) {
          setCameraError(err?.message || 'Camera permission required for pushup tracking.');
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
      {/* Header Tag */}
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

      {/* Detection Mode Badge */}
      <div className="text-[10px] mb-2 px-3 py-1 rounded-full border border-theme-border bg-theme-card text-theme-subtext font-semibold">
        {detectionMode === 'FLOOR' ? '📱 Floor Mode' : detectionMode === 'WALL' ? '🧱 Wall Mode' : '🔍 Auto-Detecting...'}
      </div>

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
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
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
            {/* Target line at 55% */}
            <div className="absolute left-0 right-0 top-[45%] border-t border-dashed border-amber-400 z-10" />
            <div
              className={`w-full transition-all duration-100 rounded-full ${
                depthProgress >= 55 ? 'bg-green-400 shadow-glow' : 'bg-blue-500'
              }`}
              style={{ height: `${depthProgress}%` }}
            />
          </div>

          {/* Center Target Chest Area */}
          <div
            className={`self-center w-36 h-28 border rounded-xl flex flex-col items-center justify-center transition-colors ${
              depthProgress >= 55
                ? 'border-green-400 bg-green-500/20'
                : 'border-dashed border-white/40 bg-black/20'
            }`}
          >
            <span className="text-[10px] text-white/80 tracking-wider font-semibold uppercase">
              {detectionMode === 'WALL' ? 'BODY TARGET' : 'CHEST TARGET'}
            </span>
            <span className="text-[9px] text-white/60">
              {depthProgress >= 55 ? 'DEPTH REACHED ✓' : `${depthProgress}%`}
            </span>
          </div>

          {/* Phase Status Badge */}
          <div className="w-full text-center text-xs text-white font-bold bg-black/70 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'CALIBRATING'
              ? 'CALIBRATING...'
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
