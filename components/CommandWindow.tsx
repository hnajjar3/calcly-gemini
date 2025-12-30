import React, { useState, useEffect, useRef } from 'react';
import { LogEntry } from '../lib/runtime';
import { Trash2 } from 'lucide-react';

interface CommandWindowProps {
    logs: LogEntry[];
    onExecute: (command: string) => void;
    onClear?: () => void;
}

export const CommandWindow: React.FC<CommandWindowProps> = ({ logs, onExecute, onClear }) => {
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim()) {
                onExecute(input);
                setInput('');
            }
        }
    };

    return (
        <div className="h-full w-full flex flex-col bg-slate-900 border-t border-slate-700 font-mono text-sm">
            <div className="px-4 py-1.5 bg-slate-800 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
                <span>Command Window</span>
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
                    <div key={log.id} className={`${log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-amber-400' : 'text-slate-300'}`}>
                        <span className="opacity-50 text-[10px] mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        {log.type === 'log' && <span className="text-green-500 mr-2">»</span>}
                        <span className="whitespace-pre-wrap">{log.message}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="p-2 bg-slate-800 flex items-center gap-2">
                <span className="text-green-500 font-bold">›</span>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-grow bg-transparent border-none outline-none text-white font-mono placeholder-slate-600"
                    placeholder=">> Enter commands here..."
                    autoFocus
                />
            </div>
        </div>
    );
};
