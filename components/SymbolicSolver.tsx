import React, { useState } from 'react';
import { X, Sigma, ArrowRight, Play, RefreshCw, AlertTriangle } from 'lucide-react';
import { parseToNerdamer } from '../services/geminiService';
import { LatexRenderer } from './LatexRenderer';

declare const nerdamer: any;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SymbolicSolver: React.FC<Props> = ({ isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [parsedExpression, setParsedExpression] = useState('');
  const [resultLatex, setResultLatex] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSolve = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setParsedExpression('');
    setResultLatex('');

    try {
      // 1. Translate NL to Nerdamer syntax using Gemini
      const nerdamerExpr = await parseToNerdamer(input);
      setParsedExpression(nerdamerExpr);

      // 2. Execute locally using Nerdamer
      // nerdamer(expr).toTeX() returns the LaTeX string
      const result = nerdamer(nerdamerExpr).toTeX();
      
      // Also get the input in LaTeX for display
      const inputTeX = nerdamer(nerdamerExpr).text('latex');
      setParsedExpression(`$$${inputTeX}$$`);
      
      setResultLatex(`$$${result}$$`);
    } catch (err: any) {
      console.error("Symbolic Error:", err);
      setError("Could not parse or solve this expression. Please try rephrasing.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700/50 bg-indigo-50/50 dark:bg-indigo-900/10">
          <div className="flex items-center space-x-2 text-indigo-700 dark:text-indigo-400">
            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <Sigma className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-lg leading-tight">Symbolic Solver</h3>
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">Powered by Nerdamer & Gemini</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
            
            {/* Input Section */}
            <form onSubmit={handleSolve} className="mb-6 relative">
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                    Describe your math problem (Natural Language)
                </label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="e.g., Integrate x^2 * sin(x), Factor x^2-4..."
                        className="w-full pl-4 pr-14 py-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-slate-900 dark:text-slate-100"
                        autoFocus
                    />
                    <button 
                        type="submit"
                        disabled={!input.trim() || isProcessing}
                        className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                </div>
            </form>

            {/* Error State */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl flex items-center space-x-3 text-red-600 dark:text-red-400 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            {/* Results Area */}
            {(parsedExpression || resultLatex) && !error && (
                <div className="space-y-6 animate-fade-in-up">
                    
                    {/* Parsed Input */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Interpreted Expression</h4>
                        <div className="text-lg text-slate-700 dark:text-slate-300 overflow-x-auto">
                            <LatexRenderer content={parsedExpression} />
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center text-slate-300 dark:text-slate-600">
                        <ArrowRight className="w-6 h-6 rotate-90 sm:rotate-0" />
                    </div>

                    {/* Final Result */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-6 shadow-md">
                        <h4 className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">Computed Result</h4>
                        <div className="text-2xl sm:text-3xl text-slate-900 dark:text-slate-100 overflow-x-auto">
                            <LatexRenderer content={resultLatex} />
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};