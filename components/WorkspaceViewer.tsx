import React, { useRef, useEffect } from 'react';
import { Variable, runtime } from '../lib/runtime';
import { Trash2, X, Activity, Upload } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// --- Sub-Components ---

const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
    if (!data || data.length === 0) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const height = 30;
    const width = 100;

    // Create SVG Path
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height; // Invert Y
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="w-full h-8 bg-slate-100 dark:bg-slate-900/50 rounded flex items-center overflow-hidden relative">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="stroke-indigo-500 fill-none stroke-[2px]">
                <polyline points={points} />
            </svg>
        </div>
    );
};

const LatexPreview: React.FC<{ latex: string }> = ({ latex }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                katex.render(latex, containerRef.current, {
                    throwOnError: false,
                    displayMode: false,
                    maxExpand: 100
                });
            } catch (e) {
                containerRef.current.innerText = latex;
            }
        }
    }, [latex]);

    return <div ref={containerRef} className="text-slate-700 dark:text-slate-200 text-lg overflow-x-auto py-1" />;
};

const MatrixPreview: React.FC<{ heatmap: NonNullable<Variable['metadata']>['heatmap'] }> = ({ heatmap }) => {
    if (!heatmap) return null;
    const { grid, min, max, rows, cols } = heatmap;
    const range = max - min || 1;

    return (
        <div className="flex gap-2 items-center w-full">
            <div className="grid gap-[1px] bg-slate-200 dark:bg-slate-700 p-[1px] rounded overflow-hidden"
                style={{
                    gridTemplateColumns: `repeat(${grid[0].length}, 1fr)`,
                    width: '40px',
                    height: '40px'
                }}>
                {grid.flat().map((val, i) => {
                    const opacity = 0.2 + ((val - min) / range) * 0.8;
                    return (
                        <div key={i} className="bg-indigo-500" style={{ opacity }} />
                    );
                })}
            </div>
            <div className="text-[10px] text-slate-400 flex flex-col">
                <span>{rows}×{cols}</span>
                <span>Matrix</span>
            </div>
        </div>
    );
};

const VariableCard: React.FC<{ variable: Variable; highlight?: 'new' | 'update' | null; onDelete?: (name: string) => void }> = ({ variable, highlight, onDelete }) => {
    const { name, value, metadata } = variable;

    const renderPreview = () => {
        if (!metadata) return <span className="text-slate-500 truncate">{String(value)}</span>;

        switch (metadata.type) {
            case 'array':
                return metadata.sparkline ? <Sparkline data={metadata.sparkline} /> : <span className="text-xs text-slate-500">Array</span>;
            case 'matrix':
                return metadata.heatmap ? <MatrixPreview heatmap={metadata.heatmap} /> : <span className="text-xs text-slate-500">Matrix</span>;
            case 'scalar':
                return <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold truncate">{String(value)}</span>;
            case 'symbolic':
                return <LatexPreview latex={metadata.latex || String(value)} />;
            default:
                return <span className="text-slate-500 truncate">{String(value)}</span>;
        }
    };

    return (
        <div className={`group relative bg-white dark:bg-slate-800/80 border rounded-lg p-3 transition-all hover:shadow-md cursor-pointer
            ${highlight === 'new' ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                highlight === 'update' ? 'border-yellow-500 ring-1 ring-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]' :
                    'border-slate-200 dark:border-slate-700/50 hover:border-indigo-500 dark:hover:border-indigo-500'}`}>
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm overflow-hidden text-ellipsis max-w-[100px]" title={name}>{name}</span>
                    <span className="text-[10px] uppercase text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{metadata?.type || 'var'}</span>
                    {highlight === 'new' && <span className="text-[10px] uppercase text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded font-bold animate-pulse">New</span>}
                    {highlight === 'update' && <span className="text-[10px] uppercase text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded font-bold animate-pulse">Upd</span>}
                </div>
                {onDelete && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(name); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <div className="h-8 flex items-center">
                {renderPreview()}
            </div>
        </div>
    );
};


interface WorkspaceViewerProps {
    variables: Variable[];
    onClear?: () => void;
    onDeleteVariable?: (name: string) => void;
}

export const WorkspaceViewer: React.FC<WorkspaceViewerProps> = ({ variables, onClear, onDeleteVariable }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const prevVariablesRef = useRef<Variable[]>([]);
    const [highlights, setHighlights] = React.useState<Record<string, 'new' | 'update'>>({});

    // Detect changes for highlighting
    useEffect(() => {
        const prev = prevVariablesRef.current;
        const newHighlights: Record<string, 'new' | 'update'> = {};
        let hasChanges = false;

        variables.forEach(v => {
            const oldVar = prev.find(p => p.name === v.name);
            if (!oldVar) {
                // New Variable
                newHighlights[v.name] = 'new';
                hasChanges = true;
            } else if (JSON.stringify(v.value) !== JSON.stringify(oldVar.value)) {
                // Updated Variable
                newHighlights[v.name] = 'update';
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setHighlights(prevH => ({ ...prevH, ...newHighlights }));
            // Clear bubbles after 2 seconds
            setTimeout(() => {
                setHighlights((current) => {
                    const next = { ...current };
                    Object.keys(newHighlights).forEach(k => delete next[k]);
                    return next;
                });
            }, 2000);
        }

        prevVariablesRef.current = variables;
    }, [variables]);

    const injectData = (name: string, data: any) => {
        const json = JSON.stringify(data);
        // We use the runtime to inject this directly
        runtime.execute(`
            // Data imported from ${name}
            const ${name} = ${json};
            console.log("Imported dataset '${name}' with " + ${name}.length + " rows.");
        `);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                complete: (results) => {
                    injectData(fileName, results.data);
                },
                error: (err) => {
                    alert(`Error parsing CSV: ${err.message}`);
                }
            });
        } else if (file.name.match(/\.xlsx?$/)) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                injectData(fileName, jsonData);
            };
            reader.readAsBinaryString(file);
        } else {
            alert('Unsupported file type. Please use .csv or .xlsx');
        }

        // Reset input
        e.target.value = '';
    };

    return (
        <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            <div className="px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-end items-center shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-slate-500 hover:text-indigo-500 transition-colors p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                        title="Import Data (CSV/Excel)"
                    >
                        <Upload className="w-3.5 h-3.5" />
                    </button>
                    {onClear && variables.length > 0 && (
                        <button
                            onClick={onClear}
                            className="text-slate-500 hover:text-red-500 active:text-red-700 transition-colors p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Clear Workspace"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv, .xlsx, .xls"
                    className="hidden"
                />
            </div>

            <div className="flex-grow overflow-y-auto p-3">
                <div className="space-y-2">
                    {variables.map((v) => (
                        <VariableCard key={v.name} variable={v} highlight={highlights[v.name]} onDelete={onDeleteVariable} />
                    ))}
                    {variables.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center">
                            <Activity className="w-8 h-8 mb-2 opacity-50" />
                            <p className="text-sm">Workspace Empty</p>
                            <p className="text-xs opacity-60">Run code to define variables</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
