import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Grid,
  Cpu,
  Moon,
  Sun,
  Save,
  FolderOpen,
  FileCode,
  Calculator,
  Sigma,
  Sparkles,
  BookOpen, // For Report Icon
  Printer   // For Publish Icon
} from 'lucide-react';
import { CodeEditor } from './components/CodeEditor';
import { CommandWindow } from './components/CommandWindow';
import { WorkspaceViewer } from './components/WorkspaceViewer';
import { PlotViewer } from './components/PlotViewer';
import { ReportViewer } from './components/ReportViewer';
import { ChatSidebar } from './components/ChatSidebar';
import { runtime, LogEntry, Variable, PlotData } from './lib/runtime';
import { generateReport, generateCodeFromPrompt } from './services/geminiService';

import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { EquationEditor } from './components/EquationEditor';


const APP_NAME = "Calcly IDE";

const App: React.FC = () => {
  // ... existing ...
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [code, setCode] = useState<string>('// Welcome to Calcly IDE\n// Ask the AI to write code or type it here.\n// Example: "Solve x^2 - x - 1 = 0"\n\nconst x = [];\nconst y = [];\nfor (let i = 0; i < 100; i++) {\n  x.push(i / 10);\n  y.push(Math.sin(i / 10) * Math.exp(-i/50));\n}\n\nplot([{x, y, type: "scatter", mode: "lines"}], {title: "Damped Sine Wave"});\n');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [plots, setPlots] = useState<PlotData[]>([]);
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'editor' | 'plots' | 'report'>('editor');
  const [mathMode, setMathMode] = useState<'numerical' | 'symbolic' | 'auto'>('auto');
  const [chatMessages, setChatMessages] = useState<{ id: string, sender: 'user' | 'ai', text: string, timestamp: number }[]>([]);
  const [activeBottomTab, setActiveBottomTab] = useState<'terminal' | 'equation'>('terminal');

  const handleInsertEquationCode = (eqCode: string) => {
    setCode(prev => prev + '\n' + eqCode);
    setActiveMainTab('editor'); // Switch focus to editor to see result
  };


  // Initialization
  useEffect(() => {
    document.documentElement.classList.add('dark');

    // Subscribe to runtime events
    runtime.setCallbacks(
      (plot) => {
        setPlots(prev => [...prev, plot]);
        setActiveMainTab('plots'); // Auto-switch to plots on new plot
      },
      (log) => {
        setLogs(prev => [...prev, log]);
      },
      (vars) => {
        setVariables(vars);
      }
    );

    // Initial sync
    runtime.execute('');
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

  const addChatMessage = (sender: 'user' | 'ai', text: string) => {
    setChatMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      sender,
      text,
      timestamp: Date.now()
    }]);
  };

  const handleChatSubmit = async (text: string, images?: string[]) => {
    addChatMessage('user', text);
    setIsAiProcessing(true);
    try {
      // Use Generation Service (supports images) instead of Review
      const response = await generateCodeFromPrompt(text, code, mathMode, images);

      if (response.code) {
        setCode(response.code);
        addChatMessage('ai', response.explanation);
        setActiveMainTab('editor'); // Switch to editor to show new code
      } else {
        addChatMessage('ai', response.explanation || "I couldn't generate any code for that request.");
      }
    } catch (err: any) {
      addChatMessage('ai', `Error: ${err.message}`);
    } finally {
      setIsAiProcessing(false);
    }
  };


  const handleReviewClick = () => {
    handleChatSubmit("Please review the current code. Check for errors, bugs, or improvements, and fix them if necessary.");
  };

  const handlePublish = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    setActiveMainTab('report');
    // Show loading state in markdown temporarily
    setReportMarkdown('# Generating Report...\n\nPlease wait while the AI analyzes your code, results, and plots to generate a scientific report.');

    try {
      // Serialize logs and variables for context
      const logsText = logs.slice(-20).map(l => `[${l.type}] ${l.message}`).join('\n');
      const varsText = variables.map(v => `${v.name} = ${v.value}`).join('\n');

      const markdown = await generateReport(code, logsText, varsText);
      setReportMarkdown(markdown);
    } catch (e: any) {
      setReportMarkdown(`# Generation Failed\n\nError: ${e.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSave = () => {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calcly_script_${new Date().toISOString().slice(0, 10)}.js`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCode(content);
    };
    reader.readAsText(file);
  };

  const handleClearWorkspace = () => {
    runtime.reset();
  };

  const handleDeleteVariable = (name: string) => {
    runtime.deleteVariable(name);
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

        {/* Center: Math Mode Toggle */}
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-600 shrink-0 mx-4">
          <button
            onClick={() => setMathMode('auto')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium uppercase tracking-wider ${mathMode === 'auto' ? 'bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            title="Auto / Hybrid Mode (AI Decides)"
          >
            <Sparkles className="w-4 h-4" /> Auto
          </button>
          <button
            onClick={() => setMathMode('numerical')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium uppercase tracking-wider ${mathMode === 'numerical' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            title="Numerical Mode (Math.js)"
          >
            <Calculator className="w-4 h-4" /> Numerical
          </button>
          <button
            onClick={() => setMathMode('symbolic')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium uppercase tracking-wider ${mathMode === 'symbolic' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            title="Symbolic Mode (Nerdamer)"
          >
            <Sigma className="w-4 h-4" /> Symbolic
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold uppercase tracking-wide mr-2 ${isPublishing ? 'bg-slate-700 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}`}
            title="Generate Scientific Report"
          >
            <Printer className="w-4 h-4" /> {isPublishing ? 'Publishing...' : 'Publish Report'}
          </button>

          <div className="w-px h-6 bg-slate-700 mx-1"></div>

          <button onClick={handleSave} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors" title="Save Script"><Save className="w-5 h-5" /></button>
          <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors" title="Open Script"><FolderOpen className="w-5 h-5" /></button>
          <input type="file" ref={fileInputRef} onChange={handleOpen} className="hidden" accept=".js,.ts,.txt" />
          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Resizable Layout */}
      <div className="flex-grow flex overflow-hidden">
        <PanelGroup orientation="horizontal" style={{ height: '100%', width: '100%' }}>

          {/* Left Panel: Chat Sidebar */}
          <Panel defaultSize={20} minSize={15} className="flex flex-col">
            <ChatSidebar
              messages={chatMessages}
              onSendMessage={handleChatSubmit}
              onReviewCode={handleReviewClick}
              isProcessing={isAiProcessing}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors cursor-col-resize z-50" />

          {/* Middle Panel: Main Content */}
          <Panel defaultSize={60} minSize={30}>
            <PanelGroup orientation="vertical" style={{ height: '100%', width: '100%' }}>

              {/* Top: Editor/Plots/Report */}
              <Panel defaultSize={75} minSize={30}>
                <div className="h-full flex flex-col min-w-0 bg-slate-900 border-r border-slate-700">
                  {/* Tabs */}
                  <div className="flex bg-slate-800 border-b border-slate-700 flex-shrink-0">
                    <button
                      onClick={() => setActiveMainTab('editor')}
                      className={`px-6 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-r border-slate-700 transition-colors ${activeMainTab === 'editor' ? 'bg-slate-900 text-indigo-400 border-t-2 border-t-indigo-500' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                    >
                      <FileCode className="w-4 h-4" /> Script Editor
                    </button>
                    <button
                      onClick={() => setActiveMainTab('plots')}
                      className={`px-6 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-r border-slate-700 transition-colors ${activeMainTab === 'plots' ? 'bg-slate-900 text-pink-400 border-t-2 border-t-pink-500' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                    >
                      <Grid className="w-4 h-4" /> Plots {plots.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-pink-500/20 text-pink-400 rounded-full text-[10px]">{plots.length}</span>}
                    </button>
                    <button
                      onClick={() => setActiveMainTab('report')}
                      className={`px-6 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-r border-slate-700 transition-colors ${activeMainTab === 'report' ? 'bg-slate-900 text-emerald-400 border-t-2 border-t-emerald-500' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                    >
                      <BookOpen className="w-4 h-4" /> Document
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-grow relative bg-[#1e1e1e]">
                    <div className={`absolute inset-0 ${activeMainTab === 'editor' ? 'z-10' : 'z-0 invisible'}`}>
                      <CodeEditor
                        code={code}
                        onChange={(val) => setCode(val || '')}
                        onRun={handleRunCode}
                      />
                    </div>
                    <div className={`absolute inset-0 ${activeMainTab === 'plots' ? 'z-10' : 'z-0 invisible'} bg-white dark:bg-slate-900`}>
                      <PlotViewer plots={plots} theme={theme} />
                    </div>
                    <div className={`absolute inset-0 ${activeMainTab === 'report' ? 'z-10' : 'z-0 invisible'} bg-white dark:bg-slate-900`}>
                      <ReportViewer markdown={reportMarkdown} />
                    </div>
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-slate-800 hover:bg-indigo-500 transition-colors cursor-row-resize z-50" />





              {/* Bottom: Command Window / Equation Lab */}
              <Panel defaultSize={25} minSize={10} className="bg-slate-900 flex flex-col">
                {/* Bottom Tabs */}
                <div className="flex bg-slate-800 border-b border-slate-700 flex-shrink-0">
                  <button
                    onClick={() => setActiveBottomTab('terminal')}
                    className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-r border-slate-700 transition-colors ${activeBottomTab === 'terminal' ? 'bg-slate-900 text-slate-200 border-t-2 border-t-indigo-500' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                  >
                    <Terminal className="w-3 h-3" /> Terminal
                  </button>
                  <button
                    onClick={() => setActiveBottomTab('equation')}
                    className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-r border-slate-700 transition-colors ${activeBottomTab === 'equation' ? 'bg-slate-900 text-pink-400 border-t-2 border-t-pink-500' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                  >
                    <Sigma className="w-3 h-3" /> Equation Lab
                  </button>
                </div>

                <div className="flex-grow overflow-hidden relative">
                  <div className={`absolute inset-0 ${activeBottomTab === 'terminal' ? 'z-10' : 'z-0 invisible'}`}>
                    <CommandWindow logs={logs} onExecute={handleCommand} />
                  </div>
                  <div className={`absolute inset-0 ${activeBottomTab === 'equation' ? 'z-10' : 'z-0 invisible'}`}>
                    <EquationEditor onInsertCode={handleInsertEquationCode} />
                  </div>
                </div>
              </Panel>

            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors cursor-col-resize z-50" />

          {/* Right Panel: Workspace */}
          <Panel defaultSize={20} minSize={15} className="flex flex-col bg-slate-800 shadow-xl z-20">
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-slate-700 bg-slate-800 flex items-center gap-2 flex-shrink-0">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Workspace</span>
              </div>
              <div className="flex-grow overflow-hidden relative bg-slate-900">
                <WorkspaceViewer
                  variables={variables}
                  onClear={handleClearWorkspace}
                  onDeleteVariable={handleDeleteVariable}
                />
              </div>
            </div>
          </Panel>

        </PanelGroup>
      </div>
    </div>
  );
};

export default App;
