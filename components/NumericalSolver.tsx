
import React, { useState, useEffect, useRef } from 'react';
import { X, Nu, Play, RefreshCw, AlertTriangle, Terminal, Trash2, Copy, CheckCircle2, Calculator, Sparkles, Mic, ArrowRight } from '../components/icons';
import { parseNumericalExpression, validateMathResult, solveNumericalWithAI } from '../services/geminiService';

declare const math: any;

interface Props {
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
}

const SAMPLE_PROMPTS = [
    "Integrate x^2 from 0 to 1",
    "Derivative of sin(x) at 0",
    "Mean of 1, 5, 20, 45",
    "Standard deviation of [1, 2, 3]",
    "50 mph to km/h"
];

export const NumericalSolver: React.FC<Props> = ({ isOpen, initialQuery, onClose }) => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [interpretedQuery, setInterpretedQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<any>({ ans: 0 }); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [usedEngine, setUsedEngine] = useState<string | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoRun = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (initialQuery) setInput(initialQuery);
      setTimeout(() => textareaRef.current?.focus(), 100);
      
      const params = new URLSearchParams(window.location.search);
      if (params.get('auto') === 'true' && initialQuery && !hasAutoRun.current) {
          hasAutoRun.current = true;
          setTimeout(() => handleSolve(), 500);
      }
    } else {
        hasAutoRun.current = false;
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (typeof math !== 'undefined') {
        math.import({
            integrate: (expr: any, v: any, start: any, end: any) => {
                 const expression = String(expr);
                 const variable = String(v);
                 const a = Number(start);
                 const b = Number(end);
                 const n = 1000;
                 const h = (b - a) / n;
                 let sum = 0;
                 const fa = math.evaluate(expression, { [variable]: a });
                 const fb = math.evaluate(expression, { [variable]: b });
                 sum += fa + fb;
                 for (let i = 1; i < n; i++) {
                     const x = a + i * h;
                     const val = math.evaluate(expression, { [variable]: x });
                     if (i % 2 === 0) sum += 2 * val;
                     else sum += 4 * val;
                 }
                 return (h / 3) * sum;
            },
            deriv: (expr: any, v: any, point: any) => {
                 const expression = String(expr);
                 const variable = String(v);
                 const val = Number(point);
                 const h = 1e-7;
                 const f_x_plus_h = math.evaluate(expression, { [variable]: val + h });
                 const f_x_minus_h = math.evaluate(expression, { [variable]: val - h });
                 return (f_x_plus_h - f_x_minus_h) / (2 * h);
            }
        }, { override: true });
    }
  }, []);

  const addLog = (msg: string) => {
    console.log(`[Numerical] ${msg}`);
    setDebugLog(prev => [...prev, msg]);
  };

  const handleSolve = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const queryToUse = input || initialQuery;
    if (!queryToUse || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setInterpretedQuery(null);
    setUsedEngine(null);
    setDebugLog([]); 

    try {
      if (typeof math === 'undefined') throw new Error("Math.js not loaded.");
      addLog(`Input: "${queryToUse}"`);
      let parsedExpression = await parseNumericalExpression(queryToUse);
      setInterpretedQuery(parsedExpression === 'UNSUPPORTED_OPERATION' ? queryToUse : parsedExpression);
      let finalResult = '';
      let engine = '';

      if (parsedExpression !== 'UNSUPPORTED_OPERATION') {
          try {
             const res = math.evaluate(parsedExpression, scope);
             const formatted = math.format(res, { precision: 14 });
             const validation = await validateMathResult(queryToUse, formatted);
             if (validation.isValid) {
                 finalResult = formatted;
                 engine = 'Math.js';
             }
          } catch (e) {}
      }

      if (!finalResult) {
          const aiRes = await solveNumericalWithAI(queryToUse);
          if (aiRes && !aiRes.toLowerCase().includes('error')) {
              finalResult = aiRes;
              engine = 'Gemini Pro (AI)';
              setInterpretedQuery(queryToUse);
          } else throw new Error("Could not solve.");
      }

      setResult(finalResult);
      setUsedEngine(engine);
      try {
          const scopeVal = math.evaluate(finalResult);
          setScope((prev: any) => ({ ...prev, ans: scopeVal }));
      } catch (e) {}
    } catch (err: any) {
      setError(err.message || "Error");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[95vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-emerald-50/50 dark:bg-emerald-900/10">
          <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg"><Nu className="w-5 h-5" /></div>
            <div><h3 className="font-bold text-lg leading-tight">Numerical Solver</h3><p className="text-[10px] uppercase tracking-wider opacity-70">Math.js Engine</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col">
            <form onSubmit={handleSolve} className="relative mb-6 shrink-0 group">
                <div className="relative">
                    <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g., Integrate x^2 from 0 to 1" className="w-full pl-5 pr-14 py-4 h-32 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 text-lg resize-none focus:outline-none" spellCheck={false} />
                    <div className="absolute right-3 top-3"><button type="button" onClick={() => setInput('')} className="p-2 text-slate-400 hover:text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button></div>
                    <button type="submit" disabled={(!input.trim() && !initialQuery) || isProcessing} className="absolute right-3 bottom-3 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all">
                        {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>
                </div>
            </form>
            {(!result && !error) && (
                <div className="mb-6 animate-fade-in">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Try these</p>
                    <div className="flex flex-wrap gap-2">{SAMPLE_PROMPTS.map((p, i) => <button key={i} onClick={() => setInput(p)} className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 rounded-lg text-xs hover:border-emerald-200 transition-colors">{p}</button>)}</div>
                </div>
            )}
            {error && <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center space-x-2"><AlertTriangle className="w-4 h-4" /><span>{error}</span></div>}
            {result && !error && (
                <div className="mb-6 p-6 bg-emerald-50/50 dark:bg-slate-800 border border-emerald-100 rounded-2xl shadow-sm relative animate-fade-in-up">
                    {usedEngine && <div className="absolute top-4 right-4 flex items-center px-2 py-1 rounded-md bg-white border border-emerald-100 text-[10px] font-semibold text-slate-500"><span className="mr-1">{usedEngine.includes('AI') ? '✨' : '✅'}</span>{usedEngine}</div>}
                    {interpretedQuery && <div className="mb-4 pb-4 border-b border-emerald-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Expression</p><div className="font-mono text-sm text-slate-600 dark:text-slate-300">{interpretedQuery}</div></div>}
                    <p className="text-xs font-bold text-emerald-600 uppercase mb-2">Result</p>
                    <div className="text-2xl sm:text-4xl font-mono text-slate-900 dark:text-slate-100 break-words">{result}</div>
                </div>
            )}
            <div className="mt-auto flex justify-end"><button onClick={() => setShowDebug(!showDebug)} className="text-[10px] text-slate-400 font-mono hover:text-slate-600 transition-colors"><Terminal className="w-3 h-3 inline mr-1" />{showDebug ? 'Hide Logs' : 'Logs'}</button></div>
            {showDebug && debugLog.length > 0 && <div className="mt-3 p-3 bg-slate-100 dark:bg-black/30 rounded-lg text-[10px] font-mono border border-slate-200">{debugLog.map((log, i) => <div key={i} className="mb-0.5 border-b last:border-0">{log}</div>)}</div>}
        </div>
      </div>
    </div>
  );
};
