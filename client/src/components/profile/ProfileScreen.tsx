import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../../services/StorageService';
import { synth } from '../../services/WebAudioSynth';
import { GoogleAuthService } from '../../services/GoogleAuthService';
import {
  Volume2,
  ShieldCheck,
  LogOut,
  AlertCircle,
  Camera,
  FlipHorizontal,
  Check,
  Flame,
  Award,
} from 'lucide-react';
import { Haptics } from '../../services/HapticFeedback';

export const ProfileScreen: React.FC = () => {
  const [user, setUser] = useState(StorageService.getUser());
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isPlayingAudioTest, setIsPlayingAudioTest] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Untested');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const testVideoRef = useRef<HTMLVideoElement | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  const [streak, setStreak] = useState<number>(0);
  const [totalDismissals, setTotalDismissals] = useState<number>(0);

  useEffect(() => {
    setStreak(StorageService.calculateStreak());
    const logs = StorageService.getWakeLogs();
    setTotalDismissals(logs.filter((l) => l.success).length);
  }, []);

  // Restore Google user session if already signed into Firebase on device
  useEffect(() => {
    if (!user && GoogleAuthService.isAvailable()) {
      GoogleAuthService.getCurrentUser()
        .then((currentUser) => {
          if (currentUser?.uid) {
            const profile = {
              id: currentUser.uid,
              email: currentUser.email || '',
              name: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
              photoUrl: currentUser.photoUrl || '',
              token: 'firebase-' + currentUser.uid,
            };
            StorageService.saveUser(profile as any);
            setUser(profile as any);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  // Check camera device access on mount
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const hasCamera = devices.some((d) => d.kind === 'videoinput' && d.label !== '');
          if (hasCamera) {
            setCameraStatus('Granted ✓');
          }
        })
        .catch(() => {});
    }
  }, []);

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

  const startCameraStream = async (mode: 'user' | 'environment') => {
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
      testStreamRef.current = stream;
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
        testVideoRef.current.play().catch(() => {});
      }
      setCameraStatus('Granted ✓');
    } catch (err) {
      console.warn('Profile camera test error:', err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        testStreamRef.current = stream;
        if (testVideoRef.current) {
          testVideoRef.current.srcObject = stream;
          testVideoRef.current.play().catch(() => {});
        }
        setCameraStatus('Granted ✓');
      } catch {
        setCameraStatus('Denied ✗');
      }
    }
  };

  const handleTestCamera = async () => {
    Haptics.light();
    setIsCameraModalOpen(true);
    await startCameraStream(facingMode);
  };

  const handleToggleFacingMode = async () => {
    Haptics.selection();
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    await startCameraStream(nextMode);
  };

  const handleCloseCameraTest = () => {
    Haptics.light();
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    setIsCameraModalOpen(false);
  };

  const handleGoogleSignIn = async () => {
    Haptics.medium();
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const googleUser = await GoogleAuthService.signIn();
      const profile = {
        id: googleUser.uid,
        email: googleUser.email || '',
        name: googleUser.displayName || googleUser.email?.split('@')[0] || 'User',
        photoUrl: googleUser.photoUrl || '',
        token: 'firebase-' + googleUser.uid,
      };
      StorageService.saveUser(profile as any);
      setUser(profile as any);
      Haptics.success();
    } catch (err: unknown) {
      console.error('Google Sign-In failed:', err);
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      if (!msg.toLowerCase().includes('cancel')) {
        setAuthError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    Haptics.heavy();
    await GoogleAuthService.signOut();
    StorageService.saveUser(null);
    setUser(null);
  };

  return (
    <div className="w-full max-w-md mx-auto py-2 space-y-5 select-none animate-fade-in">
      {/* ── Profile Title ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-theme-text leading-tight">
            Profile &amp; Stats
          </h2>
          <p className="text-xs text-theme-subtext mt-0.5">
            Your wake streak, credentials, and diagnostic sensors.
          </p>
        </div>
      </div>

      {/* ── Wake Discipline Streak & Stats Cards ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak Card */}
        <div className="p-4 rounded-3xl card-premium flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-theme-subtext">
              Wake Streak
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <Flame size={18} className="animate-pulse" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black font-tabular tracking-tight text-theme-text">
              {streak}
            </span>
            <span className="text-xs text-theme-subtext ml-1.5 font-bold">days</span>
          </div>
        </div>

        {/* Total Dismissals Card */}
        <div className="p-4 rounded-3xl card-premium flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-theme-subtext">
              Completed
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center">
              <Award size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black font-tabular tracking-tight text-theme-text">
              {totalDismissals}
            </span>
            <span className="text-xs text-theme-subtext ml-1.5 font-bold">risen</span>
          </div>
        </div>
      </div>

      {/* ── Account Card ── */}
      <div className="rounded-3xl p-5 card-premium space-y-4">
        <div className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
          Account Status
        </div>

        {user ? (
          <div className="space-y-3.5">
            <div className="flex items-center space-x-3.5">
              {(user as any).photoUrl ? (
                <img
                  src={(user as any).photoUrl}
                  alt="Avatar"
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-blue-500/20 shadow-md"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-md">
                  {((user as any).name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-theme-text font-black text-sm truncate">
                  {(user as any).name || user.email}
                </div>
                <div className="text-xs text-theme-subtext truncate">
                  {(user as any).name ? user.email : 'Google Account'}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-3 rounded-2xl border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-black flex items-center justify-center space-x-2 press-spring transition-colors"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-theme-subtext leading-relaxed">
              Sign in with your Google account to backup your alarms and wake-up records securely.
            </p>

            {authError && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center space-x-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full py-3 px-4 rounded-2xl glass-card hover:bg-theme-border/40 press-spring text-theme-text font-black text-xs transition-all flex items-center justify-center space-x-2.5 disabled:opacity-50 shadow-sm"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{googleLoading ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Hardware Diagnostics Card ── */}
      <div className="rounded-3xl p-5 card-premium space-y-3.5">
        <div className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
          Hardware &amp; Sensors Test
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-theme-text text-sm font-extrabold">Audio Output</div>
            <div className="text-xs text-theme-subtext">Continuous wake-up chime test</div>
          </div>
          <button
            onClick={handleTestAudio}
            className="px-4 py-2 rounded-2xl glass-pill text-theme-text text-xs font-black press-spring flex items-center space-x-1.5"
          >
            <Volume2 size={14} />
            <span>{isPlayingAudioTest ? 'Playing...' : 'Test Audio'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between py-1 border-t border-theme-border/50 pt-3">
          <div>
            <div className="text-theme-text text-sm font-extrabold">Camera Sensor</div>
            <div className="text-xs text-theme-subtext">Status: {cameraStatus}</div>
          </div>
          <button
            onClick={handleTestCamera}
            className="px-4 py-2 rounded-2xl glass-pill text-theme-text text-xs font-black press-spring flex items-center space-x-1.5"
          >
            <Camera size={14} />
            <span>Test Camera</span>
          </button>
        </div>
      </div>

      {/* ── Privacy Guarantee ── */}
      <div className="rounded-3xl p-4.5 card-premium flex items-start space-x-3.5">
        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div className="text-xs text-theme-subtext leading-relaxed">
          <strong className="text-theme-text font-black block mb-0.5">
            100% On-Device Privacy
          </strong>
          All computer vision AI processing (push-ups, lighting detection, object scanning) runs entirely on-device using local TensorFlow models.
        </div>
      </div>

      {/* ── Live Camera Test Modal ── */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-5 animate-fade-in">
          <div className="w-full max-w-xs bg-[#161722] border border-white/10 rounded-3xl p-5 text-center shadow-2xl text-white sheet-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-white">Camera Preview</h3>
              <button
                onClick={handleToggleFacingMode}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 transition-colors flex items-center space-x-1 text-xs press-spring"
                title="Flip camera"
              >
                <FlipHorizontal size={14} />
                <span>{facingMode === 'user' ? 'Front' : 'Rear'}</span>
              </button>
            </div>

            <div className="relative aspect-4/3 bg-black rounded-2xl overflow-hidden border border-white/10 mb-4 shadow-inner">
              <video
                ref={testVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  facingMode === 'user' ? 'transform -scale-x-100' : ''
                }`}
              />
            </div>

            <button
              onClick={handleCloseCameraTest}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-2xl transition-all shadow-md press-spring flex items-center justify-center space-x-1.5"
            >
              <Check size={16} />
              <span>Done (Camera Working ✓)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
