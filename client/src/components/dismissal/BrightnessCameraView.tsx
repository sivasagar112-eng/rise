import React, { useEffect, useRef, useState } from 'react';
import { SunMedium, Check } from 'lucide-react';

interface BrightnessCameraViewProps {
  onComplete: () => void;
}

export const BrightnessCameraView: React.FC<BrightnessCameraViewProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const sustainedMsRef = useRef(0);
  const baselineRef = useRef<number | null>(null);
  const lastTsRef = useRef(performance.now());

  const [brightnessValue, setBrightnessValue] = useState(0);
  const [brightnessProgress, setBrightnessProgress] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      if (!mounted || completedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const W = 160, H = 120;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, W, H);
          const { data } = ctx.getImageData(0, 0, W, H);
          let total = 0;
          for (let i = 0; i < data.length; i += 16) {
            total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
          const avgLum = Math.round(total / (data.length / 16));
          if (baselineRef.current === null) baselineRef.current = avgLum;

          const now = performance.now();
          const delta = Math.min(200, now - lastTsRef.current);
          lastTsRef.current = now;

          const isLight = (avgLum - baselineRef.current) >= 24 || avgLum > 110;
          sustainedMsRef.current = isLight
            ? sustainedMsRef.current + delta
            : Math.max(0, sustainedMsRef.current - delta * 0.7);

          const progress = Math.min(100, Math.round((sustainedMsRef.current / 2000) * 100));
          setBrightnessValue(avgLum);
          setBrightnessProgress(progress);

          if (progress >= 100 && !completedRef.current) {
            completedRef.current = true;
            setTimeout(() => {
              streamRef.current?.getTracks().forEach(t => t.stop());
              onComplete();
            }, 500);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.warn('Video play error:', e));
          };
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        console.warn('Initial camera constraint failed in BrightnessCameraView, trying fallback:', err);
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (!mounted) {
            fallbackStream.getTracks().forEach(t => t.stop());
            return;
          }
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(e => console.warn('Fallback play error:', e));
            };
          }
          rafRef.current = requestAnimationFrame(tick);
        } catch (fallbackErr) {
          console.error('Camera access completely denied in BrightnessCameraView:', fallbackErr);
        }
      }
    };

    initCamera();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode]);

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <SunMedium size={14} className="text-yellow-400" />
        <span>LIGHT DETECTION</span>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-theme-text mb-1">
        Turn on Room Lights
      </h2>
      <p className="text-xs text-theme-subtext max-w-xs mb-4">
        Turn on the room lamp or point phone at bright room lighting
      </p>

      {/* Viewfinder */}
      <div className="relative w-full max-w-xs aspect-4/3 bg-black rounded-2xl border-2 border-theme-border overflow-hidden mb-4 shadow-lg">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover opacity-85"
        />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
          <div className="flex justify-between items-start w-full">
            <button
              onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
              className="pointer-events-auto p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-md"
              aria-label="Switch Camera"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/></svg>
            </button>
            <div className="text-right text-[10px] font-medium text-white/80 bg-black/40 px-2 py-0.5 rounded">
              Luminance: {brightnessValue}
            </div>
          </div>

          <div className="text-center text-xs font-semibold text-white bg-black/60 backdrop-blur-sm py-1.5 rounded-lg">
            {brightnessProgress > 0 ? 'Light Detected — Hold Steady' : 'Searching for light...'}
          </div>
        </div>

        {brightnessProgress >= 100 && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
            <Check size={48} className="text-green-400 mb-2" />
            <span className="text-sm font-bold tracking-wider text-white uppercase">
              Room Light Verified
            </span>
          </div>
        )}
      </div>

      {/* Sustained Progress Bar */}
      <div className="w-full max-w-xs mb-4">
        <div className="flex justify-between text-xs font-medium text-theme-subtext mb-1.5">
          <span>Hold Duration</span>
          <span className="font-bold text-theme-text">{brightnessProgress}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full border border-theme-border bg-theme-card overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-150"
            style={{ width: `${brightnessProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
