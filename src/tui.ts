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

  const getTermSize = () => ({
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  function render() {
    const { cols, rows } = getTermSize();
    const slide = parsed.slides[currentSlide];
    const width = Math.min(cols, 120);

    // Get the rendered lines for the current step
    let md: string;
    if (slide.steps && slide.steps.length > 1) {
      // For incremental reveal, reconstruct markdown up to current step
      // We use rawMarkdown split by pause markers
      const segments = slide.rawMarkdown.split(/\s*<!--\s*pause\s*-->\s*/i);
      md = segments.slice(0, currentStep + 1).join('\n\n');
    } else {
      md = slide.rawMarkdown;
    }

    const renderedLines = renderSlideToText(md, { width });

    // Build the frame
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

    // Content area — vertically center the rendered lines
    const contentHeight = rows - 4; // title bar (2 lines) + footer (2 lines)
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
    const helpText = ` ${DIM}←/→ navigate  q quit  g first  G last  ? help${RESET}`;
    output += helpText;

    process.stdout.write(output);
  }

  function next() {
    const slide = parsed.slides[currentSlide];
    if (currentStep < slide.totalSteps - 1) {
      currentStep++;
    } else if (currentSlide < totalSlides - 1) {
      currentSlide++;
      currentStep = 0;
    }
    render();
  }

  function prev() {
    if (currentStep > 0) {
      currentStep--;
    } else if (currentSlide > 0) {
      currentSlide--;
      currentStep = parsed.slides[currentSlide].totalSteps - 1;
    }
    render();
  }

  function first() {
    currentSlide = 0;
    currentStep = 0;
    render();
  }

  function last() {
    currentSlide = totalSlides - 1;
    currentStep = 0;
    render();
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

  // Initial render
  render();

  // Key handling
  process.stdin.on('data', (key: string) => {
    // Ctrl+C
    if (key === '\x03') {
      cleanup();
      process.exit(0);
    }

    if (showHelp) {
      showHelp = false;
      render();
      return;
    }

    switch (key) {
      // Quit
      case 'q':
        cleanup();
        process.exit(0);
        break;

      // Next
      case ' ':
      case 'l':
      case 'j':
      case '\x1b[C': // Right arrow
        next();
        break;

      // Previous
      case 'h':
      case 'k':
      case '\x1b[D': // Left arrow
      case '\x7f':   // Backspace
        prev();
        break;

      // First
      case 'g':
      case '\x1b[H': // Home
        first();
        break;

      // Last
      case 'G':
      case '\x1b[F': // End
        last();
        break;

      // Help
      case '?':
        showHelp = true;
        renderHelp();
        break;
    }
  });
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
