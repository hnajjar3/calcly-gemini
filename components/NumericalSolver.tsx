
import React, { useState, useEffect, useRef } from 'react';
import { X, Nu, Play, RefreshCw, AlertTriangle, Terminal, Trash2, Copy, CheckCircle2, Share2, Check } from '../components/icons';
import { parseNumericalExpression } from '../services/geminiService';

declare const math: any;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const NumericalSolver: React.FC<Props> = ({ isOpen, onClose, initialQuery }) => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<any>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isCopiedLink, setIsCopiedLink] = useState(false);
  
  const hasAutoRunRef = useRef(false);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => document.getElementById('num-input')?.focus(), 100);
    } else {
        hasAutoRunRef.current = false;
    }
  }, [isOpen]);

  // Handle Initial Query Auto-Run
  useEffect(() => {
      if (isOpen && initialQuery && !hasAutoRunRef.current) {
          setInput(initialQuery);
          hasAutoRunRef.current = true;
          executeSolve(initialQuery);
      }
  }, [isOpen, initialQuery]);

  const addLog = (msg: string) => {
    console.log(`[Numerical] ${msg}`);
    setDebugLog(prev => [...prev, msg]);
  };

  const handleShare = () => {
    const url = `${window.location.origin}/?tool=numerical&q=${encodeURIComponent(input)}`;
    navigator.clipboard.writeText(url);
    setIsCopiedLink(true);
    setTimeout(() => setIsCopiedLink(false), 2000);
  };

  const executeSolve = async (queryToSolve: string) => {
    if (!queryToSolve.trim()) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setDebugLog([]); // Clear logs on new run

    try {
      if (typeof math === 'undefined') {
        throw new Error("Math.js library not loaded.");
      }

      addLog(`User Input: "${queryToSolve}"`);
      
      // 1. Natural Language Parsing
      addLog("Parsing natural language with Gemini 2.5 Flash...");
      let parsedExpression = queryToSolve;
      try {
          parsedExpression = await parseNumericalExpression(queryToSolve);
      } catch (geminiError: any) {
          addLog(`Gemini parsing failed: ${geminiError.message}. Using raw input.`);
      }
      
      if (parsedExpression !== queryToSolve) {
        addLog(`Transformed to Math.js Syntax: "${parsedExpression}"`);
      } else {
         addLog(`Expression used as-is: "${parsedExpression}"`);
      }

      addLog(`Current Variable Scope: [${Object.keys(scope).join(', ')}]`);

      // 2. Execution
      // math.evaluate can return various types (number, matrix, unit, etc.)
      addLog("Executing math.evaluate()...");
      const res = math.evaluate(parsedExpression, scope);
      
      // Determine type
      let type = 'unknown';
      try { type = math.typeof(res); } catch(e) {}
      addLog(`Result Type: ${type}`);

      // Log raw value safely
      let rawValStr = String(res);
      try {
          if (typeof res === 'object') rawValStr = JSON.stringify(res);
      } catch (e) {
          rawValStr = '[Complex Object]';
      }
      if (rawValStr.length > 100) rawValStr = rawValStr.substring(0, 100) + '...';
      addLog(`Raw Value: ${rawValStr}`);
      
      // Update scope log if variables changed
      const newKeys = Object.keys(scope);
      if (newKeys.length > 0) {
          addLog(`Updated Scope Variables: ${newKeys.join(', ')}`);
      }
      
      addLog("Formatting result with precision 14...");
      const formatted = math.format(res, { precision: 14 });
      addLog(`Final Output: ${formatted}`);

      setResult(formatted);
      
    } catch (err: any) {
      const errMsg = err.message || "Calculation Error";
      addLog(`Error: ${errMsg}`);
      setError(errMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      executeSolve(input);
  }

  const clearAll = () => {
    setInput('');
    setResult(null);
    setError(null);
    setScope({});
    setDebugLog([]);
    addLog("Scope cleared.");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700/50 bg-emerald-50/50 dark:bg-emerald-900/10">
          <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                <Nu className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-lg leading-tight">Numerical Solver</h3>
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                   Powered by Math.js + Gemini
                </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
                  onClick={handleShare}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 relative"
                  title="Share Direct Link"
              >
                  {isCopiedLink ? <Check className="w-5 h-5 text-emerald-500" /> : <Share2 className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
                <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            
            {/* Examples / Help Text */}
            <div className="mb-4 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
               <p className="font-semibold mb-1">Try natural language or expressions:</p>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono opacity-80">
                  <span>"Mean of 1, 2, 3, 4"</span>
                  <span>"Convert 5 cm to inch"</span>
                  <span>"Determinant of [[1,2],[3,4]]"</span>
                  <span>"sin(45 deg) ^ 2"</span>
                  <span>"set a = 10, then a * 2"</span>
                  <span>"1.2 * (2 + 4.5)"</span>
               </div>
            </div>

            {/* Input Section */}
            <form onSubmit={handleSubmit} className="mb-6 relative">
                <div className="relative">
                    <textarea 
                        id="num-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter math problem (e.g. 'average of 10, 20, 30')..."
                        className="w-full pl-4 pr-14 py-4 h-32 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all text-slate-900 dark:text-slate-100 font-mono text-sm resize-none"
                        spellCheck={false}
                        autoFocus={!initialQuery}
                    />
                    <div className="absolute right-2 bottom-2 flex flex-col space-y-2">
                        <button 
                            type="button"
                            onClick={clearAll}
                            className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg transition-colors"
                            title="Clear Input & Scope"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <button 
                            type="submit"
                            disabled={!input.trim() || isProcessing}
                            className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/20"
                        >
                            {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-0.5" />}
                        </button>
                    </div>
                </div>
            </form>

            {/* Error State */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl flex flex-col space-y-2 text-red-600 dark:text-red-400 text-sm animate-fade-in-up">
                    <div className="flex items-center space-x-3 font-semibold">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p>Calculation Error</p>
                    </div>
                    <p className="pl-8 opacity-90 font-mono">{error}</p>
                    <button 
                        onClick={() => setShowDebug(!showDebug)} 
                        className="pl-8 text-xs underline opacity-70 hover:opacity-100 text-left"
                    >
                        {showDebug ? "Hide Details" : "Show Technical Details"}
                    </button>
                </div>
            )}

            {/* Result Area */}
            {result && !error && (
                <div className="animate-fade-in-up space-y-6">
                     <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-6 shadow-md relative group">
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => navigator.clipboard.writeText(result)}
                               className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md text-emerald-600 dark:text-emerald-400 transition-colors"
                               title="Copy Result"
                             >
                               <Copy className="w-4 h-4" />
                             </button>
                        </div>

                        <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center">
                            <CheckCircle2 className="w-3 h-3 mr-1.5" />
                            Result
                        </h4>
                        
                        <div className="text-xl sm:text-2xl font-mono text-slate-900 dark:text-slate-100 break-words whitespace-pre-wrap">
                            {result}
                        </div>
                    </div>
                </div>
            )}

            {/* Debug Log (Collapsible) */}
            {(debugLog.length > 0) && (
                <div className="mt-8">
                     <button 
                        onClick={() => setShowDebug(!showDebug)}
                        className="flex items-center space-x-2 text-xs font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                     >
                        <Terminal className="w-3 h-3" />
                        <span>{showDebug ? 'Hide Debug Logs' : 'Show Debug Logs'}</span>
                     </button>
                     
                     {showDebug && (
                         <div className="mt-3 p-4 bg-slate-100 dark:bg-black/30 rounded-lg text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800">
                            {debugLog.map((log, i) => (
                                <div key={i} className="mb-1 border-b border-slate-200/50 dark:border-slate-700/50 pb-1 last:border-0 last:pb-0">
                                    <span className="opacity-50 mr-2">[{i + 1}]</span>
                                    {log}
                                </div>
                            ))}
                         </div>
                     )}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
