package com.rise.alarm;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Custom Capacitor plugin that bridges TypeScript alarm scheduling to Android's
 * native AlarmManager.setAlarmClock(). This is the most reliable API for alarm
 * apps — it shows the alarm icon in the status bar and guarantees delivery even
 * in Doze mode or when the app is killed.
 */
@CapacitorPlugin(name = "AlarmScheduler")
public class AlarmSchedulerPlugin extends Plugin {
    private static final String TAG = "RiseAlarmScheduler";
    private static final String PREFS_NAME = "rise_alarms";
    private static final String PREFS_KEY = "scheduled_alarms";

    private static JSObject pendingAlarmData = null;

    public static synchronized void setPendingAlarm(
        String alarmId, String alarmTime, String alarmLabel,
        String dismissalType, int pushupTarget, int rampDuration
    ) {
        JSObject obj = new JSObject();
        obj.put("alarmId", alarmId);
        obj.put("alarmTime", alarmTime);
        obj.put("alarmLabel", alarmLabel);
        obj.put("dismissalType", dismissalType);
        obj.put("pushupTarget", pushupTarget);
        obj.put("rampDuration", rampDuration);
        pendingAlarmData = obj;
        Log.d(TAG, "Saved pendingAlarmData for: " + alarmId);
    }

    public static synchronized JSObject getPendingAlarmData() {
        return pendingAlarmData;
    }

    public static synchronized void clearPendingAlarmData() {
        pendingAlarmData = null;
        Log.d(TAG, "Cleared pendingAlarmData");
    }

    /**
     * Schedule an exact alarm using AlarmManager.setAlarmClock()
     * Called from TypeScript: AlarmScheduler.scheduleExact({ alarmId, triggerMs, ... })
     */
    @PluginMethod
    public void scheduleExact(PluginCall call) {
        String alarmId = call.getString("alarmId", "");
        long triggerMs = call.getLong("triggerMs", 0L);
        String alarmTime = call.getString("alarmTime", "07:00");
        String alarmLabel = call.getString("alarmLabel", "Rise Alarm");
        String dismissalType = call.getString("dismissalType", "PUSHUP_MATH");
        int pushupTarget = call.getInt("pushupTarget", 5);
        int rampDuration = call.getInt("rampDuration", 30);

        if (alarmId.isEmpty() || triggerMs == 0) {
            call.reject("alarmId and triggerMs are required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am != null && !am.canScheduleExactAlarms()) {
                Log.w(TAG, "scheduleExact: App lacks SCHEDULE_EXACT_ALARM permission on Android 12+");
            }
        }

        try {
            scheduleNativeAlarm(
                getContext(), alarmId, triggerMs, alarmTime, alarmLabel,
                dismissalType, pushupTarget, rampDuration
            );

            // Persist alarm data for BootReceiver to use after reboot
            saveAlarmToPrefs(alarmId, triggerMs, alarmTime, alarmLabel, dismissalType, pushupTarget, rampDuration);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("alarmId", alarmId);
            result.put("triggerMs", triggerMs);
            call.resolve(result);

            Log.d(TAG, "Scheduled exact alarm: " + alarmId + " at " + alarmTime + " (trigger: " + triggerMs + ")");
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule alarm", e);
            call.reject("Failed to schedule alarm: " + e.getMessage());
        }
    }

    /**
     * Cancel a specific alarm by ID
     */
    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        String alarmId = call.getString("alarmId", "");
        if (alarmId.isEmpty()) {
            call.reject("alarmId is required");
            return;
        }

        try {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = createAlarmPendingIntent(getContext(), alarmId, "", "", "", 5, 30);
            am.cancel(pi);
            pi.cancel();

            removeAlarmFromPrefs(alarmId);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

            Log.d(TAG, "Cancelled alarm: " + alarmId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel alarm", e);
            call.reject("Failed to cancel alarm: " + e.getMessage());
        }
    }

    /**
     * Cancel all scheduled alarms
     */
    @PluginMethod
    public void cancelAll(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String alarmsJson = prefs.getString(PREFS_KEY, "[]");
            JSONArray alarmsArray = new JSONArray(alarmsJson);

            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);

            for (int i = 0; i < alarmsArray.length(); i++) {
                JSONObject alarm = alarmsArray.getJSONObject(i);
                String alarmId = alarm.optString("alarmId", "");
                if (!alarmId.isEmpty()) {
                    PendingIntent pi = createAlarmPendingIntent(getContext(), alarmId, "", "", "", 5, 30);
                    am.cancel(pi);
                    pi.cancel();
                }
            }

            prefs.edit().putString(PREFS_KEY, "[]").apply();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

            Log.d(TAG, "Cancelled all alarms");
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel all alarms", e);
            call.reject("Failed to cancel all alarms: " + e.getMessage());
        }
    }

    /**
     * Stop the currently ringing alarm service (called when user completes the challenge)
     */
    @PluginMethod
    public void stopRinging(PluginCall call) {
        try {
            AlarmService.stopAlarmService(getContext());
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            Log.d(TAG, "Stopped ringing alarm service");
        } catch (Exception e) {
            call.reject("Failed to stop ringing: " + e.getMessage());
        }
    }

    /**
     * Start the native AlarmService to play the single smooth ringtone on native Android
     * Routed through unified AlarmTriggerHandler
     */
    @PluginMethod
    public void startRinging(PluginCall call) {
        try {
            String alarmId = call.getString("alarmId", "test-alarm");
            String alarmTime = call.getString("alarmTime", "07:00");
            String alarmLabel = call.getString("alarmLabel", "Rise Alarm");
            String dismissalType = call.getString("dismissalType", "PUSHUP_MATH");
            int pushupTarget = call.getInt("pushupTarget", 5);
            int rampDuration = call.getInt("rampDuration", 30);

            Intent triggerIntent = new Intent();
            triggerIntent.putExtra("alarmId", alarmId);
            triggerIntent.putExtra("alarmTime", alarmTime);
            triggerIntent.putExtra("alarmLabel", alarmLabel);
            triggerIntent.putExtra("dismissalType", dismissalType);
            triggerIntent.putExtra("pushupTarget", pushupTarget);
            triggerIntent.putExtra("rampDuration", rampDuration);

            AlarmTriggerHandler.handleAlarmTrigger(getContext(), triggerIntent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            Log.d(TAG, "Started ringing via AlarmTriggerHandler for alarm " + alarmId);
        } catch (Exception e) {
            call.reject("Failed to start ringing: " + e.getMessage());
        }
    }

    /**
     * Get live validated network status from NetworkMonitor
     */
    @PluginMethod
    public void getNetworkStatus(PluginCall call) {
        boolean isOnline = NetworkMonitor.getInstance(getContext()).isOnline();
        JSObject result = new JSObject();
        result.put("isOnline", isOnline);
        call.resolve(result);
    }

    /**
     * Check exact alarm scheduling capability on Android 12+ (API 31+)
     */
    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            result.put("canSchedule", am != null && am.canScheduleExactAlarms());
        } else {
            result.put("canSchedule", true);
        }
        call.resolve(result);
    }

    /**
     * Request exact alarm scheduling permission by opening system settings on Android 12+
     */
    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am != null && !am.canScheduleExactAlarms()) {
                Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
        }
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Check whether the app is whitelisted from battery optimizations (Doze mode)
     */
    @PluginMethod
    public void isBatteryOptimizationIgnored(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean isIgnoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            result.put("isIgnored", isIgnoring);
        } else {
            result.put("isIgnored", true);
        }
        call.resolve(result);
    }

    /**
     * Request exemption from battery optimizations via system dialog
     */
    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                    Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not launch battery optimization intent directly, opening battery settings", e);
                try {
                    Intent intent = new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception ignored) {}
            }
        }
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Retrieve any pending alarm that caused the app to launch or ring
     */
    @PluginMethod
    public void getPendingAlarm(PluginCall call) {
        JSObject result = new JSObject();
        synchronized (AlarmSchedulerPlugin.class) {
            if (pendingAlarmData != null) {
                result.put("alarm", pendingAlarmData);
            } else {
                result.put("alarm", JSObject.NULL);
            }
        }
        call.resolve(result);
    }

    /**
     * Clear the pending alarm once processed or dismissed
     */
    @PluginMethod
    public void clearPendingAlarm(PluginCall call) {
        synchronized (AlarmSchedulerPlugin.class) {
            pendingAlarmData = null;
        }
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    // --- Static helpers (also used by BootReceiver) ---

    public static void scheduleNativeAlarm(
        Context context, String alarmId, long triggerMs,
        String alarmTime, String alarmLabel, String dismissalType,
        int pushupTarget, int rampDuration
    ) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            Log.e(TAG, "AlarmManager service is null, cannot schedule alarm");
            return;
        }

        PendingIntent alarmIntent = createAlarmPendingIntent(
            context, alarmId, alarmTime, alarmLabel, dismissalType, pushupTarget, rampDuration
        );

        // Create a show intent for the alarm clock info (shows alarm icon in status bar)
        Intent showIntent = new Intent(context, MainActivity.class);
        showIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent showPendingIntent = PendingIntent.getActivity(
            context, getRequestCode(alarmId) + 1000, showIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // setAlarmClock is the gold standard for alarm apps
        try {
            AlarmManager.AlarmClockInfo alarmClock = new AlarmManager.AlarmClockInfo(triggerMs, showPendingIntent);
            am.setAlarmClock(alarmClock, alarmIntent);
            Log.d(TAG, "Native alarm scheduled via setAlarmClock: " + alarmId + " -> " + triggerMs);
        } catch (SecurityException se) {
            Log.w(TAG, "setAlarmClock failed with SecurityException, falling back to setExactAndAllowWhileIdle", se);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, alarmIntent);
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerMs, alarmIntent);
                }
                Log.d(TAG, "Native alarm scheduled via fallback setExactAndAllowWhileIdle: " + alarmId + " -> " + triggerMs);
            } catch (Exception ex) {
                Log.e(TAG, "Fallback exact scheduling failed, using setAndAllowWhileIdle", ex);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, alarmIntent);
                }
            }
        }
    }

    private static PendingIntent createAlarmPendingIntent(
        Context context, String alarmId, String alarmTime, String alarmLabel,
        String dismissalType, int pushupTarget, int rampDuration
    ) {
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction("com.rise.alarm.FIRE_ALARM");
        intent.putExtra("alarmId", alarmId);
        intent.putExtra("alarmTime", alarmTime);
        intent.putExtra("alarmLabel", alarmLabel);
        intent.putExtra("dismissalType", dismissalType);
        intent.putExtra("pushupTarget", pushupTarget);
        intent.putExtra("rampDuration", rampDuration);

        return PendingIntent.getBroadcast(
            context, getRequestCode(alarmId), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int getRequestCode(String alarmId) {
        int hash = 0;
        for (int i = 0; i < alarmId.length(); i++) {
            hash = (hash << 5) - hash + alarmId.charAt(i);
        }
        return Math.abs(hash) % 100000;
    }

    // --- SharedPreferences persistence for BootReceiver ---

    private void saveAlarmToPrefs(
        String alarmId, long triggerMs, String alarmTime, String alarmLabel,
        String dismissalType, int pushupTarget, int rampDuration
    ) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(PREFS_KEY, "[]");
            JSONArray alarmsArray = new JSONArray(existing);

            // Remove existing entry with same alarmId
            JSONArray filtered = new JSONArray();
            for (int i = 0; i < alarmsArray.length(); i++) {
                JSONObject obj = alarmsArray.getJSONObject(i);
                if (!alarmId.equals(obj.optString("alarmId"))) {
                    filtered.put(obj);
                }
            }

            // Add new entry
            JSONObject newAlarm = new JSONObject();
            newAlarm.put("alarmId", alarmId);
            newAlarm.put("triggerMs", triggerMs);
            newAlarm.put("alarmTime", alarmTime);
            newAlarm.put("alarmLabel", alarmLabel);
            newAlarm.put("dismissalType", dismissalType);
            newAlarm.put("pushupTarget", pushupTarget);
            newAlarm.put("rampDuration", rampDuration);
            filtered.put(newAlarm);

            prefs.edit().putString(PREFS_KEY, filtered.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Failed to save alarm to prefs", e);
        }
    }

    private void removeAlarmFromPrefs(String alarmId) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(PREFS_KEY, "[]");
            JSONArray alarmsArray = new JSONArray(existing);

            JSONArray filtered = new JSONArray();
            for (int i = 0; i < alarmsArray.length(); i++) {
                JSONObject obj = alarmsArray.getJSONObject(i);
                if (!alarmId.equals(obj.optString("alarmId"))) {
                    filtered.put(obj);
                }
            }

            prefs.edit().putString(PREFS_KEY, filtered.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Failed to remove alarm from prefs", e);
        }
    }
}
