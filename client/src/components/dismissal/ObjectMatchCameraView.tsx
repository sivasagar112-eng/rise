import React, { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import { MapPin, Check, Loader2, AlertTriangle } from 'lucide-react';

interface ObjectMatchCameraViewProps {
  onComplete: () => void;
}

// COCO-SSD valid household targets (restricted to cheap, easily accessible items)
const HOUSEHOLD_TARGETS = [
  'sink', 'cup', 'bottle', 'bowl', 'spoon', 'fork', 'toothbrush'
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

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // 1. Load heavy AI model entirely in the background ONCE
  useEffect(() => {
    let mounted = true;
    const loadAi = async () => {
      try {
        await tf.ready();
        const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        if (mounted) {
          modelRef.current = model;
          setIsAiReady(true);
        }
      } catch (aiErr: any) {
        console.error('AI Model failed to load', aiErr);
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
  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      // Stop existing stream before requesting new
      streamRef.current?.getTracks().forEach(t => t.stop());

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
            videoRef.current?.play().catch(e => console.warn('Video play interrupted', e));
          };
        }
        setPhase('SCANNING');
      } catch (err: any) {
        console.warn('Initial camera constraint failed in ObjectMatch, trying fallback:', err);
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
              videoRef.current?.play().catch(e => console.warn('Fallback play interrupted', e));
            };
          }
          setPhase('SCANNING');
        } catch (fallbackErr: any) {
          console.error('All camera init failed in ObjectMatch:', fallbackErr);
          if (mounted) {
            setErrorMessage(fallbackErr.message || 'Camera access was blocked.');
            setPhase('ERROR');
          }
        }
      }
    };

    startCamera();
    return () => {
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
    let frameCount = 0;
    let confirmed = 0;

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
        frameCount++;

        // Lower threshold slightly to 0.40 for easier mobile detection
        const match = predictions.find(p =>
          expectedObjects.some(obj => p.class.toLowerCase().includes(obj) || obj.includes(p.class.toLowerCase()))
          && p.score > 0.40
        );

        if (match) {
          confirmed++;
          setDetectedLabel(match.class);
          setConfirmedFrames(confirmed);
          // 5 frames = 100%
          setScanProgress(Math.min(100, confirmed * 20));

          if (confirmed >= 5 && !completedRef.current) {
            completedRef.current = true;
            setPhase('DETECTED');
            setTimeout(() => {
              streamRef.current?.getTracks().forEach(t => t.stop());
              onComplete();
            }, 1200);
            return;
          }
        } else {
          // Slower decay so it doesn't jitter rapidly
          setScanProgress(p => Math.max(0, p - 5));
        }

        // Faux progress to show it's scanning visually
        if (frameCount % 10 === 0 && confirmed < 2) {
          setScanProgress(p => Math.min(p + 5, 30));
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

  if (phase === 'INITIALIZING') {
    return (
      <div className="w-full flex flex-col items-center text-center space-y-4 py-8">
        <Loader2 size={36} className="text-blue-500 animate-spin" />
        <p className="text-sm font-bold text-theme-text">Starting Camera...</p>
      </div>
    );
  }

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
      <p className="text-xs text-theme-subtext max-w-xs mb-3">
        {phase === 'DETECTED'
          ? `Detected: ${detectedLabel}`
          : 'Move slowly — AI is scanning for objects'
        }
      </p>

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
              {confirmedFrames}/5 confirmed
            </div>
          </div>
          <div className="text-center text-xs font-semibold text-white bg-black/60 backdrop-blur-sm py-1.5 rounded-lg">
            {!isAiReady 
              ? 'AI warming up (takes a few secs)...' 
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
