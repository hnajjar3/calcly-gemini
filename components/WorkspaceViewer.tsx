import React, { useRef } from 'react';
import { Variable, runtime } from '../lib/runtime';
import { Trash2, X, Upload } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface WorkspaceViewerProps {
    variables: Variable[];
    onClear?: () => void;
    onDeleteVariable?: (name: string) => void;
}

export const WorkspaceViewer: React.FC<WorkspaceViewerProps> = ({ variables, onClear, onDeleteVariable }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                complete: (results) => {
                    const data = results.data;
                    injectData(fileName, data);
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

    const injectData = (name: string, data: any) => {
        const json = JSON.stringify(data);
        // We use the runtime to inject this directly
        // Note: For very large datasets, this might block the UI.
        // Ideally we would chunk this or use a more efficient transfer, but for <10MB JSON stringify is usually fine in modern V8.
        runtime.execute(`
            // Data imported from ${name}
            const ${name} = ${json};
            console.log("Imported dataset '${name}' with " + ${name}.length + " rows.");
        `);
    };

    return (
        <div className="h-full w-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Workspace</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-slate-500 hover:text-indigo-500 transition-colors p-1"
                        title="Import Data (CSV/Excel)"
                    >
                        <Upload className="w-3.5 h-3.5" />
                    </button>
                    {onClear && variables.length > 0 && (
                        <button
                            onClick={onClear}
                            className="text-slate-500 hover:text-red-500 active:text-red-700 transition-colors p-1"
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
            <div className="flex-grow overflow-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Value</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-2 py-2 w-8"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {variables.map((v) => (
                            <tr key={v.name} className="group border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="px-4 py-2 font-mono text-indigo-600 dark:text-indigo-400 font-medium">{v.name}</td>
                                <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300 truncate max-w-[150px]" title={String(v.value)}>
                                    {String(v.value)}
                                </td>
                                <td className="px-4 py-2 text-slate-400 text-xs italic">{v.type}</td>
                                <td className="px-2 py-2 text-right">
                                    {onDeleteVariable && (
                                        <button
                                            onClick={() => onDeleteVariable(v.name)}
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1"
                                            title={`Delete ${v.name}`}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {variables.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-slate-400 italic">
                                    No variables in scope.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
