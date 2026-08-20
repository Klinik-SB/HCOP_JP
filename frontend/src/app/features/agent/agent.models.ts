export type AgentRole = 'user' | 'assistant';

export interface AgentHistoryMessage {
  role: AgentRole;
  content: string;
}

export interface AgentTableArtifact {
  type: 'table';
  title?: string;
  columns: string[];
  rows: string[][];
}

export interface AgentChartPoint {
  x: string | number;
  y: number;
  label?: string;
}

export interface AgentChartSeries {
  name?: string;
  color?: string;
  points: AgentChartPoint[];
}

export interface AgentChartArtifact {
  type: 'chart';
  title?: string;
  chartType?: 'line' | 'bar' | 'pie';
  xLabel?: string;
  series: AgentChartSeries[];
}

export type AgentArtifact = AgentTableArtifact | AgentChartArtifact;

export interface AgentHighlight {
  terms: string[];
  color?: string;
}

export interface AgentChatRequest {
  message: string;
  clinicalText: string;
  history: AgentHistoryMessage[];
}

export interface AgentChatResponse {
  ok: boolean;
  answer: string;
  model?: string;
  artifacts?: AgentArtifact[];
  followUps?: string[];
  highlights?: AgentHighlight[];
}

export interface AgentStatus {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
  model?: string;
  provider?: string;
}

export interface AgentConversationMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: string;
  model?: string;
  artifacts: AgentArtifact[];
  followUps: string[];
  highlights: AgentHighlight[];
  error?: boolean;
  greeting?: boolean;
}
