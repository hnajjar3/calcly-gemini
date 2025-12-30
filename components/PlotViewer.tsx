import { forwardRef, useImperativeHandle, useRef } from 'react';
import Plot from 'react-plotly.js';
import { PlotData, Interaction } from '../lib/runtime';
import { InteractiveControls } from './InteractiveControls';

export interface PlotViewerHandle {
    getPlotImage: () => Promise<string | null>;
}

interface PlotViewerProps {
    plots: PlotData[];
    theme: 'light' | 'dark';
    activeInteraction?: Interaction | null;
    onUpdateInteraction?: (id: string, values: Record<string, number>) => void;
}

export const PlotViewer = forwardRef<PlotViewerHandle, PlotViewerProps>(({ plots, theme, activeInteraction, onUpdateInteraction }, ref) => {
    const plotRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
        getPlotImage: async () => {
            if (!plotRef.current || plots.length === 0) return null;
            try {
                // Access the underlying Plotly object through the react-plotly.js ref
                // The library exposes 'el' property or we can use plot component instance method if available
                // react-plotly.js uses 'editor' property for accesses or we can use Plotly library method on the element
                // But the easiest way provided by react-plotly.js is usually accessing the el property or using standard Plotly.toImage

                // Better approach: Usage of the library's `toImage` utility on the graph div.
                // However, react-plotly.js component ref has direct methods? No, it wraps the div.
                // Let's rely on standard Plotly.toImage if we can getting the node.
                // Actually the simplest for react-plotly is usually:
                // const graphDiv = plotRef.current.el;
                // return await Plotly.toImage(graphDiv, {format: 'png', height: 600, width: 800});

                // We need to import Plotly to do that? 'react-plotly.js' bundles it but doesn't easily export the static `toImage` method 
                // unless we import 'plotly.js' separately or use the instance.
                // Ah, the instance `plotRef.current` likely exposes `el` which is the DOM node.
                // But we don't have global `Plotly` variable. 
                // Wait, `react-plotly.js` creates a `Plot` component. 

                // Let's try to get the node and use the window.Plotly (injected in index.html) or just assume valid ref.
                // Actually, since we don't import Plotly directly here (it's in Runtime via CDN), we might not have it in module scope.
                // But `index.html` loads it globally? Wait, no, `PlotViewer` uses `import Plot from 'react-plotly.js'`.
                // That imports a bundled version. 

                // Let's traverse the ref properly. 
                const graphDiv = plotRef.current?.el;
                if (!graphDiv) return null;

                // Use the globally exposed Plotly if available (since we saw it in index.html?), 
                // OR simpler: react-plotly.js ref might not expose `toImage`.
                // BUT, standard Plotly.toImage(graphDiv) is the standard way.
                // Is `Plotly` global? Yes, we saw `window.Plotly` or similar in `index.html`? 
                // No, index.html loaded `nerdamer`, `algebrite`, `mathjs` but NOT plotly CDN. 
                // `package.json` has `plotly.js` and `react-plotly.js`.
                // So `react-plotly.js` bundles it.

                // We can import the static method from plotly.js if we installed it.
                // Let's try dynamic import or just use the global if it exists which it might not.

                // Safe bet: Import Plotly from 'plotly.js' to use `toImage`.
                // But that increases bundle size? It's already there for the component.
                // Let's try:
                // const Plotly = (await import('plotly.js-dist-min')).default;
                // package.json has "plotly.js".
                const { toImage } = await import('plotly.js');
                return await toImage(graphDiv, { format: 'png', width: 800, height: 600 });
            } catch (e) {
                console.error("Failed to capture plot image", e);
                return null;
            }
        }
    }));

    // ... (rest of render)
    // Update Plot component: ref={plotRef}

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
                    ref={plotRef}
                    data={latestPlot.data}
                    layout={mergedLayout}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    config={{ responsive: true, displaylogo: false }}
                />
            </div>
        </div>
    );
}); // Close the forwardRef correctly
