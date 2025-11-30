import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Sparkles, Cpu, Search, RefreshCw, Zap, Brain, Image as ImageIcon, Camera, X } from './components/icons';
import { HistoryItem, ModelMode } from './types';
import { solveQuery } from './services/geminiService';
import { ResultCard } from './components/ResultCard';
import { SAMPLE_QUERIES, APP_NAME } from './constants';

const generateId = () => Math.random().toString(36).substring(2, 9);

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>('pro');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const queryText = overrideQuery || query.trim();
    if (!queryText || isProcessing) return;

    const id = generateId();
    const newItem: HistoryItem = {
      id,
      query: queryText,
      timestamp: Date.now(),
      loading: true,
      modelMode,
      attachedImage: attachedImage || undefined
    };

    setHistory(prev => [...prev, newItem]);
    setQuery('');
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsProcessing(true);

    // Scroll to new item
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const response = await solveQuery(queryText, newItem.modelMode, newItem.attachedImage);
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 z-50 flex items-center px-4 sm:px-8 justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700">
            {APP_NAME}
          </span>
        </div>
        <div className="hidden sm:flex items-center text-sm text-slate-500 space-x-4">
            <span className="flex items-center"><Sparkles className="w-3 h-3 mr-1 text-amber-500" /> Pro Intelligence</span>
            <span className="flex items-center"><RefreshCw className="w-3 h-3 mr-1 text-emerald-500" /> Real-time Data</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow pt-24 pb-48 px-4 sm:px-6 w-full max-w-7xl mx-auto">
        
        {/* Welcome State */}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up">
            <div className="space-y-4 max-w-2xl">
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">
                What do you want to <span className="text-indigo-600">know</span>?
              </h1>
              <p className="text-lg text-slate-600">
                Compute answers, analyze data, and visualize concepts with Gemini Intelligence.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
              {SAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(undefined, q)}
                  className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all duration-200 text-sm text-slate-700 flex items-start group"
                >
                  <Search className="w-4 h-4 mr-3 mt-0.5 text-slate-400 group-hover:text-indigo-500" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Feed */}
        <div className="space-y-6">
          {history.map((item) => (
            <ResultCard key={item.id} item={item} />
          ))}
          <div ref={bottomRef} />
        </div>

      </main>

      {/* Sticky Footer Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 pb-6 px-4 z-40">
        <div className="max-w-3xl mx-auto">
          {/* Controls Bar */}
          <div className="flex justify-between items-end mb-2 px-1">
             <div className="flex space-x-1 bg-white p-1 rounded-full border border-slate-200 shadow-sm">
                <button 
                  onClick={() => setModelMode('pro')}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${modelMode === 'pro' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>Pro Reason</span>
                </button>
                <button 
                  onClick={() => setModelMode('flash')}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${modelMode === 'flash' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Flash Fast</span>
                </button>
             </div>
             
             {/* Image Preview if attached */}
             {attachedImage && (
               <div className="relative group">
                 <img src={attachedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border-2 border-white shadow-md" />
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
            <div className="relative flex items-center bg-white rounded-2xl border border-slate-300 shadow-2xl shadow-indigo-500/10 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 transition-all overflow-hidden">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="pl-4 pr-3 py-4 text-slate-400 hover:text-indigo-600 transition-colors border-r border-slate-100"
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
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={modelMode === 'pro' ? "Ask complex questions (Math, Physics, Data)..." : "Ask quick questions..."}
                  className="w-full h-16 px-4 bg-transparent text-lg focus:outline-none"
                  disabled={isProcessing}
                />
                
                <div className="pr-3">
                    <button
                    type="submit"
                    disabled={(!query.trim() && !attachedImage) || isProcessing}
                    className="aspect-square p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-indigo-500/30"
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
            <p className="text-xs text-slate-400 font-medium">
               {modelMode === 'pro' ? 'Gemini 3 Pro (High Reasoning)' : 'Gemini 2.5 Flash (High Speed)'} • {attachedImage ? 'Image Analysis Active' : 'Text Input'}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default App;