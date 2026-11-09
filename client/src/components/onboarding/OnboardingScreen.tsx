import React, { useState } from 'react';
import { User, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
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

type OnboardingStep = 'NAME' | 'AGE' | 'GOOGLE';

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<OnboardingStep>('NAME');
  const [name, setName] = useState<string>('');
  const [selectedAgeIndex, setSelectedAgeIndex] = useState<number>(DEFAULT_AGE_INDEX);
  const [nameError, setNameError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const selectedAge = Number(AGE_OPTIONS[selectedAgeIndex]) || DEFAULT_AGE;

  const handleNextFromNameToAge = () => {
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
    setStep('AGE');
  };

  const handleNextFromAgeToGoogle = () => {
    Haptics.medium();
    setStep('GOOGLE');
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
      const rawMsg = err instanceof Error ? err.message : 'Google Sign-In failed';
      if (!rawMsg.toLowerCase().includes('cancel')) {
        if (rawMsg.toLowerCase().includes('no credentials available')) {
          setAuthError('No Google account was selected. Please tap again to choose your account.');
        } else {
          setAuthError(rawMsg);
        }
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
      className="fixed inset-0 z-50 overflow-hidden bg-theme-bg text-theme-text select-none flex flex-col justify-between p-6 animate-fade-in"
      style={{
        paddingTop: 'max(24px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-between h-full">
        {/* ── Top Header Bar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-theme-text">Rise</span>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
              {step === 'NAME' ? 'Step 1 of 3' : step === 'AGE' ? 'Step 2 of 3' : 'Step 3 of 3'}
            </span>
          </div>

          {step !== 'NAME' && (
            <button
              type="button"
              onClick={() => {
                Haptics.light();
                setAuthError(null);
                setStep(step === 'GOOGLE' ? 'AGE' : 'NAME');
              }}
              className="w-10 h-10 rounded-full glass-pill flex items-center justify-center text-theme-subtext hover:text-theme-text press-spring transition-colors border border-theme-border"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
        </div>

        {/* ── Main Content Area (Full Screen Centered) ── */}
        <div className="flex-1 flex flex-col justify-center my-auto">
          {step === 'NAME' && (
            /* ════════════════════════════════════════════
               STEP 1: FULL-SCREEN NAME INPUT
               ════════════════════════════════════════════ */
            <div className="space-y-8 animate-fade-in py-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-500/20 mb-3">
                  <User size={13} />
                  <span>Personal Profile</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-theme-text leading-tight">
                  What's your name?
                </h1>
                <p className="text-sm text-theme-subtext mt-2 leading-relaxed font-medium">
                  Rise uses your name to personalize your wake-up greetings and challenge statistics.
                </p>
              </div>

              {/* Name Input Field */}
              <div className="space-y-3">
                <div className="relative flex items-center">
                  <div className="absolute left-4.5 text-blue-500 pointer-events-none">
                    <User size={22} strokeWidth={2.4} />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNextFromNameToAge();
                    }}
                    placeholder="Enter your name"
                    maxLength={32}
                    autoFocus
                    className="w-full pl-13 pr-4 py-4 rounded-2xl bg-theme-card border-2 border-theme-card-border text-theme-text text-lg font-black placeholder:text-theme-muted placeholder:font-normal focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all shadow-card"
                  />
                </div>
                {nameError && (
                  <p className="text-xs text-red-500 font-bold flex items-center gap-1.5 animate-slide-down pl-1">
                    <AlertCircle size={14} />
                    <span>{nameError}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'AGE' && (
            /* ════════════════════════════════════════════
               STEP 2: FULL-SCREEN AGE PICKER
               ════════════════════════════════════════════ */
            <div className="space-y-6 animate-fade-in py-4 text-center">
              <div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-theme-text leading-tight">
                  How old are you?
                </h1>
                <p className="text-sm text-theme-subtext mt-2 leading-relaxed font-medium max-w-xs mx-auto">
                  Helps Rise calibrate optimal morning routines for your energy levels.
                </p>
              </div>

              <div className="flex justify-center">
                <span className="px-4 py-1.5 rounded-full text-sm font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 shadow-sm">
                  {selectedAge} Years Old
                </span>
              </div>

              <div className="w-full max-w-xs mx-auto rounded-3xl bg-theme-card border border-theme-card-border shadow-card p-5 flex flex-col items-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-3">
                  Scroll to select your age
                </p>
                <div className="w-full max-w-[200px]">
                  <ScrollPicker
                    items={AGE_OPTIONS}
                    selectedIndex={selectedAgeIndex}
                    onChange={(idx) => setSelectedAgeIndex(idx)}
                    itemHeight={52}
                    loop={false}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'GOOGLE' && (
            /* ════════════════════════════════════════════
               STEP 3: CONNECT ACCOUNT (MINIMAL & PROFESSIONAL)
               ════════════════════════════════════════════ */
            <div className="space-y-8 animate-fade-in py-4 flex flex-col items-center text-center">
              <div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-theme-text leading-tight">
                  Connect Account
                </h1>
                <p className="text-sm text-theme-subtext mt-2 leading-relaxed font-medium max-w-xs mx-auto">
                  Sign in with your Google account to backup your alarms and wake-up records securely.
                </p>
              </div>

              {/* User preview badge */}
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-theme-card border border-theme-card-border shadow-sm">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                  {name.trim().charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-black text-theme-text">{name.trim()}</span>
                <span className="text-xs text-theme-subtext font-bold">• {selectedAge} yrs</span>
              </div>

              {/* Centered Sign in with Google Button */}
              <div className="w-full max-w-xs flex flex-col items-center space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full py-4 px-6 rounded-2xl bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50 shadow-lg font-bold text-sm flex items-center justify-center gap-3 press-pop transition-all disabled:opacity-60"
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

                {authError && (
                  <div className="w-full p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2 text-left">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom Action Controls ── */}
        <div className="pt-4 space-y-3">
          {step === 'NAME' && (
            <button
              type="button"
              onClick={handleNextFromNameToAge}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 press-pop transition-all"
            >
              <span>Continue</span>
              <ArrowRight size={17} strokeWidth={2.6} />
            </button>
          )}

          {step === 'AGE' && (
            <button
              type="button"
              onClick={handleNextFromAgeToGoogle}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 press-pop transition-all"
            >
              <span>Continue</span>
              <ArrowRight size={17} strokeWidth={2.6} />
            </button>
          )}

          {step === 'GOOGLE' && (
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="w-full py-3.5 rounded-2xl text-theme-subtext hover:text-theme-text text-xs font-bold transition-colors press-spring text-center"
            >
              Skip for now &amp; Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
