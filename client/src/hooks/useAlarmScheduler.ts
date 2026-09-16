import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Alarm } from '../types/alarm';
import { synth } from '../services/WebAudioSynth';
import { AlarmNotificationService } from '../services/AlarmNotificationService';
import { StorageService } from '../services/StorageService';

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

  const triggerAlarm = useCallback((alarm: Alarm) => {
    // Prevent duplicate triggers across ticker, native events, and notifications
    if (activeAlarmIdRef.current === alarm.id) {
      console.log(`[useAlarmScheduler] Alarm ${alarm.id} is already active, ignoring duplicate trigger`);
      return;
    }

    // Guard: Prevent rapid duplicate triggers (within 8 seconds) from race conditions
    const dismissedAtMem = recentlyDismissedRef.current.get(alarm.id) || 0;
    let dismissedAtStorage = 0;
    try {
      const stored = localStorage.getItem(`rise_dismissed_${alarm.id}`);
      if (stored) dismissedAtStorage = Number(stored);
    } catch {}
    const dismissedAt = Math.max(dismissedAtMem, dismissedAtStorage);
    if (dismissedAt && Date.now() - dismissedAt < 8 * 1000) {
      console.log(`[useAlarmScheduler] Alarm ${alarm.id} was just dismissed within 8 seconds. Ignoring duplicate.`);
      return;
    }

    activeAlarmIdRef.current = alarm.id;
    setActiveRingingAlarm(alarm);
    const now = performance.now();
    setAlarmTriggerTimestamp(now);

    // FIX 2: Ensure ONLY ONE audio source is ever active!
    // On native Android, AlarmService is the sole background/foreground audio player.
    // On web, WebAudioSynth is the sole audio player.
    if (Capacitor.isNativePlatform()) {
      console.log('[useAlarmScheduler] Native Android: Starting single AlarmService audio instance');
      AlarmNotificationService.startNativeRinging(alarm);
      // Ensure WebAudioSynth is stopped on native to prevent duplicate audio clash
      synth.stopAlarm();
    } else {
      console.log('[useAlarmScheduler] Web environment: Starting single WebAudioSynth audio instance');
      synth.startAlarm(alarm.rampDuration);
    }

    onAlarmTriggerRef.current(alarm);

    // Trigger high-priority heads-up banner notification on Android & iOS
    AlarmNotificationService.showRingingNotification(alarm);
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
        console.log('[useAlarmScheduler] Triggering matched alarm:', match.id);
        triggerAlarm(match);
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
      recentlyDismissedRef.current.set(dismissedAlarm.id, Date.now());
      try {
        localStorage.setItem(`rise_dismissed_${dismissedAlarm.id}`, String(Date.now()));
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
  };
}
