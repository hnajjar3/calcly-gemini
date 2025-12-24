// Add missing React import
import React, { useState, useEffect, useRef } from 'react';
import { X, Sigma, Play, RefreshCw, AlertTriangle, Terminal, ExternalLink } from '../components/icons';
import { parseMathCommand, MathCommand, solveMathWithAI, validateMathResult } from '../services/geminiService';
import { LatexRenderer, formatMatrixToLatex } from './LatexRenderer';

declare const nerdamer: any;

const LOCAL_SUPPORTED_OPS = [
  'integrate', 'integral', 'integration', 
  'diff', 'differentiate', 'differentiation', 'derivative', 
  'solve', 'simplify', 'expand',
  'factor', 'limit', 'sum', 'evaluate', 
  'determinant', 'invert', 'taylor'
];

const getAlgebrite = () => (window as any).Algebrite || (window as any).algebrite;
const getNerdamer = () => (typeof nerdamer !== 'undefined' ? nerdamer : undefined) || (window as any).nerdamer;

const formatMatrixForNerdamer = (expr: string): string => {
  if (typeof expr !== 'string') return String(expr || '');
  const clean = expr.replace(/\s/g, '');
  if (clean.startsWith('[[')) {
    const inner = clean.substring(1, clean.length - 1);
    return `matrix(${inner})`;
  }
  return clean;
};

const formatMatrixForAlgebrite = (expr: string): string => typeof expr !== 'string' ? String(expr || '') : expr.replace(/\s/g, '');

// Canonicalize AI tokens to Library Tokens
const getCanonicalOp = (op: string): string => {
    const o = op.toLowerCase().trim();
    if (['integrate', 'integral', 'integration'].includes(o)) return 'integrate';
    if (['diff', 'differentiate', 'differentiation', 'derivative'].includes(o)) return 'diff';
    if (['simplify', 'expand'].includes(o)) return 'simplify';
    return o;
};

const constructLHSLatex = (cmd: MathCommand): string => {
  let expr = cmd.expression;
  const displayExpr = formatMatrixToLatex(expr) || expr; 
  const valToTex = (v?: string | null) => {
    if (!v) return '';
    const l = String(v).toLowerCase();
    if (l === 'inf' || l === 'infinity') return '\\infty';
    if (l === '-inf' || l === '-infinity') return '-\\infty';
    if (l === 'pi') return '\\pi';
    return String(v);
  };

  const op = getCanonicalOp(cmd.operation);

  switch (op) {
      case 'limit': return `\\lim_{${cmd.variable} \\to ${valToTex(cmd.end)}} ${displayExpr}`;
      case 'integrate': 
          const isDefinite = cmd.start != null && cmd.end != null;
          return isDefinite ? `\\int_{${valToTex(cmd.start)}}^{${valToTex(cmd.end)}} ${displayExpr} \\, d${cmd.variable}` : `\\int ${displayExpr} \\, d${cmd.variable}`;
      case 'diff':
          return `\\frac{d}{d${cmd.variable}} \\left( ${displayExpr} \\right)`;
      case 'sum': return `\\sum_{${cmd.variable}=${valToTex(cmd.start)}}^{${valToTex(cmd.end)}} ${displayExpr}`;
      case 'determinant': return `\\det ${displayExpr}`;
      case 'invert': return `\\left( ${displayExpr} \\right)^{-1}`;
      default: return displayExpr;
  }
};

const toNerdamerVal = (val?: string | null) => {
  if (val == null || val === '') return '';
  const v = String(val).toLowerCase();
  if (v === 'inf' || v === 'infinity' || v === 'forever') return 'Infinity';
  if (v === 'pi') return 'PI';
  if (v === 'e') return 'E';
  return String(val);
};

const toAlgebriteVal = (val?: string | null) => {
  if (val == null || val === '') return '';
  const v = String(val).toLowerCase();
  if (v === 'infinity' || v === 'inf') return 'inf';
  if (v === 'pi') return 'pi'; 
  return String(val);
};

const isUnresolved = (output: string, operation: string): boolean => {
  if (!output) return true;
  const out = output.replace(/\s/g, '').toLowerCase();
  const op = getCanonicalOp(operation);
  const keywords: Record<string, string[]> = {
    'integrate': ['int(', 'integrate(', 'defint('],
    'sum': ['sum('],
    'limit': ['limit('],
    'diff': ['diff(', 'd(', 'derivative('],
    'solve': ['solve(', 'roots('],
    'determinant': ['det(', 'determinant('],
    'invert': ['inv(', 'invert(']
  };
  const checks = keywords[op];
  if (checks) { for (const check of checks) { if (out.includes(check)) return true; } }
  return false;
};

interface Props {
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
}

export const SymbolicSolver: React.FC<Props> = ({ isOpen, initialQuery, onClose }) => {
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
  
  const hasAutoRun = useRef(false);
  const initialQueryHandled = useRef(false);

  useEffect(() => {
    if (isOpen) {
        if (initialQuery && !initialQueryHandled.current) {
            setInput(initialQuery);
            initialQueryHandled.current = true;
        }
        
        const params = new URLSearchParams(window.location.search);
        if (params.get('auto') === 'true' && !hasAutoRun.current) {
            hasAutoRun.current = true;
            const queryToSolve = initialQuery || params.get('q');
            if (queryToSolve) {
                setTimeout(() => handleSolve(undefined, queryToSolve), 500);
            }
        }
    } else {
        hasAutoRun.current = false;
        initialQueryHandled.current = false;
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    let attempts = 0;
    const checkLibraries = () => {
      const nCheck = !!getNerdamer();
      const aCheck = !!getAlgebrite();
      setLibraryStatus({ nerdamer: nCheck, algebrite: aCheck });
      if ((!nCheck || !aCheck) && attempts < 30) { attempts++; setTimeout(checkLibraries, 200); }
    };
    checkLibraries();
  }, [isOpen]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = `[${timestamp}] ${msg}`;
    console.log(`[SymbolicSolver] ${msg}`);
    setDebugLog(prev => [...prev, logEntry]);
  };

  const handleSolve = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const queryToUse = overrideQuery || input || initialQuery;
    if (!queryToUse || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setParsedCommand(null);
    setResultLatex('');
    setDecimalResult(null);
    setUsedEngine(null);
    setDebugLog([]);

    addLog(`🚀 Starting symbolic solve for: "${queryToUse}"`);

    try {
      addLog("🤖 AI Parsing: Converting natural language to command...");
      const command = await parseMathCommand(queryToUse);
      setParsedCommand(command);
      addLog(`✅ Parsed Command: ${JSON.stringify(command)}`);

      const { operation: rawOp, expression, variable = 'x', start, end } = command;
      const operation = getCanonicalOp(rawOp);
      addLog(`🧐 Canonical Operation: "${operation}"`);
      
      let finalLatex = '';
      let engineName = '';
      let solved = false;

      const runNerdamer = () => {
        const NerdamerEngine = getNerdamer();
        if (!NerdamerEngine) return null;
        try {
            let nerdString = '';
            switch (operation) {
              case 'integrate': 
                nerdString = (start != null && end != null) 
                  ? `defint(${expression}, ${toNerdamerVal(start)}, ${toNerdamerVal(end)}, ${variable})` 
                  : `integrate(${expression}, ${variable})`; 
                break;
              case 'diff':
                nerdString = `diff(${expression}, ${variable})`; break;
              case 'solve': nerdString = (expression.includes(',') || expression.includes('=')) ? `solveEquations(${(expression.startsWith('[') || !expression.includes(',')) ? expression : `[${expression}]`})` : `solve(${expression}, ${variable})`; break;
              case 'sum': 
                nerdString = `sum(${expression}, ${variable}, ${toNerdamerVal(start) || '0'}, ${toNerdamerVal(end) || '10'})`; 
                break;
              case 'limit': nerdString = `limit(${expression}, ${variable}, ${toNerdamerVal(end) || 'Infinity'})`; break;
              case 'factor': nerdString = `factor(${expression})`; break;
              case 'determinant': nerdString = `determinant(${formatMatrixForNerdamer(expression)})`; break;
              case 'invert': nerdString = `invert(${formatMatrixForNerdamer(expression)})`; break;
              case 'taylor': nerdString = `taylor(${expression}, ${variable}, ${toNerdamerVal(end) || '4'}, ${toNerdamerVal(start) || '0'})`; break;
              case 'simplify': nerdString = `simplify(${expression})`; break;
              default: nerdString = expression; break;
            }
            addLog(`⚙️ Nerdamer Execution: "${nerdString}"`);
            const obj = (operation === 'evaluate') ? NerdamerEngine(nerdString).evaluate() : NerdamerEngine(nerdString);
            const resultString = obj.text();
            addLog(`📄 Nerdamer Output: "${resultString}"`);
            if (isUnresolved(resultString, operation)) return null;
            let dec = ''; try { dec = obj.evaluate().text('decimals'); } catch(e) {}
            return { latex: obj.toTeX(), decimal: dec };
        } catch (e: any) { return null; }
      };

      const runAlgebrite = () => {
         const AlgebriteEngine = getAlgebrite();
         if (!AlgebriteEngine) return null;
         try {
              let algString = '';
              switch (operation) {
                case 'integrate': 
                  algString = (start != null && end != null) 
                    ? `defint(${expression},${variable},${toAlgebriteVal(start)},${toAlgebriteVal(end)})` 
                    : (variable === 'x' ? `integral(${expression})` : `integral(${expression},${variable})`); 
                  break;
                case 'diff':
                  algString = `d(${expression},${variable})`; break;
                case 'solve': algString = expression.includes(',') ? `roots(${expression})` : `roots(${expression},${variable})`; break;
                case 'sum': 
                   algString = `sum(${expression},${variable},${toAlgebriteVal(start)},${toAlgebriteVal(end)})`; 
                   break;
                case 'limit': algString = `limit(${expression},${variable},${toAlgebriteVal(end)})`; break;
                case 'factor': algString = `factor(${expression})`; break;
                case 'determinant': algString = `det(${formatMatrixForAlgebrite(expression)})`; break;
                case 'invert': algString = `inv(${formatMatrixForAlgebrite(expression)})`; break;
                case 'taylor': algString = `taylor(${expression},${variable},${toAlgebriteVal(start) || '0'},${toAlgebriteVal(end) || '4'})`; break;
                case 'simplify': algString = `simplify(${expression})`; break;
                default: algString = expression;
              }
              addLog(`⚙️ Algebrite Execution: "${algString}"`);
              const res = AlgebriteEngine.run(algString);
              addLog(`📄 Algebrite Output: "${res}"`);
              if (isUnresolved(res, operation)) return null;
              let dec = ''; try { dec = AlgebriteEngine.run(`float(${res})`); } catch(e) {}
              let latex = '';
              try { 
                // Attempt to convert Algebrite matrix string to Nerdamer/LaTeX
                if (res.includes('[[')) {
                  latex = formatMatrixToLatex(res);
                } else {
                  latex = getNerdamer()(res).toTeX(); 
                }
              } catch(e) { 
                latex = res.replace(/\*/g, ''); 
              }
              return { latex, decimal: dec };
            } catch (e: any) { return null; }
      };

      const isLocalSupported = LOCAL_SUPPORTED_OPS.includes(rawOp.toLowerCase()) || LOCAL_SUPPORTED_OPS.includes(operation);
      const pipeline = isLocalSupported ? (command.preferredEngine === 'algebrite' ? [{name:'Algebrite', run:runAlgebrite}, {name:'Nerdamer', run:runNerdamer}] : [{name:'Nerdamer', run:runNerdamer}, {name:'Algebrite', run:runAlgebrite}]) : [];

      for (const step of pipeline) {
          addLog(`🏃 Attempting engine: ${step.name}`);
          const output = step.run();
          if (output) {
              const { latex } = output;
              addLog(`⚖️ AI Validation: Verifying local result...`);
              const verification = await validateMathResult(queryToUse, latex);
              addLog(`🧐 Validation: ${verification.isValid ? 'ACCEPTED' : 'REJECTED'}${verification.reason ? ` (${verification.reason})` : ''}`);
              
              if (verification.isValid) {
                  finalLatex = latex;
                  if (output.decimal) setDecimalResult(output.decimal);
                  engineName = step.name; 
                  solved = true; 
                  break; 
              }
          }
      }

      if (!solved) {
         addLog(`🔮 Falling back to Gemini AI for pure symbolic logic...`);
         const aiResult = await solveMathWithAI(queryToUse);
         if (aiResult) { 
             finalLatex = aiResult; 
             setUsedEngine('Gemini (AI Solver)'); 
             solved = true; 
         } else {
             setError("Unable to resolve equation.");
         }
      } else { 
          setUsedEngine(engineName); 
      }

      if (solved) {
        // Ensure the finalLatex is processed for matrix formatting if it's still raw nested arrays
        const displayResult = finalLatex.includes('[[') ? formatMatrixToLatex(finalLatex) : finalLatex.replace(/\\text{([^}]*)}/g, '$1').trim();
        setResultLatex(`$$ ${constructLHSLatex(command)} ${operation === 'solve' ? '\\implies' : '='} ${displayResult} $$`);
      }
    } catch (err: any) { 
        setError(err.message || "An error occurred."); 
    } finally { 
        setIsProcessing(false); 
    }
  };

  const handleExplain = () => {
    if (!resultLatex) return;
    const query = `Explain the step-by-step solution for: ${input || initialQuery}. The result is: ${resultLatex.replace(/\$\$/g, '').trim()}`;
    window.location.href = `/?q=${encodeURIComponent(query)}&mode=pro&auto=true`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700/50 bg-indigo-50/50 dark:bg-indigo-900/10">
          <div className="flex items-center space-x-2 text-indigo-700 dark:text-indigo-400">
            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg"><Sigma className="w-5 h-5" /></div>
            <div><h3 className="font-bold text-lg leading-tight">Symbolic Solver</h3><p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">Pure Math Engine</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <form onSubmit={(e) => handleSolve(e)} className="mb-6 relative">
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Math query</label>
                <div className="relative">
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g., Integrate x^2" className="w-full pl-4 pr-14 py-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none" autoFocus />
                    <button type="submit" disabled={(!input.trim() && !initialQuery) || isProcessing} className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center">{isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-0.5" />}</button>
                </div>
            </form>
            {error && <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 text-red-600 rounded-xl flex items-center space-x-3"><AlertTriangle className="w-5 h-5 shrink-0" /><p>{error}</p></div>}
            {resultLatex && !error && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 rounded-xl p-6 shadow-md relative">
                         {usedEngine && <div className="absolute top-4 right-4 flex items-center px-2 py-1 rounded-md bg-white/50 border border-indigo-100 text-[10px] font-semibold text-slate-500"><span className="mr-1.5">{usedEngine.includes('AI') ? '✨' : '✅'}</span>Solved by {usedEngine}</div>}
                        <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3">Result</h4>
                        <div className="text-2xl sm:text-3xl text-slate-900 dark:text-slate-100 overflow-x-auto mb-3"><LatexRenderer content={resultLatex} /></div>
                        {decimalResult && <div className="flex items-center space-x-2 pt-3 border-t border-indigo-100 text-slate-500 text-sm font-mono">≈ {decimalResult}</div>}
                    </div>
                    <button onClick={handleExplain} className="w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 text-xs font-semibold rounded-lg flex items-center justify-center transition-colors"><ExternalLink className="w-3 h-3 mr-2" />Explain Solution</button>
                </div>
            )}
            <div className="mt-8 flex justify-end"><button onClick={() => setShowDebug(!showDebug)} className="text-[10px] text-slate-400 font-mono hover:text-slate-600 transition-colors"><Terminal className="w-3 h-3 inline mr-1" />{showDebug ? 'Hide Logs' : 'Logs'}</button></div>
            {showDebug && debugLog.length > 0 && <div className="mt-3 p-4 bg-slate-100 dark:bg-black/30 rounded-lg text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-48 border border-slate-200">{debugLog.map((log, i) => <div key={i} className="mb-1 border-b last:border-0 py-1">{log}</div>)}</div>}
        </div>
      </div>
    </div>
  );
};