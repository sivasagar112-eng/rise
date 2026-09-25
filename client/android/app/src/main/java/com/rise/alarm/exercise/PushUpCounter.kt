package com.rise.alarm.exercise

/**
 * Push-up counter implementing the [ExerciseCounter] interface.
 *
 * Pure Kotlin with no Android framework or ML Kit dependencies.
 * Uses a three-state machine (UP → TRANSITION → DOWN → TRANSITION → UP)
 * with configurable debounce to prevent flickering at angle boundaries.
 *
 * One rep is counted on a full UP → DOWN → UP cycle.
 *
 * Landmark type constants match ML Kit PoseLandmark:
 *   11 = LEFT_SHOULDER, 12 = RIGHT_SHOULDER
 *   13 = LEFT_ELBOW,    14 = RIGHT_ELBOW
 *   15 = LEFT_WRIST,    16 = RIGHT_WRIST
 */
class PushUpCounter(
    override val targetCount: Int,
    private val upAngleThreshold: Double = 160.0,
    private val downAngleThreshold: Double = 90.0,
    private val minConfidence: Float = 0.5f,
    private val requiredConsecutiveFrames: Int = 3
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

    override fun reset() {
        currentCount = 0
        confirmedPhase = PosePhase.UP
        candidatePhase = PosePhase.UP
        consecutiveFramesInCandidate = 0
        hasBeenDown = false
    }

    override fun processPose(landmarks: List<LandmarkData>): ExerciseState {
        if (isCompleted) {
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = "Complete! $currentCount / $targetCount"
            )
        }

        if (landmarks.isEmpty()) {
            // No pose detected — reset candidate streak but keep confirmed state
            consecutiveFramesInCandidate = 0
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = "Get in frame — no pose detected"
            )
        }

        // Extract relevant landmarks
        val leftShoulder = findLandmark(landmarks, LEFT_SHOULDER)
        val rightShoulder = findLandmark(landmarks, RIGHT_SHOULDER)
        val leftElbow = findLandmark(landmarks, LEFT_ELBOW)
        val rightElbow = findLandmark(landmarks, RIGHT_ELBOW)
        val leftWrist = findLandmark(landmarks, LEFT_WRIST)
        val rightWrist = findLandmark(landmarks, RIGHT_WRIST)

        // Compute elbow angles for each side that has sufficient confidence
        val leftAngle = computeArmAngle(leftShoulder, leftElbow, leftWrist)
        val rightAngle = computeArmAngle(rightShoulder, rightElbow, rightWrist)

        // Use the average of available angles, or a single side if only one is visible
        val angle: Double? = when {
            leftAngle != null && rightAngle != null -> (leftAngle + rightAngle) / 2.0
            leftAngle != null -> leftAngle
            rightAngle != null -> rightAngle
            else -> null
        }

        if (angle == null || angle.isNaN()) {
            consecutiveFramesInCandidate = 0
            return ExerciseState(
                count = currentCount,
                phase = confirmedPhase,
                isTracking = false,
                message = "Position arms in view"
            )
        }

        // Classify the instantaneous phase from the angle
        val instantPhase = classifyPhase(angle)

        // Debounce: only accept a state transition after N consecutive frames
        if (instantPhase == candidatePhase) {
            consecutiveFramesInCandidate++
        } else {
            candidatePhase = instantPhase
            consecutiveFramesInCandidate = 1
        }

        if (consecutiveFramesInCandidate >= requiredConsecutiveFrames && candidatePhase != confirmedPhase) {
            confirmedPhase = candidatePhase

            // Count a rep on the UP transition, but only if we've been through DOWN
            if (confirmedPhase == PosePhase.DOWN) {
                hasBeenDown = true
            } else if (confirmedPhase == PosePhase.UP && hasBeenDown) {
                currentCount++
                hasBeenDown = false
            }
        }

        // Build status message
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

    private fun classifyPhase(angle: Double): PosePhase {
        return when {
            angle >= upAngleThreshold -> PosePhase.UP
            angle <= downAngleThreshold -> PosePhase.DOWN
            else -> PosePhase.TRANSITION
        }
    }

    private fun buildStatusMessage(angle: Double): String {
        val angleStr = "%.0f°".format(angle)
        return when (confirmedPhase) {
            PosePhase.UP -> {
                if (currentCount == 0 && !hasBeenDown) {
                    "Arms extended — ready ($angleStr)"
                } else {
                    "Push-ups: $currentCount / $targetCount  ($angleStr)"
                }
            }
            PosePhase.TRANSITION -> {
                if (hasBeenDown) "Push up! ($angleStr)" else "Going down… ($angleStr)"
            }
            PosePhase.DOWN -> {
                "Down — now push up! ($angleStr)"
            }
        }
    }
}
