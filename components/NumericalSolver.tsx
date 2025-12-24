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

  // Reliable Math.js Initialization
  useEffect(() => {
    const initMath = () => {
        if (typeof math !== 'undefined') {
            const integrateImpl = (expr: any, v: any, start: any, end: any) => {
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
            };

            const derivImpl = (expr: any, v: any, point: any) => {
                     const expression = String(expr);
                     const variable = String(v);
                     const val = Number(point);
                     const h = 1e-7;
                     const f_x_plus_h = math.evaluate(expression, { [variable]: val + h });
                     const f_x_minus_h = math.evaluate(expression, { [variable]: val - h });
                     return (f_x_plus_h - f_x_minus_h) / (2 * h);
            };

            // Inject methods into global math instance
            math.import({
                integrate: integrateImpl,
                integral: integrateImpl,
                deriv: derivImpl,
                derivative: derivImpl,
                diff: derivImpl
            }, { override: true });
            
            console.log("[NumericalSolver] Math.js functions registered successfully.");
        } else {
            console.warn("[NumericalSolver] math.js not found, retrying...");
            setTimeout(initMath, 500);
        }
    };
    initMath();
  }, []);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = `[${timestamp}] ${msg}`;
    console.log(`[NumericalSolver] ${msg}`);
    setDebugLog(prev => [...prev, logEntry]);
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

    addLog(`🚀 Starting numerical solve for: "${queryToUse}"`);

    try {
      if (typeof math === 'undefined') {
          addLog("❌ Math.js not loaded.");
          throw new Error("Numerical engine (Math.js) is not available.");
      }

      addLog("🤖 AI Parsing: Translating to Math.js syntax...");
      let parsedExpression = await parseNumericalExpression(queryToUse);
      addLog(`✅ Parsed Expression: "${parsedExpression}"`);
      
      setInterpretedQuery(parsedExpression === 'UNSUPPORTED_OPERATION' ? queryToUse : parsedExpression);
      
      let finalResult = '';
      let engine = '';

      if (parsedExpression !== 'UNSUPPORTED_OPERATION') {
          addLog("⚙️ Math.js Execution: Evaluating expression in local scope...");
          try {
             const res = math.evaluate(parsedExpression, scope);
             const formatted = math.format(res, { precision: 14 });
             addLog(`📄 Math.js Output: "${formatted}"`);
             
             addLog("⚖️ AI Validation: Verifying numerical accuracy...");
             const validation = await validateMathResult(queryToUse, formatted);
             addLog(`🧐 Validation Result: ${validation.isValid ? 'VALID' : 'INVALID'}`);
             
             if (validation.isValid) {
                 finalResult = formatted;
                 engine = 'Math.js';
             } else {
                 addLog(`⚠️ Local result invalidated: ${validation.reason}`);
             }
          } catch (e: any) {
              addLog(`❌ Math.js Error: ${e.message}`);
          }
      }

      if (!finalResult) {
          addLog(`🔮 Falling back to Gemini AI for computation...`);
          const aiRes = await solveNumericalWithAI(queryToUse);
          if (aiRes && !aiRes.toLowerCase().includes('error')) {
              addLog(`✅ AI Solver returned: "${aiRes}"`);
              finalResult = aiRes;
              engine = 'Gemini (AI)';
              setInterpretedQuery(queryToUse);
          } else {
              addLog(`❌ AI Solver fallback failed.`);
              throw new Error("Unable to compute numerical result.");
          }
      }

      setResult(finalResult);
      setUsedEngine(engine);
      addLog(`🎊 Successfully solved by ${engine}.`);

      try {
          addLog("💾 Updating scope 'ans' with latest result...");
          const scopeVal = math.evaluate(finalResult);
          setScope((prev: any) => ({ ...prev, ans: scopeVal }));
      } catch (e) {
          addLog(`⚠️ Could not update result to scope.`);
      }
    } catch (err: any) {
      addLog(`💥 CRITICAL ERROR: ${err.message}`);
      setError(err.message || "An error occurred during numerical compute.");
    } finally {
      setIsProcessing(false);
      addLog(`🏁 Pipeline finished.`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700/50 bg-amber-50/50 dark:bg-amber-900/10">
          <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-400">
            <div className="p-1.5 bg-amber-100 dark:bg-amber-900/50 rounded-lg"><Nu className="w-5 h-5" /></div>
            <div>
                <h3 className="font-bold text-lg leading-tight">Numerical Solver</h3>
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">Deterministic Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            {/* Input Form */}
            <form onSubmit={handleSolve} className="mb-6">
                <div className="relative group">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter numerical query (e.g., Integrate x^2 from 0 to 1)"
                        className="w-full p-4 pr-14 min-h-[100px] rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all resize-none font-medium"
                    />
                    <button 
                        type="submit" 
                        disabled={!input.trim() || isProcessing}
                        className="absolute right-3 bottom-3 p-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-xl shadow-lg shadow-amber-600/20 transition-all active:scale-95 flex items-center justify-center"
                    >
                        {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                </div>
            </form>

            {/* Quick Suggestions */}
            {!result && !error && !isProcessing && (
                <div className="mb-8">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Examples</p>
                    <div className="flex flex-wrap gap-2">
                        {SAMPLE_PROMPTS.map((p, i) => (
                            <button 
                                key={i} 
                                onClick={() => { setInput(p); setTimeout(() => handleSolve(), 10); }}
                                className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:border-amber-400 dark:hover:border-amber-600 hover:text-amber-600 transition-all shadow-sm flex items-center group"
                            >
                                <Sparkles className="w-3 h-3 mr-1.5 opacity-50 group-hover:opacity-100" />
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 text-red-600 dark:text-red-400 rounded-2xl flex items-start space-x-3 animate-fade-in">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold mb-1">Compute Error</p>
                        <p className="opacity-80">{error}</p>
                    </div>
                </div>
            )}

            {/* Result Display */}
            {result && !error && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="bg-gradient-to-br from-amber-50 to-white dark:from-slate-800 dark:to-slate-800/50 rounded-2xl p-6 shadow-md border border-amber-100/50 dark:border-slate-700 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                            <Calculator className="w-24 h-24" />
                        </div>
                        
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest">Calculated Result</h4>
                                {usedEngine && (
                                    <div className="flex items-center px-2 py-1 rounded-md bg-white/50 dark:bg-slate-900/50 border border-amber-100 dark:border-slate-700 text-[10px] font-semibold text-slate-500">
                                        <CheckCircle2 className="w-3 h-3 mr-1.5 text-amber-500" />
                                        Solved by {usedEngine}
                                    </div>
                                )}
                            </div>
                            
                            {interpretedQuery && (
                                <div className="text-xs text-slate-400 dark:text-slate-500 mb-2 font-mono truncate">
                                    Expression: {interpretedQuery}
                                </div>
                            )}
                            
                            <div className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 break-all mb-4">
                                {result}
                            </div>

                            <div className="flex items-center space-x-3 pt-4 border-t border-amber-100/50 dark:border-slate-700">
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(result) }}
                                    className="flex items-center text-[10px] font-bold text-slate-500 hover:text-amber-600 transition-colors"
                                >
                                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                                    COPY RESULT
                                </button>
                                <button 
                                    onClick={() => { 
                                        const q = `Explain step-by-step: ${input}. The numerical result is ${result}.`;
                                        window.location.href = `/?q=${encodeURIComponent(q)}&mode=pro&auto=true`;
                                    }}
                                    className="flex items-center text-[10px] font-bold text-slate-500 hover:text-amber-600 transition-colors"
                                >
                                    <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                                    FULL ANALYSIS
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button onClick={() => { setInput(''); setResult(null); setError(null); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center transition-colors">
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                            CLEAR AND START OVER
                        </button>
                    </div>
                </div>
            )}

            {/* Debug Logs */}
            <div className="mt-8 flex justify-between items-center px-1">
                <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>Scope: ans = {scope.ans}</span>
                </div>
                <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className="text-[10px] text-slate-400 font-mono hover:text-slate-600 transition-colors flex items-center"
                >
                    <Terminal className="w-3 h-3 mr-1" />
                    {showDebug ? 'HIDE PIPELINE LOGS' : 'VIEW PIPELINE LOGS'}
                </button>
            </div>

            {showDebug && debugLog.length > 0 && (
                <div className="mt-3 p-4 bg-slate-100 dark:bg-black/30 rounded-xl text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-48 border border-slate-200 dark:border-slate-800 custom-scrollbar animate-fade-in">
                    {debugLog.map((log, i) => (
                        <div key={i} className="mb-1 border-b border-slate-200/50 dark:border-slate-800 last:border-0 py-1">
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