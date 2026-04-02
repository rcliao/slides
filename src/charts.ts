/**
 * Terminal chart components for slide presentations.
 * Pure functions that return string arrays — no dependencies.
 */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[97m';
const BG_GREEN = '\x1b[42m';
const BG_YELLOW = '\x1b[43m';
const BG_RED = '\x1b[41m';
const BG_CYAN = '\x1b[46m';
const BG_MAGENTA = '\x1b[45m';
const BG_BLUE = '\x1b[44m';

function c(code: string, text: string, nc: boolean): string {
  return nc ? text : `${code}${text}${RESET}`;
}

const BAR_COLORS = [BG_CYAN, BG_GREEN, BG_MAGENTA, BG_YELLOW, BG_BLUE, BG_RED];
const TEXT_COLORS = [CYAN, GREEN, MAGENTA, YELLOW, RED, WHITE];

/**
 * Parse a bar-chart block.
 * Format: "Label | value" or "Label | value%"
 * Returns parsed entries with label and numeric value.
 */
interface ChartEntry {
  label: string;
  value: number;
  isPercent: boolean;
  color?: string;
}

function parseChartEntries(content: string): ChartEntry[] {
  const entries: ChartEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('|').map(s => s.trim());
    if (parts.length < 2) continue;

    const label = parts[0];
    const rawValue = parts[1];
    const colorCode = parts[2]?.trim();

    const isPercent = rawValue.endsWith('%');
    const numStr = rawValue.replace('%', '').trim();
    const value = parseFloat(numStr);
    if (isNaN(value)) continue;

    entries.push({ label, value, isPercent, color: colorCode });
  }
  return entries;
}

/**
 * Render a horizontal bar chart.
 *
 * Format:
 * ```bar-chart
 * JavaScript  | 67%
 * Python      | 54%
 * Rust        | 23%
 * ```
 */
export function renderBarChart(content: string, width: number, nc: boolean): string[] {
  const entries = parseChartEntries(content);
  if (entries.length === 0) return ['  (empty chart)'];

  const maxLabel = Math.max(...entries.map(e => e.label.length));
  const maxValue = Math.max(...entries.map(e => e.value));
  const barMaxWidth = Math.max(10, width - maxLabel - 16); // label + padding + value display
  const lines: string[] = [];

  lines.push('');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const fraction = maxValue > 0 ? e.value / maxValue : 0;
    const barWidth = Math.round(fraction * barMaxWidth);
    const emptyWidth = barMaxWidth - barWidth;

    const barColor = BAR_COLORS[i % BAR_COLORS.length];
    const textColor = TEXT_COLORS[i % TEXT_COLORS.length];
    const label = e.label.padEnd(maxLabel);
    const valueStr = e.isPercent ? `${e.value}%` : `${e.value}`;

    const bar = c(barColor, ' '.repeat(barWidth), nc);
    const empty = c(DIM, '░'.repeat(emptyWidth), nc);
    lines.push(`  ${c(textColor, label, nc)} ${bar}${empty} ${c(BOLD, valueStr.padStart(5), nc)}`);
  }
  lines.push('');

  return lines;
}

/**
 * Render progress/meter bars.
 *
 * Format:
 * ```progress
 * Build     | 100% | G
 * Tests     |  87% | Y
 * Coverage  |  42% | R
 * ```
 *
 * Color codes: G=green, Y=yellow, R=red (optional, auto-detected from value if omitted)
 */
export function renderProgress(content: string, width: number, nc: boolean): string[] {
  const entries = parseChartEntries(content);
  if (entries.length === 0) return ['  (empty progress)'];

  const maxLabel = Math.max(...entries.map(e => e.label.length));
  const barMaxWidth = Math.max(10, width - maxLabel - 18);
  const lines: string[] = [];

  lines.push('');
  for (const e of entries) {
    const pct = Math.min(100, Math.max(0, e.value));
    const fraction = pct / 100;
    const filledWidth = Math.round(fraction * barMaxWidth);
    const emptyWidth = barMaxWidth - filledWidth;

    // Determine color
    let barBg: string;
    let textClr: string;
    const colorKey = (e.color || '').toUpperCase();
    if (colorKey === 'G' || colorKey === 'GREEN') {
      barBg = BG_GREEN; textClr = GREEN;
    } else if (colorKey === 'Y' || colorKey === 'YELLOW') {
      barBg = BG_YELLOW; textClr = YELLOW;
    } else if (colorKey === 'R' || colorKey === 'RED') {
      barBg = BG_RED; textClr = RED;
    } else if (colorKey === 'C' || colorKey === 'CYAN') {
      barBg = BG_CYAN; textClr = CYAN;
    } else if (colorKey === 'M' || colorKey === 'MAGENTA') {
      barBg = BG_MAGENTA; textClr = MAGENTA;
    } else {
      // Auto-detect from value
      if (pct >= 80) { barBg = BG_GREEN; textClr = GREEN; }
      else if (pct >= 50) { barBg = BG_YELLOW; textClr = YELLOW; }
      else { barBg = BG_RED; textClr = RED; }
    }

    const label = e.label.padEnd(maxLabel);
    const filled = c(barBg, ' '.repeat(filledWidth), nc);
    const empty = c(DIM, '░'.repeat(emptyWidth), nc);
    const pctStr = `${Math.round(pct)}%`.padStart(4);

    lines.push(`  ${c(textClr, label, nc)} ${filled}${empty} ${c(BOLD + textClr, pctStr, nc)}`);
  }
  lines.push('');

  return lines;
}

/**
 * Render a sparkline from numeric data.
 *
 * Format:
 * ```sparkline
 * Revenue: 10 15 22 18 25 30 28 35 42
 * Users:   100 120 115 140 160 155 180
 * ```
 */
const SPARK_CHARS = '▁▂▃▄▅▆▇█';

export function renderSparkline(content: string, nc: boolean): string[] {
  const lines: string[] = [];
  lines.push('');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split on ":" to get label and values
    const colonIdx = trimmed.indexOf(':');
    let label = '';
    let valuesStr = trimmed;
    if (colonIdx > 0) {
      label = trimmed.slice(0, colonIdx).trim();
      valuesStr = trimmed.slice(colonIdx + 1).trim();
    }

    const values = valuesStr.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    if (values.length === 0) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    let spark = '';
    for (const v of values) {
      const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
      spark += SPARK_CHARS[idx];
    }

    const trend = values[values.length - 1] >= values[0] ? '↑' : '↓';
    const trendColor = values[values.length - 1] >= values[0] ? GREEN : RED;

    if (label) {
      lines.push(`  ${c(BOLD, label, nc)}  ${c(CYAN, spark, nc)}  ${c(trendColor, trend, nc)} ${c(DIM, `${values[values.length - 1]}`, nc)}`);
    } else {
      lines.push(`  ${c(CYAN, spark, nc)}  ${c(trendColor, trend, nc)} ${c(DIM, `${values[values.length - 1]}`, nc)}`);
    }
  }
  lines.push('');

  return lines;
}
