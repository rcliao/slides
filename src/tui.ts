import { parseSlides } from './parser.js';
import { renderSlideToText } from './render-text.js';

const ESC = '\x1b';
const CLEAR = `${ESC}[2J${ESC}[H`;
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const CYAN = `${ESC}[36m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const RESET = `${ESC}[0m`;

export async function tui(filePath: string) {
  const fs = await import('fs');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseSlides(markdown);
  const totalSlides = parsed.slides.length;

  if (totalSlides === 0) {
    console.error('No slides found.');
    process.exit(1);
  }

  let currentSlide = 0;
  let currentStep = 0;
  let animating = false;
  let typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  const execOutputsPerSlide = new Map<number, Map<number, string>>(); // slide → (block → output)

  const getTermSize = () => ({
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  /**
   * Check if the current slide's raw markdown contains a typewriter block.
   * Returns the lines to animate, or null if no typewriter block.
   */
  function getTypewriterContent(md: string): string[] | null {
    const match = md.match(/```(?:\S*\s*)?\{\s*typewriter\s*\}.*\n([\s\S]*?)```/i)
      || md.match(/```typewriter\s*\n([\s\S]*?)```/i);
    if (!match) return null;
    return match[1].split('\n');
  }

  function buildFrame(renderedLines: string[]): string {
    const { cols, rows } = getTermSize();
    const slide = parsed.slides[currentSlide];

    let output = CLEAR;

    // Title bar
    const title = parsed.meta.title;
    const slideNum = `${currentSlide + 1}/${totalSlides}`;
    const stepInfo = slide.totalSteps > 1 ? ` step ${currentStep + 1}/${slide.totalSteps}` : '';
    const layout = slide.frontmatter.layout || 'auto';
    const left = ` ${BOLD}${CYAN}${title}${RESET}`;
    const right = `${DIM}${layout}${RESET} ${BOLD}${YELLOW}${slideNum}${stepInfo}${RESET} `;
    const titleBarPad = Math.max(0, cols - stripAnsi(left).length - stripAnsi(right).length);
    output += left + ' '.repeat(titleBarPad) + right + '\n';
    output += `${DIM}${'─'.repeat(cols)}${RESET}\n`;

    // Content area — vertically center
    const contentHeight = rows - 4;
    const verticalPad = Math.max(0, Math.floor((contentHeight - renderedLines.length) / 2));

    for (let i = 0; i < contentHeight; i++) {
      const lineIdx = i - verticalPad;
      if (lineIdx >= 0 && lineIdx < renderedLines.length) {
        output += renderedLines[lineIdx];
      }
      output += '\n';
    }

    // Footer
    output += `${DIM}${'─'.repeat(cols)}${RESET}\n`;
    output += ` ${DIM}←/→ navigate  e execute  q quit  ? help${RESET}`;

    return output;
  }

  /** Get the markdown for the current slide/step, respecting incremental reveal. */
  function getCurrentMarkdown(): string {
    const slide = parsed.slides[currentSlide];
    if (slide.steps && slide.steps.length > 1) {
      const segments = slide.rawMarkdown.split(/\s*<!--\s*pause\s*-->\s*/i);
      return segments.slice(0, currentStep + 1).join('\n\n');
    }
    return slide.rawMarkdown;
  }

  function render(stripTypewriter = false) {
    const { cols } = getTermSize();
    const width = Math.min(cols, 120);
    let md = getCurrentMarkdown();

    // If this slide has a typewriter block and we're about to animate,
    // render with empty typewriter content to avoid a flash of full text
    if (stripTypewriter && getTypewriterContent(md)) {
      md = md
        .replace(/```(?:\S*\s*)?\{\s*typewriter\s*\}.*\n[\s\S]*?```/i, '')
        .replace(/```typewriter\s*\n[\s\S]*?```/i, '');
    }

    const slideExecOutputs = execOutputsPerSlide.get(currentSlide);
    const renderedLines = renderSlideToText(md, {
      width,
      execOutputs: slideExecOutputs,
      showExecHint: true,
    });
    process.stdout.write(buildFrame(renderedLines));
  }

  /**
   * Execute all {exec} and {run} blocks on the current slide.
   */
  function executeCurrentSlide() {
    const { cols } = getTermSize();
    const width = Math.min(cols, 120);
    const md = getCurrentMarkdown();

    // Auto-execute and capture outputs
    const outputs = new Map<number, string>();
    renderSlideToText(md, { width, autoExec: true, execOutputs: outputs });

    // Store outputs for this slide
    execOutputsPerSlide.set(currentSlide, outputs);

    // Re-render with outputs
    render();
  }

  /**
   * Slide transition: wipe effect (lines slide in from right).
   */
  async function transitionTo(direction: 'forward' | 'backward') {
    if (animating) return;
    animating = true;

    const { cols } = getTermSize();
    const width = Math.min(cols, 120);

    // Render the new slide's content (respecting incremental reveal steps)
    // Strip typewriter blocks so they don't flash during transition
    let md = getCurrentMarkdown();
    const hasTw = !!getTypewriterContent(md);
    if (hasTw) {
      md = md
        .replace(/```(?:\S*\s*)?\{\s*typewriter\s*\}.*\n[\s\S]*?```/i, '')
        .replace(/```typewriter\s*\n[\s\S]*?```/i, '');
    }
    const newLines = renderSlideToText(md, { width });

    const steps = 4;
    const delay = 25;

    for (let step = 0; step < steps; step++) {
      const fraction = (step + 1) / steps;
      const visibleCount = Math.ceil(newLines.length * fraction);

      const partialLines: string[] = [];
      for (let i = 0; i < newLines.length; i++) {
        if (direction === 'forward') {
          partialLines.push(i < visibleCount ? newLines[i] : '');
        } else {
          partialLines.push(i >= newLines.length - visibleCount ? newLines[i] : '');
        }
      }

      process.stdout.write(buildFrame(partialLines));
      await sleep(delay);
    }

    // Final clean frame (already stripped if typewriter)
    process.stdout.write(buildFrame(newLines));
    animating = false;

    // Start typewriter animation if this slide has one
    startTypewriterIfNeeded();
  }

  /**
   * Typewriter animation: types out content character by character.
   */
  function startTypewriterIfNeeded() {
    const md = getCurrentMarkdown();
    const twContent = getTypewriterContent(md);
    if (!twContent) return;

    const twLines = twContent;
    const currentMd = md; // capture for closure
    const { cols } = getTermSize();
    const width = Math.min(cols, 120);

    // Render the slide but replace typewriter block content with progressive reveal
    let charIndex = 0;
    const totalChars = twLines.reduce((sum, line) => sum + line.length + 1, 0);

    function typewriterFrame() {
      let remaining = charIndex;
      const partialLines: string[] = [];
      for (const line of twLines) {
        if (remaining <= 0) {
          break;
        } else if (remaining >= line.length) {
          partialLines.push(line);
          remaining -= line.length + 1;
        } else {
          partialLines.push(line.slice(0, remaining));
          remaining = 0;
        }
      }

      // Reconstruct the slide markdown with partial typewriter content
      const partialTw = partialLines.join('\n');
      const fullMd = currentMd
        .replace(/```(?:\S*\s*)?\{\s*typewriter\s*\}.*\n[\s\S]*?```/i, partialTw)
        .replace(/```typewriter\s*\n[\s\S]*?```/i, partialTw);

      const renderedLines = renderSlideToText(fullMd, { width });

      // Add a blinking cursor effect at the end of the last typed line
      if (charIndex < totalChars && renderedLines.length > 0) {
        const lastIdx = renderedLines.length - 1;
        renderedLines[lastIdx] = renderedLines[lastIdx] + `${GREEN}█${RESET}`;
      }

      process.stdout.write(buildFrame(renderedLines));

      charIndex++;
      if (charIndex <= totalChars) {
        typewriterTimer = setTimeout(typewriterFrame, 30);
      } else {
        typewriterTimer = null;
      }
    }

    // Small delay before starting
    typewriterTimer = setTimeout(typewriterFrame, 200);
  }

  function stopTypewriter() {
    if (typewriterTimer) {
      clearTimeout(typewriterTimer);
      typewriterTimer = null;
    }
  }

  function next() {
    stopTypewriter();
    const slide = parsed.slides[currentSlide];
    if (currentStep < slide.totalSteps - 1) {
      currentStep++;
      render();
    } else if (currentSlide < totalSlides - 1) {
      currentSlide++;
      currentStep = 0;
      transitionTo('forward');
    }
  }

  function prev() {
    stopTypewriter();
    if (currentStep > 0) {
      currentStep--;
      render();
    } else if (currentSlide > 0) {
      currentSlide--;
      currentStep = parsed.slides[currentSlide].totalSteps - 1;
      transitionTo('backward');
    }
  }

  function first() {
    stopTypewriter();
    currentSlide = 0;
    currentStep = 0;
    render(true);
    startTypewriterIfNeeded();
  }

  function last() {
    stopTypewriter();
    currentSlide = totalSlides - 1;
    currentStep = 0;
    render(true);
    startTypewriterIfNeeded();
  }

  let showHelp = false;

  function renderHelp() {
    const { rows } = getTermSize();
    let output = CLEAR;

    const helpLines = [
      '',
      `${BOLD}${CYAN}  Keyboard Shortcuts${RESET}`,
      '',
      `  ${BOLD}→${RESET}  /  ${BOLD}l${RESET}  /  ${BOLD}j${RESET}  /  ${BOLD}Space${RESET}     Next slide/step`,
      `  ${BOLD}←${RESET}  /  ${BOLD}h${RESET}  /  ${BOLD}k${RESET}  /  ${BOLD}Backspace${RESET}  Previous slide/step`,
      `  ${BOLD}g${RESET}  /  ${BOLD}Home${RESET}                  First slide`,
      `  ${BOLD}G${RESET}  /  ${BOLD}End${RESET}                   Last slide`,
      `  ${BOLD}e${RESET}                          Execute code blocks`,
      `  ${BOLD}q${RESET}  /  ${BOLD}Ctrl+C${RESET}               Quit`,
      `  ${BOLD}?${RESET}                          Toggle this help`,
      '',
      `  ${DIM}Press any key to return${RESET}`,
    ];

    const verticalPad = Math.max(0, Math.floor((rows - helpLines.length) / 2));
    for (let i = 0; i < rows - 1; i++) {
      const lineIdx = i - verticalPad;
      if (lineIdx >= 0 && lineIdx < helpLines.length) {
        output += helpLines[lineIdx];
      }
      output += '\n';
    }

    process.stdout.write(output);
  }

  function cleanup() {
    stopTypewriter();
    process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  // Enter alternate screen, hide cursor, enable raw mode
  process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE);

  if (!process.stdin.isTTY) {
    console.error('Error: tui mode requires an interactive terminal');
    process.stdout.write(ALT_SCREEN_OFF + CURSOR_SHOW);
    process.exit(1);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');

  // Handle resize
  process.stdout.on('resize', () => {
    if (showHelp) renderHelp();
    else render();
  });

  // Initial render + typewriter (strip typewriter content to avoid flash)
  render(true);
  startTypewriterIfNeeded();

  // Key handling
  process.stdin.on('data', (key: string) => {
    if (key === '\x03') {
      cleanup();
      process.exit(0);
    }

    if (animating) return; // ignore input during transitions

    if (showHelp) {
      showHelp = false;
      render(true);
      startTypewriterIfNeeded();
      return;
    }

    switch (key) {
      case 'q':
        cleanup();
        process.exit(0);
        break;
      case ' ':
      case 'l':
      case 'j':
      case '\x1b[C':
        next();
        break;
      case 'h':
      case 'k':
      case '\x1b[D':
      case '\x7f':
        prev();
        break;
      case 'g':
      case '\x1b[H':
        first();
        break;
      case 'G':
      case '\x1b[F':
        last();
        break;
      case 'e':
        executeCurrentSlide();
        break;
      case '?':
        stopTypewriter();
        showHelp = true;
        renderHelp();
        break;
    }
  });
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
