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
        Log.d(TAG, "Alarm received via AlarmManager broadcast");
        AlarmTriggerHandler.handleAlarmTrigger(context, intent);
    }
}
