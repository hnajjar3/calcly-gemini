
import React, { useState, useEffect, useRef } from 'react';
import { X, Sigma, ArrowRight, Play, RefreshCw, AlertTriangle, Calculator, Zap, Terminal, CheckCircle2, Sparkles, ExternalLink } from '../components/icons';
import { parseMathCommand, MathCommand, solveMathWithAI, validateMathResult } from '../services/geminiService';
import { LatexRenderer } from './LatexRenderer';

declare const nerdamer: any;

// Explicit list of operations supported by Nerdamer/Algebrite
// If the parser returns something else (e.g., 'fourierTransform'), we skip local engines and go to AI
const LOCAL_SUPPORTED_OPS = [
  'integrate', 'differentiate', 'solve', 'simplify', 
  'factor', 'limit', 'sum', 'evaluate', 
  'determinant', 'invert', 'taylor'
];

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
  }
  return n;
};

// Helper to convert array syntax [[1,2],[3,4]] to nerdamer "matrix([1,2],[3,4])"
const formatMatrixForNerdamer = (expr: string): string => {
  if (typeof expr !== 'string') return String(expr || '');
  const clean = expr.replace(/\s/g, '');
  if (clean.startsWith('[[')) {
    const inner = clean.substring(1, clean.length - 1);
    return `matrix(${inner})`;
  }
  return clean;
};

// Helper to convert array syntax [[1,2],[3,4]] to Algebrite syntax
const formatMatrixForAlgebrite = (expr: string): string => {
  if (typeof expr !== 'string') return String(expr || '');
  return expr.replace(/\s/g, '');
};

// Helper to round numbers in a string and format for LaTeX
const formatDecimalLatex = (str: string): string => {
  // 1. Round all float numbers to 4 decimal places
  let clean = str.replace(/(\d+\.\d+)/g, (match) => {
    return parseFloat(parseFloat(match).toFixed(4)).toString();
  });
  
  // 2. Remove multiplication asterisks (e.g. 2*i -> 2i)
  clean = clean.replace(/\*/g, '');

  // 3. Format Lists [a,b] -> \left[ a, \quad b \right]
  if (clean.startsWith('[') && clean.endsWith(']')) {
      const inner = clean.substring(1, clean.length - 1);
      // Split by comma, respecting nested brackets if any (naive split for simple lists)
      const parts = inner.split(',');
      const formattedParts = parts.map(p => p.trim());
      return `\\left[ ${formattedParts.join(',\\quad ')} \\right]`;
  }

  return clean;
};

// Custom formatter to turn string list [[1,2],[3,4]] into LaTeX bmatrix
const formatMatrixToLatex = (str: string): string => {
  if (typeof str !== 'string') return '';
  if (/^\[\s*\[[\s\S]*\]\s*\]$/.test(str)) {
    try {
      const inner = str.trim().slice(1, -1);
      const rows = inner.match(/\[.*?\]/g);
      if (rows && rows.length > 0) {
        const latexRows = rows.map(row => {
          const content = row.slice(1, -1);
          return content.split(',').map(val => {
              const cleaned = val.trim().replace(/\*/g, '');
              // Convert simple fractions
              if (/^-?\d+\/\d+$/.test(cleaned)) {
                  const [n, d] = cleaned.split('/').map(Number);
                  if (d !== 0) return parseFloat((n / d).toFixed(4)).toString();
              }
              // Attempt to eval scalar math
              try {
                 const f = parseFloat(cleaned);
                 if (!isNaN(f) && cleaned.includes('.')) {
                     return parseFloat(f.toFixed(4)).toString();
                 }
              } catch(e) {}
              return cleaned;
          }).join(' & ');
        });
        return `\\begin{bmatrix} ${latexRows.join(' \\\\ ')} \\end{bmatrix}`;
      }
    } catch (e) {}
  }
  return str;
};

// Helper to construct LHS LaTeX (Question part)
const constructLHSLatex = (cmd: MathCommand): string => {
  let expr = cmd.expression;
  
  // Try to format matrix
  const matrixParams = formatMatrixToLatex(expr);
  const displayExpr = matrixParams; 

  const valToTex = (v?: string) => {
    if (!v) return '';
    const l = v.toLowerCase();
    if (l === 'inf' || l === 'infinity') return '\\infty';
    if (l === '-inf' || l === '-infinity') return '-\\infty';
    if (l === 'pi') return '\\pi';
    return v;
  };

  switch (cmd.operation) {
      case 'limit':
          // Corrected LaTeX: removed double braces around variable
          return `\\lim_{${cmd.variable} \\to ${valToTex(cmd.end)}} ${displayExpr}`;
      case 'integrate':
          if (cmd.start && cmd.end) {
               return `\\int_{${valToTex(cmd.start)}}^{${valToTex(cmd.end)}} ${displayExpr} \\, d${cmd.variable}`;
          }
          return `\\int ${displayExpr} \\, d${cmd.variable}`;
      case 'differentiate':
          return `\\frac{d}{d${cmd.variable}} \\left( ${displayExpr} \\right)`;
      case 'sum':
          return `\\sum_{${cmd.variable}=${valToTex(cmd.start)}}^{${valToTex(cmd.end)}} ${displayExpr}`;
      case 'determinant':
          return `\\det ${displayExpr}`;
      case 'invert':
          return `\\left( ${displayExpr} \\right)^{-1}`;
      default:
           return displayExpr;
  }
};

// Normalization Helpers for Infinity/Constants
const toNerdamerVal = (val?: string) => {
  if (!val) return '';
  const v = val.toLowerCase();
  if (v === 'inf' || v === 'infinity' || v === 'forever') return 'Infinity';
  if (v === 'pi') return 'PI';
  if (v === 'e') return 'E';
  return val;
};

const toAlgebriteVal = (val?: string) => {
  if (!val) return '';
  const v = val.toLowerCase();
  if (v === 'infinity' || v === 'inf') return 'inf';
  // Algebrite often handles 'pi' and 'e' naturally, but lower case is safer for pi
  if (v === 'pi') return 'pi'; 
  return val;
};

// Helper to detect if the engine just echoed the command (didn't solve)
const isUnresolved = (output: string, operation: string): boolean => {
  if (!output) return true;
  const out = output.replace(/\s/g, '').toLowerCase();
  const op = operation.toLowerCase();

  // Keyword mapping of signatures that indicate "I just printed what you gave me"
  const keywords: Record<string, string[]> = {
    'integrate': ['int(', 'integrate(', 'defint('],
    'sum': ['sum('],
    'limit': ['limit('],
    'differentiate': ['diff(', 'd(', 'derivative('],
    'solve': ['solve(', 'roots('], // roots( is Algebrite
    'determinant': ['det(', 'determinant('],
    'invert': ['inv(', 'invert(']
  };

  const checks = keywords[op];
  if (checks) {
    for (const check of checks) {
      if (out.includes(check)) return true;
    }
  }
  
  return false;
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
  const [usedEngine, setUsedEngine] = useState<string | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<{ nerdamer: boolean, algebrite: boolean }>({ nerdamer: false, algebrite: false });
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  
  useEffect(() => {
    if (!isOpen) return;

    let attempts = 0;
    const maxAttempts = 30; 
    
    const checkLibraries = () => {
      const nCheck = !!getNerdamer();
      const aCheck = !!getAlgebrite();
      setLibraryStatus({ nerdamer: nCheck, algebrite: aCheck });
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

  /**
   * LOCAL SANITY CHECK
   * Extremely basic check to see if the engine crashed or returned explicit error strings.
   * Semantic verification is now done by AI.
   */
  const quickSanityCheck = (result: string): { isValid: boolean; reason?: string } => {
    if (!result) return { isValid: false, reason: "Empty result" };
    
    // Check for specific hard Error Strings from libraries
    const errorKeywords = ["Stop", "nil", "cannot solve", "Division by zero", "Invalid argument", "parse error"];
    for (const err of errorKeywords) {
        if (result.includes(err)) {
            return { isValid: false, reason: `Engine returned error: '${err}'` };
        }
    }

    // Heuristic: Is the result 'undefined' or 'null' string?
    if (result === 'undefined' || result === 'null') {
        return { isValid: false, reason: "Result is undefined/null" };
    }

    return { isValid: true };
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

    const nCheck = !!getNerdamer();
    const aCheck = !!getAlgebrite();
    setLibraryStatus({ nerdamer: nCheck, algebrite: aCheck });

    try {
      // 1. PARSE PHASE
      addLog("Parsing natural language with Gemini (Pro)...");
      const command = await parseMathCommand(input);
      setParsedCommand(command);
      addLog(`Parsed Command: ${JSON.stringify(command)}`);

      const { operation, expression, variable = 'x', start, end } = command;
      let finalLatex = '';
      let engineName = '';
      let solved = false;

      // --- EXECUTION STRATEGIES ---

      const runNerdamer = (): { latex: string; decimal?: string } | null => {
        const NerdamerEngine = getNerdamer();
        if (!NerdamerEngine) {
            addLog("Nerdamer library not loaded.");
            return null;
        }
        
        try {
            if (NerdamerEngine.flush) NerdamerEngine.flush();

            let nerdString = '';
            // Construct Nerdamer specific syntax
            switch (operation) {
              case 'integrate':
                if (start !== undefined && end !== undefined) {
                  nerdString = `defint(${expression}, ${toNerdamerVal(start)}, ${toNerdamerVal(end)}, ${variable})`;
                } else {
                  nerdString = `integrate(${expression}, ${variable})`;
                }
                break;
              case 'differentiate':
                nerdString = `diff(${expression}, ${variable})`;
                break;
              case 'solve':
                if (expression.includes(',') || expression.includes('=')) {
                    const eqParam = (expression.startsWith('[') || !expression.includes(',')) ? expression : `[${expression}]`;
                    nerdString = `solveEquations(${eqParam})`;
                } else {
                    nerdString = `solve(${expression}, ${variable})`;
                }
                break;
              case 'sum':
                 nerdString = `sum(${expression}, ${variable}, ${toNerdamerVal(start) || '0'}, ${toNerdamerVal(end) || '10'})`;
                 break;
              case 'limit':
                 // limit(expr, var, val)
                 nerdString = `limit(${expression}, ${variable}, ${toNerdamerVal(end) || 'Infinity'})`;
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
                 nerdString = `taylor(${expression}, ${variable}, ${toNerdamerVal(end) || '4'}, ${toNerdamerVal(start) || '0'})`;
                 break;
              case 'simplify':
              case 'evaluate':
              default:
                 nerdString = expression;
                 break;
            }

            addLog(`Nerdamer execution: ${nerdString}`);
            const obj = NerdamerEngine(nerdString);
            
            // Fix for exp(t): Only evaluate if explicit 'evaluate' op, otherwise keep symbolic 
            const resultObj = (operation === 'evaluate') ? obj.evaluate() : obj;
            const resultString = resultObj.text();
            addLog(`Nerdamer raw output: ${resultString}`);

            // Quick Local Sanity Check
            const sanity = quickSanityCheck(resultString);
            if (!sanity.isValid) {
                 addLog(`Nerdamer sanity check failed: ${sanity.reason}`);
                 return null;
            }

            // Echo Detection: Did it solve it?
            if (isUnresolved(resultString, operation)) {
                addLog(`Nerdamer returned unresolved expression (Echoed): ${resultString}`);
                return null;
            }

            // Formatting
            let latexOut = '';
            let decimalText = '';
            try { 
                // Force decimal evaluation for potential use
                decimalText = resultObj.evaluate().text('decimals'); 
            } catch(e) {}
            
            let useDecimalAsPrimary = (operation === 'evaluate');
            
            if (useDecimalAsPrimary && decimalText) {
                latexOut = formatDecimalLatex(decimalText);
            } else {
                 if (resultString.startsWith('[') && resultString.includes('.')) {
                    latexOut = formatDecimalLatex(resultString);
                } else {
                     latexOut = resultObj.toTeX();
                }
            }
            return { latex: latexOut, decimal: decimalText };

        } catch (nerdError: any) {
            addLog(`Nerdamer exception: ${nerdError.message}`);
            return null;
        }
      };

      const runAlgebrite = (): { latex: string; decimal?: string } | null => {
         const AlgebriteEngine = getAlgebrite();
         if (!AlgebriteEngine) {
             addLog("Algebrite library not loaded.");
             return null;
         }
         
         try {
              let algString = '';
              switch (operation) {
                case 'integrate':
                  if (start !== undefined && end !== undefined) {
                      algString = `defint(${expression},${variable},${toAlgebriteVal(start)},${toAlgebriteVal(end)})`;
                  } else {
                      algString = variable === 'x' ? `integral(${expression})` : `integral(${expression},${variable})`;
                  }
                  break;
                case 'differentiate':
                  algString = `d(${expression},${variable})`;
                  break;
                case 'solve':
                   if (expression.includes(',')) algString = `roots(${expression})`; 
                   else algString = `roots(${expression},${variable})`;
                   break;
                case 'sum': 
                   algString = `sum(${expression},${variable},${toAlgebriteVal(start)},${toAlgebriteVal(end)})`; 
                   break;
                case 'limit':
                   // Algebrite doesn't have a direct 'limit' function exposed as nicely as others sometimes,
                   // or it might rely on simplification. But Algebrite documentation mentions 'limit' is not fully supported in all versions.
                   // However, often integral/defint handles limits. 
                   // If algebrite fails, we naturally fallback to AI, which is good.
                   // Let's try to support it if it exists or pass expression to simplify
                   algString = `limit(${expression},${variable},${toAlgebriteVal(end)})`;
                   break;
                case 'factor': algString = `factor(${expression})`; break;
                case 'simplify': algString = `simplify(${expression})`; break;
                case 'determinant': algString = `det(${formatMatrixForAlgebrite(expression)})`; break;
                case 'invert': algString = `inv(${formatMatrixForAlgebrite(expression)})`; break;
                case 'taylor': algString = `taylor(${expression},${variable},${toAlgebriteVal(start) || '0'},${toAlgebriteVal(end) || '4'})`; break;
                default: algString = expression;
              }

              addLog(`Algebrite execution: ${algString}`);
              const res = AlgebriteEngine.run(algString);
              addLog(`Algebrite raw output: ${res}`);
              
              const sanity = quickSanityCheck(res);
              if (!sanity.isValid) {
                  addLog(`Algebrite sanity check failed: ${sanity.reason}`);
                  return null;
              }

              // Echo Detection
              if (isUnresolved(res, operation)) {
                addLog(`Algebrite returned unresolved expression (Echoed): ${res}`);
                return null;
              }

              // Formatting logic
              let decimalRes = '';
              try { 
                  const d = AlgebriteEngine.run(`float(${res})`); 
                  if (!d.includes("Stop")) decimalRes = d;
              } catch(e) {}
              
              let latexOut = '';
              if (decimalRes && (operation === 'evaluate' || (decimalRes.startsWith('[') || /^-?\d*\.?\d+(e[-+]?\d+)?$/.test(decimalRes)) && !res.includes('...'))) {
                  latexOut = formatDecimalLatex(decimalRes);
              } else if (/^\[\s*\[/.test(res)) {
                  latexOut = formatMatrixToLatex(res);
              } else {
                  const NerdamerEngine = getNerdamer();
                  if (NerdamerEngine) {
                     try { latexOut = NerdamerEngine(res).toTeX(); } catch(nErr) { latexOut = res.replace(/\*/g, ''); }
                  } else {
                     latexOut = res.replace(/\*/g, '');
                  }
              }

              return { latex: latexOut, decimal: decimalRes };

            } catch (algError: any) {
              addLog(`Algebrite exception: ${algError.message}`);
              return null;
            }
      };

      // 2. PIPELINE EXECUTION LOOP
      const isSupportedLocally = LOCAL_SUPPORTED_OPS.includes(operation);
      const pipeline: Array<{ name: string; run: () => { latex: string; decimal?: string } | null }> = [];

      if (isSupportedLocally) {
          if (command.preferredEngine === 'algebrite') {
              pipeline.push({ name: 'Algebrite', run: runAlgebrite });
              pipeline.push({ name: 'Nerdamer', run: runNerdamer });
          } else {
              pipeline.push({ name: 'Nerdamer', run: runNerdamer });
              pipeline.push({ name: 'Algebrite', run: runAlgebrite });
          }
      } else {
          addLog(`Operation '${operation}' not supported locally. Skipping to AI.`);
      }

      // 3. EXECUTE PIPELINE WITH AI VALIDATION
      for (const step of pipeline) {
          addLog(`Attempting Engine: ${step.name}`);
          const output = step.run();
          
          if (output) {
              const { latex, decimal } = output;
              // --- AI CLOSED LOOP VERIFICATION ---
              addLog(`Verifying ${step.name} result with AI Judge...`);
              const verification = await validateMathResult(input, latex);
              
              if (verification.isValid) {
                  finalLatex = latex;
                  
                  // UGLY FRACTION CHECK
                  // If the latex result contains very long integers (10+ digits), swap to decimal if available
                  // This prevents showing 11258999... / 11258999...
                  if (decimal && /\d{10,}/.test(latex) && !latex.includes('.')) {
                       let niceDecimal = decimal;
                       try {
                           const f = parseFloat(decimal);
                           if (!isNaN(f)) {
                               // Use scientific notation for very large/small numbers
                               if (Math.abs(f) > 1e9 || (Math.abs(f) < 1e-4 && Math.abs(f) > 0)) {
                                   const exp = f.toExponential(4);
                                   const [b, e] = exp.split('e');
                                   niceDecimal = `${b} \\times 10^{${parseInt(e)}}`;
                               } else {
                                   // Otherwise 6 decimal places is plenty for presentation
                                   niceDecimal = parseFloat(f.toFixed(6)).toString();
                               }
                           }
                       } catch(e) {}
                       finalLatex = niceDecimal;
                  }

                  if (decimal) setDecimalResult(decimal);

                  engineName = step.name;
                  solved = true;
                  addLog(`✅ AI Judge Verified. Reason: ${verification.reason || 'Valid'}`);
                  break; 
              } else {
                  addLog(`❌ AI Judge Rejected. Reason: ${verification.reason}`);
                  // Proceed to next engine
              }
          }
      }

      // 4. FALLBACK TO AI (The "Last Resort")
      if (!solved) {
         addLog("⚠️ Local engines failed validation or support. Initiating AI Fallback...");
         try {
             // We pass the raw input to let AI re-interpret if our parsing was wrong
             const aiResult = await solveMathWithAI(input);
             
             if (aiResult && aiResult.length > 0) {
                 if (aiResult.toLowerCase().includes("no solution") || aiResult.includes("I cannot")) {
                     throw new Error("AI could not solve the problem.");
                 }

                 finalLatex = aiResult;
                 setUsedEngine('Gemini Pro (AI)');
                 addLog(`✅ Solved by AI Fallback. Result: ${aiResult.substring(0, 50)}...`);
                 solved = true;
             } else {
                 throw new Error("Empty response from AI.");
             }
         } catch (aiErr: any) {
             addLog(`❌ AI Fallback failed: ${aiErr.message}`);
             setError("Could not solve this problem. Please check the syntax or try rephrasing.");
         }
      } else {
          setUsedEngine(engineName);
      }

      // 5. FINALIZE
      if (solved) {
        finalLatex = finalLatex.replace(/\\text{([^}]*)}/g, '$1');
        
        // Remove existing delimiters from RHS to cleanly merge
        let cleanRhs = finalLatex.trim();
        if (cleanRhs.startsWith('$$')) cleanRhs = cleanRhs.slice(2, -2);
        else if (cleanRhs.startsWith('$')) cleanRhs = cleanRhs.slice(1, -1);
        
        // Construct LHS (Question)
        const lhs = constructLHSLatex(command);
        
        // Determine separator
        const separator = command.operation === 'solve' ? '\\implies' : '=';
        
        // Final Equation
        setResultLatex(`$$ ${lhs} ${separator} ${cleanRhs} $$`);
      } else {
        if (!error) setError("Unable to solve. The query might be ambiguous or unsupported.");
      }

    } catch (err: any) {
      addLog(`Fatal Error: ${err.message}`);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExplain = () => {
    if (!resultLatex) return;
    
    // Construct a query for the main AI app
    const cleanResult = resultLatex.replace(/\$\$/g, '').trim();
    const query = `Explain the step-by-step solution for: ${input}. The result is: ${cleanResult}`;
    
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('mode', 'pro');
    
    // Direct navigation to root with params, ensuring no subpaths or UUIDs persist
    window.location.href = `/?${params.toString()}`;
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
                                {usedEngine.includes('AI') ? (
                                    <Sparkles className="w-3 h-3 text-amber-500 mr-1.5" />
                                ) : (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-1.5" />
                                )}
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
                    
                    {/* Explain Button - Redirects to Main App */}
                    <button 
                        onClick={handleExplain}
                        className="w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-lg flex items-center justify-center transition-colors shadow-sm"
                        title="Open comprehensive explanation in main window"
                    >
                        <ExternalLink className="w-3 h-3 mr-2" />
                        Explain Solution in Detail
                    </button>

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
