import { parseSlides } from './parser.js';

export interface LintResult {
  slide: number;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

export interface LintReport {
  valid: boolean;
  file?: string;
  slides: number;
  errors: LintResult[];
  warnings: LintResult[];
  stats: {
    avgWordsPerSlide: number;
    hasCodeSlides: boolean;
    hasDiagrams: boolean;
    layoutDistribution: Record<string, number>;
    estimatedMinutes: number;
  };
}

function countWords(md: string): number {
  // Strip markdown syntax, count remaining words
  const text = md
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/<!--[\s\S]*?-->/g, '') // remove comments
    .replace(/[#*_`\[\]()>|~-]/g, '') // remove markdown chars
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').length : 0;
}

function getHeading(md: string): string | undefined {
  const match = md.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].replace(/[*_`]/g, '').trim() : undefined;
}

function hasCodeBlock(md: string): boolean {
  return /```/.test(md);
}

function hasExecBlock(md: string): boolean {
  return /```\S*\s*\{\s*exec\s*\}/i.test(md);
}

function hasLiveBlock(md: string): boolean {
  return /```\S*\s*\{\s*live\s*\}/i.test(md);
}

function hasMermaid(md: string): boolean {
  return /```mermaid/i.test(md);
}

/**
 * Extract raw slide chunks from markdown (before parsing).
 * Returns arrays of { rawChunk, frontmatter } for each slide.
 */
function extractRawSlides(markdown: string): { rawChunk: string; frontmatter: Record<string, string> }[] {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const stripped = normalized.replace(/^```(?:markdown|md)?\n([\s\S]*)\n```\s*$/, '$1');

  const lines = stripped.split('\n');
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

  const slides: { rawChunk: string; frontmatter: Record<string, string> }[] = [];
  let pendingFrontmatter: Record<string, string> | null = null;

  for (let i = startIdx; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (chunk === '') continue;

    // Check if this chunk is YAML-like frontmatter
    const yamlLines = chunk.split('\n').filter((l) => l.trim() !== '');
    const isYaml = yamlLines.length > 0 && yamlLines.every((line) => /^[\w-]+\s*:/.test(line));

    if (isYaml) {
      pendingFrontmatter = {};
      for (const line of yamlLines) {
        const match = line.match(/^([\w-]+)\s*:\s*(.+)/);
        if (match) {
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          pendingFrontmatter[match[1]] = value;
        }
      }
    } else {
      slides.push({
        rawChunk: chunk,
        frontmatter: pendingFrontmatter || {},
      });
      pendingFrontmatter = null;
    }
  }

  return slides;
}

export function lintSlides(markdown: string, file?: string): LintReport {
  const rawSlides = extractRawSlides(markdown);
  const parsed = parseSlides(markdown);
  const results: LintResult[] = [];

  // --- Deck-level checks ---

  // Slide count
  if (parsed.slides.length < 4) {
    results.push({
      slide: 0, rule: 'slide-count', severity: 'warning',
      message: `Only ${parsed.slides.length} slides — consider adding more content`,
    });
  } else if (parsed.slides.length > 20) {
    results.push({
      slide: 0, rule: 'slide-count', severity: 'warning',
      message: `${parsed.slides.length} slides — consider splitting into multiple presentations`,
    });
  }

  // --- Per-slide checks ---
  const headings: Map<string, number[]> = new Map();
  let totalWords = 0;

  for (let i = 0; i < rawSlides.length; i++) {
    const { rawChunk, frontmatter } = rawSlides[i];
    const slideNum = i + 1;
    const words = countWords(rawChunk);
    totalWords += words;
    const heading = getHeading(rawChunk);

    // Track headings for duplicate check
    if (heading) {
      const key = heading.toLowerCase();
      if (!headings.has(key)) headings.set(key, []);
      headings.get(key)!.push(slideNum);
    }

    // Empty slide
    if (words === 0 && !hasCodeBlock(rawChunk) && !hasMermaid(rawChunk)) {
      results.push({
        slide: slideNum, rule: 'empty-slide', severity: 'warning',
        message: 'Slide has no meaningful content',
      });
      continue;
    }

    // Missing title on cover/first slide
    if (i === 0 && !heading) {
      results.push({
        slide: slideNum, rule: 'missing-title', severity: 'warning',
        message: 'Cover slide has no heading — add a # or ## heading',
      });
    }

    // Density check
    if (words > 150) {
      results.push({
        slide: slideNum, rule: 'density', severity: 'warning',
        message: `Slide has ${words} words — consider splitting or adding <!-- pause -->`,
      });
    } else if (words > 100 && !rawChunk.includes('<!-- pause -->')) {
      results.push({
        slide: slideNum, rule: 'density', severity: 'warning',
        message: `Slide has ${words} words with no pause — consider adding <!-- pause --> for pacing`,
      });
    }

    // Two-column without marker
    if (frontmatter.layout === 'two-column' && !/<!--\s*column\s*-->/i.test(rawChunk)) {
      results.push({
        slide: slideNum, rule: 'two-column-no-marker', severity: 'error',
        message: 'layout: two-column but no <!-- column --> marker found',
      });
    }

    // Unbalanced two-column
    if (frontmatter.layout === 'two-column' && /<!--\s*column\s*-->/i.test(rawChunk)) {
      const cols = rawChunk.split(/<!--\s*column\s*-->/i);
      if (cols.length === 2) {
        const leftWords = countWords(cols[0]);
        const rightWords = countWords(cols[1]);
        const ratio = Math.max(leftWords, rightWords) / Math.max(Math.min(leftWords, rightWords), 1);
        if (ratio > 3) {
          results.push({
            slide: slideNum, rule: 'unbalanced-columns', severity: 'warning',
            message: `Two-column content is heavily lopsided (${leftWords} vs ${rightWords} words)`,
          });
        }
      }
    }

    // Code block length (skip {pixels} blocks — they're naturally tall)
    const codeBlockRegex = /```[\s\S]*?```/g;
    let codeMatch;
    while ((codeMatch = codeBlockRegex.exec(rawChunk)) !== null) {
      const firstLine = codeMatch[0].split('\n')[0];
      if (/\{\s*pixels\s*\}/i.test(firstLine) || /^```\s*pixels\s*$/i.test(firstLine)) continue;
      if (/\{\s*bigtext\s*\}/i.test(firstLine) || /^```\s*bigtext\s*$/i.test(firstLine)) continue;
      const codeLines = codeMatch[0].split('\n').length - 2; // minus opening/closing fences
      if (codeLines > 15) {
        results.push({
          slide: slideNum, rule: 'code-too-long', severity: 'warning',
          message: `Code block has ${codeLines} lines — may not fit on screen (max ~15)`,
        });
      }
    }

    // {exec} block with const/let/var
    const execRegex = /```\S*\s*\{\s*exec\s*\}\s*\n([\s\S]*?)```/gi;
    let execMatch;
    while ((execMatch = execRegex.exec(rawChunk)) !== null) {
      const code = execMatch[1];
      const declMatch = code.match(/^(?:const|let|var)\s+\w+/m);
      if (declMatch) {
        results.push({
          slide: slideNum, rule: 'exec-const', severity: 'error',
          message: `{exec} block uses ${declMatch[0].split(/\s+/)[0]} — use bare assignment to share variables between blocks`,
        });
      }
    }

    // {live} block without IIFE
    const liveRegex = /```\S*\s*\{\s*live\s*\}\s*\n([\s\S]*?)```/gi;
    let liveMatch;
    while ((liveMatch = liveRegex.exec(rawChunk)) !== null) {
      const code = liveMatch[1];
      const scriptMatch = code.match(/<script>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const body = scriptMatch[1].trim();
        if (!body.startsWith('(function') && !body.startsWith('(()') && !body.startsWith('!function')) {
          results.push({
            slide: slideNum, rule: 'live-no-iife', severity: 'error',
            message: '{live} <script> missing IIFE wrapper — wrap in (function(){...})()',
          });
        }
      }
    }
  }

  // Duplicate headings (deck-level)
  for (const [heading, slideNums] of headings) {
    if (slideNums.length > 1) {
      results.push({
        slide: slideNums[1], rule: 'duplicate-heading', severity: 'warning',
        message: `Heading "${heading}" also appears on slide ${slideNums[0]}`,
      });
    }
  }

  // Compute stats
  const layoutDist: Record<string, number> = {};
  let hasCode = false;
  let hasDiags = false;
  for (const s of rawSlides) {
    const layout = s.frontmatter.layout || parsed.slides[rawSlides.indexOf(s)]?.frontmatter?.layout || 'default';
    layoutDist[layout] = (layoutDist[layout] || 0) + 1;
    if (hasCodeBlock(s.rawChunk)) hasCode = true;
    if (hasMermaid(s.rawChunk)) hasDiags = true;
  }

  const errors = results.filter((r) => r.severity === 'error');
  const warnings = results.filter((r) => r.severity === 'warning');

  return {
    valid: errors.length === 0,
    file,
    slides: rawSlides.length,
    errors,
    warnings,
    stats: {
      avgWordsPerSlide: rawSlides.length > 0 ? Math.round(totalWords / rawSlides.length) : 0,
      hasCodeSlides: hasCode,
      hasDiagrams: hasDiags,
      layoutDistribution: layoutDist,
      estimatedMinutes: Math.max(1, Math.round(rawSlides.length * 1.5)),
    },
  };
}

/**
 * Get structured info about a slide deck.
 */
export interface SlideInfo {
  index: number;
  layout: string;
  heading?: string;
  words: number;
  hasCode: boolean;
  hasExec: boolean;
  hasLive: boolean;
  hasMermaid: boolean;
  steps: number;
  hasNotes: boolean;
}

export interface DeckInfo {
  title: string;
  theme: string;
  slideCount: number;
  slides: SlideInfo[];
}

export function getDeckInfo(markdown: string): DeckInfo {
  const parsed = parseSlides(markdown);
  const slides: SlideInfo[] = parsed.slides.map((s) => ({
    index: s.index + 1,
    layout: s.frontmatter.layout || 'default',
    heading: getHeading(s.rawMarkdown),
    words: countWords(s.rawMarkdown),
    hasCode: hasCodeBlock(s.rawMarkdown),
    hasExec: hasExecBlock(s.rawMarkdown),
    hasLive: hasLiveBlock(s.rawMarkdown),
    hasMermaid: hasMermaid(s.rawMarkdown),
    steps: s.totalSteps,
    hasNotes: !!s.notes,
  }));

  return {
    title: parsed.meta.title,
    theme: parsed.meta.theme,
    slideCount: parsed.slides.length,
    slides,
  };
}

/**
 * Split a markdown file into its raw slide chunks (including frontmatter).
 * Returns an array where each element is the full raw text for one slide
 * (including its per-slide frontmatter if any).
 */
export function splitMarkdownSlides(markdown: string): {
  globalFrontmatter: string;
  slides: { frontmatterChunk: string | null; contentChunk: string }[];
} {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const stripped = normalized.replace(/^```(?:markdown|md)?\n([\s\S]*)\n```\s*$/, '$1');

  const lines = stripped.split('\n');
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

  // Extract global frontmatter
  let globalFrontmatter = '';
  let startIdx = 0;
  if (chunks.length > 2 && chunks[0].trim() === '') {
    globalFrontmatter = `---\n${chunks[1]}\n---`;
    startIdx = 2;
  }

  // Group remaining chunks into slides (frontmatter + content pairs)
  const slides: { frontmatterChunk: string | null; contentChunk: string }[] = [];
  let pendingFm: string | null = null;

  for (let i = startIdx; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (chunk === '') continue;

    const yamlLines = chunk.split('\n').filter((l) => l.trim() !== '');
    const isYaml = yamlLines.length > 0 && yamlLines.every((line) => /^[\w-]+\s*:/.test(line));

    if (isYaml) {
      pendingFm = chunk;
    } else {
      slides.push({ frontmatterChunk: pendingFm, contentChunk: chunk });
      pendingFm = null;
    }
  }

  return { globalFrontmatter, slides };
}

/**
 * Reassemble a markdown file from its parts.
 */
export function assembleMarkdown(
  globalFrontmatter: string,
  slides: { frontmatterChunk: string | null; contentChunk: string }[],
): string {
  const parts: string[] = [];

  if (globalFrontmatter) {
    parts.push(globalFrontmatter);
  }

  for (const slide of slides) {
    if (slide.frontmatterChunk) {
      parts.push(`---\n${slide.frontmatterChunk}\n---\n\n${slide.contentChunk}`);
    } else {
      parts.push(slide.contentChunk);
    }
  }

  // Join with --- separator. The global frontmatter already has its own --- delimiters.
  if (globalFrontmatter) {
    return globalFrontmatter + '\n\n' + parts.slice(1).join('\n\n---\n\n') + '\n';
  }
  return parts.join('\n\n---\n\n') + '\n';
}
