import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  icon?: 'clock' | 'info';
  durationMs?: number;
}

interface NextAlarmToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const NextAlarmToast: React.FC<NextAlarmToastProps> = ({ toast, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!toast) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    const duration = toast.durationMs || 3500;

    const timer = setTimeout(() => {
      setIsVisible(false);
      // Wait for exit animation before notifying parent
      const dismissTimer = setTimeout(() => {
        onDismiss();
      }, 300);
      return () => clearTimeout(dismissTimer);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast && !isVisible) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-4 scale-95'
      }`}
    >
      <div className="flex items-center space-x-3 px-4 py-2.5 bg-[#25272b]/95 backdrop-blur-xl text-white rounded-full border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        {/* Rounded clock icon container matching screenshot */}
        <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center shrink-0 border border-white/5">
          <Clock size={13} className="text-neutral-300 stroke-[2.2]" />
        </div>

        {/* Toast Text matching screenshot (e.g. "Next alarm in 6 minutes") */}
        <span className="text-xs sm:text-sm font-medium tracking-wide text-neutral-100 pr-1 select-none">
          {toast?.text}
        </span>
      </div>
    </div>
  );
};
