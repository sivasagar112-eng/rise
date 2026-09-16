package com.rise.alarm;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

/**
 * Unified entry point for routing all alarm triggers (foreground and background).
 */
public class AlarmTriggerHandler {
    private static final String TAG = "AlarmTriggerHandler";
    private static PowerManager.WakeLock wakeLock;

    /**
     * Acquire a partial wake lock from trigger until task Activity reports it is resumed.
     */
    public static synchronized void acquireWakeLock(Context context) {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "rise:trigger_wakelock"
                    );
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(10 * 60 * 1000L); // 10 min fallback safety timeout
                Log.d(TAG, "WakeLock acquired by AlarmTriggerHandler");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock", e);
        }
    }

    /**
     * Released by MainActivity in onResume().
     */
    public static synchronized void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                Log.d(TAG, "WakeLock released by MainActivity.onResume");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to release wake lock", e);
        }
    }

    /**
     * Single entry point for all alarm triggers.
     */
    public static void handleAlarmTrigger(Context context, Intent triggerIntent) {
        if (triggerIntent == null) {
            Log.e(TAG, "Cannot trigger alarm: triggerIntent is null");
            return;
        }

        String alarmId = triggerIntent.getStringExtra("alarmId");
        String alarmTime = triggerIntent.getStringExtra("alarmTime");
        String alarmLabel = triggerIntent.getStringExtra("alarmLabel");
        String dismissalType = triggerIntent.getStringExtra("dismissalType");
        int pushupTarget = triggerIntent.getIntExtra("pushupTarget", 5);
        int rampDuration = triggerIntent.getIntExtra("rampDuration", 30);

        // Validation: If alarmId is absent or invalid, alarm must NOT ring!
        if (alarmId == null || alarmId.trim().isEmpty()) {
            Log.e(TAG, "Cannot trigger alarm: alarmId is missing or empty! Suppressing ring.");
            return;
        }

        // Handle task config defaults explicitly and log
        if (dismissalType == null || dismissalType.trim().isEmpty()) {
            Log.w(TAG, "dismissalType missing for alarm " + alarmId + ", defaulting to PUSHUP_MATH");
            dismissalType = "PUSHUP_MATH";
        }
        if (pushupTarget <= 0) {
            Log.w(TAG, "pushupTarget invalid (" + pushupTarget + ") for alarm " + alarmId + ", defaulting to 5");
            pushupTarget = 5;
        }
        if (alarmTime == null || alarmTime.trim().isEmpty()) {
            alarmTime = "07:00";
        }
        if (alarmLabel == null || alarmLabel.trim().isEmpty()) {
            alarmLabel = "Rise Alarm";
        }

        Log.d(TAG, "handleAlarmTrigger: alarmId=" + alarmId + ", time=" + alarmTime + ", dismissalType=" + dismissalType + ", pushupTarget=" + pushupTarget);

        // Store pending alarm data into plugin so WebView can immediately pull it on cold start
        AlarmSchedulerPlugin.setPendingAlarm(alarmId, alarmTime, alarmLabel, dismissalType, pushupTarget, rampDuration);

        // 1. Hold partial wake lock from trigger until task Activity reports it is resumed
        acquireWakeLock(context);

        // 2. Check foreground state properly using ActivityLifecycleCallbacks counter
        KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        boolean isKeyguardLocked = km != null && km.isKeyguardLocked();
        boolean isForeground = RiseApplication.isAppInForeground() && !isKeyguardLocked;

        Log.d(TAG, "App state evaluation: isForeground=" + isForeground + " (startedCount=" + RiseApplication.isAppInForeground() + ", isKeyguardLocked=" + isKeyguardLocked + ")");

        // Prepare Intent for MainActivity carrying all extras
        Intent activityIntent = new Intent(context, MainActivity.class);
        activityIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        activityIntent.putExtra("alarmId", alarmId);
        activityIntent.putExtra("alarmTime", alarmTime);
        activityIntent.putExtra("alarmLabel", alarmLabel);
        activityIntent.putExtra("dismissalType", dismissalType);
        activityIntent.putExtra("pushupTarget", pushupTarget);
        activityIntent.putExtra("rampDuration", rampDuration);
        activityIntent.putExtra("fromAlarmService", true);

        // Prepare Intent for AlarmService
        Intent serviceIntent = new Intent(context, AlarmService.class);
        serviceIntent.putExtra("alarmId", alarmId);
        serviceIntent.putExtra("alarmTime", alarmTime);
        serviceIntent.putExtra("alarmLabel", alarmLabel);
        serviceIntent.putExtra("dismissalType", dismissalType);
        serviceIntent.putExtra("pushupTarget", pushupTarget);
        serviceIntent.putExtra("rampDuration", rampDuration);

        if (isForeground) {
            // BRANCH 1: App IS in the foreground and unlocked
            // Start the alarm/task Activity directly with startActivity()
            try {
                context.startActivity(activityIntent);
                Log.d(TAG, "Foreground direct startActivity succeeded for MainActivity");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start MainActivity directly in foreground", e);
            }

            // Also start foreground service for audio playback and post notification as fallback
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start AlarmService in foreground", e);
            }
        } else {
            // BRANCH 2: App is backgrounded or screen is locked
            // Start foreground service (mediaPlayback) which posts notification with full-screen intent
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start AlarmService in background", e);
            }

            // Also attempt direct startActivity as well
            try {
                context.startActivity(activityIntent);
            } catch (Exception e) {
                Log.d(TAG, "Background direct startActivity deferred to full-screen intent: " + e.getMessage());
            }
        }
    }
}
