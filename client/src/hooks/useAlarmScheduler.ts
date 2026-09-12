import { useEffect, useRef, useState, useCallback } from 'react';
import { Alarm } from '../types/alarm';
import { synth } from '../services/WebAudioSynth';
import { AlarmNotificationService } from '../services/AlarmNotificationService';

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
    activeAlarmIdRef.current = alarm.id;
    setActiveRingingAlarm(alarm);
    const now = performance.now();
    setAlarmTriggerTimestamp(now);
    synth.startAlarm(alarm.rampDuration);
    onAlarmTriggerRef.current(alarm);

    // Trigger high-priority heads-up banner notification on Android & iOS
    AlarmNotificationService.showRingingNotification(alarm);
  }, []);

  // Initialize native background AlarmNotificationService
  useEffect(() => {
    AlarmNotificationService.init((alarmId) => {
      const match = alarms.find((a) => a.id === alarmId);
      if (match) {
        triggerAlarm(match);
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
    AlarmNotificationService.cancelRingingNotification();

    const responseTimeSec = alarmTriggerTimestamp
      ? Math.max(1, Math.round((performance.now() - alarmTriggerTimestamp) / 1000))
      : 5;

    const dismissedAlarm = activeRingingAlarm;
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
