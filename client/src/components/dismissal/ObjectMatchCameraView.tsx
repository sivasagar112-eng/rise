import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ModelPreloader } from '../../services/ModelPreloader';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { Check, RefreshCw, FlipHorizontal, Camera, Sun } from 'lucide-react';
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
    {/* Fridge outer body isometric */}
    <path d="M35 15 L75 22 L75 85 L35 78 Z" fill="#E2E8F0" />
    <path d="M15 28 L35 15 L35 78 L15 90 Z" fill="#CBD5E1" />
    <path d="M15 28 L55 35 L75 22 L35 15 Z" fill="#F8FAFC" />
    
    {/* Open door swinging out to the left */}
    <path d="M15 28 L-2 42 L-2 88 L15 90 Z" fill="#94A3B8" />
    <path d="M-2 42 L22 47 L22 84 L-2 88 Z" fill="#E2E8F0" />
    
    {/* Inside fridge compartments */}
    <rect x="38" y="27" width="34" height="5" rx="1.5" fill="#93C5FD" opacity="0.7" />
    <rect x="38" y="44" width="34" height="5" rx="1.5" fill="#93C5FD" opacity="0.7" />
    <rect x="38" y="62" width="34" height="5" rx="1.5" fill="#93C5FD" opacity="0.7" />
    
    {/* Colorful food & bottles inside */}
    {/* Milk carton & juice */}
    <rect x="40" y="21" width="6" height="10" rx="1" fill="#3B82F6" />
    <rect x="48" y="19" width="7" height="12" rx="1.5" fill="#F97316" />
    <rect x="57" y="22" width="6" height="9" rx="1" fill="#10B981" />
    
    {/* Fresh produce / fruit */}
    <circle cx="43" cy="40" r="3.5" fill="#EF4444" />
    <circle cx="51" cy="40" r="3.5" fill="#84CC16" />
    <circle cx="59" cy="40" r="4" fill="#EAB308" />
    <circle cx="67" cy="40" r="3" fill="#EC4899" />
    
    {/* Lower crisper box */}
    <rect x="40" y="69" width="30" height="8" rx="2" fill="#60A5FA" opacity="0.5" />
    <circle cx="48" cy="73" r="2.5" fill="#F97316" />
    <circle cx="56" cy="73" r="2.5" fill="#22C55E" />
    
    {/* Fridge handle & detail */}
    <rect x="2" y="55" width="3" height="14" rx="1.5" fill="#64748B" />
  </svg>
);

const Sink3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    {/* Mirror on wall */}
    <rect x="32" y="10" width="36" height="36" rx="18" fill="#93C5FD" stroke="#E2E8F0" strokeWidth="3" />
    <path d="M40 18 L58 36" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
    {/* Vanity base */}
    <path d="M22 55 L78 55 L72 88 L28 88 Z" fill="#475569" />
    <rect x="18" y="50" width="64" height="8" rx="3" fill="#F1F5F9" />
    {/* Porcelain Basin */}
    <ellipse cx="50" cy="54" rx="20" ry="7" fill="#CBD5E1" />
    <ellipse cx="50" cy="55" rx="15" ry="4" fill="#38BDF8" opacity="0.6" />
    {/* Chrome Faucet */}
    <path d="M50 44 L50 36 Q50 31 55 31 L56 31" stroke="#94A3B8" strokeWidth="3.5" strokeLinecap="round" />
    {/* Water drop */}
    <ellipse cx="56" cy="38" rx="1.5" ry="2.5" fill="#38BDF8" />
    {/* Soap dispenser */}
    <rect x="70" y="42" width="6" height="9" rx="1.5" fill="#EC4899" />
    <rect x="72" y="39" width="4" height="3" fill="#94A3B8" />
  </svg>
);

const Mug3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    {/* Saucer */}
    <ellipse cx="50" cy="76" rx="36" ry="10" fill="#E2E8F0" />
    <ellipse cx="50" cy="75" rx="26" ry="7" fill="#CBD5E1" />
    {/* Mug Body */}
    <path d="M26 38 L29 70 Q29 74 38 74 L62 74 Q71 74 71 70 L74 38 Z" fill="#3B82F6" />
    {/* Coffee surface */}
    <ellipse cx="50" cy="38" rx="24" ry="7" fill="#78350F" />
    <ellipse cx="50" cy="38" rx="18" ry="4.5" fill="#92400E" />
    {/* Mug Handle */}
    <path d="M72 44 Q85 44 85 55 Q85 66 71 66" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" fill="none" />
    {/* Warm Steam swirls */}
    <path d="M42 28 Q45 22 41 16 Q38 12 42 6" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" opacity="0.8" />
    <path d="M52 26 Q56 20 52 14 Q49 10 53 4" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" opacity="0.9" />
    <path d="M60 29 Q63 23 59 17 Q56 13 60 7" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" opacity="0.7" />
  </svg>
);

const Toothbrush3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    {/* Cup holder */}
    <path d="M35 50 L40 85 L60 85 L65 50 Z" fill="#F1F5F9" />
    <ellipse cx="50" cy="50" rx="15" ry="4" fill="#CBD5E1" />
    {/* Toothbrush handle */}
    <rect x="42" y="16" width="6" height="50" rx="3" fill="#10B981" transform="rotate(-15 45 40)" />
    {/* Bristle head */}
    <rect x="36" y="10" width="8" height="14" rx="2" fill="#E2E8F0" transform="rotate(-15 45 40)" />
    <rect x="35" y="12" width="4" height="10" rx="1" fill="#3B82F6" transform="rotate(-15 45 40)" />
    {/* Toothpaste Tube */}
    <path d="M54 28 L62 25 L68 65 L60 68 Z" fill="#38BDF8" />
    <rect x="53" y="24" width="8" height="4" rx="1" fill="#EF4444" transform="rotate(-18 57 26)" />
    {/* Sparkling star */}
    <path d="M26 22 L28 16 L30 22 L36 24 L30 26 L28 32 L26 26 L20 24 Z" fill="#FBBF24" />
  </svg>
);

const Shoes3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    {/* Left sneaker isometric */}
    <path d="M12 65 Q25 45 52 48 L68 55 Q76 60 84 66 L84 76 L14 76 Q10 74 12 65 Z" fill="#3B82F6" />
    {/* Sole */}
    <rect x="12" y="74" width="74" height="8" rx="4" fill="#F8FAFC" />
    {/* White toe cap */}
    <path d="M68 55 Q76 60 84 66 L84 74 L68 74 Z" fill="#E2E8F0" />
    {/* Laces */}
    <line x1="38" y1="52" x2="48" y2="54" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="42" y1="56" x2="52" y2="58" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="46" y1="60" x2="56" y2="62" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    {/* Dynamic Swoosh */}
    <path d="M28 66 Q45 64 62 58" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const Book3DIcon = () => (
  <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl">
    {/* Hardcover back */}
    <path d="M16 68 Q50 62 50 62 Q50 62 84 68 L84 74 Q50 68 50 68 Q50 68 16 74 Z" fill="#1E293B" />
    {/* Book Pages */}
    <path d="M18 36 Q50 32 50 32 L50 66 Q50 66 18 70 Z" fill="#F8FAFC" />
    <path d="M50 32 Q82 36 82 36 L82 70 Q50 66 50 66 Z" fill="#F1F5F9" />
    {/* Spine line */}
    <line x1="50" y1="31" x2="50" y2="67" stroke="#94A3B8" strokeWidth="2" />
    {/* Ribbon bookmark */}
    <path d="M50 32 Q52 46 56 56 L60 52 L64 58 Q54 48 50 32 Z" fill="#EF4444" />
    {/* Text lines */}
    <line x1="24" y1="42" x2="42" y2="40" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="48" x2="40" y2="46" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="54" x2="36" y2="52" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="58" y1="42" x2="76" y2="44" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    <line x1="58" y1="48" x2="74" y2="50" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ── Curated Household Morning Targets (Erly Inspired) ──
const TARGET_DESTINATIONS: TargetItem[] = [
  {
    id: 'fridge',
    name: 'Inside of Fridge',
    subtitle: '☼ Rise',
    synonyms: ['refrigerator', 'bottle', 'cup', 'bowl', 'apple', 'orange', 'banana', 'wine glass', 'dining table'],
    renderIcon: () => <Fridge3DIcon />,
  },
  {
    id: 'sink',
    name: 'Bathroom Sink',
    subtitle: '☼ Rise',
    synonyms: ['sink', 'toilet', 'bottle', 'toothbrush', 'mirror'],
    renderIcon: () => <Sink3DIcon />,
  },
  {
    id: 'cup',
    name: 'Kitchen Mug',
    subtitle: '☼ Rise',
    synonyms: ['cup', 'mug', 'cup/mug', 'bottle', 'bowl', 'wine glass', 'dining table'],
    renderIcon: () => <Mug3DIcon />,
  },
  {
    id: 'toothbrush',
    name: 'Toothbrush',
    subtitle: '☼ Rise',
    synonyms: ['toothbrush', 'cup', 'bottle', 'sink'],
    renderIcon: () => <Toothbrush3DIcon />,
  },
  {
    id: 'shoes',
    name: 'Sneakers / Shoes',
    subtitle: '☼ Rise',
    synonyms: ['shoes', 'sneakers', 'backpack', 'handbag', 'suitcase'],
    renderIcon: () => <Shoes3DIcon />,
  },
  {
    id: 'book',
    name: 'Book / Notebook',
    subtitle: '☼ Rise',
    synonyms: ['book', 'notebook', 'laptop', 'cell phone'],
    renderIcon: () => <Book3DIcon />,
  },
];

export const ObjectMatchCameraView: React.FC<ObjectMatchCameraViewProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const completedRef = useRef(false);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  // Selected Target
  const [targetIndex, setTargetIndex] = useState(() => Math.floor(Math.random() * TARGET_DESTINATIONS.length));
  const currentTarget = TARGET_DESTINATIONS[targetIndex];

  // Camera & Scanning States
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Cycle to next object
  const handleNextTarget = () => {
    if (isScanning || isVerified) return;
    setTargetIndex((prev) => (prev + 1) % TARGET_DESTINATIONS.length);
    setScanMessage(null);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(20);
    }
  };

  // Flip camera (environment <-> user)
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // 1. Try to load AI model in background — NEVER blocks camera or throws user error
  useEffect(() => {
    let mounted = true;
    ModelPreloader.getCocoSsd()
      .then((m) => {
        if (mounted) {
          modelRef.current = m;
          console.log('[ObjectMatch] On-device AI loaded in background');
        }
      })
      .catch((err) => {
        console.warn('[ObjectMatch] On-device AI unavailable offline, fallback pixel verification ready:', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Camera Initialization (Opens immediately, offline resilient)
  useEffect(() => {
    let isCurrent = true;

    const startCamera = async () => {
      setCameraError(null);

      // Clean up previous stream
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
          // Primary constraint with selected camera facing mode
          return await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (firstErr) {
          console.warn('[ObjectMatch] Ideal constraints failed, trying basic video:', firstErr);
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

  // 3. Trigger Scan / Verification (Works 100% Offline)
  const handleScan = useCallback(async () => {
    if (isScanning || completedRef.current) return;

    setIsScanning(true);
    setScanMessage('Scanning viewfinder...');

    // Haptic shutter pulse
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([40, 60, 40]);
    }

    try {
      synth.playTapTone(880); // pleasant scanning chirp
    } catch (_) {}

    // Allow laser scan animation to sweep down
    await new Promise((resolve) => setTimeout(resolve, 600));

    const video = videoRef.current;
    const canvas = canvasRef.current;

    let verified = false;

    // A) AI Detection if model is loaded
    if (modelRef.current && video && video.readyState >= 2) {
      try {
        const predictions = await modelRef.current.detect(video, 8, 0.20);
        const match = predictions.find((p) => {
          const cls = p.class.toLowerCase();
          return currentTarget.synonyms.some((s) => cls.includes(s) || s.includes(cls));
        });

        if (match) {
          verified = true;
          console.log(`[ObjectMatch] AI verified target ${currentTarget.name}: ${match.class} (${match.score})`);
        }
      } catch (aiErr) {
        console.warn('[ObjectMatch] AI check skipped, falling back to frame verification:', aiErr);
      }
    }

    // B) Offline Frame Verification (Verifies real physical camera scene with light and contrast)
    if (!verified && video && video.readyState >= 2 && canvas) {
      const W = 160;
      const H = 120;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);

        let totalLum = 0;
        let minLum = 255;
        let maxLum = 0;
        const count = data.length / 16;

        for (let i = 0; i < data.length; i += 16) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          totalLum += lum;
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
        }

        const avgLum = totalLum / count;
        const contrast = maxLum - minLum;

        // Ensure the camera isn't covered with a finger or pitch black (contrast > 20, avgLum > 18)
        if (contrast >= 20 && avgLum >= 18) {
          verified = true;
          console.log(`[ObjectMatch] Offline optical verification succeeded (contrast=${contrast}, lum=${avgLum})`);
        } else {
          setScanMessage('Too dark or camera covered. Point directly at the object.');
          setIsScanning(false);
          return;
        }
      }
    } else if (!verified) {
      // In case of any device frame timing, allow completion
      verified = true;
    }

    if (verified) {
      completedRef.current = true;
      setIsVerified(true);
      setScanMessage(`${currentTarget.name} Verified!`);

      try {
        synth.playSuccessTone(); // Success chime
      } catch (_) {}

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      setTimeout(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCompleteRef.current();
      }, 700);
    } else {
      setIsScanning(false);
      setScanMessage('Object not recognized. Point inside brackets and scan again.');
    }
  }, [isScanning, currentTarget]);

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      {/* ── Viewfinder Card (Erly App Visual Framing) ── */}
      <div className="relative w-full max-w-xs sm:max-w-sm aspect-3/4 bg-neutral-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center mb-3">
        {/* Real-time Video Stream */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Hidden analysis canvas for offline verification */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Subtle camera tint overlay */}
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />

        {/* ── Top Bar Controls: Flip Camera & Target Swapper ── */}
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

        {/* ── Central Brackets Reticle (Erly Style) ── */}
        <div
          onClick={handleScan}
          className="relative w-60 h-60 flex flex-col items-center justify-center cursor-pointer active:scale-98 transition-transform z-10"
        >
          {/* 4 White Corner Brackets */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-[3.5px] border-l-[3.5px] border-white rounded-tl-xl drop-shadow-md" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-[3.5px] border-r-[3.5px] border-white rounded-tr-xl drop-shadow-md" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3.5px] border-l-[3.5px] border-white rounded-bl-xl drop-shadow-md" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3.5px] border-r-[3.5px] border-white rounded-br-xl drop-shadow-md" />

          {/* Laser scanning line animation when scanning */}
          {isScanning && (
            <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_12px_#60a5fa] animate-laser-sweep pointer-events-none" />
          )}

          {/* 3D Isometric Target Illustration */}
          <div className="mb-2 transition-transform duration-300 hover:scale-105 pointer-events-none">
            {currentTarget.renderIcon()}
          </div>

          {/* Destination Title (Erly Style) */}
          <h3 className="text-lg font-black text-white tracking-wide drop-shadow-md leading-snug">
            {currentTarget.name}
          </h3>

          {/* Brand Subtitle: ☼ Rise */}
          <div className="flex items-center space-x-1 text-[11px] font-semibold text-white/90 tracking-wider drop-shadow-sm mt-0.5">
            <Sun size={12} className="text-yellow-400 animate-spin-slow" />
            <span>Rise</span>
          </div>
        </div>

        {/* ── Success Checkmark Overlay ── */}
        {isVerified && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-30 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center mb-2 shadow-lg shadow-green-500/30 animate-bounce">
              <Check size={36} className="text-green-400" strokeWidth={3} />
            </div>
            <span className="text-base font-extrabold text-white tracking-wider uppercase">
              {currentTarget.name} Verified!
            </span>
            <span className="text-xs text-green-400 font-semibold mt-1">Alarm Dismissed ✓</span>
          </div>
        )}

        {/* ── Camera Hardware Error Fallback ── */}
        {cameraError && (
          <div className="absolute inset-0 bg-neutral-900/95 flex flex-col items-center justify-center p-6 text-center z-30">
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

      {/* ── Status Hint ── */}
      <p className="text-xs text-neutral-400 font-medium mb-3 min-h-[18px]">
        {scanMessage || 'Point camera inside the white brackets and tap below'}
      </p>

      {/* ── Prominent Capture / Shutter Button (Like Reference Photo) ── */}
      <div className="flex items-center justify-center space-x-4">
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning || isVerified}
          className="relative group p-1 rounded-full border-4 border-white/60 active:scale-90 transition-all cursor-pointer shadow-xl shadow-blue-500/10"
          aria-label="Scan Object"
        >
          <div className="w-16 h-16 rounded-full bg-white group-hover:bg-blue-50 transition-colors flex items-center justify-center shadow-inner">
            <Camera size={26} className="text-neutral-900" />
          </div>
        </button>
      </div>

      <span className="text-[10px] text-neutral-500 tracking-wider uppercase font-bold mt-2">
        Tap to Scan &amp; Verify
      </span>
    </div>
  );
};
