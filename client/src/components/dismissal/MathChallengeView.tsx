import React, { useState } from 'react';
import { Calculator, Delete, Check } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';
import { Haptics } from '../../services/HapticFeedback';

interface MathChallengeViewProps {
  totalQuestions?: number;
  onComplete: () => void;
}

interface Question {
  text: string;
  answer: number;
}

type OpType = 'add' | 'subtract' | 'multiply' | 'divide';

const GENERATE_QUESTIONS = (count: number = 2): Question[] => {
  const ops: OpType[] = ['add', 'subtract', 'multiply', 'divide'];
  const list: Question[] = [];
  const usedOps = new Set<OpType>();

  for (let i = 0; i < count; i++) {
    const available = ops.filter((o) => !usedOps.has(o));
    const pool = available.length > 0 ? available : ops;
    const op = pool[Math.floor(Math.random() * pool.length)] as OpType;
    usedOps.add(op);

    let text = '';
    let answer = 0;

    if (op === 'add') {
      const a = Math.floor(Math.random() * 900) + 100;
      const b = Math.floor(Math.random() * 900) + 100;
      text = `${a} + ${b}`;
      answer = a + b;
    } else if (op === 'subtract') {
      const b = Math.floor(Math.random() * 200) + 50;
      const a = b + Math.floor(Math.random() * 700) + 100;
      text = `${a} − ${b}`;
      answer = a - b;
    } else if (op === 'multiply') {
      const a = Math.floor(Math.random() * 15) + 11;
      const b = Math.floor(Math.random() * 11) + 5;
      text = `${a} × ${b}`;
      answer = a * b;
    } else {
      const divisor = Math.floor(Math.random() * 15) + 5;
      const quotient = Math.floor(Math.random() * 25) + 10;
      const dividend = divisor * quotient;
      text = `${dividend} ÷ ${divisor}`;
      answer = quotient;
    }

    list.push({ text, answer });
  }
  return list;
};

export const MathChallengeView: React.FC<MathChallengeViewProps> = ({
  totalQuestions = 2,
  onComplete,
}) => {
  const [questions] = useState<Question[]>(() => GENERATE_QUESTIONS(totalQuestions));
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentInput, setCurrentInput] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);

  const currentQ = questions[currentIndex];

  const handleDigit = (digit: string) => {
    Haptics.tick();
    if (currentInput.length < 5) {
      setCurrentInput((prev) => prev + digit);
      setHasError(false);
    }
  };

  const handleBackspace = () => {
    Haptics.light();
    setCurrentInput((prev) => prev.slice(0, -1));
    setHasError(false);
  };

  const handleSubmit = () => {
    const num = parseInt(currentInput, 10);
    if (isNaN(num)) return;

    if (num === currentQ.answer) {
      synth.playRepChirp();
      Haptics.success();
      setCurrentInput('');
      setHasError(false);

      if (currentIndex + 1 >= questions.length) {
        onComplete();
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } else {
      // Wrong answer
      Haptics.error();
      setHasError(true);
      setCurrentInput('');
    }
  };

  return (
    <div className="w-full flex flex-col items-center select-none text-center animate-fade-in">
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-black">
        <Calculator size={14} className="text-blue-500" />
        <span>COGNITIVE WAKE-UP CHALLENGE</span>
      </div>

      <h2 className="text-2xl font-black tracking-tight text-theme-text mb-1">
        Solve to Silence Alarm
      </h2>

      {/* Progress Indicators */}
      <div className="flex items-center space-x-2 mb-6">
        {questions.map((_, idx) => (
          <span
            key={idx}
            className={`w-12 h-2 rounded-full transition-all duration-300 ${
              idx < currentIndex
                ? 'bg-blue-600 shadow-sm shadow-blue-500/30'
                : idx === currentIndex
                ? 'bg-blue-400 animate-pulse'
                : 'bg-theme-border'
            }`}
          />
        ))}
      </div>

      {/* Question Equation Display */}
      <div className="w-full max-w-xs rounded-3xl p-5 mb-5 card-premium text-center">
        <div className="text-3xl font-black tracking-tight font-tabular text-theme-text mb-3">
          {currentQ.text} = ?
        </div>
        <div
          className={`h-12 text-2xl font-black border-b-2 flex items-center justify-center font-tabular transition-colors ${
            hasError
              ? 'border-red-500 text-red-500'
              : 'border-blue-500 text-theme-text'
          }`}
        >
          {currentInput || <span className="opacity-30 text-lg">Enter answer</span>}
        </div>
        {hasError && (
          <span className="text-xs text-red-500 font-bold block mt-2 animate-shake">
            Incorrect answer. Try again!
          </span>
        )}
      </div>

      {/* Numeric Keypad */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigit(digit)}
            className="h-14 rounded-2xl glass-card text-2xl font-black font-tabular text-theme-text press-spring shadow-sm flex items-center justify-center"
          >
            {digit}
          </button>
        ))}

        <button
          onClick={handleBackspace}
          className="h-14 rounded-2xl glass-card flex items-center justify-center text-theme-subtext press-spring shadow-sm"
          aria-label="Backspace"
        >
          <Delete size={22} />
        </button>

        <button
          onClick={() => handleDigit('0')}
          className="h-14 rounded-2xl glass-card text-2xl font-black font-tabular text-theme-text press-spring shadow-sm flex items-center justify-center"
        >
          0
        </button>

        <button
          onClick={handleSubmit}
          className="h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center press-pop shadow-lg shadow-blue-500/30 font-black"
          aria-label="Submit Answer"
        >
          <Check size={24} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
};
