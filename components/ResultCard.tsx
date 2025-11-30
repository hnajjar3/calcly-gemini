
import React from 'react';
import { HistoryItem } from '../types';
import { ChartVisualization } from './ChartVisualization';
import { Copy, Share2, Sparkles, AlertTriangle, Zap, Brain, Image as ImageIcon, ExternalLink } from 'lucide-react';

interface Props {
  item: HistoryItem;
}

export const ResultCard: React.FC<Props> = ({ item }) => {
  if (item.loading) {
    return (
      <div className="w-full max-w-4xl mx-auto mb-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-pulse">
        <div className="flex items-center space-x-3 mb-6">
           <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
             <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
           </div>
           <div className="h-4 bg-slate-200 rounded w-1/3"></div>
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-slate-100 rounded-lg w-full"></div>
          <div className="h-40 bg-slate-100 rounded-lg w-full"></div>
        </div>
      </div>
    );
  }

  if (item.error) {
     return (
      <div className="w-full max-w-4xl mx-auto mb-8 bg-red-50 rounded-2xl shadow-sm border border-red-100 p-6">
        <div className="flex items-center space-x-3 text-red-700 mb-2">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="font-semibold">Something went wrong</h3>
        </div>
        <p className="text-red-600">{item.error}</p>
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
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{item.query}</h2>
            {item.attachedImage && (
              <div className="mt-2 inline-flex items-center px-2 py-1 bg-slate-100 rounded-md text-xs text-slate-500 border border-slate-200">
                <ImageIcon className="w-3 h-3 mr-1.5" />
                Image Attached
              </div>
            )}
            <div className="flex items-center space-x-2 mt-2 text-sm text-slate-500">
              <span className="font-medium text-indigo-600">Interpreted as:</span>
              <span>{response.interpretation}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
             {item.modelMode === 'pro' ? (
               <div className="flex items-center px-2 py-1 bg-gradient-to-r from-violet-100 to-indigo-100 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-200">
                 <Brain className="w-3 h-3 mr-1" />
                 Pro Intelligence
               </div>
             ) : (
               <div className="flex items-center px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold border border-amber-200">
                 <Zap className="w-3 h-3 mr-1" />
                 Fast Mode
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Main Result */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="bg-indigo-50/50 px-6 py-4 border-b border-indigo-50 flex justify-between items-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Result</span>
          <div className="flex space-x-2">
            <button className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-8">
          <div className="text-3xl sm:text-4xl font-light text-slate-900 leading-tight">
            {response.result}
          </div>
        </div>
      </div>

      {/* Visualization if present */}
      {response.chart && (
        <div className="mb-6">
          <ChartVisualization config={response.chart} />
        </div>
      )}

      {/* Detailed Sections */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 mb-6">
        {response.sections.map((section, idx) => (
          <div key={idx} className={`bg-white rounded-xl border border-slate-200 p-5 ${section.type === 'code' ? 'col-span-full' : ''}`}>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
              {section.title}
            </h3>
            <div className={`text-slate-700 leading-relaxed ${section.type === 'code' ? 'font-mono text-sm bg-slate-50 p-4 rounded-lg overflow-x-auto' : ''}`}>
              {section.type === 'list' ? (
                <ul className="list-disc pl-5 space-y-1">
                  {section.content.split('\n').map((line, i) => (
                    <li key={i}>{line.replace(/^[•-]\s*/, '')}</li>
                  ))}
                </ul>
              ) : (
                <div className="whitespace-pre-wrap">{section.content}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sources / Grounding */}
      {response.sources && response.sources.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
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
                className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm"
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
