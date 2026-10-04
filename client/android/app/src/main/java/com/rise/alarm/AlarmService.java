package com.rise.alarm;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.content.pm.ServiceInfo;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that plays the alarm sound using Android's native MediaPlayer.
 * This works even when the app has been swiped away from recents.
 * It also launches MainActivity to display the alarm challenge screen.
 */
public class AlarmService extends Service {
    private static final String TAG = "RiseAlarmService";
    private static final String CHANNEL_ID = "rise_alarm_foreground_channel";
    private static final int NOTIFICATION_ID = 999999;

    public static volatile boolean isServiceRunning = false;
    private static volatile boolean isExplicitlyStopped = false;

    private static final String PREF_ACTIVE_ALARM = "rise_active_alarm_state";
    private static final String KEY_ALARM_ID = "active_alarm_id";
    private static final String KEY_ALARM_TIME = "active_alarm_time";
    private static final String KEY_ALARM_LABEL = "active_alarm_label";
    private static final String KEY_DISMISSAL_TYPE = "active_dismissal_type";
    private static final String KEY_PUSHUP_TARGET = "active_pushup_target";
    private static final String KEY_RAMP_DURATION = "active_ramp_duration";

    private String currentAlarmId;
    private String currentAlarmTime;
    private String currentAlarmLabel;
    private String currentDismissalType;
    private int currentPushupTarget = 5;
    private int currentRampDuration = 30;

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private Handler volumeHandler;
    private Runnable volumeRunnable;
    private float currentVolume = 0.05f;
    private int rampDurationMs = 30000;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String alarmId = null;
        String alarmTime = null;
        String alarmLabel = null;
        String dismissalType = null;
        int pushupTarget = 5;
        int rampDuration = 30;

        if (intent != null) {
            alarmId = intent.getStringExtra("alarmId");
            alarmTime = intent.getStringExtra("alarmTime");
            alarmLabel = intent.getStringExtra("alarmLabel");
            dismissalType = intent.getStringExtra("dismissalType");
            pushupTarget = intent.getIntExtra("pushupTarget", 5);
            rampDuration = intent.getIntExtra("rampDuration", 30);
        }

        // If intent is null (e.g. system restored service via START_STICKY)
        if (alarmId == null || alarmId.trim().isEmpty()) {
            android.content.SharedPreferences prefs = getSharedPreferences(PREF_ACTIVE_ALARM, Context.MODE_PRIVATE);
            alarmId = prefs.getString(KEY_ALARM_ID, null);
            if (alarmId != null && !isExplicitlyStopped) {
                alarmTime = prefs.getString(KEY_ALARM_TIME, "07:00");
                alarmLabel = prefs.getString(KEY_ALARM_LABEL, "Rise Alarm");
                dismissalType = prefs.getString(KEY_DISMISSAL_TYPE, "PUSHUP_MATH");
                pushupTarget = prefs.getInt(KEY_PUSHUP_TARGET, 5);
                rampDuration = prefs.getInt(KEY_RAMP_DURATION, 30);
                Log.d(TAG, "Restored active alarm from preferences on STICKY restart: " + alarmId);
            } else {
                Log.d(TAG, "No active alarm to restore or explicitly stopped. Stopping service.");
                isServiceRunning = false;
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        isExplicitlyStopped = false;
        isServiceRunning = true;

        currentAlarmId = alarmId;
        currentAlarmTime = alarmTime;
        currentAlarmLabel = alarmLabel;
        currentDismissalType = dismissalType;
        currentPushupTarget = pushupTarget;
        currentRampDuration = rampDuration;
        rampDurationMs = rampDuration * 1000;

        // Persist active alarm state in SharedPreferences
        try {
            android.content.SharedPreferences.Editor editor = getSharedPreferences(PREF_ACTIVE_ALARM, Context.MODE_PRIVATE).edit();
            editor.putString(KEY_ALARM_ID, alarmId);
            editor.putString(KEY_ALARM_TIME, alarmTime);
            editor.putString(KEY_ALARM_LABEL, alarmLabel);
            editor.putString(KEY_DISMISSAL_TYPE, dismissalType);
            editor.putInt(KEY_PUSHUP_TARGET, pushupTarget);
            editor.putInt(KEY_RAMP_DURATION, rampDuration);
            editor.apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to persist active alarm state", e);
        }

        Log.d(TAG, "AlarmService started for alarm: " + alarmId + " at " + alarmTime);

        // Acquire wake lock safely
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "rise:alarm_service_wakelock"
                );
                wakeLock.acquire(10 * 60 * 1000L); // 10 minutes max
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock in AlarmService", e);
        }

        // Pulse screen on if device is dark
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "rise:alarm_service_screenlock"
                );
                screenLock.acquire(10000L);
                screenLock.release();
                Log.d(TAG, "AlarmService: Screen bright wake lock pulsed");
            }
        } catch (Exception e) {
            Log.w(TAG, "Screen wake lock exception", e);
        }

        // Build the full-screen intent to launch the app
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("alarmId", alarmId);
        launchIntent.putExtra("alarmTime", alarmTime);
        launchIntent.putExtra("alarmLabel", alarmLabel);
        launchIntent.putExtra("dismissalType", dismissalType);
        launchIntent.putExtra("pushupTarget", pushupTarget);
        launchIntent.putExtra("rampDuration", rampDuration);
        launchIntent.putExtra("fromAlarmService", true);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent fullScreenIntent = PendingIntent.getActivity(
            this, 1, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Build foreground notification
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

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            }
            try {
                startForeground(NOTIFICATION_ID, notification, serviceType);
            } catch (Exception e) {
                Log.w(TAG, "startForeground with SPECIAL_USE failed, falling back to basic startForeground", e);
                try {
                    startForeground(NOTIFICATION_ID, notification);
                } catch (Exception ex) {
                    Log.e(TAG, "Fatal startForeground exception", ex);
                }
            }
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // Play alarm sound
        playAlarmSound();

        // Start vibration
        startVibration();

        // Launch the app activity safely
        try {
            startActivity(launchIntent);
        } catch (Exception e) {
            Log.d(TAG, "startActivity from AlarmService handled via full-screen intent: " + e.getMessage());
        }

        return START_STICKY;
    }

    private void playAlarmSound() {
        try {
            // 1. Release any previously existing audio session before starting a new one
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) {
                        mediaPlayer.stop();
                    }
                    mediaPlayer.release();
                } catch (Exception e) {
                    Log.w(TAG, "Previous MediaPlayer cleanup error", e);
                }
                mediaPlayer = null;
            }

            // Ensure alarm audio volume is audible
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                    int curVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
                    if (curVol == 0) {
                        am.setStreamVolume(AudioManager.STREAM_ALARM, Math.max(1, (int)(maxVol * 0.7f)), 0);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not adjust alarm stream volume", e);
            }

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();

            int resId = getResources().getIdentifier("rise_alarm", "raw", getPackageName());
            if (resId != 0) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    mediaPlayer = MediaPlayer.create(this, resId, audioAttributes, 0);
                } else {
                    mediaPlayer = MediaPlayer.create(this, resId);
                }
            }

            if (mediaPlayer == null) {
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (soundUri == null) {
                    soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                }
                if (soundUri == null) {
                    soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                mediaPlayer = new MediaPlayer();
                mediaPlayer.setAudioAttributes(audioAttributes);
                mediaPlayer.setDataSource(this, soundUri);
                mediaPlayer.prepare();
            }

            mediaPlayer.setLooping(true);
            currentVolume = 0.1f;
            mediaPlayer.setVolume(currentVolume, currentVolume);
            mediaPlayer.start();

            // Gradually ramp up volume smoothly
            volumeHandler = new Handler(Looper.getMainLooper());
            final long startTime = System.currentTimeMillis();
            volumeRunnable = new Runnable() {
                @Override
                public void run() {
                    if (mediaPlayer == null || !mediaPlayer.isPlaying()) return;

                    long elapsed = System.currentTimeMillis() - startTime;
                    float progress = Math.min(1.0f, (float) elapsed / rampDurationMs);
                    currentVolume = 0.1f + progress * 0.9f;
                    mediaPlayer.setVolume(currentVolume, currentVolume);

                    if (progress < 1.0f) {
                        volumeHandler.postDelayed(this, 200);
                    }
                }
            };
            volumeHandler.postDelayed(volumeRunnable, 200);

            Log.d(TAG, "Smooth alarm tone started with volume ramp over " + rampDurationMs + "ms");
        } catch (Exception e) {
            Log.e(TAG, "Failed to play alarm sound", e);
        }
    }

    private void startVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 500, 500, 500, 500};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Vibration failed", e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rise Alarm",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Active alarm notification");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 500, 500});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);
            channel.setSound(null, null); // Sound handled by dedicated MediaPlayer

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Called from AlarmSchedulerPlugin or PushUpActivity when the user completes the challenge.
     */
    public static void stopAlarmService(Context context) {
        isExplicitlyStopped = true;
        isServiceRunning = false;

        try {
            android.content.SharedPreferences.Editor editor = context.getSharedPreferences(PREF_ACTIVE_ALARM, Context.MODE_PRIVATE).edit();
            editor.clear();
            editor.apply();
        } catch (Exception ignored) {}

        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIFICATION_ID);
                nm.cancelAll();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error cancelling notification before stopService", e);
        }
        Intent intent = new Intent(context, AlarmService.class);
        context.stopService(intent);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.d(TAG, "onTaskRemoved: User cut app from recents! Checking if alarm task was completed.");

        // If the alarm has NOT been explicitly stopped by completing the task, keep playing and relaunch app!
        if (isServiceRunning && !isExplicitlyStopped) {
            Log.d(TAG, "Alarm task NOT completed yet! Continuing sound playback and bringing task back.");

            // Keep sound going
            if (mediaPlayer != null) {
                try {
                    if (!mediaPlayer.isPlaying()) {
                        mediaPlayer.start();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "mediaPlayer restart error in onTaskRemoved", e);
                }
            }

            // Immediately relaunch MainActivity so the user cannot bypass the task
            try {
                Intent launchIntent = new Intent(getApplicationContext(), MainActivity.class);
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                launchIntent.putExtra("alarmId", currentAlarmId);
                launchIntent.putExtra("alarmTime", currentAlarmTime);
                launchIntent.putExtra("alarmLabel", currentAlarmLabel);
                launchIntent.putExtra("dismissalType", currentDismissalType);
                launchIntent.putExtra("pushupTarget", currentPushupTarget);
                launchIntent.putExtra("rampDuration", currentRampDuration);
                launchIntent.putExtra("fromAlarmService", true);

                PendingIntent pi = PendingIntent.getActivity(
                    getApplicationContext(),
                    101,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 300, pi);
                    } else {
                        am.setExact(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 300, pi);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to schedule relaunch in onTaskRemoved", e);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "AlarmService onDestroy called. isExplicitlyStopped=" + isExplicitlyStopped + ", isServiceRunning=" + isServiceRunning);

        if (!isExplicitlyStopped && isServiceRunning) {
            Log.w(TAG, "AlarmService was destroyed WITHOUT task completion! Scheduling immediate restart...");
            try {
                Intent restartServiceIntent = new Intent(getApplicationContext(), AlarmService.class);
                restartServiceIntent.putExtra("alarmId", currentAlarmId);
                restartServiceIntent.putExtra("alarmTime", currentAlarmTime);
                restartServiceIntent.putExtra("alarmLabel", currentAlarmLabel);
                restartServiceIntent.putExtra("dismissalType", currentDismissalType);
                restartServiceIntent.putExtra("pushupTarget", currentPushupTarget);
                restartServiceIntent.putExtra("rampDuration", currentRampDuration);

                PendingIntent pi = PendingIntent.getForegroundService(
                    getApplicationContext(),
                    102,
                    restartServiceIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 500, pi);
                    } else {
                        am.setExact(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 500, pi);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to schedule service recovery in onDestroy", e);
            }
            return;
        }

        // Clean up foreground notification
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIFICATION_ID);
                nm.cancelAll();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error removing foreground notification", e);
        }

        if (volumeHandler != null && volumeRunnable != null) {
            volumeHandler.removeCallbacks(volumeRunnable);
        }

        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception e) {
                Log.e(TAG, "MediaPlayer release error", e);
            }
            mediaPlayer = null;
        }

        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }

        isServiceRunning = false;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private String formatTime12h(String time24) {
        if (time24 == null || !time24.contains(":")) return time24;
        try {
            String[] parts = time24.split(":");
            int h = Integer.parseInt(parts[0].trim());
            int m = Integer.parseInt(parts[1].trim());
            String period = h >= 12 ? "PM" : "AM";
            int h12 = h % 12 == 0 ? 12 : h % 12;
            return String.format(java.util.Locale.US, "%d:%02d %s", h12, m, period);
        } catch (Exception e) {
            return time24;
        }
    }
}
