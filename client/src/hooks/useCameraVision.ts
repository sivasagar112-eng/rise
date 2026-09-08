import { useRef, useState, useCallback, useEffect } from 'react';

export interface CameraVisionState {
  isActive: boolean;
  permissionDenied: boolean;
  brightnessValue: number; // 0 - 255
  baselineBrightness: number;
  brightnessTargetReached: boolean;
  brightnessProgress: number; // 0 - 100%
  faceAwayProgress: number; // 0 - 100%
  objectMatchScore: number; // 0 - 100%
  isLiveFeedValid: boolean; // Anti-cheat micro-motion verification
}

export function useCameraVision() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);

  const [state, setState] = useState<CameraVisionState>({
    isActive: false,
    permissionDenied: false,
    brightnessValue: 0,
    baselineBrightness: 0,
    brightnessTargetReached: false,
    brightnessProgress: 0,
    faceAwayProgress: 0,
    objectMatchScore: 0,
    isLiveFeedValid: true,
  });

  // Track sustained duration counters
  const sustainedLightMsRef = useRef<number>(0);
  const sustainedFaceAwayMsRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(performance.now());
  const baselineSetRef = useRef<boolean>(false);
  const baselineValRef = useRef<number>(0);

  // Initialize camera feed
  const startCamera = useCallback(async (facingMode: 'user' | 'environment' = 'environment') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((e) => console.warn('Play interrupted:', e));
        };
      }

      baselineSetRef.current = false;
      sustainedLightMsRef.current = 0;
      sustainedFaceAwayMsRef.current = 0;
      lastTimestampRef.current = performance.now();

      setState((s) => ({ ...s, isActive: true, permissionDenied: false }));
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setState((s) => ({ ...s, isActive: false, permissionDenied: true }));
    }
  }, []);

  const stopCamera = useCallback(() => {
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

  // Compute 64-element feature vector from image data (for object matching)
  const extractFeatureDescriptor = useCallback((imageData: ImageData): string => {
    const { data, width, height } = imageData;
    const gridRows = 8;
    const gridCols = 8;
    const cellW = Math.floor(width / gridCols);
    const cellH = Math.floor(height / gridRows);
    const vector: number[] = [];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        let sumLuminance = 0;
        let count = 0;
        for (let y = r * cellH; y < (r + 1) * cellH; y += 2) {
          for (let x = c * cellW; x < (c + 1) * cellW; x += 2) {
            const idx = (y * width + x) * 4;
            // Standard relative luminance
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            sumLuminance += lum;
            count++;
          }
        }
        vector.push(Math.round(sumLuminance / (count || 1)));
      }
    }
    return JSON.stringify(vector);
  }, []);

  // Cosine similarity between two feature vectors
  const compareDescriptors = useCallback((descA: string, descB: string): number => {
    try {
      const vecA: number[] = JSON.parse(descA);
      const vecB: number[] = JSON.parse(descB);
      if (vecA.length !== vecB.length) return 0;

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }

      if (normA === 0 || normB === 0) return 0;
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      return Math.max(0, Math.min(100, Math.round(similarity * 100)));
    } catch {
      return 0;
    }
  }, []);

  // Frame processing loop
  const processFrame = useCallback((
    canvas: HTMLCanvasElement,
    mode: 'BRIGHTNESS' | 'FACE_AWAY' | 'OBJECT_MATCH',
    referenceDescriptor?: string | null
  ) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = 160;
    const height = 120;
    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const now = performance.now();
    const deltaMs = Math.min(200, now - lastTimestampRef.current);
    lastTimestampRef.current = now;

    // 1. Anti-Cheat: Frame Variance / Natural Sensor Noise Check
    let frameDiffSum = 0;
    if (prevFrameDataRef.current && prevFrameDataRef.current.length === data.length) {
      for (let i = 0; i < data.length; i += 16) {
        frameDiffSum += Math.abs(data[i] - prevFrameDataRef.current[i]);
      }
    }
    prevFrameDataRef.current = new Uint8ClampedArray(data);
    // Real camera feeds exhibit sensor noise and micro-tremor > 50; completely frozen feed = 0
    const hasNaturalNoise = frameDiffSum > 20;

    // 2. Average Luminance
    let totalLuminance = 0;
    const step = 4;
    for (let i = 0; i < data.length; i += step * 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
    }
    const avgLum = Math.round(totalLuminance / (data.length / (step * 4)));

    // Set initial room baseline after first 300ms
    if (!baselineSetRef.current) {
      baselineValRef.current = avgLum;
      baselineSetRef.current = true;
    }

    let lightProgress = 0;
    let faceAwayProg = 0;
    let matchScore = 0;

    // Mode: BRIGHTNESS CHECK
    if (mode === 'BRIGHTNESS') {
      const delta = avgLum - baselineValRef.current;
      // Need at least +40 luminance increase above baseline (light turned on)
      const targetDelta = 38;
      if (delta >= targetDelta || avgLum > 140) {
        sustainedLightMsRef.current += deltaMs;
      } else {
        sustainedLightMsRef.current = Math.max(0, sustainedLightMsRef.current - deltaMs * 1.5);
      }
      lightProgress = Math.min(100, Math.round((sustainedLightMsRef.current / 2000) * 100));
    }

    // Mode: FACE-AWAY CHECK
    if (mode === 'FACE_AWAY') {
      // Skin-tone / face cluster density heuristic in normalized RGB / YCbCr
      let skinPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Heuristic bounding for human skin illumination range
        if (r > 95 && g > 40 && b > 20 && (Math.max(r, g, b) - Math.min(r, g, b) > 15) && Math.abs(r - g) > 15 && r > g && r > b) {
          skinPixels++;
        }
      }
      const skinRatio = skinPixels / (width * height);
      // If skin ratio is low (< 0.05), face is not directly looking into the camera
      const faceAbsent = skinRatio < 0.06;

      if (faceAbsent) {
        sustainedFaceAwayMsRef.current += deltaMs;
      } else {
        sustainedFaceAwayMsRef.current = Math.max(0, sustainedFaceAwayMsRef.current - deltaMs * 2);
      }
      faceAwayProg = Math.min(100, Math.round((sustainedFaceAwayMsRef.current / 3000) * 100));
    }

    // Mode: OBJECT MATCH
    if (mode === 'OBJECT_MATCH' && referenceDescriptor) {
      const currentDesc = extractFeatureDescriptor(imgData);
      matchScore = compareDescriptors(referenceDescriptor, currentDesc);
    }

    setState({
      isActive: true,
      permissionDenied: false,
      brightnessValue: avgLum,
      baselineBrightness: baselineValRef.current,
      brightnessTargetReached: lightProgress >= 100,
      brightnessProgress: lightProgress,
      faceAwayProgress: faceAwayProg,
      objectMatchScore: matchScore,
      isLiveFeedValid: hasNaturalNoise,
    });
  }, [compareDescriptors, extractFeatureDescriptor]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    state,
    startCamera,
    stopCamera,
    processFrame,
    extractFeatureDescriptor,
  };
}
