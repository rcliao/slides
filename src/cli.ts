import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

const VERSION = '0.1.0';

const HELP = `
slides v${VERSION}
A developer-first presentation framework.

Usage:
  slides serve [file]     Start dev server with hot reload (default: example.md)
  slides new [file]       Create a new presentation from template
  slides build [file]     Build static site for deployment
  slides generate [topic] Generate a presentation with AI (requires ANTHROPIC_API_KEY)
  slides help             Show this help message

Agent-friendly commands:
  slides info <file>      Show deck structure and stats (--json for machine-readable)
  slides lint <file>      Validate deck quality (--json for machine-readable)
  slides print <file>     Render slides to terminal (non-interactive)
  slides render <file> <N> Render slide N with fit metadata (JSON)
  slides tui <file>       Interactive terminal presentation (fullscreen)
  slides get <file> <N>   Extract slide N as raw markdown
  slides set <file> <N>   Replace slide N (reads from stdin)
  slides insert <file> <N> Insert slide after position N (reads from stdin)
  slides remove <file> <N> Remove slide N

Options:
  --live                  Enable live sync (audience can follow along)
  --tunnel                Start a Cloudflare tunnel for public access (requires cloudflared)
  --output=file.md        Output file for generate command (default: generated.md)
  --json                  Machine-readable JSON output (info, lint)
  --slide=N               Render only slide N (print)
  --compact               Minimal chrome (print)
  --no-color              Plain text without ANSI codes (print)
  --width=N               Terminal width for rendering (print, default: 80)

Examples:
  slides serve deck.md
  slides serve deck.md --live --tunnel
  slides new my-talk.md
  slides build deck.md
  slides generate "Introduction to Rust"

  # Agent workflow
  slides lint deck.md --json
  slides info deck.md --json
  slides print deck.md --slide=3
  slides get deck.md 5
  echo "## New Slide\\n\\nContent here" | slides set deck.md 5

Keyboard shortcuts (in presentation):
  Right / Space / l / j   Next slide / step
  Left / Backspace / h / k Previous slide / step
  g / Home                First slide
  G / End                 Last slide
  1-9 + Enter             Jump to slide number
  f                       Toggle fullscreen
  o                       Toggle overview
  t                       Toggle timer
  n                       Toggle speaker notes
  d                       Cycle themes
  p                       Print / export PDF
  ?                       Toggle help overlay
  Escape                  Close overlay
`;

const TEMPLATE = `---
title: My Presentation
theme: default
---

# My Presentation

A presentation built with **slides**

---

## Agenda

- Topic 1
- Topic 2
- Topic 3

<!-- Speaker notes: remember to introduce yourself -->

---

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

---
layout: center
---

## Key Takeaway

> The best presentations tell a story.

---
confetti: true
---

# Thanks!

Questions?
`;

async function serve(file: string, options: { live?: boolean; tunnel?: boolean } = {}) {
  const filePath = path.resolve(file);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    console.error(`\nRun "slides new ${file}" to create a new presentation.`);
    process.exit(1);
  }

  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const { slidesPlugin } = await import('./vite-plugin-slides.js');

  const server = await createServer({
    root: packageRoot,
    configFile: false,
    plugins: [react(), slidesPlugin({ file: filePath, live: options.live })],
    server: {
      open: true,
    },
  });

  await server.listen();

  console.log(`\n  slides v${VERSION}\n`);
  console.log(`  Serving: ${path.relative(process.cwd(), filePath)}`);
  server.printUrls();

  if (options.live) {
    const addr = server.resolvedUrls?.local?.[0] || 'http://localhost:5173/';
    console.log(`  Audience: ${addr}?audience`);
  }

  // Validate slide markdown and print any warnings
  const { validateSlides } = await import('./parser.js');
  const warnings = validateSlides(fs.readFileSync(filePath, 'utf-8'));
  if (warnings.length > 0) {
    console.log(`  Warnings:`);
    for (const w of warnings) {
      console.log(`    Slide ${w.slide}: ${w.message}`);
    }
    console.log();
  }

  console.log(`  Press ? in the browser for keyboard shortcuts\n`);

  if (options.tunnel) {
    startTunnel(server);
  }
}

async function startTunnel(server: import('vite').ViteDevServer) {
  const { spawn } = await import('child_process');
  const addr = server.resolvedUrls?.local?.[0] || 'http://localhost:5173';

  console.log('  Starting Cloudflare tunnel...\n');

  const tunnel = spawn('cloudflared', ['tunnel', '--url', addr], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  tunnel.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    const urlMatch = text.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
    if (urlMatch) {
      console.log(`  Public URL: ${urlMatch[0]}`);
      console.log(`  Audience:   ${urlMatch[0]}?audience\n`);
    }
  });

  tunnel.on('error', () => {
    console.error(
      '  Error: cloudflared not found.\n' +
      '  Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/\n',
    );
  });

  // Clean up tunnel on exit
  process.on('SIGINT', () => {
    tunnel.kill();
    process.exit();
  });
}

async function build(file: string) {
  const filePath = path.resolve(file);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const { build: viteBuild } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const { slidesPlugin } = await import('./vite-plugin-slides.js');

  await viteBuild({
    root: packageRoot,
    configFile: false,
    plugins: [react(), slidesPlugin({ file: filePath })],
  });

  console.log('\nBuild complete! Output in dist/');
}

function create(file: string) {
  if (fs.existsSync(file)) {
    console.error(`Error: File already exists: ${file}`);
    process.exit(1);
  }

  fs.writeFileSync(file, TEMPLATE);
  console.log(`Created: ${file}`);
  console.log(`\nStart presenting:`);
  console.log(`  npx tsx src/cli.ts serve ${file}`);
}

async function generate(topic: string, outputFile: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('Set it with: export ANTHROPIC_API_KEY=your-key');
    process.exit(1);
  }

  console.log(`\nGenerating presentation about: ${topic}\n`);

  const systemPrompt = `You are a presentation designer. Generate slide decks in markdown format.
Output ONLY the raw markdown content, no code fences or explanations.

## Format rules
- Start with YAML frontmatter between --- delimiters (title, theme)
- Separate slides with ---
- Use per-slide frontmatter (layout, bg, confetti, particles) between --- delimiters when appropriate
- Per-slide frontmatter goes on the line AFTER the --- separator, then another --- closes it:
  ---
  layout: center
  ---
- Use ## for section headings, # for title/closing slides
- Bold text in headings gets accent color: ## From **Crashes** to **Confidence**
- Include code examples with syntax highlighting and optional line highlighting: \`\`\`python {2,4-6}
- Use <!-- pause --> for incremental reveals on content-heavy slides
- Add speaker notes with <!-- Note text here -->
- Keep each slide focused on one idea
- Aim for 8-12 slides
- First slide: title/cover, Last slide: closing with confetti: true
- Available themes: default, dark, retro
- Available layouts: default, center, cover, two-column, terminal
- terminal layout: wraps content in a macOS-style terminal frame (dark bg, green monospace text, traffic light dots). Great for CLI demos, command output, or code-heavy slides
- For two-column layout: set \`layout: two-column\` in frontmatter and use \`<!-- column -->\` to split content into left/right columns
- Available backgrounds: castle, northlights, dawn, cherryblossom, falls, nature, bridge_raining, et, watchdogs, pixelphony_2

## Mermaid diagrams
Use mermaid code blocks for diagrams:
\`\`\`mermaid
graph LR
    A[Input] --> B[Process]
    B --> C[Output]
\`\`\`

## {exec} blocks — runnable JavaScript
Use \`\`\`js {exec} to run JavaScript live in the slide. Code is displayed AND executed.

Key rules:
- \`console.log()\` output appears below the code block
- An \`output\` DOM element is available for dynamic/animated content
- \`setInterval\`/\`setTimeout\`/\`requestAnimationFrame\` auto-cleanup on slide change
- Multiple {exec} blocks on the SAME slide share state: assign variables WITHOUT const/let/var to share them
- Use \`const\`/\`let\` for block-local variables, bare assignment for shared state
- IMPORTANT: Code is displayed verbatim, so keep {exec} blocks SHORT (5-6 lines max). For complex visuals, use {live} blocks instead

Example — static output:
\`\`\`js {exec}
data = [["JS", 17.4], ["Python", 14.1], ["Rust", 4.7]]
data.forEach(([lang, pct]) => {
  const bar = "█".repeat(Math.round(pct / 17.4 * 20))
  console.log(lang.padEnd(10) + bar + " " + pct + "%")
})
\`\`\`

Example — animated output using \`output\` element:
\`\`\`js {exec}
let count = 0
const el = document.createElement('div')
el.style.fontSize = '2rem'
el.style.fontFamily = 'monospace'
output.appendChild(el)
setInterval(() => { count++; el.textContent = "Count: " + count }, 1000)
\`\`\`

Example — shared state between blocks on same slide:
\`\`\`js {exec}
items = ["alpha", "beta", "gamma"]
console.log("Created " + items.length + " items")
\`\`\`
Then later on the SAME slide:
\`\`\`js {exec}
console.log("First item: " + items[0])
\`\`\`

## {live} blocks — rendered HTML/CSS/JS
Use \`\`\`html {live} for inline-rendered HTML. The code is NOT shown — only the rendered output appears.

Key rules:
- Include <style> tags for CSS, <script> tags for JS
- Scripts are executed in the page context (not sandboxed)
- Use CSS variables for theme-aware styling: var(--slide-accent), var(--slide-text), var(--slide-bg)
- Timers in <script> tags auto-cleanup on slide change
- Wrap script code in an IIFE to avoid global pollution
- Use a fixed-width wrapper (700px) or fixed-size canvas for consistent sizing across layouts
- Prefix all CSS class names with a short unique prefix (e.g. .mywidget-) to avoid conflicts across slides
- IMPORTANT: Scripts may run twice in dev mode (React StrictMode). Make scripts idempotent: clear container innerHTML at the start before building DOM content
- Add text-align:left to any container that builds text content — slides inherit text-align:center from the layout

Example — DOM widget:
\`\`\`html {live}
<style>
  .my-widget { padding: 1.5rem; border-radius: 12px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; font-family: system-ui; }
  .my-widget h3 { margin: 0 0 0.5rem; }
</style>
<div class="my-widget">
  <h3>Interactive Widget</h3>
  <p id="my-clock">--:--:--</p>
</div>
<script>
  (function() {
    var el = document.getElementById('my-clock');
    function tick() { el.textContent = new Date().toLocaleTimeString(); }
    tick();
    setInterval(tick, 1000);
  })();
</script>
\`\`\`

Example — canvas animation (most common pattern for visuals):
\`\`\`html {live}
<style>
  .demo-canvas { display:block; margin:0 auto; border-radius:12px; background:#111; }
</style>
<canvas class="demo-canvas" width="700" height="350"></canvas>
<script>
(function() {
  var c = document.querySelector('.demo-canvas');
  if (!c) return;
  var ctx = c.getContext('2d'), W = c.width, H = c.height;
  function frame() {
    ctx.clearRect(0, 0, W, H);
    // draw here
    requestAnimationFrame(frame);
  }
  frame();
})();
</script>
\`\`\`

## Terminal layout
Use \`layout: terminal\` for slides that should look like a macOS terminal window:
- Automatically adds traffic light dots, dark background, green monospace text
- Content is rendered inside the terminal frame — just write normal markdown
- Headings become cyan, bold becomes green, inline code becomes yellow
- Great for CLI demos, command output, or deploy logs

Example:
---
layout: terminal
---
## Deploy Log

$ npm run build
Build complete in 2.3s

$ rsync -avz dist/ server:/var/www/
sent 1.2MB, 24 files

**Deploy successful** — 3 replicas healthy

## Inline formatting
- \`==text==\` for highlighted text (yellow background in terminal, rendered as \`<mark>\` in browser)
- \`<mark>text</mark>\` for highlighted text (works in both browser and terminal)
- \`~~text~~\` for strikethrough text
- \`**bold**\` for bold, \`*italic*\` for italic
- Use highlights to draw attention to key terms, metrics, or changes

## {pixels} blocks — pixel art
Use \`\`\`pixels for terminal-rendered pixel art using Unicode half-block characters.
Each character maps to a color: \`.=transparent, R=red, G=green, B=blue, Y=yellow, C=cyan, M=magenta, O=orange, K=black, W=white, 0-9=grayscale\`
Best for small sprites (under 20 rows). Renders in terminal TUI/print modes; shows as raw text in browser.

Example:
\`\`\`pixels
....RRRR....
..RRRRRRRR..
..RR.RR.RRR.
..RRRRRRRRRR
..RRR.RR.RRR
...RR.RR.RR.
....RRRRRR..
\`\`\`

## Common mistakes to avoid
- Do NOT use \`document.getElementById\` in {exec} blocks — use the provided \`output\` element instead
- Do NOT put {exec} code inside {live} blocks or vice versa — they are separate systems
- Do NOT use const/let for variables you want to share between {exec} blocks — use bare assignment
- Do NOT forget the IIFE wrapper in {live} <script> tags
- Do NOT use class names that might conflict across slides — prefix with the slide topic
- Do NOT forget to clear container state at the start of {live} scripts (e.g. container.innerHTML = '')
- Do NOT forget text-align:left on containers that build text (slides center-align by default)`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate a presentation about: ${topic}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`API error: ${response.status} ${error}`);
    process.exit(1);
  }

  const data = (await response.json()) as { content: { text: string }[] };
  let markdown = data.content[0].text;

  // Strip markdown code fence if the LLM wrapped the output
  markdown = markdown.replace(/^```(?:markdown)?\n/, '').replace(/\n```\s*$/, '');

  fs.writeFileSync(outputFile, markdown);
  console.log(`Generated: ${outputFile}`);

  // Validate the generated markdown and print warnings
  const { validateSlides } = await import('./parser.js');
  const warnings = validateSlides(markdown);
  if (warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of warnings) {
      console.log(`    Slide ${w.slide}: ${w.message}`);
    }
  }

  console.log(`\nPreview it with:`);
  console.log(`  slides serve ${outputFile}\n`);
}

// --- Agent-friendly commands ---

async function info(file: string, json: boolean) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { getDeckInfo } = await import('./lint.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const deckInfo = getDeckInfo(markdown);

  if (json) {
    console.log(JSON.stringify(deckInfo, null, 2));
  } else {
    console.log(`\n  ${deckInfo.title}`);
    console.log(`  Theme: ${deckInfo.theme} | Slides: ${deckInfo.slideCount}\n`);
    for (const s of deckInfo.slides) {
      const features = [
        s.hasCode && 'code',
        s.hasExec && 'exec',
        s.hasLive && 'live',
        s.hasMermaid && 'mermaid',
        s.hasNotes && 'notes',
      ].filter(Boolean);
      const featureStr = features.length > 0 ? ` [${features.join(', ')}]` : '';
      const heading = s.heading || '(no heading)';
      console.log(`  ${String(s.index).padStart(2)}. ${heading.padEnd(40)} ${s.layout.padEnd(12)} ${String(s.words).padStart(3)}w ${String(s.steps).padStart(1)}s${featureStr}`);
    }
    console.log();
  }
}

async function lint(file: string, json: boolean) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { lintSlides } = await import('./lint.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const report = lintSlides(markdown, file);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (report.errors.length === 0 && report.warnings.length === 0) {
      console.log(`\n  ✓ ${file}: ${report.slides} slides, no issues\n`);
    } else {
      console.log(`\n  ${file}: ${report.slides} slides\n`);
      for (const e of report.errors) {
        const prefix = e.slide > 0 ? `Slide ${e.slide}` : 'Deck';
        console.log(`  ✗ ${prefix}: ${e.message}`);
      }
      for (const w of report.warnings) {
        const prefix = w.slide > 0 ? `Slide ${w.slide}` : 'Deck';
        console.log(`  ⚠ ${prefix}: ${w.message}`);
      }
      console.log();
    }
    // Always show stats
    console.log(`  Stats: ~${report.stats.avgWordsPerSlide} words/slide, ~${report.stats.estimatedMinutes} min`);
    console.log(`  Layouts: ${Object.entries(report.stats.layoutDistribution).map(([k, v]) => `${k}(${v})`).join(', ')}`);
    if (report.stats.hasCodeSlides) console.log('  Has code slides');
    if (report.stats.hasDiagrams) console.log('  Has diagrams');
    console.log();
  }

  if (!report.valid) process.exit(1);
}

async function print(file: string, options: { slide?: number; compact?: boolean; noColor?: boolean; width?: number }) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { renderDeck } = await import('./render-text.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const output = renderDeck(markdown, {
    slideNum: options.slide,
    compact: options.compact,
    noColor: options.noColor,
    width: options.width,
    autoExec: true,
  });
  process.stdout.write(output);
}

async function render(file: string, slideNum: number, options: { width?: number; screenHeight?: number }) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { renderSlideForAgent } = await import('./render-text.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const result = renderSlideForAgent(markdown, slideNum, options.screenHeight);
  console.log(JSON.stringify(result, null, 2));
}

async function getSlide(file: string, slideNum: number) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { splitMarkdownSlides } = await import('./lint.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const { slides } = splitMarkdownSlides(markdown);

  if (slideNum < 1 || slideNum > slides.length) {
    console.error(`Error: Slide ${slideNum} not found (deck has ${slides.length} slides)`);
    process.exit(1);
  }

  const slide = slides[slideNum - 1];
  if (slide.frontmatterChunk) {
    console.log(`---\n${slide.frontmatterChunk}\n---\n`);
  }
  console.log(slide.contentChunk);
}

async function setSlide(file: string, slideNum: number) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { splitMarkdownSlides, assembleMarkdown } = await import('./lint.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const { globalFrontmatter, slides } = splitMarkdownSlides(markdown);

  if (slideNum < 1 || slideNum > slides.length) {
    console.error(`Error: Slide ${slideNum} not found (deck has ${slides.length} slides)`);
    process.exit(1);
  }

  // Read new content from stdin
  const input = fs.readFileSync(0, 'utf-8').trim();

  // Check if input has frontmatter
  const fmMatch = input.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (fmMatch) {
    slides[slideNum - 1] = { frontmatterChunk: fmMatch[1].trim(), contentChunk: fmMatch[2].trim() };
  } else {
    slides[slideNum - 1] = { frontmatterChunk: null, contentChunk: input };
  }

  fs.writeFileSync(filePath, assembleMarkdown(globalFrontmatter, slides));
  console.log(`Updated slide ${slideNum} in ${file}`);
}

async function insertSlide(file: string, afterNum: number) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { splitMarkdownSlides, assembleMarkdown } = await import('./lint.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const { globalFrontmatter, slides } = splitMarkdownSlides(markdown);

  if (afterNum < 0 || afterNum > slides.length) {
    console.error(`Error: Position ${afterNum} is out of range (deck has ${slides.length} slides)`);
    process.exit(1);
  }

  const input = fs.readFileSync(0, 'utf-8').trim();

  const fmMatch = input.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  const newSlide = fmMatch
    ? { frontmatterChunk: fmMatch[1].trim(), contentChunk: fmMatch[2].trim() }
    : { frontmatterChunk: null, contentChunk: input };

  slides.splice(afterNum, 0, newSlide);

  fs.writeFileSync(filePath, assembleMarkdown(globalFrontmatter, slides));
  console.log(`Inserted slide at position ${afterNum + 1} in ${file} (${slides.length} total)`);
}

async function removeSlide(file: string, slideNum: number) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  const { splitMarkdownSlides, assembleMarkdown } = await import('./lint.js');
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const { globalFrontmatter, slides } = splitMarkdownSlides(markdown);

  if (slideNum < 1 || slideNum > slides.length) {
    console.error(`Error: Slide ${slideNum} not found (deck has ${slides.length} slides)`);
    process.exit(1);
  }

  slides.splice(slideNum - 1, 1);
  fs.writeFileSync(filePath, assembleMarkdown(globalFrontmatter, slides));
  console.log(`Removed slide ${slideNum} from ${file} (${slides.length} remaining)`);
}

// --- Main ---

const allArgs = process.argv.slice(2);
const positional = allArgs.filter((a) => !a.startsWith('--'));
const flags = allArgs.filter((a) => a.startsWith('--'));

const [command, ...restPositional] = positional;

function getFlag(name: string): boolean {
  return flags.includes(`--${name}`);
}

function getFlagValue(name: string, defaultValue: string): string {
  const flag = flags.find((f) => f.startsWith(`--${name}=`));
  return flag ? flag.split('=')[1] : defaultValue;
}

switch (command) {
  case 'serve':
  case 's': {
    const file = restPositional[0] || 'example.md';
    serve(file, {
      live: getFlag('live'),
      tunnel: getFlag('tunnel'),
    });
    break;
  }
  case 'build':
  case 'b': {
    const file = restPositional[0] || 'example.md';
    build(file);
    break;
  }
  case 'new':
  case 'n': {
    const file = restPositional[0] || 'slides.md';
    create(file);
    break;
  }
  case 'generate':
  case 'gen': {
    const topic = restPositional.join(' ');
    const output = getFlagValue('output', 'generated.md');
    if (!topic) {
      console.error('Usage: slides generate "Your topic here" [--output=file.md]');
      process.exit(1);
    }
    generate(topic, output);
    break;
  }
  case 'info':
  case 'i': {
    const file = restPositional[0];
    if (!file) {
      console.error('Usage: slides info <file> [--json]');
      process.exit(1);
    }
    info(file, getFlag('json'));
    break;
  }
  case 'lint':
  case 'l': {
    const file = restPositional[0];
    if (!file) {
      console.error('Usage: slides lint <file> [--json]');
      process.exit(1);
    }
    lint(file, getFlag('json'));
    break;
  }
  case 'print':
  case 'p': {
    const file = restPositional[0];
    if (!file) {
      console.error('Usage: slides print <file> [--slide=N] [--compact] [--no-color] [--width=N]');
      process.exit(1);
    }
    const slideVal = getFlagValue('slide', '0');
    print(file, {
      slide: parseInt(slideVal) || undefined,
      compact: getFlag('compact'),
      noColor: getFlag('no-color'),
      width: parseInt(getFlagValue('width', '80')) || 80,
    });
    break;
  }
  case 'render':
  case 'r': {
    const file = restPositional[0];
    const num = parseInt(restPositional[1]);
    if (!file || !num) {
      console.error('Usage: slides render <file> <slide-number> [--width=N] [--height=N]');
      process.exit(1);
    }
    render(file, num, {
      width: parseInt(getFlagValue('width', '80')) || 80,
      screenHeight: parseInt(getFlagValue('height', '24')) || 24,
    });
    break;
  }
  case 'tui':
  case 't': {
    const file = restPositional[0];
    if (!file) {
      console.error('Usage: slides tui <file>');
      process.exit(1);
    }
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    import('./tui.js').then(({ tui: runTui }) => runTui(filePath));
    break;
  }
  case 'get': {
    const file = restPositional[0];
    const num = parseInt(restPositional[1]);
    if (!file || !num) {
      console.error('Usage: slides get <file> <slide-number>');
      process.exit(1);
    }
    getSlide(file, num);
    break;
  }
  case 'set': {
    const file = restPositional[0];
    const num = parseInt(restPositional[1]);
    if (!file || !num) {
      console.error('Usage: slides set <file> <slide-number> (reads from stdin)');
      process.exit(1);
    }
    setSlide(file, num);
    break;
  }
  case 'insert': {
    const file = restPositional[0];
    const num = parseInt(restPositional[1]);
    if (!file || isNaN(num)) {
      console.error('Usage: slides insert <file> <after-position> (reads from stdin)');
      process.exit(1);
    }
    insertSlide(file, num);
    break;
  }
  case 'remove':
  case 'rm': {
    const file = restPositional[0];
    const num = parseInt(restPositional[1]);
    if (!file || !num) {
      console.error('Usage: slides remove <file> <slide-number>');
      process.exit(1);
    }
    removeSlide(file, num);
    break;
  }
  case 'help':
  case '-h':
  case '--help':
  case undefined:
    console.log(HELP);
    break;
  default:
    // If the argument looks like a file, serve it
    if (command.endsWith('.md')) {
      serve(command, {
        live: getFlag('live'),
        tunnel: getFlag('tunnel'),
      });
    } else {
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
    }
}
