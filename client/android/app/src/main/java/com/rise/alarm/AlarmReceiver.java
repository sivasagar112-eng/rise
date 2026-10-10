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
        Log.i(TAG, "Alarm received via AlarmManager broadcast: " + (intent != null ? intent.getAction() : "null"));
        final PendingResult pendingResult = goAsync();
        try {
            AlarmTriggerHandler.handleAlarmTrigger(context, intent);
        } catch (Throwable t) {
            Log.e(TAG, "Error handling alarm trigger in AlarmReceiver", t);
        }

        // Hold broadcast result active for 10 seconds so the OS does not freeze
        // or kill the background process while AlarmService initializes and calls startForeground()
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (pendingResult != null) {
                    pendingResult.finish();
                    Log.d(TAG, "AlarmReceiver pendingResult finished after 10s handover delay");
                }
            } catch (Exception ignored) {}
        }, 10000L);
    }
}
