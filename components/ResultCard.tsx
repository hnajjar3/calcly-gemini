
import React from 'react';
import { HistoryItem } from '../types';
import { ChartVisualization } from './ChartVisualization';
import { Copy, Share2, Sparkles, AlertTriangle, Zap, Brain, Image as ImageIcon, ExternalLink, RefreshCw } from 'lucide-react';

// Access global KaTeX loaded via script tag in index.html
declare const katex: any;

interface Props {
  item: HistoryItem;
  isDarkMode: boolean;
  onRetry?: (id: string) => void;
}

// LaTeX Renderer Component
const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = '' }) => {
  // Split content by $$...$$ for block math and $...$ for inline math
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Block Math
          const math = part.slice(2, -2);
          try {
            const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        } else if (part.startsWith('$') && part.endsWith('$')) {
          // Inline Math
          const math = part.slice(1, -1);
          try {
            const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        } else {
          // Regular Text
          return <span key={index}>{part}</span>;
        }
      })}
    </span>
  );
};

export const ResultCard: React.FC<Props> = ({ item, isDarkMode, onRetry }) => {
  if (item.loading) {
    return (
      <div className="w-full max-w-4xl mx-auto mb-8 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 animate-pulse transition-colors">
        <div className="flex items-center space-x-3 mb-6">
           <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
             <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
           </div>
           <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full"></div>
          <div className="h-40 bg-slate-100 dark:bg-slate-700/50 rounded-lg w-full"></div>
        </div>
      </div>
    );
  }

  if (item.error) {
     return (
      <div className="w-full max-w-4xl mx-auto mb-8 bg-red-50 dark:bg-red-900/10 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 p-6 transition-colors">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 text-red-700 dark:text-red-400 mb-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-semibold">Something went wrong</h3>
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
        <p className="text-red-600 dark:text-red-300">{item.error}</p>
      </div>
    );
  }

  if (!item.response) return null;

  const { response } = item;

  return (
    <div className="w-full max-w-4xl mx-auto mb-12 bg-transparent">
      {/* Query Header */}
      <div className="mb-6 px-2">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{item.query}</h2>
            {item.attachedImage && (
              <div className="mt-2 inline-flex items-center px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <ImageIcon className="w-3 h-3 mr-1.5" />
                Image Attached
              </div>
            )}
            <div className="flex items-center space-x-2 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-indigo-600 dark:text-indigo-400">Interpreted as:</span>
              <LatexRenderer content={response.interpretation} />
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
             {item.modelMode === 'pro' ? (
               <div className="flex items-center px-2 py-1 bg-gradient-to-r from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold border border-indigo-200 dark:border-indigo-800">
                 <Brain className="w-3 h-3 mr-1" />
                 Pro Intelligence
               </div>
             ) : (
               <div className="flex items-center px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-semibold border border-amber-200 dark:border-amber-900/30">
                 <Zap className="w-3 h-3 mr-1" />
                 Fast Mode
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Main Result */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-black/30 border border-slate-100 dark:border-slate-700 overflow-hidden mb-6 transition-colors">
        <div className="bg-indigo-50/50 dark:bg-indigo-950/30 px-6 py-4 border-b border-indigo-50 dark:border-indigo-900/20 flex justify-between items-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Result</span>
          <div className="flex space-x-2">
            <button className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-8">
          <div className="text-3xl sm:text-4xl font-light text-slate-900 dark:text-slate-100 leading-tight">
            <LatexRenderer content={response.result} />
          </div>
        </div>
      </div>

      {/* Visualization if present */}
      {response.chart && (
        <div className="mb-6">
          <ChartVisualization config={response.chart} isDarkMode={isDarkMode} />
        </div>
      )}

      {/* Detailed Sections */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 mb-6">
        {response.sections.map((section, idx) => (
          <div key={idx} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 ${section.type === 'code' ? 'col-span-full' : ''} transition-colors`}>
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              {section.title}
            </h3>
            <div className={`text-slate-700 dark:text-slate-300 leading-relaxed ${section.type === 'code' ? 'font-mono text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-x-auto border border-slate-100 dark:border-slate-700' : ''}`}>
              {section.type === 'list' ? (
                <ul className="list-disc pl-5 space-y-1">
                  {section.content.split('\n').map((line, i) => (
                    <li key={i}>
                      <LatexRenderer content={line.replace(/^[•-]\s*/, '')} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="whitespace-pre-wrap">
                  <LatexRenderer content={section.content} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sources / Grounding */}
      {response.sources && response.sources.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 transition-colors">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center">
            <Sparkles className="w-3 h-3 mr-1" />
            Sources & Grounding
          </h4>
          <div className="flex flex-wrap gap-2">
            {response.sources.map((source, idx) => (
              <a 
                key={idx} 
                href={source.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors shadow-sm"
              >
                <span className="truncate max-w-[150px]">{source.title}</span>
                <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
