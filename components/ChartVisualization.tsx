
import React from 'react';
import { ChartConfig } from '../types';
import 'chart.js/auto';
import { ChartData, ChartOptions } from 'chart.js';
import { Line, Bar, Pie, Doughnut, Radar, Scatter } from 'react-chartjs-2';

interface Props {
  config: ChartConfig;
  isDarkMode: boolean;
}

// Professional color palette
const THEME_COLORS = [
  { main: '#6366f1', bg: 'rgba(99, 102, 241, 0.5)' }, // Indigo
  { main: '#ec4899', bg: 'rgba(236, 72, 153, 0.5)' }, // Pink
  { main: '#10b981', bg: 'rgba(16, 185, 129, 0.5)' }, // Emerald
  { main: '#f59e0b', bg: 'rgba(245, 158, 11, 0.5)' },  // Amber
  { main: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.5)' },  // Sky
  { main: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.5)' },  // Violet
  { main: '#f43f5e', bg: 'rgba(244, 63, 94, 0.5)' },   // Rose
  { main: '#84cc16', bg: 'rgba(132, 204, 22, 0.5)' },  // Lime
];

export const ChartVisualization: React.FC<Props> = ({ config, isDarkMode }) => {
  
  // Common options for responsiveness and theme
  const commonOptions: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    color: isDarkMode ? '#cbd5e1' : '#475569',
    scales: {
      x: {
        grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
        ticks: { color: isDarkMode ? '#94a3b8' : '#64748b' },
        display: config.type !== 'pie' && config.type !== 'doughnut' && config.type !== 'radar'
      },
      y: {
        grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
        ticks: { color: isDarkMode ? '#94a3b8' : '#64748b' },
        display: config.type !== 'pie' && config.type !== 'doughnut' && config.type !== 'radar'
      },
      r: { // For Radar charts
        grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
        pointLabels: { 
            color: isDarkMode ? '#e2e8f0' : '#1e293b', 
            font: { size: 11 } 
        },
        ticks: { backdropColor: 'transparent', color: isDarkMode ? '#94a3b8' : '#64748b' },
        display: config.type === 'radar'
      }
    },
    plugins: {
      legend: {
        labels: { color: isDarkMode ? '#e2e8f0' : '#1e293b', font: { size: 11 } },
        position: 'top' as const,
      },
      tooltip: {
        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDarkMode ? '#f8fafc' : '#0f172a',
        bodyColor: isDarkMode ? '#e2e8f0' : '#334155',
        borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
      }
    }
  };

  const getChartData = (overrideDatasets?: any[]): ChartData<any> => {
    const labels = config.labels || [];
    
    // Process datasets
    const datasets = (overrideDatasets || config.datasets).map((ds, i) => {
      const theme = THEME_COLORS[i % THEME_COLORS.length];
      
      // COLOR STRATEGY:
      // Pie/Doughnut: Array of colors for each segment (data point)
      // Bar/Line/Radar: Single color for the whole series (dataset)
      
      const isSegmented = config.type === 'pie' || config.type === 'doughnut';
      
      let bg: any;
      let border: any;

      if (isSegmented) {
         // Cycle through themes for each data point
         bg = labels.map((_, idx) => THEME_COLORS[idx % THEME_COLORS.length].main);
         border = isDarkMode ? '#1e293b' : '#ffffff';
      } else {
         // Single color for series
         bg = theme.bg;
         border = theme.main;
      }

      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 2,
        pointBackgroundColor: theme.main,
        pointBorderColor: isDarkMode ? '#1e293b' : '#ffffff',
        pointHoverRadius: 6,
        fill: config.type === 'area' || config.type === 'radar',
        tension: 0.3,
      };
    });

    return { labels, datasets };
  };

  const renderContent = () => {
    // 1. Comparison Pie Charts (Side-by-Side)
    // Chart.js doesn't support multiple datasets in one pie easily in a "side-by-side" manner on one canvas.
    // So we render multiple Chart instances.
    if ((config.type === 'pie' || config.type === 'doughnut') && config.datasets.length > 1) {
       return (
         <div className="flex flex-wrap items-center justify-center gap-8 w-full h-full overflow-y-auto custom-scrollbar p-2">
            {config.datasets.map((ds, idx) => {
                const singleChartData = getChartData([ds]);
                
                const pieOptions = {
                    ...commonOptions,
                    plugins: {
                        ...commonOptions.plugins,
                        legend: { position: 'bottom' as const },
                        title: { 
                          display: true, 
                          text: ds.label, 
                          color: isDarkMode ? '#e2e8f0' : '#1e293b', 
                          font: {size: 14} 
                        }
                    }
                };

                return (
                    <div key={idx} className="relative w-[220px] h-[260px]">
                        {config.type === 'doughnut' ? 
                            <Doughnut data={singleChartData} options={pieOptions} /> : 
                            <Pie data={singleChartData} options={pieOptions} />
                        }
                    </div>
                );
            })}
         </div>
       );
    }

    // 2. Standard Charts
    const data = getChartData();
    
    switch (config.type) {
        case 'bar':
            return <Bar data={data} options={commonOptions} />;
        case 'line':
        case 'area':
             // For area, we set fill: true in getChartData
             return <Line data={data} options={commonOptions} />;
        case 'radar':
             return <Radar data={data} options={commonOptions} />;
        case 'pie':
             return <Pie data={data} options={commonOptions} />;
        case 'doughnut':
             return <Doughnut data={data} options={commonOptions} />;
        case 'scatter':
             return <Scatter data={data} options={commonOptions} />;
        default:
             return <Line data={data} options={commonOptions} />;
    }
  };

  return (
    <div className="w-full h-72 sm:h-96 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-4 shadow-sm dark:shadow-black/20 transition-all duration-300 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 group">
      <div className="flex items-center justify-between mb-2 pl-1 h-8">
        <div>
          <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2">
            {config.title || 'Visualization'}
          </h3>
        </div>
      </div>
      
      <div className="w-full h-[calc(100%-2rem)] pb-2 relative">
           {renderContent()}
      </div>
    </div>
  );
};
