
import React, { useEffect, useRef, useState } from 'react';
import { HistoryItem, ResultPart, Section, TableData } from '../types';
import { ChartVisualization } from './ChartVisualization';
import { LatexRenderer, splitLatex } from './LatexRenderer';
import { Copy, Sparkles, AlertTriangle, Zap, Brain, Image as ImageIcon, ExternalLink, RefreshCw, ArrowRight, Lightbulb, Mic, Volume2, Check } from '../components/icons';

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
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current && typeof Prism !== 'undefined') {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-[#2d2d2d] my-2 shadow-sm w-full">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
           onClick={handleCopy}
           className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md backdrop-blur-sm transition-colors"
           title="Copy Code"
        >
          {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
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

// Component to render robust Markdown + LaTeX using safe parser
const RobustMarkdown: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;
  
  // Use safe tokenizer instead of regex with lookbehind
  const tokens = splitLatex(content);
  
  // Reconstruct string with placeholders for Markdown processing
  const placeholders: string[] = [];
  let processed = '';

  tokens.forEach((token) => {
    if (token.type === 'text') {
      processed += token.content;
    } else {
      placeholders.push(token.type === 'block' ? `$$${token.content}$$` : `$${token.content}$`);
      processed += `LATEXPLACEHOLDER${placeholders.length - 1}ENDLATEXPLACEHOLDER`;
    }
  });

  // 2. Render Markdown
  const markedLib = (window as any).marked;
  if (markedLib) {
     try {
       // Using standard block parse for robust rendering
       processed = markedLib.parse(processed, { breaks: true, gfm: true });
     } catch (e) {
       console.error("Markdown parsing failed", e);
     }
  }

  // 3. Restore LaTeX
  processed = processed.replace(/LATEXPLACEHOLDER(\d+)ENDLATEXPLACEHOLDER/g, (_, index) => {
      const mathFull = placeholders[parseInt(index)];
      // Check if block or inline based on $$ wrapper
      const isBlock = mathFull.startsWith('$$');
      const innerContent = isBlock ? mathFull.slice(2, -2) : mathFull.slice(1, -1);
      
      try {
          return katex.renderToString(innerContent, { 
            displayMode: isBlock, 
            throwOnError: false 
          });
      } catch(e) { 
          return mathFull; 
      }
  });

  return (
    <div className="markdown-content text-sm text-slate-700 dark:text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: processed }} />
  );
};

// New Structured Table Renderer
const TableSection: React.FC<{ data: TableData }> = ({ data }) => {
  if (!data || !data.rows || data.rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800/50 my-3">
      <table className="w-full text-sm text-left border-collapse">
        {data.headers && data.headers.length > 0 && (
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400 font-semibold tracking-wider">
            <tr>
              {data.headers.map((h, i) => (
                <th key={i} className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {data.rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {/* Render each cell using LatexRenderer with markdown support enabled */}
                  <LatexRenderer content={cell} renderMarkdown={true} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const ResultCard: React.FC<Props> = ({ item, isDarkMode, onRetry, onSuggestionClick }) => {
  const [isCopied, setIsCopied] = useState(false);

  if (item.loading) {
    return (
      <div className="w-full max-w-3xl mx-auto bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700/50 animate-pulse">
        <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-full"></div>
          <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-5/6"></div>
          <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (item.error) {
    return (
      <div className="w-full max-w-3xl mx-auto bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl p-6 shadow-sm flex items-start space-x-4">
        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 dark:text-red-300 mb-1">Unable to process request</h3>
          <p className="text-sm text-red-700 dark:text-red-400 mb-4">{item.error}</p>
          {onRetry && (
            <button 
              onClick={() => onRetry(item.id)}
              className="px-4 py-2 bg-white dark:bg-red-900/40 text-red-600 dark:text-red-300 text-sm font-medium rounded-lg border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/60 transition-colors flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  const { response } = item;
  if (!response) return null;

  const handleCopy = () => {
    const text = response.result.map(r => r.content).join('\n');
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-indigo-500/5 dark:shadow-black/20 border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300 animate-fade-in-up">
      
      {/* Header / Interpretation */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-700/50">
         <div className="flex items-start justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
              {response.interpretation || item.query}
            </h2>
            <div className="flex items-center space-x-2">
                <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center ${item.modelMode === 'pro' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                    {item.modelMode === 'pro' ? <Brain className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                    {item.modelMode === 'pro' ? 'PRO' : 'FLASH'}
                </div>
            </div>
         </div>
         <p className="text-xs text-slate-400 mt-1 italic">
            Interpreted as: {response.interpretation}
         </p>
      </div>

      {/* Main Result */}
      <div className="p-6 bg-indigo-50/50 dark:bg-indigo-900/10">
         <div className="text-lg text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
            {response.result.map((part, idx) => {
              if (!part.content || !part.content.trim()) return null;

              if (part.type === 'latex') {
                let clean = part.content.trim();
                
                // Recursively strip delimiters to handle double-wrapping (e.g. $$$$ ... $$$$)
                // or mixed delimiters ($ ... $) returned by AI to ensure we have raw latex
                let changed = true;
                while (changed) {
                    changed = false;
                    if (clean.startsWith('$$') && clean.endsWith('$$') && clean.length >= 4) {
                        clean = clean.slice(2, -2).trim();
                        changed = true;
                    } else if (clean.startsWith('$') && clean.endsWith('$') && clean.length >= 2) {
                        clean = clean.slice(1, -1).trim();
                        changed = true;
                    } else if (clean.startsWith('\\(') && clean.endsWith('\\)') && clean.length >= 4) {
                        clean = clean.slice(2, -2).trim();
                        changed = true;
                    } else if (clean.startsWith('\\[') && clean.endsWith('\\]') && clean.length >= 4) {
                        clean = clean.slice(2, -2).trim();
                        changed = true;
                    }
                }
                
                if (!clean) return null;
                // Cleanly wrap in block math
                return <LatexRenderer key={idx} content={`$$${clean}$$`} className="my-2 block" />;
              } else {
                // Use RobustMarkdown for main result text to handle potential nested block markdown and LaTeX
                return <RobustMarkdown key={idx} content={part.content} />;
              }
            })}
         </div>

         {/* Audio/Copy Actions */}
         <div className="flex items-center space-x-4 mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-900/20 text-xs font-medium text-slate-500 dark:text-slate-400">
             <button className="flex items-center hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <Volume2 className="w-3.5 h-3.5 mr-1.5" />
                Listen
             </button>
             <button 
                onClick={handleCopy}
                className="flex items-center hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
             >
                {isCopied ? (
                    <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                    </>
                ) : (
                    <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Copy
                    </>
                )}
             </button>
         </div>
      </div>

      {/* Chart */}
      {response.chart && (
        <div className="px-6 pb-6">
           <ChartVisualization config={response.chart} isDarkMode={isDarkMode} />
        </div>
      )}

      {/* Detailed Sections */}
      {response.sections.length > 0 && (
        <div className="px-6 pb-6 space-y-6">
          {response.sections.map((section, idx) => (
            <div key={idx} className="border-t border-slate-100 dark:border-slate-700/50 pt-4 first:border-0 first:pt-0">
               <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center">
                  {section.title}
               </h3>
               
               {section.type === 'code' ? (
                 <CodeBlock code={section.content || ''} language={detectLanguage(section.content || '', section.title)} />
               ) : section.type === 'table' && section.tableData ? (
                 <TableSection data={section.tableData} />
               ) : (
                 <RobustMarkdown content={section.content || ''} />
               )}
            </div>
          ))}
        </div>
      )}

      {/* Sources / Grounding */}
      {response.sources && response.sources.length > 0 && (
        <div className="px-6 py-4 bg-slate-50 dark:bg-black/20 border-t border-slate-200 dark:border-slate-700">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sources</p>
           <div className="flex flex-wrap gap-2">
              {response.sources.map((source, i) => (
                <a 
                  key={i} 
                  href={source.uri} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-sm"
                >
                  <ExternalLink className="w-3 h-3 mr-1.5" />
                  <span className="truncate max-w-[150px]">{source.title}</span>
                </a>
              ))}
           </div>
        </div>
      )}

      {/* Suggestions */}
      {response.suggestions && response.suggestions.length > 0 && onSuggestionClick && (
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-800/80">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center">
               <Lightbulb className="w-3 h-3 mr-1.5" />
               Explore Further
            </p>
            <div className="flex flex-wrap gap-2">
               {response.suggestions.map((s, i) => (
                 <button
                   key={i}
                   onClick={() => onSuggestionClick(s)}
                   className="px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-100 dark:border-indigo-800"
                 >
                   {s}
                   <ArrowRight className="w-3 h-3 inline ml-1 opacity-50" />
                 </button>
               ))}
            </div>
        </div>
      )}

    </div>
  );
};
