package com.rise.alarm.exercise

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Highly upgraded push-up counter implementing the [ExerciseCounter] interface.
 *
 * Pure Kotlin with no Android framework dependencies.
 * Uses an adaptive dual-tracking state machine (UP → DOWN → UP) with:
 * - Calibrated elbow angle analysis (DOWN <= 115°, UP >= 135°).
 * - Full-body & Upper-Torso vertical displacement tracking (Shoulders + Head/Nose):
 *   Guarantees accurate rep counting even when wrists are off-screen or hands are on the floor.
 * - Auto-calibrating baseline height with continuous EMA tracking.
 * - Instantaneous inflection detection for fluid pushups (no freezing required at the bottom).
 * - High tolerance for dim indoor lighting and transient occlusions.
 *
 * Landmark type constants match ML Kit PoseLandmark:
 *   0  = NOSE
 *   11 = LEFT_SHOULDER, 12 = RIGHT_SHOULDER
 *   13 = LEFT_ELBOW,    14 = RIGHT_ELBOW
 *   15 = LEFT_WRIST,    16 = RIGHT_WRIST
 */
class PushUpCounter(
    override val targetCount: Int,
    private val upAngleThreshold: Double = 135.0,
    private val downAngleThreshold: Double = 115.0,
    private val minConfidence: Float = 0.22f,
    private val requiredConsecutiveFrames: Int = 2
) : ExerciseCounter {

    // ML Kit PoseLandmark type constants
    companion object {
        const val NOSE = 0
        const val LEFT_SHOULDER = 11
        const val RIGHT_SHOULDER = 12
        const val LEFT_ELBOW = 13
        const val RIGHT_ELBOW = 14
        const val LEFT_WRIST = 15
        const val RIGHT_WRIST = 16
    }

    override var currentCount: Int = 0
        private set

    override val isCompleted: Boolean
        get() = currentCount >= targetCount

    // Internal state machine
    private var confirmedPhase: PosePhase = PosePhase.UP
    private var candidatePhase: PosePhase = PosePhase.UP
    private var consecutiveFramesInCandidate: Int = 0
    private var hasBeenDown: Boolean = false
    private var missedFrames: Int = 0

    // Vertical tracking
    private var baselineY: Float? = null
    private var lastRecordedAngle: Double? = null

    override fun reset() {
        currentCount = 0
        confirmedPhase = PosePhase.UP
        candidatePhase = PosePhase.UP
        consecutiveFramesInCandidate = 0
        hasBeenDown = false
        missedFrames = 0
        baselineY = null
        lastRecordedAngle = null
    }

    /**
     * Increment count manually if room is pitch dark or camera cannot be placed
     */
    fun incrementManual() {
        if (!isCompleted) {
            currentCount++
        }
    }

    override fun processPose(landmarks: List<LandmarkData>): ExerciseState {
        if (isCompleted) {
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = "Goal reached! $currentCount / $targetCount"
            )
        }

        if (landmarks.isEmpty()) {
            missedFrames++
            if (missedFrames > 6) {
                consecutiveFramesInCandidate = 0
            }
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = if (currentCount > 0) "Keep going! ($currentCount/$targetCount)" else "Position phone on floor in front of you"
            )
        }

        missedFrames = 0

        // Extract key landmarks
        val nose = findLandmark(landmarks, NOSE)
        val leftShoulder = findLandmark(landmarks, LEFT_SHOULDER)
        val rightShoulder = findLandmark(landmarks, RIGHT_SHOULDER)
        val leftElbow = findLandmark(landmarks, LEFT_ELBOW)
        val rightElbow = findLandmark(landmarks, RIGHT_ELBOW)
        val leftWrist = findLandmark(landmarks, LEFT_WRIST)
        val rightWrist = findLandmark(landmarks, RIGHT_WRIST)

        // 1. Arm Angles (when available)
        val leftAngle = computeArmAngle(leftShoulder, leftElbow, leftWrist)
        val rightAngle = computeArmAngle(rightShoulder, rightElbow, rightWrist)

        val armAngle: Double? = when {
            leftAngle != null && rightAngle != null -> (leftAngle + rightAngle) / 2.0
            leftAngle != null -> leftAngle
            rightAngle != null -> rightAngle
            else -> null
        }
        if (armAngle != null && !armAngle.isNaN()) {
            lastRecordedAngle = armAngle
        }

        // 2. Vertical Torso & Head Tracking
        // Computes mid-upper body Y position (Shoulders + Nose)
        val yPoints = mutableListOf<Float>()
        if (leftShoulder != null) yPoints.add(leftShoulder.y)
        if (rightShoulder != null) yPoints.add(rightShoulder.y)
        if (nose != null) yPoints.add(nose.y)

        if (yPoints.isEmpty()) {
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = "Face camera while on the floor"
            )
        }

        val currentY = yPoints.sum() / yPoints.size.toFloat()

        // Approximate scale reference using shoulder width
        val shoulderWidth = if (leftShoulder != null && rightShoulder != null) {
            val dx = leftShoulder.x - rightShoulder.x
            val dy = leftShoulder.y - rightShoulder.y
            sqrt(dx * dx + dy * dy).coerceAtLeast(80f)
        } else {
            120f
        }

        // Initialize or gently adapt baseline UP height
        val isLikelyUp = armAngle == null || armAngle >= upAngleThreshold
        if (baselineY == null) {
            baselineY = currentY
        } else if (isLikelyUp && currentY < baselineY!!) {
            // User pushed higher up than previous baseline
            baselineY = baselineY!! * 0.8f + currentY * 0.2f
        } else if (isLikelyUp && !hasBeenDown) {
            baselineY = baselineY!! * 0.95f + currentY * 0.05f
        }

        val verticalDropPx = max(0f, currentY - (baselineY ?: currentY))
        val verticalDropRatio = verticalDropPx / shoulderWidth

        // 3. Dual-Mode Instantaneous Phase Classification
        val instantPhase: PosePhase = if (armAngle != null) {
            // Both angle and vertical displacement available
            val isAngleDown = armAngle <= downAngleThreshold
            val isHybridDown = armAngle <= (downAngleThreshold + 12.0) && verticalDropRatio >= 0.14f
            val isPureDropDown = verticalDropRatio >= 0.26f

            if (isAngleDown || isHybridDown || isPureDropDown) {
                PosePhase.DOWN
            } else if (armAngle >= upAngleThreshold && verticalDropRatio <= 0.08f) {
                PosePhase.UP
            } else {
                PosePhase.TRANSITION
            }
        } else {
            // Wrists out of frame (hands on floor) -> Vertical displacement tracking
            if (verticalDropRatio >= 0.20f) {
                PosePhase.DOWN
            } else if (verticalDropRatio <= 0.07f) {
                PosePhase.UP
            } else {
                PosePhase.TRANSITION
            }
        }

        // 4. Smooth State Machine with Inflection Snapping
        if (instantPhase == PosePhase.DOWN) {
            hasBeenDown = true
            confirmedPhase = PosePhase.DOWN
            candidatePhase = PosePhase.DOWN
            consecutiveFramesInCandidate = requiredConsecutiveFrames
        } else {
            if (instantPhase == candidatePhase) {
                consecutiveFramesInCandidate++
            } else {
                candidatePhase = instantPhase
                consecutiveFramesInCandidate = 1
            }

            if (consecutiveFramesInCandidate >= requiredConsecutiveFrames) {
                if (candidatePhase == PosePhase.UP && hasBeenDown) {
                    currentCount++
                    hasBeenDown = false
                    confirmedPhase = PosePhase.UP
                } else if (candidatePhase != confirmedPhase) {
                    confirmedPhase = candidatePhase
                }
            }
        }

        val message = buildStatusMessage(armAngle, verticalDropRatio)

        return ExerciseState(
            count = currentCount,
            phase = confirmedPhase,
            isTracking = true,
            message = message
        )
    }

    private fun findLandmark(landmarks: List<LandmarkData>, type: Int): LandmarkData? {
        val lm = landmarks.find { it.type == type } ?: return null
        return if (lm.confidence >= minConfidence) lm else null
    }

    private fun computeArmAngle(
        shoulder: LandmarkData?,
        elbow: LandmarkData?,
        wrist: LandmarkData?
    ): Double? {
        if (shoulder == null || elbow == null || wrist == null) return null
        val angle = AngleUtils.computeAngle(shoulder, elbow, wrist)
        return if (angle.isNaN()) null else angle
    }

    private fun buildStatusMessage(angle: Double?, dropRatio: Float): String {
        return when {
            confirmedPhase == PosePhase.DOWN || hasBeenDown -> {
                "Chest down — now push all the way up! 💪"
            }
            confirmedPhase == PosePhase.UP -> {
                if (currentCount == 0) {
                    "Ready! Lower your chest towards floor"
                } else {
                    "Pushups: $currentCount / $targetCount"
                }
            }
            else -> {
                if (hasBeenDown) {
                    "Push up to finish rep!"
                } else if (angle != null) {
                    "Lower down (%.0f°)".format(angle)
                } else {
                    "Lower your chest (%.0f%% drop)".format(dropRatio * 100f)
                }
            }
        }
    }
}
