import React, { useState, useEffect, useRef } from 'react';
import { X, Nu, Play, RefreshCw, AlertTriangle, Terminal, Trash2, Copy, CheckCircle2, Calculator, Delete, Sparkles } from '../components/icons';
import { parseNumericalExpression, validateMathResult, solveNumericalWithAI } from '../services/geminiService';

declare const math: any;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const NumericalSolver: React.FC<Props> = ({ isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<any>({ ans: 0 }); // Initialize ans
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
      // Try to parse the result string back to a number/object if possible
      try {
          // If it came from AI, it's a string. We want 'ans' to be a number/matrix if possible.
          // math.evaluate on the result string usually works (e.g. "4.5" -> 4.5)
          const scopeVal = math.evaluate(finalResult);
          setScope((prev: any) => ({ ...prev, ...scope, ans: scopeVal }));
      } catch (e) {
          // If strict eval fails (maybe text?), just store as string
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

  const clearAll = () => {
    setInput('');
    setResult(null);
    setError(null);
    setScope({ ans: 0 });
    setDebugLog([]);
    setUsedEngine(null);
    addLog("Scope cleared.");
    textareaRef.current?.focus();
  };

  // Keypad Handlers
  const insertText = (text: string, cursorOffset = 0) => {
    const el = textareaRef.current;
    if (!el) {
        setInput(prev => prev + text);
        return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const oldText = input;
    const newText = oldText.substring(0, start) + text + oldText.substring(end);
    
    setInput(newText);
    
    setTimeout(() => {
        el.focus();
        const newPos = start + text.length + cursorOffset;
        el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleBackspace = () => {
     const el = textareaRef.current;
     if (!el) {
         setInput(prev => prev.slice(0, -1));
         return;
     }
     const start = el.selectionStart;
     const end = el.selectionEnd;
     
     if (start === end && start > 0) {
         const newText = input.substring(0, start - 1) + input.substring(end);
         setInput(newText);
         setTimeout(() => {
             el.focus();
             el.setSelectionRange(start - 1, start - 1);
         }, 0);
     } else if (start !== end) {
         const newText = input.substring(0, start) + input.substring(end);
         setInput(newText);
         setTimeout(() => {
            el.focus();
            el.setSelectionRange(start, start);
         }, 0);
     }
  };

  // Keypad Definition
  const KeypadButton = ({ label, value, className, onClick }: { label: React.ReactNode, value?: string, className?: string, onClick?: () => void }) => (
      <button
        type="button"
        onClick={onClick ? onClick : () => insertText(value || String(label))}
        className={`rounded-lg text-sm sm:text-base font-medium transition-all active:scale-95 flex items-center justify-center shadow-sm border h-10 sm:h-12 ${className}`}
      >
          {label}
      </button>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-700/50 bg-emerald-50/50 dark:bg-emerald-900/10 shrink-0">
          <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                <Nu className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-lg leading-tight">Numerical Solver</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 flex flex-col">
            
            {/* Input Section */}
            <form onSubmit={handleSolve} className="relative mb-4 shrink-0">
                <div className="relative">
                    <textarea 
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type math... (e.g. 'mean(1,2,3)')"
                        className="w-full pl-4 pr-12 py-3 h-24 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all text-slate-900 dark:text-slate-100 font-mono text-lg resize-none"
                        spellCheck={false}
                    />
                    <button 
                        type="button"
                        onClick={() => setInput('')}
                        className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                        title="Clear Text"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </form>

            {/* Error & Result Display (Inline) */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg flex flex-col space-y-1 text-red-600 dark:text-red-400 text-xs sm:text-sm">
                    <div className="flex items-center space-x-2 font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Error</span>
                    </div>
                    <p className="font-mono break-all pl-6 opacity-90">{error}</p>
                </div>
            )}

            {result && !error && (
                <div className="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-emerald-100 dark:border-emerald-900/30 rounded-xl shadow-sm relative group animate-fade-in-up">
                    <div className="absolute top-2 right-2 flex items-center space-x-1">
                            {usedEngine && (
                                <div className="hidden sm:flex items-center px-1.5 py-0.5 rounded-md bg-white/50 dark:bg-black/20 border border-emerald-100 dark:border-emerald-900/20 mr-2">
                                    {usedEngine.includes('AI') ? (
                                        <Sparkles className="w-3 h-3 text-amber-500 mr-1" />
                                    ) : (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-1" />
                                    )}
                                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {usedEngine}
                                    </span>
                                </div>
                            )}
                            <button 
                            onClick={() => navigator.clipboard.writeText(result)}
                            className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md text-emerald-600 dark:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Copy Result"
                            >
                            <Copy className="w-3.5 h-3.5" />
                            </button>
                    </div>
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Result</p>
                    <div className="text-xl sm:text-2xl font-mono text-slate-900 dark:text-slate-100 break-words whitespace-pre-wrap">
                        {result}
                    </div>
                </div>
            )}

            {/* Custom Mathematical Keypad */}
            <div className="mt-auto grid grid-cols-6 gap-1.5 sm:gap-2 select-none">
                
                {/* Row 1: Trig + Constants */}
                <KeypadButton label="sin" value="sin(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="cos" value="cos(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="tan" value="tan(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="π" value="pi" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-serif" />
                <KeypadButton label="(" value="(" className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200" />
                <KeypadButton label=")" value=")" className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200" />

                {/* Row 2: Stats + Funcs */}
                <KeypadButton label="mean" value="mean(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 text-xs" />
                <KeypadButton label="std" value="std(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 text-xs" />
                <KeypadButton label="sqrt" value="sqrt(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 text-xs" />
                <KeypadButton label="e" value="e" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-serif" />
                <KeypadButton label="^" value="^" className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200" />
                <KeypadButton label="÷" value="/" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800" />

                {/* Row 3: 7-8-9 */}
                <KeypadButton label="log" value="log(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="ln" value="log(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="7" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="8" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="9" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="×" value="*" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800" />

                {/* Row 4: 4-5-6 */}
                <KeypadButton label="det" value="det(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="inv" value="inv(" className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300" />
                <KeypadButton label="4" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="5" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="6" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="−" value="-" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800" />

                {/* Row 5: 1-2-3 */}
                <KeypadButton label="[" value="[" className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200" />
                <KeypadButton label="]" value="]" className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200" />
                <KeypadButton label="1" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="2" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="3" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="+" value="+" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800" />

                {/* Row 6: 0 . Controls */}
                <KeypadButton label="ans" value="ans" className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800 font-bold text-xs uppercase" />
                <KeypadButton label="," value="," className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold" />
                <KeypadButton label="0" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold text-lg" />
                <KeypadButton label="." value="." className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold" />
                
                <KeypadButton 
                    label={<Delete className="w-5 h-5" />} 
                    onClick={handleBackspace}
                    className="bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border-red-100 dark:border-red-800/50" 
                />
                
                <KeypadButton 
                    label={isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-0.5" />} 
                    onClick={() => handleSolve()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-md shadow-emerald-500/20" 
                />

            </div>

            {/* Debug Toggle */}
            <div className="mt-2 flex justify-end">
                <button 
                    onClick={() => setShowDebug(!showDebug)} 
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
                >
                    <Terminal className="w-3 h-3" />
                    {showDebug ? 'Hide Logs' : 'Logs'}
                </button>
            </div>
            
            {showDebug && debugLog.length > 0 && (
                <div className="mt-2 p-3 bg-slate-100 dark:bg-black/30 rounded-lg text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-800 animate-fade-in">
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
