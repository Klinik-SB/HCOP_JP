import type { AgentChartArtifact, AgentChartPoint, AgentChartSeries } from './agent.models';

const CHART_COLORS = ['#0e9aef', '#8c5aa8', '#e36b5b', '#3f9b86', '#d6a134', '#526f9f'];
const MAX_X_LABELS = 12;

export interface AgentAnswerParagraph {
  readonly kind: 'paragraph';
  readonly text: string;
}

export interface AgentAnswerHeading {
  readonly kind: 'heading';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

export interface AgentAnswerList {
  readonly kind: 'list';
  readonly ordered: boolean;
  readonly start?: number;
  readonly items: readonly string[];
}

export interface AgentAnswerTable {
  readonly kind: 'table';
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface AgentAnswerCode {
  readonly kind: 'code';
  readonly language: string;
  readonly text: string;
}

export type AgentAnswerBlock = AgentAnswerParagraph | AgentAnswerHeading | AgentAnswerList | AgentAnswerTable | AgentAnswerCode;

export type AgentInlineToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'strong'; readonly text: string }
  | { readonly kind: 'emphasis'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

export interface AgentAnswerOptions {
  readonly suppressFencedCode?: boolean;
}

export interface AgentNavigationTarget {
  readonly date?: string;
  readonly text: string;
}

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
  readonly navigationText: string;
  readonly navigationDate: string;
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
  readonly navigationText: string;
  readonly navigationDate: string;
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

export function agentAnswerBlocks(value: string, options: AgentAnswerOptions = {}): AgentAnswerBlock[] {
  const lines = String(value || '').replace(/\r/g, '').split('\n');
  const blocks: AgentAnswerBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const fence = lines[index].trim().match(/^```([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      if (!options.suppressFencedCode && code.some((line) => line.trim())) {
        blocks.push({ kind: 'code', language: fence[1].toLowerCase(), text: code.join('\n') });
      }
      continue;
    }

    const table = markdownTableAt(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const heading = markdownHeading(lines[index]);
    if (heading) {
      blocks.push(heading);
      index += 1;
      continue;
    }

    const firstListItem = markdownListItem(lines[index]);
    if (firstListItem) {
      const items: string[] = [];
      const ordered = firstListItem.ordered;
      const start = firstListItem.ordinal;
      while (index < lines.length) {
        const item = markdownListItem(lines[index]);
        if (!item || item.ordered !== ordered) break;
        items.push(item.text);
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, ...(ordered && start ? { start } : {}), items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (paragraph.length && (
        markdownHeading(lines[index])
        || markdownListItem(lines[index])
        || markdownTableAt(lines, index)
        || /^```[\w-]*\s*$/.test(lines[index].trim())
      )) break;
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

/** Tokenizes the small inline Markdown subset rendered by Angular interpolation. */
export function agentInlineTokens(value: string): AgentInlineToken[] {
  const source = String(value ?? '');
  const matcher = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  const tokens: AgentInlineToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: 'text', text: source.slice(cursor, index) });
    const marked = match[0];
    if (marked.startsWith('`')) {
      tokens.push({ kind: 'code', text: marked.slice(1, -1) });
    } else if (marked.startsWith('**') || marked.startsWith('__')) {
      tokens.push({ kind: 'strong', text: marked.slice(2, -2) });
    } else {
      tokens.push({ kind: 'emphasis', text: marked.slice(1, -1) });
    }
    cursor = index + marked.length;
  }
  if (cursor < source.length) tokens.push({ kind: 'text', text: source.slice(cursor) });
  return tokens.length ? tokens : [{ kind: 'text', text: source }];
}

export function agentPlainText(value: string): string {
  return agentInlineTokens(value).map((token) => token.text).join('');
}

/** Returns a normalized clinical date found in a chart x value, never in its label. */
export function agentNavigationDate(value: string | number): string {
  const text = String(value ?? '').trim();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso && isCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const local = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (!local) return '';
  const year = Number(local[3]);
  const month = Number(local[2]);
  const day = Number(local[1]);
  return isCalendarDate(year, month, day)
    ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`
    : '';
}

export function agentNavigationTarget(value: string, preferredDate = ''): AgentNavigationTarget | null {
  const text = agentPlainText(value).trim();
  if (!text) return null;
  const date = agentNavigationDate(preferredDate) || agentNavigationDate(text);
  return { ...(date ? { date } : {}), text };
}

function markdownHeading(line: string): AgentAnswerHeading | null {
  const text = line.trim();
  const markdown = text.match(/^(#{1,6})\s+(.+?)\s*#*$/);
  if (markdown) {
    return {
      kind: 'heading',
      level: markdown[1].length as AgentAnswerHeading['level'],
      text: markdown[2].trim()
    };
  }
  const strong = text.match(/^\*\*(.+)\*\*$/) || text.match(/^__(.+)__$/);
  return strong ? { kind: 'heading', level: 3, text: strong[1].trim() } : null;
}

function markdownListItem(line: string): { readonly ordered: boolean; readonly ordinal?: number; readonly text: string } | null {
  const ordered = line.match(/^\s*(\d+)[.)]\s+(.+?)\s*$/);
  if (ordered) {
    return {
      ordered: true,
      ordinal: Math.max(1, Math.min(9999, Number(ordered[1]) || 1)),
      text: ordered[2].trim()
    };
  }
  const unordered = line.match(/^\s*[-*+\u2022]\s+(.+?)\s*$/);
  return unordered ? { ordered: false, text: unordered[1].trim() } : null;
}

function markdownTableAt(
  lines: readonly string[],
  index: number
): { readonly block: AgentAnswerTable; readonly nextIndex: number } | null {
  if (index + 1 >= lines.length) return null;
  const columns = markdownTableCells(lines[index]);
  const separator = markdownTableCells(lines[index + 1]);
  if (columns.length < 2 || separator.length !== columns.length) return null;
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))) return null;

  const rows: string[][] = [];
  let cursor = index + 2;
  while (cursor < lines.length && lines[cursor].trim()) {
    const cells = markdownTableCells(lines[cursor]);
    if (cells.length < 2) break;
    rows.push(Array.from({ length: columns.length }, (_, cellIndex) => cells[cellIndex] || ''));
    cursor += 1;
  }
  return { block: { kind: 'table', columns, rows }, nextIndex: cursor };
}

function markdownTableCells(line: string): string[] {
  let text = line.trim();
  if (!text.includes('|')) return [];
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const character of text) {
    if (escaped) {
      current += character === '|' ? '|' : `\\${character}`;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (escaped) current += '\\';
  cells.push(current.trim());
  return cells;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
      const pointLabel = agentPlainText(String(point.label || '')).trim();
      const tooltip = pointLabel || `${agentPlainText(String(point.x))}: ${formatChartNumber(yValue)}`;
      const navigationText = pointLabel || agentPlainText(String(point.x));
      const navigationDate = agentNavigationDate(point.x);
      if (chartType === 'bar') {
        const barX = x - (barWidth * series.length / 2) + (seriesIndex * barWidth);
        return {
          x,
          y,
          color: item.color,
          tooltip,
          navigationText,
          navigationDate,
          bar: {
            x: barX,
            y: Math.min(y, baselineY),
            width: Math.max(2, barWidth - 1),
            height: Math.max(1, Math.abs(baselineY - y))
          }
        };
      }
      return { x, y, color: item.color, tooltip, navigationText, navigationDate };
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
    const pointLabel = agentPlainText(String(point.label || '')).trim();
    const pointX = agentPlainText(String(point.x));
    const tooltip = pointLabel || `${pointX}: ${formatChartNumber(value)}`;
    const navigationText = pointLabel || pointX;
    const navigationDate = agentNavigationDate(point.x);
    const legend = `${pointX}: ${formatChartNumber(value)} (${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(portion * 100)}%)`;
    angle = end;
    return { path, color, tooltip, navigationText, navigationDate, legend };
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
