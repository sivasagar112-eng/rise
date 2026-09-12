import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Alarm } from '../types/alarm';

const CHANNEL_ID = 'rise_alarm_channel_v1';

// Register the custom native plugin
interface AlarmSchedulerPluginInterface {
  scheduleExact(options: {
    alarmId: string;
    triggerMs: number;
    alarmTime: string;
    alarmLabel: string;
    dismissalType: string;
    pushupTarget: number;
    rampDuration: number;
  }): Promise<{ success: boolean; alarmId: string; triggerMs: number }>;

  cancelAlarm(options: { alarmId: string }): Promise<{ success: boolean }>;

  cancelAll(): Promise<{ success: boolean }>;

  stopRinging(): Promise<{ success: boolean }>;

  startRinging(options: {
    alarmId: string;
    alarmTime: string;
    alarmLabel: string;
    rampDuration: number;
  }): Promise<{ success: boolean }>;
}

const AlarmSchedulerNative = registerPlugin<AlarmSchedulerPluginInterface>('AlarmScheduler');

// Convert an alarm ID to a stable positive 32-bit integer for Android notification IDs
function getNotificationId(alarmId: string): number {
  let hash = 0;
  for (let i = 0; i < alarmId.length; i++) {
    hash = (hash << 5) - hash + alarmId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1001;
}

export class AlarmNotificationService {
  private static isInitialized = false;

  public static async init(onAlarmTrigger: (alarmId: string) => void): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 1. Request permissions for Android 13+ / Web
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      // 2. Create high-priority alarm notification channel for Android 8.0+
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Rise Wake-Up Alarms',
        description: 'Urgent alarm wake-up notifications with sound and heads-up banner',
        importance: 5, // MAX importance - pops up as banner even in other apps
        visibility: 1, // PUBLIC - visible on lock screen
        vibration: false,
        lights: true,
        lightColor: '#3B82F6',
      });

      // 3. Register notification actions (renders circular buttons on Realme/Android dynamic capsule)
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: 'RISE_ALARM_ACTIONS',
            actions: [
              {
                id: 'start_challenge',
                title: 'Start',
                foreground: true,
              },
              {
                id: 'dismiss_alarm',
                title: 'Dismiss',
                destructive: true,
              },
            ],
          },
        ],
      });

      // 4. Listen for user clicking or interacting with notification
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const alarmId = action.notification.extra?.alarmId;
        if (alarmId) {
          onAlarmTrigger(alarmId);
        }
      });

      // 5. Listen for notification firing while app is open/minimized
      LocalNotifications.addListener('localNotificationReceived', (notification) => {
        // Critical: Do NOT treat the ringing heads-up banner as a new alarm trigger!
        if (notification.id === 888888 || notification.extra?.isRinging) {
          return;
        }
        const alarmId = notification.extra?.alarmId;
        if (alarmId) {
          onAlarmTrigger(alarmId);
        }
      });

      // 6. Listen for native alarm fired event (from AlarmService via MainActivity)
      if (typeof window !== 'undefined') {
        window.addEventListener('nativeAlarmFired', ((event: CustomEvent) => {
          const alarmId = event.detail?.alarmId;
          if (alarmId) {
            console.log('[AlarmNotificationService] Native alarm fired for:', alarmId);
            onAlarmTrigger(alarmId);
          }
        }) as EventListener);
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('[AlarmNotificationService] Init error:', err);
    }
  }

  // Show immediate floating heads-up banner when alarm starts firing
  public static async showRingingNotification(alarm: Alarm): Promise<void> {
    try {
      const taskText =
        alarm.dismissalType === 'PUSHUP_MATH'
          ? `${alarm.pushupTarget || 5} Pushups`
          : alarm.dismissalType === 'BRIGHTNESS'
          ? 'Light Check'
          : alarm.dismissalType === 'FACE_AWAY'
          ? 'Face-Away'
          : alarm.dismissalType === 'OBJECT_MATCH'
          ? 'Object Scan'
          : 'Math Challenge';

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 888888,
            title: "Time's up",
            body: `Alarm • ${alarm.time} • ${taskText}`,
            schedule: { at: new Date(Date.now() + 50) },
            channelId: CHANNEL_ID,
            actionTypeId: 'RISE_ALARM_ACTIONS',
            ongoing: true,
            autoCancel: false,
            extra: {
              alarmId: alarm.id,
              isRinging: true,
            },
          },
        ],
      });
    } catch (e) {
      console.warn('[AlarmNotificationService] Failed to show ringing notification:', e);
    }
  }

  // Start native foreground AlarmService to play the single smooth ringtone on Android
  public static async startNativeRinging(alarm: Alarm): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AlarmSchedulerNative.startRinging({
          alarmId: alarm.id,
          alarmTime: alarm.time,
          alarmLabel: alarm.label || 'Rise Alarm',
          rampDuration: alarm.rampDuration || 30,
        });
      } catch (e) {
        console.warn('[AlarmNotificationService] Failed to start native alarm service:', e);
      }
    }
  }

  // Cancel ringing heads-up notification when challenge is dismissed
  public static async cancelRingingNotification(): Promise<void> {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: 888888 }],
      });

      // Also stop the native foreground AlarmService
      if (Capacitor.isNativePlatform()) {
        try {
          await AlarmSchedulerNative.stopRinging();
        } catch (e) {
          console.warn('[AlarmNotificationService] Failed to stop native alarm service:', e);
        }
      }
    } catch (e) {
      console.warn('[AlarmNotificationService] Failed to cancel notification:', e);
    }
  }

  // Calculate the next upcoming Date for an alarm time (HH:mm) and daysOfWeek
  public static getNextAlarmDate(timeStr: string, daysOfWeek: number[]): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);

    // If candidate time has already passed today, start from tomorrow
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }

    // If specific days of week are configured, find the next matching day
    if (daysOfWeek && daysOfWeek.length > 0) {
      for (let i = 0; i < 7; i++) {
        if (daysOfWeek.includes(candidate.getDay())) {
          break;
        }
        candidate.setDate(candidate.getDate() + 1);
      }
    }

    return candidate;
  }

  // Sync all enabled alarms with native Android exact alarm scheduler
  public static async syncAlarms(alarms: Alarm[]): Promise<void> {
    try {
      const isNative = Capacitor.isNativePlatform();

      // 1. Cancel all previously scheduled notifications
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      // Cancel all native alarms too
      if (isNative) {
        try {
          await AlarmSchedulerNative.cancelAll();
        } catch (e) {
          console.warn('[AlarmNotificationService] Failed to cancel native alarms:', e);
        }
      }

      // 2. Schedule upcoming alarms
      const notificationsToSchedule = [];

      for (const alarm of alarms) {
        if (!alarm.isEnabled) continue;

        const nextDate = this.getNextAlarmDate(alarm.time, alarm.daysOfWeek);
        const notifId = getNotificationId(alarm.id);

        // Schedule via native AlarmManager.setAlarmClock() (most reliable)
        if (isNative) {
          try {
            await AlarmSchedulerNative.scheduleExact({
              alarmId: alarm.id,
              triggerMs: nextDate.getTime(),
              alarmTime: alarm.time,
              alarmLabel: alarm.label || 'Rise Alarm',
              dismissalType: alarm.dismissalType,
              pushupTarget: alarm.pushupTarget || 5,
              rampDuration: alarm.rampDuration || 30,
            });
            console.log(`[AlarmNotificationService] Native alarm scheduled: ${alarm.id} at ${alarm.time}`);
          } catch (e) {
            console.warn(`[AlarmNotificationService] Native schedule failed for ${alarm.id}:`, e);
          }
        }

        // Also schedule a Capacitor LocalNotification as backup (for web & as fallback)
        notificationsToSchedule.push({
          id: notifId,
          title: `⏰ Alarm — ${alarm.time}`,
          body: `Time to wake up! Complete your ${alarm.dismissalType.replace('_', ' ')} task now.`,
          schedule: {
            at: nextDate,
            allowWhileIdle: true,
          },
          channelId: CHANNEL_ID,
          extra: {
            alarmId: alarm.id,
          },
          ongoing: true,
          autoCancel: false,
        });
      }

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule,
        });
      }
    } catch (err) {
      console.warn('[AlarmNotificationService] Failed to sync alarms:', err);
    }
  }
}
