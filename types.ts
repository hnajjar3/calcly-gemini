
export interface ChartDataPoint {
  x: string | number;
  [key: string]: string | number | undefined;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'scatter';
  title: string;
  xLabel: string;
  yLabel: string;
  data: ChartDataPoint[];
  seriesKeys: string[]; // Keys in data to plot (e.g., ["y", "z"] for multiple lines)
}

export interface Section {
  title: string;
  content: string; // Can be markdown-like text
  type: 'text' | 'list' | 'code';
}

export interface Source {
  title: string;
  uri: string;
}

export interface ResultPart {
  type: 'text' | 'markdown' | 'latex';
  content: string;
}

export interface SolverResponse {
  interpretation: string; // How the AI understood the query (e.g. "Plot of sin(x)")
  result: ResultPart[]; // Structured answer separating Text/Markdown from Math/LaTeX
  confidenceScore: number; // 0-1
  sections: Section[]; // Detailed breakdown
  chart?: ChartConfig; // Optional visualization
  sources?: Source[]; // Google Search sources
  suggestions?: string[]; // Contextual follow-up options (e.g. "Show steps", "Graph it")
}

export type ModelMode = 'flash' | 'pro';

export interface HistoryItem {
  id: string;
  query: string;
  timestamp: number;
  response?: SolverResponse;
  error?: string;
  loading: boolean;
  modelMode: ModelMode;
  attachedImage?: string; // base64
  audioBase64?: string; // base64 for voice queries
}
