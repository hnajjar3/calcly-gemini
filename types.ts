
export interface ChartDataset {
  label: string;
  data: number[];
  // Optional style overrides the AI might suggest, though usually handled by frontend theme
  backgroundColor?: string | string[];
  borderColor?: string | string[];
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'scatter' | 'pie' | 'doughnut' | 'radar';
  title?: string;
  labels?: string[]; // X-axis labels (categories)
  datasets: ChartDataset[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface Section {
  title: string;
  content?: string;
  type: 'text' | 'list' | 'code' | 'table';
  tableData?: TableData;
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

export interface CodeGenerationResponse {
  code: string;
  explanation: string;
}
