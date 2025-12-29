import React from 'react';
import Plot from 'react-plotly.js';
import { PlotData, Interaction } from '../lib/runtime';
import { InteractiveControls } from './InteractiveControls';

interface PlotViewerProps {
    plots: PlotData[];
    theme: 'light' | 'dark';
    activeInteraction?: Interaction | null;
    onUpdateInteraction?: (id: string, values: Record<string, number>) => void;
}

export const PlotViewer: React.FC<PlotViewerProps> = ({ plots, theme, activeInteraction, onUpdateInteraction }) => {
    if (plots.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-400">
                <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                    <p className="text-sm">No plots generated yet.</p>
                    <p className="text-sm opacity-70 mt-1">Use <code>plot(data, layout)</code> to visualize.</p>
                </div>
            </div>
        );
    }

    const latestPlot = plots[plots.length - 1];

    // Intelligent Layout Merging
    // 1. Base Defaults (Theming)
    // Use High Contrast White for Dark Mode to ensure visibility
    const textColor = theme === 'dark' ? '#ffffff' : '#1e293b';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';

    const defaultLayout = {
        autosize: true,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: textColor, family: 'sans-serif', size: 12 },
        // Aggressive margins to ensure labels are visible
        margin: { l: 80, r: 40, t: 80, b: 80, pad: 4 },
        xaxis: {
            gridcolor: gridColor,
            zerolinecolor: gridColor,
            automargin: true,
            title: { font: { color: textColor, size: 14 }, standoff: 20 }
        },
        yaxis: {
            gridcolor: gridColor,
            zerolinecolor: gridColor,
            automargin: true,
            title: { font: { color: textColor, size: 14 }, standoff: 20 }
        },
        // Ensure main title color is set
        title: {
            font: { color: textColor, size: 18 }
        }
    };

    // 2. Merge with User Layout (User overrides defaults if specified)
    const userLayout = latestPlot.layout || {};

    const mergedLayout = {
        ...defaultLayout,
        ...userLayout,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',

        margin: { ...defaultLayout.margin, ...(userLayout.margin || {}) },
        font: { ...defaultLayout.font, ...(userLayout.font || {}) },

        // Deep merge axes carefully
        xaxis: {
            ...defaultLayout.xaxis,
            ...(userLayout.xaxis || {}),
            // Re-apply critical title color if user provided a string title or object title
            title: typeof userLayout.xaxis?.title === 'object'
                ? { ...defaultLayout.xaxis.title, ...userLayout.xaxis.title }
                : (userLayout.xaxis?.title ? { text: userLayout.xaxis.title, font: { color: textColor } } : defaultLayout.xaxis.title)
        },
        yaxis: {
            ...defaultLayout.yaxis,
            ...(userLayout.yaxis || {}),
            title: typeof userLayout.yaxis?.title === 'object'
                ? { ...defaultLayout.yaxis.title, ...userLayout.yaxis.title }
                : (userLayout.yaxis?.title ? { text: userLayout.yaxis.title, font: { color: textColor } } : defaultLayout.yaxis.title)
        },
        // Fix Main Title Color (Case: User passes string "Title" which overwrites default object)
        title: typeof userLayout.title === 'object'
            ? { ...defaultLayout.title, ...userLayout.title }
            : (userLayout.title ? { text: userLayout.title, font: { color: textColor, size: 18 } } : defaultLayout.title)
    };

    // Debugging: Check what is actually being rendered
    console.log("PlotViewer Merged Layout:", mergedLayout);

    return (
        <div className="h-full w-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plots</span>
                <span className="text-xs text-slate-400">Plot {plots.length}</span>
            </div>

            {/* Interactive Controls Panel */}
            {activeInteraction && onUpdateInteraction && (
                <InteractiveControls
                    interaction={activeInteraction}
                    onUpdate={onUpdateInteraction}
                />
            )}

            <div className="flex-grow relative min-h-0">
                <Plot
                    data={latestPlot.data}
                    layout={mergedLayout}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    config={{ responsive: true, displaylogo: false }}
                />
            </div>
        </div>
    );
};
