# CLAUDE.md

## Project overview

**slides** is a developer-first CLI presentation framework. Write slides in Markdown, serve with hot reload, present in the browser.

**Tech stack:** React 19, Vite 7, TypeScript 5.9, marked (Markdown parser), highlight.js (syntax highlighting), mermaid (diagrams), canvas-confetti, WebSocket (live sync).

## Common commands

```bash
npm run dev                          # Serve example.md with hot reload
npm run slides -- serve deck.md      # Serve a specific file
npm run slides -- serve deck.md --live --tunnel  # Live sync + public tunnel
npx tsc -b                           # Type-check (no emit)
npm run build                        # Production build (tsc + vite)
```

## Architecture

### Key files

| File | Role |
|------|------|
| `src/cli.ts` | CLI entry point. Commands: serve, new, build, generate. Parses flags, creates Vite server. |
| `src/parser.ts` | Markdown-to-slides parser. Splits by `---`, parses frontmatter, detects `{exec}`/`{live}`/mermaid code blocks, splits `<!-- pause -->` for incremental reveal, auto-detects layout. |
| `src/App.tsx` | Main React app. Manages slide index, step, theme state. Keyboard/touch event handlers. Hash-based navigation. |
| `src/components/SlideRenderer.tsx` | Core slide rendering. Executes `{exec}` blocks (Proxy-based scope sharing), decodes and renders `{live}` blocks, renders mermaid diagrams, manages timer auto-cleanup. Wrapped in `React.memo`. |
| `src/vite-plugin-slides.ts` | Custom Vite plugin. Serves parsed slide data as virtual module (`virtual:slides-data`). Watches markdown file for HMR. WebSocket server for live sync. |
| `src/types.ts` | TypeScript interfaces: `Slide`, `SlidesMeta`, `SlidesData`. |
| `src/themes/base.css` | Shared base styles. `default.css`, `dark.css`, `retro.css` for themes. |

### Key patterns

**{exec} blocks:**
- Code is base64-encoded during parsing, decoded at render time
- Uses `Proxy`-based scope (`createExecScope`) so bare variable assignments (without `const`/`let`/`var`) are captured and shared between `{exec}` blocks on the same slide
- Execution happens in `useEffect` via `new Function` with `with(proxy)` wrapper
- Timer functions (`setInterval`/`setTimeout`/`requestAnimationFrame`) are monkey-patched per block to track IDs; all are auto-cleaned on slide change via `createTimerTracker`
- Each block gets an `output` DOM element for async/animated updates

**{live} blocks:**
- HTML is base64-encoded in parser, decoded at render via `decodeBase64Utf8`
- Injected into the DOM via `innerHTML`
- `<script>` tags are reactivated by cloning and replacing each script element (browsers don't execute scripts set via innerHTML)
- Timer functions inside `{live}` scripts are monkey-patched at the window level and tracked for auto-cleanup

**Mermaid:**
- Detected by `lang === 'mermaid'` in parser, passed through as escaped HTML
- Rendered async in `useEffect` via `mermaid.render()`
- Separate state (`mermaidHtml`) stores rendered SVG to avoid re-renders

**Layout detection:**
- Heuristic in `parser.ts` (`detectLayout` function)
- Analyzes content density: headings, paragraphs, code blocks, lists, tables, text length
- First/last slides with light content → `cover`
- Light content (blockquote only, or heading + ≤2 blocks) → `center`
- Everything else → `default`

**SlideRenderer memo:**
- Wrapped in `React.memo` to prevent re-renders that would destroy interactive DOM state ({exec} outputs, {live} widgets, mermaid SVGs)

**Virtual module pattern:**
- `vite-plugin-slides.ts` serves slide data as `virtual:slides-data`
- On markdown file change, invalidates the virtual module for HMR
- Live sync uses a WebSocket server (port 24679) to broadcast slide changes to audience clients

## Style conventions

- TypeScript strict mode
- ES modules (`"type": "module"` in package.json)
- React functional components with hooks
- CSS variables for theming (`--slide-bg`, `--slide-text`, `--slide-accent`, etc.)
- No semicolons in markdown code examples

## Testing

No test framework is currently configured. Validate changes by running `npx tsc -b` (type-check) and manually testing with `npm run dev`.
