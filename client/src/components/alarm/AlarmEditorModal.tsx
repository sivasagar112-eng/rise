import React, { useState, useRef } from 'react';
import { Alarm, DismissalType } from '../../types/alarm';
import { X, Trash2, Dumbbell, Smartphone, Calculator, Sun, Scan, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { ScrollPicker } from './ScrollPicker';
import { Haptics } from '../../services/HapticFeedback';

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
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    alarm ? alarm.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]
  );
  const [dismissalType, setDismissalType] = useState<DismissalType>(
    alarm ? alarm.dismissalType : 'PUSHUP_MATH'
  );
  const [pushupTarget, setPushupTarget] = useState<number>(alarm ? alarm.pushupTarget : 5);
  const [rampDuration, setRampDuration] = useState<number>(alarm ? alarm.rampDuration : 30);
  const [preAlarmMinutes, setPreAlarmMinutes] = useState<number>(
    alarm?.preAlarmMinutes !== undefined
      ? alarm.preAlarmMinutes
      : alarm?.preAlarmEnabled
      ? 5
      : 0
  );

  const [referenceDescriptor] = useState<string | null>(alarm?.referenceDescriptor || null);

  const toggleDay = (day: number) => {
    Haptics.selection();
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const setDaysPreset = (preset: 'all' | 'weekdays' | 'weekends' | 'none') => {
    Haptics.selection();
    if (preset === 'all') setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    else if (preset === 'weekdays') setDaysOfWeek([1, 2, 3, 4, 5]);
    else if (preset === 'weekends') setDaysOfWeek([0, 6]);
    else setDaysOfWeek([]);
  };

  const handleClose = () => {
    Haptics.light();
    onClose();
  };

  const handleNextStep = () => {
    Haptics.medium();
    setStep('TASKS');
  };

  const handleBackStep = () => {
    Haptics.light();
    setStep('TIME');
  };

  const handleSaveFinal = () => {
    Haptics.success();
    const h24 = period === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;
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
        handleClose();
      }
      touchStartYRef.current = null;
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 animate-fade-in"
      style={{
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full select-none overflow-y-auto text-white flex flex-col sheet-up scroll-container"
        style={{
          background: 'linear-gradient(180deg, #101117 0%, #08090D 100%)',
        }}
      >
        {/* ── Gesture Drag Handle ── */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="pt-3 pb-1 flex justify-center cursor-pointer shrink-0"
        >
          <div
            className="w-12 h-1.5 rounded-full transition-opacity hover:opacity-100"
            style={{ background: 'rgba(255,255,255,0.22)' }}
          />
        </div>

        {step === 'TIME' ? (
          /* ════════════════════════════════════════════
             PAGE 1: SET ALARM TIME & SCHEDULE
             ════════════════════════════════════════════ */
          <div className="flex flex-col flex-1">
            {/* Header */}
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="sticky top-0 z-10 backdrop-blur-xl border-b px-6 pt-3 pb-4"
              style={{
                background: 'rgba(16,17,23,0.95)',
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
                      style={{
                        background: 'rgba(37,99,235,0.2)',
                        color: '#60a5fa',
                        border: '1px solid rgba(37,99,235,0.4)',
                      }}
                    >
                      Step 1 of 2
                    </span>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
                      {alarm ? 'Edit Alarm' : 'New Alarm'}
                    </span>
                  </div>
                  <h2 className="text-3xl font-black tracking-tight text-white leading-none">
                    {alarm ? 'Configure' : 'Set Alarm'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="mt-1 w-10 h-10 flex items-center justify-center rounded-full text-neutral-400 hover:text-white press-spring transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-6 animate-fade-in flex-1">
              {/* Centered 3D Wheel Time Picker */}
              <div className="flex flex-col items-center py-2">
                <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-3">
                  Wake-Up Time
                </p>
                <div
                  className="inline-flex items-center justify-center gap-3 p-4 rounded-3xl"
                  style={{
                    background: 'rgba(255,255,255,0.035)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Hour */}
                  <div className="flex flex-col items-center w-20">
                    <ScrollPicker
                      items={Array.from({ length: 12 }, (_, i) => String(i + 1))}
                      selectedIndex={hour12 - 1}
                      onChange={(index) => setHour12(index + 1)}
                    />
                    <span className="text-[10px] text-neutral-500 mt-2 uppercase font-extrabold tracking-widest">
                      Hour
                    </span>
                  </div>

                  <span className="text-4xl font-extralight text-neutral-600 pb-5 select-none animate-colon">
                    :
                  </span>

                  {/* Minute */}
                  <div className="flex flex-col items-center w-20">
                    <ScrollPicker
                      items={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))}
                      selectedIndex={parseInt(minute, 10) || 0}
                      onChange={(index) => setMinute(String(index).padStart(2, '0'))}
                    />
                    <span className="text-[10px] text-neutral-500 mt-2 uppercase font-extrabold tracking-widest">
                      Min
                    </span>
                  </div>

                  {/* AM / PM Segmented Control */}
                  <div
                    className="flex flex-col gap-1.5 ml-1 p-1 rounded-2xl"
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {(['AM', 'PM'] as const).map((p) => {
                      const isSelected = period === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            Haptics.selection();
                            setPeriod(p);
                          }}
                          className={`px-4 py-2.5 text-xs font-black rounded-xl press-spring transition-all duration-200 ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Repeat Days Selector */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
                    Repeat Days
                  </label>
                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDaysPreset('weekdays')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/5 text-neutral-400 hover:text-white press-spring"
                    >
                      Weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => setDaysPreset('all')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/5 text-neutral-400 hover:text-white press-spring"
                    >
                      Everyday
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {DAYS.map((d) => {
                    const isSelected = daysOfWeek.includes(d.val);
                    return (
                      <button
                        key={d.val}
                        type="button"
                        title={d.name}
                        onClick={() => toggleDay(d.val)}
                        className={`h-11 text-xs font-black rounded-2xl press-spring transition-all duration-200 flex flex-col items-center justify-center ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/35 ring-1 ring-blue-400/40'
                            : 'bg-white/5 text-neutral-400 border border-white/8 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span>{d.label}</span>
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
                  className="w-full px-4 py-3.5 text-sm font-semibold rounded-2xl text-white placeholder:text-neutral-600 focus:outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
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
                    onChange={(e) => {
                      Haptics.tick();
                      setRampDuration(Number(e.target.value));
                    }}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-2xl bg-[#161722] border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={15} className="bg-[#161722] text-white">15 seconds</option>
                    <option value={30} className="bg-[#161722] text-white">30 seconds</option>
                    <option value={60} className="bg-[#161722] text-white">60 seconds</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 block mb-1.5">
                    Pre-Alarm
                  </label>
                  <select
                    value={preAlarmMinutes}
                    onChange={(e) => {
                      Haptics.tick();
                      setPreAlarmMinutes(Number(e.target.value));
                    }}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-2xl bg-[#161722] border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={0} className="bg-[#161722] text-white">Off</option>
                    <option value={5} className="bg-[#161722] text-white">5 mins before</option>
                    <option value={10} className="bg-[#161722] text-white">10 mins before</option>
                    <option value={15} className="bg-[#161722] text-white">15 mins before</option>
                  </select>
                </div>
              </div>

              {/* Page 1 Actions */}
              <div className="flex items-center gap-3 pt-3 pb-2">
                {alarm && onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      Haptics.heavy();
                      onDelete(alarm.id);
                    }}
                    className="w-13 h-13 flex items-center justify-center rounded-2xl text-neutral-400 hover:text-red-400 shrink-0 press-spring transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    title="Delete alarm"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black tracking-wide flex items-center justify-center gap-2 press-pop shadow-lg shadow-blue-500/30"
                >
                  <span>Select Wake-Up Challenge</span>
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ════════════════════════════════════════════
             PAGE 2: WAKE-UP CHALLENGE SELECTION
             ════════════════════════════════════════════ */
          <div className="flex flex-col flex-1">
            {/* Header with Back button */}
            <div className="sticky top-0 z-10 bg-[#101117]/95 backdrop-blur-xl border-b border-white/8 px-6 pt-3 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <button
                    type="button"
                    onClick={handleBackStep}
                    aria-label="Back to time settings"
                    className="mt-1 w-9 h-9 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 hover:text-white press-spring transition-colors"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        Step 2 of 2
                      </span>
                      <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
                        Dismissal Task
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-none">
                      Wake-Up Challenge
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="mt-1 w-9 h-9 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-400 hover:text-white press-spring transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 animate-fade-in flex-1">
              <p className="text-xs text-neutral-400 leading-relaxed">
                Choose your dismissal challenge. You must complete it to silence the alarm at{' '}
                <strong className="text-white">
                  {hour12}:{minute} {period}
                </strong>
                .
              </p>

              {/* Challenge Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Push-ups */}
                <button
                  type="button"
                  onClick={() => {
                    Haptics.selection();
                    setDismissalType('PUSHUP_MATH');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 press-spring transition-all ${
                    dismissalType === 'PUSHUP_MATH'
                      ? 'bg-blue-600/15 border-blue-500 shadow-lg shadow-blue-500/15 ring-1 ring-blue-500/40'
                      : 'bg-white/4 border-white/8 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`p-2 rounded-xl ${
                        dismissalType === 'PUSHUP_MATH'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/8 text-neutral-400'
                      }`}
                    >
                      <Dumbbell size={18} />
                    </div>
                    {dismissalType === 'PUSHUP_MATH' && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">Push-ups</span>
                    <span className="text-[10px] text-neutral-400">AI Pose Camera</span>
                  </div>
                </button>

                {/* 100 Taps & Shake */}
                <button
                  type="button"
                  onClick={() => {
                    Haptics.selection();
                    setDismissalType('CLICK_SHAKE');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 press-spring transition-all ${
                    dismissalType === 'CLICK_SHAKE'
                      ? 'bg-blue-600/15 border-blue-500 shadow-lg shadow-blue-500/15 ring-1 ring-blue-500/40'
                      : 'bg-white/4 border-white/8 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`p-2 rounded-xl ${
                        dismissalType === 'CLICK_SHAKE'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/8 text-neutral-400'
                      }`}
                    >
                      <Smartphone size={18} />
                    </div>
                    {dismissalType === 'CLICK_SHAKE' && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">Taps & Shake</span>
                    <span className="text-[10px] text-neutral-400">100 Taps + Shake</span>
                  </div>
                </button>

                {/* Math */}
                <button
                  type="button"
                  onClick={() => {
                    Haptics.selection();
                    setDismissalType('MATH');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 press-spring transition-all ${
                    dismissalType === 'MATH'
                      ? 'bg-blue-600/15 border-blue-500 shadow-lg shadow-blue-500/15 ring-1 ring-blue-500/40'
                      : 'bg-white/4 border-white/8 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`p-2 rounded-xl ${
                        dismissalType === 'MATH'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/8 text-neutral-400'
                      }`}
                    >
                      <Calculator size={18} />
                    </div>
                    {dismissalType === 'MATH' && <Check size={16} className="text-blue-400" />}
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">Math Puzzles</span>
                    <span className="text-[10px] text-neutral-400">3 Mental Equations</span>
                  </div>
                </button>

                {/* Room Light */}
                <button
                  type="button"
                  onClick={() => {
                    Haptics.selection();
                    setDismissalType('BRIGHTNESS');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 press-spring transition-all ${
                    dismissalType === 'BRIGHTNESS'
                      ? 'bg-blue-600/15 border-blue-500 shadow-lg shadow-blue-500/15 ring-1 ring-blue-500/40'
                      : 'bg-white/4 border-white/8 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`p-2 rounded-xl ${
                        dismissalType === 'BRIGHTNESS'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/8 text-neutral-400'
                      }`}
                    >
                      <Sun size={18} />
                    </div>
                    {dismissalType === 'BRIGHTNESS' && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">Turn on Lights</span>
                    <span className="text-[10px] text-neutral-400">Light Sensor AI</span>
                  </div>
                </button>

                {/* Scan Object */}
                <button
                  type="button"
                  onClick={() => {
                    Haptics.selection();
                    setDismissalType('OBJECT_MATCH');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 press-spring transition-all col-span-2 ${
                    dismissalType === 'OBJECT_MATCH'
                      ? 'bg-blue-600/15 border-blue-500 shadow-lg shadow-blue-500/15 ring-1 ring-blue-500/40'
                      : 'bg-white/4 border-white/8 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`p-2 rounded-xl ${
                        dismissalType === 'OBJECT_MATCH'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/8 text-neutral-400'
                      }`}
                    >
                      <Scan size={18} />
                    </div>
                    {dismissalType === 'OBJECT_MATCH' && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">Scan Household Object</span>
                    <span className="text-[10px] text-neutral-400">
                      Camera recognition (Mug, Sink, Book, Chair)
                    </span>
                  </div>
                </button>
              </div>

              {/* Dynamic Task Details */}
              {dismissalType === 'PUSHUP_MATH' && (
                <div className="p-4 rounded-2xl bg-white/4 border border-white/8 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Push-Up Reps</span>
                      <span className="text-[10px] text-neutral-400">Target to dismiss</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[5, 10, 15, 20].map((reps) => (
                        <button
                          key={reps}
                          type="button"
                          onClick={() => {
                            Haptics.selection();
                            setPushupTarget(reps);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black press-spring transition-all ${
                            pushupTarget === reps
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                              : 'bg-white/8 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {reps}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-400 pt-1.5 border-t border-white/5">
                    Front camera AI tracks your real push-up form and counts repetitions before dismissing.
                  </p>
                </div>
              )}

              {/* Page 2 Action Buttons */}
              <div className="flex items-center gap-3 pt-4 pb-2">
                <button
                  type="button"
                  onClick={handleBackStep}
                  className="px-5 py-4 rounded-2xl border border-white/10 bg-white/5 text-neutral-300 hover:text-white press-spring text-sm font-bold transition-all flex items-center gap-2"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveFinal}
                  className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black tracking-wide shadow-lg shadow-blue-500/30 press-pop transition-all"
                >
                  {alarm ? 'Save Changes' : 'Confirm & Set Alarm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
