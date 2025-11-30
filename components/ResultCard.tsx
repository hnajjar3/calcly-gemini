import React, { useEffect, useRef } from 'react';
import { HistoryItem } from '../types';
import { ChartVisualization } from './ChartVisualization';
import { LatexRenderer } from './LatexRenderer';
import { Copy, Share2, Sparkles, AlertTriangle, Zap, Brain, Image as ImageIcon, ExternalLink, RefreshCw, ArrowRight, Lightbulb, Mic, Volume2 } from 'lucide-react';

// Access global KaTeX and Prism loaded via script tags in index.html
declare const katex: any;
declare const Prism: any;

interface Props {
  item: HistoryItem;
  isDarkMode: boolean;
  onRetry?: (id: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

// Helper to determine language for Prism
const detectLanguage = (content: string, title?: string): string => {
  if (title?.toLowerCase().includes('python')) return 'python';
  if (title?.toLowerCase().includes('javascript') || title?.toLowerCase().includes('js')) return 'javascript';
  if (title?.toLowerCase().includes('json')) return 'json';
  if (title?.toLowerCase().includes('bash') || title?.toLowerCase().includes('sh')) return 'bash';
  if (title?.toLowerCase().includes('latex')) return 'latex';
  if (content.trim().startsWith('import') || content.includes('def ')) return 'python';
  return 'javascript'; // default
};

// Code Block Component
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language = 'javascript' }) => {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && typeof Prism !== 'undefined') {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <div className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-[#2d2d2d] my-2 shadow-sm">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
           onClick={() => navigator.clipboard.writeText(code)}
           className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md backdrop-blur-sm transition-colors"
           title="Copy Code"
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
      <pre className={`!m-0 !p-4 overflow-x-auto text-sm scrollbar-thin scrollbar-thumb-slate-600`}>
        <code ref={codeRef} className={`language-${language} font-mono !bg-transparent !text-sm`}>
          {code}
        </code>
      </pre>
    </div>
  );
};

export const ResultCard: React.FC<Props> = ({ item, isDarkMode, onRetry, onSuggestionClick }) => {
  const speakResult = () => {
    if (!item.response?.result) return;
    // Strip LaTeX delimiters for speech if possible, though speech synthesis might struggle with complex math.
    // A simple clean up:
    let text = item.response.result.replace(/\$\$/g, '').replace(/\$/g, '');
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  if (item.loading) {
    return (
      <div className="w-full max-w-4xl mx-auto mb-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 animate-pulse transition-colors">
        <div className="flex items-center space-x-3 mb-4">
           <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
             <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
           </div>
           <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
        </div>
        <div className="space-y-3">
          <div className="h-12 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full"></div>
          <div className="h-24 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full"></div>
        </div>
      </div>
    );
  }

  if (item.error) {
     return (
      <div className="w-full max-w-4xl mx-auto mb-6 bg-red-50 dark:bg-red-900/10 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 p-5 transition-colors">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 text-red-700 dark:text-red-400 mb-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-semibold text-sm">Computation Error</h3>
            </div>
            {onRetry && (
                <button 
                    onClick={() => onRetry(item.id)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 rounded-lg text-xs font-medium border border-red-100 dark:border-red-800 transition-colors shadow-sm"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                </button>
            )}
        </div>
        <p className="text-red-600 dark:text-red-300 text-sm">{item.error}</p>
      </div>
    );
  }

  if (!item.response) return null;

  const { response } = item;

  return (
    <div className="w-full max-w-4xl mx-auto mb-10 bg-transparent">
      {/* Query Header */}
      <div className="mb-4 px-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline space-x-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">{item.query}</h2>
            </div>
            <div className="flex items-center space-x-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
               {item.attachedImage && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <ImageIcon className="w-2.5 h-2.5 mr-1" />
                  Image
                </span>
              )}
               {item.audioBase64 && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <Mic className="w-2.5 h-2.5 mr-1" />
                  Voice
                </span>
              )}
              <span className="truncate">
                 <span className="font-medium text-indigo-600 dark:text-indigo-400 mr-1">Input:</span>
                 <LatexRenderer content={response.interpretation} />
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
             {item.modelMode === 'pro' ? (
               <div className="flex items-center px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-md text-[10px] uppercase font-bold tracking-wider border border-indigo-100 dark:border-indigo-800">
                 <Brain className="w-3 h-3 mr-1" />
                 Pro
               </div>
             ) : (
               <div className="flex items-center px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-md text-[10px] uppercase font-bold tracking-wider border border-amber-100 dark:border-amber-900/30">
                 <Zap className="w-3 h-3 mr-1" />
                 Flash
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Main Result */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md shadow-slate-200/40 dark:shadow-black/20 border border-slate-200 dark:border-slate-700 overflow-hidden mb-5 transition-colors">
        <div className="bg-slate-50/80 dark:bg-slate-800/80 px-5 py-2.5 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Result</span>
          <div className="flex space-x-1">
             <button 
              onClick={speakResult}
              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Read Aloud"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => navigator.clipboard.writeText(response.result)}
              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Copy Result"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="text-2xl sm:text-3xl font-light text-slate-900 dark:text-slate-100 leading-snug">
            <LatexRenderer content={response.result} />
          </div>
        </div>
      </div>

      {/* Visualization if present */}
      {response.chart && (
        <div className="mb-5">
          <ChartVisualization config={response.chart} isDarkMode={isDarkMode} />
        </div>
      )}

      {/* Detailed Sections */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 mb-4">
        {response.sections.map((section, idx) => {
          const isCode = section.type === 'code';
          return (
            <div 
              key={idx} 
              className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 ${isCode ? 'col-span-full' : ''} transition-colors shadow-sm`}
            >
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              
              {isCode ? (
                <CodeBlock code={section.content} language={detectLanguage(section.content, section.title)} />
              ) : section.type === 'list' ? (
                <ul className="list-disc pl-4 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  {section.content.split('\n').map((line, i) => (
                    <li key={i} className="pl-1">
                      <LatexRenderer content={line.replace(/^[•-]\s*/, '')} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  <LatexRenderer content={section.content} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Suggestions / Contextual Actions */}
      {response.suggestions && response.suggestions.length > 0 && onSuggestionClick && (
         <div className="mb-6">
            <h4 className="flex items-center text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 ml-1">
               <Lightbulb className="w-3.5 h-3.5 mr-1.5" />
               Explore Further
            </h4>
            <div className="flex flex-wrap gap-2">
               {response.suggestions.map((suggestion, idx) => (
                  <button
                     key={idx}
                     onClick={() => onSuggestionClick(suggestion)}
                     className="group flex items-center space-x-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 rounded-full text-sm text-slate-600 dark:text-slate-300 shadow-sm transition-all hover:shadow-md hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                     <span>{suggestion}</span>
                     <ArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </button>
               ))}
            </div>
         </div>
      )}

      {/* Sources / Grounding */}
      {response.sources && response.sources.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-100 dark:border-slate-800 transition-colors">
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center">
            <Sparkles className="w-3 h-3 mr-1" />
            Sources
          </h4>
          <div className="flex flex-wrap gap-2">
            {response.sources.map((source, idx) => (
              <a 
                key={idx} 
                href={source.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors truncate max-w-[200px]"
              >
                <span className="truncate">{source.title}</span>
                <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};