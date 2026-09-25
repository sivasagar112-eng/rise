package com.rise.alarm.exercise

import android.util.Log
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.PoseLandmark
import java.util.concurrent.atomic.AtomicBoolean

/**
 * CameraX [ImageAnalysis.Analyzer] that bridges camera frames to ML Kit Pose Detection
 * and feeds results into an [ExerciseCounter].
 *
 * Responsibilities:
 * - Converts [ImageProxy] to ML Kit [InputImage].
 * - Runs pose detection in STREAM_MODE.
 * - Extracts shoulder/elbow/wrist landmarks into framework-free [LandmarkData].
 * - Feeds landmarks to the [ExerciseCounter] and delivers results via [onStateUpdate].
 * - Handles backpressure: skips frames if the previous detection is still in progress.
 * - Guarantees [ImageProxy.close] is called in every code path.
 * - Never propagates exceptions — all are caught and logged.
 */
class PoseAnalyzer(
    private val poseDetector: PoseDetector,
    private val exerciseCounter: ExerciseCounter,
    private val onStateUpdate: (ExerciseState) -> Unit,
    private val onCompleted: () -> Unit
) : ImageAnalysis.Analyzer {

    companion object {
        private const val TAG = "PoseAnalyzer"

        // The landmark types we care about for upper-body exercises
        private val RELEVANT_LANDMARKS = intArrayOf(
            PoseLandmark.LEFT_SHOULDER,
            PoseLandmark.RIGHT_SHOULDER,
            PoseLandmark.LEFT_ELBOW,
            PoseLandmark.RIGHT_ELBOW,
            PoseLandmark.LEFT_WRIST,
            PoseLandmark.RIGHT_WRIST
        )
    }

    private val isProcessing = AtomicBoolean(false)
    private var completionFired = false

    @OptIn(ExperimentalGetImage::class)
    override fun analyze(imageProxy: ImageProxy) {
        // Backpressure: skip this frame if the previous one is still being processed
        if (isProcessing.get()) {
            imageProxy.close()
            return
        }

        val mediaImage = try {
            imageProxy.image
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get image from ImageProxy", e)
            imageProxy.close()
            return
        }

        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        isProcessing.set(true)

        val inputImage: InputImage
        try {
            inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to create InputImage", e)
            isProcessing.set(false)
            imageProxy.close()
            return
        }

        poseDetector.process(inputImage)
            .addOnSuccessListener { pose ->
                try {
                    val landmarks = if (pose.allPoseLandmarks.isNullOrEmpty()) {
                        emptyList()
                    } else {
                        extractRelevantLandmarks(pose)
                    }

                    val state = exerciseCounter.processPose(landmarks)
                    onStateUpdate(state)

                    if (exerciseCounter.isCompleted && !completionFired) {
                        completionFired = true
                        onCompleted()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing pose result", e)
                }
            }
            .addOnFailureListener { e ->
                Log.w(TAG, "ML Kit pose detection failed", e)
                // Emit a "no tracking" state so the UI stays responsive
                try {
                    val state = exerciseCounter.processPose(emptyList())
                    onStateUpdate(state)
                } catch (ex: Exception) {
                    Log.e(TAG, "Error emitting fallback state", ex)
                }
            }
            .addOnCompleteListener {
                // CRITICAL: always close the ImageProxy and release the processing lock
                isProcessing.set(false)
                imageProxy.close()
            }
    }

    private fun extractRelevantLandmarks(pose: com.google.mlkit.vision.pose.Pose): List<LandmarkData> {
        val result = mutableListOf<LandmarkData>()
        for (type in RELEVANT_LANDMARKS) {
            val lm = pose.getPoseLandmark(type) ?: continue
            result.add(
                LandmarkData(
                    type = lm.landmarkType,
                    x = lm.position.x,
                    y = lm.position.y,
                    confidence = lm.inFrameLikelihood
                )
            )
        }
        return result
    }
}
