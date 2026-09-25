package com.rise.alarm;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "RiseMainActivity";
    private static final int CAMERA_PERMISSION_CODE = 101;
    private static final int NOTIFICATION_PERMISSION_CODE = 102;
    private PermissionRequest pendingPermissionRequest = null;

    private NetworkMonitor.NetworkStatusListener networkListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the custom AlarmScheduler plugin BEFORE super.onCreate()
        registerPlugin(AlarmSchedulerPlugin.class);

        super.onCreate(savedInstanceState);

        setupWebViewPermissionHandler();
        configureScreenAndKeyguard();
        requestCameraFirst();
        initNetworkMonitoring();
        handleAlarmIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        configureScreenAndKeyguard();
        setupWebViewPermissionHandler();
        // Hold a partial WakeLock from trigger until the task Activity reports it is resumed, then release it
        AlarmTriggerHandler.releaseWakeLock();
    }

    private void setupWebViewPermissionHandler() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);

                webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        runOnUiThread(() -> {
                            try {
                                Log.d(TAG, "WebView onPermissionRequest: " + java.util.Arrays.toString(request.getResources()));
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                    pendingPermissionRequest = request;
                                    ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
                                    Log.d(TAG, "WebView camera permission pending user dialog");
                                    return;
                                }
                                request.grant(request.getResources());
                                Log.d(TAG, "WebView onPermissionRequest: GRANTED immediately");
                            } catch (Exception e) {
                                Log.e(TAG, "Error in onPermissionRequest", e);
                            }
                        });
                    }
                });
                Log.d(TAG, "setupWebViewPermissionHandler configured successfully");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to setup WebView WebChromeClient", e);
        }
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

        // Process only if fromAlarmService flag is present or AlarmService is actively running
        if (!fromAlarmService && !AlarmService.isServiceRunning) {
            Log.d(TAG, "handleAlarmIntent: Ignoring intent because AlarmService is not running (regular app open)");
            return;
        }

        if (alarmId == null || alarmId.trim().isEmpty()) {
            Log.d(TAG, "handleAlarmIntent: alarmId extra is missing or blank, skipping");
            return;
        }

        String alarmTime = intent.getStringExtra("alarmTime");
        String alarmLabel = intent.getStringExtra("alarmLabel");
        String dismissalType = intent.getStringExtra("dismissalType");
        int pushupTarget = intent.getIntExtra("pushupTarget", 5);
        int rampDuration = intent.getIntExtra("rampDuration", 30);

        // Task configuration fallback handling with explicit logging
        if (dismissalType == null || dismissalType.trim().isEmpty() || "RANDOM".equalsIgnoreCase(dismissalType)) {
            String[] tasks = {"PUSHUP_MATH", "OBJECT_MATCH", "MATH", "BRIGHTNESS", "CLICK_SHAKE"};
            dismissalType = tasks[new java.util.Random().nextInt(tasks.length)];
            Log.d(TAG, "handleAlarmIntent: dismissalType resolved to random task: " + dismissalType);
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

        // CRITICAL: Clear all extras immediately so this intent never replays on config change or recents restart
        intent.removeExtra("fromAlarmService");
        intent.removeExtra("alarmId");
        intent.removeExtra("alarmTime");
        intent.removeExtra("alarmLabel");
        intent.removeExtra("dismissalType");
        intent.removeExtra("pushupTarget");
        intent.removeExtra("rampDuration");
        setIntent(new Intent(this, MainActivity.class));

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

        Handler handler = new Handler(Looper.getMainLooper());
        for (int delayMs : new int[]{0, 400, 1000, 2000, 3500}) {
            handler.postDelayed(dispatchRunnable, delayMs);
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
            } else {
                requestBatteryOptimizationExemption();
            }
        } else {
            requestBatteryOptimizationExemption();
        }
    }

    private void requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    Log.d(TAG, "Prompted user for battery optimization exemption");
                }
            } catch (Exception e) {
                Log.w(TAG, "Battery optimization request failed", e);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingPermissionRequest != null) {
                    try {
                        pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                        Log.d(TAG, "Granted pendingPermissionRequest after user approved dialog");
                    } catch (Exception e) {
                        Log.e(TAG, "Error granting pending permission request", e);
                    }
                    pendingPermissionRequest = null;
                }
            } else {
                if (pendingPermissionRequest != null) {
                    try {
                        pendingPermissionRequest.deny();
                    } catch (Exception ignored) {}
                    pendingPermissionRequest = null;
                }
            }
            // Once Camera dialog is answered, immediately prompt for Notifications
            requestNotificationSecond();
        } else if (requestCode == NOTIFICATION_PERMISSION_CODE) {
            // Once Notification dialog is answered, prompt for Battery Optimization
            requestBatteryOptimizationExemption();
        }
    }
}
