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
  confidence: number;
  isBodyVisible: boolean; // requires shoulder, elbow, wrist, AND hip
  hasShoulder: boolean;
  hasElbow: boolean;
  hasWrist: boolean;
  hasHip: boolean;
  hasKnee: boolean;
  hasAnkle: boolean;
  midShoulder: Keypoint | null;
  midHip: Keypoint | null;
  midWrist: Keypoint | null;
  shoulderWidth: number;
  isUpright: boolean;
  isHorizontal: boolean;
  torsoAngleDeg: number | null;
  shoulderWristDist: number | null;
  missingLandmarks: string[];
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
   * Run pose detection on a video element and return structured result with full biomechanical checks.
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

      // Keypoint indices (COCO 17-keypoint format):
      // 5:left_shoulder 6:right_shoulder
      // 7:left_elbow    8:right_elbow
      // 9:left_wrist   10:right_wrist
      // 11:left_hip    12:right_hip
      // 13:left_knee   14:right_knee
      // 15:left_ankle  16:right_ankle
      const leftShoulder = keypoints[5];
      const rightShoulder = keypoints[6];
      const leftElbow = keypoints[7];
      const rightElbow = keypoints[8];
      const leftWrist = keypoints[9];
      const rightWrist = keypoints[10];
      const leftHip = keypoints[11];
      const rightHip = keypoints[12];
      const leftKnee = keypoints[13];
      const rightKnee = keypoints[14];
      const leftAnkle = keypoints[15];
      const rightAnkle = keypoints[16];

      const MIN_SCORE = 0.25;

      const hasLeftShoulder = (leftShoulder.score ?? 0) > MIN_SCORE;
      const hasRightShoulder = (rightShoulder.score ?? 0) > MIN_SCORE;
      const hasShoulder = hasLeftShoulder || hasRightShoulder;

      const hasLeftElbow = (leftElbow.score ?? 0) > MIN_SCORE;
      const hasRightElbow = (rightElbow.score ?? 0) > MIN_SCORE;
      const hasElbow = hasLeftElbow || hasRightElbow;

      const hasLeftWrist = (leftWrist.score ?? 0) > MIN_SCORE;
      const hasRightWrist = (rightWrist.score ?? 0) > MIN_SCORE;
      const hasWrist = hasLeftWrist || hasRightWrist;

      const hasLeftHip = (leftHip.score ?? 0) > MIN_SCORE;
      const hasRightHip = (rightHip.score ?? 0) > MIN_SCORE;
      const hasHip = hasLeftHip || hasRightHip;

      const hasLeftKnee = (leftKnee.score ?? 0) > MIN_SCORE;
      const hasRightKnee = (rightKnee.score ?? 0) > MIN_SCORE;
      const hasKnee = hasLeftKnee || hasRightKnee;

      const hasLeftAnkle = (leftAnkle.score ?? 0) > MIN_SCORE;
      const hasRightAnkle = (rightAnkle.score ?? 0) > MIN_SCORE;
      const hasAnkle = hasLeftAnkle || hasRightAnkle;

      // Track missing required landmarks
      const missingLandmarks: string[] = [];
      if (!hasShoulder) missingLandmarks.push('Shoulders');
      if (!hasElbow) missingLandmarks.push('Elbows');
      if (!hasWrist) missingLandmarks.push('Wrists');
      if (!hasHip) missingLandmarks.push('Hips');

      // Compute Mid points
      const computeMid = (kp1: Keypoint, kp2: Keypoint, has1: boolean, has2: boolean): Keypoint | null => {
        if (has1 && has2) {
          return {
            x: (kp1.x + kp2.x) / 2,
            y: (kp1.y + kp2.y) / 2,
            score: ((kp1.score ?? 0) + (kp2.score ?? 0)) / 2,
          };
        }
        if (has1) return { x: kp1.x, y: kp1.y, score: kp1.score };
        if (has2) return { x: kp2.x, y: kp2.y, score: kp2.score };
        return null;
      };

      const midShoulder = computeMid(leftShoulder, rightShoulder, hasLeftShoulder, hasRightShoulder);
      const midHip = computeMid(leftHip, rightHip, hasLeftHip, hasRightHip);
      const midWrist = computeMid(leftWrist, rightWrist, hasLeftWrist, hasRightWrist);
      const midKnee = computeMid(leftKnee, rightKnee, hasLeftKnee, hasRightKnee);

      // Compute shoulder width for spatial scaling
      let shoulderWidth = video.videoWidth * 0.25;
      if (hasLeftShoulder && hasRightShoulder) {
        shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
      }

      // Compute elbow angles
      let leftElbowAngle: number | null = null;
      let rightElbowAngle: number | null = null;

      if (hasLeftShoulder && hasLeftElbow && hasLeftWrist) {
        leftElbowAngle = angleDeg(leftShoulder, leftElbow, leftWrist);
      }
      if (hasRightShoulder && hasRightElbow && hasRightWrist) {
        rightElbowAngle = angleDeg(rightShoulder, rightElbow, rightWrist);
      }

      let avgElbowAngle: number | null = null;
      if (leftElbowAngle !== null && rightElbowAngle !== null) {
        avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
      } else if (leftElbowAngle !== null) {
        avgElbowAngle = leftElbowAngle;
      } else if (rightElbowAngle !== null) {
        avgElbowAngle = rightElbowAngle;
      }

      // Compute distance from shoulder to wrist (used for pushup depth / compression check)
      let shoulderWristDist: number | null = null;
      if (midShoulder && midWrist) {
        shoulderWristDist = Math.hypot(midShoulder.x - midWrist.x, midShoulder.y - midWrist.y);
      }

      // === BODY ORIENTATION CHECK (UPRIGHT vs HORIZONTAL/PLANK) ===
      // A sitting or standing person has shoulders high and hips far below in the Y axis.
      // In a pushup/plank position, the torso is horizontal (side view) or prone on the floor (head-on view).
      let isUpright = false;
      let torsoAngleDeg: number | null = null;

      if (midShoulder && midHip) {
        const dx = Math.abs(midHip.x - midShoulder.x);
        const dy = midHip.y - midShoulder.y; // positive when hip is lower than shoulder in image

        // Torso angle relative to vertical axis (0° = perfectly straight up and down)
        const angleFromVertical = dy > 0 ? (Math.atan2(dx, dy) * 180) / Math.PI : 90;
        torsoAngleDeg = angleFromVertical;

        const vHeight = video.videoHeight || 480;

        // Condition 1: Torso vector is pointing almost straight downwards with significant vertical drop
        const isTorsoVertical = dy > 0 && angleFromVertical < 38 && dy > 0.65 * shoulderWidth && dy > vHeight * 0.12;

        // Condition 2: Head/Shoulder -> Hip -> Knee stacked vertically downwards
        const isStackingVertical =
          hasKnee &&
          midKnee !== null &&
          midHip.y > midShoulder.y + 15 &&
          midKnee.y > midHip.y + 15 &&
          midKnee.y - midShoulder.y > vHeight * 0.22;

        isUpright = isTorsoVertical || isStackingVertical;
      }

      // Horizontal plank check: requires shoulders and hips, and NOT upright
      const isHorizontal = !isUpright && hasShoulder && hasHip;

      // Full body visibility: MUST have shoulders, elbows, wrists, AND hips
      const isBodyVisible = hasShoulder && hasElbow && hasWrist && hasHip;

      // Overall confidence
      const coreKps = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist, leftHip, rightHip];
      const validScores = coreKps.map((k) => k.score ?? 0).filter((s) => s > 0);
      const confidence = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;

      return {
        keypoints,
        leftElbowAngle,
        rightElbowAngle,
        avgElbowAngle,
        confidence,
        isBodyVisible,
        hasShoulder,
        hasElbow,
        hasWrist,
        hasHip,
        hasKnee,
        hasAnkle,
        midShoulder,
        midHip,
        midWrist,
        shoulderWidth,
        isUpright,
        isHorizontal,
        torsoAngleDeg,
        shoulderWristDist,
        missingLandmarks,
      };
    } catch (err) {
      console.warn('[PoseEngine] Detection error:', err);
      return null;
    }
  }

  /**
   * Draw detected keypoints and skeleton connections onto a canvas.
   * Color-codes skeleton green when in valid horizontal plank, or amber/red when upright.
   */
  static drawPose(
    ctx: CanvasRenderingContext2D,
    keypoints: Keypoint[],
    width: number,
    height: number,
    videoWidth: number,
    videoHeight: number,
    isUpright: boolean = false,
    isHorizontal: boolean = false
  ): void {
    const scaleX = width / videoWidth;
    const scaleY = height / videoHeight;

    // Skeleton connections (pairs of keypoint indices)
    const connections: [number, number][] = [
      [5, 7], [7, 9],   // left arm
      [6, 8], [8, 10],  // right arm
      [5, 6],           // shoulders
      [5, 11], [6, 12], // torso sides
      [11, 12],         // hips
      [11, 13], [13, 15], // left leg
      [12, 14], [14, 16], // right leg
    ];

    // Color code: green when horizontal plank, red/amber when upright, cyan default
    const strokeColor = isUpright
      ? 'rgba(239, 68, 68, 0.8)' // Red: upright warning
      : isHorizontal
      ? 'rgba(34, 197, 94, 0.85)' // Green: horizontal plank verified
      : 'rgba(0, 200, 255, 0.7)'; // Cyan: scanning

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    for (const [i, j] of connections) {
      const a = keypoints[i];
      const b = keypoints[j];
      if ((a.score ?? 0) > 0.25 && (b.score ?? 0) > 0.25) {
        ctx.beginPath();
        ctx.moveTo(a.x * scaleX, a.y * scaleY);
        ctx.lineTo(b.x * scaleX, b.y * scaleY);
        ctx.stroke();
      }
    }

    // Draw keypoints
    for (let idx = 5; idx < keypoints.length; idx++) {
      const kp = keypoints[idx];
      if ((kp.score ?? 0) > 0.25) {
        ctx.fillStyle = isUpright ? '#ef4444' : (kp.score ?? 0) > 0.5 ? '#22c55e' : '#eab308';
        ctx.beginPath();
        ctx.arc(kp.x * scaleX, kp.y * scaleY, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
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
