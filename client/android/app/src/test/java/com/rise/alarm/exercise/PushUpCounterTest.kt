package com.rise.alarm.exercise

import org.junit.Assert.*
import org.junit.Test

class PushUpCounterTest {

    @Test
    fun testAngleUtils_rightAngle() {
        val angle = AngleUtils.computeAngle(
            0f, 1f,  // Shoulder (above elbow)
            0f, 0f,  // Elbow (origin)
            1f, 0f   // Wrist (to the right)
        )
        assertEquals(90.0, angle, 0.001)
    }

    @Test
    fun testAngleUtils_straightLine() {
        val angle = AngleUtils.computeAngle(
            0f, -1f, // Shoulder
            0f, 0f,  // Elbow
            0f, 1f   // Wrist
        )
        assertEquals(180.0, angle, 0.001)
    }

    @Test
    fun testAngleUtils_coincidentPointsReturnNaN() {
        val angle = AngleUtils.computeAngle(
            0f, 0f,
            0f, 0f,
            1f, 1f
        )
        assertTrue(angle.isNaN())
    }

    private fun createPoseLandmarks(elbowAngleDegrees: Double, confidence: Float = 0.9f): List<LandmarkData> {
        // Shoulder at (0, 100), Elbow at (0, 0)
        // Wrist position rotated by elbowAngleDegrees
        val rad = Math.toRadians(180.0 - elbowAngleDegrees)
        val wristX = (100.0 * Math.sin(rad)).toFloat()
        val wristY = (-100.0 * Math.cos(rad)).toFloat()

        return listOf(
            LandmarkData(PushUpCounter.LEFT_SHOULDER, 0f, 100f, confidence),
            LandmarkData(PushUpCounter.LEFT_ELBOW, 0f, 0f, confidence),
            LandmarkData(PushUpCounter.LEFT_WRIST, wristX, wristY, confidence),
            LandmarkData(PushUpCounter.RIGHT_SHOULDER, 0f, 100f, confidence),
            LandmarkData(PushUpCounter.RIGHT_ELBOW, 0f, 0f, confidence),
            LandmarkData(PushUpCounter.RIGHT_WRIST, wristX, wristY, confidence)
        )
    }

    @Test
    fun testPushUpCounter_fullCycleCountsOneRep() {
        val counter = PushUpCounter(targetCount = 5, requiredConsecutiveFrames = 3)

        // 1. Initial extended arm position (170°) - 3 frames to confirm UP
        repeat(3) {
            val state = counter.processPose(createPoseLandmarks(170.0))
            assertEquals(PosePhase.UP, state.phase)
            assertEquals(0, state.count)
        }

        // 2. Go DOWN (75°) - 3 frames to confirm DOWN
        repeat(3) {
            val state = counter.processPose(createPoseLandmarks(75.0))
            assertEquals(0, state.count)
        }
        assertEquals(PosePhase.DOWN, counter.processPose(createPoseLandmarks(75.0)).phase)

        // 3. Return UP (170°) - 3 frames to confirm UP
        repeat(2) {
            counter.processPose(createPoseLandmarks(170.0))
            assertEquals(0, counter.currentCount) // Not yet debounced
        }
        val finalState = counter.processPose(createPoseLandmarks(170.0)) // 3rd frame
        assertEquals(1, finalState.count)
        assertEquals(1, counter.currentCount)
        assertEquals(PosePhase.UP, finalState.phase)
    }

    @Test
    fun testPushUpCounter_lowConfidenceIgnored() {
        val counter = PushUpCounter(targetCount = 5, minConfidence = 0.5f)

        // Supply low confidence landmarks
        val lowConfPose = createPoseLandmarks(75.0, confidence = 0.3f)
        val state = counter.processPose(lowConfPose)

        assertFalse(state.isTracking)
        assertEquals(0, state.count)
    }

    @Test
    fun testPushUpCounter_targetCompletion() {
        val counter = PushUpCounter(targetCount = 1, requiredConsecutiveFrames = 1)

        // UP -> DOWN -> UP (1 frame each since requiredConsecutiveFrames = 1)
        counter.processPose(createPoseLandmarks(170.0))
        counter.processPose(createPoseLandmarks(70.0))
        val state = counter.processPose(createPoseLandmarks(170.0))

        assertEquals(1, state.count)
        assertTrue(counter.isCompleted)
    }
}
