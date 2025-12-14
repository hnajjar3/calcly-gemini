import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Sparkles, Cpu, Search, RefreshCw, Zap, Brain, Image as ImageIcon, Camera, X, Sun, Moon, Calculator as CalcIcon, Mic, Square, Sigma, Plus } from './components/icons';
import { HistoryItem, ModelMode } from './types';
import { solveQuery } from './services/geminiService';
import { ResultCard } from './components/ResultCard';
import { BasicCalculator } from './components/BasicCalculator';
import { SymbolicSolver } from './components/SymbolicSolver';
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
    window.history.replaceState({}, '', window.location.pathname);
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
      // For retry, we assume no prior context is explicitly re-injected unless it was stored, 
      // but simpler to just retry the query itself.
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

    // Auto-detect context: Use the most recent history item if no specific context was passed
    // This enables natural follow-up conversation in the main chat input
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
         previousResult: effectiveContext.response.result
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
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get('q');
    
    if (urlQuery && !hasAutoSubmitted.current) {
        hasAutoSubmitted.current = true;
        // Optionally allow mode selection via URL params as well
        const modeParam = params.get('mode');
        if (modeParam === 'flash') {
            setModelMode('flash');
        }
        
        // Slight delay to ensure hydration/state is ready
        setTimeout(() => {
            handleSubmit(undefined, urlQuery);
        }, 100);
    }
    // We intentionally omit handleSubmit from deps to run this only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-50 flex items-center px-4 sm:px-8 justify-between transition-colors">
        <button 
          onClick={resetApp}
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity focus:outline-none"
          title="Reset to Home"
        >
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700 dark:from-indigo-400 dark:to-violet-400">
            {APP_NAME}
          </span>
        </button>
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center text-sm text-slate-500 dark:text-slate-400 space-x-4">
              <span className="flex items-center"><Sparkles className="w-3 h-3 mr-1 text-amber-500" /> Pro Intelligence</span>
              <span className="flex items-center"><RefreshCw className="w-3 h-3 mr-1 text-emerald-500" /> Real-time Data</span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
          
           <button
            onClick={() => setShowSymbolicSolver(true)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title="Open Symbolic Solver (Exact Math)"
          >
            <Sigma className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowCalculator(true)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title="Open Basic Calculator"
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
      <main className="flex-grow pt-24 pb-48 px-4 sm:px-6 w-full max-w-5xl mx-auto flex flex-col items-center">
        
        {/* Welcome State */}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up w-full">
            <div className="space-y-4 max-w-2xl">
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
                What do you want to <span className="text-indigo-600 dark:text-indigo-400">know</span>?
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Compute answers, analyze data, and visualize concepts with Gemini Intelligence.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
              {SAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(undefined, q)}
                  className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all duration-200 text-sm text-slate-700 dark:text-slate-300 flex items-start group"
                >
                  <Search className="w-4 h-4 mr-3 mt-0.5 text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Feed */}
        <div className="space-y-12 w-full">
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
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent dark:from-slate-900 dark:via-slate-900 pt-4 pb-6 px-4 z-40 transition-colors">
        <div className="max-w-3xl mx-auto w-full">
          {/* Controls Bar */}
          <div className="flex justify-between items-end mb-2 px-1">
             <div className="flex items-center space-x-2">
                 {history.length > 0 && (
                    <button 
                        onClick={resetApp} 
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900/50 shadow-sm transition-all animate-fade-in"
                        title="Start a new conversation topic"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Topic</span>
                    </button>
                 )}
                 <div className="flex space-x-1 bg-white dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button 
                      onClick={() => setModelMode('pro')}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${modelMode === 'pro' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Pro Reason</span>
                    </button>
                    <button 
                      onClick={() => setModelMode('flash')}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${modelMode === 'flash' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Flash Fast</span>
                    </button>
                 </div>
             </div>
             
             {/* Image Preview if attached */}
             {attachedImage && (
               <div className="relative group">
                 <img src={attachedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border-2 border-white dark:border-slate-700 shadow-md" />
                 <button 
                   onClick={clearImage}
                   className="absolute -top-2 -right-2 bg-slate-800 text-white p-0.5 rounded-full hover:bg-red-500 transition-colors"
                 >
                   <X className="w-3 h-3" />
                 </button>
               </div>
             )}
          </div>

          <form 
            onSubmit={(e) => handleSubmit(e)} 
            className={`relative group transition-all duration-300 ${isProcessing ? 'opacity-80 pointer-events-none' : ''}`}
          >
            <div className={`relative flex items-center bg-white dark:bg-slate-800 rounded-2xl border ${isRecording ? 'border-red-500 dark:border-red-500 ring-2 ring-red-500/20' : 'border-slate-300 dark:border-slate-600'} shadow-2xl shadow-indigo-500/10 dark:shadow-black/40 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 transition-all overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="pl-4 pr-3 py-4 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border-r border-slate-100 dark:border-slate-700"
                  title="Upload image for analysis"
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
                  placeholder={history.length > 0 ? "Ask a follow-up question..." : (modelMode === 'pro' ? "Ask complex questions (Math, Physics, Data)..." : "Ask quick questions...")}
                  className={`w-full h-16 px-4 bg-transparent text-lg ${isRecording ? 'text-red-500 font-medium animate-pulse' : 'text-slate-900 dark:text-slate-100'} placeholder:text-slate-400 focus:outline-none`}
                  disabled={isProcessing || isRecording}
                />
                
                <div className="flex items-center space-x-2 pr-3">
                    {/* Recording Button */}
                    <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`aspect-square p-3 rounded-xl flex items-center justify-center transition-colors ${isRecording ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                        title={isRecording ? "Stop Recording" : "Use Voice Input"}
                    >
                        {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                    type="submit"
                    disabled={(!query.trim() && !attachedImage) || isProcessing || isRecording}
                    className="aspect-square p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-indigo-500/30"
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
          <div className="text-center mt-2">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
               {modelMode === 'pro' ? 'Gemini 3 Pro (High Reasoning)' : 'Gemini 2.5 Flash (High Speed)'} • {attachedImage ? 'Image Analysis Active' : isRecording ? 'Recording Voice...' : 'Text Input'}
            </p>
          </div>
        </div>
      </div>

      {/* Calculator Modal */}
      <BasicCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />
      
      {/* Symbolic Solver Modal */}
      <SymbolicSolver isOpen={showSymbolicSolver} onClose={() => setShowSymbolicSolver(false)} />

    </div>
  );
};

export default App;