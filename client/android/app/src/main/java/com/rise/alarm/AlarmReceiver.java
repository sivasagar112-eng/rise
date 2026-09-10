package com.rise.alarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

/**
 * BroadcastReceiver that fires when Android's AlarmManager delivers an exact alarm.
 * It acquires a wake lock and starts AlarmService as a foreground service to play
 * the alarm sound and bring the app to the foreground.
 */
public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "RiseAlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarm received!");

        String alarmId = intent.getStringExtra("alarmId");
        String alarmTime = intent.getStringExtra("alarmTime");
        String alarmLabel = intent.getStringExtra("alarmLabel");
        String dismissalType = intent.getStringExtra("dismissalType");
        int pushupTarget = intent.getIntExtra("pushupTarget", 5);
        int rampDuration = intent.getIntExtra("rampDuration", 30);

        // Acquire a partial wake lock to ensure the device stays awake
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "rise:alarm_wakelock"
        );
        wl.acquire(5 * 60 * 1000L); // 5 minutes max

        // Start the foreground service to play alarm sound
        Intent serviceIntent = new Intent(context, AlarmService.class);
        serviceIntent.putExtra("alarmId", alarmId);
        serviceIntent.putExtra("alarmTime", alarmTime != null ? alarmTime : "07:00");
        serviceIntent.putExtra("alarmLabel", alarmLabel != null ? alarmLabel : "Rise Alarm");
        serviceIntent.putExtra("dismissalType", dismissalType != null ? dismissalType : "PUSHUP_MATH");
        serviceIntent.putExtra("pushupTarget", pushupTarget);
        serviceIntent.putExtra("rampDuration", rampDuration);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        // Release wake lock after service is started (service manages its own)
        if (wl.isHeld()) {
            wl.release();
        }
    }
}
