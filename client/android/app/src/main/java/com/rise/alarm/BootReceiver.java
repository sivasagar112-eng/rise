package com.rise.alarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Re-schedules all stored alarms when the device reboots.
 * Android clears all AlarmManager entries on reboot, so this is essential.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "RiseBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {

            Log.d(TAG, "Device booted, re-scheduling Rise alarms...");
            rescheduleAlarms(context);
        }
    }

    private void rescheduleAlarms(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("rise_alarms", Context.MODE_PRIVATE);
            String alarmsJson = prefs.getString("scheduled_alarms", "[]");
            JSONArray alarmsArray = new JSONArray(alarmsJson);

            for (int i = 0; i < alarmsArray.length(); i++) {
                JSONObject alarm = alarmsArray.getJSONObject(i);

                String alarmId = alarm.optString("alarmId", "");
                long triggerMs = alarm.optLong("triggerMs", 0);
                String alarmTime = alarm.optString("alarmTime", "07:00");
                String alarmLabel = alarm.optString("alarmLabel", "Rise Alarm");
                String dismissalType = alarm.optString("dismissalType", "PUSHUP_MATH");
                int pushupTarget = alarm.optInt("pushupTarget", 5);
                int rampDuration = alarm.optInt("rampDuration", 30);

                // Only reschedule future alarms
                if (triggerMs > System.currentTimeMillis() && !alarmId.isEmpty()) {
                    AlarmSchedulerPlugin.scheduleNativeAlarm(
                        context, alarmId, triggerMs, alarmTime, alarmLabel,
                        dismissalType, pushupTarget, rampDuration
                    );
                    Log.d(TAG, "Re-scheduled alarm: " + alarmId + " at " + alarmTime);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to reschedule alarms after boot", e);
        }
    }
}
