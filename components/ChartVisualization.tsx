
import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartConfig } from '../types';

interface Props {
  config: ChartConfig;
  isDarkMode: boolean;
}

// Professional color palette with gradients
const THEME_COLORS = [
  { main: '#6366f1', gradient: ['#818cf8', '#4f46e5'] }, // Indigo
  { main: '#ec4899', gradient: ['#f472b6', '#db2777'] }, // Pink
  { main: '#10b981', gradient: ['#34d399', '#059669'] }, // Emerald
  { main: '#f59e0b', gradient: ['#fbbf24', '#d97706'] }, // Amber
  { main: '#0ea5e9', gradient: ['#38bdf8', '#0284c7'] }, // Sky
  { main: '#8b5cf6', gradient: ['#a78bfa', '#7c3aed'] }, // Violet
  { main: '#f43f5e', gradient: ['#fb7185', '#e11d48'] }, // Rose
  { main: '#84cc16', gradient: ['#a3e635', '#65a30d'] }, // Lime
];

export const ChartVisualization: React.FC<Props> = ({ config, isDarkMode }) => {
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0'; // slate-700 vs slate-200
  const tickColor = isDarkMode ? '#94a3b8' : '#64748b'; // slate-400 vs slate-500
  
  // Glassmorphism tooltip styles
  const tooltipStyle = {
    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'}`,
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    backdropFilter: 'blur(8px)',
    padding: '8px 12px',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    fontSize: '11px',
    fontWeight: 600,
    outline: 'none'
  };

  const renderGradients = () => (
    <defs>
      {/* Area Gradients */}
      {config.seriesKeys.map((key, index) => {
        const theme = THEME_COLORS[index % THEME_COLORS.length];
        return (
          <linearGradient key={`grad-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={theme.main} stopOpacity={0.4}/>
            <stop offset="95%" stopColor={theme.main} stopOpacity={0}/>
          </linearGradient>
        );
      })}
      
      {/* Bar Gradients for Volume */}
      {config.seriesKeys.map((key, index) => {
        const theme = THEME_COLORS[index % THEME_COLORS.length];
        return (
          <linearGradient key={`bar-grad-${key}`} id={`bar-color-${key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.gradient[0]} stopOpacity={1}/>
            <stop offset="100%" stopColor={theme.gradient[1]} stopOpacity={1}/>
          </linearGradient>
        );
      })}

      {/* Drop Shadow for Line Elevation */}
      <filter id="lineShadow" height="200%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={isDarkMode ? "rgba(0,0,0,0.4)" : "rgba(99, 102, 241, 0.2)"} />
      </filter>
    </defs>
  );

  const axisStyle = {
     tick: { fontSize: 10, fill: tickColor, fontWeight: 500, fontFamily: 'inherit' },
     tickLine: false,
     axisLine: { stroke: gridColor, strokeWidth: 1, strokeOpacity: 0.5 },
     tickMargin: 8
  };

  const renderChart = () => {
    switch (config.type) {
      case 'pie':
        const valueKey = config.seriesKeys[0] || 'value';
        return (
          <PieChart>
             <Pie
              data={config.data}
              cx="50%"
              cy="50%"
              labelLine={false}
              // Donut style with rounded ends
              innerRadius={60}
              outerRadius={85}
              paddingAngle={5}
              dataKey={valueKey}
              nameKey="x"
              cornerRadius={6}
            >
              {config.data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={THEME_COLORS[index % THEME_COLORS.length].main} 
                  stroke={isDarkMode ? '#1e293b' : '#fff'}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip 
                contentStyle={tooltipStyle} 
                itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', paddingBottom: 2 }}
                cursor={false}
            />
            <Legend 
                wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 500, opacity: 0.8 }} 
                iconType="circle"
                verticalAlign="bottom" 
                align="center"
            />
          </PieChart>
        );

      case 'bar':
        return (
          <BarChart data={config.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            {renderGradients()}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} opacity={0.4} />
            <XAxis dataKey="x" {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip 
                contentStyle={tooltipStyle} 
                itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', paddingBottom: 2 }}
                cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
            />
            <Legend 
                wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 500, opacity: 0.8 }} 
                iconType="circle"
            />
            {config.seriesKeys.map((key, index) => {
              return (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  fill={`url(#bar-color-${key})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={60}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              );
            })}
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart data={config.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            {renderGradients()}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} opacity={0.4} />
            <XAxis dataKey="x" {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', paddingBottom: 2 }} />
            <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 500, opacity: 0.8 }} iconType="circle"/>
            {config.seriesKeys.map((key, index) => {
              const theme = THEME_COLORS[index % THEME_COLORS.length];
              return (
                <Area 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={theme.main} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill={`url(#color-${key})`} 
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              );
            })}
          </AreaChart>
        );
      case 'scatter': 
        // Rendering scatter as LineChart with visible dots and no line stroke for compatibility
        return (
           <LineChart data={config.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            {renderGradients()}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} opacity={0.4} />
            <XAxis dataKey="x" {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', paddingBottom: 2 }} />
            <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 500, opacity: 0.8 }} iconType="circle"/>
            {config.seriesKeys.map((key, index) => {
              const theme = THEME_COLORS[index % THEME_COLORS.length];
              return (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={theme.main} 
                  strokeWidth={0}
                  dot={{ r: 4, fill: theme.main, strokeWidth: 2, stroke: isDarkMode ? '#1e293b' : '#fff' }}
                  activeDot={{ r: 6, filter: "url(#lineShadow)", strokeWidth: 0 }}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              );
            })}
          </LineChart>
        );

      case 'line':
      default:
        return (
          <LineChart data={config.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            {renderGradients()}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} opacity={0.4} />
            <XAxis dataKey="x" {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b', paddingBottom: 2 }} />
            <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px', fontWeight: 500, opacity: 0.8 }} iconType="circle"/>
            {config.seriesKeys.map((key, index) => {
              const theme = THEME_COLORS[index % THEME_COLORS.length];
              return (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={theme.main} 
                  strokeWidth={3}
                  dot={{ r: 0, fill: theme.main, strokeWidth: 0 }} 
                  activeDot={{ r: 5, fill: theme.main, stroke: isDarkMode ? '#1e293b' : '#fff', strokeWidth: 2 }}
                  filter="url(#lineShadow)"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              );
            })}
          </LineChart>
        );
    }
  };

  return (
    <div className="w-full h-64 sm:h-80 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-4 shadow-sm dark:shadow-black/20 transition-all duration-300 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 group">
      <div className="flex items-center justify-between mb-4 pl-1">
        <div>
          <h3 className="text-[10px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2">
            {config.title}
          </h3>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-semibold tracking-wide uppercase">
            {config.xLabel} <span className="text-slate-300 dark:text-slate-600 mx-1">/</span> {config.yLabel}
          </p>
        </div>
      </div>
      
      <div className="w-full h-full pb-6 pr-2">
         <ResponsiveContainer width="100%" height="100%">
           {renderChart()}
         </ResponsiveContainer>
      </div>
    </div>
  );
};
