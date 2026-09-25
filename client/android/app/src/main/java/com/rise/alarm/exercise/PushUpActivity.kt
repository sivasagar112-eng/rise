package com.rise.alarm.exercise

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.accurate.AccuratePoseDetectorOptions
import com.rise.alarm.R
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Native Android Activity for push-up counting using CameraX + ML Kit Pose Detection.
 *
 * Launch with intent extras:
 *   - [EXTRA_TARGET_COUNT] (Int, default 10): number of reps to complete.
 *
 * When the target is reached, sets [Activity.RESULT_OK] and finishes.
 * The calling code can use [Activity.startActivityForResult] or
 * [ActivityResultContracts.StartActivityForResult] to receive the completion signal.
 *
 * This activity is self-contained: it handles camera permission requests,
 * CameraX lifecycle binding, ML Kit initialization, and UI updates.
 */
class PushUpActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PushUpActivity"
        const val EXTRA_TARGET_COUNT = "target_rep_count"
        const val EXTRA_COMPLETED_COUNT = "completed_count"
        private const val DEFAULT_TARGET = 10
    }

    // Views
    private lateinit var previewView: PreviewView
    private lateinit var countText: TextView
    private lateinit var statusText: TextView
    private lateinit var permissionOverlay: LinearLayout
    private lateinit var permissionButton: Button

    // Camera
    private lateinit var cameraExecutor: ExecutorService
    private var cameraProvider: ProcessCameraProvider? = null

    // ML Kit
    private var poseDetector: PoseDetector? = null

    // Exercise
    private lateinit var exerciseCounter: PushUpCounter
    private var targetCount: Int = DEFAULT_TARGET

    // Permission handling via modern Activity Result API
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            showCameraUI()
            startCamera()
        } else {
            showPermissionDenied()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_push_up)

        // Keep screen on and show over lock screen (alarm context)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Bind views
        previewView = findViewById(R.id.previewView)
        countText = findViewById(R.id.countText)
        statusText = findViewById(R.id.statusText)
        permissionOverlay = findViewById(R.id.permissionOverlay)
        permissionButton = findViewById(R.id.permissionButton)

        // Read target from intent
        targetCount = intent.getIntExtra(EXTRA_TARGET_COUNT, DEFAULT_TARGET).coerceAtLeast(1)

        // Initialize exercise counter (pure Kotlin, no framework deps)
        exerciseCounter = PushUpCounter(targetCount = targetCount)
        updateCountUI(0)

        // Camera executor for ImageAnalysis
        cameraExecutor = Executors.newSingleThreadExecutor()

        // Permission button handler
        permissionButton.setOnClickListener {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }

        // Check permission and start
        checkCameraPermission()
    }

    private fun checkCameraPermission() {
        when {
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED -> {
                showCameraUI()
                startCamera()
            }
            shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) -> {
                showPermissionRationale()
            }
            else -> {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    private fun showCameraUI() {
        permissionOverlay.visibility = View.GONE
        previewView.visibility = View.VISIBLE
    }

    private fun showPermissionDenied() {
        permissionOverlay.visibility = View.VISIBLE
        previewView.visibility = View.GONE
        val title = permissionOverlay.findViewById<TextView>(R.id.permissionTitle)
        val message = permissionOverlay.findViewById<TextView>(R.id.permissionMessage)
        title.text = "Camera Permission Denied"
        message.text = "Push-up detection requires camera access. Please grant camera permission in Settings."
        permissionButton.text = "Try Again"
    }

    private fun showPermissionRationale() {
        permissionOverlay.visibility = View.VISIBLE
        previewView.visibility = View.GONE
        val title = permissionOverlay.findViewById<TextView>(R.id.permissionTitle)
        val message = permissionOverlay.findViewById<TextView>(R.id.permissionMessage)
        title.text = "Camera Permission Needed"
        message.text = "Push-up detection needs your camera to track your body position and count reps accurately."
        permissionButton.text = "Grant Permission"
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            try {
                val provider = cameraProviderFuture.get()
                cameraProvider = provider
                bindCameraUseCases(provider)
            } catch (e: Exception) {
                Log.e(TAG, "Camera provider initialization failed", e)
                runOnUiThread {
                    statusText.text = "Camera initialization failed"
                }
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCameraUseCases(cameraProvider: ProcessCameraProvider) {
        // Initialize ML Kit Pose Detector (accurate model, STREAM_MODE)
        val options = AccuratePoseDetectorOptions.Builder()
            .setDetectorMode(AccuratePoseDetectorOptions.STREAM_MODE)
            .build()

        poseDetector = PoseDetection.getClient(options)

        // Preview use case
        val preview = Preview.Builder()
            .build()
            .also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

        // ImageAnalysis use case
        val imageAnalysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { analysis ->
                val detector = poseDetector ?: return
                val analyzer = PoseAnalyzer(
                    poseDetector = detector,
                    exerciseCounter = exerciseCounter,
                    onStateUpdate = { state -> handleStateUpdate(state) },
                    onCompleted = { handleExerciseCompleted() }
                )
                analysis.setAnalyzer(cameraExecutor, analyzer)
            }

        // Use front camera (user facing themselves during push-ups)
        val cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA

        try {
            // Unbind any existing use cases before rebinding
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)
            Log.d(TAG, "Camera bound successfully")
            runOnUiThread {
                statusText.text = "Get in position…"
            }
        } catch (e: Exception) {
            Log.e(TAG, "Camera use case binding failed", e)
            runOnUiThread {
                statusText.text = "Camera binding failed"
            }
        }
    }

    private fun handleStateUpdate(state: ExerciseState) {
        // Must update UI on main thread — this callback comes from the camera executor
        runOnUiThread {
            updateCountUI(state.count)
            statusText.text = state.message
        }
    }

    private fun updateCountUI(count: Int) {
        countText.text = "Push-ups: $count / $targetCount"
    }

    /**
     * Called exactly once when the target rep count is reached.
     * Sets the activity result and finishes.
     *
     * To integrate with the alarm flow:
     * - Launch PushUpActivity with startActivityForResult / ActivityResultLauncher.
     * - In onActivityResult, check for RESULT_OK and EXTRA_COMPLETED_COUNT.
     * - Then call your alarm-stopping logic.
     */
    private fun handleExerciseCompleted() {
        Log.d(TAG, "Exercise completed: ${exerciseCounter.currentCount} / $targetCount")
        runOnUiThread {
            countText.text = "Complete! ${exerciseCounter.currentCount} / $targetCount"
            statusText.text = "Great job! 💪"

            val resultIntent = Intent().apply {
                putExtra(EXTRA_COMPLETED_COUNT, exerciseCounter.currentCount)
            }
            setResult(Activity.RESULT_OK, resultIntent)

            // Short delay so the user sees the "Complete!" message
            countText.postDelayed({
                finish()
            }, 1500)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        try {
            poseDetector?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing pose detector", e)
        }
    }
}
