package com.rise.alarm.exercise

import kotlin.math.abs

/**
 * Enhanced push-up counter implementing the [ExerciseCounter] interface.
 *
 * Pure Kotlin with no Android framework or ML Kit dependencies.
 * Uses an adaptive state machine (UP → DOWN → UP) with:
 * - Calibrated angle thresholds for front-facing camera perspective on the floor (DOWN <= 102°, UP >= 142°).
 * - Instantaneous inflection detection for fluid pushups (no freezing required at the bottom).
 * - Vertical shoulder displacement tracking to reinforce elbow angle analysis and tolerate partial wrist occlusion.
 * - Fault tolerance for transient frame dropouts.
 *
 * Landmark type constants match ML Kit PoseLandmark:
 *   11 = LEFT_SHOULDER, 12 = RIGHT_SHOULDER
 *   13 = LEFT_ELBOW,    14 = RIGHT_ELBOW
 *   15 = LEFT_WRIST,    16 = RIGHT_WRIST
 */
class PushUpCounter(
    override val targetCount: Int,
    private val upAngleThreshold: Double = 142.0,
    private val downAngleThreshold: Double = 102.0,
    private val minConfidence: Float = 0.35f,
    private val requiredConsecutiveFrames: Int = 2
) : ExerciseCounter {

    // ML Kit PoseLandmark type constants
    companion object {
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
    private var baselineShoulderY: Float? = null
    private var lastRecordedAngle: Double = 170.0

    override fun reset() {
        currentCount = 0
        confirmedPhase = PosePhase.UP
        candidatePhase = PosePhase.UP
        consecutiveFramesInCandidate = 0
        hasBeenDown = false
        missedFrames = 0
        baselineShoulderY = null
        lastRecordedAngle = 170.0
    }

    /**
     * Increment count manually if lighting or pose prevents detection
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
            if (missedFrames > 5) {
                consecutiveFramesInCandidate = 0
            }
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = if (currentCount > 0) "Keep going! ($currentCount/$targetCount)" else "Get in frame — arms visible"
            )
        }

        missedFrames = 0

        // Extract relevant landmarks
        val leftShoulder = findLandmark(landmarks, LEFT_SHOULDER)
        val rightShoulder = findLandmark(landmarks, RIGHT_SHOULDER)
        val leftElbow = findLandmark(landmarks, LEFT_ELBOW)
        val rightElbow = findLandmark(landmarks, RIGHT_ELBOW)
        val leftWrist = findLandmark(landmarks, LEFT_WRIST)
        val rightWrist = findLandmark(landmarks, RIGHT_WRIST)

        // Compute elbow angles
        val leftAngle = computeArmAngle(leftShoulder, leftElbow, leftWrist)
        val rightAngle = computeArmAngle(rightShoulder, rightElbow, rightWrist)

        val angle: Double? = when {
            leftAngle != null && rightAngle != null -> (leftAngle + rightAngle) / 2.0
            leftAngle != null -> leftAngle
            rightAngle != null -> rightAngle
            else -> null
        }

        // Compute average shoulder Y for vertical displacement tracking
        val currentShoulderY: Float? = when {
            leftShoulder != null && rightShoulder != null -> (leftShoulder.y + rightShoulder.y) / 2f
            leftShoulder != null -> leftShoulder.y
            rightShoulder != null -> rightShoulder.y
            else -> null
        }

        if (angle == null || angle.isNaN()) {
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = "Position arms in view"
            )
        }

        lastRecordedAngle = angle

        // Calibrate baseline shoulder height when arms are extended
        if (angle >= upAngleThreshold && currentShoulderY != null) {
            baselineShoulderY = if (baselineShoulderY == null) {
                currentShoulderY
            } else {
                baselineShoulderY!! * 0.85f + currentShoulderY * 0.15f
            }
        }

        // Vertical drop check
        val verticalDrop = if (baselineShoulderY != null && currentShoulderY != null) {
            currentShoulderY - baselineShoulderY!!
        } else 0f

        // Classify instantaneous phase with hybrid angle + vertical drop
        val isDeepDrop = verticalDrop > 35f && angle <= (downAngleThreshold + 10.0)
        val instantPhase = if (angle <= downAngleThreshold || isDeepDrop) {
            PosePhase.DOWN
        } else if (angle >= upAngleThreshold && (verticalDrop < 20f || baselineShoulderY == null)) {
            PosePhase.UP
        } else {
            PosePhase.TRANSITION
        }

        // Inflection optimization: entering DOWN is registered with high responsiveness
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

            val framesNeeded = requiredConsecutiveFrames

            if (consecutiveFramesInCandidate >= framesNeeded) {
                if (candidatePhase == PosePhase.UP && hasBeenDown) {
                    currentCount++
                    hasBeenDown = false
                    confirmedPhase = PosePhase.UP
                } else if (candidatePhase != confirmedPhase) {
                    confirmedPhase = candidatePhase
                }
            }
        }

        val message = buildStatusMessage(angle)

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

    private fun buildStatusMessage(angle: Double): String {
        val angleStr = "%.0f°".format(angle)
        return when {
            confirmedPhase == PosePhase.DOWN || hasBeenDown -> {
                "Chest down — now push up!"
            }
            confirmedPhase == PosePhase.UP -> {
                if (currentCount == 0) {
                    "Ready! Lower your chest to begin"
                } else {
                    "Push-ups: $currentCount / $targetCount"
                }
            }
            else -> {
                if (hasBeenDown) "Push all the way up!" else "Lower down towards floor ($angleStr)"
            }
        }
    }
}
