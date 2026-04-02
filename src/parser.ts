import { Marked } from 'marked';
import hljs from 'highlight.js';
import type { Slide, SlidesMeta, SlidesData } from './types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseLineSpec(spec: string): Set<number> {
  const lines = new Set<number>();
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    const range = trimmed.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      for (let i = start; i <= end; i++) lines.add(i);
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) lines.add(num);
    }
  }
  return lines;
}

const marked = new Marked({
  renderer: {
    code({ text, lang: rawLang }: { text: string; lang?: string }) {
      const raw = rawLang || '';
      let lang = raw;
      let lineHighlights = new Set<number>();

      // Check for {exec} and {live} annotations before line highlights
      // Forgiving: allow spaces inside braces and case variations (e.g. { exec }, {Exec}, {LIVE})
      const execMatch = raw.match(/^(\S*)\s*\{\s*exec\s*\}\s*$/i);
      const liveMatch = raw.match(/^(\S*)\s*\{\s*live\s*\}\s*$/i);

      if (execMatch) {
        lang = execMatch[1] || 'js';
        const encoded = Buffer.from(text, 'utf-8').toString('base64');
        // Syntax highlight the code for display
        let highlighted: string;
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(text, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(text).value;
        }
        const langClass = lang ? `hljs language-${lang}` : 'hljs';
        return `<div class="exec-block" data-code="${encoded}"><pre><code class="${langClass}">${highlighted}</code></pre><div class="exec-output"></div></div>`;
      }

      if (liveMatch) {
        const encoded = Buffer.from(text, 'utf-8').toString('base64');
        return `<div class="live-block" data-code="${encoded}"></div>`;
      }

      // {bigtext} — large display text (and bare "bigtext" lang)
      const bigTextMatch = raw.match(/^(\S*)\s*\{\s*bigtext\s*\}\s*$/i);
      if (bigTextMatch || raw.trim().toLowerCase() === 'bigtext') {
        const htmlLines = text.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          return `<div class="bigtext-line">${escapeHtml(trimmed)}</div>`;
        }).join('');
        return `<div class="bigtext-block">${htmlLines}</div>`;
      }

      // {typewriter} — animated typing effect (shows as styled terminal text in browser)
      const typewriterMatch = raw.match(/^(\S*)\s*\{\s*typewriter\s*\}\s*$/i);
      if (typewriterMatch || raw.trim().toLowerCase() === 'typewriter') {
        const htmlLines = text.split('\n').map(line => escapeHtml(line)).join('\n');
        return `<div class="typewriter-block"><pre class="typewriter-text">${htmlLines}</pre></div>`;
      }

      // {pixels} — pixel art (terminal only, show placeholder in browser)
      const pixelsMatch = raw.match(/^(\S*)\s*\{\s*pixels\s*\}\s*$/i);
      if (pixelsMatch || raw.trim().toLowerCase() === 'pixels') {
        return `<div class="pixels-block"><pre class="pixels-art">${escapeHtml(text)}</pre></div>`;
      }

      // Parse line highlight spec: ```python {2,4-6}
      const specMatch = raw.match(/^(\S*)\s*\{(.+?)\}\s*$/);
      if (specMatch) {
        lang = specMatch[1];
        lineHighlights = parseLineSpec(specMatch[2]);
      }

      // Mermaid diagrams — pass through for client-side rendering
      if (lang === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(text)}</div>`;
      }

      // Syntax highlight
      let highlighted: string;
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }

      // Wrap in line spans for line highlighting
      if (lineHighlights.size > 0) {
        const lines = highlighted.split('\n');
        highlighted = lines
          .map((line, i) => {
            const cls = lineHighlights.has(i + 1) ? ' line-highlight' : '';
            return `<span class="code-line${cls}">${line}</span>`;
          })
          .join('\n');
      }

      const langClass = lang ? `hljs language-${lang}` : 'hljs';
      return `<pre><code class="${langClass}">${highlighted}</code></pre>`;
    },
  },
});

/**
 * Split content by <!-- pause --> markers that appear on their own line,
 * ignoring those inside fenced code blocks or inline code.
 */
function splitByPause(content: string): string[] {
  const lines = content.split('\n');
  const segments: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && /^\s*<!--\s*pause\s*-->\s*$/i.test(line)) {
      segments.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  segments.push(current.join('\n'));
  return segments;
}

function parseSimpleYaml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([\w-]+)\s*:\s*(.+)/);
    if (match) {
      let value = match[2].trim();
      // Strip surrounding quotes (common in LLM-generated YAML)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[match[1]] = value;
    }
  }
  return result;
}

function isYamlLike(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return false;
  return lines.every((line) => /^[\w-]+\s*:/.test(line));
}

export function parseSlides(markdown: string): SlidesData {
  // Normalize: strip CRLF, outer markdown fence (common LLM quirk)
  let normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  normalized = normalized.replace(/^```(?:markdown|md)?\n([\s\S]*)\n```\s*$/, '$1');

  const lines = normalized.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];

  // Split by lines that are exactly '---', but not inside fenced code blocks
  let insideCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
    }

    if (!insideCodeBlock && line.trim() === '---') {
      chunks.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  chunks.push(current.join('\n'));

  let startIdx = 0;
  let metaRaw: Record<string, string> = {};

  // Check for global frontmatter: file starts with --- so chunks[0] is empty
  if (chunks.length > 2 && chunks[0].trim() === '') {
    metaRaw = parseSimpleYaml(chunks[1]);
    startIdx = 2;
  }

  const meta: SlidesMeta = {
    title: metaRaw.title || 'Untitled',
    theme: metaRaw.theme || 'default',
    ...metaRaw,
  };

  // Process remaining chunks into slides
  const slides: Slide[] = [];
  let pendingFrontmatter: Record<string, string> | null = null;

  for (let i = startIdx; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (chunk === '') continue;

    if (isYamlLike(chunk)) {
      // This chunk is per-slide frontmatter for the next content chunk
      pendingFrontmatter = parseSimpleYaml(chunk);
    } else {
      // This is slide content
      const frontmatter = pendingFrontmatter || {};
      pendingFrontmatter = null;

      // Extract speaker notes (last HTML comment at end, not spanning across other comments).
      // Exclude framework markers (pause, column) which use the same <!-- --> syntax.
      const FRAMEWORK_MARKERS = new Set(['pause', 'column']);
      let content = chunk;
      let notes: string | undefined;
      const notesMatch = content.match(/\n?<!--((?:(?!<!--)[\s\S])*?)-->\s*$/);
      if (notesMatch && !FRAMEWORK_MARKERS.has(notesMatch[1].trim().toLowerCase())) {
        notes = notesMatch[1].trim();
        content = content.slice(0, notesMatch.index).trim();
      }

      // Split by <!-- pause --> for incremental reveal (only standalone lines)
      const segments = splitByPause(content);
      const totalSteps = segments.length;

      // For two-column layout, split each segment at <!-- column --> before parsing
      const isTwoCol = frontmatter.layout === 'two-column';
      const steps = segments.map((seg) => {
        const trimmed = seg.trim();
        if (isTwoCol && /^\s*<!--\s*column\s*-->\s*$/im.test(trimmed)) {
          const cols = trimmed.split(/^\s*<!--\s*column\s*-->\s*$/im);
          return cols.map((col) => `<div class="slide-col">${marked.parse(col.trim()) as string}</div>`).join('');
        }
        return marked.parse(trimmed) as string;
      });

      const fullHtml = steps.join('');

      slides.push({
        index: slides.length,
        content: fullHtml,
        rawMarkdown: content,
        notes,
        frontmatter,
        steps: totalSteps > 1 ? steps : undefined,
        totalSteps,
      });
    }
  }

  // Fallback: if no slides were created, treat entire content as one slide
  if (slides.length === 0) {
    const html = marked.parse(markdown) as string;
    slides.push({
      index: 0,
      content: html,
      rawMarkdown: markdown,
      frontmatter: {},
      totalSteps: 1,
    });
  }

  // Auto-detect layout for slides that don't have one explicitly set
  for (const slide of slides) {
    if (!slide.frontmatter.layout) {
      slide.frontmatter.layout = detectLayout(slide.rawMarkdown, slide.index, slides.length);
    }
  }

  return { meta, slides };
}

/**
 * Count semantic "blocks" in markdown rather than raw lines.
 * A code block (regardless of how many lines) counts as 1 block.
 * A paragraph, list, blockquote, or table each count as 1 block.
 */
function analyzeContent(md: string) {
  const lines = md.split('\n');
  let headings = 0;
  let paragraphBlocks = 0;
  let codeBlocks = 0;
  let codeBlockLines = 0;
  let listItems = 0;
  let blockquoteBlocks = 0;
  let tableBlocks = 0;
  let textLength = 0;
  let inCode = false;
  let inList = false;
  let inBlockquote = false;
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track code fences
    if (trimmed.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeBlocks++;
        codeBlockLines = 0;
      } else {
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeBlockLines++;
      continue;
    }

    if (trimmed === '') {
      inList = false;
      inBlockquote = false;
      inTable = false;
      continue;
    }

    // Skip pause markers
    if (/^<!--\s*pause\s*-->$/i.test(trimmed)) continue;

    // Headings
    if (/^#{1,6} /.test(trimmed)) {
      headings++;
      continue;
    }

    // Table rows
    if (/^\|.+\|/.test(trimmed)) {
      if (!inTable) { tableBlocks++; inTable = true; }
      continue;
    }

    // List items
    if (/^[-*+] |^\d+\. /.test(trimmed)) {
      listItems++;
      if (!inList) { inList = true; }
      continue;
    }

    // Blockquotes
    if (/^> /.test(trimmed)) {
      if (!inBlockquote) { blockquoteBlocks++; inBlockquote = true; }
      textLength += trimmed.length;
      continue;
    }

    // Regular paragraph text
    paragraphBlocks++;
    textLength += trimmed.length;
  }

  const totalBlocks = paragraphBlocks + codeBlocks + (listItems > 0 ? 1 : 0) + blockquoteBlocks + tableBlocks;

  return { totalBlocks, paragraphBlocks, codeBlocks, codeBlockLines, listItems, blockquoteBlocks, tableBlocks, headings, textLength };
}

/**
 * Heuristically detect the best layout for a slide based on its markdown content.
 *
 * Rules (in priority order):
 *   1. "cover"  — first or last slide with a heading and light supporting content
 *   2. "center" — light content: heading + short text, a blockquote, or few elements
 *   3. "default" — everything else (dense text, large code, tables, long lists)
 */
function detectLayout(md: string, index: number, total: number): string {
  const a = analyzeContent(md);
  if (a.headings === 0 && a.totalBlocks === 0) return 'center';

  const isFirstSlide = index === 0;
  const isLastSlide = index === total - 1;
  const hasHeading = a.headings > 0;

  // --- Cover: title slides ---
  if ((isFirstSlide || isLastSlide) && hasHeading && a.totalBlocks <= 3 && a.textLength < 200 && a.tableBlocks === 0) {
    return 'cover';
  }

  // --- Center: light content ---
  if (a.blockquoteBlocks > 0 && a.paragraphBlocks === 0 && a.codeBlocks === 0 && a.listItems === 0 && a.tableBlocks === 0) {
    return 'center';
  }

  if (hasHeading && a.totalBlocks <= 2 && a.textLength < 200 && a.tableBlocks === 0 && a.listItems <= 3) {
    return 'center';
  }

  if (hasHeading && a.totalBlocks === 0) {
    return 'center';
  }

  // --- Default: dense content ---
  return 'default';
}

export interface SlideWarning {
  slide: number;
  message: string;
}

/**
 * Validate slide markdown for common authoring mistakes.
 * Returns an array of warnings (empty = no issues).
 */
export function validateSlides(markdown: string): SlideWarning[] {
  const warnings: SlideWarning[] = [];
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into raw slide chunks (same logic as parseSlides)
  const lines = normalized.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let insideCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) insideCodeBlock = !insideCodeBlock;
    if (!insideCodeBlock && line.trim() === '---') {
      chunks.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  chunks.push(current.join('\n'));

  // Skip global frontmatter
  let startIdx = 0;
  if (chunks.length > 2 && chunks[0].trim() === '') startIdx = 2;

  let slideNum = 0;
  let pendingFrontmatter: Record<string, string> | null = null;

  for (let i = startIdx; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (chunk === '') continue;

    if (isYamlLike(chunk)) {
      pendingFrontmatter = parseSimpleYaml(chunk);
      continue;
    }

    slideNum++;
    const fm = pendingFrontmatter || {};
    pendingFrontmatter = null;

    // Check: two-column layout without <!-- column --> marker
    if (fm.layout === 'two-column' && !/<!--\s*column\s*-->/i.test(chunk)) {
      warnings.push({ slide: slideNum, message: 'layout: two-column but no <!-- column --> marker found' });
    }

    // Check code blocks within this slide chunk
    const codeBlockRegex = /```(\S*)\s*\{[^}]*\}\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(chunk)) !== null) {
      const annotation = match[0].split('\n')[0];
      const code = match[2];
      const isExec = /\{\s*exec\s*\}/i.test(annotation);
      const isLive = /\{\s*live\s*\}/i.test(annotation);

      if (isExec) {
        // Warn about const/let/var at top level that prevents sharing
        const topLevelDecls = code.match(/^(?:const|let|var)\s+\w+/gm);
        if (topLevelDecls) {
          warnings.push({
            slide: slideNum,
            message: `{exec} block uses ${topLevelDecls[0].split(/\s+/)[0]} — use bare assignment to share variables between blocks`,
          });
        }
      }

      if (isLive && code.includes('<script>')) {
        // Warn about scripts without IIFE wrapper
        const scriptMatch = code.match(/<script>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
          const scriptBody = scriptMatch[1].trim();
          if (!scriptBody.startsWith('(function') && !scriptBody.startsWith('(()') && !scriptBody.startsWith('!function')) {
            warnings.push({
              slide: slideNum,
              message: '{live} <script> missing IIFE wrapper — wrap in (function(){...})() to avoid global pollution',
            });
          }
        }
      }
    }
  }

  return warnings;
}
