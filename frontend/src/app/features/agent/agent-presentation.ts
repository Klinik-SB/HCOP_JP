import type { AgentChartArtifact, AgentChartPoint, AgentChartSeries } from './agent.models';

const CHART_COLORS = ['#0e9aef', '#8c5aa8', '#e36b5b', '#3f9b86', '#d6a134', '#526f9f'];
const MAX_X_LABELS = 12;

export interface AgentAnswerParagraph {
  readonly kind: 'paragraph';
  readonly text: string;
}

export interface AgentAnswerList {
  readonly kind: 'list';
  readonly items: readonly string[];
}

export type AgentAnswerBlock = AgentAnswerParagraph | AgentAnswerList;

export interface AgentChartPlot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface AgentChartTick {
  readonly x?: number;
  readonly y?: number;
  readonly label: string;
}

export interface AgentChartBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AgentChartPointView {
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly tooltip: string;
  readonly navigation: string;
  readonly bar?: AgentChartBar;
}

export interface AgentChartSeriesView {
  readonly name: string;
  readonly color: string;
  readonly line: string;
  readonly points: readonly AgentChartPointView[];
}

export interface AgentCartesianChartView {
  readonly kind: 'cartesian';
  readonly width: 420;
  readonly height: 230;
  readonly plot: AgentChartPlot;
  readonly chartType: 'line' | 'bar';
  readonly baselineY: number;
  readonly yTicks: readonly AgentChartTick[];
  readonly xTicks: readonly AgentChartTick[];
  readonly xLabel: string;
  readonly series: readonly AgentChartSeriesView[];
}

export interface AgentPieSliceView {
  readonly path: string;
  readonly color: string;
  readonly tooltip: string;
  readonly navigation: string;
  readonly legend: string;
}

export interface AgentPieChartView {
  readonly kind: 'pie';
  readonly width: 420;
  readonly height: 230;
  readonly slices: readonly AgentPieSliceView[];
}

export type AgentChartView = AgentCartesianChartView | AgentPieChartView;

interface NormalizedSeries {
  readonly name: string;
  readonly color: string;
  readonly points: readonly AgentChartPoint[];
}

/**
 * Conserva la presentación segura del cliente histórico sin inyectar HTML del LLM.
 * Sólo separa párrafos y listas; Angular sigue escapando todo el contenido.
 */
export function agentAnswerBlocks(value: string): AgentAnswerBlock[] {
  return String(value || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): AgentAnswerBlock => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length && lines.every((line) => /^[-•*]\s+/.test(line))) {
        return {
          kind: 'list',
          items: lines.map((line) => line.replace(/^[-•*]\s+/, '').trim()).filter(Boolean)
        };
      }
      return { kind: 'paragraph', text: block };
    });
}

export function buildAgentChartView(chart: AgentChartArtifact): AgentChartView | null {
  const series = normalizeSeries(chart.series);
  if (!series.length) return null;
  if (chart.chartType === 'pie') return buildPieChart(series[0]);
  return buildCartesianChart(chart, series);
}

export function agentChartColor(series: AgentChartSeries, index: number): string {
  const color = String(series.color || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
    ? color
    : CHART_COLORS[index % CHART_COLORS.length];
}

function normalizeSeries(source: readonly AgentChartSeries[]): NormalizedSeries[] {
  return source
    .map((series, index): NormalizedSeries => ({
      name: String(series.name || '').trim() || `Serie ${index + 1}`,
      color: agentChartColor(series, index),
      points: series.points.filter((point) => Number.isFinite(Number(point.y)))
    }))
    .filter((series) => series.points.length > 0);
}

function buildCartesianChart(chart: AgentChartArtifact, series: readonly NormalizedSeries[]): AgentCartesianChartView {
  const width = 420 as const;
  const height = 230 as const;
  const plot: AgentChartPlot = { left: 44, top: 18, width: 350, height: 165 };
  const allPoints = series.flatMap((item) => item.points);
  const labels = [...new Set(allPoints.map((point) => String(point.x)))];
  const numericValues = allPoints.map((point) => numericX(point.x));
  const numericAxis = numericValues.every((value): value is number => value !== null);
  const numericMinimum = numericAxis ? Math.min(...numericValues) : 0;
  const numericMaximum = numericAxis ? Math.max(...numericValues) : 0;
  const xFor = (value: string | number): number => {
    if (numericAxis) {
      const numeric = numericX(value) ?? numericMinimum;
      if (numericMinimum === numericMaximum) return plot.left + plot.width / 2;
      return plot.left + ((numeric - numericMinimum) / (numericMaximum - numericMinimum)) * plot.width;
    }
    const index = Math.max(0, labels.indexOf(String(value)));
    return plot.left + ((index + 0.5) / Math.max(labels.length, 1)) * plot.width;
  };

  let minimumY = Math.min(0, ...allPoints.map((point) => Number(point.y)));
  let maximumY = Math.max(0, ...allPoints.map((point) => Number(point.y)));
  if (minimumY === maximumY) maximumY = minimumY + 1;
  const spanY = maximumY - minimumY;
  const yFor = (value: number): number => plot.top + plot.height - ((value - minimumY) / spanY) * plot.height;
  const baselineY = yFor(0);
  const chartType = chart.chartType === 'bar' ? 'bar' : 'line';

  const yTicks = Array.from({ length: 5 }, (_, index): AgentChartTick => {
    const value = maximumY - (spanY * index / 4);
    return {
      y: plot.top + (plot.height * index / 4),
      label: formatChartNumber(value)
    };
  });
  const xTicks = sampledLabels(labels, MAX_X_LABELS).map((label): AgentChartTick => ({
    x: xFor(label),
    label: truncateChartLabel(label, 12)
  }));

  const slotWidth = plot.width / Math.max(labels.length, 1);
  const groupWidth = Math.min(slotWidth * 0.72, 26 * series.length);
  const barWidth = Math.max(3, Math.min(24, groupWidth / Math.max(series.length, 1)));
  const seriesViews = series.map((item, seriesIndex): AgentChartSeriesView => {
    const points = item.points.map((point): AgentChartPointView => {
      const yValue = Number(point.y);
      const x = xFor(point.x);
      const y = yFor(yValue);
      const tooltip = String(point.label || '').trim() || `${point.x}: ${formatChartNumber(yValue)}`;
      const navigation = String(point.label || '').trim() || String(point.x);
      if (chartType === 'bar') {
        const barX = x - (barWidth * series.length / 2) + (seriesIndex * barWidth);
        return {
          x,
          y,
          color: item.color,
          tooltip,
          navigation,
          bar: {
            x: barX,
            y: Math.min(y, baselineY),
            width: Math.max(2, barWidth - 1),
            height: Math.max(1, Math.abs(baselineY - y))
          }
        };
      }
      return { x, y, color: item.color, tooltip, navigation };
    });
    return {
      name: item.name,
      color: item.color,
      line: chartType === 'line' ? points.map((point) => `${point.x},${point.y}`).join(' ') : '',
      points
    };
  });

  return {
    kind: 'cartesian', width, height, plot, chartType, baselineY, yTicks, xTicks,
    xLabel: String(chart.xLabel || '').trim(),
    series: seriesViews
  };
}

function buildPieChart(series: NormalizedSeries): AgentPieChartView | null {
  const points = series.points.filter((point) => Number(point.y) > 0);
  const total = points.reduce((sum, point) => sum + Number(point.y), 0);
  if (!points.length || !Number.isFinite(total) || total <= 0) return null;
  const width = 420 as const;
  const height = 230 as const;
  const centerX = 120;
  const centerY = 105;
  const radius = 76;
  let angle = -Math.PI / 2;
  const slices = points.map((point, index): AgentPieSliceView => {
    const value = Number(point.y);
    const portion = value / total;
    const end = angle + portion * Math.PI * 2;
    const path = pieSlicePath(centerX, centerY, radius, angle, end, portion);
    const color = index === 0 ? series.color : CHART_COLORS[(index + 1) % CHART_COLORS.length];
    const tooltip = String(point.label || '').trim() || `${point.x}: ${formatChartNumber(value)}`;
    const navigation = String(point.label || '').trim() || String(point.x);
    const legend = `${point.x}: ${formatChartNumber(value)} (${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(portion * 100)}%)`;
    angle = end;
    return { path, color, tooltip, navigation, legend };
  });
  return { kind: 'pie', width, height, slices };
}

function pieSlicePath(
  centerX: number,
  centerY: number,
  radius: number,
  start: number,
  end: number,
  portion: number
): string {
  const startX = centerX + Math.cos(start) * radius;
  const startY = centerY + Math.sin(start) * radius;
  if (portion >= 0.999999) {
    const oppositeX = centerX + Math.cos(start + Math.PI) * radius;
    const oppositeY = centerY + Math.sin(start + Math.PI) * radius;
    return `M${centerX} ${centerY} L${startX} ${startY} A${radius} ${radius} 0 1 1 ${oppositeX} ${oppositeY} A${radius} ${radius} 0 1 1 ${startX} ${startY} Z`;
  }
  const endX = centerX + Math.cos(end) * radius;
  const endY = centerY + Math.sin(end) * radius;
  return `M${centerX} ${centerY} L${startX} ${startY} A${radius} ${radius} 0 ${portion > 0.5 ? 1 : 0} 1 ${endX} ${endY} Z`;
}

function numericX(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function sampledLabels(labels: readonly string[], maximum: number): string[] {
  if (labels.length <= maximum) return [...labels];
  const indexes = new Set<number>();
  for (let index = 0; index < maximum; index += 1) {
    indexes.add(Math.round(index * (labels.length - 1) / (maximum - 1)));
  }
  return [...indexes].sort((left, right) => left - right).map((index) => labels[index]);
}

function truncateChartLabel(value: string, maximum: number): string {
  const text = String(value || '');
  return text.length <= maximum ? text : `${text.slice(0, Math.max(1, maximum - 1))}…`;
}

function formatChartNumber(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
}
