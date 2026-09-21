package com.rise.alarm;

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
        if (intent == null) {
            isServiceRunning = false;
            stopSelf();
            return START_NOT_STICKY;
        }

        isServiceRunning = true;

        String alarmId = intent.getStringExtra("alarmId");
        String alarmTime = intent.getStringExtra("alarmTime");
        String alarmLabel = intent.getStringExtra("alarmLabel");
        String dismissalType = intent.getStringExtra("dismissalType");
        int pushupTarget = intent.getIntExtra("pushupTarget", 5);
        int rampDuration = intent.getIntExtra("rampDuration", 30);
        rampDurationMs = rampDuration * 1000;

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
        if (alarmId == null || alarmId.trim().isEmpty()) {
            Log.e(TAG, "AlarmService: alarmId is missing or empty! Stopping service without ringing.");
            stopSelf();
            return START_NOT_STICKY;
        }

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
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // Play alarm sound
        playAlarmSound();

        // Start vibration
        startVibration();

        // Launch the app activity safely (fallback in case not already launched by AlarmTriggerHandler)
        try {
            startActivity(launchIntent);
        } catch (Exception e) {
            Log.d(TAG, "startActivity from AlarmService handled via full-screen intent: " + e.getMessage());
        }

        return START_NOT_STICKY;
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
     * Called from AlarmSchedulerPlugin when the user completes the challenge.
     */
    public static void stopAlarmService(Context context) {
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
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "AlarmService destroyed");

        // Remove foreground notification immediately so it does not stay in notification bar
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
