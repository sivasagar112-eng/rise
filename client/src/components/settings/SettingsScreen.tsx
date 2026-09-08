import React, { useState } from 'react';
import { StorageService } from '../../services/StorageService';
import { synth } from '../../services/WebAudioSynth';
import { api } from '../../api/client';
import { Sun, Moon, Volume2, ShieldCheck, LogOut, AlertCircle, X, Music, Bell, Camera } from 'lucide-react';
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
  const [user, setUser] = useState(StorageService.getUser());
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [customRingtoneName, setCustomRingtoneName] = useState<string | null>(
    localStorage.getItem('rise_custom_ringtone_name')
  );
  const [isPlayingAudioTest, setIsPlayingAudioTest] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Untested');
  const [notificationStatus, setNotificationStatus] = useState<string>('Untested');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [notificationTesting, setNotificationTesting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const testVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const testStreamRef = React.useRef<MediaStream | null>(null);

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

    LocalNotifications.checkPermissions().then((perm) => {
      if (perm.display === 'granted') {
        setNotificationStatus('Granted ✓');
      }
    }).catch(() => {});
  }, []);

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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (authMode === 'REGISTER') {
        const res = await api.register(email, password);
        const profile = { id: res.user.id, email: res.user.email, token: res.token };
        StorageService.saveUser(profile);
        setUser(profile);
      } else {
        const res = await api.login(email, password);
        const profile = { id: res.user.id, email: res.user.email, token: res.token };
        StorageService.saveUser(profile);
        setUser(profile);
      }
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    StorageService.saveUser(null);
    setUser(null);
  };

  return (
    <div className="w-full max-w-md mx-auto select-none">

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
        <p className="text-xs font-semibold tracking-widest uppercase text-blue-500 mb-1">
          Rise — Settings
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-theme-text leading-none">
          Your<br />
          <span className="text-theme-subtext font-light">Preferences.</span>
        </h1>
        <p className="text-sm text-theme-subtext mt-3 font-medium">
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
              <p className="text-sm font-bold text-theme-text">Alarm Chime</p>
              <p className="text-xs text-theme-subtext mt-0.5">
                {customRingtoneName ? `Custom: ${customRingtoneName}` : 'Synthesized harmonic volume ramp'}
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
        </div>

        {/* ── Account Sync ── */}
        <div className="rounded-2xl border border-theme-border bg-theme-card overflow-hidden shadow-sm">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-theme-subtext">
              Device Synchronization
            </p>
          </div>

          <div className="px-4 pb-4">
            {user ? (
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-base">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-theme-text">{user.email}</p>
                    <p className="text-xs text-theme-subtext">Cloud sync active</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full py-2 rounded-xl border border-red-500/30 text-red-500 text-sm font-semibold hover:bg-red-500/10 transition-colors flex items-center justify-center space-x-2"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="space-y-3 pt-2">
                {/* Sign In / Register Toggle */}
                <div className="flex rounded-xl bg-theme-bg border border-theme-border p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode('LOGIN')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${
                      authMode === 'LOGIN'
                        ? 'bg-theme-card text-theme-text shadow-sm'
                        : 'text-theme-subtext'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('REGISTER')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${
                      authMode === 'REGISTER'
                        ? 'bg-theme-card text-theme-text shadow-sm'
                        : 'text-theme-subtext'
                    }`}
                  >
                    Register
                  </button>
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center space-x-2">
                    <AlertCircle size={14} />
                    <span>{authError}</span>
                  </div>
                )}

                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm font-medium placeholder:text-theme-subtext focus:outline-none focus:border-blue-500 transition-colors"
                />
                <input
                  type="password"
                  placeholder="Password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm font-medium placeholder:text-theme-subtext focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {authLoading
                    ? 'Connecting…'
                    : authMode === 'REGISTER'
                    ? 'Create Account & Sync'
                    : 'Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── Privacy Guarantee ── */}
        <div className="rounded-2xl border border-theme-border bg-theme-card p-4 flex items-start space-x-3">
          <ShieldCheck size={20} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-theme-text mb-0.5">100% On-Device Privacy</p>
            <p className="text-xs text-theme-subtext leading-relaxed">
              All camera frames (pushups, brightness, face detection) are processed locally inside your browser. Zero video or biometric data is ever uploaded.
            </p>
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
