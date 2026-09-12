import React, { useEffect, useRef, useState, useCallback } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { PoseDetectionEngine, PoseResult } from '../../services/PoseDetectionEngine';
import { Dumbbell, RefreshCw, Check, FlipHorizontal, ShieldAlert, Loader2 } from 'lucide-react';

interface PushupCameraViewProps {
  targetReps: number;
  onComplete: () => void;
}

type PushupPhase = 'LOADING_MODEL' | 'WAITING_FOR_BODY' | 'UP' | 'GOING_DOWN' | 'DOWN' | 'GOING_UP' | 'FINISHED';

// Pushup Movement Thresholds
const MIN_DROP_PX = 20;            // Minimum vertical displacement (pixels) required for shoulder/chest/hip
const ALIGNMENT_TOLERANCE_PX = 40; // Shoulder, chest, and hip must stay roughly aligned within this tolerance
const REP_COOLDOWN_MS = 800;       // Cooldown between reps
const STABLE_FRAMES_GATE = 2;      // Frames required to confirm down/up states

export const PushupCameraView: React.FC<PushupCameraViewProps> = ({
  targetReps,
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);

  // Simplified Tracking Refs (Shoulder, Chest, Hip only)
  const phaseRef = useRef<PushupPhase>('LOADING_MODEL');
  const repsRef = useRef(0);
  const lastRepMsRef = useRef<number>(0);
  const maxDropSeenRef = useRef<number>(0);
  const stableDownCountRef = useRef(0);
  const stableUpCountRef = useRef(0);

  // Baselines for the UP position (starting height)
  const baseShoulderYRef = useRef<number | null>(null);
  const baseChestYRef = useRef<number | null>(null);
  const baseHipYRef = useRef<number | null>(null);

  // Throttled console log ref
  const lastLogMsRef = useRef<number>(0);

  // UI State
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('LOADING_MODEL');
  const [guidance, setGuidance] = useState('Loading AI model...');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(PoseDetectionEngine.isReady());

  // Real-time Debug HUD showing Shoulder, Chest, Hip Y values & displacement
  const [hudData, setHudData] = useState({
    tracking: false,
    sY: 0,
    cY: 0,
    hY: 0,
    sDrop: 0,
    cDrop: 0,
    hDrop: 0,
    targetDrop: MIN_DROP_PX,
  });

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const targetRepsRef = useRef(targetReps);
  useEffect(() => {
    targetRepsRef.current = targetReps;
  }, [targetReps]);

  // Flip camera
  const handleToggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Manual rep fallback
  const handleManualRep = useCallback(() => {
    if (repsRef.current < targetRepsRef.current && !completedRef.current) {
      repsRef.current += 1;
      setReps(repsRef.current);
      synth.playRepChirp();

      if (repsRef.current >= targetRepsRef.current) {
        completedRef.current = true;
        setIsComplete(true);
        setPhase('FINISHED');
        setGuidance(`${targetRepsRef.current} Pushups Completed!`);
        setTimeout(() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          onCompleteRef.current();
        }, 700);
      }
    }
  }, []);

  // Count a valid rep
  const countRep = useCallback(() => {
    repsRef.current += 1;
    setReps(repsRef.current);
    synth.playRepChirp();

    console.log(`[PushupTracker] ✅ REP ${repsRef.current}/${targetRepsRef.current} COUNTED!`);

    if (repsRef.current >= targetRepsRef.current) {
      completedRef.current = true;
      phaseRef.current = 'FINISHED';
      setIsComplete(true);
      setPhase('FINISHED');
      setGuidance(`${targetRepsRef.current} Pushups Completed!`);
      setTimeout(() => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        onCompleteRef.current();
      }, 700);
    } else {
      phaseRef.current = 'UP';
      setPhase('UP');
      setGuidance(`Rep ${repsRef.current} done! Lower down again...`);
    }
  }, []);

  // Load MoveNet
  useEffect(() => {
    let mounted = true;
    const loadModel = async () => {
      try {
        console.log('[PushupTracker] Initializing MoveNet detector...');
        await PoseDetectionEngine.getDetector();
        if (mounted) {
          setModelReady(true);
          phaseRef.current = 'WAITING_FOR_BODY';
          setPhase('WAITING_FOR_BODY');
          setGuidance('Position phone so shoulders, chest, and hips are visible.');
        }
      } catch (err) {
        console.error('[PushupTracker] Failed to load model:', err);
        if (mounted) setGuidance('AI model error. Use manual count.');
      }
    };
    loadModel();
    return () => {
      mounted = false;
    };
  }, []);

  // Simplified Tracking Loop: Shoulder, Chest, and Hip Y-axis movement
  useEffect(() => {
    let isCurrentEffect = true;
    mountedRef.current = true;

    // Reset baselines on mount or flip
    baseShoulderYRef.current = null;
    baseChestYRef.current = null;
    baseHipYRef.current = null;
    maxDropSeenRef.current = 0;
    stableDownCountRef.current = 0;
    stableUpCountRef.current = 0;

    const processFrame = async () => {
      if (!mountedRef.current || completedRef.current || !isCurrentEffect) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

      if (video && video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }

      if (video && canvas && video.readyState >= 2 && modelReady) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const result: PoseResult | null = await PoseDetectionEngine.detectPose(video);

          if (result && isCurrentEffect && mountedRef.current) {
            // Draw skeleton & highlight Shoulder, Chest, Hip markers
            PoseDetectionEngine.drawPose(
              ctx,
              result.keypoints,
              canvas.width,
              canvas.height,
              video.videoWidth,
              video.videoHeight,
              result.isUpright,
              result.isHorizontal
            );

            const shoulder = result.shoulder;
            const chest = result.chest;
            const hip = result.hip;

            // Only track if shoulder, chest, and hip are detected
            const hasBodyPoints = Boolean(shoulder && chest && hip && result.isTracking);

            if (!hasBodyPoints) {
              setHudData((prev) => ({ ...prev, tracking: false }));
              if (phaseRef.current !== 'FINISHED') {
                phaseRef.current = 'WAITING_FOR_BODY';
                setPhase('WAITING_FOR_BODY');
                setGuidance('Ensure shoulders and hips are clearly visible in camera.');
              }
              rafRef.current = requestAnimationFrame(processFrame);
              return;
            }

            // Extract Y-axis positions (pixels from top of image)
            const sY = shoulder!.y;
            const cY = chest!.y;
            const hY = hip!.y;

            // Dynamic minimum movement distance based on video resolution
            const vHeight = video.videoHeight || 480;
            const dynamicMinDrop = Math.max(MIN_DROP_PX, Math.round(vHeight * 0.04));

            // Establish or smoothly maintain baseline at UP position
            if (baseShoulderYRef.current === null || baseChestYRef.current === null || baseHipYRef.current === null) {
              baseShoulderYRef.current = sY;
              baseChestYRef.current = cY;
              baseHipYRef.current = hY;
            } else if (phaseRef.current === 'UP' || phaseRef.current === 'WAITING_FOR_BODY') {
              // Slowly smooth baseline when at the top
              baseShoulderYRef.current = baseShoulderYRef.current * 0.9 + sY * 0.1;
              baseChestYRef.current = baseChestYRef.current * 0.9 + cY * 0.1;
              baseHipYRef.current = baseHipYRef.current * 0.9 + hY * 0.1;

              if (phaseRef.current === 'WAITING_FOR_BODY') {
                phaseRef.current = 'UP';
                setPhase('UP');
                setGuidance('Ready! Lower your body down.');
              }
            }

            // 1. Track vertical (Y-axis) movement relative to baseline
            // (In image coordinates, moving DOWN toward the ground increases Y)
            const sDrop = sY - (baseShoulderYRef.current ?? sY);
            const cDrop = cY - (baseChestYRef.current ?? cY);
            const hDrop = hY - (baseHipYRef.current ?? hY);

            // Update real-time HUD
            setHudData({
              tracking: true,
              sY: Math.round(sY),
              cY: Math.round(cY),
              hY: Math.round(hY),
              sDrop: Math.round(sDrop),
              cDrop: Math.round(cDrop),
              hDrop: Math.round(hDrop),
              targetDrop: dynamicMinDrop,
            });

            const now = performance.now();

            // Debug logging each second or on significant movement
            if (now - lastLogMsRef.current > 1000) {
              console.log(
                `[PushupTracker] Y-pos: S=${sY.toFixed(0)} C=${cY.toFixed(0)} H=${hY.toFixed(0)} | Drop: S=${sDrop.toFixed(0)} C=${cDrop.toFixed(0)} H=${hDrop.toFixed(0)} (Min: ${dynamicMinDrop}) | Phase: ${phaseRef.current}`
              );
              lastLogMsRef.current = now;
            }

            // ==============================================================
            // SIMPLIFIED PUSHUP LOGIC: Shoulder + Chest + Hip Moving Together
            // ==============================================================

            if (phaseRef.current === 'UP') {
              // Descent Detection: Shoulder and chest both start moving down together
              if (sDrop >= 8 && cDrop >= 6) {
                phaseRef.current = 'GOING_DOWN';
                setPhase('GOING_DOWN');
                setGuidance('Lowering down... keep going!');
                maxDropSeenRef.current = Math.max(sDrop, cDrop);
              }
            } else if (phaseRef.current === 'GOING_DOWN') {
              maxDropSeenRef.current = Math.max(maxDropSeenRef.current, sDrop, cDrop);

              // 2. A valid pushup "DOWN" position:
              // - Shoulder, chest, and hip ALL move DOWN together by at least dynamicMinDrop
              // - Shoulder, chest, and hip stay aligned with each other within tolerance
              const allMovedDown =
                sDrop >= dynamicMinDrop &&
                cDrop >= dynamicMinDrop * 0.8 &&
                hDrop >= dynamicMinDrop * 0.45;

              const alignedTogether =
                Math.abs(sDrop - cDrop) < ALIGNMENT_TOLERANCE_PX &&
                Math.abs(cDrop - hDrop) < ALIGNMENT_TOLERANCE_PX;

              if (allMovedDown && alignedTogether) {
                stableDownCountRef.current++;
                if (stableDownCountRef.current >= STABLE_FRAMES_GATE) {
                  phaseRef.current = 'DOWN';
                  setPhase('DOWN');
                  setGuidance('Bottom reached! Now push back UP!');
                  stableUpCountRef.current = 0;
                  console.log(
                    `[PushupTracker] ⬇ DOWN REACHED: S:+${sDrop.toFixed(0)}px, C:+${cDrop.toFixed(0)}px, H:+${hDrop.toFixed(0)}px`
                  );
                }
              } else {
                stableDownCountRef.current = 0;
              }

              // Aborted rep (returned to top without hitting full depth)
              if (sDrop < 6 && cDrop < 6 && maxDropSeenRef.current < dynamicMinDrop) {
                phaseRef.current = 'UP';
                setPhase('UP');
                setGuidance('Lower your entire body all the way down.');
              }
            } else if (phaseRef.current === 'DOWN') {
              // Start pushing up: body starts ascending
              if (sDrop < maxDropSeenRef.current - 6) {
                phaseRef.current = 'GOING_UP';
                setPhase('GOING_UP');
                setGuidance('Pushing up — return to top!');
                stableUpCountRef.current = 0;
              }
            } else if (phaseRef.current === 'GOING_UP') {
              // 3. A valid pushup "UP" position:
              // - Shoulder, chest, and hip all move back UP together to starting height
              const allMovedBackUp =
                sDrop <= Math.max(8, maxDropSeenRef.current * 0.35) &&
                cDrop <= Math.max(8, maxDropSeenRef.current * 0.35) &&
                hDrop <= Math.max(8, maxDropSeenRef.current * 0.35);

              if (allMovedBackUp) {
                stableUpCountRef.current++;
                if (stableUpCountRef.current >= STABLE_FRAMES_GATE) {
                  // 4. Count one rep when full cycle completed + cooldown passed
                  if (now - lastRepMsRef.current >= REP_COOLDOWN_MS) {
                    lastRepMsRef.current = now;
                    stableDownCountRef.current = 0;
                    stableUpCountRef.current = 0;
                    // Update baseline to current height for next rep
                    baseShoulderYRef.current = sY;
                    baseChestYRef.current = cY;
                    baseHipYRef.current = hY;
                    countRep();
                  }
                }
              } else {
                stableUpCountRef.current = 0;
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(processFrame);
    };

    const initCamera = async () => {
      setCameraError(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      let attempts = 0;
      const maxAttempts = 3;

      const attemptGetUserMedia = async (): Promise<MediaStream> => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      };

      while (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
        attempts++;
        try {
          const stream = await attemptGetUserMedia();
          if (!isCurrentEffect || !mountedRef.current) {
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
            video.play().catch(() => {});
          }

          rafRef.current = requestAnimationFrame(processFrame);
          return;
        } catch (err: any) {
          if (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else if (isCurrentEffect && mountedRef.current) {
            setCameraError(
              err?.name === 'NotAllowedError'
                ? 'Camera permission denied.'
                : 'Camera is in use by another app.'
            );
          }
        }
      }
    };

    initCamera();

    return () => {
      isCurrentEffect = false;
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
  }, [facingMode, modelReady, countRep]);

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        video::-webkit-media-controls { display: none !important; }
        video::-webkit-media-controls-enclosure { display: none !important; }
        video::-webkit-media-controls-panel { display: none !important; }
      `,
        }}
      />

      {/* Header */}
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <Dumbbell size={14} className="text-blue-500" />
        <span>PUSHUP DETECTION (SHOULDER • CHEST • HIP)</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Do {targetReps} Pushups
      </h2>

      {/* Dynamic guidance message */}
      <p className="text-xs text-theme-subtext max-w-xs mb-2 min-h-[32px] flex items-center justify-center font-medium">
        {guidance}
      </p>

      {/* Camera Viewfinder */}
      <div className="relative w-full max-w-xs aspect-4/3 bg-black rounded-2xl border-2 border-theme-border overflow-hidden mb-2 shadow-lg">
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
          <>
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
            {/* Overlay Canvas displaying Shoulder, Chest, and Hip tracking */}
            <canvas
              ref={overlayCanvasRef}
              className={`absolute inset-0 w-full h-full pointer-events-none ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
              style={{ objectFit: 'cover' }}
            />
          </>
        )}

        {/* Viewfinder Overlays */}
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
              {phase === 'LOADING_MODEL' ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> LOADING AI...
                </span>
              ) : hudData.tracking ? (
                <span className="text-green-400">BODY TRACKED ✓</span>
              ) : (
                <span className="text-amber-300">POSITION BODY</span>
              )}
            </div>
          </div>

          {/* Phase Badge */}
          <div
            className={`self-center px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              phase === 'DOWN'
                ? 'bg-green-500/80 text-white border-green-400 shadow-glow'
                : phase === 'GOING_DOWN'
                ? 'bg-amber-500/80 text-white border-amber-400'
                : phase === 'GOING_UP'
                ? 'bg-blue-500/80 text-white border-blue-400'
                : 'bg-black/70 text-white/80 border-white/20'
            }`}
          >
            {phase === 'DOWN'
              ? '✓ DOWN (PUSH UP!)'
              : phase === 'GOING_DOWN'
              ? '⬇ GOING DOWN...'
              : phase === 'GOING_UP'
              ? '⬆ PUSHING UP...'
              : phase === 'UP'
              ? 'READY (LOWER DOWN)'
              : 'GET IN POSITION'}
          </div>

          {/* Bottom Banner */}
          <div className="w-full text-center text-xs text-white font-bold bg-black/75 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'DOWN'
              ? 'PUSH BACK UP NOW!'
              : phase === 'GOING_DOWN'
              ? 'KEEP LOWERING...'
              : phase === 'GOING_UP'
              ? 'RETURN TO TOP POSITION'
              : 'SHOULDER • CHEST • HIP SYNCHRONIZED'}
          </div>
        </div>

        {/* Completion Modal */}
        {isComplete && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in z-20">
            <Check size={52} className="text-green-400 mb-2 animate-bounce" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {targetReps} Pushups Verified!
            </span>
          </div>
        )}
      </div>

      {/* Simple Debug HUD: Shoulder / Chest / Hip Y-values */}
      <div className="w-full max-w-xs bg-neutral-950/85 border border-neutral-800 rounded-xl p-2.5 mb-3 text-left font-mono text-[10px] space-y-1 shadow-sm">
        <div className="text-neutral-400 font-bold tracking-wider uppercase text-[9px] border-b border-neutral-800 pb-1 flex justify-between">
          <span>Torso Y-Movement Tracker</span>
          <span className="text-green-400 font-normal">Target: ≥{hudData.targetDrop}px</span>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
          <div className="bg-neutral-900/90 rounded p-1 border border-neutral-800">
            <span className="text-blue-400 font-bold block">SHOULDER</span>
            <span className="text-neutral-200">{hudData.sY}px</span>
            <span className={`block font-bold text-[9px] ${hudData.sDrop >= hudData.targetDrop ? 'text-green-400' : 'text-neutral-400'}`}>
              Δ: {hudData.sDrop > 0 ? `+${hudData.sDrop}` : hudData.sDrop}px
            </span>
          </div>
          <div className="bg-neutral-900/90 rounded p-1 border border-neutral-800">
            <span className="text-amber-400 font-bold block">CHEST</span>
            <span className="text-neutral-200">{hudData.cY}px</span>
            <span className={`block font-bold text-[9px] ${hudData.cDrop >= hudData.targetDrop * 0.8 ? 'text-green-400' : 'text-neutral-400'}`}>
              Δ: {hudData.cDrop > 0 ? `+${hudData.cDrop}` : hudData.cDrop}px
            </span>
          </div>
          <div className="bg-neutral-900/90 rounded p-1 border border-neutral-800">
            <span className="text-purple-400 font-bold block">HIP</span>
            <span className="text-neutral-200">{hudData.hY}px</span>
            <span className={`block font-bold text-[9px] ${hudData.hDrop >= hudData.targetDrop * 0.45 ? 'text-green-400' : 'text-neutral-400'}`}>
              Δ: {hudData.hDrop > 0 ? `+${hudData.hDrop}` : hudData.hDrop}px
            </span>
          </div>
        </div>
      </div>

      {/* Rep Count Display */}
      <div className="flex items-baseline justify-center space-x-2 mb-3">
        <span className="text-6xl font-bold tracking-tight text-theme-text font-tabular">
          {reps}
        </span>
        <span className="text-2xl font-light text-theme-muted">/ {targetReps}</span>
        <span className="text-xs tracking-wider font-semibold text-theme-subtext ml-2 uppercase">
          Reps
        </span>
      </div>

      {/* Manual Count Fallback */}
      <div className="flex flex-col items-center space-y-1">
        <button
          onClick={handleManualRep}
          className="text-xs font-semibold tracking-wide py-2 px-4 rounded-xl border border-theme-border bg-theme-card hover:opacity-80 active:scale-95 text-theme-text transition-all flex items-center space-x-2 shadow-sm"
        >
          <RefreshCw size={13} />
          <span>Manual Count (+1 Rep)</span>
        </button>
        <span className="text-[10px] text-theme-subtext">Phone position tricky? Tap to count rep</span>
      </div>
    </div>
  );
};
