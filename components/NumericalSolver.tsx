import React, { useState, useEffect, useRef } from 'react';
import { X, Nu, Play, RefreshCw, AlertTriangle, Terminal, Trash2, Copy, CheckCircle2, Calculator, Sparkles, Mic, ArrowRight } from '../components/icons';
import { parseNumericalExpression, validateMathResult, solveNumericalWithAI } from '../services/geminiService';

declare const math: any;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_PROMPTS = [
    "Integrate x^2 from 0 to 1",
    "Derivative of sin(x) at 0",
    "Mean of 1, 5, 20, 45",
    "Standard deviation of [1, 2, 3]",
    "50 mph to km/h"
];

export const NumericalSolver: React.FC<Props> = ({ isOpen, onClose }) => {
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

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Inject custom numeric functions into math.js
  useEffect(() => {
    if (typeof math !== 'undefined') {
        math.import({
            integrate: (expr: any, v: any, start: any, end: any) => {
                 // Ensure types
                 const expression = String(expr);
                 const variable = String(v);
                 const a = Number(start);
                 const b = Number(end);
                 const n = 1000; // precision steps
                 const h = (b - a) / n;
                 let sum = 0;
                 
                 // Simpson's Rule Implementation
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
                 
                 // Central Difference
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
    if (!input.trim()) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setInterpretedQuery(null);
    setUsedEngine(null);
    setDebugLog([]); 

    try {
      if (typeof math === 'undefined') {
        throw new Error("Math.js library not loaded.");
      }

      addLog(`User Input: "${input}"`);
      
      // 1. Natural Language Parsing (Gemini 2.5 Pro)
      addLog("Parsing natural language with Gemini 2.5 Pro...");
      let parsedExpression = '';
      try {
          parsedExpression = await parseNumericalExpression(input);
      } catch (geminiError: any) {
          addLog(`Gemini parsing failed: ${geminiError.message}. Using raw input.`);
          parsedExpression = input;
      }
      
      if (parsedExpression !== input) {
        addLog(`Transformed to Math.js Syntax: "${parsedExpression}"`);
      }
      
      // Set the LHS for display
      setInterpretedQuery(parsedExpression === 'UNSUPPORTED_OPERATION' ? input : parsedExpression);

      let finalResult = '';
      let engine = '';
      let executedLocally = false;
      let rawResultStr = '';

      // 2. Try Local Execution
      if (parsedExpression !== 'UNSUPPORTED_OPERATION') {
          try {
             addLog(`Current Variable Scope Keys: [${Object.keys(scope).join(', ')}]`);
             addLog("Executing math.evaluate()...");
             
             const res = math.evaluate(parsedExpression, scope);
             
             // Format result
             let formatted = '';
             let type = 'unknown';
             try { type = math.typeof(res); } catch(e) {}
             
             if (type === 'Matrix' || Array.isArray(res)) {
                 formatted = math.format(res, { precision: 14 });
             } else {
                 formatted = math.format(res, { precision: 14 });
             }
             
             rawResultStr = formatted;
             executedLocally = true;
             addLog(`Local Result: ${formatted}`);
             
          } catch (localErr: any) {
             addLog(`Local execution failed: ${localErr.message}`);
          }
      } else {
          addLog("Parser indicated UNSUPPORTED_OPERATION for local engine.");
      }

      // 3. Validation & Fallback Logic
      if (executedLocally) {
          addLog("Verifying local result with AI Judge...");
          const validation = await validateMathResult(input, rawResultStr);
          
          if (validation.isValid) {
              finalResult = rawResultStr;
              engine = 'Math.js';
              addLog(`✅ AI Judge Verified. Reason: ${validation.reason || 'Valid'}`);
          } else {
              addLog(`❌ AI Judge Rejected. Reason: ${validation.reason}`);
              // Proceed to fallback
          }
      }

      // 4. AI Fallback (if local failed or verification failed)
      if (!finalResult) {
          addLog("⚠️ Initiating AI Numerical Fallback (Gemini Pro)...");
          try {
             const aiRes = await solveNumericalWithAI(input);
             if (aiRes && !aiRes.toLowerCase().includes('error')) {
                 finalResult = aiRes;
                 engine = 'Gemini Pro (AI)';
                 // If falling back to AI, the parsed expression might have been wrong, so show input as LHS
                 setInterpretedQuery(input);
                 addLog(`✅ Solved by AI Fallback. Result: ${finalResult}`);
             } else {
                 throw new Error("AI could not compute a result.");
             }
          } catch (aiErr: any) {
             addLog(`❌ AI Fallback failed: ${aiErr.message}`);
             throw new Error("Could not solve this problem locally or with AI.");
          }
      }

      setResult(finalResult);
      setUsedEngine(engine);

      // Update Scope with 'ans' for next turn
      try {
          const scopeVal = math.evaluate(finalResult);
          setScope((prev: any) => ({ ...prev, ...scope, ans: scopeVal }));
      } catch (e) {
          setScope((prev: any) => ({ ...prev, ...scope, ans: finalResult }));
      }

    } catch (err: any) {
      const errMsg = err.message || "Calculation Error";
      addLog(`Error: ${errMsg}`);
      setError(errMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700/50 bg-emerald-50/50 dark:bg-emerald-900/10 shrink-0">
          <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                <Nu className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-lg leading-tight">Numerical Solver</h3>
                <p className="text-[10px] uppercase tracking-wider opacity-70">
                   Math.js Engine • AI Fallback
                </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col">
            
            {/* Main Input Area */}
            <form onSubmit={handleSolve} className="relative mb-6 shrink-0 group">
                <div className="relative">
                    <textarea 
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask anything (e.g., 'Integral of x^2 from 0 to 1')..."
                        className="w-full pl-5 pr-14 py-4 h-32 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 outline-none transition-all text-slate-900 dark:text-slate-100 text-lg resize-none shadow-inner"
                        spellCheck={false}
                    />
                    
                    {/* Floating Controls */}
                    <div className="absolute right-3 top-3 flex flex-col gap-2">
                        <button 
                            type="button"
                            onClick={() => setInput('')}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 transition-all rounded-lg"
                            title="Clear"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Submit Button - Bottom Right Overlay */}
                    <button
                        type="submit"
                        disabled={!input.trim() || isProcessing}
                        className="absolute right-3 bottom-3 p-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl transition-all shadow-md hover:shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                        {isProcessing ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span className="text-sm font-semibold hidden sm:inline">Calculate</span>
                                <Play className="w-5 h-5 fill-current" />
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* Suggestions / Natural Language Encouragement */}
            {(!result && !error) && (
                <div className="mb-6 animate-fade-in">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                        <Sparkles className="w-3 h-3 mr-1.5" />
                        Try Natural Language or Voice
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {SAMPLE_PROMPTS.map((prompt, i) => (
                            <button
                                key={i}
                                onClick={() => setInput(prompt)}
                                className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-600 dark:text-slate-400 hover:border-emerald-200 dark:hover:border-emerald-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-left"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-xs text-slate-400 italic">
                        <Mic className="w-3.5 h-3.5" />
                        <span>Use your keyboard's microphone for voice input</span>
                    </div>
                </div>
            )}

            {/* Error & Result Display */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl flex flex-col space-y-2 text-red-600 dark:text-red-400 text-sm animate-fade-in">
                    <div className="flex items-center space-x-2 font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Calculation Error</span>
                    </div>
                    <p className="break-all opacity-90">{error}</p>
                </div>
            )}

            {result && !error && (
                <div className="mb-6 p-6 bg-gradient-to-br from-emerald-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl shadow-sm relative group animate-fade-in-up">
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                            {usedEngine && (
                                <div className="flex items-center px-2 py-1 rounded-md bg-white/50 dark:bg-black/20 border border-emerald-100 dark:border-emerald-900/20">
                                    {usedEngine.includes('AI') ? (
                                        <Sparkles className="w-3 h-3 text-amber-500 mr-1.5" />
                                    ) : (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-1.5" />
                                    )}
                                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {usedEngine}
                                    </span>
                                </div>
                            )}
                            <button 
                            onClick={() => navigator.clipboard.writeText(result)}
                            className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md text-emerald-600 dark:text-emerald-400 transition-colors"
                            title="Copy Result"
                            >
                            <Copy className="w-4 h-4" />
                            </button>
                    </div>

                    {/* Input Expression (LHS) */}
                    {interpretedQuery && (
                        <div className="mb-4 pb-4 border-b border-emerald-100 dark:border-emerald-900/30">
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                Expression
                             </p>
                             <div className="font-mono text-sm sm:text-base text-slate-600 dark:text-slate-300 break-all">
                                {interpretedQuery}
                             </div>
                        </div>
                    )}

                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Computed Result</p>
                    <div className="text-2xl sm:text-4xl font-mono text-slate-900 dark:text-slate-100 break-words whitespace-pre-wrap">
                        {result}
                    </div>
                </div>
            )}

            {/* Debug Toggle */}
            <div className="mt-auto flex justify-end">
                <button 
                    onClick={() => setShowDebug(!showDebug)} 
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
                >
                    <Terminal className="w-3 h-3" />
                    {showDebug ? 'Hide Logs' : 'Logs'}
                </button>
            </div>
            
            {showDebug && debugLog.length > 0 && (
                <div className="mt-3 p-3 bg-slate-100 dark:bg-black/30 rounded-lg text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-800 animate-fade-in">
                    {debugLog.map((log, i) => (
                        <div key={i} className="mb-0.5 border-b border-slate-200/50 dark:border-slate-700/50 pb-0.5 last:border-0 last:pb-0 whitespace-nowrap">
                            <span className="opacity-50 mr-2">[{i + 1}]</span>
                            {log}
                        </div>
                    ))}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
