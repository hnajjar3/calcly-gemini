import React, { useState } from 'react';
import { X, Sigma, ArrowRight, Play, RefreshCw, AlertTriangle, Calculator, Zap } from 'lucide-react';
import { parseMathCommand, MathCommand } from '../services/geminiService';
import { LatexRenderer } from './LatexRenderer';

declare const nerdamer: any;
declare const Algebrite: any;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SymbolicSolver: React.FC<Props> = ({ isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [parsedCommand, setParsedCommand] = useState<MathCommand | null>(null);
  const [resultLatex, setResultLatex] = useState('');
  const [decimalResult, setDecimalResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedEngine, setUsedEngine] = useState<'Nerdamer' | 'Algebrite' | null>(null);

  const handleSolve = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setParsedCommand(null);
    setResultLatex('');
    setDecimalResult(null);
    setUsedEngine(null);

    try {
      // 1. Get Structured Command from Gemini
      const command = await parseMathCommand(input);
      setParsedCommand(command);

      const { operation, expression, variable = 'x', start, end } = command;
      let solved = false;
      let finalLatex = '';

      // --- ENGINE 1: Nerdamer (Primary - Good Latex) ---
      try {
        let nerdString = '';
        
        switch (operation) {
          case 'integrate':
            if (start !== undefined && end !== undefined) {
              nerdString = `defint(${expression}, ${start}, ${end}, ${variable})`;
            } else {
              nerdString = `integrate(${expression}, ${variable})`;
            }
            break;
          case 'differentiate':
            nerdString = `diff(${expression}, ${variable})`;
            break;
          case 'solve':
            nerdString = `solve(${expression}, ${variable})`;
            break;
          case 'sum':
             nerdString = `sum(${expression}, ${variable}, ${start || '0'}, ${end || '10'})`;
             break;
          case 'limit':
             nerdString = `limit(${expression}, ${variable}, ${end || 'Infinity'})`;
             break;
          case 'factor':
             nerdString = `factor(${expression})`;
             break;
          case 'simplify':
          case 'evaluate':
          default:
             nerdString = expression;
             break;
        }

        const obj = nerdamer(nerdString);
        // If it's a symbolic op, we might need to evaluate to get the reduced form
        const evaluated = obj.evaluate();
        
        // Check if Nerdamer actually did something useful
        const resultString = evaluated.text();
        const inputString = obj.text();

        // Heuristic: If output == input and it wasn't a simple evaluate, it likely failed to solve
        if (operation !== 'evaluate' && resultString === inputString && operation !== 'solve') {
           throw new Error("Nerdamer returned input");
        }
        
        // If it's a summation/integral and the result still contains 'sum' or 'integral', it failed
        if ((operation === 'sum' && resultString.includes('sum')) || 
            (operation === 'integrate' && (resultString.includes('defint') || resultString.includes('integrate')))) {
             throw new Error("Nerdamer could not converge");
        }

        finalLatex = evaluated.toTeX();
        setUsedEngine('Nerdamer');
        solved = true;

        // Try decimal if applicable
        try {
           const dec = evaluated.text('decimals');
           if (dec && !isNaN(parseFloat(dec)) && dec.length < 20) {
               setDecimalResult(dec);
           }
        } catch(e) {}

      } catch (nerdError) {
        console.warn("Nerdamer failed, trying Algebrite...", nerdError);
      }

      // --- ENGINE 2: Algebrite (Fallback - Robust CAS) ---
      if (!solved) {
         try {
           let algString = '';
           // Algebrite syntax mapping
           switch (operation) {
             case 'integrate':
               if (start !== undefined && end !== undefined) {
                 algString = `defint(${expression},${variable},${start},${end})`;
               } else {
                 // Algebrite typically uses 'integral' for indefinite
                 algString = `integral(${expression},${variable})`;
               }
               break;
             case 'differentiate':
               algString = `d(${expression},${variable})`;
               break;
             case 'solve':
                algString = `roots(${expression},${variable})`;
                break;
             case 'sum':
                // Algebrite sum syntax: sum(expr,Var,start,end)
                algString = `sum(${expression},${variable},${start},${end})`;
                break;
             case 'factor':
                algString = `factor(${expression})`;
                break;
             case 'simplify':
                algString = `simplify(${expression})`;
                break;
             default:
                algString = expression;
           }

           // Algebrite returns a string (e.g. "sin(x)") or "Stop: ..." on error
           const res = Algebrite.run(algString);
           
           if (!res || res.startsWith("Stop")) {
             throw new Error(`Algebrite returned error: ${res}`);
           }
           
           // Convert Algebrite (ASCII/Text) result to LaTeX using Nerdamer's parser if possible, 
           // or fallback to basic string
           try {
              finalLatex = nerdamer(res).toTeX();
           } catch (e) {
              // If Nerdamer can't parse the Algebrite result, just show it as text
              // wrap in $$ to trigger display mode in renderer (though it might be plain text)
              finalLatex = `\\text{${res}}`; 
           }

           setUsedEngine('Algebrite');
           solved = true;
           
           // Try to get float value from Algebrite result
           try {
              const val = Algebrite.run(`float(${res})`);
              if (val && !isNaN(parseFloat(val))) {
                setDecimalResult(val);
              }
           } catch(e) {}

         } catch (algError) {
           console.error("Algebrite failed:", algError);
         }
      }

      if (solved) {
        setResultLatex(finalLatex.startsWith('$$') ? finalLatex : `$$${finalLatex}$$`);
      } else {
        throw new Error("Unable to solve symbolically with available engines.");
      }

    } catch (err: any) {
      console.error("Symbolic Error:", err);
      setError("Could not parse or solve this expression. The problem might be beyond the capabilities of the current symbolic engine.");
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
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                   Pure Math Engine • No Hallucinations
                </p>
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
                        placeholder="e.g., Integrate sin(x) from 0 to pi"
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
            {(parsedCommand || resultLatex) && !error && (
                <div className="space-y-6 animate-fade-in-up">
                    
                    {/* Interpreted Command */}
                    {parsedCommand && (
                        <div className="flex items-center space-x-4">
                            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700"></div>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                                {parsedCommand.operation.toUpperCase()} • {parsedCommand.variable}
                            </span>
                            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700"></div>
                        </div>
                    )}

                    {/* Final Result */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-6 shadow-md relative">
                         {usedEngine && (
                            <div className="absolute top-3 right-3 flex items-center px-2 py-1 rounded-md bg-white/50 dark:bg-black/20 border border-indigo-100 dark:border-indigo-900/20">
                                <Zap className="w-3 h-3 text-amber-500 mr-1.5" />
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                   Solved by {usedEngine}
                                </span>
                            </div>
                        )}

                        <h4 className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">Computed Result</h4>
                        
                        {/* Symbolic Result */}
                        <div className="text-2xl sm:text-3xl text-slate-900 dark:text-slate-100 overflow-x-auto mb-3">
                            <LatexRenderer content={resultLatex} />
                        </div>

                        {/* Decimal Approximation if available */}
                        {decimalResult && (
                           <div className="flex items-center space-x-2 pt-3 border-t border-indigo-100 dark:border-indigo-900/30 text-slate-500 dark:text-slate-400 text-sm">
                              <Calculator className="w-4 h-4" />
                              <span className="font-mono">≈ {decimalResult}</span>
                           </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};