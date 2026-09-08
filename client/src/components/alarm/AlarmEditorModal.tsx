import React, { useState, useRef } from 'react';
import { Alarm, DismissalType } from '../../types/alarm';
import { X, Trash2, Camera, Activity, SunMedium, EyeOff, Calculator, Check } from 'lucide-react';
import { useCameraVision } from '../../hooks/useCameraVision';

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

const DISMISSAL_OPTIONS = [
  {
    type: 'PUSHUP_MATH' as DismissalType,
    icon: Activity,
    title: 'Pushups',
    badge: 'Hardcore',
    desc: 'AI tracks your form until you complete your target reps.',
    color: 'text-rose-400',
  },
  {
    type: 'BRIGHTNESS' as DismissalType,
    icon: SunMedium,
    title: 'Light Check',
    badge: '',
    desc: 'Camera must detect room light turned on for 2 seconds.',
    color: 'text-yellow-400',
  },
  {
    type: 'FACE_AWAY' as DismissalType,
    icon: EyeOff,
    title: 'Face-Away',
    badge: '',
    desc: 'Forces you out of bed — front camera must not see your resting face for 3s.',
    color: 'text-purple-400',
  },
  {
    type: 'OBJECT_MATCH' as DismissalType,
    icon: Camera,
    title: 'Scan Object',
    badge: '',
    desc: 'Register a photo of kitchen or bathroom; scan to match in the morning.',
    color: 'text-green-400',
  },
  {
    type: 'MATH' as DismissalType,
    icon: Calculator,
    title: 'Math Only',
    badge: '',
    desc: 'Solve 3 escalating arithmetic problems in sequence.',
    color: 'text-orange-400',
  },
];

export const AlarmEditorModal: React.FC<AlarmEditorModalProps> = ({
  alarm,
  onSave,
  onDelete,
  onClose,
}) => {
  const initialTime = alarm ? alarm.time : '07:00';
  const [initH, initM] = initialTime.split(':').map(Number);
  const [hour12, setHour12] = useState<number>(initH % 12 === 0 ? 12 : initH % 12);
  const [minute, setMinute] = useState<string>(String(initM).padStart(2, '0'));
  const [period, setPeriod] = useState<'AM' | 'PM'>(initH >= 12 ? 'PM' : 'AM');

  const [label, setLabel] = useState<string>(alarm ? alarm.label : '');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(alarm ? alarm.daysOfWeek : [1, 2, 3, 4, 5]);
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

  // Legacy reference descriptor (kept for backward compatibility)
  const [referenceDescriptor] = useState<string | null>(alarm?.referenceDescriptor || null);
  const { videoRef: _vr, startCamera: _sc, stopCamera: _stop, extractFeatureDescriptor: _eff } = useCameraVision();
  void _vr; void _sc; void _stop; void _eff;

  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  void captureCanvasRef;

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      isEnabled: true,
    };
    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fade-in">
      <div className="w-full max-w-md bg-[#111113] border border-white/10 rounded-t-3xl sm:rounded-3xl select-none max-h-[92vh] overflow-y-auto text-white">

        {/* ── Aesthetic Header ── */}
        <div className="sticky top-0 z-10 bg-[#111113] border-b border-white/8 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-blue-400 mb-0.5">
                {alarm ? 'Edit Alarm' : 'New Alarm'}
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-white leading-none">
                {alarm ? 'Configure.' : 'Rise.'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="mt-1 w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* ── Time Picker ── */}
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 mb-4">
              Wake-up Time
            </p>
            <div className="inline-flex items-center justify-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
              {/* Hour */}
              <div className="flex flex-col items-center">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={hour12}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setHour12(Math.max(1, Math.min(12, val)));
                    else setHour12(12);
                  }}
                  className="w-20 text-5xl font-extrabold text-center bg-transparent text-white focus:outline-none font-tabular"
                />
                <span className="text-[10px] text-neutral-500 mt-1 uppercase font-bold tracking-wider">Hour</span>
              </div>

              <span className="text-5xl font-light text-neutral-600 pb-4">:</span>

              {/* Minute */}
              <div className="flex flex-col items-center">
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => { if (e.target.value.length <= 2) setMinute(e.target.value); }}
                  onBlur={() => {
                    const val = Math.max(0, Math.min(59, parseInt(minute, 10) || 0));
                    setMinute(String(val).padStart(2, '0'));
                  }}
                  className="w-20 text-5xl font-extrabold text-center bg-transparent text-white focus:outline-none font-tabular"
                />
                <span className="text-[10px] text-neutral-500 mt-1 uppercase font-bold tracking-wider">Min</span>
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

          {/* ── Label ── */}
          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 block mb-2">
              Alarm Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={30}
              placeholder="e.g. Morning Rise"
              className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* ── Repeat Days ── */}
          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 block mb-3">
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

          {/* ── Dismissal Mode ── */}
          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 block mb-3">
              Wake-Up Challenge
            </label>
            <div className="space-y-2">
              {DISMISSAL_OPTIONS.map(({ type, icon: Icon, title, badge, desc, color }) => {
                const isActive = dismissalType === type;
                return (
                  <div
                    key={type}
                    onClick={() => setDismissalType(type)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isActive
                        ? 'border-blue-500/60 bg-blue-500/10'
                        : 'border-white/8 bg-white/3 hover:bg-white/6 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <Icon size={15} className={isActive ? color : 'text-neutral-500'} />
                        <span className={`text-sm font-extrabold ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                          {title}
                        </span>
                      </div>
                      {badge && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold tracking-wider uppercase border border-blue-500/30">
                          {badge}
                        </span>
                      )}
                      {isActive && (
                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 ml-2">
                          <Check size={11} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 pl-5">{desc}</p>

                    {/* Pushup rep selector */}
                    {isActive && type === 'PUSHUP_MATH' && (
                      <div className="mt-3 pt-3 border-t border-white/10 flex items-center space-x-2">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-neutral-500 mr-1">Reps:</span>
                        {[3, 5, 10, 15].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPushupTarget(cnt); }}
                            className={`w-9 h-9 text-xs font-extrabold rounded-xl border transition-all ${
                              pushupTarget === cnt
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-white/10 bg-white/5 text-neutral-400 hover:border-white/30'
                            }`}
                          >
                            {cnt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Random Object details for OBJECT_MATCH */}
                    {isActive && type === 'OBJECT_MATCH' && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-[10px] text-neutral-500 font-medium">
                          Rise will randomly demand you to find a specific household object (like a Sink or Couch). You won't know what it is until it rings!
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Volume Ramp & Pre-alarm ── */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/8">
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 block mb-2">
                Volume Ramp
              </label>
              <select
                value={rampDuration}
                onChange={(e) => setRampDuration(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm font-semibold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 block mb-2">
                Pre-Alarm
              </label>
              <select
                value={preAlarmMinutes}
                onChange={(e) => setPreAlarmMinutes(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm font-semibold rounded-xl bg-[#1c1c1f] border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value={0} className="bg-[#1c1c1f] text-white">Off</option>
                <option value={5} className="bg-[#1c1c1f] text-white">5 mins before</option>
                <option value={10} className="bg-[#1c1c1f] text-white">10 mins before</option>
                <option value={15} className="bg-[#1c1c1f] text-white">15 mins before</option>
              </select>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center space-x-3 pt-2 pb-2">
            {alarm && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(alarm.id)}
                className="w-12 h-12 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-500 hover:text-red-400 hover:border-red-500/40 transition-colors"
                title="Delete alarm"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-extrabold tracking-wide shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
            >
              {alarm ? 'Save Changes' : 'Create Alarm'}
            </button>
          </div>
        </form>


      </div>
    </div>
  );
};
