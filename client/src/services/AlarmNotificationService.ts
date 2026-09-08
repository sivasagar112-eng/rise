import { LocalNotifications } from '@capacitor/local-notifications';
import { Alarm } from '../types/alarm';

const CHANNEL_ID = 'rise_alarm_channel_v1';

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
        sound: 'alarm.wav',
        vibration: true,
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
        const alarmId = notification.extra?.alarmId;
        if (alarmId) {
          onAlarmTrigger(alarmId);
        }
      });

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

  // Cancel ringing heads-up notification when challenge is dismissed
  public static async cancelRingingNotification(): Promise<void> {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: 888888 }],
      });
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
      // 1. Cancel previously scheduled notifications
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      // 2. Schedule upcoming notifications for all enabled alarms
      const notificationsToSchedule = [];

      for (const alarm of alarms) {
        if (!alarm.isEnabled) continue;

        const nextDate = this.getNextAlarmDate(alarm.time, alarm.daysOfWeek);
        const notifId = getNotificationId(alarm.id);

        notificationsToSchedule.push({
          id: notifId,
          title: `⏰ Alarm — ${alarm.time}`,
          body: `Time to wake up! Complete your ${alarm.dismissalType.replace('_', ' ')} task now.`,
          schedule: {
            at: nextDate,
            allowWhileIdle: true, // Key: Uses Android AlarmManager.setExactAndAllowWhileIdle()
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
