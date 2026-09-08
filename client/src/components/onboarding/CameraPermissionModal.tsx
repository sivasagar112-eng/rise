import React, { useState } from 'react';
import { Camera, Bell, Shield, Check, ArrowRight } from 'lucide-react';
import { StorageService } from '../../services/StorageService';
import { LocalNotifications } from '@capacitor/local-notifications';

interface CameraPermissionModalProps {
  onDismiss: () => void;
}

export const CameraPermissionModal: React.FC<CameraPermissionModalProps> = ({ onDismiss }) => {
  const [step, setStep] = useState<'CAMERA' | 'NOTIFICATIONS'>('CAMERA');
  const [cameraGranted, setCameraGranted] = useState(false);

  // Step 1: Camera Access
  const handleEnableCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCameraGranted(true);
    } catch {
      // Permission denied or dismissed
    }
    // Proceed to Step 2: Notifications
    setStep('NOTIFICATIONS');
  };

  // Step 2: Notification Access
  const handleEnableNotifications = async () => {
    try {
      await LocalNotifications.requestPermissions();
    } catch {
      // Ignore
    }
    StorageService.markOnboardingDone();
    onDismiss();
  };

  const handleSkip = () => {
    StorageService.markOnboardingDone();
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-5 animate-fade-in select-none">
      <div className="w-full max-w-md bg-[#161618] border border-white/10 rounded-3xl p-6 text-center text-white shadow-2xl">
        {step === 'CAMERA' ? (
          <>
            {/* Minimalist Camera Icon */}
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 text-blue-400">
              <Camera size={28} />
            </div>

            <span className="text-[10px] font-bold tracking-widest uppercase text-blue-400 block mb-1">
              STEP 1 OF 2 • HARDWARE SETUP
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
              Enable Camera Access
            </h2>

            <p className="text-xs text-neutral-400 leading-relaxed mb-6 max-w-sm mx-auto">
              Rise uses on-device camera tracking to count pushups and verify room lighting so you cannot cheat the alarm.
            </p>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-left mb-6 flex items-start space-x-3">
              <Shield size={18} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-white block">100% On-Device Privacy</span>
                <span className="text-neutral-400 text-[11px]">
                  Zero video or images are ever saved or uploaded. All processing happens locally on your phone.
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleEnableCamera}
                className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg flex items-center justify-center space-x-2"
              >
                <span>Allow Camera Access</span>
                <ArrowRight size={16} />
              </button>

              <button
                onClick={() => setStep('NOTIFICATIONS')}
                className="w-full py-2.5 text-neutral-400 hover:text-white text-xs font-semibold transition-colors"
              >
                Skip for now
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Notification Icon */}
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 text-amber-400">
              <Bell size={28} />
            </div>

            <span className="text-[10px] font-bold tracking-widest uppercase text-amber-400 block mb-1">
              STEP 2 OF 2 • ALARM SYSTEM
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
              Enable Alarm Notifications
            </h2>

            <p className="text-xs text-neutral-400 leading-relaxed mb-6 max-w-sm mx-auto">
              Allows Rise to display the Dynamic Island floating capsule and ring your alarm even when you are outside the app or your screen is locked.
            </p>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-left mb-6 flex items-start space-x-3">
              <Check size={18} className="text-green-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-white block">Realme / Android Smart Capsule</span>
                <span className="text-neutral-400 text-[11px]">
                  {cameraGranted ? 'Camera access verified ✓' : 'Ready to configure wake-up alerts'}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleEnableNotifications}
                className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg flex items-center justify-center space-x-2"
              >
                <span>Allow Notifications</span>
                <Check size={16} />
              </button>

              <button
                onClick={handleSkip}
                className="w-full py-2.5 text-neutral-400 hover:text-white text-xs font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
