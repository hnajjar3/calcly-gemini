import React, { useEffect, useRef, useState } from 'react';
import { ComputeEngine } from '@cortex-js/compute-engine';
import 'mathlive';
import { Terminal, ArrowRight } from 'lucide-react';

// Declare the generic HTMLElement for math-field to avoid TS errors
declare global {
    namespace JSX {
        interface IntrinsicElements {
            'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
        }
    }
}

interface EquationEditorProps {
    onInsertCode: (code: string) => void;
}

export const EquationEditor: React.FC<EquationEditorProps> = ({ onInsertCode }) => {
    const mfRef = useRef<HTMLElement>(null);
    const [latex, setLatex] = useState<string>('E = mc^2');
    const [parsedCode, setParsedCode] = useState<string>('');
    const [ce] = useState(() => new ComputeEngine());

    useEffect(() => {
        // Initialize MathLive field interactions
        const mf = mfRef.current;
        if (!mf) return;

        // Set initial value
        (mf as any).value = latex;

        // Listen for changes
        const handleInput = (evt: Event) => {
            const value = (evt.target as any).value;
            setLatex(value);
            parseLatex(value);
        };

        mf.addEventListener('input', handleInput);

        // Initial parse
        parseLatex(latex);

        return () => {
            mf.removeEventListener('input', handleInput);
        };
    }, []);

    // Helper to adapt native CortexJS executable functions into source code strings
    const extractJsFromFn = (fnStr: string): string => {
        // Simple heuristic to extract body from "() => body" or "function() { return body; }"
        // 1. Arrow function: names => body or (args) => body
        let match = fnStr.match(/=>\s*({?[\s\S]*)/);
        let body = fnStr;

        if (match) {
            body = match[1].trim();
            // If it is block { return ... }, strip it
            if (body.startsWith('{')) {
                body = body.replace(/^{/, '').replace(/}$/, '').trim();
                if (body.startsWith('return ')) body = body.substring(7);
                if (body.endsWith(';')) body = body.substring(0, body.length - 1);
            }
        } else {
            // 2. Standard function
            match = fnStr.match(/function\s*\w*\s*\([^)]*\)\s*\{\s*return\s+([\s\S]*?);\s*\}/);
            if (match) {
                body = match[1];
            }
        }

        // Clean up CortexJS context access (e.g. _.x -> x)
        // This makes the code suitable for the script editor scope
        return body.replace(/_\./g, '');
    };

    const parseLatex = (paramsLatex: string) => {
        try {
            const expr = ce.parse(paramsLatex);
            // Use canonical form effectively to avoid strict type errors for symbolic math
            const simplified = expr.canonical;

            // Custom serialization to support JS-like assignment
            // Use JSON structure to safely identify equality
            const json = simplified.json;

            if (Array.isArray(json) && json[0] === 'Equal') {
                // Ensure we have operands
                const ops = simplified.ops;
                if (ops && ops.length === 2) {
                    const lhs = ops[0].toString();

                    // For RHS, we want the COMPILED JS, not the string representation
                    // e.g. x^2 -> Math.pow(x, 2)
                    let rhsJs = "";
                    try {
                        const compiled = ops[1].compile();
                        if (compiled) {
                            rhsJs = extractJsFromFn(compiled.toString());
                        } else {
                            rhsJs = ops[1].toString();
                        }
                    } catch (e) {
                        rhsJs = ops[1].toString();
                    }

                    // Check if LHS is a valid identifier (simple heuristic) to avoid "2 = 2" assignment
                    // and ensure we output "n = 2" instead of "n === 2"
                    if (/^[a-zA-Z_$][\w$]*$/.test(lhs)) {
                        setParsedCode(`${lhs} = ${rhsJs}`);
                        return;
                    }
                }
            }

            const result = simplified.toString();

            // Try automatic JS compilation for non-assignments
            try {
                const compiledFn = expr.compile();
                if (compiledFn) {
                    let fnStr = compiledFn.toString();
                    const body = extractJsFromFn(fnStr);
                    // parsedCode will now append this info
                    setParsedCode(`${result}\n// Native JS: ${body}`);
                    return;
                }
            } catch (err) {
                // ignore
            }

            // Check for CortexJS Error output
            if (result.includes("Error") || result.includes("ErrorCode")) {
                setParsedCode("// Complex expression (could not auto-convert to code)");
            } else {
                setParsedCode(result);
            }
        } catch (e) {
            setParsedCode("Parsing error");
        }
    };

    const handleInsert = () => {
        // Direct insertion without confusing comments
        onInsertCode(`// Equation: ${latex}\n${parsedCode}\n`);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 border-t border-slate-700">
            <div className="flex-grow p-4 overflow-y-auto">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    MathLive Input (LaTeX)
                </label>

                <div className="bg-slate-800 p-4 rounded-xl shadow-inner border border-slate-700 mb-4">
                    <math-field
                        ref={mfRef}
                        class="w-full bg-transparent text-xl p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{
                            backgroundColor: 'transparent',
                            color: '#e2e8f0', // slate-200
                            fontSize: '1.5rem',
                            ...({
                                '--caret-color': '#6366f1', // indigo-500
                                '--selection-background-color': '#4338ca', // indigo-700
                            } as any)
                        }}
                    >
                        {latex}
                    </math-field>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex-1 bg-slate-800 rounded-lg p-3 border border-slate-700 font-mono text-sm text-emerald-400 overflow-x-auto">
                        <div className="flex items-center gap-2 mb-1 text-slate-500 text-xs uppercase font-bold">
                            <Terminal className="w-3 h-3" /> Compute Engine Canonical Form
                        </div>
                        {parsedCode}
                    </div>

                    <button
                        onClick={handleInsert}
                        className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                    >
                        Insert to Script <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="mt-6 text-slate-500 text-xs max-w-lg">
                    <p className="mb-2"><strong className="text-slate-400">Instructions:</strong> Type mathematical equations using standard LaTeX syntax or the visual editor. The standard CortexJS Compute Engine parses your input in real-time.</p>
                </div>
            </div>
        </div>
    );
};
