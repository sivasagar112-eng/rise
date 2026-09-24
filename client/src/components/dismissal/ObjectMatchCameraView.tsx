import React, { useEffect, useRef, useState } from 'react';
import { ModelPreloader } from '../../services/ModelPreloader';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { MapPin, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';

interface ObjectMatchCameraViewProps {
  onComplete: () => void;
}

interface TargetItem {
  id: string;
  name: string;
  synonyms: string[];
  emoji: string;
}

// Expanded household targets with synonym mappings for maximum mobile reliability
const HOUSEHOLD_TARGETS: TargetItem[] = [
  { id: 'bottle', name: 'Bottle / Drink', synonyms: ['bottle', 'cup', 'wine glass'], emoji: '🍶' },
  { id: 'cup', name: 'Cup / Mug', synonyms: ['cup', 'mug', 'cup/mug', 'glass', 'wine glass', 'bottle'], emoji: '☕' },
  { id: 'cell phone', name: 'Phone', synonyms: ['cell phone', 'phone', 'remote'], emoji: '📱' },
  { id: 'book', name: 'Book / Notebook', synonyms: ['book', 'notebook'], emoji: '📖' },
  { id: 'remote', name: 'Remote Control', synonyms: ['remote', 'cell phone'], emoji: '📺' },
  { id: 'clock', name: 'Clock / Watch', synonyms: ['clock'], emoji: '⏰' },
  { id: 'chair', name: 'Chair / Bed', synonyms: ['chair', 'couch', 'bed'], emoji: '🪑' },
  { id: 'laptop', name: 'Laptop / Computer', synonyms: ['laptop', 'keyboard', 'tv'], emoji: '💻' },
  { id: 'bowl', name: 'Bowl / Plate', synonyms: ['bowl'], emoji: '🥣' },
  { id: 'backpack', name: 'Backpack / Bag', synonyms: ['backpack', 'handbag', 'suitcase'], emoji: '🎒' },
];

export const ObjectMatchCameraView: React.FC<ObjectMatchCameraViewProps> = ({
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const completedRef = useRef(false);

  // Target object state with support for re-rolling
  const [targetIndex, setTargetIndex] = useState(() => Math.floor(Math.random() * HOUSEHOLD_TARGETS.length));
  const currentTarget = HOUSEHOLD_TARGETS[targetIndex];
  const currentTargetRef = useRef(currentTarget);
  useEffect(() => {
    currentTargetRef.current = currentTarget;
  }, [currentTarget]);

  type Phase = 'INITIALIZING' | 'SCANNING' | 'DETECTED' | 'ERROR';
  const [phase, setPhase] = useState<Phase>('INITIALIZING');
  const [isAiReady, setIsAiReady] = useState(false);
  const [liveConfidence, setLiveConfidence] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [targetInView, setTargetInView] = useState(false);
  const [debugLabels, setDebugLabels] = useState(''); // Real-time debug overlay

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const handleRerollTarget = () => {
    setScanProgress(0);
    setLiveConfidence(0);
    setTargetInView(false);
    setTargetIndex((prev) => (prev + 1) % HOUSEHOLD_TARGETS.length);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(25);
    }
  };

  // 1. Load AI model via preloader from local bundled assets
  useEffect(() => {
    let mounted = true;

    const loadAi = async () => {
      try {
        console.log('[ObjectMatch] Loading bundled COCO-SSD via ModelPreloader...');
        const model = await ModelPreloader.getCocoSsd();
        if (mounted) {
          modelRef.current = model;
          setIsAiReady(true);
          console.log('[ObjectMatch] COCO-SSD model ready for real-time offline detection');
        }
      } catch (aiErr: any) {
        console.error('[ObjectMatch] Error loading COCO-SSD model:', aiErr);
        if (mounted) {
          setErrorMessage('Failed to initialize on-device object detector.');
          setPhase('ERROR');
        }
      }
    };

    loadAi();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Start/Restart Camera when facingMode changes
  useEffect(() => {
    let isCurrentEffect = true;
    let mounted = true;

    const startCamera = async () => {
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
        } catch (firstErr: any) {
          console.warn('[ObjectMatch] Primary camera constraints failed, trying fallback:', firstErr?.name, firstErr?.message);
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      };

      while (attempts < maxAttempts && isCurrentEffect && mounted) {
        attempts++;
        try {
          console.log(`[ObjectMatch] Camera attempt ${attempts}/${maxAttempts}...`);
          const stream = await attemptGetUserMedia();

          if (!isCurrentEffect || !mounted) {
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
                console.warn('[ObjectMatch] Video play deferred:', e);
                setTimeout(() => {
                  if (isCurrentEffect && mounted && video.paused) {
                    video.play().catch(() => {});
                  }
                }, 400);
              });
            };

            video.onloadedmetadata = tryPlay;
            video.onloadeddata = tryPlay;
            video.oncanplay = tryPlay;
            tryPlay();
          }

          setPhase('SCANNING');
          console.log('[ObjectMatch] Camera started — phase=SCANNING');
          return;
        } catch (err: any) {
          console.error(`[ObjectMatch] Camera attempt ${attempts} failed:`, {
            name: err?.name,
            message: err?.message,
          });

          if (attempts < maxAttempts && isCurrentEffect && mounted) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else if (isCurrentEffect && mounted) {
            setErrorMessage(
              err?.name === 'NotAllowedError'
                ? 'Camera permission denied. Please enable camera access.'
                : err?.name === 'NotReadableError'
                ? 'Camera hardware busy. Please retry.'
                : err?.message || 'Camera access was blocked.'
            );
            setPhase('ERROR');
          }
        }
      }
    };

    startCamera();
    return () => {
      isCurrentEffect = false;
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode]);

  // 3. AI Detection & Bounding Box Loop with Auto-Confirmation
  useEffect(() => {
    if (phase !== 'SCANNING') return;
    let confirmed = 0;
    let consecutiveMisses = 0;
    const REQUIRED_FRAMES = 10; // Auto-confirm after 10 sustained matching frames
    const MAX_MISSES_BEFORE_RESET = 15;

    const tick = async () => {
      if (completedRef.current) return;
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const model = modelRef.current;

      if (!video || !model || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      try {
        const predictions = await model.detect(video, 10, 0.25);

        // Resize overlay canvas to match video stream dimensions
        if (canvas) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const scaleX = canvas.width / (video.videoWidth || 1);
            const scaleY = canvas.height / (video.videoHeight || 1);

            const targetSynonyms = currentTargetRef.current.synonyms;
            let targetFoundInFrame = false;
            let highestTargetScore = 0;

            // Draw bounding boxes for all detected objects
            for (const pred of predictions) {
              const pName = pred.class.toLowerCase();
              const isTargetMatch = targetSynonyms.some(
                (syn) => pName === syn || pName.includes(syn) || syn.includes(pName)
              );

              const [bx, by, bw, bh] = pred.bbox;
              const x = bx * scaleX;
              const y = by * scaleY;
              const w = bw * scaleX;
              const h = bh * scaleY;
              const scorePercent = Math.round(pred.score * 100);

              if (isTargetMatch) {
                targetFoundInFrame = true;
                if (pred.score > highestTargetScore) {
                  highestTargetScore = pred.score;
                }

                // Bright Green Highlight for Target Object
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3.5;
                ctx.shadowColor = 'rgba(34, 197, 94, 0.6)';
                ctx.shadowBlur = 8;
                ctx.strokeRect(x, y, w, h);
                ctx.shadowBlur = 0;

                // Label pill above target box
                const labelText = `${currentTargetRef.current.name} (${scorePercent}%)`;
                ctx.font = 'bold 13px system-ui, sans-serif';
                const textWidth = ctx.measureText(labelText).width;
                const pillHeight = 22;
                const pillY = Math.max(0, y - pillHeight - 4);

                ctx.fillStyle = '#22c55e';
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(x, pillY, textWidth + 14, pillHeight, 6) : ctx.rect(x, pillY, textWidth + 14, pillHeight);
                ctx.fill();

                ctx.fillStyle = '#000000';
                ctx.fillText(labelText, x + 7, pillY + 15);
              } else if (pred.score > 0.40) {
                // Subtle frame for background/unmatched objects
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, y, w, h);

                const labelText = `${pred.class} ${scorePercent}%`;
                ctx.font = '10px system-ui, sans-serif';
                const textWidth = ctx.measureText(labelText).width;
                const pillHeight = 16;
                const pillY = Math.max(0, y - pillHeight - 2);

                ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(x, pillY, textWidth + 8, pillHeight, 4) : ctx.rect(x, pillY, textWidth + 8, pillHeight);
                ctx.fill();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillText(labelText, x + 4, pillY + 11);
              }
            }

            // Update live target status
            setTargetInView(targetFoundInFrame);
            if (targetFoundInFrame) {
              const liveScorePercent = Math.round(highestTargetScore * 100);
              setLiveConfidence(liveScorePercent);

              // Increment confirmation frames faster if confidence is high
              const increment = highestTargetScore >= 0.75 ? 2 : 1;
              confirmed += increment;
              consecutiveMisses = 0;
              setScanProgress(Math.min(100, Math.round((confirmed / REQUIRED_FRAMES) * 100)));

              // AUTO-CONFIRMATION when threshold is met!
              if (confirmed >= REQUIRED_FRAMES && !completedRef.current) {
                completedRef.current = true;
                synth.playSuccessTone();
                setPhase('DETECTED');
                setTimeout(() => {
                  streamRef.current?.getTracks().forEach((t) => t.stop());
                  onCompleteRef.current();
                }, 1000);
                return;
              }
            } else {
              consecutiveMisses++;
              if (consecutiveMisses > MAX_MISSES_BEFORE_RESET && confirmed > 0) {
                confirmed = Math.max(0, confirmed - 1);
              }
              setLiveConfidence(0);
              setScanProgress((p) => Math.max(0, p - 3));
            }

            // Real-time debug labels
            const allDetections = predictions
              .filter((p) => p.score > 0.25)
              .map((p) => `${p.class}(${Math.round(p.score * 100)}%)`)
              .join(', ');
            setDebugLabels(allDetections || 'Scanning viewfinder...');
          }
        }
      } catch (_) {
        // maintain frame loop on transient error
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // Global cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (phase === 'ERROR') {
    return (
      <div className="w-full flex flex-col items-center text-center space-y-4 p-4">
        <AlertTriangle size={36} className="text-red-400" />
        <h2 className="text-xl font-bold text-theme-text">Camera / AI Error</h2>
        <p className="text-xs text-theme-subtext max-w-xs break-words">
          {errorMessage || 'Camera access was blocked or the on-device AI failed to load. Please allow camera permissions.'}
        </p>
        <button
          onClick={onComplete}
          className="px-6 py-2.5 rounded-2xl bg-blue-500 text-white text-sm font-bold active:scale-95 transition-all shadow-md"
        >
          Skip &amp; Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <MapPin size={14} className="text-blue-500" />
        <span>SCAVENGER HUNT (ON-DEVICE AI)</span>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-theme-text mb-1">
        {phase === 'DETECTED' ? `Found the ${currentTarget.name}!` : `Find a ${currentTarget.name}`}
      </h2>

      {/* Target item indicator & Try Another Object button */}
      {phase === 'SCANNING' && (
        <button
          type="button"
          onClick={handleRerollTarget}
          className="mb-2 px-3.5 py-1.5 rounded-full bg-theme-card border border-theme-border text-xs font-semibold text-blue-400 hover:text-blue-300 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
        >
          <RefreshCw size={12} />
          <span>Try Another Object</span>
        </button>
      )}

      <p className="text-xs text-theme-subtext max-w-xs mb-1 font-medium">
        {phase === 'DETECTED' ? (
          <span className="text-green-400 font-bold">{currentTarget.name} Verified ✓</span>
        ) : targetInView ? (
          <span className="text-green-400 font-bold">{currentTarget.name} detected! Hold steady...</span>
        ) : (
          'Point camera at the object to auto-verify'
        )}
      </p>

      {/* Real-time debug overlay showing all detected labels */}
      {debugLabels && phase === 'SCANNING' && (
        <div className="text-[9px] mb-2 px-3 py-1 rounded-full bg-black/80 text-green-400 font-mono max-w-xs truncate">
          🔍 {debugLabels}
        </div>
      )}

      {/* Camera viewfinder with real-time bounding box overlay */}
      <div className="relative w-full max-w-xs aspect-4/3 bg-black rounded-2xl border-2 border-theme-border overflow-hidden mb-3 shadow-lg">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        {/* Real-time bounding box canvas overlay */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none object-cover"
        />

        {/* Center Target Crosshair / Reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-36 h-36 border-2 border-dashed rounded-2xl transition-all duration-200 flex items-center justify-center ${
              targetInView
                ? 'border-green-400 scale-105 bg-green-500/10 shadow-lg shadow-green-500/20'
                : 'border-white/25'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${targetInView ? 'bg-green-400 animate-ping' : 'bg-white/30'}`} />
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
          <div className="flex justify-between items-start w-full">
            <button
              onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              className="pointer-events-auto p-2 bg-black/60 hover:bg-black/80 active:scale-95 rounded-full text-white transition-all backdrop-blur-md"
              aria-label="Switch Camera"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/></svg>
            </button>
            <div className="text-right text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded-full backdrop-blur-md border border-white/10">
              {targetInView ? `${liveConfidence}% match` : 'Searching...'}
            </div>
          </div>
          <div className="text-center text-xs font-semibold text-white bg-black/70 backdrop-blur-sm py-1.5 px-3 rounded-xl border border-white/10">
            {!isAiReady ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Loading On-Device Detector...
              </span>
            ) : targetInView ? (
              <span className="text-green-400 font-bold">
                ✓ {currentTarget.name} detected ({liveConfidence}%)
              </span>
            ) : (
              `Looking for ${currentTarget.name}…`
            )}
          </div>
        </div>

        {phase === 'DETECTED' && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in z-20">
            <Check size={52} className="text-green-400 mb-2 animate-bounce" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {currentTarget.name} Verified!
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-3">
        <div className="flex justify-between text-xs font-medium text-theme-subtext mb-1.5">
          <span>Verification progress</span>
          <span className="font-bold text-theme-text font-tabular">{scanProgress}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full border border-theme-border bg-theme-card overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${
              scanProgress >= 80 ? 'bg-green-500 shadow-glow' : 'bg-blue-500'
            }`}
            style={{ width: `${scanProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
