export type DismissalType =
  | 'PUSHUP_MATH'
  | 'BRIGHTNESS'
  | 'FACE_AWAY'
  | 'OBJECT_MATCH'
  | 'MATH';

export interface Alarm {
  id: string;
  time: string; // HH:mm 24-hr format
  label: string;
  daysOfWeek: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dismissalType: DismissalType;
  pushupTarget: number;
  referenceDescriptor?: string | null;
  targetLocation?: string | null; // Named location for OBJECT_MATCH (e.g. 'Kitchen', 'Bathroom')
  rampDuration: number; // Seconds to ramp volume
  preAlarmEnabled: boolean; // Gentle haptic vibration before alarm
  preAlarmMinutes?: number; // Minutes before alarm (5, 10, 15, or 0/undefined for off)
  isEnabled: boolean;
}

export interface WakeLogItem {
  id: string;
  alarmId?: string | null;
  scheduledTime: string;
  dismissedAt: string;
  responseTimeSeconds: number;
  dismissalType: DismissalType;
  success: boolean;
}

export interface SleepWindowInsight {
  date: string;
  hours: number;
  responseTimeSeconds: number;
}

export interface UserProfile {
  id: string;
  email: string;
  token?: string;
}
