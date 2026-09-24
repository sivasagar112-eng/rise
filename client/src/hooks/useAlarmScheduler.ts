import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Alarm, DismissalType } from '../types/alarm';
import { synth } from '../services/WebAudioSynth';
import { AlarmNotificationService } from '../services/AlarmNotificationService';
import { StorageService } from '../services/StorageService';

const TASK_POOL: DismissalType[] = [
  'PUSHUP_MATH',
  'CLICK_SHAKE',
  'BRIGHTNESS',
  'OBJECT_MATCH',
  'MATH',
];

function getRandomDismissalTask(): DismissalType {
  const index = Math.floor(Math.random() * TASK_POOL.length);
  return TASK_POOL[index];
}

interface UseAlarmSchedulerProps {
  alarms: Alarm[];
  onAlarmTrigger: (alarm: Alarm) => void;
}

export function useAlarmScheduler({ alarms, onAlarmTrigger }: UseAlarmSchedulerProps) {
  const [activeRingingAlarm, setActiveRingingAlarm] = useState<Alarm | null>(null);
  const [alarmTriggerTimestamp, setAlarmTriggerTimestamp] = useState<number | null>(null);
  const lastCheckedMinuteRef = useRef<string>('');
  const preAlarmFiredRef = useRef<Set<string>>(new Set());
  const activeAlarmIdRef = useRef<string | null>(null);
  const recentlyDismissedRef = useRef<Map<string, number>>(new Map());

  const onAlarmTriggerRef = useRef(onAlarmTrigger);
  useEffect(() => {
    onAlarmTriggerRef.current = onAlarmTrigger;
  }, [onAlarmTrigger]);

  const triggerAlarm = useCallback((alarm: Alarm, fromNative: boolean = false) => {
    // Prevent duplicate triggers across ticker, native events, and notifications
    if (activeAlarmIdRef.current === alarm.id) {
      console.log(`[useAlarmScheduler] Alarm ${alarm.id} is already active, ignoring duplicate trigger`);
      return;
    }

    // Guard: Prevent re-triggering an alarm that was already completed within the past 65 seconds
    const nowMs = Date.now();
    let lastDismissedTime = recentlyDismissedRef.current.get(alarm.id) || 0;
    try {
      const stored = Number(localStorage.getItem(`rise_dismissed_at_${alarm.id}`) || '0');
      if (stored > lastDismissedTime) lastDismissedTime = stored;
    } catch {}

    if (lastDismissedTime > 0 && (nowMs - lastDismissedTime) < 65 * 1000) {
      console.log(`[useAlarmScheduler] Alarm ${alarm.id} was dismissed ${Math.round((nowMs - lastDismissedTime)/1000)}s ago (within same minute). Skipping duplicate trigger.`);
      return;
    }

    // Use assigned dismissalType or pick random task from the 5 available tasks
    const runtimeDismissal = alarm.dismissalType || getRandomDismissalTask();
    const runtimeAlarm: Alarm = {
      ...alarm,
      dismissalType: runtimeDismissal,
      pushupTarget: alarm.pushupTarget || 5,
    };
    console.log(`[useAlarmScheduler] Task selected for alarm ${alarm.id}: ${runtimeDismissal} (fromNative=${fromNative})`);

    activeAlarmIdRef.current = runtimeAlarm.id;
    setActiveRingingAlarm(runtimeAlarm);
    const now = performance.now();
    setAlarmTriggerTimestamp(now);

    // Audio stream synchronization:
    // On native Android, if already triggered by AlarmService in background, preserve active audio.
    // If triggered from JS ticker or web, start audio.
    if (Capacitor.isNativePlatform()) {
      if (!fromNative) {
        console.log('[useAlarmScheduler] Native Android: Starting single AlarmService audio instance');
        AlarmNotificationService.startNativeRinging(runtimeAlarm);
      } else {
        console.log('[useAlarmScheduler] Native Android: AlarmService already active in background, keeping smooth audio stream');
      }
      synth.stopAlarm();
    } else {
      console.log('[useAlarmScheduler] Web environment: Starting single WebAudioSynth audio instance');
      synth.startAlarm(runtimeAlarm.rampDuration);
    }

    onAlarmTriggerRef.current(runtimeAlarm);

    // Trigger high-priority heads-up banner notification on Android & iOS
    AlarmNotificationService.showRingingNotification(runtimeAlarm);
  }, []);

  // Initialize native background AlarmNotificationService
  useEffect(() => {
    AlarmNotificationService.init((triggerData) => {
      const alarmId = typeof triggerData === 'string' ? triggerData : triggerData?.alarmId;
      if (!alarmId) {
        console.warn('[useAlarmScheduler] Received trigger event with no alarmId');
        return;
      }

      // 1. Find in React state
      let match = alarms.find((a) => a.id === alarmId);

      // 2. Find in persistent storage
      if (!match) {
        const stored = StorageService.getAlarms();
        match = stored.find((a) => a.id === alarmId);
      }

      // 3. Construct directly from native intent extras if still not matched
      if (!match && typeof triggerData === 'object') {
        match = {
          id: alarmId,
          time: triggerData.alarmTime || '07:00',
          label: triggerData.alarmLabel || 'Rise Alarm',
          daysOfWeek: [],
          dismissalType: triggerData.dismissalType || 'PUSHUP_MATH',
          pushupTarget: triggerData.pushupTarget || 5,
          referenceDescriptor: null,
          rampDuration: triggerData.rampDuration || 30,
          preAlarmEnabled: false,
          isEnabled: true,
        };
        console.log('[useAlarmScheduler] Constructed alarm from native intent extras:', match);
      }

      if (match) {
        // Prevent cold-start reactivation if this alarm was already dismissed within the past 65 seconds
        const nowMs = Date.now();
        let lastDismissedTime = recentlyDismissedRef.current.get(match.id) || 0;
        try {
          const stored = Number(localStorage.getItem(`rise_dismissed_at_${match.id}`) || '0');
          if (stored > lastDismissedTime) lastDismissedTime = stored;
        } catch {}

        if (lastDismissedTime > 0 && (nowMs - lastDismissedTime) < 65 * 1000) {
          console.log('[useAlarmScheduler] Ignoring stale trigger for recently dismissed alarm:', match.id);
          AlarmNotificationService.cancelRingingNotification(match.id);
          return;
        }

        console.log('[useAlarmScheduler] Triggering matched alarm from native event:', match.id);
        triggerAlarm(match, true /* fromNative */);
      } else {
        console.error('[useAlarmScheduler] Failed to find or construct alarm for ID:', alarmId);
      }
    });
  }, [alarms, triggerAlarm]);

  // Sync scheduled alarms with native AlarmManager / LocalNotifications
  useEffect(() => {
    AlarmNotificationService.syncAlarms(alarms);
  }, [alarms]);

  // Main scheduler ticker
  useEffect(() => {
    const checkSchedule = () => {
      if (activeRingingAlarm) return; // Already ringing

      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ...
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentMinuteStr = `${currentHours}:${currentMinutes}`;

      if (currentMinuteStr === lastCheckedMinuteRef.current) {
        return;
      }
      lastCheckedMinuteRef.current = currentMinuteStr;

      for (const alarm of alarms) {
        if (!alarm.isEnabled) continue;

        // Check if today is scheduled in daysOfWeek
        const isScheduledToday = alarm.daysOfWeek.length === 0 || alarm.daysOfWeek.includes(currentDay);
        if (!isScheduledToday) continue;

        // Parse alarm hours and minutes
        const [alarmH, alarmM] = alarm.time.split(':').map(Number);
        const alarmDate = new Date(now);
        alarmDate.setHours(alarmH, alarmM, 0, 0);

        // Pre-alarm check (configured minutes prior, default 5)
        if (alarm.preAlarmEnabled) {
          const preMinutes = alarm.preAlarmMinutes || 5;
          const preAlarmDate = new Date(alarmDate.getTime() - preMinutes * 60 * 1000);
          const preH = String(preAlarmDate.getHours()).padStart(2, '0');
          const preM = String(preAlarmDate.getMinutes()).padStart(2, '0');
          const preMinuteStr = `${preH}:${preM}`;
          const preKey = `${alarm.id}_${preMinuteStr}`;

          if (currentMinuteStr === preMinuteStr && !preAlarmFiredRef.current.has(preKey)) {
            preAlarmFiredRef.current.add(preKey);
            synth.triggerPreAlarmHaptic();
          }
        }

        // Exact alarm trigger match
        if (currentMinuteStr === alarm.time) {
          const dismissedMinute = localStorage.getItem(`rise_dismissed_minute_${alarm.id}`);
          const dismissedAt = Number(localStorage.getItem(`rise_dismissed_at_${alarm.id}`) || '0');
          if (dismissedMinute === currentMinuteStr && (Date.now() - dismissedAt) < 65 * 1000) {
            continue; // Already completed in this exact minute
          }
          triggerAlarm(alarm);
          break;
        }
      }
    };

    const interval = setInterval(checkSchedule, 1000);
    return () => clearInterval(interval);
  }, [activeRingingAlarm, alarms, triggerAlarm]);

  // Immediate simulation / test trigger
  const testAlarmImmediately = useCallback((alarm?: Alarm) => {
    const target = alarm || alarms[0] || {
      id: 'test-alarm',
      time: '12:00',
      label: 'Test Wake-Up',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      dismissalType: 'PUSHUP_MATH',
      pushupTarget: 5,
      referenceDescriptor: null,
      rampDuration: 20,
      preAlarmEnabled: false,
      isEnabled: true,
    };
    triggerAlarm(target);
  }, [alarms, triggerAlarm]);

  // Clear any past dismissal records so newly saved/toggled alarm can fire immediately
  const clearDismissal = useCallback((alarmId: string) => {
    recentlyDismissedRef.current.delete(alarmId);
    try {
      localStorage.removeItem(`rise_dismissed_at_${alarmId}`);
      localStorage.removeItem(`rise_dismissed_minute_${alarmId}`);
      localStorage.removeItem(`rise_dismissed_${alarmId}`);
      localStorage.removeItem('rise_last_dismissed_time');
      localStorage.removeItem('rise_last_dismissed_alarm_id');
    } catch {}
  }, []);

  // Dismiss handler (called only when verified)
  const completeDismissal = useCallback(() => {
    synth.stopAlarm();
    synth.playSuccessTone();

    const dismissedAlarm = activeRingingAlarm;
    AlarmNotificationService.cancelRingingNotification(dismissedAlarm?.id);

    const responseTimeSec = alarmTriggerTimestamp
      ? Math.max(1, Math.round((performance.now() - alarmTriggerTimestamp) / 1000))
      : 5;

    if (dismissedAlarm) {
      const nowMs = Date.now();
      recentlyDismissedRef.current.set(dismissedAlarm.id, nowMs);
      try {
        localStorage.setItem(`rise_dismissed_at_${dismissedAlarm.id}`, String(nowMs));
        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        localStorage.setItem(`rise_dismissed_minute_${dismissedAlarm.id}`, `${currentHours}:${currentMinutes}`);
        localStorage.setItem(`rise_last_dismissed_time`, String(nowMs));
        localStorage.setItem(`rise_last_dismissed_alarm_id`, dismissedAlarm.id);
      } catch {}
    }
    activeAlarmIdRef.current = null;
    setActiveRingingAlarm(null);
    setAlarmTriggerTimestamp(null);

    return {
      alarm: dismissedAlarm,
      responseTimeSeconds: responseTimeSec,
    };
  }, [activeRingingAlarm, alarmTriggerTimestamp]);

  return {
    activeRingingAlarm,
    testAlarmImmediately,
    completeDismissal,
    clearDismissal,
  };
}
