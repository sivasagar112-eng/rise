import React, { useState } from 'react';
import { synth } from '../../services/WebAudioSynth';
import {
  Sun,
  Moon,
  Volume2,
  ShieldCheck,
  X,
  Music,
  Bell,
  Camera,
  Clock,
  Smartphone,
  Zap,
  CheckCircle2,
  Vibrate,
  Sparkles,
} from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AlarmNotificationService } from '../../services/AlarmNotificationService';
import { Haptics } from '../../services/HapticFeedback';

interface SettingsScreenProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  theme,
  onToggleTheme,
  onClose,
}) => {
  const [customRingtoneName, setCustomRingtoneName] = useState<string | null>(
    localStorage.getItem('rise_custom_ringtone_name')
  );
  const [isPlayingAudioTest, setIsPlayingAudioTest] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Untested');
  const [notificationStatus, setNotificationStatus] = useState<string>('Untested');
  const [batteryStatus, setBatteryStatus] = useState<string>('Checking…');
  const [exactAlarmStatus, setExactAlarmStatus] = useState<string>('Checking…');
  const [fullScreenStatus, setFullScreenStatus] = useState<string>('Checking…');
  const [overlayStatus, setOverlayStatus] = useState<string>('Checking…');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [autoConfiguring, setAutoConfiguring] = useState<boolean>(false);
  const [allReliabilityReady, setAllReliabilityReady] = useState<boolean>(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [notificationTesting, setNotificationTesting] = useState(false);

  // Haptic & Sound Feedback states
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() =>
    Haptics.isHapticsEnabled()
  );
  const [audioClicksEnabled, setAudioClicksEnabled] = useState<boolean>(() =>
    Haptics.isAudioClicksEnabled()
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const testVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const testStreamRef = React.useRef<MediaStream | null>(null);

  const refreshPermissions = React.useCallback(async () => {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        setNotificationStatus('Granted ✓');
      }

      const status = await AlarmNotificationService.getBackgroundPermissionStatus();
      setBatteryStatus(status.isBatteryIgnored ? 'Unrestricted ✓' : 'Optimized ⚠️');
      setExactAlarmStatus(status.canExact ? 'Allowed ✓' : 'Disabled ⚠️');
      setFullScreenStatus(status.canFullScreen ? 'Allowed ✓' : 'Disabled ⚠️');
      setOverlayStatus(status.canDrawOverlays ? 'Allowed ✓' : 'Disabled ⚠️');
      setManufacturer(
        status.manufacturer
          ? status.manufacturer.charAt(0).toUpperCase() +
              status.manufacturer.slice(1).toLowerCase()
          : ''
      );
      setAllReliabilityReady(status.allGranted);
    } catch (e) {
      console.warn('Error probing permissions:', e);
    }
  }, []);

  // Probe hardware and permission status on mount
  React.useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const hasActiveCam = devices.some((d) => d.kind === 'videoinput' && d.label !== '');
        if (hasActiveCam) {
          setCameraStatus('Granted ✓');
        }
      }).catch(() => {});
    }

    refreshPermissions();
  }, [refreshPermissions]);

  const handlePickRingtone = () => {
    Haptics.light();
    fileInputRef.current?.click();
  };

  const handleRingtoneSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file (mp3, wav, ogg, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Please select a ringtone under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem('rise_custom_ringtone_url', dataUrl);
      localStorage.setItem('rise_custom_ringtone_name', file.name);
      setCustomRingtoneName(file.name);
      Haptics.success();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveRingtone = () => {
    Haptics.heavy();
    localStorage.removeItem('rise_custom_ringtone_url');
    localStorage.removeItem('rise_custom_ringtone_name');
    setCustomRingtoneName(null);
  };

  const handleTestAudio = () => {
    Haptics.medium();
    if (isPlayingAudioTest) {
      synth.stopAlarm();
      setIsPlayingAudioTest(false);
    } else {
      setIsPlayingAudioTest(true);
      synth.startAlarm(10);
      setTimeout(() => {
        synth.stopAlarm();
        setIsPlayingAudioTest(false);
      }, 5000);
    }
  };

  const handleToggleHaptics = () => {
    const next = !hapticsEnabled;
    setHapticsEnabled(next);
    Haptics.setHapticsEnabled(next);
    if (next) Haptics.medium();
  };

  const handleToggleAudioClicks = () => {
    const next = !audioClicksEnabled;
    setAudioClicksEnabled(next);
    Haptics.setAudioClicksEnabled(next);
    if (next) Haptics.selection();
  };

  const handleTestCamera = async () => {
    Haptics.light();
    setIsCameraModalOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      testStreamRef.current = stream;
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
        testVideoRef.current.play().catch(() => {});
      }
      setCameraStatus('Granted ✓');
    } catch (err) {
      console.warn('Camera test error:', err);
      setCameraStatus('Denied ✗');
    }
  };

  const handleCloseCameraTest = () => {
    Haptics.light();
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    setIsCameraModalOpen(false);
  };

  const handleTestNotification = async () => {
    Haptics.light();
    setNotificationTesting(true);
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        setNotificationStatus('Granted ✓');
        await AlarmNotificationService.showRingingNotification({
          id: 'test-alarm',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          label: 'Test Wake-Up',
          daysOfWeek: [],
          dismissalType: 'PUSHUP_MATH',
          pushupTarget: 5,
          referenceDescriptor: null,
          rampDuration: 20,
          preAlarmEnabled: false,
          isEnabled: true,
        });
      } else {
        setNotificationStatus('Denied ✗');
      }
    } catch (err) {
      console.warn('Notification test error:', err);
    } finally {
      setTimeout(() => setNotificationTesting(false), 2000);
    }
  };

  const handleAutoConfigureReliability = async () => {
    Haptics.medium();
    setAutoConfiguring(true);
    try {
      await AlarmNotificationService.autoConfigureReliability();
      setTimeout(async () => {
        await refreshPermissions();
        setAutoConfiguring(false);
      }, 1500);
    } catch (e) {
      console.error('autoConfigureReliability error:', e);
      setAutoConfiguring(false);
    }
  };

  const handleRequestBatteryExemption = async () => {
    Haptics.light();
    await AlarmNotificationService.requestBatteryOptimizationExemption();
    setTimeout(refreshPermissions, 1500);
  };

  const handleRequestExactAlarm = async () => {
    Haptics.light();
    await AlarmNotificationService.requestExactAlarmPermission();
    setTimeout(refreshPermissions, 1500);
  };

  const handleRequestFullScreen = async () => {
    Haptics.light();
    await AlarmNotificationService.requestFullScreenIntentPermission();
    setTimeout(refreshPermissions, 1500);
  };

  const handleRequestOverlay = async () => {
    Haptics.light();
    await AlarmNotificationService.requestOverlayPermission();
    setTimeout(refreshPermissions, 1500);
  };

  const [testAlarmState, setTestAlarmState] = useState<string | null>(null);

  const handleTestBackgroundAlarm = async () => {
    Haptics.medium();
    setTestAlarmState('Scheduling…');
    const success = await AlarmNotificationService.scheduleTestAlarm(15);
    if (success) {
      setTestAlarmState('Scheduled! Lock phone now');
      alert(
        '⏰ Test alarm scheduled to fire in 15 SECONDS!\n\nLock your phone or swipe the app from Recents right now to test.'
      );
    } else {
      setTestAlarmState('Failed');
      alert(
        'Failed to schedule exact test alarm. Please ensure Exact Alarm permission is enabled.'
      );
    }
    setTimeout(() => setTestAlarmState(null), 6000);
  };

  return (
    <div className="w-full min-h-full pb-20 select-none bg-theme-bg text-theme-text">
      {/* ── Top Header ── */}
      <div className="relative px-6 pt-8 pb-6 border-b border-theme-border">
        <button
          onClick={() => {
            Haptics.light();
            onClose();
          }}
          className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full glass-pill press-spring"
          aria-label="Close"
        >
          <X size={18} className="text-theme-subtext" />
        </button>

        <p className="text-xs font-black tracking-widest uppercase text-blue-500 mb-1 flex items-center gap-1.5">
          <Sparkles size={13} />
          <span>Rise Settings</span>
        </p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-theme-text leading-tight">
          Preferences
        </h1>
        <p className="text-xs text-theme-subtext mt-1.5 font-medium">
          Fine-tune alarms, haptics, audio, and background reliability.
        </p>
      </div>

      <div className="px-6 py-6 space-y-5 max-w-md mx-auto">
        {/* ── Theme & Appearance ── */}
        <div className="rounded-3xl border border-theme-card-border bg-theme-card overflow-hidden shadow-card">
          <div className="px-5 pt-4 pb-1">
            <p className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
              Theme &amp; Appearance
            </p>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-theme-text">Color Theme</p>
              <p className="text-xs text-theme-subtext mt-0.5">
                {theme === 'dark' ? 'Obsidian dark mode' : 'Porcelain light mode'}
              </p>
            </div>
            <button
              onClick={() => {
                Haptics.selection();
                onToggleTheme();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl glass-pill press-spring text-xs font-black text-theme-text"
            >
              {theme === 'dark' ? (
                <>
                  <Moon size={15} className="text-blue-400" />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun size={15} className="text-amber-500" />
                  <span>Light</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Tactile Feedback & Haptics ── */}
        <div className="rounded-3xl border border-theme-card-border bg-theme-card overflow-hidden shadow-card">
          <div className="px-5 pt-4 pb-1">
            <p className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
              Tactile &amp; Haptic Experience
            </p>
          </div>

          {/* Haptic Vibration Toggle */}
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div className="flex-1 pr-3">
              <div className="flex items-center gap-2">
                <Vibrate size={16} className="text-blue-500" />
                <p className="text-sm font-extrabold text-theme-text">Haptic Vibration</p>
              </div>
              <p className="text-xs text-theme-subtext mt-0.5">
                Tactile pulses on clicks, dials, toggles &amp; alarms
              </p>
            </div>
            <div
              onClick={handleToggleHaptics}
              className={`w-[52px] h-[30px] rounded-full relative p-[3px] flex items-center cursor-pointer toggle-track press-spring ${
                hapticsEnabled ? 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.4)]' : 'bg-[var(--toggle-off)]'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white toggle-thumb shadow-md ${
                  hapticsEnabled ? 'translate-x-[22px]' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Mechanical Audio Micro-Clicks */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between">
            <div className="flex-1 pr-3">
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-indigo-400" />
                <p className="text-sm font-extrabold text-theme-text">Mechanical Micro-Clicks</p>
              </div>
              <p className="text-xs text-theme-subtext mt-0.5">
                Physical audio clicks for scroll wheels &amp; buttons
              </p>
            </div>
            <div
              onClick={handleToggleAudioClicks}
              className={`w-[52px] h-[30px] rounded-full relative p-[3px] flex items-center cursor-pointer toggle-track press-spring ${
                audioClicksEnabled
                  ? 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                  : 'bg-[var(--toggle-off)]'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white toggle-thumb shadow-md ${
                  audioClicksEnabled ? 'translate-x-[22px]' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </div>

        {/* ── Audio System ── */}
        <div className="rounded-3xl border border-theme-card-border bg-theme-card overflow-hidden shadow-card">
          <div className="px-5 pt-4 pb-1">
            <p className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
              Ringtone &amp; Sound
            </p>
          </div>

          {/* Alarm Chime Test */}
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-theme-text">Alarm Sound</p>
              <p className="text-xs text-theme-subtext mt-0.5 truncate max-w-[190px]">
                {customRingtoneName
                  ? `Custom: ${customRingtoneName}`
                  : 'Rise Wake Audio (Continuous Loop)'}
              </p>
            </div>
            <button
              onClick={handleTestAudio}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-black press-spring transition-all ${
                isPlayingAudioTest
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'glass-pill text-theme-text'
              }`}
            >
              <Volume2 size={14} />
              <span>{isPlayingAudioTest ? 'Playing…' : 'Test Sound'}</span>
            </button>
          </div>

          {/* Custom Ringtone Picker */}
          <div className="px-5 pb-4 border-t border-theme-border/50 pt-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-extrabold text-theme-text">Custom Audio File</p>
                <p className="text-xs text-theme-subtext mt-0.5">
                  {customRingtoneName ? customRingtoneName : 'Upload custom mp3 / audio'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {customRingtoneName && (
                  <button
                    onClick={handleRemoveRingtone}
                    className="px-2.5 py-1.5 rounded-xl border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/10 press-spring"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={handlePickRingtone}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring"
                >
                  <Music size={13} />
                  <span>{customRingtoneName ? 'Change' : 'Choose File'}</span>
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleRingtoneSelected}
              className="hidden"
            />
          </div>
        </div>

        {/* ── Hardware & System Permissions ── */}
        <div className="rounded-3xl border border-theme-card-border bg-theme-card overflow-hidden shadow-card">
          <div className="px-5 pt-4 pb-1">
            <p className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
              Hardware &amp; System Permissions
            </p>
          </div>

          {/* 1-Tap Auto Setup Banner */}
          {allReliabilityReady ? (
            <div className="p-3.5 mx-5 my-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-black text-emerald-300">
                  All Background Permissions Ready ✓
                </p>
                <p className="text-[11px] text-theme-subtext mt-0.5 leading-snug">
                  Alarms will wake the screen and ring even when your phone is locked or asleep.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 mx-5 my-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-500/30 flex items-center justify-between">
              <div className="flex-1 mr-3">
                <div className="flex items-center gap-1.5">
                  <Zap size={15} className="text-amber-400 fill-amber-400" />
                  <p className="text-xs font-black text-amber-300">
                    1-Tap Auto Setup {manufacturer ? `(${manufacturer})` : ''}
                  </p>
                </div>
                <p className="text-[11px] text-theme-subtext mt-0.5 leading-snug">
                  Configure battery unrestricted, exact alarms &amp; screen popups.
                </p>
              </div>
              <button
                onClick={handleAutoConfigureReliability}
                disabled={autoConfiguring}
                className="px-3.5 py-2 rounded-xl bg-amber-500 text-black text-xs font-black shadow-md hover:bg-amber-400 press-spring disabled:opacity-50 whitespace-nowrap"
              >
                {autoConfiguring ? 'Setting up…' : '1-Tap Fix'}
              </button>
            </div>
          )}

          {/* Camera Row */}
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-theme-text">Camera Access</p>
              <p className="text-xs text-theme-subtext mt-0.5">Status: {cameraStatus}</p>
            </div>
            <button
              onClick={handleTestCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring"
            >
              <Camera size={14} />
              <span>Test Camera</span>
            </button>
          </div>

          {/* Notifications Row */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-theme-text">Alarm Notifications</p>
              <p className="text-xs text-theme-subtext mt-0.5">Status: {notificationStatus}</p>
            </div>
            <button
              onClick={handleTestNotification}
              disabled={notificationTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring disabled:opacity-50"
            >
              <Bell size={14} />
              <span>{notificationTesting ? 'Testing…' : 'Test Capsule'}</span>
            </button>
          </div>

          {/* Background Battery Optimization */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-extrabold text-theme-text">Background Reliability</p>
              <p className="text-xs text-theme-subtext mt-0.5">Battery Saver: {batteryStatus}</p>
            </div>
            <button
              onClick={handleRequestBatteryExemption}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring"
            >
              <ShieldCheck size={14} />
              <span>Allow</span>
            </button>
          </div>

          {/* Display Over Other Apps */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-extrabold text-theme-text">Display Over Apps</p>
              <p className="text-xs text-theme-subtext mt-0.5">Pop-ups: {overlayStatus}</p>
            </div>
            <button
              onClick={handleRequestOverlay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring"
            >
              <Smartphone size={14} />
              <span>Allow</span>
            </button>
          </div>

          {/* Exact Alarm Permission */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-extrabold text-theme-text">Exact Alarm Scheduling</p>
              <p className="text-xs text-theme-subtext mt-0.5">Timing: {exactAlarmStatus}</p>
            </div>
            <button
              onClick={handleRequestExactAlarm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring"
            >
              <Clock size={14} />
              <span>Configure</span>
            </button>
          </div>

          {/* Full Screen Over Lockscreen */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-extrabold text-theme-text">Lock Screen Wake</p>
              <p className="text-xs text-theme-subtext mt-0.5">Screen UI: {fullScreenStatus}</p>
            </div>
            <button
              onClick={handleRequestFullScreen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-pill text-theme-text text-xs font-black press-spring"
            >
              <Smartphone size={14} />
              <span>Allow</span>
            </button>
          </div>

          {/* Test Background Alarm 15s */}
          <div className="px-5 py-3.5 border-t border-theme-border/50 flex items-center justify-between bg-blue-500/5">
            <div className="max-w-[210px]">
              <p className="text-sm font-extrabold text-blue-400">Test Background Alarm</p>
              <p className="text-xs text-theme-subtext mt-0.5">
                {testAlarmState || 'Rings in 15s (lock phone to test)'}
              </p>
            </div>
            <button
              onClick={handleTestBackgroundAlarm}
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-600 text-white text-xs font-black hover:bg-blue-500 press-spring shadow-lg shadow-blue-500/25"
            >
              <Clock size={14} />
              <span>{testAlarmState || 'Test in 15s'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Live Camera Test Modal ── */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-5 animate-fade-in">
          <div className="w-full max-w-xs bg-[#161722] border border-white/10 rounded-3xl p-5 text-center shadow-2xl text-white sheet-up">
            <h3 className="text-base font-black text-white mb-1">Camera Test</h3>
            <p className="text-xs text-neutral-400 mb-3">Live camera feed verification</p>
            <div className="relative aspect-4/3 bg-black rounded-2xl overflow-hidden border border-white/10 mb-4 shadow-inner">
              <video
                ref={testVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            </div>
            <button
              onClick={handleCloseCameraTest}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-2xl transition-all shadow-md press-spring"
            >
              Done (Camera Working ✓)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
