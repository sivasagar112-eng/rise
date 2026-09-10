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
            stopSelf();
            return START_NOT_STICKY;
        }

        String alarmId = intent.getStringExtra("alarmId");
        String alarmTime = intent.getStringExtra("alarmTime");
        String alarmLabel = intent.getStringExtra("alarmLabel");
        String dismissalType = intent.getStringExtra("dismissalType");
        int pushupTarget = intent.getIntExtra("pushupTarget", 5);
        int rampDuration = intent.getIntExtra("rampDuration", 30);
        rampDurationMs = rampDuration * 1000;

        Log.d(TAG, "AlarmService started for alarm: " + alarmId + " at " + alarmTime);

        // Acquire wake lock
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "rise:alarm_service_wakelock"
        );
        wakeLock.acquire(10 * 60 * 1000L); // 10 minutes max

        // Build the full-screen intent to launch the app
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("alarmId", alarmId);
        launchIntent.putExtra("alarmTime", alarmTime);
        launchIntent.putExtra("alarmLabel", alarmLabel);
        launchIntent.putExtra("dismissalType", dismissalType);
        launchIntent.putExtra("pushupTarget", pushupTarget);
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
            : dismissalType != null ? dismissalType.replace("_", " ") : "Wake-Up Challenge";

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("⏰ Rise — " + alarmTime)
            .setContentText("Wake up! Complete: " + taskText)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(fullScreenIntent, true)
            .setOngoing(true)
            .setAutoCancel(false)
            .build();

        startForeground(NOTIFICATION_ID, notification);

        // Play alarm sound
        playAlarmSound();

        // Start vibration
        startVibration();

        // Launch the app activity
        startActivity(launchIntent);

        return START_NOT_STICKY;
    }

    private void playAlarmSound() {
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            mediaPlayer.setLooping(true);
            mediaPlayer.setVolume(currentVolume, currentVolume);
            mediaPlayer.prepare();
            mediaPlayer.start();

            // Gradually ramp up volume
            volumeHandler = new Handler(Looper.getMainLooper());
            final long startTime = System.currentTimeMillis();
            volumeRunnable = new Runnable() {
                @Override
                public void run() {
                    if (mediaPlayer == null || !mediaPlayer.isPlaying()) return;

                    long elapsed = System.currentTimeMillis() - startTime;
                    float progress = Math.min(1.0f, (float) elapsed / rampDurationMs);
                    currentVolume = 0.05f + progress * 0.95f;
                    mediaPlayer.setVolume(currentVolume, currentVolume);

                    if (progress < 1.0f) {
                        volumeHandler.postDelayed(this, 200);
                    }
                }
            };
            volumeHandler.postDelayed(volumeRunnable, 200);

            Log.d(TAG, "Alarm sound started with volume ramp over " + rampDurationMs + "ms");
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
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), audioAttributes);

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
        Intent intent = new Intent(context, AlarmService.class);
        context.stopService(intent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "AlarmService destroyed");

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
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
