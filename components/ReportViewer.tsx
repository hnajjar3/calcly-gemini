import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import KaTeX styles
import { Printer, Download, Edit, Eye, Save } from 'lucide-react';
import { useState } from 'react';

interface ReportViewerProps {
    markdown: string;
    onChange?: (newMarkdown: string) => void;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ markdown, onChange }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localMarkdown, setLocalMarkdown] = useState(markdown);

    // Sync local state when prop changes (unless editing to avoid overwrites)
    React.useEffect(() => {
        if (!isEditing) setLocalMarkdown(markdown);
    }, [markdown, isEditing]);

    // Handle print events to force light mode
    React.useEffect(() => {
        // Better approach: Check if 'dark' is present before we remove it.
        let removedDark = false;
        const beforePrint = () => {
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                removedDark = true;
            }
        };
        const afterPrint = () => {
            if (removedDark) {
                document.documentElement.classList.add('dark');
                removedDark = false;
            }
        };

        window.addEventListener('beforeprint', beforePrint);
        window.addEventListener('afterprint', afterPrint);
        return () => {
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
        };
    }, []);

    const handleSave = () => {
        if (onChange) onChange(localMarkdown);
        setIsEditing(false);
    };

    const handleDownload = () => {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!markdown && !isEditing) {
        return (
            <div className="h-full w-full flex items-center justify-center text-slate-400 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
                <div className="text-center">
                    <p className="text-sm">No report generated yet.</p>
                    <p className="text-sm opacity-70 mt-1">Run your script and click 'Publish' to generate a report.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col bg-slate-200 dark:bg-slate-950 overflow-hidden relative">
            {/* Toolbar - Hidden when printing */}
            <div className="h-10 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 shrink-0 print:hidden">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Document View</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => {
                            if (isEditing) handleSave();
                            else setIsEditing(true);
                        }}
                        className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${isEditing ? 'text-emerald-400' : 'text-slate-300'}`}
                        title={isEditing ? "Save & Preview" : "Edit Report"}
                    >
                        {isEditing ? <Eye className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                    </button>
                    <div className="w-px h-4 bg-slate-700 mx-1" />
                    <button onClick={handleDownload} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors" title="Download Markdown">
                        <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => window.print()} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors" title="Print / Save as PDF">
                        <Printer className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-grow overflow-auto flex justify-center items-start p-8 print:p-0 print:block">
                /* Print Styles Injection */
                <style>{`
                    @media print {
                        @page { size: auto; margin: 20mm; } 

                        /* 1. RESET EVERYTHING: Ensure full page scrolling/overflow is possible */
                        html, body, #root {
                            height: auto !important;
                            min-height: 100vh !important;
                            overflow: visible !important;
                            overflow-y: visible !important;
                            width: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            background-color: white !important;
                        }

                        /* 2. Hide everything by default (the app UI) */
                        body * {
                            display: none !important;
                        }

                        /* 3. Make the Print Target Visible & Flow Correctly */
                        /* We must select the target and ALL its descendants */
                        .print-target, .print-target * {
                            display: block !important;
                            visibility: visible !important;
                            color: black !important;
                        }
                        
                        /* Restore flex/grid for inner elements if needed, but 'block' is safest for the main wrapper */
                        .print-target article {
                            display: block !important;
                        }
                        
                        /* Specific display overrides for inner elements */
                        .print-target img { display: inline-block !important; }
                        .print-target span { display: inline !important; }
                        .print-target p { display: block !important; }
                        .print-target .katex-display { display: block !important; }

                        /* 4. Position the Print Target at the very top */
                        .print-target {
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            width: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            
                            /* Critical for multi-page: Allow height to grow indefinitely */
                            height: auto !important;
                            overflow: visible !important;
                            
                            /* Reset shadows/bg */
                            box-shadow: none !important;
                            background: white !important;
                        }

                        /* 5. Pagination Controls */
                        h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
                        p, pre, blockquote, ul, ol, .katex-display { break-inside: avoid; page-break-inside: avoid; }
                        img { break-inside: avoid; page-break-inside: avoid; max-width: 100% !important; }

                        /* Math styling adjustments for print */
                        .katex { color: black !important; }
                    }
                `}</style>

                {isEditing ? (
                    <div className="w-[210mm] h-full min-h-[500px] flex flex-col shadow-xl">
                        <textarea
                            value={localMarkdown}
                            onChange={(e) => setLocalMarkdown(e.target.value)}
                            className="flex-grow w-full p-8 font-mono text-sm bg-slate-50 text-slate-900 focus:outline-none resize-none"
                            placeholder="Type markdown here..."
                        />
                    </div>
                ) : (
                    <div className="print-target bg-white text-black shadow-2xl w-[210mm] min-h-[297mm] h-fit p-[25mm] shrink-0 font-serif mb-8">
                        <article className="prose max-w-none text-black prose-headings:font-bold prose-headings:font-sans prose-h1:text-4xl prose-h1:mb-8 prose-h2:text-2xl prose-h2:mt-6 prose-p:leading-7 prose-p:text-justify prose-a:text-blue-700 prose-img:rounded-sm">
                            <style>{`
                                .prose .katex { color: black !important; }
                                /* Force block display and centering for display-mode math */
                                .prose .katex-display {
                                    display: block !important;
                                    text-align: center !important;
                                    margin: 1.5em auto !important;
                                    width: 100%;
                                    overflow-x: auto;
                                }
                                /* Ensure the inner container is also centered if it behaves as inline-block */
                                .prose .katex-display > .katex {
                                    display: inline-block;
                                    text-align: center;
                                }
                                /* Hide the scrollbar for math unless needed */
                                .prose .katex-display::-webkit-scrollbar { height: 4px; }
                                .prose .katex-display::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
                            `}</style>
                            <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[[rehypeKatex, { strict: false }]]}
                                components={{
                                    p: ({ node, children }) => <p className="mb-4">{children}</p>
                                }}
                            >
                                {markdown}
                            </ReactMarkdown>
                        </article>
                    </div>
                )}
            </div>
        </div>
    );
};
