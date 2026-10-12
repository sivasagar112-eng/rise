package com.rise.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
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

            // Start/Refresh persistent keep-alive foreground service to prevent OEM swipe termination
            AlarmKeepAliveService.refresh(context)

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

            // Refresh keep-alive foreground service (stops if 0 alarms remain)
            AlarmKeepAliveService.refresh(context)

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

            // Stop keep-alive service since all alarms cancelled
            AlarmKeepAliveService.stop(context)

            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
            Log.d(TAG, "Cancelled all alarms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel all alarms", e)
            call.reject("Failed to cancel all alarms: ${e.message}")
        }
    }

    /**
     * Explicitly trigger keep-alive foreground service refresh from TypeScript.
     */
    @PluginMethod
    fun refreshKeepAlive(call: PluginCall) {
        try {
            AlarmKeepAliveService.refresh(context)
            val result = JSObject().apply { put("success", true) }
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to refresh keep-alive service: ${e.message}")
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
     * Check whether Display Over Other Apps / Overlay permission is granted.
     */
    @PluginMethod
    fun canDrawOverlays(call: PluginCall) {
        val result = JSObject()
        val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
        result.put("canDraw", canDraw)
        call.resolve(result)
    }

    /**
     * Request Display Over Other Apps / Overlay permission.
     */
    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.w(TAG, "Cannot launch ACTION_MANAGE_OVERLAY_PERMISSION", e)
                try {
                    val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(appDetails)
                } catch (ignored: Exception) {}
            }
        }
        val result = JSObject().apply { put("success", true) }
        call.resolve(result)
    }

    /**
     * Open manufacturer-specific settings (Realme, Xiaomi, Oppo, Vivo, Samsung).
     */
    @PluginMethod
    fun openOemSettings(call: PluginCall) {
        val launched = launchOemSpecificSettings(context)
        val result = JSObject().apply {
            put("success", true)
            put("launchedOem", launched)
            put("manufacturer", Build.MANUFACTURER)
        }
        call.resolve(result)
    }

    /**
     * Automatically orchestrate the missing background permissions in priority order:
     * 1. Battery Saver -> Unrestricted (native OS dialog)
     * 2. Exact Alarms -> Allowed (settings toggle)
     * 3. Display Over Other Apps -> Allowed (overlay toggle)
     * 4. OEM Auto-start / Background pop-up window manager
     */
    @PluginMethod
    fun autoConfigureReliability(call: PluginCall) {
        val result = JSObject()

        // 1. Display Over Other Apps (Overlay) - required to wake and show screen when locked
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                result.put("action", "OVERLAY")
                result.put("message", "Opening Display Over Other Apps settings")
                result.put("success", true)
                call.resolve(result)
                return
            } catch (e: Exception) {
                Log.w(TAG, "Overlay intent failed in autoConfigureReliability", e)
            }
        }

        // 2. Battery Optimization (Unrestricted)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (pm != null && !pm.isIgnoringBatteryOptimizations(context.packageName)) {
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    result.put("action", "BATTERY_PROMPT")
                    result.put("message", "Battery Optimization prompt requested")
                    result.put("success", true)
                    call.resolve(result)
                    return
                } catch (e: Exception) {
                    Log.w(TAG, "Battery intent failed in autoConfigureReliability", e)
                }
            }
        }

        // 3. Exact Alarms (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (am != null && !am.canScheduleExactAlarms()) {
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    result.put("action", "EXACT_ALARM")
                    result.put("message", "Opening Exact Alarms settings")
                    result.put("success", true)
                    call.resolve(result)
                    return
                } catch (e: Exception) {
                    Log.w(TAG, "Exact alarm intent failed in autoConfigureReliability", e)
                }
            }
        }

        // 4. OEM Auto-Start / Background management for Realme, Xiaomi, Oppo, Vivo, Samsung
        val oemLaunched = launchOemSpecificSettings(context)
        result.put("action", if (oemLaunched) "OEM_SETTINGS" else "ALL_CONFIGURED")
        result.put("message", if (oemLaunched) "Opened OEM settings for ${Build.MANUFACTURER}" else "All settings already configured")
        result.put("success", true)
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

        val canDrawOverlays = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

        val ready = canExact && canDrawOverlays
        result.put("canExact", canExact)
        result.put("canFullScreen", canFullScreen)
        result.put("isBatteryIgnored", isBatteryIgnored)
        result.put("canDrawOverlays", canDrawOverlays)
        result.put("manufacturer", Build.MANUFACTURER)
        result.put("allGranted", ready)
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

    private fun launchOemSpecificSettings(context: Context): Boolean {
        val pkg = context.packageName
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intents = mutableListOf<Intent>()

        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
            // Xiaomi MIUI / HyperOS
            intents.add(Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                putExtra("extra_pkgname", pkg)
            })
            intents.add(Intent().apply {
                component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                putExtra("extra_pkgname", pkg)
            })
        } else if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
            // Realme UI / ColorOS / OxygenOS
            intents.add(Intent().apply {
                component = ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.PermissionManagerActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")
            })
        } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
            // Vivo / iQOO
            intents.add(Intent().apply {
                component = ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
            })
        } else if (manufacturer.contains("samsung")) {
            // Samsung One UI
            intents.add(Intent().apply {
                component = ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity")
            })
        } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            // Huawei / Honor
            intents.add(Intent().apply {
                component = ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
            })
            intents.add(Intent().apply {
                component = ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity")
            })
        }

        for (intent in intents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Log.d(TAG, "Successfully launched OEM intent: ${intent.component ?: intent.action}")
                return true
            } catch (ignored: Exception) {}
        }

        // Fallback: App Details Settings
        try {
            val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$pkg")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(appDetails)
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Fallback app details settings failed", e)
            return false
        }
    }
}
