
import React, { useState, useEffect, useRef } from 'react';
import { X, Sigma, ArrowRight, Play, RefreshCw, AlertTriangle, Calculator, Zap, Terminal, CheckCircle2 } from 'lucide-react';
import { parseMathCommand, MathCommand } from '../services/geminiService';
import { LatexRenderer } from './LatexRenderer';

declare const nerdamer: any;

// Helper to safely access Algebrite from window object
const getAlgebrite = () => {
  // @ts-ignore
  return window.Algebrite || (window as any).algebrite;
};

// Helper to check nerdamer presence
const getNerdamer = () => {
  // @ts-ignore
  const n = (typeof nerdamer !== 'undefined' ? nerdamer : undefined) || (window as any).nerdamer;
  // Check if plugins are loaded (e.g. solveEquations exists) to ensure full library
  if (n && !n.solveEquations) {
      // Core might be loaded but plugins missing, treat as missing/partial for safety if needed
      // but usually core has 'solve'. solveEquations comes from Algebra plugin.
      // We will try to use it anyway but aware it might be partial.
  }
  return n;
};

// Helper to convert array syntax [[1,2],[3,4]] to nerdamer "matrix([1,2],[3,4])"
const formatMatrixForNerdamer = (expr: string): string => {
  const clean = expr.replace(/\s/g, '');
  if (clean.startsWith('[[')) {
    // Basic regex transform: [[a,b],[c,d]] -> matrix([a,b],[c,d])
    // Remove outer brackets first
    const inner = clean.substring(1, clean.length - 1);
    return `matrix(${inner})`;
  }
  return clean;
};

// Helper to convert array syntax [[1,2],[3,4]] to Algebrite syntax
const formatMatrixForAlgebrite = (expr: string): string => {
  // Algebrite accepts square brackets: [[1,2],[3,4]]
  return expr.replace(/\s/g, '');
};

// Custom formatter to turn string list [[1,2],[3,4]] into LaTeX bmatrix
const formatMatrixToLatex = (str: string): string => {
  // Check for pattern [[...],[...]]
  // Allow spaces, fractions, negative numbers
  if (/^\[\s*\[.*\]\s*\]$/.test(str)) {
    try {
      // Extract inner content: [1,2],[3,4]
      const inner = str.trim().slice(1, -1);
      
      // Match individual rows: [1,2] or [1/2, 3]
      const rows = inner.match(/\[.*?\]/g);
      
      if (rows && rows.length > 0) {
        const latexRows = rows.map(row => {
          // Remove brackets [ ... ]
          const content = row.slice(1, -1);
          // Split by comma
          return content.split(',').map(val => {
              const cleaned = val.trim().replace(/\*/g, '');
              // Convert simple fractions a/b to \frac{a}{b}
              if (/^-?\d+\/\d+$/.test(cleaned)) {
                  const [n, d] = cleaned.split('/');
                  return `\\frac{${n}}{${d}}`;
              }
              return cleaned;
          }).join(' & ');
        });
        
        return `\\begin{bmatrix} ${latexRows.join(' \\\\ ')} \\end{bmatrix}`;
      }
    } catch (e) {
      // console.log("Matrix parsing failed", e);
    }
  }
  return str;
};

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
  const [libraryStatus, setLibraryStatus] = useState<{ nerdamer: boolean, algebrite: boolean }>({ nerdamer: false, algebrite: false });
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Poll for libraries on mount/open
  useEffect(() => {
    if (!isOpen) return;

    let attempts = 0;
    const maxAttempts = 25; // Try for ~5 seconds
    
    const checkLibraries = () => {
      const nCheck = !!getNerdamer();
      const aCheck = !!getAlgebrite();
      
      setLibraryStatus({ nerdamer: nCheck, algebrite: aCheck });

      // Continue polling if either is missing
      if ((!nCheck || !aCheck) && attempts < maxAttempts) {
        attempts++;
        setTimeout(checkLibraries, 200);
      }
    };

    checkLibraries();
  }, [isOpen]);

  const addLog = (msg: string) => {
    console.log(`[Solver] ${msg}`);
    setDebugLog(prev => [...prev, msg]);
  };

  const handleSolve = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setParsedCommand(null);
    setResultLatex('');
    setDecimalResult(null);
    setUsedEngine(null);
    setDebugLog([]);

    // Final check for libraries right before execution
    const nCheck = !!getNerdamer();
    const aCheck = !!getAlgebrite();
    setLibraryStatus({ nerdamer: nCheck, algebrite: aCheck });

    try {
      // 1. Get Structured Command from Gemini
      addLog("Parsing natural language with Gemini...");
      const command = await parseMathCommand(input);
      setParsedCommand(command);
      addLog(`Parsed Command: ${JSON.stringify(command)}`);

      const { operation, expression, variable = 'x', start, end } = command;
      let solved = false;
      let finalLatex = '';

      // --- ENGINE 1: Nerdamer (Primary - Good Latex) ---
      const NerdamerEngine = getNerdamer();
      try {
        if (!NerdamerEngine) {
            addLog("Nerdamer library not found. Skipping.");
            throw new Error("Nerdamer not loaded");
        }
        
        // Reset nerdamer state if possible
        if (NerdamerEngine.flush) NerdamerEngine.flush();

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
            // Check for system of equations (comma separated)
            if (expression.includes(',')) {
               nerdString = `solveEquations([${expression}])`;
            } else {
               nerdString = `solve(${expression}, ${variable})`;
            }
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
          case 'determinant':
             nerdString = `determinant(${formatMatrixForNerdamer(expression)})`;
             break;
          case 'invert':
             nerdString = `invert(${formatMatrixForNerdamer(expression)})`;
             break;
          case 'taylor':
             // taylor(expr, var, terms, center) -> terms is index/order
             // Note: nerdamer.taylor arguments are (expression, variable, terms, center)
             // Default order to 4 if not provided
             nerdString = `taylor(${expression}, ${variable}, ${end || '4'}, ${start || '0'})`;
             break;
          case 'simplify':
          case 'evaluate':
          default:
             nerdString = expression;
             break;
        }

        addLog(`Nerdamer execution: ${nerdString}`);
        const obj = NerdamerEngine(nerdString);
        const evaluated = obj.evaluate();
        
        const resultString = evaluated.text();
        addLog(`Nerdamer output: ${resultString}`);

        // FAILURE DETECTION
        // If the result specifically contains keywords indicating it echoed the command (e.g., 'integrate(...)'), it failed.
        const failKeywords = ['integrate', 'defint', 'sum', 'limit', 'determinant', 'invert', 'taylor'];
        const isFailure = 
            (operation !== 'evaluate') && 
            failKeywords.some(kw => resultString.includes(kw) && resultString.includes('('));
        
        if (isFailure) {
             throw new Error(`Nerdamer returned input (unsolved): ${resultString}`);
        }

        finalLatex = evaluated.toTeX();
        setUsedEngine('Nerdamer');
        solved = true;

        try {
           const dec = evaluated.text('decimals');
           if (dec && !isNaN(parseFloat(dec)) && dec.length < 20) {
               setDecimalResult(dec);
           }
        } catch(e) {}

      } catch (nerdError: any) {
        addLog(`Nerdamer failed: ${nerdError.message}`);
      }

      // --- ENGINE 2: Algebrite (Fallback - Robust CAS) ---
      if (!solved) {
         const AlgebriteEngine = getAlgebrite();
         
         if (!AlgebriteEngine) {
             addLog("Algebrite library not loaded or failed to load. Skipping.");
         } else {
            try {
              let algString = '';
              // Algebrite syntax mapping
              switch (operation) {
                case 'integrate':
                  if (start !== undefined && end !== undefined) {
                    algString = `defint(${expression},${variable},${start},${end})`;
                  } else {
                    // Simpler syntax often works better for Algebrite
                    if (variable === 'x') {
                         algString = `integral(${expression})`;
                    } else {
                         algString = `integral(${expression},${variable})`;
                    }
                  }
                  break;
                case 'differentiate':
                  algString = `d(${expression},${variable})`;
                  break;
                case 'solve':
                   if (expression.includes(',')) {
                      // Algebrite isn't great at systems in simplified mode, but we can try roots for simple cases
                      // Or just let it fail to show error
                      algString = `roots(${expression})`; 
                   } else {
                      algString = `roots(${expression},${variable})`;
                   }
                   break;
                case 'sum':
                   algString = `sum(${expression},${variable},${start},${end})`;
                   break;
                case 'factor':
                   algString = `factor(${expression})`;
                   break;
                case 'simplify':
                   algString = `simplify(${expression})`;
                   break;
                case 'determinant':
                   // Algebrite uses det()
                   algString = `det(${formatMatrixForAlgebrite(expression)})`;
                   break;
                case 'invert':
                   // Algebrite uses inv()
                   algString = `inv(${formatMatrixForAlgebrite(expression)})`;
                   break;
                case 'taylor':
                   // taylor(f,x,center,terms)
                   algString = `taylor(${expression},${variable},${start || '0'},${end || '4'})`;
                   break;
                default:
                   algString = expression;
              }

              addLog(`Algebrite execution: ${algString}`);
              const res = AlgebriteEngine.run(algString);
              addLog(`Algebrite output: ${res}`);
              
              if (!res || res.startsWith("Stop") || res.includes("Stop") || res === 'nil') {
                throw new Error(`Algebrite returned error: ${res}`);
              }
              
              // MATRIX DISPLAY FIX: 
              // Algebrite often returns [[a,b],[c,d]]. Detect this and convert to LaTeX matrix
              if (/^\[\s*\[/.test(res)) {
                   finalLatex = formatMatrixToLatex(res);
                   addLog(`Formatted Matrix LaTeX: ${finalLatex}`);
              } else {
                   // Convert standard ASCII result to LaTeX
                   try {
                       // Try to use nerdamer to format the output of Algebrite if available
                       if (NerdamerEngine) {
                          try {
                              // Sometimes Algebrite output is simple enough for Nerdamer to parse and TeXify
                              finalLatex = NerdamerEngine(res).toTeX();
                          } catch(nErr) {
                               finalLatex = res.replace(/\*/g, '');
                          }
                       } else {
                          finalLatex = res.replace(/\*/g, '');
                       }
                   } catch (e) {
                       finalLatex = res.replace(/\*/g, ''); 
                   }
              }

              setUsedEngine('Algebrite');
              solved = true;
              
              try {
                 // Algebrite float evaluation
                 const val = AlgebriteEngine.run(`float(${res})`);
                 if (val && !isNaN(parseFloat(val))) {
                   setDecimalResult(val);
                 }
              } catch(e) {}

            } catch (algError: any) {
              addLog(`Algebrite failed: ${algError.message}`);
            }
         }
      }

      if (solved) {
        // Cleanup LaTeX: remove \text{} wrappers that Algebrite/Nerdamer sometimes add which fail in KaTeX
        finalLatex = finalLatex.replace(/\\text{([^}]*)}/g, '$1');
        
        setResultLatex(finalLatex.startsWith('$$') ? finalLatex : `$$${finalLatex}$$`);
      } else {
        throw new Error("Unable to solve symbolically with available engines.");
      }

    } catch (err: any) {
      addLog(`Fatal Error: ${err.message}`);
      setError(err.message || "Could not parse or solve this expression.");
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
                   Pure Math Engine • Local Execution
                </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            
            {/* Library Status Warning - Only show if both missing AND we've finished checking */}
            {(!libraryStatus.nerdamer && !libraryStatus.algebrite) && (
                <div className="mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-lg flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                   <span className="flex items-center">
                      <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                      Loading Math Libraries...
                   </span>
                </div>
            )}

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
                        placeholder="e.g., Determinant of [[1,2],[3,4]]"
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
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl flex flex-col space-y-2 text-red-600 dark:text-red-400 text-sm">
                    <div className="flex items-center space-x-3 font-semibold">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p>Symbolic Error</p>
                    </div>
                    <p className="pl-8 opacity-90">{error}</p>
                    <button 
                        onClick={() => setShowDebug(!showDebug)} 
                        className="pl-8 text-xs underline opacity-70 hover:opacity-100 text-left"
                    >
                        {showDebug ? "Hide Details" : "Show Technical Details"}
                    </button>
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
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-6 shadow-md relative group">
                         {usedEngine && (
                            <div className="absolute top-3 right-3 flex items-center px-2 py-1 rounded-md bg-white/50 dark:bg-black/20 border border-indigo-100 dark:border-indigo-900/20">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-1.5" />
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
