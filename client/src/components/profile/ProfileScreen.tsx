import React, { useState } from 'react';
import { StorageService } from '../../services/StorageService';
import { synth } from '../../services/WebAudioSynth';
import { api } from '../../api/client';
import { Volume2, ShieldCheck, LogOut, AlertCircle, Camera, FlipHorizontal, Check } from 'lucide-react';

export const ProfileScreen: React.FC = () => {
  const [user, setUser] = useState(StorageService.getUser());
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isPlayingAudioTest, setIsPlayingAudioTest] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Untested');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const testVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const testStreamRef = React.useRef<MediaStream | null>(null);

  // Check camera device access on mount
  React.useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const hasCamera = devices.some((d) => d.kind === 'videoinput' && d.label !== '');
        if (hasCamera) {
          setCameraStatus('Granted ✓');
        }
      }).catch(() => {});
    }
  }, []);

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
      // Fallback to basic video constraint
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
    setIsCameraModalOpen(true);
    await startCameraStream(facingMode);
  };

  const handleToggleFacingMode = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    await startCameraStream(nextMode);
  };

  const handleCloseCameraTest = () => {
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    setIsCameraModalOpen(false);
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
    <div className="w-full max-w-md mx-auto py-4 space-y-6 select-none animate-fade-in">
      {/* Profile Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-theme-text">
          Profile
        </h2>
        <p className="text-sm text-theme-subtext mt-0.5">
          Account sync and hardware diagnostics
        </p>
      </div>

      {/* Account Card */}
      <div className="rounded-2xl p-5 bg-theme-card border border-theme-border shadow-sm space-y-4">
        <div className="text-xs font-bold tracking-wider uppercase text-theme-subtext">
          ACCOUNT & SYNC
        </div>

        {user ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-base">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-theme-text font-bold text-sm">{user.email}</div>
                <div className="text-xs text-theme-subtext">Cloud sync active</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-2 w-full py-2.5 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-semibold flex items-center justify-center space-x-2 transition-colors"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <div className="flex rounded-xl bg-theme-bg p-1 border border-theme-border">
              <button
                type="button"
                onClick={() => setAuthMode('LOGIN')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
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
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3.5 py-2.5 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xs transition-colors disabled:opacity-50"
            >
              {authLoading ? 'Connecting...' : authMode === 'REGISTER' ? 'Create Account & Sync' : 'Sign In'}
            </button>
          </form>
        )}
      </div>

      {/* Hardware Diagnostics Card */}
      <div className="rounded-2xl p-5 bg-theme-card border border-theme-border shadow-sm space-y-4">
        <div className="text-xs font-bold tracking-wider uppercase text-theme-subtext">
          HARDWARE & SENSORS
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-theme-text text-sm font-semibold">Chime Synthesizer</div>
            <div className="text-xs text-theme-subtext">Web Audio gradual volume ramp</div>
          </div>
          <button
            onClick={handleTestAudio}
            className="px-3.5 py-1.5 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-xs font-medium hover:opacity-80 transition-opacity flex items-center space-x-1.5"
          >
            <Volume2 size={14} />
            <span>{isPlayingAudioTest ? 'Playing...' : 'Test Sound'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between py-1 border-t border-theme-border pt-3">
          <div>
            <div className="text-theme-text text-sm font-semibold">Camera Access</div>
            <div className="text-xs text-theme-subtext">Status: {cameraStatus}</div>
          </div>
          <button
            onClick={handleTestCamera}
            className="px-3.5 py-1.5 rounded-xl bg-theme-bg border border-theme-border text-theme-text text-xs font-medium hover:opacity-80 transition-opacity flex items-center space-x-1.5"
          >
            <Camera size={14} />
            <span>Test Camera</span>
          </button>
        </div>
      </div>

      {/* Privacy Guarantee */}
      <div className="rounded-2xl p-4 bg-theme-card border border-theme-border shadow-sm flex items-start space-x-3">
        <ShieldCheck size={20} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-theme-subtext leading-relaxed">
          <strong className="text-theme-text block mb-0.5">100% Client-Side Privacy</strong>
          All camera vision (pushups, brightness, face detection) executes locally on your device. Zero camera frames or videos are ever uploaded.
        </div>
      </div>

      {/* ── Live Camera Test Modal ── */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-5 animate-fade-in">
          <div className="w-full max-w-xs bg-[#1a1a1c] border border-white/10 rounded-3xl p-5 text-center shadow-2xl text-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">Camera Preview</h3>
              <button
                onClick={handleToggleFacingMode}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 transition-colors flex items-center space-x-1 text-xs"
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
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`}
              />
            </div>

            <button
              onClick={handleCloseCameraTest}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5"
            >
              <Check size={15} />
              <span>Done (Camera Working ✓)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
