import React, { useEffect, useRef, useState, useCallback } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { PoseDetectionEngine, PoseResult } from '../../services/PoseDetectionEngine';
import { Dumbbell, Check, FlipHorizontal, ShieldAlert, Loader2 } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

interface PushupCameraViewProps {
  targetReps: number;
  onComplete: () => void;
}

type PushupPhase = 'LOADING_MODEL' | 'WAITING_FOR_BODY' | 'UP' | 'GOING_DOWN' | 'DOWN' | 'GOING_UP' | 'FINISHED';

// Pushup Movement Thresholds
const MIN_DROP_PX = 32;            // Minimum vertical displacement (pixels) required for shoulder/chest
const REP_COOLDOWN_MS = 700;       // Minimum time between reps
const MIN_REP_DURATION_MS = 400;   // Minimum duration of down-and-up movement (prevents twitch/handwave falses)
const EMA_ALPHA = 0.75;            // High-reactivity smoothing (eliminates frame-to-frame lag)

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
  const isProcessingRef = useRef(false);

  // Simplified Tracking Refs (Shoulder, Chest, Hip only)
  const phaseRef = useRef<PushupPhase>('LOADING_MODEL');
  const repsRef = useRef(0);
  const lastRepMsRef = useRef<number>(0);
  const repStartMsRef = useRef<number>(0);
  const maxDropSeenRef = useRef<number>(0);
  const minElbowAngleSeenRef = useRef<number>(180);
  const uprightStreakRef = useRef<number>(0);

  // Baselines for the UP position (starting height)
  const baseShoulderYRef = useRef<number | null>(null);
  const baseChestYRef = useRef<number | null>(null);
  const baseHipYRef = useRef<number | null>(null);

  // EMA-smoothed Y positions for noise reduction
  const smoothSYRef = useRef<number | null>(null);
  const smoothCYRef = useRef<number | null>(null);
  const smoothHYRef = useRef<number | null>(null);

  // UI State
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('LOADING_MODEL');
  const [guidance, setGuidance] = useState('Loading AI model...');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(PoseDetectionEngine.isReady());
  const modelReadyRef = useRef(PoseDetectionEngine.isReady());
  const phaseStartMsRef = useRef<number>(performance.now());
  const isOnline = useNetworkStatus();

  // Real-time Debug HUD showing Shoulder, Chest, Hip Y values & displacement
  const [hudData, setHudData] = useState({
    tracking: false,
    isOffline: false,
    isPlank: false,
    elbowAngle: null as number | null,
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

  // Manual rep fallback (used only when camera fails)
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
      setGuidance(`Rep ${repsRef.current} verified! Lower down again...`);
    }
  }, []);

  const countRepRef = useRef(countRep);
  useEffect(() => {
    countRepRef.current = countRep;
  }, [countRep]);

  // Load Detector (MoveNet or Offline Optical Tracker)
  useEffect(() => {
    let mounted = true;
    const loadModel = async () => {
      try {
        console.log('[PushupTracker] Initializing detector...');
        await PoseDetectionEngine.getDetector();
        if (mounted) {
          modelReadyRef.current = true;
          setModelReady(true);
          phaseRef.current = 'WAITING_FOR_BODY';
          setPhase('WAITING_FOR_BODY');
          setGuidance('Get into plank position (horizontal to camera)');
        }
      } catch (err) {
        console.warn('[PushupTracker] MoveNet offline fallback active:', err);
        if (mounted) {
          modelReadyRef.current = true;
          setModelReady(true);
          phaseRef.current = 'WAITING_FOR_BODY';
          setPhase('WAITING_FOR_BODY');
          setGuidance('Get into plank position (horizontal to camera)');
        }
      }
    };
    loadModel();
    return () => {
      mounted = false;
    };
  }, []);

  // Tracking Loop: Plank Posture Check, Elbow Angle, and Torso Y-axis movement
  useEffect(() => {
    let isCurrentEffect = true;
    mountedRef.current = true;

    // Reset baselines on mount or flip
    baseShoulderYRef.current = null;
    baseChestYRef.current = null;
    baseHipYRef.current = null;
    smoothSYRef.current = null;
    smoothCYRef.current = null;
    smoothHYRef.current = null;
    maxDropSeenRef.current = 0;
    minElbowAngleSeenRef.current = 180;

    const processFrame = async () => {
      if (!mountedRef.current || completedRef.current || !isCurrentEffect) return;

      if (isProcessingRef.current) {
        rafRef.current = requestAnimationFrame(processFrame);
        return;
      }
      isProcessingRef.current = true;

      try {
        const video = videoRef.current;
        const canvas = overlayCanvasRef.current;

        if (video && video.paused && video.readyState >= 2) {
          video.play().catch(() => {});
        }

        if (video && canvas && video.readyState >= 2 && modelReadyRef.current) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const result: PoseResult | null = await PoseDetectionEngine.detectPose(video);

            if (result && isCurrentEffect && mountedRef.current) {
              // Draw real-time skeleton overlay
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

              // POSTURE ENFORCEMENT: Debounced upright check so a single noisy frame never cancels an active rep
              if (result.isUpright) {
                uprightStreakRef.current += 1;
              } else {
                uprightStreakRef.current = 0;
              }

              const isMidRep = phaseRef.current === 'GOING_DOWN' || phaseRef.current === 'DOWN' || phaseRef.current === 'GOING_UP';
              if (result.isUpright && uprightStreakRef.current >= 8 && !isMidRep) {
                setHudData((prev) => ({
                  ...prev,
                  tracking: true,
                  isPlank: false,
                  elbowAngle: result.avgElbowAngle ? Math.round(result.avgElbowAngle) : null,
                }));
                if (phaseRef.current !== 'WAITING_FOR_BODY') {
                  phaseRef.current = 'WAITING_FOR_BODY';
                  setPhase('WAITING_FOR_BODY');
                }
                setGuidance('Get into plank position (horizontal to camera)');
                return;
              }

              const upperBody =
                result.shoulder ||
                result.chest ||
                (result.keypoints &&
                  result.keypoints.find(
                    (k) =>
                      (k.name === 'nose' || k.name === 'left_shoulder' || k.name === 'right_shoulder') &&
                      (k.score ?? 0) > 0.25
                  ));

              const hasBodyPoints = Boolean(upperBody);

              if (!hasBodyPoints) {
                setHudData((prev) => ({ ...prev, tracking: false, isPlank: false }));
                return;
              }

              // Extract Y-axis positions (pixels from top of image) and apply EMA smoothing
              const rawSY = upperBody!.y;
              const rawCY = result.chest ? result.chest.y : rawSY + 20;
              const rawHY = result.hip ? result.hip.y : rawCY + 30;

              // EMA smoothing (0.75) for fast response without frame lag
              smoothSYRef.current = smoothSYRef.current === null ? rawSY : smoothSYRef.current * (1 - EMA_ALPHA) + rawSY * EMA_ALPHA;
              smoothCYRef.current = smoothCYRef.current === null ? rawCY : smoothCYRef.current * (1 - EMA_ALPHA) + rawCY * EMA_ALPHA;
              smoothHYRef.current = smoothHYRef.current === null ? rawHY : smoothHYRef.current * (1 - EMA_ALPHA) + rawHY * EMA_ALPHA;

              const sY = smoothSYRef.current;
              const cY = smoothCYRef.current;
              const hY = smoothHYRef.current;

              // Realistic minimum movement distance based on video resolution (20px - 32px)
              const vHeight = video.videoHeight || 480;
              const dynamicMinDrop = Math.max(20, Math.min(32, Math.round(vHeight * 0.05)));

              // Establish or smoothly maintain baseline at UP position
              if (baseShoulderYRef.current === null || baseChestYRef.current === null || baseHipYRef.current === null) {
                baseShoulderYRef.current = sY;
                baseChestYRef.current = cY;
                baseHipYRef.current = hY;
              } else if (phaseRef.current === 'UP' || phaseRef.current === 'WAITING_FOR_BODY') {
                const diffS = Math.abs(sY - baseShoulderYRef.current);
                if (diffS < 8) {
                  baseShoulderYRef.current = baseShoulderYRef.current * 0.90 + sY * 0.10;
                  baseChestYRef.current = baseChestYRef.current * 0.90 + cY * 0.10;
                  baseHipYRef.current = baseHipYRef.current * 0.90 + hY * 0.10;
                }

                if (phaseRef.current === 'WAITING_FOR_BODY') {
                  phaseRef.current = 'UP';
                  setPhase('UP');
                  setGuidance('Plank verified! Lower your body down.');
                }
              }

              // Track vertical (Y-axis) movement relative to baseline
              const sDrop = sY - (baseShoulderYRef.current ?? sY);
              const cDrop = cY - (baseChestYRef.current ?? cY);
              const hDrop = hY - (baseHipYRef.current ?? hY);

              // Update real-time HUD
              setHudData({
                tracking: true,
                isOffline: Boolean(result.isOffline),
                isPlank: true,
                elbowAngle: result.avgElbowAngle ? Math.round(result.avgElbowAngle) : null,
                sY: Math.round(sY),
                cY: Math.round(cY),
                hY: Math.round(hY),
                sDrop: Math.round(sDrop),
                cDrop: Math.round(cDrop),
                hDrop: Math.round(hDrop),
                targetDrop: dynamicMinDrop,
              });

              const now = performance.now();
              const curElbowAngle = result.avgElbowAngle ?? null;

              // Robust Pushup State Cycle with Angle + Displacement Verification:
              // UP -> GOING_DOWN -> DOWN -> GOING_UP -> UP (Rep counted!)
              if (phaseRef.current === 'UP') {
                const isStartingDescent = sDrop >= 14 || (curElbowAngle !== null && curElbowAngle <= 135);
                if (isStartingDescent) {
                  phaseRef.current = 'GOING_DOWN';
                  phaseStartMsRef.current = now;
                  repStartMsRef.current = now;
                  maxDropSeenRef.current = Math.max(sDrop, 14);
                  minElbowAngleSeenRef.current = curElbowAngle ?? 180;
                  setPhase('GOING_DOWN');
                  setGuidance('Lowering down... bend elbows!');
                }
              } else if (phaseRef.current === 'GOING_DOWN') {
                maxDropSeenRef.current = Math.max(maxDropSeenRef.current, sDrop);
                if (curElbowAngle !== null) {
                  minElbowAngleSeenRef.current = Math.min(minElbowAngleSeenRef.current, curElbowAngle);
                }

                // DOWN requirement:
                // Either elbows bent deeply (<= 115°), OR decent drop (>= dynamicMinDrop) with valid bend
                const hasDeepElbowBend = (curElbowAngle !== null && curElbowAngle <= 115) ||
                  (result.leftElbowAngle !== null && result.leftElbowAngle <= 115) ||
                  (result.rightElbowAngle !== null && result.rightElbowAngle <= 115);

                const hasModerateBend = curElbowAngle === null ||
                  curElbowAngle <= 125 ||
                  (result.leftElbowAngle !== null && result.leftElbowAngle <= 125) ||
                  (result.rightElbowAngle !== null && result.rightElbowAngle <= 125);

                const reachedBottom = hasDeepElbowBend || (sDrop >= dynamicMinDrop && hasModerateBend) || (sDrop >= dynamicMinDrop * 1.3);

                if (reachedBottom) {
                  phaseRef.current = 'DOWN';
                  phaseStartMsRef.current = now;
                  setPhase('DOWN');
                  setGuidance('Bottom reached! Now push back UP!');
                } else if (sDrop < 6 && maxDropSeenRef.current < dynamicMinDrop && (now - phaseStartMsRef.current > 2500)) {
                  phaseRef.current = 'UP';
                  setPhase('UP');
                  setGuidance('Lower your chest all the way down.');
                }
              } else if (phaseRef.current === 'DOWN') {
                if (curElbowAngle !== null) {
                  minElbowAngleSeenRef.current = Math.min(minElbowAngleSeenRef.current, curElbowAngle);
                }
                const isPushingUp = (sDrop < maxDropSeenRef.current - 6) ||
                  (curElbowAngle !== null && curElbowAngle >= minElbowAngleSeenRef.current + 15);

                if (isPushingUp) {
                  phaseRef.current = 'GOING_UP';
                  phaseStartMsRef.current = now;
                  setPhase('GOING_UP');
                  setGuidance('Pushing up — extend arms to top!');
                }
              } else if (phaseRef.current === 'GOING_UP') {
                const returnedUp = sDrop <= Math.max(12, maxDropSeenRef.current * 0.40);
                const repDuration = now - repStartMsRef.current;

                // UP return requirement:
                // 1) Returned close to baseline height
                // 2) Arm extended: if elbow angle available, must reach >= 135°
                // 3) Duration must be realistic (>= 400ms) to reject quick hand twitches
                const hasArmsExtended = curElbowAngle === null ||
                  curElbowAngle >= 135 ||
                  (result.leftElbowAngle !== null && result.leftElbowAngle >= 135) ||
                  (result.rightElbowAngle !== null && result.rightElbowAngle >= 135);

                if (returnedUp && hasArmsExtended && repDuration >= MIN_REP_DURATION_MS) {
                  if (now - lastRepMsRef.current >= REP_COOLDOWN_MS) {
                    lastRepMsRef.current = now;
                    baseShoulderYRef.current = sY;
                    baseChestYRef.current = cY;
                    baseHipYRef.current = hY;
                    countRepRef.current();
                  }
                } else if (now - phaseStartMsRef.current > 4000) {
                  phaseRef.current = 'UP';
                  setPhase('UP');
                  setGuidance('Push all the way up to complete rep.');
                }
              }
            }
          }
        }
      } finally {
        isProcessingRef.current = false;
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
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not available');
        }
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
          console.log(`[PushupTracker] Requesting camera access (attempt ${attempts}/${maxAttempts})...`);
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

            const tryPlay = () => {
              if (!video || !isCurrentEffect) return;
              video.play().catch((e) => {
                console.warn('[PushupTracker] Video play deferred:', e);
                setTimeout(() => {
                  if (isCurrentEffect && mountedRef.current && video.paused) {
                    video.play().catch(() => {});
                  }
                }, 350);
              });
            };

            video.onloadedmetadata = tryPlay;
            video.onloadeddata = tryPlay;
            video.oncanplay = tryPlay;
            tryPlay();
          }

          rafRef.current = requestAnimationFrame(processFrame);
          console.log('[PushupTracker] Camera successfully initialized');
          return;
        } catch (err: any) {
          console.error(`[PushupTracker] Camera init attempt ${attempts} failed:`, err);
          if (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else if (isCurrentEffect && mountedRef.current) {
            setCameraError(
              err?.name === 'NotAllowedError'
                ? 'Camera permission denied. Use Manual Count.'
                : 'Camera is busy or unavailable. Use Manual Count.'
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
  }, [facingMode]);

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
        <span>PUSHUP DETECTION (PLANK &bull; ELBOW ANGLE)</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Do {targetReps} Pushups
      </h2>

      {/* Dynamic guidance message */}
      <p className="text-xs text-theme-subtext max-w-xs mb-2 min-h-[32px] flex items-center justify-center font-medium">
        {guidance}
      </p>

      {/* Camera Viewfinder with Skeleton Overlay */}
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
            {/* Live Skeleton Canvas Overlay */}
            <canvas
              ref={overlayCanvasRef}
              className={`absolute inset-0 w-full h-full pointer-events-none object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
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
            <div className="flex items-center gap-1.5">
              {/* Live network status badge */}
              <div className="text-[10px] font-bold text-white/90 bg-black/60 px-2 py-1 rounded-full backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
                <span className={isOnline ? 'text-emerald-400' : 'text-neutral-400'}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Status Badge */}
              <div className="text-[10px] font-bold text-white/90 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10">
                {phase === 'LOADING_MODEL' && !modelReady ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> LOADING AI...
                  </span>
                ) : hudData.isPlank ? (
                  <span className="text-green-400 font-extrabold">PLANK VERIFIED ✓</span>
                ) : hudData.tracking ? (
                  <span className="text-amber-300">GET IN PLANK</span>
                ) : (
                  <span className="text-amber-300">POSITION BODY</span>
                )}
              </div>
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
              : 'GET IN PLANK'}
          </div>

          {/* Bottom Banner */}
          <div className="w-full text-center text-xs text-white font-bold bg-black/75 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'DOWN'
              ? 'PUSH BACK UP NOW!'
              : phase === 'GOING_DOWN'
              ? 'LOWER CHEST & BEND ELBOWS'
              : phase === 'GOING_UP'
              ? 'EXTEND ARMS TO TOP'
              : 'PLANK POSITION • BEND ELBOWS'}
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

      {/* Real-time HUD: Shoulder / Elbow / Displacement */}
      <div className="w-full max-w-xs bg-neutral-950/85 border border-neutral-800 rounded-xl p-2.5 mb-3 text-left font-mono text-[10px] space-y-1 shadow-sm">
        <div className="text-neutral-400 font-bold tracking-wider uppercase text-[9px] border-b border-neutral-800 pb-1 flex justify-between">
          <span>Pushup Form Tracker {hudData.isOffline ? '(Offline)' : '(MoveNet)'}</span>
          <span className="text-green-400 font-normal">Target: &ge;{hudData.targetDrop}px</span>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
          <div className="bg-neutral-900/90 rounded p-1 border border-neutral-800">
            <span className="text-blue-400 font-bold block">DISPLACEMENT</span>
            <span className={`block font-bold text-[10px] ${hudData.sDrop >= hudData.targetDrop ? 'text-green-400' : 'text-neutral-300'}`}>
              {hudData.sDrop > 0 ? `+${hudData.sDrop}` : hudData.sDrop}px
            </span>
            <span className="text-[8px] text-neutral-500">min {hudData.targetDrop}px</span>
          </div>
          <div className="bg-neutral-900/90 rounded p-1 border border-neutral-800">
            <span className="text-amber-400 font-bold block">ELBOW ANGLE</span>
            <span className={`block font-bold text-[10px] ${hudData.elbowAngle !== null && hudData.elbowAngle <= 120 ? 'text-green-400' : 'text-neutral-300'}`}>
              {hudData.elbowAngle !== null ? `${hudData.elbowAngle}°` : '--'}
            </span>
            <span className="text-[8px] text-neutral-500">&le;120&deg; for rep</span>
          </div>
          <div className="bg-neutral-900/90 rounded p-1 border border-neutral-800">
            <span className="text-purple-400 font-bold block">POSTURE</span>
            <span className={`block font-bold text-[10px] ${hudData.isPlank ? 'text-green-400' : 'text-amber-400'}`}>
              {hudData.isPlank ? 'PLANK ✓' : 'UPRIGHT'}
            </span>
            <span className="text-[8px] text-neutral-500">Horizontal</span>
          </div>
        </div>
      </div>

      {/* Rep Count Display */}
      <div className="flex items-baseline justify-center space-x-2 mb-2">
        <span className="text-6xl font-bold tracking-tight text-theme-text font-tabular">
          {reps}
        </span>
        <span className="text-2xl font-light text-theme-muted">/ {targetReps}</span>
        <span className="text-xs tracking-wider font-semibold text-theme-subtext ml-2 uppercase">
          Reps
        </span>
      </div>

      {/* Manual fallback button if camera angle or lighting prevents recognition */}
      <button
        type="button"
        onClick={handleManualRep}
        className="text-[11px] text-theme-subtext hover:text-theme-text active:scale-95 px-3 py-1.5 rounded-lg border border-theme-border/60 bg-theme-card/70 transition-all font-medium mb-1 cursor-pointer"
      >
        Having trouble? Tap to count +1 rep manually
      </button>
    </div>
  );
};
