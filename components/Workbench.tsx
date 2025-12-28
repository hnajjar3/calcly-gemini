import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Save, Code, Terminal, Activity, ChevronRight, Edit2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import Plot from 'react-plotly.js';

interface WorkbenchProps {
  mode: 'symbolic' | 'numerical' | 'reasoning';
  onBack: () => void;
  geminiService: any;
}

export const Workbench: React.FC<WorkbenchProps> = ({ mode, onBack, geminiService }) => {
  const [input, setInput] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [output, setOutput] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [plotData, setPlotData] = useState<any>(null);
  const [plotLayout, setPlotLayout] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);

  const executeCode = async (code: string) => {
    setLogs([]);
    setPlotData(null);
    setPlotLayout(null);
    setError(null);
    setOutput(null);

    const customConsole = {
      log: (...args: any[]) => setLogs(prev => [...prev, args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')]),
      error: (...args: any[]) => setError(args.join(' '))
    };

    const plot = (data: any, layout: any) => {
       setPlotData(data);
       setPlotLayout(layout);
    };

    try {
      // Dynamic loading of libraries from CDN
      customConsole.log("Initializing engines...");

      let math: any, nerdamer: any, algebrite: any;

      if (mode === 'numerical') {
          // @ts-ignore
          math = (await import('https://esm.sh/mathjs@12.4.0')).default;
          customConsole.log("Math.js loaded.");
      }

      if (mode === 'symbolic') {
           // @ts-ignore
           nerdamer = (await import('https://esm.sh/nerdamer@1.1.13/all.min.js')).default;
           // @ts-ignore
           algebrite = (await import('https://esm.sh/algebrite@1.4.0')).default;
           customConsole.log("Symbolic engines loaded.");
      }

      customConsole.log("Executing...");

      // Create a function that has access to these variables
      const runUserCode = new Function(
          'console',
          'plot',
          'math',
          'nerdamer',
          'algebrite',
          `return (async () => {
             ${code}
           })()`
      );

      const result = await runUserCode(customConsole, plot, math, nerdamer, algebrite);

      if (result !== undefined) {
          setOutput(result);
      }
      customConsole.log("Execution complete.");

    } catch (err: any) {
      console.error(err);
      setError("Runtime Error: " + err.message);
    }
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    setError(null);
    setGeneratedCode(''); // Clear previous code to show loading state better

    try {
      const response = await geminiService.generateCode(input, mode);
      setGeneratedCode(response.code);
    } catch (err: any) {
      setError("Generation Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors group">
            <RotateCcw className="w-5 h-5 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold flex items-center gap-2">
              {mode === 'symbolic' && <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div>Symbolic Engine</span>}
              {mode === 'numerical' && <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Numerical Lab</span>}
              {mode === 'reasoning' && <span className="text-amber-600 dark:text-amber-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div>Reasoning Pro</span>}
            </h1>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Gemini 3.0 Powered</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
           <button className={`flex items-center space-x-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold tracking-wide transition-all shadow-lg hover:shadow-indigo-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
             onClick={() => executeCode(generatedCode)}
             disabled={!generatedCode}
           >
             <Play className="w-4 h-4 fill-current" />
             <span>RUN</span>
           </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Input & Code */}
        <div className="w-1/2 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">

          {/* Natural Language Input */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Problem Statement</label>
                <div className="text-xs text-slate-400">Natural Language supported</div>
            </div>
            <div className="relative group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === 'numerical' ? "e.g. Plot a 3D surface of z = sin(sqrt(x^2 + y^2))" : "e.g. Find the integral of x*sin(x) from 0 to pi"}
                className="w-full h-32 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none shadow-sm transition-all text-sm leading-relaxed font-medium"
              />
              <button
                onClick={handleGenerate}
                disabled={isProcessing || !input.trim()}
                className="absolute bottom-4 right-4 p-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg shadow-md hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed z-10"
                title="Generate Code"
              >
                {isProcessing ? <Activity className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Generated Code Editor */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e] relative">
             <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#3e3e42] text-slate-400 select-none">
               <div className="flex items-center space-x-2 text-xs font-mono">
                 <Code className="w-3.5 h-3.5 text-blue-400" />
                 <span>GENERATED_SCRIPT.JS</span>
               </div>
               <button onClick={() => setEditable(!editable)} className={`flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-[#3e3e42] transition-colors ${editable ? 'text-indigo-400 bg-[#3e3e42]' : 'text-slate-500'}`}>
                 <Edit2 className="w-3 h-3" />
                 <span className="text-[10px] uppercase font-bold">Edit</span>
               </button>
             </div>

             {isProcessing && (
                 <div className="absolute inset-0 z-20 bg-[#1e1e1e]/80 backdrop-blur-sm flex flex-col items-center justify-center text-slate-300">
                     <Activity className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                     <span className="text-xs font-mono animate-pulse">GENERATING_SOLUTION...</span>
                 </div>
             )}

             <textarea
               value={generatedCode}
               onChange={(e) => setEditable(true) && setGeneratedCode(e.target.value)}
               readOnly={!editable}
               className="flex-1 w-full p-4 bg-[#1e1e1e] text-slate-300 font-mono text-sm resize-none focus:outline-none leading-6"
               spellCheck={false}
               placeholder="// Generated code will appear here..."
             />
          </div>
        </div>

        {/* Right Panel: Output & Visualization */}
        <div className="w-1/2 flex flex-col bg-slate-100 dark:bg-slate-950">

           {/* Plot Area */}
           <div className="flex-1 p-4 flex items-center justify-center overflow-hidden relative">
             {plotData ? (
                <div className="w-full h-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-2 relative">
                    <Plot
                    data={plotData}
                    layout={{
                        ...plotLayout,
                        autosize: true,
                        paper_bgcolor: 'transparent',
                        plot_bgcolor: 'transparent',
                        font: { color: '#94a3b8' },
                        margin: { t: 40, r: 20, l: 40, b: 40 }
                    }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    />
                </div>
             ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 opacity-40">
                  <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-4">
                      <Activity className="w-10 h-10" />
                  </div>
                  <p className="font-medium text-sm">Visualization Output</p>
                </div>
             )}
           </div>

           {/* Console / Text Output */}
           <div className="h-1/3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                 <div className="flex items-center">
                    <Terminal className="w-4 h-4 text-slate-500 mr-2" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Console</span>
                 </div>
                 {output && <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full font-bold">SUCCESS</span>}
                 {error && <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">ERROR</span>}
              </div>
              <div className="flex-1 p-4 font-mono text-sm overflow-y-auto space-y-2 bg-[#1e1e1e] text-slate-300">
                 {logs.map((log, i) => (
                   <div key={i} className="break-words">
                     <span className="text-slate-500 mr-2">{'>'}</span>{log}
                   </div>
                 ))}
                 {output && (
                   <div className="text-emerald-400 font-bold border-t border-slate-700/50 pt-2 mt-2">
                     <span className="text-emerald-600 mr-2">{'='}</span>{output.toString()}
                   </div>
                 )}
                 {error && (
                   <div className="text-red-400 font-bold border-t border-red-900/30 pt-2 mt-2 flex items-start">
                     <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                     <span>{error}</span>
                   </div>
                 )}
                 {!error && !output && logs.length === 0 && (
                   <span className="text-slate-600 italic text-xs">Ready for input...</span>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
