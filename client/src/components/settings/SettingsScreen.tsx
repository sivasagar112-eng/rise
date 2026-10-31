import React, { useState } from 'react';
import { synth } from '../../services/WebAudioSynth';
import { Sun, Moon, Volume2, ShieldCheck, X, Music, Bell, Camera, Clock, Smartphone, Zap, CheckCircle2 } from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AlarmNotificationService } from '../../services/AlarmNotificationService';

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
      setManufacturer(status.manufacturer ? status.manufacturer.charAt(0).toUpperCase() + status.manufacturer.slice(1).toLowerCase() : '');
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
    fileInputRef.current?.click();
  };

  const handleRingtoneSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate it's an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file (mp3, wav, ogg, etc.)');
      return;
    }

    // Max 5MB to avoid localStorage limits
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
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleRemoveRingtone = () => {
    localStorage.removeItem('rise_custom_ringtone_url');
    localStorage.removeItem('rise_custom_ringtone_name');
    setCustomRingtoneName(null);
  };

  const handleTestAudio = () => {
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

  const handleTestCamera = async () => {
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
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    setIsCameraModalOpen(false);
  };

  const handleTestNotification = async () => {
    setNotificationTesting(true);
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        setNotificationStatus('Granted ✓');
        // Trigger live test capsule notification
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
    await AlarmNotificationService.requestBatteryOptimizationExemption();
    setTimeout(async () => {
      await refreshPermissions();
    }, 1500);
  };

  const handleRequestExactAlarm = async () => {
    await AlarmNotificationService.requestExactAlarmPermission();
    setTimeout(async () => {
      await refreshPermissions();
    }, 1500);
  };

  const handleRequestFullScreen = async () => {
    await AlarmNotificationService.requestFullScreenIntentPermission();
    setTimeout(async () => {
      await refreshPermissions();
    }, 1500);
  };

  const handleRequestOverlay = async () => {
    await AlarmNotificationService.requestOverlayPermission();
    setTimeout(async () => {
      await refreshPermissions();
    }, 1500);
  };


  const [testAlarmState, setTestAlarmState] = useState<string | null>(null);

  const handleTestBackgroundAlarm = async () => {
    setTestAlarmState('Scheduling…');
    const success = await AlarmNotificationService.scheduleTestAlarm(15);
    if (success) {
      setTestAlarmState('Scheduled! Lock phone now');
      alert('⏰ Test alarm scheduled to fire in 15 SECONDS!\n\nLock your phone or swipe the app from Recents right now to test.');
    } else {
      setTestAlarmState('Failed');
      alert('Failed to schedule exact test alarm. Please ensure Exact Alarm permission is enabled.');
    }
    setTimeout(() => setTestAlarmState(null), 6000);
  };

  return (
    <div className="w-full h-full select-none">

      {/* ── Hero Header ── */}
      <div className="relative px-6 pt-8 pb-6 border-b border-theme-border">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full border border-theme-border bg-theme-bg text-theme-subtext hover:text-theme-text transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Big aesthetic bold title */}
        <p className="text-[2.8vw] sm:text-xs font-semibold tracking-widest uppercase text-blue-500 mb-1">
          Rise — Settings
        </p>
        <h1 className="text-[8vw] sm:text-4xl font-bold tracking-tight text-theme-text leading-none">
          Your<br />
          <span className="text-theme-subtext font-light">Preferences.</span>
        </h1>
        <p className="text-[3vw] sm:text-sm text-theme-subtext mt-3 font-medium">
          Tailored for the disciplined riser.
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* ── Appearance ── */}
        <div className="rounded-2xl border border-theme-border bg-theme-card overflow-hidden shadow-sm">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-theme-subtext">
              Appearance
            </p>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-theme-text">Theme Mode</p>
              <p className="text-xs text-theme-subtext mt-0.5">
                {theme === 'dark' ? 'Pure black dark mode' : 'Clean white light mode'}
              </p>
            </div>
            <button
              onClick={onToggleTheme}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg hover:bg-theme-border/30 transition-colors text-sm font-semibold text-theme-text"
            >
              {theme === 'dark' ? (
                <><Moon size={15} className="text-blue-400" /><span>Dark</span></>
              ) : (
                <><Sun size={15} className="text-yellow-400" /><span>Light</span></>
              )}
            </button>
          </div>
        </div>

        {/* ── Audio ── */}
        <div className="rounded-2xl border border-theme-border bg-theme-card overflow-hidden shadow-sm">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-theme-subtext">
              Audio System
            </p>
          </div>

          {/* Alarm Chime Test */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-theme-text">Alarm Sound</p>
              <p className="text-xs text-theme-subtext mt-0.5">
                {customRingtoneName ? `Custom: ${customRingtoneName}` : 'Rise Alarm Audio (Continuous Loop)'}
              </p>
            </div>
            <button
              onClick={handleTestAudio}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all ${
                isPlayingAudioTest
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-theme-border bg-theme-bg text-theme-text hover:bg-theme-border/30'
              }`}
            >
              <Volume2 size={15} />
              <span>{isPlayingAudioTest ? 'Playing…' : 'Test (5s)'}</span>
            </button>
          </div>

          {/* Custom Ringtone Picker */}
          <div className="px-4 pb-3 border-t border-theme-border/50 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-theme-text">Custom Ringtone</p>
                <p className="text-xs text-theme-subtext mt-0.5">
                  {customRingtoneName
                    ? customRingtoneName
                    : 'Use your own alarm sound'
                  }
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {customRingtoneName && (
                  <button
                    onClick={handleRemoveRingtone}
                    className="px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-colors"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={handlePickRingtone}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-xs font-semibold hover:bg-theme-border/30 transition-colors"
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
        <div className="rounded-2xl border border-theme-border bg-theme-card overflow-hidden shadow-sm">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-theme-subtext">
              Hardware &amp; System Permissions
            </p>
          </div>

          {/* 1-Tap Auto Setup Banner */}
          {allReliabilityReady ? (
            <div className="p-3 mx-4 my-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center space-x-2.5">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-300">All Background Permissions Ready ✓</p>
                <p className="text-[10px] text-theme-subtext mt-0.5">Alarms will wake the screen and ring even when your phone is locked or asleep.</p>
              </div>
            </div>
          ) : (
            <div className="p-3 mx-4 my-2 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-500/30 flex items-center justify-between">
              <div className="flex-1 mr-3">
                <div className="flex items-center space-x-1.5">
                  <Zap size={15} className="text-amber-400 fill-amber-400" />
                  <p className="text-xs font-bold text-amber-300">
                    1-Tap Auto Setup {manufacturer ? `(${manufacturer})` : ''}
                  </p>
                </div>
                <p className="text-[11px] text-theme-subtext mt-0.5 leading-snug">
                  Automatically configure battery unrestricted, exact alarms &amp; screen popups.
                </p>
              </div>
              <button
                onClick={handleAutoConfigureReliability}
                disabled={autoConfiguring}
                className="px-3.5 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold shadow-md hover:bg-amber-400 transition-transform active:scale-95 disabled:opacity-50 whitespace-nowrap"
              >
                {autoConfiguring ? 'Setting up…' : '1-Tap Fix'}
              </button>
            </div>
          )}

          {/* Camera Row */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-theme-text">Camera Access</p>
              <p className="text-xs text-theme-subtext mt-0.5">Status: {cameraStatus}</p>
            </div>
            <button
              onClick={handleTestCamera}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold hover:bg-theme-border/30 transition-colors"
            >
              <Camera size={14} />
              <span>Test Camera</span>
            </button>
          </div>

          {/* Notifications Row */}
          <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-theme-text">Alarm Notifications</p>
              <p className="text-xs text-theme-subtext mt-0.5">Status: {notificationStatus}</p>
            </div>
            <button
              onClick={handleTestNotification}
              disabled={notificationTesting}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold hover:bg-theme-border/30 transition-colors disabled:opacity-50"
            >
              <Bell size={14} />
              <span>{notificationTesting ? 'Testing…' : 'Test Capsule'}</span>
            </button>
          </div>

          {/* Background Reliability / Battery Optimization */}
          <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-bold text-theme-text">Background Reliability</p>
              <p className="text-xs text-theme-subtext mt-0.5">Battery Saver: {batteryStatus}</p>
            </div>
            <button
              onClick={handleRequestBatteryExemption}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold hover:bg-theme-border/30 transition-colors"
            >
              <ShieldCheck size={14} />
              <span>Allow Background</span>
            </button>
          </div>

          {/* Display Over Other Apps / Pop-up Windows */}
          <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-bold text-theme-text">Display Over Other Apps</p>
              <p className="text-xs text-theme-subtext mt-0.5">Pop-up Windows: {overlayStatus}</p>
            </div>
            <button
              onClick={handleRequestOverlay}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold hover:bg-theme-border/30 transition-colors"
            >
              <Smartphone size={14} />
              <span>Allow Overlay</span>
            </button>
          </div>

          {/* Exact Alarm Permission */}
          <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-bold text-theme-text">Exact Alarm Scheduling</p>
              <p className="text-xs text-theme-subtext mt-0.5">Exact Timing: {exactAlarmStatus}</p>
            </div>
            <button
              onClick={handleRequestExactAlarm}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold hover:bg-theme-border/30 transition-colors"
            >
              <Clock size={14} />
              <span>Configure Alarms</span>
            </button>
          </div>

          {/* Full Screen Over Lockscreen */}
          <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-between">
            <div className="max-w-[210px]">
              <p className="text-sm font-bold text-theme-text">Display Over Lock Screen</p>
              <p className="text-xs text-theme-subtext mt-0.5">Lockscreen UI: {fullScreenStatus}</p>
            </div>
            <button
              onClick={handleRequestFullScreen}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-theme-border bg-theme-bg text-theme-text text-sm font-semibold hover:bg-theme-border/30 transition-colors"
            >
              <Smartphone size={14} />
              <span>Allow Screen Pop</span>
            </button>
          </div>



          {/* Test Background Alarm Row */}
          <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-between bg-blue-500/5">
            <div className="max-w-[210px]">
              <p className="text-sm font-bold text-blue-400">Test Background Alarm</p>
              <p className="text-xs text-theme-subtext mt-0.5">
                {testAlarmState || 'Rings in 15s (lock/swipe to test)'}
              </p>
            </div>
            <button
              onClick={handleTestBackgroundAlarm}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm active:scale-95"
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
          <div className="w-full max-w-xs bg-[#1a1a1c] border border-white/10 rounded-3xl p-5 text-center shadow-2xl text-white">
            <h3 className="text-base font-bold text-white mb-1">Camera Test</h3>
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
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md"
            >
              Done (Camera Working ✓)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
