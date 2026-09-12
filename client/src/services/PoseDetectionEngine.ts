import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

/**
 * Singleton service that loads MoveNet Lightning once and provides
 * pose detection + pushup angle helpers.
 *
 * MoveNet Lightning detects 17 COCO keypoints at ~30+ FPS on mobile:
 *   0:nose 1:left_eye 2:right_eye 3:left_ear 4:right_ear
 *   5:left_shoulder 6:right_shoulder 7:left_elbow 8:right_elbow
 *   9:left_wrist 10:right_wrist 11:left_hip 12:right_hip
 *   13:left_knee 14:right_knee 15:left_ankle 16:right_ankle
 */

export interface Keypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

export interface PoseResult {
  keypoints: Keypoint[];
  leftElbowAngle: number | null;
  rightElbowAngle: number | null;
  avgElbowAngle: number | null;
  confidence: number; // average score of shoulder+elbow+wrist keypoints
  isBodyVisible: boolean;
}

let detector: poseDetection.PoseDetector | null = null;
let loading: Promise<poseDetection.PoseDetector> | null = null;

/**
 * Compute angle (in degrees) at point B given three points A→B→C.
 * Returns the interior angle at vertex B.
 */
function angleDeg(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  if (magBA === 0 || magBC === 0) return 180;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

export class PoseDetectionEngine {
  /**
   * Load or return cached MoveNet Lightning detector.
   */
  static async getDetector(): Promise<poseDetection.PoseDetector> {
    if (detector) return detector;
    if (loading) return loading;

    loading = (async () => {
      console.log('[PoseEngine] Initializing TensorFlow.js backend...');
      await tf.ready();
      console.log(`[PoseEngine] TF backend: ${tf.getBackend()}`);

      console.log('[PoseEngine] Loading MoveNet Lightning...');
      const d = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        }
      );
      detector = d;
      console.log('[PoseEngine] MoveNet Lightning loaded successfully');
      return d;
    })();

    return loading;
  }

  /**
   * Run pose detection on a video element and return structured result.
   */
  static async detectPose(video: HTMLVideoElement): Promise<PoseResult | null> {
    const det = detector;
    if (!det || video.readyState < 2) return null;

    try {
      const poses = await det.estimatePoses(video, {
        flipHorizontal: false,
      });

      if (!poses || poses.length === 0) return null;

      const kps = poses[0].keypoints;
      if (!kps || kps.length < 17) return null;

      // Map to our Keypoint interface
      const keypoints: Keypoint[] = kps.map((kp) => ({
        x: kp.x,
        y: kp.y,
        score: kp.score,
        name: kp.name,
      }));

      // Keypoint indices (COCO 17-keypoint format)
      const leftShoulder = keypoints[5];
      const leftElbow = keypoints[7];
      const leftWrist = keypoints[9];
      const rightShoulder = keypoints[6];
      const rightElbow = keypoints[8];
      const rightWrist = keypoints[10];

      const MIN_SCORE = 0.2; // Minimum confidence to use a keypoint

      // Compute elbow angles
      let leftElbowAngle: number | null = null;
      let rightElbowAngle: number | null = null;

      if (
        (leftShoulder.score ?? 0) > MIN_SCORE &&
        (leftElbow.score ?? 0) > MIN_SCORE &&
        (leftWrist.score ?? 0) > MIN_SCORE
      ) {
        leftElbowAngle = angleDeg(leftShoulder, leftElbow, leftWrist);
      }

      if (
        (rightShoulder.score ?? 0) > MIN_SCORE &&
        (rightElbow.score ?? 0) > MIN_SCORE &&
        (rightWrist.score ?? 0) > MIN_SCORE
      ) {
        rightElbowAngle = angleDeg(rightShoulder, rightElbow, rightWrist);
      }

      // Average of available elbow angles
      let avgElbowAngle: number | null = null;
      if (leftElbowAngle !== null && rightElbowAngle !== null) {
        avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
      } else if (leftElbowAngle !== null) {
        avgElbowAngle = leftElbowAngle;
      } else if (rightElbowAngle !== null) {
        avgElbowAngle = rightElbowAngle;
      }

      // Confidence = average score of the 6 arm keypoints
      const armKeypoints = [leftShoulder, leftElbow, leftWrist, rightShoulder, rightElbow, rightWrist];
      const validScores = armKeypoints.filter((kp) => (kp.score ?? 0) > 0).map((kp) => kp.score ?? 0);
      const confidence = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;

      // Body is visible if at least one shoulder + one elbow + one wrist are confident
      const isBodyVisible =
        ((leftShoulder.score ?? 0) > MIN_SCORE || (rightShoulder.score ?? 0) > MIN_SCORE) &&
        ((leftElbow.score ?? 0) > MIN_SCORE || (rightElbow.score ?? 0) > MIN_SCORE) &&
        ((leftWrist.score ?? 0) > MIN_SCORE || (rightWrist.score ?? 0) > MIN_SCORE);

      return {
        keypoints,
        leftElbowAngle,
        rightElbowAngle,
        avgElbowAngle,
        confidence,
        isBodyVisible,
      };
    } catch (err) {
      console.warn('[PoseEngine] Detection error:', err);
      return null;
    }
  }

  /**
   * Draw detected keypoints and skeleton connections onto a canvas.
   */
  static drawPose(
    ctx: CanvasRenderingContext2D,
    keypoints: Keypoint[],
    width: number,
    height: number,
    videoWidth: number,
    videoHeight: number
  ): void {
    const scaleX = width / videoWidth;
    const scaleY = height / videoHeight;

    // Skeleton connections (pairs of keypoint indices)
    const connections: [number, number][] = [
      [5, 7], [7, 9],   // left arm
      [6, 8], [8, 10],  // right arm
      [5, 6],           // shoulders
      [5, 11], [6, 12], // torso
      [11, 12],         // hips
      [11, 13], [13, 15], // left leg
      [12, 14], [14, 16], // right leg
    ];

    // Draw connections
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
    ctx.lineWidth = 2;
    for (const [i, j] of connections) {
      const a = keypoints[i];
      const b = keypoints[j];
      if ((a.score ?? 0) > 0.2 && (b.score ?? 0) > 0.2) {
        ctx.beginPath();
        ctx.moveTo(a.x * scaleX, a.y * scaleY);
        ctx.lineTo(b.x * scaleX, b.y * scaleY);
        ctx.stroke();
      }
    }

    // Draw keypoints
    for (const kp of keypoints) {
      if ((kp.score ?? 0) > 0.2) {
        ctx.fillStyle = (kp.score ?? 0) > 0.5 ? 'lime' : 'yellow';
        ctx.beginPath();
        ctx.arc(kp.x * scaleX, kp.y * scaleY, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  /**
   * Check if detector is loaded.
   */
  static isReady(): boolean {
    return detector !== null;
  }
}
