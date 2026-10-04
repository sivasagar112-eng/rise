package com.rise.alarm;

import android.app.ActivityOptions;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Unified entry point for routing all alarm triggers (foreground and background).
 * Provides multi-layer ringing reliability:
 * 1. Immediate direct MediaPlayer audio playback under WakeLock.
 * 2. High-priority notification with system alarm sound and full-screen intent.
 * 3. Foreground AlarmService execution with specialized subtype.
 * 4. Screen wake-lock to physically turn the device display on when dark/locked.
 */
public class AlarmTriggerHandler {
    private static final String TAG = "AlarmTriggerHandler";
    public static final String NOTIFICATION_CHANNEL_ID = "rise_alarm_channel_v2";
    public static final int NOTIFICATION_ID = 999999;

    private static PowerManager.WakeLock cpuWakeLock;
    private static PowerManager.WakeLock screenWakeLock;
    private static MediaPlayer directPlayer;
    private static Vibrator directVibrator;

    /**
     * Check if alarm is actively ringing anywhere (direct player or service).
     */
    public static synchronized boolean isRinging() {
        boolean directActive = directPlayer != null && directPlayer.isPlaying();
        return directActive || AlarmService.isServiceRunning;
    }

    /**
     * Acquire a CPU partial wake lock to keep the device active while ringing.
     */
    public static synchronized void acquireWakeLock(Context context) {
        try {
            if (cpuWakeLock == null) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    cpuWakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "rise:trigger_wakelock"
                    );
                    cpuWakeLock.setReferenceCounted(false);
                }
            }
            if (cpuWakeLock != null) {
                cpuWakeLock.acquire(15 * 60 * 1000L); // 15 min safety timeout
                Log.d(TAG, "CPU WakeLock acquired by AlarmTriggerHandler");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire CPU wake lock", e);
        }
    }

    /**
     * Turn on physical screen and keep it illuminated so user sees the alarm challenge.
     */
    public static synchronized void wakeScreen(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (screenWakeLock == null) {
                    @SuppressWarnings("deprecation")
                    PowerManager.WakeLock sl = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "rise:screen_trigger_lock"
                    );
                    sl.setReferenceCounted(false);
                    screenWakeLock = sl;
                }
                // Keep screen turned ON for 60 seconds (or until user solves/dismisses)
                screenWakeLock.acquire(60 * 1000L);
                Log.d(TAG, "Screen bright wake lock acquired and held for 60s");
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to hold screen wake lock", e);
        }
    }

    /**
     * Release wake locks when alarm is dismissed.
     */
    public static synchronized void releaseWakeLock() {
        try {
            if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
                cpuWakeLock.release();
                Log.d(TAG, "CPU WakeLock released");
            }
            if (screenWakeLock != null && screenWakeLock.isHeld()) {
                screenWakeLock.release();
                Log.d(TAG, "ScreenWakeLock released");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to release wake lock", e);
        }
    }

    /**
     * Start direct native MediaPlayer playback immediately in AlarmTriggerHandler.
     * This guarantees sound starts playing within milliseconds even if foreground
     * service startup is delayed or throttled by OEM power management.
     */
    public static synchronized void startDirectPlayback(Context context) {
        try {
            stopDirectPlayback();

            // Ensure alarm audio volume is audible
            try {
                AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                    int curVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
                    if (curVol == 0) {
                        am.setStreamVolume(AudioManager.STREAM_ALARM, Math.max(1, (int)(maxVol * 0.8f)), 0);
                        Log.d(TAG, "Unmuted alarm stream volume to 80%");
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not adjust alarm stream volume", e);
            }

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();

            int resId = context.getResources().getIdentifier("rise_alarm", "raw", context.getPackageName());
            if (resId != 0) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    directPlayer = MediaPlayer.create(context, resId, audioAttributes, 0);
                } else {
                    directPlayer = MediaPlayer.create(context, resId);
                }
            }

            if (directPlayer == null) {
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (soundUri == null) {
                    soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                }
                directPlayer = new MediaPlayer();
                directPlayer.setAudioAttributes(audioAttributes);
                directPlayer.setDataSource(context, soundUri);
                directPlayer.prepare();
            }

            directPlayer.setLooping(true);
            directPlayer.setVolume(1.0f, 1.0f);
            directPlayer.start();
            Log.d(TAG, "Direct native MediaPlayer alarm playback started successfully");

            // Direct vibration
            startDirectVibration(context);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start direct alarm playback", e);
        }
    }

    /**
     * Stop direct MediaPlayer playback and vibration.
     */
    public static synchronized void stopDirectPlayback() {
        if (directPlayer != null) {
            try {
                if (directPlayer.isPlaying()) {
                    directPlayer.stop();
                }
                directPlayer.release();
                Log.d(TAG, "Direct MediaPlayer stopped and released");
            } catch (Exception ignored) {}
            directPlayer = null;
        }

        if (directVibrator != null) {
            try {
                directVibrator.cancel();
            } catch (Exception ignored) {}
            directVibrator = null;
        }
    }

    private static void startDirectVibration(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    directVibrator = vm.getDefaultVibrator();
                }
            } else {
                directVibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }

            if (directVibrator != null && directVibrator.hasVibrator()) {
                long[] pattern = {0, 600, 300, 600, 300};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    directVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    directVibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Direct vibration error", e);
        }
    }

    /**
     * Completely stop all alarm components (direct player, service, wakelocks, notifications).
     */
    public static synchronized void stopAlarm(Context context) {
        Log.d(TAG, "Stopping all alarm components");
        stopDirectPlayback();
        AlarmService.stopAlarmService(context);
        releaseWakeLock();

        // Clear notifications
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIFICATION_ID);
                nm.cancel(888888);
            }
        } catch (Exception ignored) {}
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

        // 1. Hold CPU wake lock immediately to prevent sleep
        acquireWakeLock(context);

        // 2. Power on physical screen if dark/locked
        wakeScreen(context);

        // 3. Start immediate direct audio playback
        startDirectPlayback(context);

        // Prepare Activity Intent
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

        // Prepare AlarmService Intent
        Intent serviceIntent = new Intent(context, AlarmService.class);
        serviceIntent.putExtra("alarmId", alarmId);
        serviceIntent.putExtra("alarmTime", alarmTime);
        serviceIntent.putExtra("alarmLabel", alarmLabel);
        serviceIntent.putExtra("dismissalType", dismissalType);
        serviceIntent.putExtra("pushupTarget", pushupTarget);
        serviceIntent.putExtra("rampDuration", rampDuration);

        // 4. Create Notification Channel with ALARM SOUND
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        Uri alarmSoundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.rise_alarm);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_ALARM)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Rise Wake-Up Alarm",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Urgent wake-up alarm sound and full-screen challenge");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);
            channel.setSound(alarmSoundUri, audioAttributes);
            nm.createNotificationChannel(channel);
        }

        // 5. Build PendingIntents with Android 14+ background launch privileges
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

        int reqCode = (int) System.currentTimeMillis();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, reqCode, activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent fullScreenIntent;
        if (activityOptionsBundle != null) {
            fullScreenIntent = PendingIntent.getActivity(
                context, reqCode + 1, activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE,
                activityOptionsBundle
            );
        } else {
            fullScreenIntent = PendingIntent.getActivity(
                context, reqCode + 1, activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        // 6. Build and post Notification with full-screen intent and alarm sound
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

        Notification notification = new NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
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
            .setSound(alarmSoundUri, AudioManager.STREAM_ALARM)
            .build();

        if (nm != null) {
            nm.notify(NOTIFICATION_ID, notification);
            Log.d(TAG, "Direct full-screen alarm notification posted by AlarmTriggerHandler");
        }

        // 7. Start AlarmService for continuous loop audio playback and wake persistence
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

        // 8. Direct startActivity attempt (wakes display if already unlocked)
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
