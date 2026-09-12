import React, { useEffect, useRef, useState, useCallback } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { PoseDetectionEngine, Keypoint, PoseResult } from '../../services/PoseDetectionEngine';
import { Dumbbell, RefreshCw, Check, FlipHorizontal, ShieldAlert, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PushupCameraViewProps {
  targetReps: number;
  onComplete: () => void;
}

type PushupPhase =
  | 'LOADING_MODEL'
  | 'NOT_IN_POSITION'
  | 'READY'
  | 'GOING_DOWN'
  | 'BOTTOM'
  | 'GOING_UP'
  | 'FINISHED';

// Biomechanical Pushup Thresholds
const ELBOW_DOWN_THRESHOLD = 98;   // Arms bent at bottom of pushup (<= 98°)
const ELBOW_UP_THRESHOLD = 150;    // Arms extended at top of pushup (>= 150°)
const MIN_REP_DURATION_MS = 650;   // Minimum time to perform a real pushup rep (filters fast flicks)
const MAX_REP_DURATION_MS = 7000;  // Maximum time for a single rep
const MIN_REP_COOLDOWN_MS = 1000;  // Debounce between counted reps (1 second)
const STABLE_FRAMES_REQUIRED = 3;  // Consecutive frames needed to confirm a position

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

  // Pushup Kinematic Tracking Refs
  const phaseRef = useRef<PushupPhase>('LOADING_MODEL');
  const repsRef = useRef(0);
  const lastRepMsRef = useRef<number>(0);
  const descentStartMsRef = useRef<number>(0);
  const maxDropSeenRef = useRef<number>(0);
  const stableDownFramesRef = useRef(0);
  const stableUpFramesRef = useRef(0);

  // Multi-landmark Baselines (established when user is in horizontal plank with extended arms)
  const baselineShoulderYRef = useRef<number>(0);
  const baselineHipYRef = useRef<number>(0);
  const baselineWristDistRef = useRef<number | null>(null);

  // Throttled logging ref
  const lastLogMsRef = useRef<number>(0);

  // UI State
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('LOADING_MODEL');
  const [guidance, setGuidance] = useState('Loading AI pose model...');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(PoseDetectionEngine.isReady());

  // Real-time Debug HUD State
  const [orientationStatus, setOrientationStatus] = useState<'HORIZONTAL' | 'UPRIGHT' | 'UNKNOWN'>('UNKNOWN');
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [shoulderDropPx, setShoulderDropPx] = useState<number>(0);
  const [minDropTarget, setMinDropTarget] = useState<number>(18);
  const [landmarksHud, setLandmarksHud] = useState('S:– E:– W:– H:–');

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

    console.log(`[PushupEngine] ✅ REP ${repsRef.current}/${targetRepsRef.current} VERIFIED & COUNTED!`);

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
      phaseRef.current = 'READY';
      setPhase('READY');
      setGuidance(`Rep ${repsRef.current} verified! Lower down for next rep.`);
      setRejectReason(null);
    }
  }, []);

  // Preload MoveNet
  useEffect(() => {
    let mounted = true;
    const loadModel = async () => {
      try {
        console.log('[PushupCamera] Loading MoveNet...');
        await PoseDetectionEngine.getDetector();
        if (mounted) {
          setModelReady(true);
          phaseRef.current = 'NOT_IN_POSITION';
          setPhase('NOT_IN_POSITION');
          setGuidance('Get into horizontal plank position on floor.');
          console.log('[PushupCamera] MoveNet ready');
        }
      } catch (err: any) {
        console.error('[PushupCamera] Failed to load MoveNet:', err);
        if (mounted) {
          setGuidance('AI model failed to load. Use manual count.');
        }
      }
    };
    loadModel();
    return () => {
      mounted = false;
    };
  }, []);

  // Camera + Pose Analysis Loop
  useEffect(() => {
    let isCurrentEffect = true;
    mountedRef.current = true;

    // Reset baselines on mount or camera flip
    baselineShoulderYRef.current = 0;
    baselineHipYRef.current = 0;
    baselineWristDistRef.current = null;
    maxDropSeenRef.current = 0;
    stableDownFramesRef.current = 0;
    stableUpFramesRef.current = 0;

    const drawOverlayAndAnalyze = async () => {
      if (!mountedRef.current || completedRef.current || !isCurrentEffect) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

      // Force play if paused by WebView
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

          // 1. Run MoveNet Pose Estimation
          const result: PoseResult | null = await PoseDetectionEngine.detectPose(video);

          if (result && isCurrentEffect && mountedRef.current) {
            // Update Landmarks HUD string
            const sMark = result.hasShoulder ? '✓' : '✗';
            const eMark = result.hasElbow ? '✓' : '✗';
            const wMark = result.hasWrist ? '✓' : '✗';
            const hMark = result.hasHip ? '✓' : '✗';
            setLandmarksHud(`S:${sMark} E:${eMark} W:${wMark} H:${hMark}`);

            // 2. Draw Skeleton with Dynamic Color (Green for plank, Red for upright)
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

            // Draw Elbow Angle Text on Canvas
            const drawAngle = (kp: Keypoint, angle: number | null) => {
              if (angle !== null && (kp.score ?? 0) > 0.25) {
                const x = (kp.x / video.videoWidth) * canvas.width;
                const y = (kp.y / video.videoHeight) * canvas.height;
                ctx.fillStyle = angle <= ELBOW_DOWN_THRESHOLD ? '#22c55e' : angle >= ELBOW_UP_THRESHOLD ? '#38bdf8' : '#fbbf24';
                ctx.font = 'bold 15px sans-serif';
                ctx.fillText(`${Math.round(angle)}°`, x + 8, y - 8);
              }
            };
            drawAngle(result.keypoints[7], result.leftElbowAngle);
            drawAngle(result.keypoints[8], result.rightElbowAngle);

            const vHeight = video.videoHeight || 480;
            const requiredMinDrop = Math.max(16, Math.round(vHeight * 0.038));
            setMinDropTarget(requiredMinDrop);

            const avgAngle = result.avgElbowAngle;
            setCurrentAngle(avgAngle ? Math.round(avgAngle) : null);

            const now = performance.now();
            const shouldLog = now - lastLogMsRef.current > 1000;

            // ==============================================================
            // BIOMECHANICAL GATE 1: Minimum Landmark Visibility (Req 5)
            // ==============================================================
            if (!result.isBodyVisible) {
              setOrientationStatus('UNKNOWN');
              const missingStr = result.missingLandmarks.join(', ');
              const reason = `Missing landmarks: ${missingStr}`;
              setRejectReason(reason);
              setGuidance(`Step back! Need visible: ${missingStr}`);
              if (phaseRef.current !== 'FINISHED') {
                phaseRef.current = 'NOT_IN_POSITION';
                setPhase('NOT_IN_POSITION');
              }
              if (shouldLog) {
                console.log(`[PushupEngine] ❌ REJECT: ${reason}`);
                lastLogMsRef.current = now;
              }
              rafRef.current = requestAnimationFrame(drawOverlayAndAnalyze);
              return;
            }

            // ==============================================================
            // BIOMECHANICAL GATE 2: Body Orientation Check (Req 2)
            // Must be roughly horizontal/prone (plank), NOT sitting or standing
            // ==============================================================
            if (result.isUpright) {
              setOrientationStatus('UPRIGHT');
              const reason = 'Body is upright (sitting/standing). Get into horizontal plank!';
              setRejectReason(reason);
              setGuidance('Upright posture detected! Lie horizontal on floor.');
              if (phaseRef.current !== 'FINISHED') {
                phaseRef.current = 'NOT_IN_POSITION';
                setPhase('NOT_IN_POSITION');
              }
              stableDownFramesRef.current = 0;
              stableUpFramesRef.current = 0;
              if (shouldLog) {
                console.log(`[PushupEngine] ❌ REJECT: ${reason} (torsoAngle=${result.torsoAngleDeg?.toFixed(0)}°)`);
                lastLogMsRef.current = now;
              }
              rafRef.current = requestAnimationFrame(drawOverlayAndAnalyze);
              return;
            }

            // Confirmed horizontal plank form
            setOrientationStatus('HORIZONTAL');

            const currentShoulderY = result.midShoulder!.y;
            const currentHipY = result.midHip!.y;
            const currentWristDist = result.shoulderWristDist;

            // Establish or smoothly track baseline when user is in plank with straight arms
            if (avgAngle !== null && avgAngle >= 140) {
              if (baselineShoulderYRef.current === 0) {
                baselineShoulderYRef.current = currentShoulderY;
                baselineHipYRef.current = currentHipY;
                baselineWristDistRef.current = currentWristDist;
              } else if (phaseRef.current === 'READY' || phaseRef.current === 'NOT_IN_POSITION') {
                baselineShoulderYRef.current = baselineShoulderYRef.current * 0.85 + currentShoulderY * 0.15;
                baselineHipYRef.current = baselineHipYRef.current * 0.85 + currentHipY * 0.15;
                if (currentWristDist && baselineWristDistRef.current) {
                  baselineWristDistRef.current = baselineWristDistRef.current * 0.85 + currentWristDist * 0.15;
                }
              }
            }

            // Calculate vertical drop progress
            const shoulderDrop = currentShoulderY - baselineShoulderYRef.current;
            const wristCompression =
              baselineWristDistRef.current && currentWristDist
                ? baselineWristDistRef.current - currentWristDist
                : 0;
            // Combined metric: accounts for both absolute camera downward shift and torso-to-wrist compression
            const effectiveDrop = Math.max(shoulderDrop, wristCompression * 0.7);
            setShoulderDropPx(Math.round(effectiveDrop));

            const hipDrop = currentHipY - baselineHipYRef.current;

            // ==============================================================
            // PUSHUP KINEMATIC STATE MACHINE (Req 3, 4, 6)
            // ==============================================================
            if (phaseRef.current === 'NOT_IN_POSITION' || phaseRef.current === 'READY') {
              if (avgAngle !== null && avgAngle >= 140) {
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Ready! Lower your chest towards the floor.');
                setRejectReason(null);
              }

              // Descent Trigger: Both elbow flexion AND vertical torso downward movement
              if (avgAngle !== null && avgAngle <= 130 && effectiveDrop >= 6) {
                phaseRef.current = 'GOING_DOWN';
                descentStartMsRef.current = now;
                maxDropSeenRef.current = effectiveDrop;
                setPhase('GOING_DOWN');
                setGuidance('Lowering down — keep going...');
                console.log('[PushupEngine] ⬇ DESCENT STARTED: Elbows bending & chest dropping');
              }
            } else if (phaseRef.current === 'GOING_DOWN') {
              if (effectiveDrop > maxDropSeenRef.current) {
                maxDropSeenRef.current = effectiveDrop;
              }

              // ==============================================================
              // BOTTOM POSITION VALIDATION:
              // 1. Elbow angle <= ELBOW_DOWN_THRESHOLD (arms deeply bent)
              // 2. Shoulder vertical displacement >= requiredMinDrop (chest lowered)
              // 3. Torso/hip stability (hips didn't spike upwards into downward dog)
              // ==============================================================
              const anglePass = avgAngle !== null && avgAngle <= ELBOW_DOWN_THRESHOLD;
              const dropPass = effectiveDrop >= requiredMinDrop;
              const hipStabilityPass = hipDrop >= -16; // Hips must not lift drastically while shoulders drop

              if (anglePass && dropPass && hipStabilityPass) {
                stableDownFramesRef.current++;
                if (stableDownFramesRef.current >= STABLE_FRAMES_REQUIRED) {
                  phaseRef.current = 'BOTTOM';
                  setPhase('BOTTOM');
                  setGuidance('Deep pushup position reached! Push back UP!');
                  setRejectReason(null);
                  stableUpFramesRef.current = 0;
                  console.log(
                    `[PushupEngine] 🎯 BOTTOM CONFIRMED: angle=${avgAngle?.toFixed(0)}° (<= ${ELBOW_DOWN_THRESHOLD}°), drop=${effectiveDrop.toFixed(0)}px (>= ${requiredMinDrop}px)`
                  );
                }
              } else {
                stableDownFramesRef.current = 0;
                // Specific diagnostic feedback
                if (avgAngle !== null && avgAngle <= ELBOW_DOWN_THRESHOLD && !dropPass) {
                  const r = `Chest drop too small (+${Math.round(effectiveDrop)}px / ${requiredMinDrop}px). Lower your full body!`;
                  setRejectReason(r);
                  setGuidance('Lower your entire body, not just moving arms!');
                } else if (avgAngle !== null && avgAngle > ELBOW_DOWN_THRESHOLD && dropPass) {
                  setGuidance('Bend elbows deeper (under 95°)...');
                } else if (!hipStabilityPass) {
                  const r = 'Hips lifted up! Keep body straight as a rigid plank.';
                  setRejectReason(r);
                  setGuidance('Keep hips flat — do not spike your waist up.');
                }
              }

              // Aborted rep check
              if (avgAngle !== null && avgAngle > 145 && effectiveDrop < 8 && now - descentStartMsRef.current > 400) {
                phaseRef.current = 'READY';
                setPhase('READY');
                setGuidance('Incomplete rep — lower yourself fully.');
              }
            } else if (phaseRef.current === 'BOTTOM') {
              // Waiting for ascent to begin
              if (avgAngle !== null && avgAngle > 115) {
                phaseRef.current = 'GOING_UP';
                setPhase('GOING_UP');
                setGuidance('Pushing back up — fully extend arms!');
                stableUpFramesRef.current = 0;
                console.log('[PushupEngine] ⬆ ASCENT STARTED: Pushing back up');
              }
            } else if (phaseRef.current === 'GOING_UP') {
              // ==============================================================
              // TOP POSITION & REP COMPLETION VALIDATION:
              // 1. Elbow angle extended >= ELBOW_UP_THRESHOLD
              // 2. Shoulders returned back up towards baseline height
              // 3. Minimum rep duration passed (not an instant flicker)
              // 4. Cooldown debounce passed
              // ==============================================================
              const angleUpPass = avgAngle !== null && avgAngle >= ELBOW_UP_THRESHOLD;
              // Shoulders must have ascended at least 60% back towards starting baseline
              const returnPass = effectiveDrop <= Math.max(10, maxDropSeenRef.current * 0.4);
              const repDuration = now - descentStartMsRef.current;
              const durationPass = repDuration >= MIN_REP_DURATION_MS && repDuration <= MAX_REP_DURATION_MS;
              const debouncePass = now - lastRepMsRef.current >= MIN_REP_COOLDOWN_MS;

              if (angleUpPass && returnPass) {
                stableUpFramesRef.current++;
                if (stableUpFramesRef.current >= STABLE_FRAMES_REQUIRED) {
                  if (durationPass && debouncePass) {
                    lastRepMsRef.current = now;
                    stableDownFramesRef.current = 0;
                    stableUpFramesRef.current = 0;
                    // Update baseline to new top position
                    baselineShoulderYRef.current = currentShoulderY;
                    baselineHipYRef.current = currentHipY;
                    countRep();
                  } else {
                    phaseRef.current = 'READY';
                    setPhase('READY');
                    const r = `Rep too fast (${Math.round(repDuration)}ms). Do smooth pushups.`;
                    setRejectReason(r);
                    setGuidance('Rep too fast — perform controlled pushups.');
                  }
                }
              } else {
                stableUpFramesRef.current = 0;
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(drawOverlayAndAnalyze);
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
        } catch (firstErr: any) {
          console.warn('[PushupCamera] Primary camera constraints failed, fallback:', firstErr?.name, firstErr?.message);
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      };

      while (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
        attempts++;
        try {
          console.log(`[PushupCamera] Starting camera (attempt ${attempts}/${maxAttempts})...`);
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
              const playPromise = video.play();
              if (playPromise) {
                playPromise.catch((e) => {
                  console.warn('[PushupCamera] Video play deferred:', e);
                  setTimeout(() => {
                    if (isCurrentEffect && mountedRef.current && video.paused) {
                      video.play().catch(() => {});
                    }
                  }, 400);
                });
              }
            };

            video.onloadedmetadata = tryPlay;
            video.onloadeddata = tryPlay;
            video.oncanplay = tryPlay;
            tryPlay();
          }

          rafRef.current = requestAnimationFrame(drawOverlayAndAnalyze);
          console.log('[PushupCamera] Camera active');
          return;
        } catch (err: any) {
          console.error(`[PushupCamera] Camera attempt ${attempts} failed:`, err);
          if (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else if (isCurrentEffect && mountedRef.current) {
            setCameraError(
              err?.name === 'NotAllowedError'
                ? 'Camera permission denied. Please grant camera access in settings.'
                : err?.name === 'NotReadableError'
                ? 'Camera is in use by another app. Please close other camera apps.'
                : err?.message || 'Camera failed to initialize.'
            );
          }
        }
      }
    };

    initCamera();

    return () => {
      isCurrentEffect = false;
      mountedRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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
        <span>FULL-BODY PUSHUP VERIFICATION</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Do {targetReps} Pushups
      </h2>

      {/* Dynamic guidance message */}
      <p className="text-xs text-theme-subtext max-w-xs mb-2 min-h-[32px] flex items-center justify-center font-medium">
        {guidance}
      </p>

      {/* Real-time Status Badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
        {/* Orientation Badge */}
        <div
          className={`text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 border ${
            orientationStatus === 'HORIZONTAL'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : orientationStatus === 'UPRIGHT'
              ? 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400'
          }`}
        >
          {orientationStatus === 'HORIZONTAL' ? (
            <>
              <CheckCircle2 size={11} /> PLANK VERIFIED
            </>
          ) : orientationStatus === 'UPRIGHT' ? (
            <>
              <AlertCircle size={11} /> BODY UPRIGHT (Sitting/Standing)
            </>
          ) : (
            'SCANNING BODY...'
          )}
        </div>

        {/* Landmarks Status */}
        <div className="text-[10px] px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono">
          {landmarksHud}
        </div>
      </div>

      {/* Video Viewfinder */}
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
            {/* Live Skeleton & Angle Overlay */}
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
              ) : (
                'MULTI-POINT TRACK'
              )}
            </div>
          </div>

          {/* Center Target Box */}
          <div
            className={`self-center w-44 h-24 border rounded-xl flex flex-col items-center justify-center transition-colors ${
              phase === 'BOTTOM'
                ? 'border-green-400 bg-green-500/20'
                : phase === 'GOING_DOWN'
                ? 'border-amber-400 bg-amber-500/20'
                : phase === 'GOING_UP'
                ? 'border-blue-400 bg-blue-500/20'
                : 'border-dashed border-white/30 bg-black/20'
            }`}
          >
            <span className="text-[10px] text-white/90 tracking-wider font-bold uppercase">
              {phase === 'BOTTOM'
                ? '✓ BOTTOM REACHED'
                : phase === 'GOING_DOWN'
                ? '⬇ LOWERING...'
                : phase === 'GOING_UP'
                ? '⬆ PUSHING UP...'
                : orientationStatus === 'UPRIGHT'
                ? '❌ LIE FLAT ON FLOOR'
                : 'PLANK READY'}
            </span>
            <span className="text-[9px] text-white/70 mt-0.5">
              {currentAngle !== null ? `Elbow: ${currentAngle}°` : ''}{' '}
              {shoulderDropPx > 0 ? `| Drop: +${shoulderDropPx}px` : ''}
            </span>
          </div>

          {/* Phase Banner */}
          <div className="w-full text-center text-xs text-white font-bold bg-black/75 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'LOADING_MODEL'
              ? 'LOADING AI MODEL...'
              : phase === 'NOT_IN_POSITION'
              ? orientationStatus === 'UPRIGHT'
                ? '❌ UPRIGHT (Get in horizontal plank)'
                : 'GET IN PLANK POSITION'
              : phase === 'BOTTOM'
              ? 'PUSH BACK UP NOW!'
              : phase === 'GOING_DOWN'
              ? 'KEEP LOWERING CHEST...'
              : phase === 'GOING_UP'
              ? 'EXTEND ARMS FULLY!'
              : phase === 'FINISHED'
              ? 'COMPLETED!'
              : 'READY — LOWER DOWN'}
          </div>
        </div>

        {/* Completion Modal */}
        {isComplete && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in z-20">
            <Check size={52} className="text-green-400 mb-2 animate-bounce" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {targetReps} Pushups Verified
            </span>
          </div>
        )}
      </div>

      {/* Rejection / Diagnostic Warning Banner (Displays in real-time when cheat or wrong form detected) */}
      {rejectReason && (
        <div className="w-full max-w-xs mb-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-medium flex items-center gap-1.5 text-left">
          <AlertCircle size={13} className="shrink-0 text-amber-400" />
          <span className="truncate">{rejectReason}</span>
        </div>
      )}

      {/* Live Debug HUD Details */}
      <div className="w-full max-w-xs bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-2.5 mb-3 text-left font-mono text-[10px] space-y-1">
        <div className="text-neutral-400 font-bold tracking-wider uppercase text-[9px] border-b border-neutral-800 pb-1 mb-1 flex justify-between">
          <span>Real-Time Pushup HUD</span>
          <span className="text-blue-400">MoveNet AI</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Orientation:</span>
          <span
            className={
              orientationStatus === 'HORIZONTAL'
                ? 'text-green-400 font-bold'
                : orientationStatus === 'UPRIGHT'
                ? 'text-red-400 font-bold'
                : 'text-neutral-400'
            }
          >
            {orientationStatus === 'HORIZONTAL'
              ? 'HORIZONTAL ✓'
              : orientationStatus === 'UPRIGHT'
              ? 'UPRIGHT ✗ (Cheat Guard)'
              : 'Scanning...'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Elbow Angle:</span>
          <span className="text-neutral-200">
            {currentAngle !== null ? `${currentAngle}°` : '–'}{' '}
            <span className="text-neutral-500">(Target: &lt;{ELBOW_DOWN_THRESHOLD}° down / &gt;{ELBOW_UP_THRESHOLD}° up)</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Chest/Shoulder Drop:</span>
          <span
            className={
              shoulderDropPx >= minDropTarget
                ? 'text-green-400 font-bold'
                : shoulderDropPx > 5
                ? 'text-amber-400'
                : 'text-neutral-200'
            }
          >
            +{shoulderDropPx}px <span className="text-neutral-500">(Min: {minDropTarget}px)</span>
          </span>
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
