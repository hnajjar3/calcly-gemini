
import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, Equal, Calculator as CalcIcon } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BasicCalculator: React.FC<Props> = ({ isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [history, setHistory] = useState<string>('');

  // Handle keyboard input
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    
    const key = e.key;
    if (/[0-9+\-*/.()]/.test(key)) {
      setInput(prev => prev + key);
    } else if (key === 'Enter') {
      e.preventDefault();
      calculate();
    } else if (key === 'Backspace') {
      setInput(prev => prev.slice(0, -1));
    } else if (key === 'Escape') {
      onClose();
    }
  }, [isOpen, onClose, input]); // Added input dependency to ensure latest state

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const calculate = () => {
    try {
      if (!input) return;
      // Sanitize input to only allow math chars
      const sanitized = input.replace(/[^0-9+\-*/.()]/g, '');
      // eslint-disable-next-line no-new-func
      const res = new Function(`return ${sanitized}`)();
      
      const formattedResult = Number(res).toLocaleString(undefined, { maximumFractionDigits: 6 });
      setResult(formattedResult);
      setHistory(input + ' =');
      setInput(String(res));
    } catch (e) {
      setResult('Error');
    }
  };

  const clear = () => {
    setInput('');
    setResult('');
    setHistory('');
  };

  const backspace = () => {
    setInput(prev => prev.slice(0, -1));
  };

  const append = (char: string) => {
    setInput(prev => prev + char);
  };

  if (!isOpen) return null;

  const btnClass = "h-14 rounded-xl text-xl font-medium transition-all active:scale-95 flex items-center justify-center shadow-sm";
  const numBtnClass = `${btnClass} bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600`;
  const opBtnClass = `${btnClass} bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800`;
  const actionBtnClass = `${btnClass} bg-slate-100 dark:bg-slate-600/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-500`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
            <CalcIcon className="w-5 h-5" />
            <span className="font-semibold text-sm uppercase tracking-wide">Calculator</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Display */}
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex flex-col justify-end items-end h-40 space-y-2">
          <div className="text-slate-400 dark:text-slate-500 text-sm font-medium h-6">
            {history}
          </div>
          <div className="text-4xl font-light text-slate-900 dark:text-slate-100 break-all text-right w-full">
            {input || '0'}
          </div>
          {result && result !== 'Error' && input !== result && (
             <div className="text-xl text-emerald-500 font-medium">
               = {result}
             </div>
          )}
        </div>

        {/* Keypad */}
        <div className="p-4 grid grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800">
          <button onClick={clear} className={`${actionBtnClass} text-red-500 dark:text-red-400 font-bold`}>AC</button>
          <button onClick={() => append('(')} className={opBtnClass}>(</button>
          <button onClick={() => append(')')} className={opBtnClass}>)</button>
          <button onClick={() => append('/')} className={opBtnClass}>÷</button>

          <button onClick={() => append('7')} className={numBtnClass}>7</button>
          <button onClick={() => append('8')} className={numBtnClass}>8</button>
          <button onClick={() => append('9')} className={numBtnClass}>9</button>
          <button onClick={() => append('*')} className={opBtnClass}>×</button>

          <button onClick={() => append('4')} className={numBtnClass}>4</button>
          <button onClick={() => append('5')} className={numBtnClass}>5</button>
          <button onClick={() => append('6')} className={numBtnClass}>6</button>
          <button onClick={() => append('-')} className={opBtnClass}>−</button>

          <button onClick={() => append('1')} className={numBtnClass}>1</button>
          <button onClick={() => append('2')} className={numBtnClass}>2</button>
          <button onClick={() => append('3')} className={numBtnClass}>3</button>
          <button onClick={() => append('+')} className={opBtnClass}>+</button>

          <button onClick={() => append('0')} className={`${numBtnClass} col-span-1`}>0</button>
          <button onClick={() => append('.')} className={numBtnClass}>.</button>
          <button onClick={backspace} className={actionBtnClass}>
            <Delete className="w-6 h-6" />
          </button>
          <button 
            onClick={calculate} 
            className="h-14 rounded-xl text-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-all"
          >
            <Equal className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
