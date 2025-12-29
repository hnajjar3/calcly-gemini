import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Terminal,
  Grid,
  Cpu,
  Moon,
  Sun,
  Save,
  FolderOpen,
  Image as ImageIcon,
  MessageSquare
} from 'lucide-react';
import { CodeEditor } from './components/CodeEditor';
import { CommandWindow } from './components/CommandWindow';
import { WorkspaceViewer } from './components/WorkspaceViewer';
import { PlotViewer } from './components/PlotViewer';
import { runtime, LogEntry, Variable, PlotData } from './lib/runtime';
import { generateCodeFromPrompt } from './services/geminiService';

const APP_NAME = "Calcly IDE";

const App: React.FC = () => {
  // State
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [code, setCode] = useState<string>('// Welcome to Calcly IDE\n// Type a request above or write code here.\n\nconst x = [];\nconst y = [];\nfor (let i = 0; i < 100; i++) {\n  x.push(i / 10);\n  y.push(Math.sin(i / 10) * Math.exp(-i/50));\n}\n\nplot([{x, y, type: "scatter", mode: "lines"}], {title: "Damped Sine Wave"});\n');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [plots, setPlots] = useState<PlotData[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<'workspace' | 'plots'>('plots');

  // Initialization
  useEffect(() => {
    document.documentElement.classList.add('dark');

    // Subscribe to runtime events
    runtime.setCallbacks(
      (plot) => {
        setPlots(prev => [...prev, plot]);
        setActiveRightTab('plots');
      },
      (log) => {
        setLogs(prev => [...prev, log]);
      },
      (vars) => {
        setVariables(vars);
      }
    );

    // Initial sync
    runtime.execute(''); // Just to trigger variable refresh if any
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return next;
    });
  };

  const handleRunCode = async () => {
    await runtime.execute(code);
  };

  const handleCommand = async (cmd: string) => {
    // Echo command
    setLogs(prev => [...prev, { id: Date.now().toString(), type: 'info', message: `> ${cmd}`, timestamp: Date.now() }]);
    await runtime.execute(cmd);
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsAiProcessing(true);
    try {
      const response = await generateCodeFromPrompt(aiPrompt, code);
      setCode(response.code);
      setLogs(prev => [...prev, { id: Date.now().toString(), type: 'info', message: `AI: ${response.explanation}`, timestamp: Date.now() }]);
    } catch (err: any) {
      setLogs(prev => [...prev, { id: Date.now().toString(), type: 'error', message: `AI Error: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col bg-slate-900 text-slate-100 font-sans overflow-hidden ${theme}`}>
      {/* Header */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center px-4 justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">{APP_NAME}</span>
        </div>

        {/* AI Input */}
        <form onSubmit={handleAiSubmit} className="flex-grow max-w-2xl mx-8 relative">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-lg opacity-25 group-focus-within:opacity-50 transition-opacity blur"></div>
            <div className="relative flex items-center bg-slate-900 border border-slate-600 rounded-lg overflow-hidden group-focus-within:border-indigo-500 transition-colors">
              <MessageSquare className="w-5 h-5 text-slate-400 ml-3" />
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Tell Calcly what to code... (e.g. 'Generate a 3D surface plot of z = x^2 + y^2')"
                className="w-full bg-transparent border-none px-3 py-2 text-sm focus:outline-none text-slate-200 placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={isAiProcessing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border-l border-slate-700 text-indigo-400 font-medium text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                {isAiProcessing ? 'Thinking...' : 'Generate'}
              </button>
            </div>
          </div>
        </form>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors" title="Save Script"><Save className="w-5 h-5" /></button>
          <button className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors" title="Open Script"><FolderOpen className="w-5 h-5" /></button>
          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-grow flex overflow-hidden">

        {/* Left Panel: Editor & Command Window */}
        <div className="flex-grow flex flex-col min-w-0">
          {/* Editor Area */}
          <div className="flex-grow relative h-2/3 min-h-[300px]">
            <CodeEditor
              code={code}
              onChange={(val) => setCode(val || '')}
              onRun={handleRunCode}
            />
          </div>

          {/* Command Window */}
          <div className="h-1/3 min-h-[150px] border-t border-slate-700 flex flex-col">
            <CommandWindow logs={logs} onExecute={handleCommand} />
          </div>
        </div>

        {/* Right Panel: Workspace & Plots */}
        <div className="w-[450px] shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col shadow-xl z-20">
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveRightTab('plots')}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'plots' ? 'bg-slate-700 text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:bg-slate-700/50'}`}
            >
              <Grid className="w-4 h-4" /> Plots
            </button>
            <button
              onClick={() => setActiveRightTab('workspace')}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'workspace' ? 'bg-slate-700 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:bg-slate-700/50'}`}
            >
              <Terminal className="w-4 h-4" /> Variables
            </button>
          </div>

          {/* Content */}
          <div className="flex-grow overflow-hidden relative bg-slate-900">
            {activeRightTab === 'plots' ? (
              <PlotViewer plots={plots} />
            ) : (
              <WorkspaceViewer variables={variables} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;
