import { useRef, useState, useCallback, useEffect } from 'react';
import { synth } from '../services/WebAudioSynth';

export interface PushupVisionState {
  isActive: boolean;
  permissionDenied: boolean;
  repsCompleted: number;
  targetReps: number;
  currentPhase: 'READY' | 'GOING_DOWN' | 'BOTTOM' | 'GOING_UP' | 'FINISHED';
  currentDepthProgress: number; // 0% (at top) to 100% (fully down)
  guidanceText: string;
  isComplete: boolean;
}

export function usePushupVision(targetReps: number = 5) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [state, setState] = useState<PushupVisionState>({
    isActive: false,
    permissionDenied: false,
    repsCompleted: 0,
    targetReps,
    currentPhase: 'READY',
    currentDepthProgress: 0,
    guidanceText: 'Position camera so your upper body is visible',
    isComplete: false,
  });

  // State machine tracking refs
  const smoothedYRef = useRef<number>(0.3);
  const baselineTopYRef = useRef<number>(0.3);
  const currentPhaseRef = useRef<'READY' | 'GOING_DOWN' | 'BOTTOM' | 'GOING_UP'>('READY');
  const repsRef = useRef<number>(0);
  const lastRepTimeRef = useRef<number>(0);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);

  const startVision = useCallback(async (facingMode: 'user' | 'environment' = 'user') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 480 },
          height: { ideal: 360 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      repsRef.current = 0;
      currentPhaseRef.current = 'READY';
      smoothedYRef.current = 0.35;
      baselineTopYRef.current = 0.35;
      lastRepTimeRef.current = performance.now();

      setState({
        isActive: true,
        permissionDenied: false,
        repsCompleted: 0,
        targetReps,
        currentPhase: 'READY',
        currentDepthProgress: 0,
        guidanceText: 'Get into pushup position',
        isComplete: false,
      });
    } catch (err) {
      console.warn('Pushup camera error:', err);
      setState((s) => ({ ...s, isActive: false, permissionDenied: true }));
    }
  }, [targetReps]);

  const stopVision = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState((s) => ({ ...s, isActive: false }));
  }, []);

  // Frame processing loop for motion & centroid tracking
  const processPushupFrame = useCallback((canvas: HTMLCanvasElement) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || repsRef.current >= targetReps) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = 120;
    const height = 90;
    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Detect movement pixels compared to previous frame
    let weightedYSum = 0;
    let motionCount = 0;

    if (prevFrameRef.current && prevFrameRef.current.length === data.length) {
      const prev = prevFrameRef.current;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const idx = (y * width + x) * 4;
          const diff =
            Math.abs(data[idx] - prev[idx]) +
            Math.abs(data[idx + 1] - prev[idx + 1]) +
            Math.abs(data[idx + 2] - prev[idx + 2]);

          // Threshold for intentional body movement
          if (diff > 45) {
            weightedYSum += y;
            motionCount++;
          }
        }
      }
    }
    prevFrameRef.current = new Uint8ClampedArray(data);

    // Update vertical centroid with exponential smoothing
    if (motionCount > 40) {
      const rawY = (weightedYSum / motionCount) / height;
      // Exponential filter alpha = 0.25
      smoothedYRef.current = smoothedYRef.current * 0.75 + rawY * 0.25;
    }

    const currentY = smoothedYRef.current;
    const now = performance.now();
    let guide = state.guidanceText;

    // Pushup State Machine
    // Depth displacement required (18% of camera height)
    const requiredDisplacement = 0.16;
    const depthDelta = currentY - baselineTopYRef.current;
    const depthProgress = Math.max(0, Math.min(100, Math.round((depthDelta / requiredDisplacement) * 100)));

    if (currentPhaseRef.current === 'READY') {
      // In plank position / top
      if (motionCount < 80) {
        // Body is relatively steady at the top, calibrate top baseline
        baselineTopYRef.current = baselineTopYRef.current * 0.85 + currentY * 0.15;
      }
      if (depthDelta > requiredDisplacement * 0.4) {
        currentPhaseRef.current = 'GOING_DOWN';
        guide = 'Lower your chest...';
      } else {
        guide = 'Lower your chest to the floor';
      }
    } else if (currentPhaseRef.current === 'GOING_DOWN') {
      guide = 'Lowering... go deeper';
      if (depthDelta >= requiredDisplacement) {
        currentPhaseRef.current = 'BOTTOM';
        guide = 'Good depth! Now push up!';
      }
    } else if (currentPhaseRef.current === 'BOTTOM') {
      guide = 'Push back up!';
      if (depthDelta < requiredDisplacement * 0.7) {
        currentPhaseRef.current = 'GOING_UP';
      }
    } else if (currentPhaseRef.current === 'GOING_UP') {
      guide = 'Pushing up...';
      // Return near top baseline
      if (depthDelta < requiredDisplacement * 0.25) {
        const timeSinceLastRep = now - lastRepTimeRef.current;
        // Require at least 700ms between reps to prevent bouncing/jitter
        if (timeSinceLastRep > 700) {
          repsRef.current += 1;
          lastRepTimeRef.current = now;
          synth.playRepChirp();

          if (repsRef.current >= targetReps) {
            currentPhaseRef.current = 'READY';
            setState({
              isActive: true,
              permissionDenied: false,
              repsCompleted: repsRef.current,
              targetReps,
              currentPhase: 'FINISHED',
              currentDepthProgress: 100,
              guidanceText: `${repsRef.current}/${targetReps} Pushups Completed!`,
              isComplete: true,
            });
            return;
          } else {
            guide = `Rep ${repsRef.current} counted! Keep moving!`;
          }
        }
        currentPhaseRef.current = 'READY';
      }
    }

    setState((s) => ({
      ...s,
      repsCompleted: repsRef.current,
      currentPhase: currentPhaseRef.current,
      currentDepthProgress: depthProgress,
      guidanceText: guide,
      isComplete: repsRef.current >= targetReps,
    }));
  }, [state.guidanceText, targetReps]);

  // Fallback / manual increment for accessibility or testing
  const manualCountRep = useCallback(() => {
    if (repsRef.current < targetReps) {
      repsRef.current += 1;
      synth.playRepChirp();
      const done = repsRef.current >= targetReps;
      setState((s) => ({
        ...s,
        repsCompleted: repsRef.current,
        currentPhase: done ? 'FINISHED' : s.currentPhase,
        guidanceText: done ? 'Pushups Completed!' : `Rep ${repsRef.current} recorded!`,
        isComplete: done,
      }));
    }
  }, [targetReps]);

  useEffect(() => {
    return () => {
      stopVision();
    };
  }, [stopVision]);

  return {
    videoRef,
    state,
    startVision,
    stopVision,
    processPushupFrame,
    manualCountRep,
  };
}
