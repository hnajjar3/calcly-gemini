import React, { useState, useEffect, useRef } from 'react';
import { LogEntry } from '../lib/runtime';
import { Trash2, Sparkles, Bug } from 'lucide-react';

interface CommandWindowProps {
    logs: LogEntry[];
    onExecute: (command: string) => void;
    onSmartExecute?: (command: string) => void;
    onClear?: () => void;
    onDebug?: (error: string) => void;
}

export const CommandWindow: React.FC<CommandWindowProps> = ({ logs, onExecute, onSmartExecute, onClear, onDebug }) => {
    const [input, setInput] = useState('');
    const [isSmartMode, setIsSmartMode] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim()) {
                if (isSmartMode && onSmartExecute) {
                    onSmartExecute(input);
                } else {
                    onExecute(input);
                }
                setInput('');
            }
        }
    };

    return (
        <div className="h-full w-full flex flex-col bg-slate-900 border-t border-slate-700 font-mono text-sm">
            <div className="px-4 py-1.5 bg-slate-800 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span>{isSmartMode ? 'Smart Console' : 'Terminal'}</span>
                    <button
                        onClick={() => setIsSmartMode(!isSmartMode)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-all border ${isSmartMode ? 'bg-purple-500/10 border-purple-500/50 text-purple-400' : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-300'}`}
                        title="Toggle AI Command Translation"
                    >
                        <Sparkles className="w-3 h-3" />
                        <span className="text-[10px]">{isSmartMode ? 'AI ON' : 'AI OFF'}</span>
                    </button>
                </div>
                {onClear && (
                    <button
                        onClick={onClear}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                        title="Clear Terminal"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            <div className="flex-grow overflow-y-auto p-4 space-y-1">
                {logs.map((log) => (
                    <div key={log.id} className={`group flex items-start gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-amber-400' : 'text-slate-300'}`}>
                        <div className="flex-grow">
                            <span className="opacity-50 text-[10px] mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            {log.type === 'log' && <span className="text-green-500 mr-2">»</span>}
                            <span className="whitespace-pre-wrap">{log.message}</span>
                        </div>
                        {log.type === 'error' && onDebug && (
                            <button
                                onClick={() => onDebug(log.message)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
                                title="Debug with AI"
                            >
                                <Bug className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className={`p-2 flex items-center gap-2 border-t transition-colors ${isSmartMode ? 'bg-purple-900/20 border-purple-500/30' : 'bg-slate-800 border-slate-700'}`}>
                <span className={`font-bold transition-colors ${isSmartMode ? 'text-purple-400' : 'text-green-500'}`}>
                    {isSmartMode ? '✨' : '›'}
                </span>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-grow bg-transparent border-none outline-none text-white font-mono placeholder-slate-500"
                    placeholder={isSmartMode ? "Ask AI to code (e.g. 'solve x^2-1')..." : ">> Enter JS commands..."}
                    autoFocus
                />
            </div>
        </div>
    );
};
