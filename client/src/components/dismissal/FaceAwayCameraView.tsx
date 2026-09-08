import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, Check, FlipHorizontal, Loader2, AlertTriangle } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';

interface FaceAwayCameraViewProps {
  onComplete: () => void;
}

export const FaceAwayCameraView: React.FC<FaceAwayCameraViewProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const sustainedMsRef = useRef(0);
  const lastTsRef = useRef(performance.now());
  const initialFaceDetectedRef = useRef(false);

  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isLoading, setIsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [statusText, setStatusText] = useState('Opening Front Camera...');
  const [showEmergencyDismiss, setShowEmergencyDismiss] = useState(false);

  // Toggle camera front/rear
  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Emergency fallback button if user's hardware is struggling
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEmergencyDismiss(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    sustainedMsRef.current = 0;
    initialFaceDetectedRef.current = false;
    setIsLoading(true);
    setCameraError(null);
    setStatusText('Opening camera feed...');

    const tick = () => {
      if (!mounted || completedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        setIsLoading(false);
        const W = 160;
        const H = 120;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, W, H);
          const { data } = ctx.getImageData(0, 0, W, H);

          // Center face area (middle 60% of frame)
          const minX = Math.floor(W * 0.20);
          const maxX = Math.floor(W * 0.80);
          const minY = Math.floor(H * 0.15);
          const maxY = Math.floor(H * 0.85);

          let skinPixels = 0;
          let totalChecked = 0;

          // Universal YCbCr skin tone detection (works across all skin tones and lighting conditions)
          for (let y = minY; y < maxY; y += 2) {
            for (let x = minX; x < maxX; x += 2) {
              const idx = (y * W + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              totalChecked++;

              // YCbCr transformation
              const Y = 0.299 * r + 0.587 * g + 0.114 * b;
              const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
              const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

              // Kovac/Chai universal skin chromaticity locus
              if (Y > 30 && Cr >= 133 && Cr <= 178 && Cb >= 77 && Cb <= 130) {
                skinPixels++;
              }
            }
          }

          const skinRatio = totalChecked > 0 ? skinPixels / totalChecked : 0;
          const isFaceInView = skinRatio > 0.14;
          setFaceDetected(isFaceInView);

          if (isFaceInView) {
            initialFaceDetectedRef.current = true;
          }

          const now = performance.now();
          const delta = Math.min(200, now - lastTsRef.current);
          lastTsRef.current = now;

          // Once face is absent (pointing away from face or out of bed):
          // User must sustain looking away for 2.5 seconds
          if (!isFaceInView) {
            sustainedMsRef.current += delta;
            setStatusText('Holding Away... Getting Out of Bed');
          } else {
            // If face is looking at camera, gently decay progress
            sustainedMsRef.current = Math.max(0, sustainedMsRef.current - delta * 0.8);
            setStatusText('Face in view — Turn phone away from you');
          }

          const prog = Math.min(100, Math.round((sustainedMsRef.current / 2500) * 100));
          setProgress(prog);

          if (prog >= 100 && !completedRef.current) {
            completedRef.current = true;
            setDone(true);
            synth.playSuccessTone();
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              navigator.vibrate([100, 50, 100]);
            }
            setTimeout(() => {
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
              }
              onComplete();
            }, 600);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const initCamera = async () => {
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

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const playVideo = () => {
            videoRef.current?.play().catch((e) => console.warn('Play error:', e));
          };
          videoRef.current.onloadedmetadata = playVideo;
          videoRef.current.onloadeddata = playVideo;
          playVideo();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: any) {
        console.error('Camera access completely denied in FaceAway:', err);
        if (mounted) {
          setIsLoading(false);
          setCameraError(err?.message || 'Front camera access was blocked.');
        }
      }
    };

    initCamera();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode, onComplete]);

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <EyeOff size={14} className="text-purple-400" />
        <span>FACE-AWAY VERIFICATION</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Get Out of Bed
      </h2>
      <p className="text-xs text-theme-subtext max-w-xs mb-4 min-h-[32px] flex items-center justify-center">
        Point phone away from your face for 2.5 seconds to prove you are out of bed
      </p>

      {/* Viewfinder */}
      <div className="relative w-full max-w-xs aspect-4/3 bg-black rounded-2xl border-2 border-theme-border overflow-hidden mb-4 shadow-lg">
        {isLoading && (
          <div className="absolute inset-0 bg-neutral-900/90 z-10 flex flex-col items-center justify-center space-y-2">
            <Loader2 size={32} className="text-purple-400 animate-spin" />
            <span className="text-xs font-semibold text-white">Opening Camera...</span>
          </div>
        )}

        {cameraError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center text-white bg-neutral-900">
            <AlertTriangle size={36} className="text-amber-400 mb-2" />
            <p className="text-xs font-semibold mb-3">{cameraError}</p>
            <button
              onClick={onComplete}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              Dismiss Alarm
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover opacity-85 ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />

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
              {faceDetected ? 'FACE DETECTED' : 'FACE AWAY ✓'}
            </div>
          </div>

          {/* Center Face Target Oval */}
          <div
            className={`self-center w-36 h-40 rounded-[50%] border-2 transition-all flex items-center justify-center ${
              done || progress >= 80
                ? 'border-green-400 bg-green-500/10'
                : faceDetected
                ? 'border-purple-400/80 bg-purple-500/10'
                : 'border-dashed border-white/40'
            }`}
          >
            <span className="text-[10px] text-white/80 font-bold uppercase tracking-wider">
              {faceDetected ? 'Turn Away' : 'Looking Away'}
            </span>
          </div>

          <div className="text-center text-xs font-bold text-white bg-black/70 backdrop-blur-md py-1.5 rounded-xl border border-white/10">
            {done ? 'Verified! You are up!' : statusText}
          </div>
        </div>

        {done && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in z-20">
            <Check size={52} className="text-green-400 mb-2 animate-bounce" />
            <span className="text-sm font-extrabold tracking-wider text-white uppercase">
              Out of Bed Verified
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-xs mb-3">
        <div className="flex justify-between text-xs font-medium text-theme-subtext mb-1.5">
          <span>Sustained Face-Away</span>
          <span className="font-bold text-theme-text">{progress}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full border border-theme-border bg-theme-card overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Emergency Dismiss if phone hardware is stuck */}
      {showEmergencyDismiss && !done && (
        <button
          onClick={onComplete}
          className="mt-2 text-[11px] text-theme-subtext underline hover:text-theme-text transition-colors"
        >
          Camera not detecting? Tap to dismiss
        </button>
      )}
    </div>
  );
};
