import React, { useEffect, useRef } from 'react';
import { HistoryItem, ResultPart } from '../types';
import { ChartVisualization } from './ChartVisualization';
import { LatexRenderer } from './LatexRenderer';
import { Copy, Sparkles, AlertTriangle, Zap, Brain, Image as ImageIcon, ExternalLink, RefreshCw, ArrowRight, Lightbulb, Mic, Volume2 } from '../components/icons';

// Access global KaTeX, Prism, and Marked loaded via script tags
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
      <pre className={`!m-0 !p-3 overflow-x-auto text-xs sm:text-sm scrollbar-thin scrollbar-thumb-slate-600`}>
        <code ref={codeRef} className={`language-${language} font-mono !bg-transparent`}>
          {code}
        </code>
      </pre>
    </div>
  );
};

// Helper for inline markdown in the Main Result (lightweight)
const InlineMarkdown: React.FC<{ content: string }> = ({ content }) => {
  // Use marked for basic inline styling like bold/italic, but keep it simple
  let html = content;
  const markedLib = (window as any).marked;
  if (markedLib) {
     try {
         html = markedLib.parseInline(content, { breaks: true, gfm: true });
     } catch (e) {
         html = content;
     }
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

// Component to render robust Markdown + LaTeX for SECTIONS
const SectionMarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  let processed = content;
  const currencyPlaceholders: string[] = [];
  const latexPlaceholders: string[] = [];

  // 1. Protect Currency
  processed = processed.replace(/(\$(?:\d{1,3}(?:,\d{3})*|(?:\d+))(?:\.\d+)?)/g, (match) => {
    currencyPlaceholders.push(match);
    return `%%%CURRENCY_PLACEHOLDER_${currencyPlaceholders.length - 1}%%%`;
  });

  // 2. Extract LaTeX
  const latexRegex = /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\s)(?:[^$\n]|\\\$)*?(?<!\s)(?<!\\)\$)/g;
  processed = processed.replace(latexRegex, (match) => {
    latexPlaceholders.push(match);
    return `%%%LATEX_PLACEHOLDER_${latexPlaceholders.length - 1}%%%`;
  });

  // 3. Restore Currency
  processed = processed.replace(/%%%CURRENCY_PLACEHOLDER_(\d+)%%%/g, (_, index) => {
    return currencyPlaceholders[parseInt(index)];
  });

  // 4. Markdown Parse
  let html = '';
  const markedLib = (window as any).marked;
  if (markedLib) {
    try {
      html = markedLib.parse(processed, { breaks: true, gfm: true });
    } catch (e) {
      html = processed;
    }
  } else {
    html = processed;
  }

  // 5. Restore LaTeX
  const htmlWithLatex = html.replace(/%%%LATEX_PLACEHOLDER_(\d+)%%%/g, (_, index) => {
    const latex = latexPlaceholders[parseInt(index)];
    if (typeof katex !== 'undefined') {
      try {
        const isBlock = latex.startsWith('$$');
        const math = isBlock ? latex.slice(2, -2) : latex.slice(1, -1);
        return katex.renderToString(math, { displayMode: isBlock, throwOnError: false });
      } catch (e) { return latex; }
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
  const resultParts = item.response?.result || [];
  
  // Reconstruct plain text for clipboard/TTS
  const resultText = resultParts.map(p => p.content).join('');

  const speakResult = () => {
    if (!resultText) return;
    const utterance = new SpeechSynthesisUtterance(resultText);
    window.speechSynthesis.speak(utterance);
  };

  if (item.loading) {
    return (
      <div className="w-full max-w-5xl mx-auto mb-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 animate-pulse transition-colors">
        <div className="flex items-center space-x-3 mb-4">
           <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
             <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
           </div>
           <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
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
      <div className="w-full max-w-5xl mx-auto mb-6 bg-red-50 dark:bg-red-900/10 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 p-5 transition-colors">
        <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3 text-red-700 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="font-semibold text-xs uppercase tracking-wide">Computation Error</h3>
            </div>
            {onRetry && (
                <button 
                    onClick={() => onRetry(item.id)}
                    className="flex items-center space-x-1 px-3 py-1 bg-white dark:bg-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 rounded-lg text-[10px] font-medium border border-red-100 dark:border-red-800 transition-colors shadow-sm"
                >
                    <RefreshCw className="w-3 h-3" />
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
  const interpretationText = response.interpretation || '';

  // LAYOUT LOGIC
  // If result has LaTeX parts or is very short, use Hero Mode.
  const hasLatex = resultParts.some(p => p.type === 'latex');
  const isShortResult = resultText.length < 120;
  const useHeroMode = hasLatex || isShortResult;

  return (
    <div className="w-full max-w-5xl mx-auto mb-10 flex flex-col space-y-4">
      
      {/* 1. QUERY & META HEADER */}
      <div className="px-1 flex flex-col gap-1.5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-snug break-words">
              {item.query}
            </h2>
          </div>
          
          <div className="flex items-center space-x-2 shrink-0 pt-0.5">
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

        <div className="flex flex-wrap items-center gap-2">
            {item.attachedImage && (
            <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <ImageIcon className="w-3 h-3 mr-1" />
                Image Analysis
            </span>
            )}
            {item.audioBase64 && (
            <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <Mic className="w-3 h-3 mr-1" />
                Voice Input
            </span>
            )}
            <div className="flex items-center text-[10px] text-slate-400 dark:text-slate-500">
                <span className="mr-1 opacity-70">Interpreted as:</span>
                <LatexRenderer content={interpretationText} className="truncate max-w-[250px] italic" />
            </div>
        </div>
      </div>

      {/* 2. ADAPTIVE RESULT DISPLAY */}
      {useHeroMode ? (
        // === MODE A: HERO BOX (Calculator Style) ===
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md shadow-slate-200/40 dark:shadow-black/20 border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors w-full group">
          <div className="bg-slate-50/80 dark:bg-slate-800/80 px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Result</span>
            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <button 
                onClick={speakResult}
                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Read Aloud"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => navigator.clipboard.writeText(resultText)}
                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Copy Result"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="p-5 md:p-6 text-xl sm:text-2xl font-light text-slate-900 dark:text-slate-100 leading-relaxed">
             {resultParts.map((part, idx) => (
                <React.Fragment key={idx}>
                   {part.type === 'latex' 
                      ? <LatexRenderer content={part.content.startsWith('$$') ? part.content : `$$${part.content}$$`} />
                      : <InlineMarkdown content={part.content} />
                   }
                </React.Fragment>
             ))}
          </div>
        </div>
      ) : (
        // === MODE B: FLUID NARRATIVE (Article Style) ===
        <div className="relative pl-4 border-l-2 border-indigo-200 dark:border-indigo-900/50 py-1">
           <div className="text-base sm:text-lg text-slate-800 dark:text-slate-200 leading-relaxed">
              {resultParts.map((part, idx) => (
                <React.Fragment key={idx}>
                   {part.type === 'latex' 
                      ? <LatexRenderer content={`$${part.content}$`} />
                      : <InlineMarkdown content={part.content} />
                   }
                </React.Fragment>
             ))}
           </div>
           
           <div className="flex space-x-2 mt-2 opacity-60 hover:opacity-100 transition-opacity">
               <button onClick={speakResult} className="flex items-center space-x-1 text-[10px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <Volume2 className="w-3 h-3" />
                <span>Listen</span>
              </button>
              <button onClick={() => navigator.clipboard.writeText(resultText)} className="flex items-center space-x-1 text-[10px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
           </div>
        </div>
      )}

      {/* 3. VISUALIZATION */}
      {response.chart && (
        <div className="w-full">
          <ChartVisualization config={response.chart} isDarkMode={isDarkMode} />
        </div>
      )}

      {/* 4. DETAILED SECTIONS */}
      <div className="flex flex-col space-y-3 w-full">
        {response.sections && response.sections.map((section, idx) => {
          // Skip first section if it duplicates result logic (heuristic)
          if (!useHeroMode && idx === 0 && section.type === 'text' && section.content.includes(resultText.substring(0, 50))) {
            return null;
          }

          const isCode = section.type === 'code';
          return (
            <div key={idx} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 transition-colors w-full`}>
              <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              {isCode ? (
                <CodeBlock code={section.content} language={detectLanguage(section.content, section.title)} />
              ) : section.type === 'list' ? (
                <ul className="list-disc pl-4 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {section.content.split('\n').map((line, i) => (
                    <li key={i} className="pl-1 leading-relaxed">
                      <LatexRenderer content={line.replace(/^[•-]\s*/, '')} />
                    </li>
                  ))}
                </ul>
              ) : (
                <SectionMarkdownContent content={section.content} />
              )}
            </div>
          );
        })}
      </div>
      
      {/* 5. SUGGESTIONS */}
      {response.suggestions && response.suggestions.length > 0 && onSuggestionClick && (
         <div className="w-full mt-1">
            <h4 className="flex items-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">
               <Lightbulb className="w-3 h-3 mr-1.5" />
               Explore Further
            </h4>
            <div className="flex flex-wrap gap-2">
               {response.suggestions.map((suggestion, idx) => (
                  <button
                     key={idx}
                     onClick={() => onSuggestionClick(suggestion)}
                     className="group flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 rounded-full text-xs text-slate-600 dark:text-slate-300 shadow-sm transition-all hover:shadow-md hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                     <span>{suggestion}</span>
                     <ArrowRight className="w-3 h-3 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </button>
               ))}
            </div>
         </div>
      )}

      {/* 6. SOURCES */}
      {response.sources && response.sources.length > 0 && (
        <div className="w-full bg-slate-50 dark:bg-slate-800/30 rounded-xl px-4 py-3 border border-slate-100 dark:border-slate-800 transition-colors mt-1">
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center">
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
                className="inline-flex items-center px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors truncate max-w-[200px]"
              >
                <span className="truncate">{source.title}</span>
                <ExternalLink className="w-2.5 h-2.5 ml-1.5 opacity-50 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
