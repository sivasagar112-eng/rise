import React, { useState, useRef } from 'react';
import { Alarm, DismissalType } from '../../types/alarm';
import { X, Trash2, Dumbbell, Smartphone, Calculator, Sun, Scan, ArrowLeft, ArrowRight } from 'lucide-react';
import { ScrollPicker } from './ScrollPicker';

interface AlarmEditorModalProps {
  alarm?: Alarm | null;
  onSave: (alarm: Alarm) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const DAYS = [
  { label: 'S', name: 'Sun', val: 0 },
  { label: 'M', name: 'Mon', val: 1 },
  { label: 'T', name: 'Tue', val: 2 },
  { label: 'W', name: 'Wed', val: 3 },
  { label: 'T', name: 'Thu', val: 4 },
  { label: 'F', name: 'Fri', val: 5 },
  { label: 'S', name: 'Sat', val: 6 },
];

export const AlarmEditorModal: React.FC<AlarmEditorModalProps> = ({
  alarm,
  onSave,
  onDelete,
  onClose,
}) => {
  const [step, setStep] = useState<'TIME' | 'TASKS'>('TIME');

  const initialTime = alarm ? alarm.time : '07:00';
  const [initH, initM] = initialTime.split(':').map(Number);
  const [hour12, setHour12] = useState<number>(initH % 12 === 0 ? 12 : initH % 12);
  const [minute, setMinute] = useState<string>(String(initM).padStart(2, '0'));
  const [period, setPeriod] = useState<'AM' | 'PM'>(initH >= 12 ? 'PM' : 'AM');

  const [label, setLabel] = useState<string>(alarm ? alarm.label : '');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(alarm ? alarm.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
  const [dismissalType, setDismissalType] = useState<DismissalType>(alarm ? alarm.dismissalType : 'PUSHUP_MATH');
  const [pushupTarget, setPushupTarget] = useState<number>(alarm ? alarm.pushupTarget : 5);
  const [rampDuration, setRampDuration] = useState<number>(alarm ? alarm.rampDuration : 30);
  const [preAlarmMinutes, setPreAlarmMinutes] = useState<number>(
    alarm?.preAlarmMinutes !== undefined
      ? alarm.preAlarmMinutes
      : alarm?.preAlarmEnabled
      ? 5
      : 0
  );

  // Legacy reference descriptor (kept for backward compatibility)
  const [referenceDescriptor] = useState<string | null>(alarm?.referenceDescriptor || null);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSaveFinal = () => {
    const h24 = period === 'PM' ? (hour12 % 12) + 12 : (hour12 % 12);
    const parsedMinute = Math.max(0, Math.min(59, parseInt(minute, 10) || 0));
    const finalTime = `${String(h24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;

    const updated: Alarm = {
      id: alarm ? alarm.id : `alarm-${Date.now()}`,
      time: finalTime,
      label: label.trim() || 'Alarm',
      daysOfWeek,
      dismissalType,
      pushupTarget,
      referenceDescriptor,
      rampDuration,
      preAlarmEnabled: preAlarmMinutes > 0,
      preAlarmMinutes,
      isEnabled: alarm ? alarm.isEnabled : true,
    };
    onSave(updated);
  };

  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
      if (deltaY > 80) {
        onClose();
      }
      touchStartYRef.current = null;
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full bg-[#111113] select-none overflow-y-auto text-white flex flex-col"
      >
        {/* ── Slide Down Gesture Handle ── */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="pt-2.5 pb-1 sm:hidden flex justify-center cursor-pointer"
        >
          <div className="w-12 h-1 rounded-full bg-white/20" />
        </div>

        {step === 'TIME' ? (
          /* ════════════════════════════════════════════
             PAGE 1: SET ALARM TIME (CENTERED IN MIDDLE)
             ════════════════════════════════════════════ */
          <div className="flex flex-col flex-1">
            {/* Header */}
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="sticky top-0 z-10 bg-[#111113]/95 backdrop-blur-sm border-b border-white/8 px-6 pt-3 pb-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      Step 1 of 2
                    </span>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
                      {alarm ? 'Edit Alarm' : 'New Alarm'}
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
                    {alarm ? 'Configure.' : 'Rise.'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  title="Close"
                  className="mt-1 w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-400 hover:text-white transition-colors active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body: Centered Time Scroller & Schedule */}
            <div className="px-6 py-5 space-y-5 animate-fade-in flex-1">
              {/* Centered Time Picker */}
              <div className="text-center py-2 flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-3">
                  Wake-Up Time
                </p>
                <div className="inline-flex items-center justify-center gap-2 sm:gap-3 p-4 rounded-3xl bg-white/[0.04] border border-white/10 shadow-inner">
                  {/* Hour */}
                  <div className="flex flex-col items-center w-20">
                    <ScrollPicker
                      items={Array.from({ length: 12 }, (_, i) => String(i + 1))}
                      selectedIndex={hour12 - 1}
                      onChange={(index) => setHour12(index + 1)}
                    />
                    <span className="text-[10px] text-neutral-500 mt-2 uppercase font-bold tracking-wider">Hour</span>
                  </div>

                  <span className="text-3xl font-light text-neutral-600 pb-6">:</span>

                  {/* Minute */}
                  <div className="flex flex-col items-center w-20">
                    <ScrollPicker
                      items={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))}
                      selectedIndex={parseInt(minute, 10) || 0}
                      onChange={(index) => setMinute(String(index).padStart(2, '0'))}
                    />
                    <span className="text-[10px] text-neutral-500 mt-2 uppercase font-bold tracking-wider">Min</span>
                  </div>

                  {/* AM / PM */}
                  <div className="flex flex-col gap-1.5 ml-2 p-1 rounded-xl bg-black/40 border border-white/10">
                    {(['AM', 'PM'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-all ${
                          period === p
                            ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                            : 'text-neutral-500 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Repeat Days */}
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 block mb-2.5">
                  Repeat Days
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((d) => {
                    const isSelected = daysOfWeek.includes(d.val);
                    return (
                      <button
                        key={d.val}
                        type="button"
                        title={d.name}
                        onClick={() => toggleDay(d.val)}
                        className={`h-10 text-xs font-extrabold rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500 text-white shadow-md shadow-blue-500/20'
                            : 'border-white/10 bg-white/5 text-neutral-500 hover:border-white/30 hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Alarm Label */}
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 block mb-2">
                  Alarm Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={30}
                  placeholder="e.g. Morning Rise"
                  className="w-full px-4 py-2.5 text-sm font-semibold rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Volume Ramp & Pre-alarm */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/8">
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 block mb-1.5">
                    Volume Ramp
                  </label>
                  <select
                    value={rampDuration}
                    onChange={(e) => setRampDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[#1c1c1f] border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={15} className="bg-[#1c1c1f] text-white">15 seconds</option>
                    <option value={30} className="bg-[#1c1c1f] text-white">30 seconds</option>
                    <option value={60} className="bg-[#1c1c1f] text-white">60 seconds</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 block mb-1.5">
                    Pre-Alarm
                  </label>
                  <select
                    value={preAlarmMinutes}
                    onChange={(e) => setPreAlarmMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[#1c1c1f] border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={0} className="bg-[#1c1c1f] text-white">Off</option>
                    <option value={5} className="bg-[#1c1c1f] text-white">5 mins before</option>
                    <option value={10} className="bg-[#1c1c1f] text-white">10 mins before</option>
                    <option value={15} className="bg-[#1c1c1f] text-white">15 mins before</option>
                  </select>
                </div>
              </div>

              {/* Page 1 Actions */}
              <div className="flex items-center space-x-3 pt-3 pb-1">
                {alarm && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(alarm.id)}
                    className="w-12 h-12 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-500 hover:text-red-400 hover:border-red-500/40 transition-colors shrink-0"
                    title="Delete alarm"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep('TASKS')}
                  className="flex-1 py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-extrabold tracking-wide shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                >
                  <span>Save & Choose Wake-Up Task</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ════════════════════════════════════════════
             PAGE 2: HOW TO WAKE UP (WAKE-UP TASKS)
             ════════════════════════════════════════════ */
          <div className="flex flex-col flex-1">
            {/* Header with Back button */}
            <div className="sticky top-0 z-10 bg-[#111113]/95 backdrop-blur-sm border-b border-white/8 px-6 pt-3 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <button
                    type="button"
                    onClick={() => setStep('TIME')}
                    aria-label="Back to time settings"
                    title="Back to time"
                    className="mt-1 w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        Step 2 of 2
                      </span>
                      <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
                        How to Wake Up
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
                      Wake-Up Task.
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  title="Close"
                  className="mt-1 w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-400 hover:text-white transition-colors active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body: Tasks & Instructions */}
            <div className="px-6 py-5 space-y-5 animate-fade-in flex-1">
              <div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Select your wake-up task. You must complete it tomorrow at <strong className="text-white">{hour12}:{minute} {period}</strong> to turn off the alarm.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Option 1: Push-ups */}
                <button
                  type="button"
                  onClick={() => setDismissalType('PUSHUP_MATH')}
                  className={`p-3 rounded-2xl border text-left flex items-start space-x-2.5 transition-all ${
                    dismissalType === 'PUSHUP_MATH'
                      ? 'bg-blue-500/15 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${dismissalType === 'PUSHUP_MATH' ? 'bg-blue-500 text-white' : 'bg-white/10 text-neutral-400'}`}>
                    <Dumbbell size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Push-ups</span>
                    <span className="text-[10px] text-neutral-400">AI Pose Camera</span>
                  </div>
                </button>

                {/* Option 2: 100 Taps & Shake */}
                <button
                  type="button"
                  onClick={() => setDismissalType('CLICK_SHAKE')}
                  className={`p-3 rounded-2xl border text-left flex items-start space-x-2.5 transition-all ${
                    dismissalType === 'CLICK_SHAKE'
                      ? 'bg-blue-500/15 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${dismissalType === 'CLICK_SHAKE' ? 'bg-blue-500 text-white' : 'bg-white/10 text-neutral-400'}`}>
                    <Smartphone size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Taps & Shake</span>
                    <span className="text-[10px] text-neutral-400">100 Clicks + Shake</span>
                  </div>
                </button>

                {/* Option 3: Math */}
                <button
                  type="button"
                  onClick={() => setDismissalType('MATH')}
                  className={`p-3 rounded-2xl border text-left flex items-start space-x-2.5 transition-all ${
                    dismissalType === 'MATH'
                      ? 'bg-blue-500/15 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${dismissalType === 'MATH' ? 'bg-blue-500 text-white' : 'bg-white/10 text-neutral-400'}`}>
                    <Calculator size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Math Puzzles</span>
                    <span className="text-[10px] text-neutral-400">3 Equations</span>
                  </div>
                </button>

                {/* Option 4: Room Light */}
                <button
                  type="button"
                  onClick={() => setDismissalType('BRIGHTNESS')}
                  className={`p-3 rounded-2xl border text-left flex items-start space-x-2.5 transition-all ${
                    dismissalType === 'BRIGHTNESS'
                      ? 'bg-blue-500/15 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${dismissalType === 'BRIGHTNESS' ? 'bg-blue-500 text-white' : 'bg-white/10 text-neutral-400'}`}>
                    <Sun size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Turn on Lights</span>
                    <span className="text-[10px] text-neutral-400">Camera Light Sensor</span>
                  </div>
                </button>

                {/* Option 5: Scan Object */}
                <button
                  type="button"
                  onClick={() => setDismissalType('OBJECT_MATCH')}
                  className={`p-3 rounded-2xl border text-left flex items-start space-x-2.5 transition-all col-span-2 ${
                    dismissalType === 'OBJECT_MATCH'
                      ? 'bg-blue-500/15 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${dismissalType === 'OBJECT_MATCH' ? 'bg-blue-500 text-white' : 'bg-white/10 text-neutral-400'}`}>
                    <Scan size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Scan Object</span>
                    <span className="text-[10px] text-neutral-400">AI Camera Scanner (Mug, Sink, Book, etc.)</span>
                  </div>
                </button>
              </div>

              {/* Dynamic Task Explanations / Sub-settings */}
              {dismissalType === 'PUSHUP_MATH' && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Push-Up Target</span>
                      <span className="text-[10px] text-neutral-400">Target reps to turn off alarm</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {[5, 10, 15, 20].map((reps) => (
                        <button
                          key={reps}
                          type="button"
                          onClick={() => setPushupTarget(reps)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            pushupTarget === reps
                              ? 'bg-blue-500 text-white shadow-md'
                              : 'bg-white/10 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {reps}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-400 pt-1 border-t border-white/5">
                    Front camera AI tracks your real push-up form and counts repetitions before dismissing.
                  </p>
                </div>
              )}

              {dismissalType === 'OBJECT_MATCH' && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start space-x-3 animate-fade-in">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                    <Scan size={16} />
                  </div>
                  <div className="text-xs text-neutral-300">
                    <strong className="text-white block mb-0.5">How it wakes you up:</strong>
                    Forces you out of bed to scan a specific household object (e.g. Bathroom Sink, Coffee Mug, Book, Chair) using camera computer vision to turn off the alarm.
                  </div>
                </div>
              )}

              {dismissalType === 'CLICK_SHAKE' && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start space-x-3 animate-fade-in">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                    <Smartphone size={16} />
                  </div>
                  <div className="text-xs text-neutral-300">
                    <strong className="text-white block mb-0.5">How it wakes you up:</strong>
                    Requires 100 rapid screen taps followed by 5 firm phone shakes to activate motor coordination before silencing.
                  </div>
                </div>
              )}

              {dismissalType === 'MATH' && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start space-x-3 animate-fade-in">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                    <Calculator size={16} />
                  </div>
                  <div className="text-xs text-neutral-300">
                    <strong className="text-white block mb-0.5">How it wakes you up:</strong>
                    Requires solving 3 arithmetic problems to awaken your cognitive functions before dismissing.
                  </div>
                </div>
              )}

              {dismissalType === 'BRIGHTNESS' && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start space-x-3 animate-fade-in">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                    <Sun size={16} />
                  </div>
                  <div className="text-xs text-neutral-300">
                    <strong className="text-white block mb-0.5">How it wakes you up:</strong>
                    Forces you to get out of bed and turn on room lights to satisfy the camera ambient light threshold.
                  </div>
                </div>
              )}

              {/* Page 2 Actions */}
              <div className="flex items-center space-x-3 pt-3 pb-1">
                <button
                  type="button"
                  onClick={() => setStep('TIME')}
                  className="px-4 py-3.5 rounded-2xl border border-white/10 bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 text-sm font-bold transition-all flex items-center space-x-1.5"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveFinal}
                  className="flex-1 py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-extrabold tracking-wide shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
                >
                  {alarm ? 'Save Changes' : 'Create Alarm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
