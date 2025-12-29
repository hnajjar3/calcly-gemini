import React from 'react';
import { Variable } from '../lib/runtime';

interface WorkspaceViewerProps {
    variables: Variable[];
}

export const WorkspaceViewer: React.FC<WorkspaceViewerProps> = ({ variables }) => {
    return (
        <div className="h-full w-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Workspace</span>
            </div>
            <div className="flex-grow overflow-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Value</th>
                            <th className="px-4 py-2">Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        {variables.map((v) => (
                            <tr key={v.name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="px-4 py-2 font-mono text-indigo-600 dark:text-indigo-400 font-medium">{v.name}</td>
                                <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300 truncate max-w-[150px]" title={String(v.value)}>
                                    {String(v.value)}
                                </td>
                                <td className="px-4 py-2 text-slate-400 text-xs italic">{v.type}</td>
                            </tr>
                        ))}
                        {variables.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-10 text-center text-slate-400 italic">
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
