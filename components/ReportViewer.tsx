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
                {/* Print Styles Injection */}
                <style>{`
                    @media print {
                        @page { size: auto; margin: 20mm; } 

                        /* Force White Background Everywhere */
                        html, body, #root, html.dark, body.dark {
                            background-color: white !important;
                            color: black !important;
                            visibility: hidden;
                            height: auto !important;
                            overflow: visible !important;
                        }
                        
                        /* Hide everything by default */
                        body * { visibility: hidden; }

                        /* Show the print target */
                        .print-target, .print-target * { 
                            visibility: visible; 
                        }

                        .print-target { 
                            position: absolute; 
                            left: 0; 
                            top: 0; 
                            width: 100% !important; 
                            margin: 0 !important; 
                            padding: 0 !important;
                            
                            /* Ensure it behaves like a normal document flow for pagination */
                            display: block !important;
                            height: auto !important;
                            min-height: 100vh !important;
                            overflow: visible !important;
                            
                            box-shadow: none !important;
                            background-color: white !important;
                            color: black !important;
                        }

                        /* Page break controls */
                        h1, h2, h3 { break-after: avoid; }
                        p, pre, blockquote, ul, ol, .katex-display { break-inside: avoid; }
                        
                        /* Correct Math Colors */
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
