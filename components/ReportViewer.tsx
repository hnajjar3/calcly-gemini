import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import KaTeX styles

interface ReportViewerProps {
    markdown: string;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ markdown }) => {
    if (!markdown) {
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
        <div className="h-full w-full overflow-auto bg-slate-200 dark:bg-slate-950 p-8 flex justify-center">
            {/* Paper Sheet Container */}
            <div className="bg-white text-black shadow-2xl w-[210mm] min-h-[297mm] p-[25mm] shrink-0 font-serif">
                <article className="prose max-w-none text-black prose-headings:font-bold prose-headings:font-sans prose-h1:text-4xl prose-h1:mb-8 prose-h2:text-2xl prose-h2:mt-6 prose-p:leading-7 prose-p:text-justify prose-a:text-blue-700 prose-img:rounded-sm">
                    <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                    >
                        {markdown}
                    </ReactMarkdown>
                </article>
            </div>
        </div>
    );
};
