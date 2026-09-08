import { Alarm, WakeLogItem, UserProfile } from '../types/alarm';

const STORAGE_KEYS = {
  ALARMS: 'rise_alarms_v1',
  USER: 'rise_user_v1',
  LOGS: 'rise_wakelogs_v1',
  THEME: 'rise_theme_v1',
  HAS_SEEN_ONBOARDING: 'rise_onboarding_done_v1',
};

export class StorageService {
  // Alarms
  public static getAlarms(): Alarm[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ALARMS);
      if (data !== null) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load alarms from storage:', e);
    }
    return [];
  }

  public static saveAlarms(alarms: Alarm[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(alarms));
    } catch (e) {
      console.error('Failed to save alarms:', e);
    }
  }

  public static addOrUpdateAlarm(alarm: Alarm): Alarm[] {
    const alarms = this.getAlarms();
    const index = alarms.findIndex((a) => a.id === alarm.id);
    let updated: Alarm[];
    if (index >= 0) {
      updated = [...alarms];
      updated[index] = alarm;
    } else {
      updated = [alarm, ...alarms];
    }
    this.saveAlarms(updated);
    return updated;
  }

  public static deleteAlarm(id: string): Alarm[] {
    const alarms = this.getAlarms().filter((a) => a.id !== id);
    this.saveAlarms(alarms);
    return alarms;
  }

  // Wake Logs & Streaks
  public static getWakeLogs(): WakeLogItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load wake logs:', e);
    }
    return [];
  }

  public static addWakeLog(log: WakeLogItem): WakeLogItem[] {
    const logs = this.getWakeLogs();
    const updated = [log, ...logs].slice(0, 100);
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save wake log:', e);
    }
    return updated;
  }

  public static calculateStreak(): number {
    const logs = this.getWakeLogs();
    if (!logs.length) return 0;

    let streak = 0;
    const daySet = new Set<string>();

    for (const log of logs) {
      if (!log.success) continue;
      const dayKey = log.dismissedAt.split('T')[0];
      if (!daySet.has(dayKey)) {
        daySet.add(dayKey);
        // Completed within 10 minutes (600s)
        if (log.responseTimeSeconds <= 600) {
          streak++;
        } else {
          break;
        }
      }
    }
    return streak;
  }

  // User Auth Profile
  public static getUser(): UserProfile | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER);
      if (data) return JSON.parse(data);
    } catch {
      return null;
    }
    return null;
  }

  public static saveUser(user: UserProfile | null): void {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.USER);
    } else {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }
  }

  // Theme
  public static getTheme(): 'dark' | 'light' {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME);
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  public static saveTheme(theme: 'dark' | 'light'): void {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }

  // Onboarding
  public static hasSeenOnboarding(): boolean {
    return localStorage.getItem(STORAGE_KEYS.HAS_SEEN_ONBOARDING) === 'true';
  }

  public static markOnboardingDone(): void {
    localStorage.setItem(STORAGE_KEYS.HAS_SEEN_ONBOARDING, 'true');
  }
}
