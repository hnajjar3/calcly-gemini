
import React, { useState, useEffect } from 'react';
import { Sigma, Activity, Brain, Cpu, Sun, Moon } from 'lucide-react';
import { ToolCard } from './components/ToolCard';
import { Workbench } from './components/Workbench';
import * as geminiService from './services/geminiService';
import { APP_NAME } from './constants';

type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('light');
  const [activeTool, setActiveTool] = useState<'symbolic' | 'numerical' | 'reasoning' | null>(null);

  useEffect(() => {
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // If a tool is active, show the Workbench
  if (activeTool) {
    return (
      <Workbench
        mode={activeTool}
        onBack={() => setActiveTool(null)}
        geminiService={geminiService}
      />
    );
  }

  // Otherwise show the Landing Page / Tool Selection
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">

      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 z-50 flex items-center px-6 justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700 dark:from-indigo-400 dark:to-violet-400">
            {APP_NAME}
          </span>
        </div>
        <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-grow pt-32 pb-20 px-4 sm:px-6 w-full max-w-6xl mx-auto flex flex-col">

        <div className="text-center mb-16 space-y-4">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white">
            The Engineer's <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-400">
              Computational Toolkit
            </span>
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            A modern, AI-first alternative to legacy math software.
            Symbolic exactness, numerical power, and deep reasoning—all in your browser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <ToolCard
            title="Symbolic Engine"
            description="Exact algebra, calculus, and symbolic manipulation. Powered by Nerdamer & Algebrite."
            icon={<Sigma />}
            colorClass="bg-indigo-500"
            onClick={() => setActiveTool('symbolic')}
          />
          <ToolCard
            title="Numerical Lab"
            description="Statistical analysis, matrix operations, and complex data visualization. Powered by Math.js & Plotly."
            icon={<Activity />}
            colorClass="bg-emerald-500"
            onClick={() => setActiveTool('numerical')}
          />
          <ToolCard
            title="Reasoning Pro"
            description="Deep multi-step problem solving for physics, engineering, and general knowledge. Powered by Gemini 3.0."
            icon={<Brain />}
            colorClass="bg-amber-500"
            onClick={() => setActiveTool('reasoning')}
          />
        </div>

      </main>

      <footer className="py-8 text-center text-slate-400 text-sm">
        <p>&copy; {new Date().getFullYear()} Calcly. Open Source AI Engineering.</p>
      </footer>
    </div>
  );
};

export default App;
