import React, { useEffect, useRef, useState } from 'react';
import { ModelPreloader } from '../../services/ModelPreloader';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { MapPin, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

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
  const [detectedLabel, setDetectedLabel] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [confirmedFrames, setConfirmedFrames] = useState(0);
  const [debugLabels, setDebugLabels] = useState(''); // Real-time debug overlay

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const isOnline = useNetworkStatus();
  const [isOfflineMode, setIsOfflineMode] = useState(!isOnline);

  const handleRerollTarget = () => {
    setConfirmedFrames(0);
    setScanProgress(0);
    setDetectedLabel('');
    setTargetIndex((prev) => (prev + 1) % HOUSEHOLD_TARGETS.length);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(25);
    }
  };

  // 1. Load AI model via preloader (near-instant if already preloaded)
  useEffect(() => {
    let mounted = true;

    const loadAi = async () => {
      // If offline and model is not yet in memory, route straight to offline verification
      if (!isOnline && !ModelPreloader.isCocoReady() && !modelRef.current) {
        console.log('[ObjectMatch] Device is offline; routing straight to on-device mode');
        if (mounted) {
          setIsOfflineMode(true);
          setIsAiReady(true);
        }
        return;
      }

      try {
        console.log('[ObjectMatch] Loading COCO-SSD via ModelPreloader...');
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model load timeout')), 2500)
        );
        const model = (await Promise.race([ModelPreloader.getCocoSsd(), timeoutPromise])) as any;
        if (mounted) {
          modelRef.current = model;
          setIsOfflineMode(false);
          setIsAiReady(true);
          console.log('[ObjectMatch] COCO-SSD model ready');
        }
      } catch (aiErr: any) {
        console.warn('[ObjectMatch] AI Model loading deferred, active in on-device mode:', aiErr);
        if (mounted) {
          setIsOfflineMode(true);
          setIsAiReady(true);
        }
      }
    };

    loadAi();
    return () => {
      mounted = false;
    };
  }, [isOnline]);

  // 2. Start/Restart Camera when facingMode changes
  useEffect(() => {
    let isCurrentEffect = true;
    let mounted = true;

    const startCamera = async () => {
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

  // 3. AI Detection Loop (Snappy 3-frame confirmation + 0.20 score threshold)
  useEffect(() => {
    if (phase !== 'SCANNING') return;
    let confirmed = 0;
    let consecutiveMisses = 0;
    const REQUIRED_FRAMES = 3;
    const MAX_MISSES_BEFORE_RESET = 25;

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

        // Build debug string showing detections
        const allDetections = predictions
          .filter(p => p.score > 0.15)
          .map(p => `${p.class}(${(p.score * 100).toFixed(0)}%)`)
          .join(', ');
        setDebugLabels(allDetections || 'Scanning for target...');

        const targetSynonyms = currentTargetRef.current.synonyms;
        const match = predictions.find(p => {
          const pName = p.class.toLowerCase();
          return targetSynonyms.some(syn => pName.includes(syn) || syn.includes(pName)) && p.score > 0.20;
        });

        if (match) {
          confirmed++;
          consecutiveMisses = 0;
          setDetectedLabel(match.class);
          setConfirmedFrames(confirmed);
          setScanProgress(Math.min(100, Math.round((confirmed / REQUIRED_FRAMES) * 100)));

          if (confirmed >= REQUIRED_FRAMES && !completedRef.current) {
            completedRef.current = true;
            synth.playSuccessTone();
            setPhase('DETECTED');
            setTimeout(() => {
              streamRef.current?.getTracks().forEach(t => t.stop());
              onCompleteRef.current();
            }, 1000);
            return;
          }
        } else {
          consecutiveMisses++;
          if (consecutiveMisses > MAX_MISSES_BEFORE_RESET && confirmed > 0) {
            confirmed = 0;
            setConfirmedFrames(0);
          }
          setScanProgress(p => Math.max(0, p - 5));
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
        {phase === 'DETECTED' ? `Found the ${currentTarget.name}!` : `Find a ${currentTarget.name}`}
      </h2>

      {/* Target item indicator & Try Another Object button */}
      {phase === 'SCANNING' && (
        <button
          type="button"
          onClick={handleRerollTarget}
          className="mb-2 px-3 py-1 rounded-full bg-theme-card border border-theme-border text-xs font-semibold text-blue-400 hover:text-blue-300 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
        >
          <RefreshCw size={12} />
          <span>Try Another Object</span>
        </button>
      )}

      <p className="text-xs text-theme-subtext max-w-xs mb-1">
        {phase === 'DETECTED'
          ? `Detected: ${detectedLabel}`
          : 'Hold camera steady on the object'
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

        {/* Center Target Crosshair / Reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-36 h-36 border-2 border-dashed rounded-2xl transition-all duration-200 flex items-center justify-center ${
              confirmedFrames > 0
                ? 'border-green-400 scale-105 bg-green-500/10 shadow-lg shadow-green-500/20'
                : 'border-white/30'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${confirmedFrames > 0 ? 'bg-green-400 animate-ping' : 'bg-white/40'}`} />
          </div>
        </div>

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
              {confirmedFrames}/3 confirmed
            </div>
          </div>
          <div className="text-center text-xs font-semibold text-white bg-black/60 backdrop-blur-sm py-1.5 rounded-lg">
            {!isAiReady
              ? <span className="flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> AI warming up...</span>
              : isOfflineMode
                ? `⚡ On-Device Mode: Scan ${currentTarget.name}`
                : detectedLabel
                  ? `Seeing: ${detectedLabel}`
                  : `Looking for ${currentTarget.name}…`}
          </div>
        </div>

        {phase === 'DETECTED' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
            <Check size={48} className="text-green-400 mb-2" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              {currentTarget.name} Verified!
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

      {/* Action Buttons: Reroll & Manual Verification */}
      <div className="flex items-center space-x-2 mt-2">
        <button
          onClick={handleRerollTarget}
          className="text-xs font-medium py-1.5 px-3 rounded-xl border border-theme-border bg-theme-card hover:opacity-80 active:scale-95 text-theme-subtext transition-all flex items-center space-x-1"
        >
          <RefreshCw size={12} />
          <span>Different Item</span>
        </button>

        <button
          onClick={() => {
            if (!completedRef.current) {
              completedRef.current = true;
              setPhase('DETECTED');
              setTimeout(() => {
                streamRef.current?.getTracks().forEach((t) => t.stop());
                onCompleteRef.current();
              }, 600);
            }
          }}
          className="text-xs font-semibold py-1.5 px-3 rounded-xl border border-theme-border bg-theme-card hover:opacity-80 active:scale-95 text-theme-text transition-all flex items-center space-x-1 shadow-sm"
        >
          <Check size={12} className="text-green-400" />
          <span>Found Item (Verify)</span>
        </button>
      </div>
    </div>
  );
};
