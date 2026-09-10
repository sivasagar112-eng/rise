package com.rise.alarm;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "RiseMainActivity";
    private static final int CAMERA_PERMISSION_CODE = 101;
    private static final int NOTIFICATION_PERMISSION_CODE = 102;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the custom AlarmScheduler plugin BEFORE super.onCreate()
        registerPlugin(AlarmSchedulerPlugin.class);

        super.onCreate(savedInstanceState);

        // Ensure alarm wake-up can turn screen on and display over keyguard/lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }

        // Keep screen on while the activity is visible (important during alarm)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Step 1: Request Camera access first
        requestCameraFirst();

        // Check if launched from AlarmService
        handleAlarmIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle alarm intent when activity is already running (singleTask)
        handleAlarmIntent(intent);
    }

    /**
     * When AlarmService launches the activity with alarm extras,
     * inject JavaScript to trigger the alarm in the WebView.
     */
    private void handleAlarmIntent(Intent intent) {
        if (intent == null) return;
        boolean fromAlarmService = intent.getBooleanExtra("fromAlarmService", false);
        if (!fromAlarmService) return;

        String alarmId = intent.getStringExtra("alarmId");
        if (alarmId == null || alarmId.isEmpty()) return;

        Log.d(TAG, "Handling alarm intent for: " + alarmId);

        // Wait for the WebView to be ready, then inject JS to trigger the alarm
        getBridge().getWebView().postDelayed(() -> {
            String js = "javascript:window.dispatchEvent(new CustomEvent('nativeAlarmFired', { detail: { alarmId: '" + alarmId + "' } }));";
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nativeAlarmFired', { detail: { alarmId: '" + alarmId + "' } }));",
                null
            );
            Log.d(TAG, "Dispatched nativeAlarmFired event for: " + alarmId);
        }, 1500); // 1.5s delay to let WebView fully load
    }

    private void requestCameraFirst() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
        } else {
            // Camera already granted; proceed to notifications
            requestNotificationSecond();
        }
    }

    private void requestNotificationSecond() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_CODE) {
            // Once Camera dialog is answered, immediately prompt for Notifications
            requestNotificationSecond();
        }
    }
}
