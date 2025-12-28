import React from 'react';
import { ArrowRight } from 'lucide-react';

interface ToolCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  colorClass: string;
}

export const ToolCard: React.FC<ToolCardProps> = ({ title, description, icon, onClick, colorClass }) => {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-indigo-500/50 dark:hover:border-indigo-400/50 transition-all duration-300 w-full text-left"
    >
      <div className={`p-3 rounded-xl ${colorClass} bg-opacity-10 mb-4 group-hover:scale-110 transition-transform duration-300`}>
        {React.cloneElement(icon as React.ReactElement, { className: `w-8 h-8 ${colorClass.replace('bg-', 'text-')}` })}
      </div>

      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {title}
      </h3>

      <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
        {description}
      </p>

      <div className="mt-auto flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all duration-300">
        Launch Tool <ArrowRight className="w-4 h-4 ml-2" />
      </div>

      <div className="absolute inset-0 border-2 border-transparent group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 rounded-2xl transition-all duration-300" />
    </button>
  );
};
