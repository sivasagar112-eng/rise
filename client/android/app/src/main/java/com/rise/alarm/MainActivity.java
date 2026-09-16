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

import android.app.KeyguardManager;
import android.content.Context;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "RiseMainActivity";
    private static final int CAMERA_PERMISSION_CODE = 101;
    private static final int NOTIFICATION_PERMISSION_CODE = 102;

    private NetworkMonitor.NetworkStatusListener networkListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the custom AlarmScheduler plugin BEFORE super.onCreate()
        registerPlugin(AlarmSchedulerPlugin.class);

        super.onCreate(savedInstanceState);

        configureScreenAndKeyguard();
        requestCameraFirst();
        initNetworkMonitoring();
        handleAlarmIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        configureScreenAndKeyguard();
        // Hold a partial WakeLock from trigger until the task Activity reports it is resumed, then release it
        AlarmTriggerHandler.releaseWakeLock();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        configureScreenAndKeyguard();
        handleAlarmIntent(intent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (networkListener != null) {
            NetworkMonitor.getInstance(this).removeListener(networkListener);
            networkListener = null;
        }
    }

    private void configureScreenAndKeyguard() {
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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Request keyguard dismiss so task UI is immediately interactive
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                km.requestDismissKeyguard(this, null);
            }
        }
    }

    private void initNetworkMonitoring() {
        networkListener = isOnline -> {
            Log.d(TAG, "Dispatching networkStatusChanged event: isOnline=" + isOnline);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('networkStatusChanged', { detail: { isOnline: " + isOnline + " } }));",
                            null
                        );
                    }
                });
            }
        };
        NetworkMonitor.getInstance(this).addListener(networkListener);
    }

    /**
     * When AlarmService or AlarmTriggerHandler launches the activity with alarm extras,
     * extract all task configuration and inject JavaScript to trigger the task screen in the WebView.
     */
    private void handleAlarmIntent(Intent intent) {
        if (intent == null) return;
        boolean fromAlarmService = intent.getBooleanExtra("fromAlarmService", false);
        String alarmId = intent.getStringExtra("alarmId");

        // Process if marked fromAlarmService OR if an explicit alarmId extra is present
        if (!fromAlarmService && (alarmId == null || alarmId.trim().isEmpty())) {
            return;
        }

        if (alarmId == null || alarmId.trim().isEmpty()) {
            Log.e(TAG, "handleAlarmIntent: alarmId extra is missing or blank!");
            return;
        }

        String alarmTime = intent.getStringExtra("alarmTime");
        String alarmLabel = intent.getStringExtra("alarmLabel");
        String dismissalType = intent.getStringExtra("dismissalType");
        int pushupTarget = intent.getIntExtra("pushupTarget", 5);
        int rampDuration = intent.getIntExtra("rampDuration", 30);

        // Task configuration fallback handling with explicit logging
        if (dismissalType == null || dismissalType.trim().isEmpty()) {
            Log.w(TAG, "handleAlarmIntent: dismissalType missing, defaulting to PUSHUP_MATH");
            dismissalType = "PUSHUP_MATH";
        }
        if (pushupTarget <= 0) {
            Log.w(TAG, "handleAlarmIntent: pushupTarget <= 0, defaulting to 5");
            pushupTarget = 5;
        }
        if (alarmTime == null || alarmTime.trim().isEmpty()) {
            alarmTime = "07:00";
        }
        if (alarmLabel == null || alarmLabel.trim().isEmpty()) {
            alarmLabel = "Rise Alarm";
        }

        // Clear flag so intent is not repeatedly processed on configuration change
        intent.removeExtra("fromAlarmService");

        Log.d(TAG, "Handling alarm intent: id=" + alarmId + ", task=" + dismissalType + ", target=" + pushupTarget);

        final String finalAlarmId = alarmId;
        final String finalAlarmTime = alarmTime;
        final String finalAlarmLabel = alarmLabel;
        final String finalDismissalType = dismissalType;
        final int finalPushupTarget = pushupTarget;
        final int finalRampDuration = rampDuration;

        // Store into AlarmSchedulerPlugin so TypeScript can synchronously/asynchronously query it upon startup
        AlarmSchedulerPlugin.setPendingAlarm(finalAlarmId, finalAlarmTime, finalAlarmLabel, finalDismissalType, finalPushupTarget, finalRampDuration);

        Runnable dispatchRunnable = () -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String js = String.format(
                    "window.dispatchEvent(new CustomEvent('nativeAlarmFired', { detail: { " +
                    "alarmId: '%s', alarmTime: '%s', alarmLabel: '%s', " +
                    "dismissalType: '%s', pushupTarget: %d, rampDuration: %d } }));",
                    finalAlarmId.replace("'", "\\'"),
                    finalAlarmTime.replace("'", "\\'"),
                    finalAlarmLabel.replace("'", "\\'"),
                    finalDismissalType.replace("'", "\\'"),
                    finalPushupTarget,
                    finalRampDuration
                );
                getBridge().getWebView().evaluateJavascript(js, null);
                Log.d(TAG, "Dispatched nativeAlarmFired event with full task config for: " + finalAlarmId);
            }
        };

        if (getBridge() != null && getBridge().getWebView() != null) {
            // Immediate dispatch if app was already running in foreground
            dispatchRunnable.run();
            // Staggered retries across cold-start window (400ms, 1000ms, 2000ms, 3000ms)
            for (int delayMs : new int[]{400, 1000, 2000, 3000}) {
                getBridge().getWebView().postDelayed(dispatchRunnable, delayMs);
            }
        }
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
