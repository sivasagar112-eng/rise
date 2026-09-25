package com.rise.alarm.exercise

/**
 * Represents a single body landmark with position and detection confidence.
 * Decoupled from ML Kit's Pose/PoseLandmark so that counting logic
 * has zero dependency on ML Kit or Android frameworks.
 */
data class LandmarkData(
    /** Landmark type ID (matches ML Kit PoseLandmark constants). */
    val type: Int,
    /** X position in image coordinates. */
    val x: Float,
    /** Y position in image coordinates. */
    val y: Float,
    /** Detection confidence / inFrameLikelihood [0.0, 1.0]. */
    val confidence: Float
)

/**
 * The phase of the exercise repetition cycle.
 */
enum class PosePhase {
    /** Arms extended / standing — the "top" of a push-up. */
    UP,
    /** Between UP and DOWN — angle is in the neutral zone. */
    TRANSITION,
    /** Arms bent / lowered — the "bottom" of a push-up. */
    DOWN
}

/**
 * Snapshot of the current exercise state, emitted after each frame is processed.
 */
data class ExerciseState(
    /** Total completed reps so far. */
    val count: Int,
    /** Current phase of the rep cycle. */
    val phase: PosePhase,
    /** Whether the body is being tracked with sufficient confidence. */
    val isTracking: Boolean,
    /** Human-readable status message for UI display. */
    val message: String
)

/**
 * Contract for any exercise counter.
 *
 * Camera/analyzer code only depends on this interface.
 * To add squats or sit-ups, implement this interface with different
 * angle thresholds, landmark selections, and state logic — no changes
 * to camera setup or PoseAnalyzer needed.
 */
interface ExerciseCounter {
    /**
     * Process landmarks extracted from a single frame.
     * Must be called on each analyzed frame (including frames with no/low-confidence landmarks).
     *
     * @param landmarks List of detected landmarks. May be empty if no pose was detected.
     * @return Current exercise state after processing.
     */
    fun processPose(landmarks: List<LandmarkData>): ExerciseState

    /** Total completed reps. */
    val currentCount: Int

    /** Target number of reps to complete the exercise. */
    val targetCount: Int

    /** True once currentCount >= targetCount. */
    val isCompleted: Boolean

    /** Reset the counter to initial state for a new session. */
    fun reset()
}
