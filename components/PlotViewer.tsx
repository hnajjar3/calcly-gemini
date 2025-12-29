import React from 'react';
import Plot from 'react-plotly.js';
import { PlotData } from '../lib/runtime';

interface PlotViewerProps {
    plots: PlotData[];
}

export const PlotViewer: React.FC<PlotViewerProps> = ({ plots }) => {
    if (plots.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-400">
                <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                    <p className="text-sm">No plots generated yet.</p>
                    <p className="text-xs opacity-70 mt-1">Use <code>plot(data)</code> to visualize.</p>
                </div>
            </div>
        );
    }

    const latestPlot = plots[plots.length - 1];

    return (
        <div className="h-full w-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plots</span>
                <span className="text-xs text-slate-400">Plot {plots.length}</span>
            </div>
            <div className="flex-grow relative">
                <Plot
                    data={latestPlot.data}
                    layout={{
                        ...latestPlot.layout,
                        autosize: true,
                        margin: { l: 50, r: 20, t: 30, b: 50 },
                        paper_bgcolor: 'transparent',
                        plot_bgcolor: 'transparent',
                        font: { color: '#888' }
                    }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    config={{ responsive: true }}
                />
            </div>
        </div>
    );
};
