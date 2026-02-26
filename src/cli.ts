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

Options:
  --live                  Enable live sync (audience can follow along)
  --tunnel                Start a Cloudflare tunnel for public access (requires cloudflared)
  --output=file.md        Output file for generate command (default: generated.md)

Examples:
  slides serve deck.md
  slides serve deck.md --live --tunnel
  slides new my-talk.md
  slides build deck.md
  slides generate "Introduction to Rust"

Keyboard shortcuts (in presentation):
  Right / Space / l / j   Next slide / step
  Left / Backspace / h / k Previous slide / step
  g / Home                First slide
  G / End                 Last slide
  f                       Toggle fullscreen
  o                       Toggle overview
  t                       Toggle timer
  d                       Cycle themes
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

  console.log(`\n  Press ? in the browser for keyboard shortcuts\n`);

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

Format rules:
- Start with YAML frontmatter between --- delimiters (title, theme)
- Separate slides with ---
- Use per-slide frontmatter (layout, bg, confetti) between --- delimiters when appropriate
- Use ## for section headings, # for title/closing slides
- Include code examples with syntax highlighting where relevant
- Use <!-- pause --> for incremental reveals on content-heavy slides
- Use mermaid code blocks for diagrams when it helps explain concepts
- Add speaker notes with <!-- Note text here -->
- Keep each slide focused on one idea
- Aim for 8-12 slides
- First slide: title/cover, Last slide: closing with confetti: true
- Use bullet points for key ideas, code blocks for examples
- Available themes: default, dark, retro
- Available layouts: default, center, cover
- Available backgrounds: castle, northlights, dawn, cherryblossom, falls, nature, bridge_raining, et, watchdogs, pixelphony_2`;

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
  console.log(`\nPreview it with:`);
  console.log(`  slides serve ${outputFile}\n`);
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
