import React from 'react';
import Editor from '@monaco-editor/react';

interface CodeEditorProps {
    code: string;
    onChange: (value: string | undefined) => void;
    onRun: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange, onRun }) => {
    return (
        <div className="h-full w-full flex flex-col bg-[#1e1e1e]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#3e3e3e]">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Script Editor</span>
                <button
                    onClick={onRun}
                    className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                    </svg>
                    Run
                </button>
            </div>
            <div className="flex-grow overflow-hidden">
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={code}
                    onChange={onChange}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};
