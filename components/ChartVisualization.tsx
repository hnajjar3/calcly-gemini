import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
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

const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b'];
const DARK_COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24'];

export const ChartVisualization: React.FC<Props> = ({ config, isDarkMode }) => {
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0'; // slate-700 vs slate-200
  const tickColor = isDarkMode ? '#94a3b8' : '#64748b'; // slate-400 vs slate-500
  const tooltipStyle = isDarkMode 
    ? { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }
    : { backgroundColor: '#ffffff', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

  const renderChart = () => {
    switch (config.type) {
      case 'bar':
        return (
          <BarChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis 
                dataKey="x" 
                tick={{ fontSize: 12, fill: tickColor }} 
                tickLine={false}
                axisLine={{ stroke: gridColor }}
            />
            <YAxis 
                tick={{ fontSize: 12, fill: tickColor }} 
                tickLine={false}
                axisLine={false}
            />
            <Tooltip 
                contentStyle={tooltipStyle}
                itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b' }}
                cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }}/>
            {config.seriesKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={colors[index % colors.length]} 
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart data={config.data}>
            <defs>
              {config.seriesKeys.map((key, index) => (
                <linearGradient key={`grad-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="x" tick={{ fontSize: 12, fill: tickColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b' }}/>
            <Legend wrapperStyle={{ paddingTop: '10px' }}/>
            {config.seriesKeys.map((key, index) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[index % colors.length]} 
                fillOpacity={1} 
                fill={`url(#color-${key})`} 
              />
            ))}
          </AreaChart>
        );
      case 'line':
      default:
        return (
          <LineChart data={config.data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="x" tick={{ fontSize: 12, fill: tickColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b' }}/>
            <Legend wrapperStyle={{ paddingTop: '10px' }}/>
            {config.seriesKeys.map((key, index) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[index % colors.length]} 
                strokeWidth={2}
                dot={{ r: 3, fill: colors[index % colors.length] }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <div className="w-full h-72 sm:h-96 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-4 transition-colors">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 ml-2">
        {config.title}
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};