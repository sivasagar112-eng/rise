import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ModelPreloader } from '../../services/ModelPreloader';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { Check, RefreshCw, FlipHorizontal, Camera, Sun, Loader2, AlertCircle } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';

interface ObjectMatchCameraViewProps {
  onComplete: () => void;
}

interface TargetItem {
  id: string;
  name: string;
  subtitle: string;
  synonyms: string[];
  renderIcon: () => React.ReactNode;
}

// ── 3D Isometric Vector Illustrations (Erly App Style) ──

const Fridge3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <path d="M35 15 L75 22 L75 85 L35 78 Z" fill="#E2E8F0" />
    <path d="M15 28 L35 15 L35 78 L15 90 Z" fill="#CBD5E1" />
    <path d="M15 28 L55 35 L75 22 L35 15 Z" fill="#F8FAFC" />
    <path d="M15 28 L-2 42 L-2 88 L15 90 Z" fill="#94A3B8" />
    <path d="M-2 42 L22 47 L22 84 L-2 88 Z" fill="#E2E8F0" />
    <rect x="38" y="27" width="34" height="5" rx="1.5" fill="#93C5FD" opacity="0.7" />
    <rect x="38" y="44" width="34" height="5" rx="1.5" fill="#93C5FD" opacity="0.7" />
    <rect x="38" y="62" width="34" height="5" rx="1.5" fill="#93C5FD" opacity="0.7" />
    <rect x="40" y="21" width="6" height="10" rx="1" fill="#3B82F6" />
    <rect x="48" y="19" width="7" height="12" rx="1.5" fill="#F97316" />
    <rect x="57" y="22" width="6" height="9" rx="1" fill="#10B981" />
    <circle cx="43" cy="40" r="3.5" fill="#EF4444" />
    <circle cx="51" cy="40" r="3.5" fill="#84CC16" />
    <circle cx="59" cy="40" r="4" fill="#EAB308" />
    <circle cx="67" cy="40" r="3" fill="#EC4899" />
    <rect x="40" y="69" width="30" height="8" rx="2" fill="#60A5FA" opacity="0.5" />
    <circle cx="48" cy="73" r="2.5" fill="#F97316" />
    <circle cx="56" cy="73" r="2.5" fill="#22C55E" />
    <rect x="2" y="55" width="3" height="14" rx="1.5" fill="#64748B" />
  </svg>
);

const Sink3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <rect x="32" y="10" width="36" height="36" rx="18" fill="#93C5FD" stroke="#E2E8F0" strokeWidth="3" />
    <path d="M40 18 L58 36" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
    <path d="M22 55 L78 55 L72 88 L28 88 Z" fill="#475569" />
    <rect x="18" y="50" width="64" height="8" rx="3" fill="#F1F5F9" />
    <ellipse cx="50" cy="54" rx="20" ry="7" fill="#CBD5E1" />
    <ellipse cx="50" cy="55" rx="15" ry="4" fill="#38BDF8" opacity="0.6" />
    <path d="M50 44 L50 36 Q50 31 55 31 L56 31" stroke="#94A3B8" strokeWidth="3.5" strokeLinecap="round" />
    <ellipse cx="56" cy="38" rx="1.5" ry="2.5" fill="#38BDF8" />
    <rect x="70" y="42" width="6" height="9" rx="1.5" fill="#EC4899" />
    <rect x="72" y="39" width="4" height="3" fill="#94A3B8" />
  </svg>
);

const Mug3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <ellipse cx="50" cy="76" rx="36" ry="10" fill="#E2E8F0" />
    <ellipse cx="50" cy="75" rx="26" ry="7" fill="#CBD5E1" />
    <path d="M26 38 L29 70 Q29 74 38 74 L62 74 Q71 74 71 70 L74 38 Z" fill="#3B82F6" />
    <ellipse cx="50" cy="38" rx="24" ry="7" fill="#78350F" />
    <ellipse cx="50" cy="38" rx="18" ry="4.5" fill="#92400E" />
    <path d="M72 44 Q85 44 85 55 Q85 66 71 66" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" fill="none" />
    <path d="M42 28 Q45 22 41 16 Q38 12 42 6" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" opacity="0.8" />
    <path d="M52 26 Q56 20 52 14 Q49 10 53 4" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" opacity="0.9" />
    <path d="M60 29 Q63 23 59 17 Q56 13 60 7" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" opacity="0.7" />
  </svg>
);

const Toothbrush3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <path d="M35 50 L40 85 L60 85 L65 50 Z" fill="#F1F5F9" />
    <ellipse cx="50" cy="50" rx="15" ry="4" fill="#CBD5E1" />
    <rect x="42" y="16" width="6" height="50" rx="3" fill="#10B981" transform="rotate(-15 45 40)" />
    <rect x="36" y="10" width="8" height="14" rx="2" fill="#E2E8F0" transform="rotate(-15 45 40)" />
    <rect x="35" y="12" width="4" height="10" rx="1" fill="#3B82F6" transform="rotate(-15 45 40)" />
    <path d="M54 28 L62 25 L68 65 L60 68 Z" fill="#38BDF8" />
    <rect x="53" y="24" width="8" height="4" rx="1" fill="#EF4444" transform="rotate(-18 57 26)" />
    <path d="M26 22 L28 16 L30 22 L36 24 L30 26 L28 32 L26 26 L20 24 Z" fill="#FBBF24" />
  </svg>
);

const Book3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <path d="M16 68 Q50 62 50 62 Q50 62 84 68 L84 74 Q50 68 50 68 Q50 68 16 74 Z" fill="#1E293B" />
    <path d="M18 36 Q50 32 50 32 L50 66 Q50 66 18 70 Z" fill="#F8FAFC" />
    <path d="M50 32 Q82 36 82 36 L82 70 Q50 66 50 66 Z" fill="#F1F5F9" />
    <line x1="50" y1="31" x2="50" y2="67" stroke="#94A3B8" strokeWidth="2" />
    <path d="M50 32 Q52 46 56 56 L60 52 L64 58 Q54 48 50 32 Z" fill="#EF4444" />
    <line x1="24" y1="42" x2="42" y2="40" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="48" x2="40" y2="46" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="54" x2="36" y2="52" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="58" y1="42" x2="76" y2="44" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="58" y1="48" x2="74" y2="50" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const Chair3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <path d="M28 20 L72 20 L70 54 L30 54 Z" fill="#3B82F6" />
    <rect x="22" y="52" width="56" height="14" rx="4" fill="#2563EB" />
    <line x1="28" y1="66" x2="24" y2="90" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" />
    <line x1="72" y1="66" x2="76" y2="90" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" />
    <line x1="36" y1="66" x2="33" y2="86" stroke="#475569" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="64" y1="66" x2="67" y2="86" stroke="#475569" strokeWidth="3.5" strokeLinecap="round" />
    <ellipse cx="50" cy="59" rx="20" ry="4" fill="#60A5FA" opacity="0.6" />
  </svg>
);

const Plant3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    <path d="M34 56 L66 56 L61 88 L39 88 Z" fill="#EA580C" />
    <rect x="31" y="51" width="38" height="6" rx="2" fill="#F97316" />
    <path d="M50 51 Q50 30 32 24 Q44 40 48 51 Z" fill="#22C55E" />
    <path d="M50 51 Q50 26 68 20 Q56 38 52 51 Z" fill="#16A34A" />
    <path d="M50 51 Q48 18 50 12 Q52 18 50 51 Z" fill="#4ADE80" />
    <circle cx="50" cy="12" r="3" fill="#FBBF24" />
  </svg>
);

// ── Target Destinations with Precise COCO-SSD Class Match Mapping ──
const TARGET_DESTINATIONS: TargetItem[] = [
  {
    id: 'fridge',
    name: 'Inside of Fridge',
    subtitle: '☼ Rise',
    synonyms: ['refrigerator', 'bottle', 'cup', 'bowl', 'apple', 'orange', 'banana', 'sandwich', 'broccoli', 'carrot', 'pizza', 'donut', 'cake', 'microwave', 'oven', 'toaster'],
    renderIcon: () => <Fridge3DIcon />,
  },
  {
    id: 'sink',
    name: 'Bathroom Sink',
    subtitle: '☼ Rise',
    synonyms: ['sink', 'toilet', 'toothbrush', 'hair drier'],
    renderIcon: () => <Sink3DIcon />,
  },
  {
    id: 'cup',
    name: 'Kitchen Mug',
    subtitle: '☼ Rise',
    synonyms: ['cup', 'wine glass', 'bottle', 'bowl'],
    renderIcon: () => <Mug3DIcon />,
  },
  {
    id: 'toothbrush',
    name: 'Toothbrush',
    subtitle: '☼ Rise',
    synonyms: ['toothbrush', 'sink'],
    renderIcon: () => <Toothbrush3DIcon />,
  },
  {
    id: 'book',
    name: 'Book / Notebook',
    subtitle: '☼ Rise',
    synonyms: ['book', 'laptop'],
    renderIcon: () => <Book3DIcon />,
  },
  {
    id: 'chair',
    name: 'Chair or Sofa',
    subtitle: '☼ Rise',
    synonyms: ['chair', 'couch', 'bed'],
    renderIcon: () => <Chair3DIcon />,
  },
  {
    id: 'plant',
    name: 'Potted Plant',
    subtitle: '☼ Rise',
    synonyms: ['potted plant', 'vase'],
    renderIcon: () => <Plant3DIcon />,
  },
];

export const ObjectMatchCameraView: React.FC<ObjectMatchCameraViewProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const completedRef = useRef(false);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const rafRef = useRef<number | null>(null);

  // Selected Target
  const [targetIndex, setTargetIndex] = useState(() => Math.floor(Math.random() * TARGET_DESTINATIONS.length));
  const currentTarget = TARGET_DESTINATIONS[targetIndex];

  // Camera & Detection States
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(true);

  // Live Tracking Feedback
  const [targetInView, setTargetInView] = useState(false);
  const [liveScore, setLiveScore] = useState(0);
  const [liveDetectedLabels, setLiveDetectedLabels] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const consecutiveMatchesRef = useRef(0);
  const lastDetectionTimeRef = useRef(0);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Target switcher
  const handleNextTarget = () => {
    if (isScanning || isVerified) return;
    setTargetIndex((prev) => (prev + 1) % TARGET_DESTINATIONS.length);
    setTargetInView(false);
    setLiveScore(0);
    setScanMessage(null);
    consecutiveMatchesRef.current = 0;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(20);
    }
  };

  // Switch Camera
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // 1. Load On-Device AI Model (COCO-SSD)
  useEffect(() => {
    let mounted = true;
    setIsAiLoading(true);

    ModelPreloader.getCocoSsd()
      .then((m) => {
        if (mounted) {
          modelRef.current = m;
          setIsAiLoading(false);
          console.log('[ObjectMatch] COCO-SSD loaded and ready');
        }
      })
      .catch((err) => {
        console.error('[ObjectMatch] Failed to load COCO-SSD:', err);
        if (mounted) {
          setIsAiLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Camera Stream Setup
  useEffect(() => {
    let isCurrent = true;

    const startCamera = async () => {
      setCameraError(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      const getStream = async (): Promise<MediaStream> => {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera hardware not supported on this device');
        }
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (firstErr) {
          console.warn('[ObjectMatch] Ideal camera constraints failed, trying basic video:', firstErr);
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      };

      try {
        const stream = await getStream();
        if (!isCurrent) {
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

          const playVideo = () => {
            if (isCurrent && video.paused) {
              video.play().catch(() => {});
            }
          };

          video.onloadedmetadata = playVideo;
          video.oncanplay = playVideo;
          playVideo();
        }
      } catch (err: any) {
        console.error('[ObjectMatch] Camera startup error:', err);
        if (isCurrent) {
          setCameraError(
            err?.name === 'NotAllowedError'
              ? 'Camera permission denied. Tap Retry or allow camera in Android settings.'
              : 'Could not connect to camera. Tap Retry.'
          );
        }
      }
    };

    startCamera();

    return () => {
      isCurrent = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode]);

  // 3. Real-time Detection Loop (every 350ms)
  useEffect(() => {
    let active = true;

    const detectLoop = async () => {
      if (!active || completedRef.current) return;

      const now = performance.now();
      const video = videoRef.current;
      const model = modelRef.current;

      // Throttle to every 350ms to keep frame rate high
      if (model && video && video.readyState >= 2 && now - lastDetectionTimeRef.current >= 350) {
        lastDetectionTimeRef.current = now;

        try {
          const preds = await model.detect(video, 8, 0.22);
          if (active && !completedRef.current) {
            setLiveDetectedLabels(Array.from(new Set(preds.map((p) => p.class))).slice(0, 3));

            const matchedPred = preds.find((p) => {
              const cls = p.class.toLowerCase();
              return currentTarget.synonyms.some((s) => cls === s || cls.includes(s) || s.includes(cls));
            });

            if (matchedPred) {
              setTargetInView(true);
              setLiveScore(Math.round(matchedPred.score * 100));
              consecutiveMatchesRef.current++;

              // Auto-verify if held steady for 4 detection cycles (~1.5s)
              if (consecutiveMatchesRef.current >= 4) {
                handleVerifySuccess(matchedPred.class, Math.round(matchedPred.score * 100));
                return;
              }
            } else {
              setTargetInView(false);
              consecutiveMatchesRef.current = 0;
            }
          }
        } catch (_) {
          // ignore transient detection glitch
        }
      }

      if (active && !completedRef.current) {
        rafRef.current = requestAnimationFrame(detectLoop);
      }
    };

    rafRef.current = requestAnimationFrame(detectLoop);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [currentTarget]);

  // Success helper
  const handleVerifySuccess = (_matchedClass: string, score: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setIsVerified(true);
    setScanMessage(`✓ Found ${currentTarget.name}! (${score}%)`);

    try {
      synth.playSuccessTone();
    } catch (_) {}

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }

    setTimeout(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCompleteRef.current();
    }, 700);
  };

  // 4. Strict Manual Scan Button Handler
  const handleManualScan = useCallback(async () => {
    if (isScanning || completedRef.current) return;

    // Must have AI model loaded
    if (!modelRef.current) {
      setScanMessage('AI detector is initializing, please wait 2 seconds...');
      return;
    }

    setIsScanning(true);
    setScanMessage(`Scanning for ${currentTarget.name}...`);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(40);
    }
    try {
      synth.playTapTone(880);
    } catch (_) {}

    // Allow laser scan sweep animation
    await new Promise((resolve) => setTimeout(resolve, 550));

    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setIsScanning(false);
      setScanMessage('Camera feed not ready. Please try again.');
      return;
    }

    try {
      // Run detection on current video frame with permissive 0.18 confidence threshold
      const predictions = await modelRef.current.detect(video, 10, 0.18);

      const matchedPred = predictions.find((p) => {
        const cls = p.class.toLowerCase();
        return currentTarget.synonyms.some((s) => cls === s || cls.includes(s) || s.includes(cls));
      });

      if (matchedPred) {
        // STRICT MATCH SUCCEEDED!
        handleVerifySuccess(matchedPred.class, Math.round(matchedPred.score * 100));
      } else {
        // STRICT MATCH FAILED — REJECT SCAN!
        setIsScanning(false);
        setFailedAttempts((prev) => prev + 1);

        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([80, 60, 80]); // Error buzz
        }

        const seenObjects = Array.from(new Set(predictions.map((p) => p.class))).slice(0, 3);
        if (seenObjects.length > 0) {
          setScanMessage(`Detected: ${seenObjects.join(', ')}. That's not the ${currentTarget.name}!`);
        } else {
          setScanMessage(`No ${currentTarget.name} found in view. Point camera directly at it.`);
        }
      }
    } catch (err) {
      console.error('[ObjectMatch] Scan error:', err);
      setIsScanning(false);
      setScanMessage('Scan error. Point camera directly at the item and retry.');
    }
  }, [isScanning, currentTarget]);

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      {/* ── Viewfinder Card (Erly App Visual Framing) ── */}
      <div className="relative w-full max-w-xs sm:max-w-sm aspect-3/4 bg-neutral-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center mb-2">
        {/* Real-time Video Stream */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Subtle camera tint overlay */}
        <div className="absolute inset-0 bg-black/25 pointer-events-none" />

        {/* ── Top Bar Controls: Change Target & Flip Camera ── */}
        <div className="absolute top-0 inset-x-0 p-3.5 flex items-center justify-between z-20 pointer-events-none">
          <button
            type="button"
            onClick={handleNextTarget}
            disabled={isScanning || isVerified}
            className="pointer-events-auto px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 border border-white/15 text-white text-[11px] font-semibold backdrop-blur-md flex items-center gap-1.5 transition-all shadow-md"
          >
            <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
            <span>Change Target</span>
          </button>

          <div className="flex items-center gap-1.5">
            {isAiLoading && (
              <span className="pointer-events-none px-2.5 py-1 rounded-full bg-black/60 border border-white/15 text-amber-300 text-[10px] font-semibold backdrop-blur-md flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                <span>AI Loading</span>
              </span>
            )}
            <button
              type="button"
              onClick={toggleCamera}
              disabled={isScanning || isVerified}
              className="pointer-events-auto p-2 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 border border-white/15 text-white backdrop-blur-md transition-all shadow-md"
              aria-label="Switch Camera"
            >
              <FlipHorizontal size={16} />
            </button>
          </div>
        </div>

        {/* ── Central Brackets Reticle (Erly Style) ── */}
        <div
          onClick={handleManualScan}
          className={`relative w-60 h-60 flex flex-col items-center justify-center cursor-pointer active:scale-98 transition-all z-10 ${
            targetInView ? 'scale-102' : ''
          }`}
        >
          {/* 4 Corner Brackets (Glows Green when target is in view!) */}
          <div
            className={`absolute top-0 left-0 w-8 h-8 border-t-[3.5px] border-l-[3.5px] rounded-tl-xl drop-shadow-md transition-colors duration-300 ${
              targetInView ? 'border-emerald-400 shadow-[0_0_12px_#34d399]' : 'border-white'
            }`}
          />
          <div
            className={`absolute top-0 right-0 w-8 h-8 border-t-[3.5px] border-r-[3.5px] rounded-tr-xl drop-shadow-md transition-colors duration-300 ${
              targetInView ? 'border-emerald-400 shadow-[0_0_12px_#34d399]' : 'border-white'
            }`}
          />
          <div
            className={`absolute bottom-0 left-0 w-8 h-8 border-b-[3.5px] border-l-[3.5px] rounded-bl-xl drop-shadow-md transition-colors duration-300 ${
              targetInView ? 'border-emerald-400 shadow-[0_0_12px_#34d399]' : 'border-white'
            }`}
          />
          <div
            className={`absolute bottom-0 right-0 w-8 h-8 border-b-[3.5px] border-r-[3.5px] rounded-br-xl drop-shadow-md transition-colors duration-300 ${
              targetInView ? 'border-emerald-400 shadow-[0_0_12px_#34d399]' : 'border-white'
            }`}
          />

          {/* Laser scanning sweep line */}
          {isScanning && (
            <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_14px_#60a5fa] animate-laser-sweep pointer-events-none" />
          )}

          {/* 3D Isometric Target Illustration */}
          <div className="mb-2 transition-transform duration-300 hover:scale-105 pointer-events-none">
            {currentTarget.renderIcon()}
          </div>

          {/* Target Title (Erly Style) */}
          <h3 className="text-lg font-black text-white tracking-wide drop-shadow-md leading-snug">
            {currentTarget.name}
          </h3>

          {/* Subtitle / Live Detection Match Indicator */}
          {targetInView ? (
            <div className="flex items-center space-x-1 text-[11px] font-bold text-emerald-400 tracking-wider drop-shadow-sm mt-0.5 animate-pulse">
              <span>✓ Match in view ({liveScore}%)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 text-[11px] font-semibold text-white/90 tracking-wider drop-shadow-sm mt-0.5">
              <Sun size={12} className="text-yellow-400 animate-spin-slow" />
              <span>Rise</span>
            </div>
          )}
        </div>

        {/* ── Success Checkmark Overlay ── */}
        {isVerified && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-30 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-2 shadow-lg shadow-emerald-500/30 animate-bounce">
              <Check size={36} className="text-emerald-400" strokeWidth={3} />
            </div>
            <span className="text-base font-extrabold text-white tracking-wider uppercase">
              {currentTarget.name} Verified!
            </span>
            <span className="text-xs text-emerald-400 font-semibold mt-1">Alarm Dismissed ✓</span>
          </div>
        )}

        {/* ── Camera Hardware Error Fallback ── */}
        {cameraError && (
          <div className="absolute inset-0 bg-neutral-900/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <AlertCircle size={32} className="text-red-400 mb-2" />
            <p className="text-xs text-red-300 mb-3 font-medium">{cameraError}</p>
            <button
              type="button"
              onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold active:scale-95 shadow-md"
            >
              Retry Camera
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="mt-3 text-[11px] text-neutral-400 underline"
            >
              Dismiss Alarm
            </button>
          </div>
        )}
      </div>

      {/* ── Status Hint & Detected Labels ── */}
      <div className="min-h-[22px] max-w-xs px-2 mb-2">
        {scanMessage ? (
          <p className="text-xs font-semibold text-amber-300 leading-snug">
            {scanMessage}
          </p>
        ) : targetInView ? (
          <p className="text-xs font-bold text-emerald-400 leading-snug animate-pulse">
            Target in view! Hold steady or tap below to scan
          </p>
        ) : liveDetectedLabels.length > 0 ? (
          <p className="text-[11px] font-medium text-neutral-400 leading-snug truncate">
            In view: {liveDetectedLabels.join(', ')} • Looking for: {currentTarget.name}
          </p>
        ) : (
          <p className="text-xs text-neutral-400 font-medium">
            Point camera directly at {currentTarget.name}
          </p>
        )}
      </div>

      {/* ── Prominent Capture / Shutter Button (Like Reference Photo) ── */}
      <div className="flex items-center justify-center space-x-4">
        <button
          type="button"
          onClick={handleManualScan}
          disabled={isScanning || isVerified}
          className={`relative group p-1 rounded-full border-4 active:scale-90 transition-all cursor-pointer shadow-xl ${
            targetInView
              ? 'border-emerald-400 shadow-emerald-500/20'
              : 'border-white/60 shadow-blue-500/10'
          }`}
          aria-label="Scan Object"
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner transition-colors ${
              targetInView
                ? 'bg-emerald-400 group-hover:bg-emerald-300'
                : 'bg-white group-hover:bg-blue-50'
            }`}
          >
            <Camera
              size={26}
              className={targetInView ? 'text-black' : 'text-neutral-900'}
            />
          </div>
        </button>
      </div>

      <span className="text-[10px] text-neutral-500 tracking-wider uppercase font-bold mt-2">
        {targetInView ? 'Tap to Confirm' : 'Tap to Scan & Verify'}
      </span>

      {/* Emergency skip button if user struggles repeatedly in dark/unfavorable room conditions */}
      {failedAttempts >= 3 && !isVerified && (
        <button
          type="button"
          onClick={onComplete}
          className="mt-3 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-neutral-400 hover:text-white transition-colors"
        >
          Having trouble in low light? Tap to skip &amp; dismiss
        </button>
      )}
    </div>
  );
};
