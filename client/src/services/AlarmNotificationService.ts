import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Alarm } from '../types/alarm';
import { formatTime12h } from '../utils/timeFormat';

const CHANNEL_ID = 'rise_alarm_channel_v3';

export interface ScheduleAlarmOptions {
  id: string;
  triggerAtMillis: number;
  title?: string;
  alarmId?: string; // backwards compatibility
  triggerMs?: number; // backwards compatibility
  triggerMsStr?: string;
  alarmTime?: string;
  alarmLabel?: string;
  dismissalType?: string;
  pushupTarget?: number;
  rampDuration?: number;
  daysOfWeek?: number[];
}

export interface ScheduledAlarmItem {
  id: string;
  triggerAtMillis: number;
  title: string;
  alarmTime: string;
  dismissalType: string;
  pushupTarget: number;
  rampDuration: number;
}

// Register the custom native plugin
export interface AlarmSchedulerPluginInterface {
  scheduleAlarm(options: ScheduleAlarmOptions): Promise<{ success: boolean; id: string; triggerAtMillis: number }>;

  scheduleExact(options: ScheduleAlarmOptions): Promise<{ success: boolean; alarmId: string; triggerMs: number }>;

  cancelAlarm(options: { id?: string; alarmId?: string }): Promise<{ success: boolean }>;

  cancelAll(): Promise<{ success: boolean }>;

  getScheduledAlarms(): Promise<{ alarms: ScheduledAlarmItem[] }>;

  checkExactAlarmPermission(): Promise<{ canSchedule: boolean }>;

  requestExactAlarmPermission(): Promise<{ success: boolean }>;

  stopAlarm(): Promise<{ success: boolean }>;

  completeAlarm(options?: { alarmId?: string }): Promise<{ success: boolean }>;

  stopRinging(): Promise<{ success: boolean }>;

  startRinging(options: {
    alarmId: string;
    alarmTime: string;
    alarmLabel: string;
    dismissalType?: string;
    pushupTarget?: number;
    rampDuration: number;
  }): Promise<{ success: boolean }>;

  getNetworkStatus(): Promise<{ isOnline: boolean }>;

  canScheduleExactAlarms(): Promise<{ canSchedule: boolean }>;

  canUseFullScreenIntent(): Promise<{ canUse: boolean }>;

  requestFullScreenIntentPermission(): Promise<{ success: boolean }>;

  isBatteryOptimizationIgnored(): Promise<{ isIgnored: boolean }>;

  requestBatteryOptimizationExemption(): Promise<{ success: boolean }>;

  canDrawOverlays(): Promise<{ canDraw: boolean }>;

  requestOverlayPermission(): Promise<{ success: boolean }>;

  openOemSettings(): Promise<{ success: boolean; launchedOem: boolean; manufacturer: string }>;

  autoConfigureReliability(): Promise<{ success: boolean; action: string; message: string }>;

  getBackgroundPermissionStatus(): Promise<{
    canExact: boolean;
    canFullScreen: boolean;
    isBatteryIgnored: boolean;
    canDrawOverlays: boolean;
    manufacturer: string;
    allGranted: boolean;
  }>;

  getPendingAlarm(): Promise<{
    alarm: {
      alarmId: string;
      alarmTime: string;
      alarmLabel: string;
      dismissalType: string;
      pushupTarget: number;
      rampDuration: number;
    } | null;
  }>;

  clearPendingAlarm(): Promise<{ success: boolean }>;

  refreshKeepAlive(): Promise<{ success: boolean }>;

  launchPushUpActivity(options: { target: number }): Promise<{ completed: boolean; completedReps?: number }>;
}

export const AlarmSchedulerNative = registerPlugin<AlarmSchedulerPluginInterface>('AlarmScheduler');

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
  private static triggerCallback: ((triggerData: any) => void) | null = null;

  public static async init(onAlarmTrigger: (triggerData: any) => void): Promise<void> {
    this.triggerCallback = onAlarmTrigger;
    if (this.isInitialized) return;

    try {
      // 1. Create high-priority alarm notification channel for Android 8.0+
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
                title: 'Start Challenge',
                foreground: true,
              },
            ],
          },
        ],
      });

      // 4. Listen for user clicking or interacting with notification
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const alarmId = action.notification.extra?.alarmId;
        if (alarmId && AlarmNotificationService.triggerCallback) {
          AlarmNotificationService.triggerCallback(alarmId);
        }
      });

      // 5. Listen for notification firing while app is open/minimized
      LocalNotifications.addListener('localNotificationReceived', (notification) => {
        // Critical: Do NOT treat the ringing heads-up banner as a new alarm trigger!
        if (notification.id === 888888 || notification.extra?.isRinging) {
          return;
        }
        const alarmId = notification.extra?.alarmId;
        if (alarmId && AlarmNotificationService.triggerCallback) {
          AlarmNotificationService.triggerCallback(alarmId);
        }
      });

      // 6. Listen for native alarm fired event (from AlarmTriggerHandler / AlarmService via MainActivity)
      if (typeof window !== 'undefined') {
        window.addEventListener('nativeAlarmFired', ((event: CustomEvent) => {
          const detail = event.detail;
          if (detail && detail.alarmId) {
            console.log('[AlarmNotificationService] Native alarm fired with full payload:', detail);
            if (AlarmNotificationService.triggerCallback) {
              AlarmNotificationService.triggerCallback(detail);
            }
          }
        }) as EventListener);
      }

      // 7. Check for pending alarm that launched or woke the app (vital for cold-starts)
      if (Capacitor.isNativePlatform()) {
        try {
          const res = await AlarmSchedulerNative.getPendingAlarm();
          if (res && res.alarm && res.alarm.alarmId) {
            console.log('[AlarmNotificationService] Found pending alarm on init:', res.alarm);
            if (AlarmNotificationService.triggerCallback) {
              AlarmNotificationService.triggerCallback(res.alarm);
            }
          }
        } catch (e) {
          console.warn('[AlarmNotificationService] getPendingAlarm error on init:', e);
        }
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('[AlarmNotificationService] Init error:', err);
    }
  }

  // Show immediate floating heads-up banner when alarm starts firing (web / fallback)
  public static async showRingingNotification(alarm: Alarm): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // On native Android, AlarmService is the authoritative foreground notification with the exact task
      return;
    }
    try {
      const taskText =
        alarm.dismissalType === 'PUSHUP_MATH'
          ? `${alarm.pushupTarget || 5} Pushups`
          : alarm.dismissalType === 'BRIGHTNESS'
          ? 'Light Check'
          : alarm.dismissalType === 'CLICK_SHAKE' || (alarm.dismissalType as string) === 'FACE_AWAY'
          ? '100 Taps + 5 Shakes'
          : alarm.dismissalType === 'OBJECT_MATCH'
          ? 'Object Scan'
          : 'Math Challenge';

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 888888,
            title: "⏰ Time's up",
            body: `Rise • ${formatTime12h(alarm.time).formatted} • ${taskText}`,
            schedule: { at: new Date(Date.now() + 50) },
            channelId: CHANNEL_ID,
            actionTypeId: 'RISE_ALARM_ACTIONS',
            smallIcon: 'ic_alarm_notification',
            iconColor: '#3B82F6',
            ongoing: true,
            autoCancel: true,
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
          dismissalType: alarm.dismissalType,
          pushupTarget: alarm.pushupTarget || 5,
          rampDuration: alarm.rampDuration || 30,
        });
      } catch (e) {
        console.warn('[AlarmNotificationService] Failed to start native alarm service:', e);
      }
    }
  }

  // Cancel ringing heads-up notification when challenge is dismissed
  public static async cancelRingingNotification(alarmId?: string): Promise<void> {
    try {
      const cancelList: { id: number }[] = [{ id: 888888 }, { id: 1001 }];
      if (alarmId) {
        cancelList.push({ id: getNotificationId(alarmId) });
      }
      await LocalNotifications.cancel({
        notifications: cancelList,
      });

      // Clear all delivered notifications so nothing lingers in status bar
      try {
        await LocalNotifications.removeAllDeliveredNotifications();
      } catch (e) {
        console.warn('[AlarmNotificationService] removeAllDeliveredNotifications error:', e);
      }

      // Also stop the native foreground AlarmService and clear pending alarm
      if (Capacitor.isNativePlatform()) {
        try {
          await AlarmSchedulerNative.completeAlarm({ alarmId });
          await AlarmSchedulerNative.clearPendingAlarm();
          await AlarmSchedulerNative.refreshKeepAlive();
        } catch (e) {
          console.warn('[AlarmNotificationService] Failed to complete native alarm service:', e);
        }
      }
    } catch (e) {
      console.warn('[AlarmNotificationService] Failed to cancel notification:', e);
    }
  }

  // Calculate the next upcoming Date for an alarm time (HH:mm) and daysOfWeek
  public static getNextAlarmDate(timeStr: string, daysOfWeek: number[] = []): Date {
    const now = new Date();
    const [h, m] = (timeStr || '07:00').split(':').map(Number);

    if (daysOfWeek && daysOfWeek.length > 0 && daysOfWeek.length < 7) {
      // Find next matching day of week
      for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const candidate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + dayOffset,
          h,
          m,
          0,
          0
        );
        if (candidate.getTime() > now.getTime() && daysOfWeek.includes(candidate.getDay())) {
          return candidate;
        }
      }
    }

    // Single alarm (empty daysOfWeek) or everyday (all 7 days)
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    );
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
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
            await AlarmSchedulerNative.scheduleAlarm({
              id: alarm.id,
              alarmId: alarm.id,
              triggerAtMillis: nextDate.getTime(),
              triggerMs: nextDate.getTime(),
              triggerMsStr: String(nextDate.getTime()),
              title: alarm.label || 'Rise Alarm',
              alarmTime: alarm.time,
              alarmLabel: alarm.label || 'Rise Alarm',
              dismissalType: alarm.dismissalType,
              pushupTarget: alarm.pushupTarget || 5,
              rampDuration: alarm.rampDuration || 30,
              daysOfWeek: alarm.daysOfWeek || [],
            });
            console.log(`[AlarmNotificationService] Native alarm scheduled: ${alarm.id} at ${alarm.time} (${nextDate.toLocaleString()})`);
          } catch (e) {
            console.warn(`[AlarmNotificationService] Native schedule failed for ${alarm.id}:`, e);
          }
        } else {
          // Schedule a LocalNotification for web / non-native fallback
          notificationsToSchedule.push({
            id: notifId,
            title: `⏰ Alarm — ${formatTime12h(alarm.time).formatted}`,
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
      }

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule,
        });
      }

      // 3. Keep-Alive Foreground Service: Ensure keep-alive service is synced with current alarms
      if (isNative) {
        await this.refreshKeepAlive();
      }
    } catch (err) {
      console.warn('[AlarmNotificationService] Failed to sync alarms:', err);
    }
  }

  // Refresh persistent keep-alive service status (keeps app process alive on swipe)
  public static async refreshKeepAlive(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AlarmSchedulerNative.refreshKeepAlive();
      } catch (e) {
        console.warn('[AlarmNotificationService] refreshKeepAlive error:', e);
      }
    }
  }

  // Explicit typed methods for native Capacitor alarm management
  public static async scheduleAlarm(options: ScheduleAlarmOptions): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.scheduleAlarm(options);
        return res?.success ?? false;
      } catch (e) {
        console.error('[AlarmNotificationService] scheduleAlarm error:', e);
        return false;
      }
    }
    return true;
  }

  public static async cancelAlarm(id: string): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.cancelAlarm({ id, alarmId: id });
        return res?.success ?? false;
      } catch (e) {
        console.error('[AlarmNotificationService] cancelAlarm error:', e);
        return false;
      }
    }
    return true;
  }

  public static async getScheduledAlarms(): Promise<ScheduledAlarmItem[]> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.getScheduledAlarms();
        return res?.alarms || [];
      } catch (e) {
        console.warn('[AlarmNotificationService] getScheduledAlarms error:', e);
      }
    }
    return [];
  }

  public static async stopAlarm(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.stopAlarm();
        return res?.success ?? false;
      } catch (e) {
        console.warn('[AlarmNotificationService] stopAlarm error:', e);
      }
    }
    return true;
  }

  public static async completeAlarm(alarmId?: string): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.completeAlarm({ alarmId });
        return res?.success ?? false;
      } catch (e) {
        console.warn('[AlarmNotificationService] completeAlarm error:', e);
      }
    }
    return true;
  }

  // Check live validated network status via native NetworkMonitor
  public static async getNetworkStatus(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.getNetworkStatus();
        return Boolean(res?.isOnline);
      } catch (e) {
        console.warn('[AlarmNotificationService] getNetworkStatus native error:', e);
      }
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  // Check whether battery optimization is ignored (true = unrestricted background execution)
  public static async isBatteryOptimizationIgnored(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.isBatteryOptimizationIgnored();
        return Boolean(res?.isIgnored);
      } catch (e) {
        console.warn('[AlarmNotificationService] isBatteryOptimizationIgnored error:', e);
      }
    }
    return true;
  }

  // Prompt the user to whitelist the app from aggressive OEM battery savers
  public static async requestBatteryOptimizationExemption(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AlarmSchedulerNative.requestBatteryOptimizationExemption();
      } catch (e) {
        console.warn('[AlarmNotificationService] requestBatteryOptimizationExemption error:', e);
      }
    }
  }

  // Check whether exact alarms can be scheduled
  public static async canScheduleExactAlarms(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.canScheduleExactAlarms();
        return Boolean(res?.canSchedule);
      } catch (e) {
        console.warn('[AlarmNotificationService] canScheduleExactAlarms error:', e);
      }
    }
    return true;
  }

  // Open system settings to grant exact alarm scheduling
  public static async requestExactAlarmPermission(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AlarmSchedulerNative.requestExactAlarmPermission();
      } catch (e) {
        console.warn('[AlarmNotificationService] requestExactAlarmPermission error:', e);
      }
    }
  }

  // Check whether full-screen intent is enabled on Android 14+
  public static async canUseFullScreenIntent(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.canUseFullScreenIntent();
        return Boolean(res?.canUse);
      } catch (e) {
        console.warn('[AlarmNotificationService] canUseFullScreenIntent error:', e);
      }
    }
    return true;
  }

  // Open system settings to grant full-screen intent on Android 14+
  public static async requestFullScreenIntentPermission(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AlarmSchedulerNative.requestFullScreenIntentPermission();
      } catch (e) {
        console.warn('[AlarmNotificationService] requestFullScreenIntentPermission error:', e);
      }
    }
  }

  // Check whether Display Over Other Apps (Overlay) is allowed
  public static async canDrawOverlays(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AlarmSchedulerNative.canDrawOverlays();
        return Boolean(res?.canDraw);
      } catch (e) {
        console.warn('[AlarmNotificationService] canDrawOverlays error:', e);
      }
    }
    return true;
  }

  // Request Display Over Other Apps (Overlay) permission
  public static async requestOverlayPermission(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AlarmSchedulerNative.requestOverlayPermission();
      } catch (e) {
        console.warn('[AlarmNotificationService] requestOverlayPermission error:', e);
      }
    }
  }

  // Open OEM specific settings for Realme, Xiaomi, Oppo, Vivo, Samsung
  public static async openOemSettings(): Promise<{ success: boolean; launchedOem: boolean; manufacturer: string }> {
    if (Capacitor.isNativePlatform()) {
      try {
        return await AlarmSchedulerNative.openOemSettings();
      } catch (e) {
        console.warn('[AlarmNotificationService] openOemSettings error:', e);
      }
    }
    return { success: false, launchedOem: false, manufacturer: 'generic' };
  }

  // 1-Tap automatic configuration that steps through the missing permissions
  public static async autoConfigureReliability(): Promise<{ success: boolean; action: string; message: string }> {
    if (Capacitor.isNativePlatform()) {
      try {
        return await AlarmSchedulerNative.autoConfigureReliability();
      } catch (e) {
        console.error('[AlarmNotificationService] autoConfigureReliability error:', e);
      }
    }
    return { success: true, action: 'ALL_CONFIGURED', message: 'All configured' };
  }

  // Check aggregate background reliability permission status
  public static async getBackgroundPermissionStatus(): Promise<{
    canExact: boolean;
    canFullScreen: boolean;
    isBatteryIgnored: boolean;
    canDrawOverlays: boolean;
    manufacturer: string;
    allGranted: boolean;
  }> {
    if (Capacitor.isNativePlatform()) {
      try {
        return await AlarmSchedulerNative.getBackgroundPermissionStatus();
      } catch (e) {
        console.warn('[AlarmNotificationService] getBackgroundPermissionStatus error:', e);
      }
    }
    return {
      canExact: true,
      canFullScreen: true,
      isBatteryIgnored: true,
      canDrawOverlays: true,
      manufacturer: 'generic',
      allGranted: true,
    };
  }

  // Schedule a test alarm X seconds in the future to verify background execution
  public static async scheduleTestAlarm(secondsFromNow = 15): Promise<boolean> {
    const isNative = Capacitor.isNativePlatform();
    const testDate = new Date(Date.now() + secondsFromNow * 1000);
    const timeStr = `${String(testDate.getHours()).padStart(2, '0')}:${String(testDate.getMinutes()).padStart(2, '0')}`;

    if (isNative) {
      try {
        const testId = `test-alarm-${Date.now()}`;
        await AlarmSchedulerNative.scheduleAlarm({
          id: testId,
          alarmId: testId,
          triggerAtMillis: testDate.getTime(),
          triggerMs: testDate.getTime(),
          triggerMsStr: String(testDate.getTime()),
          title: 'Rise Test Alarm',
          alarmTime: timeStr,
          alarmLabel: 'Rise Test Alarm',
          dismissalType: 'CLICK_SHAKE',
          pushupTarget: 5,
          rampDuration: 10,
          daysOfWeek: [],
        });
        console.log(`[AlarmNotificationService] Test alarm scheduled for ${testDate.toLocaleTimeString()} (${secondsFromNow}s)`);
        return true;
      } catch (e) {
        console.error('[AlarmNotificationService] Failed to schedule test alarm:', e);
        return false;
      }
    }
    return false;
  }
}
