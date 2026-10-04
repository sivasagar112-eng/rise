package com.rise.alarm;

import android.app.ActivityOptions;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

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
                        PowerManager.PARTIAL_WAKE_LOCK,
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
     * Turn on physical screen if it is currently dark / interactive is false.
     */
    public static void wakeScreen(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "rise:screen_trigger_lock"
                );
                screenLock.acquire(8000L);
                screenLock.release();
                Log.d(TAG, "Screen bright wake lock pulsed to turn screen on");
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to pulse screen wake lock", e);
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

        // Handle task config defaults & RANDOM assignment explicitly and log
        if (dismissalType == null || dismissalType.trim().isEmpty() || "RANDOM".equalsIgnoreCase(dismissalType)) {
            String[] tasks = {"PUSHUP_MATH", "OBJECT_MATCH", "MATH", "BRIGHTNESS", "CLICK_SHAKE"};
            dismissalType = tasks[new java.util.Random().nextInt(tasks.length)];
            Log.d(TAG, "Assigned random task for alarm " + alarmId + ": " + dismissalType);
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

        // 1b. Ensure physical screen is powered on if device is dark
        wakeScreen(context);

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

        // 3. Ensure Notification Channel exists
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                "rise_alarm_foreground_channel",
                "Rise Alarm",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Active alarm notification");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 500, 500});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);
            channel.setSound(null, null);
            nm.createNotificationChannel(channel);
        }

        // 4. Create PendingIntents with Android 14+ Background Activity Launch privileges
        Bundle activityOptionsBundle = null;
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                ActivityOptions aOptions = ActivityOptions.makeBasic();
                aOptions.setPendingIntentBackgroundActivityStartMode(
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                );
                activityOptionsBundle = aOptions.toBundle();
            } catch (Throwable ignored) {}
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 0, activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent fullScreenIntent;
        if (activityOptionsBundle != null) {
            fullScreenIntent = PendingIntent.getActivity(
                context, 1, activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE,
                activityOptionsBundle
            );
        } else {
            fullScreenIntent = PendingIntent.getActivity(
                context, 1, activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        // 5. Build and immediately post high-priority alarm notification with full-screen intent
        String taskText = "PUSHUP_MATH".equals(dismissalType)
            ? pushupTarget + " Pushups"
            : "CLICK_SHAKE".equals(dismissalType)
            ? "100 Taps + 5 Shakes"
            : "BRIGHTNESS".equals(dismissalType)
            ? "Turn on Room Lights"
            : "OBJECT_MATCH".equals(dismissalType)
            ? "Scan Target Object"
            : "MATH".equals(dismissalType)
            ? "Solve Math Puzzles"
            : dismissalType != null ? dismissalType.replace("_", " ") : "Wake-Up Challenge";

        Notification notification = new NotificationCompat.Builder(context, "rise_alarm_foreground_channel")
            .setContentTitle("⏰ Rise — " + formatTime12h(alarmTime))
            .setContentText("Wake up! Complete: " + taskText)
            .setSmallIcon(R.drawable.ic_alarm_notification)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(fullScreenIntent, true)
            .setOngoing(true)
            .setAutoCancel(false)
            .build();

        if (nm != null) {
            nm.notify(999999, notification);
            Log.d(TAG, "Direct full-screen alarm notification posted by AlarmTriggerHandler");
        }

        // 6. Start AlarmService for continuous loop audio playback and wake persistence
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.d(TAG, "AlarmService start requested by AlarmTriggerHandler");
        } catch (Exception e) {
            Log.w(TAG, "startForegroundService failed, falling back to startService: " + e.getMessage());
            try {
                context.startService(serviceIntent);
            } catch (Exception ex) {
                Log.e(TAG, "Fatal AlarmService start exception: " + ex.getMessage());
            }
        }

        // 7. Direct startActivity attempt (wakes display if already interactive or unlocked)
        try {
            if (activityOptionsBundle != null) {
                context.startActivity(activityIntent, activityOptionsBundle);
            } else {
                context.startActivity(activityIntent);
            }
            Log.d(TAG, "startActivity executed for MainActivity");
        } catch (Exception e) {
            Log.d(TAG, "Direct startActivity deferred to full-screen intent: " + e.getMessage());
        }
    }

    private static String formatTime12h(String time24) {
        if (time24 == null || !time24.contains(":")) return time24 != null ? time24 : "07:00 AM";
        try {
            String[] parts = time24.split(":");
            int h = Integer.parseInt(parts[0].trim());
            int m = Integer.parseInt(parts[1].trim());
            String period = h >= 12 ? "PM" : "AM";
            int h12 = h % 12 == 0 ? 12 : h % 12;
            return String.format("%d:%02d %s", h12, m, period);
        } catch (Exception e) {
            return time24;
        }
    }
}
