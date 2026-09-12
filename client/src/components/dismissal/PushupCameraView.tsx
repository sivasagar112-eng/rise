import React, { useEffect, useRef, useState, useCallback } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { PoseDetectionEngine, Keypoint, PoseResult } from '../../services/PoseDetectionEngine';
import { Dumbbell, RefreshCw, Check, FlipHorizontal, ShieldAlert, Loader2 } from 'lucide-react';

interface PushupCameraViewProps {
  targetReps: number;
  onComplete: () => void;
}

type PushupPhase = 'LOADING_MODEL' | 'READY' | 'DOWN' | 'UP' | 'FINISHED';

// Pushup detection thresholds
const ELBOW_DOWN_ANGLE = 110;   // Below this = arms bent (pushup down position)
const ELBOW_UP_ANGLE = 150;     // Above this = arms extended (pushup up position)
const MIN_REP_INTERVAL_MS = 600; // Minimum time between two counted reps

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

  // Pushup tracking refs
  const phaseRef = useRef<PushupPhase>('LOADING_MODEL');
  const repsRef = useRef(0);
  const lastRepMsRef = useRef<number>(0);
  const stableDownFramesRef = useRef(0);  // # consecutive frames in DOWN position
  const stableUpFramesRef = useRef(0);    // # consecutive frames in UP position

  // UI state
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<PushupPhase>('LOADING_MODEL');
  const [guidance, setGuidance] = useState('Loading AI model...');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isComplete, setIsComplete] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [modelReady, setModelReady] = useState(PoseDetectionEngine.isReady());

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const targetRepsRef = useRef(targetReps);
  useEffect(() => {
    targetRepsRef.current = targetReps;
  }, [targetReps]);

  // Flip front/rear camera
  const handleToggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Manual rep increment fallback
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

  // Count a rep
  const countRep = useCallback(() => {
    repsRef.current += 1;
    setReps(repsRef.current);
    synth.playRepChirp();

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
      setGuidance(`Rep ${repsRef.current} counted! Go down again...`);
    }
  }, []);

  // Load MoveNet model
  useEffect(() => {
    let mounted = true;
    const loadModel = async () => {
      try {
        console.log('[PushupCamera] Loading MoveNet model...');
        await PoseDetectionEngine.getDetector();
        if (mounted) {
          setModelReady(true);
          phaseRef.current = 'READY';
          setPhase('READY');
          setGuidance('Position phone so upper body is visible. Get in plank position!');
          console.log('[PushupCamera] MoveNet model ready');
        }
      } catch (err: any) {
        console.error('[PushupCamera] Failed to load MoveNet:', err);
        if (mounted) {
          setGuidance('AI model failed to load. Use manual count.');
        }
      }
    };
    loadModel();
    return () => { mounted = false; };
  }, []);

  // Camera + detection loop
  useEffect(() => {
    let isCurrentEffect = true;
    mountedRef.current = true;

    // Reset tracking state for camera flip
    stableDownFramesRef.current = 0;
    stableUpFramesRef.current = 0;

    const drawOverlayAndAnalyze = async () => {
      if (!mountedRef.current || completedRef.current || !isCurrentEffect) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

      // Force play if Android WebView paused it
      if (video && video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }

      if (video && canvas && video.readyState >= 2 && modelReady) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Set canvas to match video dimensions
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Run pose detection
          const result: PoseResult | null = await PoseDetectionEngine.detectPose(video);

          if (result && isCurrentEffect && mountedRef.current) {
            // Draw skeleton overlay
            PoseDetectionEngine.drawPose(
              ctx,
              result.keypoints,
              canvas.width,
              canvas.height,
              video.videoWidth,
              video.videoHeight
            );

            // Draw elbow angle labels on the overlay
            const drawAngleLabel = (kp: Keypoint, angle: number | null) => {
              if (angle !== null && (kp.score ?? 0) > 0.2) {
                const x = (kp.x / video.videoWidth) * canvas.width;
                const y = (kp.y / video.videoHeight) * canvas.height;
                ctx.fillStyle = angle < ELBOW_DOWN_ANGLE ? '#00ff00' : (angle > ELBOW_UP_ANGLE ? '#00ccff' : '#ffaa00');
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText(`${Math.round(angle)}°`, x + 8, y - 8);
              }
            };

            // Draw angle labels at elbow positions
            drawAngleLabel(result.keypoints[7], result.leftElbowAngle);
            drawAngleLabel(result.keypoints[8], result.rightElbowAngle);

            // Build debug string
            const avgAngle = result.avgElbowAngle;
            let debugStr = '';
            if (result.isBodyVisible && avgAngle !== null) {
              debugStr = `Angle: ${Math.round(avgAngle)}° | Conf: ${(result.confidence * 100).toFixed(0)}%`;
            } else {
              debugStr = `Body: ${result.isBodyVisible ? 'YES' : 'NO'} | Conf: ${(result.confidence * 100).toFixed(0)}%`;
            }
            setDebugInfo(debugStr);

            // === PUSHUP STATE MACHINE ===
            if (phaseRef.current !== 'LOADING_MODEL' && phaseRef.current !== 'FINISHED') {
              if (!result.isBodyVisible) {
                setGuidance('Position phone so your upper body and arms are visible');
              } else if (avgAngle !== null) {
                const now = performance.now();

                if (phaseRef.current === 'READY' || phaseRef.current === 'UP') {
                  // Waiting for user to go DOWN
                  if (avgAngle < ELBOW_DOWN_ANGLE) {
                    stableDownFramesRef.current++;
                    // Require 3 consecutive frames to confirm down position
                    if (stableDownFramesRef.current >= 3) {
                      phaseRef.current = 'DOWN';
                      setPhase('DOWN');
                      setGuidance('Arms bent! Now push back UP!');
                      stableUpFramesRef.current = 0;
                    }
                  } else {
                    stableDownFramesRef.current = 0;
                    if (phaseRef.current === 'READY') {
                      setGuidance('Lower yourself — bend your elbows!');
                    }
                  }
                } else if (phaseRef.current === 'DOWN') {
                  // Waiting for user to come back UP
                  if (avgAngle > ELBOW_UP_ANGLE) {
                    stableUpFramesRef.current++;
                    // Require 3 consecutive frames to confirm up position
                    if (stableUpFramesRef.current >= 3) {
                      // Check minimum interval between reps
                      if (now - lastRepMsRef.current >= MIN_REP_INTERVAL_MS) {
                        lastRepMsRef.current = now;
                        stableDownFramesRef.current = 0;
                        stableUpFramesRef.current = 0;
                        countRep();
                      }
                    }
                  } else {
                    stableUpFramesRef.current = 0;
                    if (avgAngle < ELBOW_DOWN_ANGLE) {
                      setGuidance('Holding... now push UP!');
                    } else {
                      setGuidance('Keep pushing up — extend your arms!');
                    }
                  }
                }
              }
            }
          } else {
            // No pose result — clear debug
            if (modelReady) {
              setDebugInfo('No body detected');
              setGuidance('Position your phone so your upper body is in frame');
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(drawOverlayAndAnalyze);
    };

    const initCamera = async () => {
      setCameraError(null);

      // Clean up any existing stream
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
          console.warn('[PushupCamera] Primary constraints failed, fallback:', firstErr?.name, firstErr?.message);
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      };

      while (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
        attempts++;
        try {
          console.log(`[PushupCamera] Camera attempt ${attempts}/${maxAttempts}...`);
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
                  console.warn('[PushupCamera] Play deferred:', e);
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

          // Start the detection loop
          rafRef.current = requestAnimationFrame(drawOverlayAndAnalyze);
          console.log('[PushupCamera] Camera started successfully');
          return;
        } catch (err: any) {
          console.error(`[PushupCamera] Camera attempt ${attempts} failed:`, {
            name: err?.name,
            message: err?.message,
          });

          if (attempts < maxAttempts && isCurrentEffect && mountedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else if (isCurrentEffect && mountedRef.current) {
            setCameraError(
              err?.name === 'NotAllowedError'
                ? 'Camera permission denied. Please grant camera access in app settings.'
                : err?.name === 'NotReadableError'
                ? 'Camera is in use by another app. Please try again.'
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
      <p className="text-xs text-theme-subtext max-w-xs mb-2 min-h-[32px] flex items-center justify-center">
        {guidance}
      </p>

      <div className="text-[10px] mb-2 px-3 py-1 rounded-full border border-theme-border bg-theme-card text-theme-subtext font-semibold">
        🤖 AI Pose Detection {modelReady ? '✓' : '⏳'}
      </div>

      {/* Debug info bar */}
      {debugInfo && (
        <div className="text-[10px] mb-2 px-3 py-1 rounded-full bg-black/80 text-green-400 font-mono">
          {debugInfo}
        </div>
      )}

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
            {/* Skeleton overlay canvas */}
            <canvas
              ref={overlayCanvasRef}
              className={`absolute inset-0 w-full h-full pointer-events-none ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
              style={{ objectFit: 'cover' }}
            />
          </>
        )}

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
                'POSE ACTIVE'
              )}
            </div>
          </div>

          <div
            className={`self-center w-40 h-24 border rounded-xl flex flex-col items-center justify-center transition-colors ${
              phase === 'DOWN'
                ? 'border-green-400 bg-green-500/20'
                : phase === 'UP'
                ? 'border-blue-400 bg-blue-500/20'
                : 'border-dashed border-white/40 bg-black/20'
            }`}
          >
            <span className="text-[10px] text-white/80 tracking-wider font-semibold uppercase">
              {phase === 'DOWN' ? '⬇ ARMS BENT' : phase === 'UP' ? '⬆ ARMS EXTENDED' : 'BODY POSITION'}
            </span>
            <span className="text-[9px] text-white/60">
              {phase === 'DOWN' ? 'Now push up!' : phase === 'UP' ? 'Go down again!' : 'Waiting for motion...'}
            </span>
          </div>

          <div className="w-full text-center text-xs text-white font-bold bg-black/70 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {phase === 'LOADING_MODEL'
              ? 'LOADING AI MODEL...'
              : phase === 'DOWN'
              ? 'PUSH BACK UP!'
              : phase === 'UP'
              ? 'LOWER YOURSELF!'
              : phase === 'FINISHED'
              ? 'COMPLETED!'
              : 'READY — LOWER DOWN'}
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
