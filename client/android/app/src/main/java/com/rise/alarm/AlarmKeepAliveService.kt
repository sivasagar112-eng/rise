package com.rise.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Persistent Keep-Alive Foreground Service for Rise-ai.
 *
 * Runs whenever >= 1 alarm is scheduled / enabled to prevent OEM task switchers
 * (Realme UI, ColorOS, MIUI, HyperOS, Vivo, Samsung) from force-stopping the app
 * process when the user swipes Rise away from the Recents screen.
 *
 * It displays a low-priority, ongoing notification (e.g. "Rise • Alarm set for 7:00 AM")
 * and performs self-healing re-registration of all active alarms with AlarmManager.
 */
class AlarmKeepAliveService : Service() {

    companion object {
        private const val TAG = "RiseKeepAliveService"
        const val CHANNEL_ID = "rise_keep_alive_channel"
        const val NOTIFICATION_ID = 77777

        const val ACTION_START = "com.rise.alarm.ACTION_START_KEEP_ALIVE"
        const val ACTION_STOP = "com.rise.alarm.ACTION_STOP_KEEP_ALIVE"
        const val ACTION_REFRESH = "com.rise.alarm.ACTION_REFRESH_KEEP_ALIVE"

        @Volatile
        var isServiceRunning = false
            private set

        /**
         * Refresh keep-alive status:
         * Starts the service if >= 1 enabled alarm exists.
         * Stops the service if 0 alarms are active.
         */
        @JvmStatic
        fun refresh(context: Context) {
            try {
                val hasAlarms = hasActiveAlarms(context)
                Log.d(TAG, "refresh: hasActiveAlarms = $hasAlarms")
                if (hasAlarms) {
                    val intent = Intent(context, AlarmKeepAliveService::class.java).apply {
                        action = ACTION_REFRESH
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                } else {
                    stop(context)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to refresh keep-alive service", e)
            }
        }

        /**
         * Stop the keep-alive service (called when all alarms are cancelled / disabled).
         */
        @JvmStatic
        fun stop(context: Context) {
            try {
                val intent = Intent(context, AlarmKeepAliveService::class.java).apply {
                    action = ACTION_STOP
                }
                context.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop keep-alive service", e)
            }
        }

        /**
         * Check if >= 1 alarm is stored in native prefs.
         */
        @JvmStatic
        fun hasActiveAlarms(context: Context): Boolean {
            return try {
                val prefs = AlarmSchedulerPlugin.getStoragePrefs(context)
                val jsonStr = prefs.getString("scheduled_alarms", "[]") ?: "[]"
                val array = JSONArray(jsonStr)
                array.length() > 0
            } catch (e: Exception) {
                false
            }
        }

        /**
         * Self-healing re-registration:
         * Re-schedules all active alarms with Android AlarmManager.setAlarmClock()
         * to guarantee that PendingIntents in the OS are active and fresh.
         */
        @JvmStatic
        fun rescheduleAllStoredAlarms(context: Context): Int {
            var rescheduledCount = 0
            try {
                val prefs = AlarmSchedulerPlugin.getStoragePrefs(context)
                val jsonStr = prefs.getString("scheduled_alarms", "[]") ?: "[]"
                val array = JSONArray(jsonStr)
                val now = System.currentTimeMillis()

                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    val alarmId = obj.optString("alarmId", "")
                    var triggerMs = obj.optLong("triggerMs", 0L)
                    val alarmTime = obj.optString("alarmTime", "07:00")
                    val alarmLabel = obj.optString("alarmLabel", "Rise Alarm")
                    val dismissalType = obj.optString("dismissalType", "PUSHUP_MATH")
                    val pushupTarget = obj.optInt("pushupTarget", 5)
                    val rampDuration = obj.optInt("rampDuration", 30)
                    val daysJson = obj.optJSONArray("daysOfWeek")

                    val daysOfWeek = mutableListOf<Int>()
                    if (daysJson != null) {
                        for (d in 0 until daysJson.length()) {
                            daysOfWeek.add(daysJson.getInt(d))
                        }
                    }

                    // Recalculate if past
                    if (triggerMs <= now) {
                        if (daysOfWeek.isEmpty()) {
                            // Expired one-time alarm
                            continue
                        }
                        try {
                            val parts = alarmTime.split(":")
                            val h = parts[0].trim().toInt()
                            val m = parts[1].trim().toInt()
                            val cal = Calendar.getInstance().apply {
                                set(Calendar.HOUR_OF_DAY, h)
                                set(Calendar.MINUTE, m)
                                set(Calendar.SECOND, 0)
                                set(Calendar.MILLISECOND, 0)
                            }
                            for (attempt in 0..7) {
                                val jsDay = cal.get(Calendar.DAY_OF_WEEK) - 1
                                if (cal.timeInMillis > now && daysOfWeek.contains(jsDay)) {
                                    break
                                }
                                cal.add(Calendar.DAY_OF_YEAR, 1)
                            }
                            triggerMs = cal.timeInMillis
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to recalculate trigger time for $alarmId", e)
                        }
                    }

                    if (alarmId.isNotEmpty() && triggerMs > now) {
                        AlarmSchedulerPlugin.scheduleNativeAlarm(
                            context, alarmId, triggerMs, alarmTime, alarmLabel,
                            dismissalType, pushupTarget, rampDuration
                        )
                        rescheduledCount++
                    }
                }
                Log.d(TAG, "Self-heal: Rescheduled $rescheduledCount alarms with AlarmManager")
            } catch (e: Exception) {
                Log.e(TAG, "Error in rescheduleAllStoredAlarms", e)
            }
            return rescheduledCount
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        isServiceRunning = true
        Log.d(TAG, "onCreate: AlarmKeepAliveService started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        if (ACTION_STOP == action) {
            Log.d(TAG, "onStartCommand: ACTION_STOP received")
            isServiceRunning = false
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        // Check if there are active alarms
        if (!hasActiveAlarms(this)) {
            Log.d(TAG, "onStartCommand: No active alarms found, stopping service")
            isServiceRunning = false
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        // Build and display ongoing notification
        val notification = buildOngoingNotification()
        startInForeground(notification)

        // Self-heal: Ensure all stored alarms are actively registered with AlarmManager
        rescheduleAllStoredAlarms(applicationContext)

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "onTaskRemoved: User swiped app from Recents. Re-anchoring keep-alive service and self-healing alarms.")

        // Immediately reschedule all alarms so AlarmManager is completely refreshed
        rescheduleAllStoredAlarms(applicationContext)

        // Ensure service remains alive or restarts
        if (hasActiveAlarms(this)) {
            val restartIntent = Intent(applicationContext, AlarmKeepAliveService::class.java).apply {
                action = ACTION_REFRESH
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(restartIntent)
            } else {
                applicationContext.startService(restartIntent)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        Log.d(TAG, "onDestroy: AlarmKeepAliveService stopped")
    }

    private fun startInForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
                Log.d(TAG, "startForeground with SPECIAL_USE succeeded")
            } catch (e: Exception) {
                Log.w(TAG, "startForeground with SPECIAL_USE failed, fallback to standard", e)
                try {
                    startForeground(NOTIFICATION_ID, notification)
                } catch (e2: Exception) {
                    Log.e(TAG, "Standard startForeground failed", e2)
                }
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(NOTIFICATION_ID, notification)
            } catch (e: Exception) {
                Log.e(TAG, "startForeground failed on Android Q+", e)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (nm != null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Rise Alarm Protection",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Keeps Rise alarms reliable and prevents OEM swipe termination"
                    setShowBadge(false)
                    enableLights(false)
                    enableVibration(false)
                    setSound(null, null)
                }
                nm.createNotificationChannel(channel)
            }
        }
    }

    private fun buildOngoingNotification(): Notification {
        val nextTimeStr = findEarliestAlarmTimeString()
        val title = if (nextTimeStr != null) {
            "Rise • Alarm set for $nextTimeStr"
        } else {
            "Rise • Alarm Active"
        }

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            7771,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("Protected background wake-up active")
            .setSmallIcon(R.drawable.ic_alarm_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    private fun findEarliestAlarmTimeString(): String? {
        return try {
            val prefs = AlarmSchedulerPlugin.getStoragePrefs(this)
            val jsonStr = prefs.getString("scheduled_alarms", "[]") ?: "[]"
            val array = JSONArray(jsonStr)
            val now = System.currentTimeMillis()

            var earliestTrigger = Long.MAX_VALUE
            var earliestTime: String? = null

            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val trigger = obj.optLong("triggerMs", 0L)
                val time = obj.optString("alarmTime", "")
                if (trigger in (now + 1)..<earliestTrigger) {
                    earliestTrigger = trigger
                    earliestTime = time
                }
            }

            if (earliestTime != null) {
                format12Hour(earliestTime)
            } else if (array.length() > 0) {
                val firstTime = array.getJSONObject(0).optString("alarmTime", "")
                if (firstTime.isNotEmpty()) format12Hour(firstTime) else null
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun format12Hour(time24: String): String {
        return try {
            val parts = time24.split(":")
            var h = parts[0].trim().toInt()
            val m = parts[1].trim().toInt()
            val ampm = if (h >= 12) "PM" else "AM"
            h = when {
                h == 0 -> 12
                h > 12 -> h - 12
                else -> h
            }
            String.format("%d:%02d %s", h, m, ampm)
        } catch (e: Exception) {
            time24
        }
    }
}
