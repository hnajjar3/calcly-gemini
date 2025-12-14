import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Sparkles, Cpu, Search, RefreshCw, Zap, Brain, Image as ImageIcon, Camera, X, Sun, Moon, Calculator as CalcIcon, Mic, Square, Sigma, Plus, Nu, TrendingUp, Code, Globe, Music } from './components/icons';
import { HistoryItem, ModelMode } from './types';
import { solveQuery } from './services/geminiService';
import { ResultCard } from './components/ResultCard';
import { BasicCalculator } from './components/BasicCalculator';
import { SymbolicSolver } from './components/SymbolicSolver';
import { NumericalSolver } from './components/NumericalSolver';
import { SAMPLE_QUERIES, APP_NAME } from './constants';

const generateId = () => Math.random().toString(36).substring(2, 9);

type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>('pro');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSymbolicSolver, setShowSymbolicSolver] = useState(false);
  const [showNumericalSolver, setShowNumericalSolver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Ref to prevent double submission in Strict Mode
  const hasAutoSubmitted = useRef(false);

  // Initialize theme based on system preference
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  // Update DOM class when theme changes
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetApp = () => {
    setHistory([]);
    setQuery('');
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsProcessing(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Also clear URL params if present to clean state
    try {
        if (window.location.protocol !== 'blob:' && window.location.protocol !== 'data:') {
            window.history.replaceState({}, '', window.location.pathname);
        }
    } catch (e) {
        // Ignore security errors in restricted environments
    }
  };

  // Audio Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        submitAudioQuery(audioBlob);
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const submitAudioQuery = async (audioBlob: Blob) => {
    // Convert blob to base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const audioBase64 = reader.result as string;
      await handleSubmit(undefined, undefined, audioBase64);
    };
  };

  const handleRetry = async (id: string) => {
    const itemToRetry = history.find(item => item.id === id);
    if (!itemToRetry) return;

    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, loading: true, error: undefined } : item
    ));

    try {
      const response = await solveQuery(itemToRetry.query, itemToRetry.modelMode, itemToRetry.attachedImage, itemToRetry.audioBase64);
      setHistory(prev => prev.map(item => 
        item.id === id ? { ...item, loading: false, response } : item
      ));
    } catch (err: any) {
      setHistory(prev => prev.map(item => 
        item.id === id ? { ...item, loading: false, error: err.message || "Failed to retry query" } : item
      ));
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideQuery?: string, audioBase64?: string, contextItem?: HistoryItem) => {
    e?.preventDefault();
    const queryText = overrideQuery || query.trim();
    
    // Allow submission if there is text OR image OR audio
    if ((!queryText && !attachedImage && !audioBase64) || isProcessing) return;

    const id = generateId();
    const newItem: HistoryItem = {
      id,
      query: queryText || (audioBase64 ? "Voice Query" : "Image Analysis"),
      timestamp: Date.now(),
      loading: true,
      modelMode,
      attachedImage: attachedImage || undefined,
      audioBase64: audioBase64 || undefined
    };

    let effectiveContext = contextItem;
    if (!effectiveContext && history.length > 0 && !overrideQuery) {
        effectiveContext = history[history.length - 1];
    }

    setHistory(prev => [...prev, newItem]);
    setQuery('');
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsProcessing(true);

    // Scroll to new item
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      // Prepare Context
      const context = (effectiveContext && effectiveContext.response) ? {
         previousQuery: effectiveContext.query,
         previousResult: effectiveContext.response.result.map(p => p.content).join(' ')
      } : undefined;

      const response = await solveQuery(queryText, newItem.modelMode, newItem.attachedImage, newItem.audioBase64, context);
      setHistory(prev => prev.map(item => 
        item.id === id ? { ...item, loading: false, response } : item
      ));
    } catch (err: any) {
      setHistory(prev => prev.map(item => 
        item.id === id ? { ...item, loading: false, error: err.message || "Failed to process query" } : item
      ));
    } finally {
      setIsProcessing(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleSuggestionClick = (suggestion: string, parentItem: HistoryItem) => {
    handleSubmit(undefined, suggestion, undefined, parentItem);
  };

  // Handle URL Query Params (Deep Linking)
  useEffect(() => {
    try {
        const params = new URLSearchParams(window.location.search);
        const urlQuery = params.get('q');
        
        if (urlQuery && !hasAutoSubmitted.current) {
            hasAutoSubmitted.current = true;
            const modeParam = params.get('mode');
            if (modeParam === 'flash') {
                setModelMode('flash');
            }
            
            setTimeout(() => {
                handleSubmit(undefined, urlQuery);
            }, 100);
        }
    } catch (e) {
        // Ignore errors in restricted environments
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getIconForQuery = (q: string) => {
    if (q.includes('Integrate') || q.includes('Solve')) return <Sigma className="w-4 h-4 text-indigo-500" />;
    if (q.includes('Compare') || q.includes('GDP')) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    if (q.includes('Graph') || q.includes('Plot')) return <TrendingUp className="w-4 h-4 text-blue-500" />;
    if (q.includes('Code') || q.includes('complexity')) return <Code className="w-4 h-4 text-pink-500" />;
    return <Search className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 relative overflow-x-hidden">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[100px] animate-blob"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-500/10 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
          <div className="absolute top-[30%] right-[30%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[80px] animate-blob animation-delay-4000"></div>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 z-50 flex items-center px-4 sm:px-8 justify-between transition-colors">
        <button 
          onClick={resetApp}
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity focus:outline-none group"
          title="Reset to Home"
        >
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700 dark:from-indigo-400 dark:to-violet-400">
            {APP_NAME}
          </span>
        </button>
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="hidden sm:flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 space-x-4 bg-slate-100/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/50">
              <span className="flex items-center"><Sparkles className="w-3 h-3 mr-1.5 text-amber-500" /> Pro Intelligence</span>
              <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>
              <span className="flex items-center"><RefreshCw className="w-3 h-3 mr-1.5 text-emerald-500" /> Real-time Data</span>
          </div>
          
           <button
            onClick={() => setShowSymbolicSolver(true)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors hidden sm:block"
            title="Open Symbolic Solver"
          >
            <Sigma className="w-5 h-5" />
          </button>
          
           <button
            onClick={() => setShowNumericalSolver(true)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors hidden sm:block"
            title="Open Numerical Solver"
          >
            <Nu className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowCalculator(true)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title="Open Calculator"
          >
            <CalcIcon className="w-5 h-5" />
          </button>

          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow pt-24 pb-48 px-4 sm:px-6 w-full max-w-5xl mx-auto flex flex-col items-center relative z-10">
        
        {/* Welcome State */}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-10 animate-fade-in-up w-full">
            <div className="space-y-6 max-w-2xl">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 text-xs font-semibold tracking-wide uppercase mb-2">
                 AI Computational Engine
              </div>
              <h1 className="text-4xl sm:text-6xl font-bold text-slate-900 dark:text-white tracking-tight leading-[1.1]">
                What do you want to <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-400">know?</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                Compute answers, analyze complex data, and visualize concepts with next-gen Gemini Intelligence.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-3xl text-left">
              {SAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(undefined, q)}
                  className="p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-lg dark:hover:shadow-indigo-500/10 hover:-translate-y-0.5 transition-all duration-300 text-sm text-slate-700 dark:text-slate-300 flex items-center group"
                >
                  <div className="p-2 bg-white dark:bg-slate-700 rounded-lg shadow-sm mr-3 group-hover:scale-110 transition-transform">
                      {getIconForQuery(q)}
                  </div>
                  <span className="font-medium">{q}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Feed */}
        <div className="space-y-8 w-full">
          {history.map((item) => (
            <ResultCard 
              key={item.id} 
              item={item} 
              isDarkMode={theme === 'dark'} 
              onRetry={handleRetry}
              onSuggestionClick={(suggestion) => handleSuggestionClick(suggestion, item)}
            />
          ))}
          <div ref={bottomRef} />
        </div>

      </main>

      {/* Sticky Footer Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent dark:from-slate-900 dark:via-slate-900/90 pt-8 pb-6 px-4 z-40">
        <div className="max-w-3xl mx-auto w-full">
          {/* Controls Bar */}
          <div className="flex justify-between items-end mb-3 px-1">
             <div className="flex items-center space-x-2">
                 {history.length > 0 && (
                    <button 
                        onClick={resetApp} 
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900/50 shadow-sm transition-all animate-fade-in"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Topic</span>
                    </button>
                 )}
                 <div className="flex space-x-1 bg-white/80 dark:bg-slate-800/80 p-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm backdrop-blur-md">
                    <button 
                      onClick={() => setModelMode('pro')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${modelMode === 'pro' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Pro</span>
                    </button>
                    <button 
                      onClick={() => setModelMode('flash')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${modelMode === 'flash' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Flash</span>
                    </button>
                 </div>
             </div>
             
             {attachedImage && (
               <div className="relative group animate-fade-in-up">
                 <div className="absolute inset-0 bg-indigo-500 blur-md opacity-20 rounded-lg"></div>
                 <img src={attachedImage} alt="Preview" className="h-14 w-14 object-cover rounded-lg border-2 border-white dark:border-slate-700 shadow-lg relative z-10" />
                 <button 
                   onClick={clearImage}
                   className="absolute -top-2 -right-2 z-20 bg-slate-800 text-white p-0.5 rounded-full hover:bg-red-500 transition-colors shadow-sm"
                 >
                   <X className="w-3 h-3" />
                 </button>
               </div>
             )}
          </div>

          <form 
            onSubmit={(e) => handleSubmit(e)} 
            className={`relative group transition-all duration-300 ${isProcessing ? 'opacity-90 pointer-events-none' : ''}`}
          >
            <div className={`relative flex items-center bg-white dark:bg-slate-800 rounded-2xl border ${isRecording ? 'border-red-500 dark:border-red-500 ring-4 ring-red-500/10' : 'border-slate-200 dark:border-slate-700'} shadow-xl shadow-indigo-500/5 dark:shadow-black/40 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-500/50 transition-all overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="pl-4 pr-3 py-4 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border-r border-slate-100 dark:border-slate-700/50"
                  title="Upload image"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />

                <input
                  type="text"
                  value={isRecording ? "Listening..." : query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={history.length > 0 ? "Ask a follow-up..." : (modelMode === 'pro' ? "Ask complex questions..." : "Ask quick questions...")}
                  className={`w-full h-16 px-4 bg-transparent text-lg ${isRecording ? 'text-red-500 font-medium animate-pulse' : 'text-slate-900 dark:text-slate-100'} placeholder:text-slate-400 focus:outline-none`}
                  disabled={isProcessing || isRecording}
                />
                
                <div className="flex items-center space-x-2 pr-2">
                    <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`aspect-square p-2.5 rounded-xl flex items-center justify-center transition-colors ${isRecording ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                    >
                        {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                    type="submit"
                    disabled={(!query.trim() && !attachedImage) || isProcessing || isRecording}
                    className="aspect-square p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center transition-all shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                    >
                    {isProcessing ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                        <ArrowRight className="w-5 h-5" />
                    )}
                    </button>
                </div>
            </div>
          </form>
          <div className="text-center mt-3 flex items-center justify-center space-x-4 opacity-60 hover:opacity-100 transition-opacity">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
               {modelMode === 'pro' ? 'Gemini 3 Pro' : 'Gemini 2.5 Flash'} Active
            </p>
          </div>
        </div>
      </div>

      {/* Calculator Modal */}
      <BasicCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />
      
      {/* Symbolic Solver Modal */}
      <SymbolicSolver isOpen={showSymbolicSolver} onClose={() => setShowSymbolicSolver(false)} />

      {/* Numerical Solver Modal */}
      <NumericalSolver isOpen={showNumericalSolver} onClose={() => setShowNumericalSolver(false)} />

    </div>
  );
};

export default App;