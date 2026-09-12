import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import { PoseDetectionEngine } from './PoseDetectionEngine';

/**
 * Singleton model preloader that loads all ML models at app startup
 * so they're ready instantly when an alarm fires.
 *
 * Models loaded:
 * 1. MoveNet Lightning — for pushup pose detection
 * 2. COCO-SSD (lite_mobilenet_v2) — for object scanning
 */

let cocoModel: cocoSsd.ObjectDetection | null = null;
let cocoLoading: Promise<cocoSsd.ObjectDetection> | null = null;
let preloadStarted = false;

export class ModelPreloader {
  /**
   * Preload all ML models in the background. Safe to call multiple times.
   * Does not block — fires and forgets.
   */
  static preloadAll(): void {
    if (preloadStarted) return;
    preloadStarted = true;

    console.log('[ModelPreloader] Starting background preload of all ML models...');

    // Fire both in parallel — errors are caught individually
    ModelPreloader.preloadPoseDetection();
    ModelPreloader.preloadCocoSsd();
  }

  /**
   * Preload MoveNet Lightning for pushup detection.
   */
  static async preloadPoseDetection(): Promise<void> {
    try {
      await PoseDetectionEngine.getDetector();
      console.log('[ModelPreloader] MoveNet Lightning preloaded ✓');
    } catch (err) {
      console.warn('[ModelPreloader] MoveNet preload failed (will retry on demand):', err);
    }
  }

  /**
   * Preload COCO-SSD for object detection.
   */
  static async preloadCocoSsd(): Promise<void> {
    try {
      await ModelPreloader.getCocoSsd();
      console.log('[ModelPreloader] COCO-SSD preloaded ✓');
    } catch (err) {
      console.warn('[ModelPreloader] COCO-SSD preload failed (will retry on demand):', err);
    }
  }

  /**
   * Get (or load) the COCO-SSD object detection model.
   */
  static async getCocoSsd(): Promise<cocoSsd.ObjectDetection> {
    if (cocoModel) return cocoModel;
    if (cocoLoading) return cocoLoading;

    cocoLoading = (async () => {
      console.log('[ModelPreloader] Loading COCO-SSD model...');
      await tf.ready();
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      cocoModel = model;
      console.log('[ModelPreloader] COCO-SSD model loaded successfully');
      return model;
    })();

    return cocoLoading;
  }

  /**
   * Check if all models are loaded.
   */
  static isFullyReady(): boolean {
    return PoseDetectionEngine.isReady() && cocoModel !== null;
  }

  static isCocoReady(): boolean {
    return cocoModel !== null;
  }

  static isPoseReady(): boolean {
    return PoseDetectionEngine.isReady();
  }
}
