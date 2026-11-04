import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Haptics } from '../../services/HapticFeedback';

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
  const [phase, setPhase] = useState<'hidden' | 'in' | 'visible' | 'out'>('hidden');

  useEffect(() => {
    if (!toast) {
      setPhase('out');
      const t = setTimeout(() => setPhase('hidden'), 280);
      return () => clearTimeout(t);
    }

    setPhase('in');
    Haptics.tick();
    const visibleTimer = setTimeout(() => setPhase('visible'), 10);
    const outTimer = setTimeout(() => {
      setPhase('out');
      setTimeout(onDismiss, 280);
    }, toast.durationMs ?? 3600);

    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(outTimer);
    };
  }, [toast, onDismiss]);

  if (phase === 'hidden') return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 z-50 pointer-events-none select-none"
      style={{
        transform:
          phase === 'out'
            ? 'translateX(-50%) translateY(12px) scale(0.93)'
            : phase === 'in'
            ? 'translateX(-50%) translateY(14px) scale(0.9)'
            : 'translateX(-50%) translateY(0) scale(1)',
        opacity: phase === 'visible' ? 1 : 0,
        transition:
          phase === 'in' || phase === 'visible'
            ? 'transform 380ms cubic-bezier(0.34,1.56,0.64,1), opacity 260ms ease'
            : 'transform 220ms ease, opacity 220ms ease',
      }}
    >
      <div
        className="
          flex items-center gap-2.5 px-4 py-2.5
          rounded-full
          border border-theme-card-border
          bg-theme-card text-theme-text
          shadow-card
        "
        style={{
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 border border-blue-500/25">
          <Clock size={12} className="text-blue-500" strokeWidth={2.6} />
        </div>
        <span className="text-xs font-bold tracking-tight text-theme-text whitespace-nowrap">
          {toast?.text}
        </span>
      </div>
    </div>
  );
};
