import React, { useState, useEffect, useCallback } from 'react';
import { Interaction } from '../lib/runtime';
import { Sliders } from 'lucide-react';

interface Props {
    interaction: Interaction;
    onUpdate: (id: string, values: Record<string, number>) => void;
}

export const InteractiveControls: React.FC<Props> = ({ interaction, onUpdate }) => {
    const [values, setValues] = useState<Record<string, number>>({});

    // Sync internal state when interaction definition changes
    useEffect(() => {
        const initial: Record<string, number> = {};
        Object.entries(interaction.controls).forEach(([key, def]) => {
            initial[key] = def.value;
        });
        setValues(initial);
    }, [interaction.id]);

    const handleChange = (key: string, newValue: number) => {
        const updated = { ...values, [key]: newValue };
        setValues(updated);
        onUpdate(interaction.id, updated);
    };

    return (
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                <Sliders className="w-3.5 h-3.5" />
                <span>Interactive Controls</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {Object.entries(interaction.controls).map(([key, def]) => (
                    <div key={key} className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                            <label htmlFor={`control-${key}`} className="font-medium text-slate-700 dark:text-slate-300">
                                {def.label || key}
                            </label>
                            <span className="font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                {values[key]?.toFixed(2) ?? def.value}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 w-6 text-right">{def.min}</span>
                            <input
                                id={`control-${key}`}
                                type="range"
                                min={def.min}
                                max={def.max}
                                step={def.step || (def.max - def.min) / 100}
                                value={values[key] ?? def.value}
                                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                                className="flex-grow h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500"
                            />
                            <span className="text-[10px] text-slate-400 w-6">{def.max}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
