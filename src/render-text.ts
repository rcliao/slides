import { parseSlides } from './parser.js';
import { renderBlockText, blockTextWidth } from './block-font.js';
import { renderPixelArt, parsePixelGrid } from './pixel-art.js';
// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[97m';
const BG_GRAY = '\x1b[48;5;236m';
const BG_YELLOW = '\x1b[43m';
const BLACK = '\x1b[30m';
const RED = '\x1b[31m';

export interface RenderOptions {
  width?: number;
  noColor?: boolean;
  compact?: boolean;
}

function c(code: string, text: string, noColor: boolean): string {
  return noColor ? text : `${code}${text}${RESET}`;
}

/**
 * Render a raw markdown slide to formatted terminal text.
 * Handles two-column layout by splitting at <!-- column --> and rendering side-by-side.
 */
export function renderSlideToText(rawMarkdown: string, options: RenderOptions = {}): string[] {
  const width = options.width || 80;
  const nc = options.noColor || false;

  // Check for two-column: split at <!-- column -->, render heading above, columns side-by-side
  if (/^\s*<!--\s*column\s*-->\s*$/im.test(rawMarkdown)) {
    const parts = rawMarkdown.split(/^\s*<!--\s*column\s*-->\s*$/im);
    if (parts.length >= 2) {
      const lines: string[] = [];

      let leftMd: string;
      let rightMd: string;

      if (parts.length >= 3) {
        // 3 parts: heading | left column | right column
        const headerPart = parts[0].trim();
        if (headerPart) {
          const headingLines = renderMarkdownLines(headerPart, width, nc);
          lines.push(...headingLines);
          lines.push('');
        }
        leftMd = parts[1].trim();
        rightMd = parts[2].trim();
      } else {
        // 2 parts: left column | right column (or heading+left | right)
        const firstPart = parts[0].trim();
        const headingMatch = firstPart.match(/^(#{1,3}\s+.+)\n*([\s\S]*)$/);
        if (headingMatch) {
          const headingLines = renderMarkdownLines(headingMatch[1], width, nc);
          lines.push(...headingLines);
          lines.push('');
          leftMd = (headingMatch[2] || '').trim();
        } else {
          leftMd = firstPart;
        }
        rightMd = parts[1].trim();
      }

      // Render each column at half width
      const colWidth = Math.floor((width - 5) / 2);
      const leftLines = renderMarkdownLines(leftMd, colWidth, nc);
      const rightLines = renderMarkdownLines(rightMd, colWidth, nc);
      const maxLen = Math.max(leftLines.length, rightLines.length);

      const sep = c(DIM, ' │ ', nc);
      for (let i = 0; i < maxLen; i++) {
        const left = padToWidth(leftLines[i] || '', colWidth, nc);
        const right = rightLines[i] || '';
        lines.push(left + sep + right);
      }

      return lines;
    }
  }

  return renderMarkdownLines(rawMarkdown, width, nc);
}

/**
 * Pad a string (which may contain ANSI codes) to a visual width.
 */
function padToWidth(str: string, targetWidth: number, _nc: boolean): string {
  const visual = stripAnsi(str).length;
  const pad = Math.max(0, targetWidth - visual);
  return str + ' '.repeat(pad);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Core markdown-to-terminal-lines renderer.
 */
function renderMarkdownLines(rawMarkdown: string, width: number, nc: boolean): string[] {
  const lines: string[] = [];
  const mdLines = rawMarkdown.split('\n');

  let inCodeBlock = false;
  let codeLang = '';
  let isPixelBlock = false;
  let codeBuffer: string[] = [];
  const codeWidth = Math.max(10, width - 4);

  for (const line of mdLines) {
    const trimmed = line.trim();

    // Skip pause/column markers
    if (/^<!--\s*pause\s*-->$/i.test(trimmed)) {
      lines.push(c(DIM, '  · · ·', nc));
      continue;
    }
    if (/^<!--\s*column\s*-->$/i.test(trimmed)) continue;
    // Skip speaker notes
    if (/^<!--.*-->$/.test(trimmed)) continue;

    // Code blocks
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
        const fullAnnotation = trimmed.replace(/```\s*/, '');
        codeLang = fullAnnotation.replace(/\s*\{.*\}/, '').trim();
        isPixelBlock = /\{\s*pixels\s*\}/i.test(fullAnnotation) || codeLang.toLowerCase() === 'pixels';
        if (!isPixelBlock) {
          const label = codeLang ? ` ${codeLang} ` : '';
          lines.push(c(DIM, `  ┌${'─'.repeat(codeWidth)}┐`, nc));
          if (label) {
            lines.push(c(DIM, `  │${c(CYAN, label, nc)}${' '.repeat(Math.max(0, codeWidth - label.length))}${c(DIM, '│', nc)}`, nc));
            lines.push(c(DIM, `  ├${'─'.repeat(codeWidth)}┤`, nc));
          }
        }
      } else {
        if (isPixelBlock) {
          // Render pixel art from buffered content
          const grid = parsePixelGrid(codeBuffer.join('\n'));
          const pixelLines = renderPixelArt(grid, nc);
          lines.push(...pixelLines);
        } else {
          lines.push(c(DIM, `  └${'─'.repeat(codeWidth)}┘`, nc));
        }
        inCodeBlock = false;
        codeLang = '';
        isPixelBlock = false;
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      if (isPixelBlock) {
        codeBuffer.push(line);
      } else {
        lines.push(`  ${c(DIM, '│', nc)} ${c(GREEN, line, nc)}`);
      }
      continue;
    }

    // Headings
    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) {
      const text = h1[1].replace(/[*_]/g, '');
      // Use block font if it fits (short titles only)
      const bw = blockTextWidth(text);
      if (bw > 0 && bw <= width - 6) {
        const blockLines = renderBlockText(text);
        lines.push('');
        for (const bl of blockLines) {
          lines.push(c(BOLD + CYAN, `  ${bl}`, nc));
        }
        lines.push('');
      } else {
        // Fallback to regular heading for long text
        lines.push('');
        lines.push(c(BOLD + CYAN, `  ${text}`, nc));
        lines.push(c(CYAN, `  ${'═'.repeat(Math.min(text.length + 2, width - 4))}`, nc));
        lines.push('');
      }
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      lines.push('');
      lines.push(c(BOLD + YELLOW, `  ${h2[1].replace(/[*_]/g, '')}`, nc));
      lines.push(c(YELLOW, `  ${'─'.repeat(Math.min(h2[1].length + 2, width - 4))}`, nc));
      lines.push('');
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      lines.push(c(BOLD + WHITE, `  ${h3[1].replace(/[*_]/g, '')}`, nc));
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith('> ')) {
      const text = trimmed.slice(2);
      lines.push(c(ITALIC + MAGENTA, `  │ ${text}`, nc));
      continue;
    }

    // Unordered list items
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)/);
    if (ulMatch) {
      const bullet = c(CYAN, '•', nc);
      const text = formatInline(ulMatch[1], nc);
      lines.push(`  ${bullet} ${text}`);
      continue;
    }

    // Ordered list items
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      const num = c(CYAN, `${olMatch[1]}.`, nc);
      const text = formatInline(olMatch[2], nc);
      lines.push(`  ${num} ${text}`);
      continue;
    }

    // Table rows
    if (/^\|.+\|/.test(trimmed)) {
      if (/^\|[\s:-]+\|/.test(trimmed) && /---/.test(trimmed)) {
        lines.push(c(DIM, `  ${trimmed}`, nc));
        continue;
      }
      lines.push(`  ${c(DIM, '|', nc)}${trimmed.slice(1, -1).split('|').map(cell => formatInline(cell.trim(), nc)).join(c(DIM, ' | ', nc))}${c(DIM, '|', nc)}`);
      continue;
    }

    // Empty line
    if (trimmed === '') {
      lines.push('');
      continue;
    }

    // Regular paragraph
    lines.push(`  ${formatInline(trimmed, nc)}`);
  }

  return lines;
}

function formatInline(text: string, noColor: boolean): string {
  // Highlight ==text== (yellow background, black text — like a real highlighter)
  text = text.replace(/==(.+?)==/g, (_, m) => c(BG_YELLOW + BLACK, ` ${m} `, noColor));
  // Highlight <mark>text</mark> (same style, HTML variant)
  text = text.replace(/<mark>(.+?)<\/mark>/g, (_, m) => c(BG_YELLOW + BLACK, ` ${m} `, noColor));
  // Strikethrough ~~text~~ (dim + red)
  text = text.replace(/~~(.+?)~~/g, (_, m) => c(DIM + RED, m, noColor));
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, (_, m) => c(BOLD, m, noColor));
  // Italic
  text = text.replace(/\*(.+?)\*/g, (_, m) => c(ITALIC, m, noColor));
  // Inline code
  text = text.replace(/`([^`]+)`/g, (_, m) => c(BG_GRAY + YELLOW, ` ${m} `, noColor));
  return text;
}

/**
 * Render an entire deck to terminal text.
 */
export function renderDeck(markdown: string, options: RenderOptions & { slideNum?: number } = {}): string {
  const parsed = parseSlides(markdown);
  const width = options.width || 80;
  const nc = options.noColor || false;
  const output: string[] = [];

  const slides = options.slideNum
    ? parsed.slides.filter((s) => s.index + 1 === options.slideNum)
    : parsed.slides;

  if (options.slideNum && slides.length === 0) {
    return `Error: Slide ${options.slideNum} not found (deck has ${parsed.slides.length} slides)\n`;
  }

  for (const slide of slides) {
    const num = slide.index + 1;
    const total = parsed.slides.length;
    const layout = slide.frontmatter.layout || 'default';

    if (!options.compact) {
      // Slide header
      const header = ` Slide ${num}/${total} `;
      const layoutTag = ` ${layout} `;
      const lineLen = width - header.length - layoutTag.length;
      output.push('');
      output.push(
        c(BOLD + CYAN, header, nc) +
        c(DIM, '─'.repeat(Math.max(1, lineLen)), nc) +
        c(DIM, layoutTag, nc)
      );
      output.push('');
    }

    const rendered = renderSlideToText(slide.rawMarkdown, options);
    output.push(...rendered);

    if (slide.notes && !options.compact) {
      output.push('');
      output.push(c(DIM + ITALIC, `  📝 ${slide.notes}`, nc));
    }

    if (!options.compact) {
      output.push('');
      output.push(c(DIM, '─'.repeat(width), nc));
    }
  }

  return output.join('\n') + '\n';
}

/**
 * Render a single slide with metadata for agent consumption.
 */
export interface SlideRenderResult {
  slide: number;
  total: number;
  heading?: string;
  layout: string;
  renderedLines: string[];
  lineCount: number;
  fitsScreen: boolean;
  overflow: boolean;
  words: number;
}

export function renderSlideForAgent(markdown: string, slideNum: number, screenHeight = 24): SlideRenderResult {
  const parsed = parseSlides(markdown);
  const slide = parsed.slides.find((s) => s.index + 1 === slideNum);

  if (!slide) {
    return {
      slide: slideNum,
      total: parsed.slides.length,
      layout: 'unknown',
      renderedLines: [`Error: Slide ${slideNum} not found`],
      lineCount: 1,
      fitsScreen: true,
      overflow: false,
      words: 0,
    };
  }

  const rendered = renderSlideToText(slide.rawMarkdown, { noColor: true });
  const headingMatch = slide.rawMarkdown.match(/^#{1,6}\s+(.+)$/m);
  const words = slide.rawMarkdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[#*_`\[\]()>|~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;

  return {
    slide: slideNum,
    total: parsed.slides.length,
    heading: headingMatch ? headingMatch[1].replace(/[*_`]/g, '').trim() : undefined,
    layout: slide.frontmatter.layout || 'default',
    renderedLines: rendered,
    lineCount: rendered.length,
    fitsScreen: rendered.length <= screenHeight - 4, // leave room for chrome
    overflow: rendered.length > screenHeight - 4,
    words,
  };
}
