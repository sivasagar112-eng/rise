import React, { useState } from 'react';
import { User, ArrowRight, ArrowLeft, Shield, Cloud, Zap, AlertCircle } from 'lucide-react';
import { ScrollPicker } from '../alarm/ScrollPicker';
import { GoogleAuthService } from '../../services/GoogleAuthService';
import { StorageService } from '../../services/StorageService';
import { UserProfile } from '../../types/alarm';
import { Haptics } from '../../services/HapticFeedback';
import { LocalNotifications } from '@capacitor/local-notifications';

interface OnboardingScreenProps {
  onComplete: (user: UserProfile) => void;
}

const MIN_AGE = 12;
const MAX_AGE = 100;
const AGE_OPTIONS = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => String(i + MIN_AGE));
const DEFAULT_AGE = 24;
const DEFAULT_AGE_INDEX = DEFAULT_AGE - MIN_AGE;

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<'DETAILS' | 'GOOGLE'>('DETAILS');
  const [name, setName] = useState<string>('');
  const [selectedAgeIndex, setSelectedAgeIndex] = useState<number>(DEFAULT_AGE_INDEX);
  const [nameError, setNameError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const selectedAge = Number(AGE_OPTIONS[selectedAgeIndex]) || DEFAULT_AGE;

  const handleNextToGoogle = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Haptics.warning();
      setNameError('Please enter your name to continue');
      return;
    }
    if (trimmed.length < 2) {
      Haptics.warning();
      setNameError('Name must be at least 2 characters');
      return;
    }
    setNameError(null);
    Haptics.medium();
    setStep('GOOGLE');
  };

  const handleBackToDetails = () => {
    Haptics.light();
    setAuthError(null);
    setStep('DETAILS');
  };

  const finalizeOnboarding = async (user: UserProfile) => {
    StorageService.saveUser(user);
    StorageService.markOnboardingDone();
    try {
      await LocalNotifications.requestPermissions();
    } catch {}
    Haptics.success();
    onComplete(user);
  };

  const handleGoogleSignIn = async () => {
    Haptics.medium();
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const googleUser = await GoogleAuthService.signIn();
      const profile: UserProfile = {
        id: googleUser.uid,
        email: googleUser.email || '',
        name: name.trim() || googleUser.displayName || 'Rise User',
        age: selectedAge,
        photoUrl: googleUser.photoUrl || '',
        token: 'firebase-' + googleUser.uid,
        isGoogleLinked: true,
      };
      await finalizeOnboarding(profile);
    } catch (err: unknown) {
      console.warn('Google Sign-In during onboarding:', err);
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      if (!msg.toLowerCase().includes('cancel')) {
        setAuthError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleContinueAsGuest = async () => {
    Haptics.selection();
    const guestProfile: UserProfile = {
      id: `local-${Date.now()}`,
      name: name.trim(),
      age: selectedAge,
      email: '',
      isGoogleLinked: false,
    };
    await finalizeOnboarding(guestProfile);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-theme-bg text-theme-text select-none flex flex-col justify-between p-6 animate-fade-in"
      style={{
        paddingTop: 'max(24px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-between">
        {/* ── Top Header Bar ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-theme-text">Rise</span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                {step === 'DETAILS' ? 'Step 1 of 2' : 'Step 2 of 2'}
              </span>
            </div>

            {step === 'GOOGLE' && (
              <button
                type="button"
                onClick={handleBackToDetails}
                className="w-9 h-9 rounded-full glass-pill flex items-center justify-center text-theme-subtext hover:text-theme-text press-spring transition-colors"
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
          </div>

          {step === 'DETAILS' ? (
            /* ════════════════════════════════════════════
               STEP 1: PERSONAL DETAILS (NAME & AGE)
               ════════════════════════════════════════════ */
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-theme-text leading-tight">
                  Welcome to Rise
                </h1>
                <p className="text-xs sm:text-sm text-theme-subtext mt-1.5 leading-relaxed font-medium">
                  Personalize your profile so our AI routines and wake targets adapt perfectly to you.
                </p>
              </div>

              {/* Name Input Field */}
              <div className="space-y-2">
                <label className="text-[10px] font-black tracking-widest uppercase text-theme-subtext block">
                  Your Full Name
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-blue-500 pointer-events-none">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    placeholder="Enter your name"
                    maxLength={32}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-theme-card border border-theme-card-border text-theme-text text-sm font-bold placeholder:text-theme-muted placeholder:font-normal focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-card"
                  />
                </div>
                {nameError && (
                  <p className="text-xs text-red-500 font-bold flex items-center gap-1.5 animate-slide-down">
                    <AlertCircle size={13} />
                    <span>{nameError}</span>
                  </p>
                )}
              </div>

              {/* Age 3D Wheel Scroller */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black tracking-widest uppercase text-theme-subtext">
                    Your Age
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {selectedAge} Years Old
                  </span>
                </div>

                <div className="rounded-3xl bg-theme-card border border-theme-card-border shadow-card p-3 flex flex-col items-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2">
                    Scroll to select your age
                  </p>
                  <div className="w-full max-w-[200px]">
                    <ScrollPicker
                      items={AGE_OPTIONS}
                      selectedIndex={selectedAgeIndex}
                      onChange={(idx) => setSelectedAgeIndex(idx)}
                      itemHeight={46}
                      loop={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ════════════════════════════════════════════
               STEP 2: GOOGLE ACCOUNT & CLOUD BACKUP
               ════════════════════════════════════════════ */
            <div className="space-y-5 animate-fade-in">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-theme-text leading-tight">
                  Connect Account
                </h1>
                <p className="text-xs sm:text-sm text-theme-subtext mt-1.5 leading-relaxed font-medium">
                  Backup your alarms, wake streaks, and routines securely to your Google account.
                </p>
              </div>

              {/* User Preview Badge */}
              <div className="p-4 rounded-3xl bg-theme-card border border-theme-card-border shadow-card flex items-center gap-4">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
                  {name.trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-theme-text truncate leading-tight">
                    {name.trim()}
                  </h3>
                  <p className="text-xs text-theme-subtext mt-0.5 font-bold">
                    {selectedAge} years old • Ready to rise
                  </p>
                </div>
              </div>

              {/* Cloud Benefits List */}
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-theme-card border border-theme-card-border flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
                    <Cloud size={17} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-theme-text">Cloud Alarm Backup</h4>
                    <p className="text-[11px] text-theme-subtext leading-snug mt-0.5">
                      Your alarms and challenges sync seamlessly if you switch or reset devices.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-theme-card border border-theme-card-border flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                    <Zap size={17} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-theme-text">Discipline & Streak Tracking</h4>
                    <p className="text-[11px] text-theme-subtext leading-snug mt-0.5">
                      Keep your wake consistency, push-up counts, and stats stored permanently.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-theme-card border border-theme-card-border flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                    <Shield size={17} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-theme-text">100% On-Device Privacy</h4>
                    <p className="text-[11px] text-theme-subtext leading-snug mt-0.5">
                      Computer vision pose analysis and camera verification never leave your phone.
                    </p>
                  </div>
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{authError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom Action Controls ── */}
        <div className="pt-6 space-y-3">
          {step === 'DETAILS' ? (
            <button
              type="button"
              onClick={handleNextToGoogle}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 press-pop transition-all"
            >
              <span>Continue</span>
              <ArrowRight size={17} strokeWidth={2.6} />
            </button>
          ) : (
            <>
              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-4 px-4 rounded-2xl bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50 shadow-md font-bold text-sm flex items-center justify-center gap-3 press-pop transition-all disabled:opacity-60"
              >
                {googleLoading ? (
                  <div className="w-5 h-5 border-2 border-neutral-400 border-t-neutral-900 rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                )}
                <span>Sign in with Google</span>
              </button>

              {/* Guest / Skip Option */}
              <button
                type="button"
                onClick={handleContinueAsGuest}
                className="w-full py-3 rounded-2xl glass-pill text-theme-subtext hover:text-theme-text text-xs font-bold transition-colors press-spring text-center"
              >
                Skip for now &amp; Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
