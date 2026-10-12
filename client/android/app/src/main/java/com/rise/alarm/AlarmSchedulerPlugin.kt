package com.rise.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.rise.alarm.exercise.PushUpActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Custom Kotlin Capacitor plugin that bridges TypeScript alarm scheduling to Android's
 * native AlarmManager.setAlarmClock(). This is the most reliable API for alarm
 * apps — it displays the alarm icon in the status bar and guarantees delivery even
 * in Doze mode or when the app is killed and the screen is locked.
 */
@CapacitorPlugin(name = "AlarmScheduler")
class AlarmSchedulerPlugin : Plugin() {

    companion object {
        private const val TAG = "RiseAlarmScheduler"
        private const val PREFS_NAME = "rise_alarms"
        private const val PREFS_KEY = "scheduled_alarms"

        @Volatile
        private var pendingAlarmData: JSObject? = null

        @JvmStatic
        @Synchronized
        fun setPendingAlarm(
            alarmId: String,
            alarmTime: String,
            alarmLabel: String,
            dismissalType: String,
            pushupTarget: Int,
            rampDuration: Int
        ) {
            val obj = JSObject().apply {
                put("alarmId", alarmId)
                put("alarmTime", alarmTime)
                put("alarmLabel", alarmLabel)
                put("dismissalType", dismissalType)
                put("pushupTarget", pushupTarget)
                put("rampDuration", rampDuration)
            }
            pendingAlarmData = obj
            Log.d(TAG, "Saved pendingAlarmData for: $alarmId")
        }

        @JvmStatic
        @Synchronized
        fun getPendingAlarmData(): JSObject? = pendingAlarmData

        @JvmStatic
        @Synchronized
        fun clearPendingAlarmData() {
            pendingAlarmData = null
            Log.d(TAG, "Cleared pendingAlarmData")
        }

        @JvmStatic
        fun getStoragePrefs(context: Context): SharedPreferences {
            var storageContext = context
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    storageContext = context.createDeviceProtectedStorageContext()
                } catch (ignored: Exception) {}
            }
            return storageContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }

        @JvmStatic
        fun scheduleNativeAlarm(
            context: Context,
            alarmId: String,
            triggerMs: Long,
            alarmTime: String,
            alarmLabel: String,
            dismissalType: String,
            pushupTarget: Int,
            rampDuration: Int
        ) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (am == null) {
                Log.e(TAG, "AlarmManager service is null, cannot schedule alarm")
                return
            }

            val alarmIntent = createAlarmPendingIntent(
                context, alarmId, alarmTime, alarmLabel, dismissalType, pushupTarget, rampDuration
            )

            // Create a show intent for the alarm clock info (shows alarm icon in status bar)
            val showIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val showPendingIntent = PendingIntent.getActivity(
                context,
                getRequestCode(alarmId) + 1000,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // setAlarmClock is the gold standard for alarm apps
            try {
                val alarmClock = AlarmManager.AlarmClockInfo(triggerMs, showPendingIntent)
                am.setAlarmClock(alarmClock, alarmIntent)
                Log.i(TAG, "Native alarm scheduled via setAlarmClock: $alarmId at $alarmTime (trigger: $triggerMs)")
            } catch (se: SecurityException) {
                Log.w(TAG, "setAlarmClock failed with SecurityException, falling back to setExactAndAllowWhileIdle", se)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, alarmIntent)
                    } else {
                        am.setExact(AlarmManager.RTC_WAKEUP, triggerMs, alarmIntent)
                    }
                    Log.i(TAG, "Native alarm scheduled via fallback setExactAndAllowWhileIdle: $alarmId")
                } catch (ex: Exception) {
                    Log.e(TAG, "Fallback exact scheduling failed, using setAndAllowWhileIdle", ex)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, alarmIntent)
                    }
                }
            }
        }

        @JvmStatic
        fun createAlarmPendingIntent(
            context: Context,
            alarmId: String,
            alarmTime: String,
            alarmLabel: String,
            dismissalType: String,
            pushupTarget: Int,
            rampDuration: Int
        ): PendingIntent {
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = "com.rise.alarm.FIRE_ALARM"
                data = Uri.parse("rise://alarm/$alarmId")
                putExtra("alarmId", alarmId)
                putExtra("alarmTime", alarmTime)
                putExtra("alarmLabel", alarmLabel)
                putExtra("dismissalType", dismissalType)
                putExtra("pushupTarget", pushupTarget)
                putExtra("rampDuration", rampDuration)
            }

            return PendingIntent.getBroadcast(
                context,
                getRequestCode(alarmId),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        @JvmStatic
        fun getRequestCode(alarmId: String): Int {
            var hash = 0
            for (i in alarmId.indices) {
                hash = (hash shl 5) - hash + alarmId[i].code
            }
            return Math.abs(hash) % 100000
        }
    }

    /**
     * Schedule an alarm using Android's native AlarmManager.setAlarmClock().
     * Supports parameters:
     *   - id / alarmId: String
     *   - triggerAtMillis / triggerMs: Long
     *   - title / alarmLabel: String
     *   - alarmTime: String
     *   - dismissalType: String
     *   - pushupTarget: Int
     *   - rampDuration: Int
     *   - daysOfWeek: Array<Int>
     */
    @PluginMethod
    fun scheduleAlarm(call: PluginCall) {
        val id = call.getString("id") ?: call.getString("alarmId") ?: ""
        var triggerAtMillis = 0L

        // Dynamically parse triggerAtMillis / triggerMs across Long, Double, Number, or String
        val data = call.data
        if (data != null) {
            val raw = data.opt("triggerAtMillis") ?: data.opt("triggerMs")
            if (raw is Number) {
                triggerAtMillis = raw.toLong()
            } else if (raw != null) {
                try {
                    triggerAtMillis = raw.toString().trim().toDouble().toLong()
                } catch (ignored: Exception) {}
            }
        }
        if (triggerAtMillis == 0L) {
            val str = call.getString("triggerMsStr") ?: call.getString("triggerAtMillisStr")
            if (!str.isNullOrEmpty()) {
                try {
                    triggerAtMillis = str.trim().toDouble().toLong()
                } catch (ignored: Exception) {}
            }
        }

        val title = call.getString("title") ?: call.getString("alarmLabel") ?: "Rise Alarm"
        val alarmTime = call.getString("alarmTime") ?: "07:00"
        val dismissalType = call.getString("dismissalType") ?: "PUSHUP_MATH"

        var pushupTarget = 5
        if (data != null) {
            val rawTarget = data.opt("pushupTarget")
            if (rawTarget is Number) pushupTarget = rawTarget.toInt()
        }

        var rampDuration = 30
        if (data != null) {
            val rawRamp = data.opt("rampDuration")
            if (rawRamp is Number) rampDuration = rawRamp.toInt()
        }

        val daysArray = call.getArray("daysOfWeek") ?: JSArray()
        val daysOfWeek: JSONArray = daysArray

        Log.i(TAG, "scheduleAlarm: id=$id, triggerAtMillis=$triggerAtMillis (${(triggerAtMillis - System.currentTimeMillis()) / 1000}s from now), time=$alarmTime")

        if (id.isEmpty()) {
            call.reject("Alarm id is required")
            return
        }

        if (triggerAtMillis <= 0L) {
            call.reject("triggerAtMillis must be a valid timestamp")
            return
        }

        if (triggerAtMillis <= System.currentTimeMillis()) {
            call.reject("Cannot schedule alarm in the past")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (am != null && !am.canScheduleExactAlarms()) {
                Log.w(TAG, "App lacks SCHEDULE_EXACT_ALARM permission on Android 12+; will attempt fallback")
            }
        }

        try {
            scheduleNativeAlarm(
                context, id, triggerAtMillis, alarmTime, title,
                dismissalType, pushupTarget, rampDuration
            )

            // Persist alarm configuration to native storage for BootReceiver
            saveAlarmToPrefs(id, triggerAtMillis, alarmTime, title, dismissalType, pushupTarget, rampDuration, daysOfWeek)

            val result = JSObject().apply {
                put("success", true)
                put("id", id)
                put("alarmId", id)
                put("triggerAtMillis", triggerAtMillis)
                put("triggerMs", triggerAtMillis)
            }
            call.resolve(result)
            Log.i(TAG, "SUCCESS: Scheduled exact native alarm clock for $id at $alarmTime")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule alarm", e)
            call.reject("Failed to schedule alarm: ${e.message}")
        }
    }

    /**
     * Backward-compatible alias for scheduleAlarm.
     */
    @PluginMethod
    fun scheduleExact(call: PluginCall) {
        scheduleAlarm(call)
    }

    /**
     * Cancel an alarm by ID.
     */
    @PluginMethod
    fun cancelAlarm(call: PluginCall) {
        val id = call.getString("id") ?: call.getString("alarmId") ?: ""
        if (id.isEmpty()) {
            call.reject("id is required")
            return
        }

        try {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val pi = createAlarmPendingIntent(context, id, "", "", "", 5, 30)
            am?.cancel(pi)
            pi.cancel()

            removeAlarmFromPrefs(id)

            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
            Log.d(TAG, "Cancelled alarm: $id")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel alarm", e)
            call.reject("Failed to cancel alarm: ${e.message}")
        }
    }

    /**
     * Cancel all scheduled alarms.
     */
    @PluginMethod
    fun cancelAll(call: PluginCall) {
        try {
            val prefs = getStoragePrefs(context)
            val alarmsJson = prefs.getString(PREFS_KEY, "[]") ?: "[]"
            val alarmsArray = JSONArray(alarmsJson)
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

            for (i in 0 until alarmsArray.length()) {
                val alarm = alarmsArray.getJSONObject(i)
                val alarmId = alarm.optString("alarmId", "")
                if (alarmId.isNotEmpty()) {
                    val pi = createAlarmPendingIntent(context, alarmId, "", "", "", 5, 30)
                    am?.cancel(pi)
                    pi.cancel()
                }
            }

            prefs.edit().putString(PREFS_KEY, "[]").apply()
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(PREFS_KEY, "[]").apply()

            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
            Log.d(TAG, "Cancelled all alarms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel all alarms", e)
            call.reject("Failed to cancel all alarms: ${e.message}")
        }
    }

    /**
     * Get all currently scheduled alarms from native storage.
     */
    @PluginMethod
    fun getScheduledAlarms(call: PluginCall) {
        try {
            val prefs = getStoragePrefs(context)
            val alarmsJson = prefs.getString(PREFS_KEY, "[]") ?: "[]"
            val alarmsArray = JSONArray(alarmsJson)
            val jsArray = JSArray()

            for (i in 0 until alarmsArray.length()) {
                val json = alarmsArray.getJSONObject(i)
                val item = JSObject().apply {
                    put("id", json.optString("alarmId"))
                    put("alarmId", json.optString("alarmId"))
                    put("triggerAtMillis", json.optLong("triggerMs"))
                    put("triggerMs", json.optLong("triggerMs"))
                    put("title", json.optString("alarmLabel"))
                    put("alarmTime", json.optString("alarmTime"))
                    put("dismissalType", json.optString("dismissalType"))
                    put("pushupTarget", json.optInt("pushupTarget", 5))
                    put("rampDuration", json.optInt("rampDuration", 30))
                }
                jsArray.put(item)
            }

            val result = JSObject().apply {
                put("alarms", jsArray)
            }
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to retrieve scheduled alarms: ${e.message}")
        }
    }

    /**
     * Check exact alarm scheduling capability on Android 12+ (API 31+).
     */
    @PluginMethod
    fun checkExactAlarmPermission(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            result.put("canSchedule", am != null && am.canScheduleExactAlarms())
        } else {
            result.put("canSchedule", true)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        checkExactAlarmPermission(call)
    }

    /**
     * Request exact alarm scheduling permission by opening system settings on Android 12+.
     */
    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (am != null && !am.canScheduleExactAlarms()) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
        }
        val result = JSObject().apply { put("success", true) }
        call.resolve(result)
    }

    /**
     * Stop the currently active alarm audio, vibration, and foreground service.
     */
    @PluginMethod
    fun stopAlarm(call: PluginCall) {
        try {
            AlarmService.stopAlarmService(context)
            clearPendingAlarmData()
            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
            Log.d(TAG, "Stopped alarm service")
        } catch (e: Exception) {
            call.reject("Failed to stop alarm: ${e.message}")
        }
    }

    @PluginMethod
    fun stopRinging(call: PluginCall) {
        stopAlarm(call)
    }

    /**
     * Complete the alarm (called after user successfully passes the exercise challenge).
     */
    @PluginMethod
    fun completeAlarm(call: PluginCall) {
        try {
            AlarmService.stopAlarmService(context)
            clearPendingAlarmData()
            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
            Log.d(TAG, "Completed and dismissed alarm")
        } catch (e: Exception) {
            call.reject("Failed to complete alarm: ${e.message}")
        }
    }

    /**
     * Start the native AlarmService to play the audio tone directly.
     */
    @PluginMethod
    fun startRinging(call: PluginCall) {
        try {
            val alarmId = call.getString("alarmId") ?: call.getString("id") ?: "test-alarm"
            val alarmTime = call.getString("alarmTime") ?: "07:00"
            val alarmLabel = call.getString("alarmLabel") ?: call.getString("title") ?: "Rise Alarm"
            val dismissalType = call.getString("dismissalType") ?: "PUSHUP_MATH"
            val pushupTarget = call.getInt("pushupTarget", 5)
            val rampDuration = call.getInt("rampDuration", 30)

            val triggerIntent = Intent().apply {
                putExtra("alarmId", alarmId)
                putExtra("alarmTime", alarmTime)
                putExtra("alarmLabel", alarmLabel)
                putExtra("dismissalType", dismissalType)
                putExtra("pushupTarget", pushupTarget)
                putExtra("rampDuration", rampDuration)
            }

            AlarmTriggerHandler.handleAlarmTrigger(context, triggerIntent)

            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
            Log.d(TAG, "Started ringing via AlarmTriggerHandler for alarm $alarmId")
        } catch (e: Exception) {
            call.reject("Failed to start ringing: ${e.message}")
        }
    }

    /**
     * Get live network connectivity status.
     */
    @PluginMethod
    fun getNetworkStatus(call: PluginCall) {
        val isOnline = NetworkMonitor.getInstance(context).isOnline
        val result = JSObject().apply { put("isOnline", isOnline) }
        call.resolve(result)
    }

    /**
     * Check whether app is whitelisted from battery optimizations (Doze mode).
     */
    @PluginMethod
    fun isBatteryOptimizationIgnored(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val isIgnored = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: true
            result.put("isIgnored", isIgnored)
        } else {
            result.put("isIgnored", true)
        }
        call.resolve(result)
    }

    /**
     * Request exemption from battery optimizations.
     */
    @PluginMethod
    fun requestBatteryOptimizationExemption(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (pm != null && !pm.isIgnoringBatteryOptimizations(context.packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Direct battery optimization intent failed, opening battery settings", e)
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                } catch (ignored: Exception) {}
            }
        }
        val result = JSObject().apply { put("success", true) }
        call.resolve(result)
    }

    /**
     * Check whether full-screen intent is allowed on Android 14+ (API 34+).
     */
    @PluginMethod
    fun canUseFullScreenIntent(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            result.put("canUse", nm?.canUseFullScreenIntent() ?: true)
        } else {
            result.put("canUse", true)
        }
        call.resolve(result)
    }

    /**
     * Open system settings for full-screen intent on Android 14+.
     */
    @PluginMethod
    fun requestFullScreenIntentPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (nm != null && !nm.canUseFullScreenIntent()) {
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                } catch (e: Exception) {
                    Log.w(TAG, "Cannot launch ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT", e)
                }
            }
        }
        val result = JSObject().apply { put("success", true) }
        call.resolve(result)
    }

    /**
     * Aggregate background reliability permission status.
     */
    @PluginMethod
    fun getBackgroundPermissionStatus(call: PluginCall) {
        val result = JSObject()
        var canExact = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            canExact = am != null && am.canScheduleExactAlarms()
        }

        var canFullScreen = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            canFullScreen = nm?.canUseFullScreenIntent() ?: true
        }

        var isBatteryIgnored = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            isBatteryIgnored = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: true
        }

        result.put("canExact", canExact)
        result.put("canFullScreen", canFullScreen)
        result.put("isBatteryIgnored", isBatteryIgnored)
        result.put("allGranted", canExact && canFullScreen && isBatteryIgnored)
        call.resolve(result)
    }

    /**
     * Retrieve any pending alarm that triggered the app cold-start.
     */
    @PluginMethod
    fun getPendingAlarm(call: PluginCall) {
        val result = JSObject()
        synchronized(AlarmSchedulerPlugin::class.java) {
            val pending = pendingAlarmData
            if (pending != null) {
                result.put("alarm", pending)
            } else {
                result.put("alarm", JSObject.NULL)
            }
        }
        call.resolve(result)
    }

    /**
     * Clear pending alarm once handled.
     */
    @PluginMethod
    fun clearPendingAlarm(call: PluginCall) {
        clearPendingAlarmData()
        val result = JSObject().apply { put("success", true) }
        call.resolve(result)
    }

    /**
     * Launch native CameraX + Google ML Kit PushUpActivity.
     */
    @PluginMethod
    fun launchPushUpActivity(call: PluginCall) {
        try {
            val target = call.getInt("target", 5)
            val intent = Intent(context, PushUpActivity::class.java).apply {
                putExtra(PushUpActivity.EXTRA_TARGET_COUNT, target)
            }
            startActivityForResult(call, intent, "pushUpActivityResult")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch PushUpActivity", e)
            call.reject("Failed to launch PushUpActivity: ${e.message}")
        }
    }

    @ActivityCallback
    private fun pushUpActivityResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val data = result.data
            val completedReps = data?.getIntExtra(PushUpActivity.EXTRA_COMPLETED_COUNT, 0) ?: 0
            val ret = JSObject().apply {
                put("completed", true)
                put("completedReps", completedReps)
            }
            call.resolve(ret)
        } else {
            val ret = JSObject().apply {
                put("completed", false)
            }
            call.resolve(ret)
        }
    }

    // --- Private persistence helpers ---

    private fun saveAlarmToPrefs(
        alarmId: String,
        triggerMs: Long,
        alarmTime: String,
        alarmLabel: String,
        dismissalType: String,
        pushupTarget: Int,
        rampDuration: Int,
        daysOfWeek: JSONArray
    ) {
        try {
            val prefs = getStoragePrefs(context)
            val existing = prefs.getString(PREFS_KEY, "[]") ?: "[]"
            val alarmsArray = JSONArray(existing)

            val filtered = JSONArray()
            for (i in 0 until alarmsArray.length()) {
                val obj = alarmsArray.getJSONObject(i)
                if (alarmId != obj.optString("alarmId")) {
                    filtered.put(obj)
                }
            }

            val newAlarm = JSONObject().apply {
                put("alarmId", alarmId)
                put("triggerMs", triggerMs)
                put("alarmTime", alarmTime)
                put("alarmLabel", alarmLabel)
                put("dismissalType", dismissalType)
                put("pushupTarget", pushupTarget)
                put("rampDuration", rampDuration)
                put("daysOfWeek", daysOfWeek)
            }
            filtered.put(newAlarm)

            val jsonStr = filtered.toString()
            prefs.edit().putString(PREFS_KEY, jsonStr).apply()
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(PREFS_KEY, jsonStr).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save alarm to prefs", e)
        }
    }

    private fun removeAlarmFromPrefs(alarmId: String) {
        try {
            val prefs = getStoragePrefs(context)
            val existing = prefs.getString(PREFS_KEY, "[]") ?: "[]"
            val alarmsArray = JSONArray(existing)

            val filtered = JSONArray()
            for (i in 0 until alarmsArray.length()) {
                val obj = alarmsArray.getJSONObject(i)
                if (alarmId != obj.optString("alarmId")) {
                    filtered.put(obj)
                }
            }

            val jsonStr = filtered.toString()
            prefs.edit().putString(PREFS_KEY, jsonStr).apply()
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(PREFS_KEY, jsonStr).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove alarm from prefs", e)
        }
    }
}
