import React, { useState } from 'react';
import { Calculator, Delete, Check } from 'lucide-react';
import { synth } from '../../services/WebAudioSynth';

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
    // Pick a random op, try not to repeat until all used
    const available = ops.filter(o => !usedOps.has(o));
    const pool = available.length > 0 ? available : ops;
    const op = pool[Math.floor(Math.random() * pool.length)] as OpType;
    usedOps.add(op);

    let text = '';
    let answer = 0;

    if (op === 'add') {
      const a = Math.floor(Math.random() * 900) + 100; // 100-999
      const b = Math.floor(Math.random() * 900) + 100; // 100-999
      text = `${a} + ${b}`;
      answer = a + b;

    } else if (op === 'subtract') {
      const b = Math.floor(Math.random() * 200) + 50; // 50-249
      const a = b + Math.floor(Math.random() * 700) + 100; // Guarantee positive answer
      text = `${a} − ${b}`;
      answer = a - b;

    } else if (op === 'multiply') {
      const a = Math.floor(Math.random() * 15) + 11; // 11-25
      const b = Math.floor(Math.random() * 11) + 5;  // 5-15
      text = `${a} × ${b}`;
      answer = a * b;

    } else {
      // Division — larger numbers but still clean integers
      const divisor = Math.floor(Math.random() * 15) + 5;     // 5-19
      const quotient = Math.floor(Math.random() * 25) + 10;   // 10-34
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
    if (currentInput.length < 5) {
      setCurrentInput((prev) => prev + digit);
      setHasError(false);
    }
  };

  const handleBackspace = () => {
    setCurrentInput((prev) => prev.slice(0, -1));
    setHasError(false);
  };

  const handleSubmit = () => {
    const num = parseInt(currentInput, 10);
    if (isNaN(num)) return;

    if (num === currentQ.answer) {
      synth.playRepChirp();
      setCurrentInput('');
      setHasError(false);

      if (currentIndex + 1 >= questions.length) {
        onComplete();
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } else {
      // Wrong answer
      setHasError(true);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      setCurrentInput('');
    }
  };

  return (
    <div className="w-full flex flex-col items-center select-none text-center">
      <div className="flex items-center space-x-2 text-xs uppercase tracking-wider text-theme-subtext mb-2 font-semibold">
        <Calculator size={14} className="text-blue-500" />
        <span>STEP 2: COGNITIVE CHALLENGE</span>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-theme-text mb-1">
        Solve to Turn Off Alarm
      </h2>

      {/* Progress */}
      <div className="flex items-center space-x-1.5 mb-6">
        {questions.map((_, idx) => (
          <span
            key={idx}
            className={`w-10 h-1.5 rounded-full transition-all ${
              idx < currentIndex
                ? 'bg-blue-500'
                : idx === currentIndex
                ? 'bg-blue-400 animate-pulse'
                : 'bg-theme-border'
            }`}
          />
        ))}
      </div>

      {/* Question Equation Display */}
      <div className="w-full max-w-xs rounded-2xl border border-theme-border p-5 mb-4 bg-theme-card text-center shadow-sm">
        <div className="text-3xl font-bold tracking-normal text-theme-text mb-3">
          {currentQ.text} = ?
        </div>
        <div
          className={`h-11 text-2xl font-semibold border-b-2 flex items-center justify-center ${
            hasError
              ? 'border-red-500 text-red-500'
              : 'border-blue-500 text-theme-text'
          }`}
        >
          {currentInput || <span className="opacity-30">Enter answer</span>}
        </div>
        {hasError && (
          <span className="text-xs text-red-500 font-medium block mt-1.5">
            Incorrect. Try again.
          </span>
        )}
      </div>

      {/* Numeric Keypad */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigit(digit)}
            className="h-14 rounded-xl border border-theme-border bg-theme-card text-xl font-bold text-theme-text hover:bg-theme-border/20 active:scale-95 transition-all shadow-sm"
          >
            {digit}
          </button>
        ))}

        <button
          onClick={handleBackspace}
          className="h-14 rounded-xl border border-theme-border bg-theme-card flex items-center justify-center text-theme-subtext hover:bg-theme-border/20 active:scale-95 transition-all shadow-sm"
          aria-label="Backspace"
        >
          <Delete size={22} />
        </button>

        <button
          onClick={() => handleDigit('0')}
          className="h-14 rounded-xl border border-theme-border bg-theme-card text-xl font-bold text-theme-text hover:bg-theme-border/20 active:scale-95 transition-all shadow-sm"
        >
          0
        </button>

        <button
          onClick={handleSubmit}
          className="h-14 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all shadow-md font-bold"
          aria-label="Submit Answer"
        >
          <Check size={24} />
        </button>
      </div>
    </div>
  );
};
