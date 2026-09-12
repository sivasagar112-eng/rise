import React, { useEffect, useRef, useState } from 'react';
import { ModelPreloader } from '../../services/ModelPreloader';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { MapPin, Check, Loader2, AlertTriangle } from 'lucide-react';

interface ObjectMatchCameraViewProps {
  onComplete: () => void;
}

// COCO-SSD valid household targets — only classes that actually exist in COCO's 80-class label set
// and that lite_mobilenet_v2 can reliably detect on mobile.
// Removed: 'sink' (not a COCO class), 'spoon'/'fork'/'toothbrush' (too small for lite model)
const HOUSEHOLD_TARGETS = [
  'cup', 'bottle', 'bowl', 'cell phone', 'remote', 'book', 'clock', 'keyboard', 'mouse', 'laptop'
];

export const ObjectMatchCameraView: React.FC<ObjectMatchCameraViewProps> = ({
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const completedRef = useRef(false);

  // Pick a random target object once on mount
  const [randomTarget] = useState(() => HOUSEHOLD_TARGETS[Math.floor(Math.random() * HOUSEHOLD_TARGETS.length)]);
  const expectedObjects = [randomTarget];

  type Phase = 'INITIALIZING' | 'SCANNING' | 'DETECTED' | 'ERROR';
  const [phase, setPhase] = useState<Phase>('INITIALIZING');
  const [isAiReady, setIsAiReady] = useState(false);
  const [detectedLabel, setDetectedLabel] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [confirmedFrames, setConfirmedFrames] = useState(0);
  const [debugLabels, setDebugLabels] = useState('');  // Real-time debug overlay

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // 1. Load AI model via preloader (near-instant if already preloaded)
  useEffect(() => {
    let mounted = true;
    const loadAi = async () => {
      try {
        console.log('[ObjectMatch] Loading COCO-SSD via ModelPreloader...');
        const model = await ModelPreloader.getCocoSsd();
        if (mounted) {
          modelRef.current = model;
          setIsAiReady(true);
          console.log('[ObjectMatch] COCO-SSD model ready');
        }
      } catch (aiErr: any) {
        console.error('[ObjectMatch] AI Model failed to load:', aiErr);
        if (mounted) {
          setErrorMessage(aiErr.message || 'Failed to load AI model weights.');
          setPhase('ERROR');
        }
      }
    };
    loadAi();
    return () => { mounted = false; };
  }, []);

  // 2. Start/Restart Camera when facingMode changes
  // IMPORTANT: Camera starts independently of AI model loading — user sees live preview immediately
  useEffect(() => {
    let isCurrentEffect = true;
    let mounted = true;

    const startCamera = async () => {
      // Clean up any existing stream before creating a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
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
            stream.getTracks().forEach(t => t.stop());
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
              video.play().catch(e => {
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

          // Move to SCANNING as soon as camera is live (even if AI isn't ready yet)
          setPhase('SCANNING');
          console.log('[ObjectMatch] Camera started — phase=SCANNING');
          return;
        } catch (err: any) {
          console.error(`[ObjectMatch] Camera attempt ${attempts} failed:`, {
            name: err?.name,
            message: err?.message,
          });

          if (attempts < maxAttempts && isCurrentEffect && mounted) {
            await new Promise(resolve => setTimeout(resolve, 500));
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
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode]);

  // AI Detection Loop
  useEffect(() => {
    if (phase !== 'SCANNING') return;
    let confirmed = 0;
    let consecutiveMisses = 0;
    const REQUIRED_FRAMES = 5;
    const MAX_MISSES_BEFORE_RESET = 30; // Reset confirmed count after 30 consecutive misses

    const tick = async () => {
      if (completedRef.current) return;
      const video = videoRef.current;
      const model = modelRef.current;

      if (!video || !model || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      try {
        const predictions = await model.detect(video);

        // Build debug string showing ALL detections
        const allDetections = predictions
          .filter(p => p.score > 0.15) // Show anything above 15% in debug
          .map(p => `${p.class}(${(p.score * 100).toFixed(0)}%)`)
          .join(', ');
        setDebugLabels(allDetections || 'No objects detected');

        // Lower threshold to 0.25 for lite_mobilenet_v2 on mobile
        const match = predictions.find(p =>
          expectedObjects.some(obj =>
            p.class.toLowerCase().includes(obj) || obj.includes(p.class.toLowerCase())
          )
          && p.score > 0.25
        );

        if (match) {
          confirmed++;
          consecutiveMisses = 0;
          setDetectedLabel(match.class);
          setConfirmedFrames(confirmed);
          setScanProgress(Math.min(100, Math.round((confirmed / REQUIRED_FRAMES) * 100)));

          if (confirmed >= REQUIRED_FRAMES && !completedRef.current) {
            completedRef.current = true;
            setPhase('DETECTED');
            setTimeout(() => {
              streamRef.current?.getTracks().forEach(t => t.stop());
              onCompleteRef.current();
            }, 1200);
            return;
          }
        } else {
          consecutiveMisses++;
          // Reset confirmed count after too many consecutive misses (prevents stale half-matches)
          if (consecutiveMisses > MAX_MISSES_BEFORE_RESET && confirmed > 0) {
            confirmed = 0;
            setConfirmedFrames(0);
          }
          setScanProgress(p => Math.max(0, p - 3));
        }
      } catch (_) {
        // silent catch to maintain frame loop
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Global cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (phase === 'ERROR') {
    return (
      <div className="w-full flex flex-col items-center text-center space-y-4 p-4">
        <AlertTriangle size={36} className="text-red-400" />
        <h2 className="text-xl font-bold text-theme-text">Camera / AI Error</h2>
        <p className="text-xs text-theme-subtext max-w-xs break-words">
          {errorMessage || 'Camera access was blocked or the AI model failed to load. Please allow permissions and reload.'}
        </p>
        <button
          onClick={onComplete}
          className="px-6 py-2.5 rounded-2xl bg-blue-500 text-white text-sm font-bold"
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
        <span>SCAVENGER HUNT</span>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-theme-text mb-1">
        {phase === 'DETECTED' ? `Found the ${randomTarget}!` : `Find a ${randomTarget}`}
      </h2>
      <p className="text-xs text-theme-subtext max-w-xs mb-1">
        {phase === 'DETECTED'
          ? `Detected: ${detectedLabel}`
          : 'Move slowly — AI is scanning for objects'
        }
      </p>

      {/* Real-time debug overlay showing all detected labels */}
      {debugLabels && phase === 'SCANNING' && (
        <div className="text-[9px] mb-2 px-3 py-1 rounded-full bg-black/80 text-green-400 font-mono max-w-xs truncate">
          🔍 {debugLabels}
        </div>
      )}

      {/* Camera viewfinder */}
      <div className="relative w-full max-w-xs aspect-4/3 bg-black rounded-2xl border-2 border-theme-border overflow-hidden mb-4 shadow-lg">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
          <div className="flex justify-between items-start w-full">
            <button
              onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
              className="pointer-events-auto p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-md"
              aria-label="Switch Camera"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/></svg>
            </button>
            <div className="text-right text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">
              {confirmedFrames}/{5} confirmed
            </div>
          </div>
          <div className="text-center text-xs font-semibold text-white bg-black/60 backdrop-blur-sm py-1.5 rounded-lg">
            {!isAiReady
              ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> AI warming up...</span>
              : detectedLabel
                ? `Seeing: ${detectedLabel}`
                : `Looking for a ${randomTarget}…`}
          </div>
        </div>

        {phase === 'DETECTED' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
            <Check size={48} className="text-green-400 mb-2" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {randomTarget} Verified!
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-2">
        <div className="flex justify-between text-xs font-medium text-theme-subtext mb-1.5">
          <span>Detection confidence</span>
          <span className="font-bold text-theme-text">{scanProgress}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full border border-theme-border bg-theme-card overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              scanProgress >= 80 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${scanProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
