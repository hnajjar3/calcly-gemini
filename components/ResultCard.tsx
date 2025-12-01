
import React, { useEffect, useRef } from 'react';
import { HistoryItem } from '../types';
import { ChartVisualization } from './ChartVisualization';
import { LatexRenderer } from './LatexRenderer';
import { Copy, Sparkles, AlertTriangle, Zap, Brain, Image as ImageIcon, ExternalLink, RefreshCw, ArrowRight, Lightbulb, Mic, Volume2 } from '../components/icons';

// Access global KaTeX, Prism, and Marked loaded via script tags
declare const katex: any;
declare const Prism: any;
declare const marked: any;

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
    <div className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-[#2d2d2d] my-2 shadow-sm w-full">
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

// Component to render Markdown + LaTeX
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  // 1. First, preserve LaTeX blocks by replacing them with placeholders to prevent Markdown from mangling them
  // We use a simple unique placeholder strategy
  const placeholders: string[] = [];
  const contentWithPlaceholders = content.replace(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g, (match) => {
    placeholders.push(match);
    return `%%%LATEX_PLACEHOLDER_${placeholders.length - 1}%%%`;
  });

  // 2. Parse Markdown
  let html = '';
  if (typeof marked !== 'undefined') {
    try {
      html = marked.parse(contentWithPlaceholders);
    } catch (e) {
      html = contentWithPlaceholders;
    }
  } else {
    html = contentWithPlaceholders;
  }

  // 3. Restore LaTeX and wrap in LatexRenderer
  // Since we need to render React components (LatexRenderer), parsing HTML string back to React is complex.
  // Instead, we can use a simpler approach: 
  // If no markdown detected (simple text), just LatexRenderer. 
  // If complex, we might accept raw HTML for markdown, then hydrate LaTeX?
  
  // A safer hybrid approach for this specific app structure:
  // We will trust 'marked' output but replace the placeholders back with the raw latex, 
  // AND THEN we use a ref to find those latex strings and render them with KaTeX manually.
  
  // However, simpler is often better: 
  // Just use LatexRenderer on the raw content if it's short. 
  // If it's a section content, use a custom renderer that splits by Markdown blocks?
  
  // Let's go with: Render HTML from marked, then replace placeholders with HTML for KaTeX
  const htmlWithLatex = html.replace(/%%%LATEX_PLACEHOLDER_(\d+)%%%/g, (_, index) => {
    const latex = placeholders[parseInt(index)];
    // We can pre-render latex to string here since we are injecting HTML
    if (typeof katex !== 'undefined') {
      try {
        const isBlock = latex.startsWith('$$');
        const math = isBlock ? latex.slice(2, -2) : latex.slice(1, -1);
        return katex.renderToString(math, { 
          displayMode: isBlock, 
          throwOnError: false 
        });
      } catch (e) {
        return latex;
      }
    }
    return latex;
  });

  return (
    <div 
      className="markdown-content text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words"
      dangerouslySetInnerHTML={{ __html: htmlWithLatex }} 
    />
  );
};

export const ResultCard: React.FC<Props> = ({ item, isDarkMode, onRetry, onSuggestionClick }) => {
  const speakResult = () => {
    if (!item.response?.result) return;
    let text = item.response.result.replace(/\$\$/g, '').replace(/\$/g, '');
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  if (item.loading) {
    return (
      <div className="w-full max-w-5xl mx-auto mb-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 animate-pulse transition-colors">
        <div className="flex items-center space-x-3 mb-4">
           <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
             <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
           </div>
           <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        </div>
        <div className="space-y-4">
          <div className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full"></div>
          <div className="h-32 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full"></div>
        </div>
      </div>
    );
  }

  if (item.error) {
     return (
      <div className="w-full max-w-5xl mx-auto mb-6 bg-red-50 dark:bg-red-900/10 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 p-6 transition-colors">
        <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3 text-red-700 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-semibold text-sm uppercase tracking-wide">Computation Error</h3>
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
    <div className="w-full max-w-5xl mx-auto mb-12 flex flex-col space-y-6">
      {/* Query Header */}
      <div className="px-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-snug break-words">
              {item.query}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
               {item.attachedImage && (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <ImageIcon className="w-3 h-3 mr-1" />
                  Image Analysis
                </span>
              )}
               {item.audioBase64 && (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <Mic className="w-3 h-3 mr-1" />
                  Voice Input
                </span>
              )}
               <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-indigo-600 dark:text-indigo-400 mr-1.5">Interpretation:</span>
                  <LatexRenderer content={response.interpretation} className="truncate max-w-[300px]" />
               </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 shrink-0">
             {item.modelMode === 'pro' ? (
               <div className="flex items-center px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-md text-[10px] uppercase font-bold tracking-wider border border-indigo-100 dark:border-indigo-800">
                 <Brain className="w-3.5 h-3.5 mr-1.5" />
                 Pro
               </div>
             ) : (
               <div className="flex items-center px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-md text-[10px] uppercase font-bold tracking-wider border border-amber-100 dark:border-amber-900/30">
                 <Zap className="w-3.5 h-3.5 mr-1.5" />
                 Flash
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Main Result */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md shadow-slate-200/40 dark:shadow-black/20 border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors w-full">
        <div className="bg-slate-50/80 dark:bg-slate-800/80 px-5 py-3 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Primary Result</span>
          <div className="flex space-x-1">
             <button 
              onClick={speakResult}
              className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Read Aloud"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => navigator.clipboard.writeText(response.result)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Copy Result"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-6 md:p-8">
          <div className="text-2xl sm:text-3xl md:text-4xl font-light text-slate-900 dark:text-slate-100 leading-tight">
            <LatexRenderer content={response.result} />
          </div>
        </div>
      </div>

      {/* Visualization if present */}
      {response.chart && (
        <div className="w-full">
          <ChartVisualization config={response.chart} isDarkMode={isDarkMode} />
        </div>
      )}

      {/* Detailed Sections (Vertical Stack) */}
      <div className="flex flex-col space-y-4 w-full">
        {response.sections.map((section, idx) => {
          const isCode = section.type === 'code';
          return (
            <div 
              key={idx} 
              className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 md:p-6 transition-colors shadow-sm w-full`}
            >
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                {section.title}
              </h3>
              
              {isCode ? (
                <CodeBlock code={section.content} language={detectLanguage(section.content, section.title)} />
              ) : section.type === 'list' ? (
                <ul className="list-disc pl-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {section.content.split('\n').map((line, i) => (
                    <li key={i} className="pl-1 leading-relaxed">
                      <LatexRenderer content={line.replace(/^[•-]\s*/, '')} />
                    </li>
                  ))}
                </ul>
              ) : (
                <MarkdownContent content={section.content} />
              )}
            </div>
          );
        })}
      </div>
      
      {/* Suggestions / Contextual Actions */}
      {response.suggestions && response.suggestions.length > 0 && onSuggestionClick && (
         <div className="w-full">
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
        <div className="w-full bg-slate-50 dark:bg-slate-800/30 rounded-xl px-5 py-4 border border-slate-100 dark:border-slate-800 transition-colors">
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Sources
          </h4>
          <div className="flex flex-wrap gap-2">
            {response.sources.map((source, idx) => (
              <a 
                key={idx} 
                href={source.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors truncate max-w-[240px]"
              >
                <span className="truncate">{source.title}</span>
                <ExternalLink className="w-3 h-3 ml-2 opacity-50 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
