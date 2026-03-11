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
| `src/parser.ts` | Markdown-to-slides parser. Splits by `---`, parses frontmatter, detects `{exec}`/`{live}`/mermaid code blocks, splits `<!-- pause -->` for incremental reveal, auto-detects layout. Also exports `validateSlides()` for linting. |
| `src/App.tsx` | Main React app. Manages slide index, step, theme state. Keyboard/touch event handlers. Hash-based navigation. |
| `src/components/SlideRenderer.tsx` | Core slide rendering. Executes `{exec}` blocks (Proxy-based scope sharing), decodes and renders `{live}` blocks, renders mermaid diagrams, manages timer auto-cleanup. Wrapped in `React.memo`. |
| `src/components/HelpOverlay.tsx` | `?` key overlay showing all keyboard shortcuts. |
| `src/components/SpeakerNotes.tsx` | Bottom panel for speaker notes, toggled with `n` key. |
| `src/hooks/useKeyboard.ts` | Keyboard event handler. Maps keys to navigation, features, digit input. |
| `src/hooks/useTimer.ts` | Presentation timer (total + per-slide elapsed time). |
| `src/hooks/useLiveSync.ts` | WebSocket client for live sync (audience following, reactions). |
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
- Cleanup snapshots and restores each live block's innerHTML (needed for React StrictMode double-invoke in dev mode)
- `.live-block` has `text-align: left` to prevent inheriting center alignment from slide layouts

**Mermaid:**
- Detected by `lang === 'mermaid'` in parser, passed through as escaped HTML
- Rendered async in `useEffect` via `mermaid.render()` with direct DOM mutation (no React state) to preserve {exec}/{live} block state
- Post-render: replaces mermaid v11's broken `foreignObject` labels with native SVG `<text>` elements for correct sizing
- Uses CSS `transform: scale()` for responsive diagram sizing; text colors inherit from theme via `currentColor`

**Layout detection:**
- Heuristic in `parser.ts` (`detectLayout` function)
- Analyzes content density: headings, paragraphs, code blocks, lists, tables, text length
- First/last slides with light content → `cover`
- Light content (blockquote only, or heading + ≤2 blocks) → `center`
- Everything else → `default`
- `two-column` — set explicitly via frontmatter; uses `<!-- column -->` marker to split content into left/right CSS grid columns; heading above columns spans full width
- `terminal` — macOS-style terminal frame with traffic light dots, dark bg, green monospace text; headings are cyan, bold is green, inline code is yellow; set via `layout: terminal` in frontmatter; dots injected by SlideRenderer when layout is 'terminal'

**SlideRenderer memo:**
- Wrapped in `React.memo` to prevent re-renders that would destroy interactive DOM state ({exec} outputs, {live} widgets, mermaid SVGs)

**Virtual module pattern:**
- `vite-plugin-slides.ts` serves slide data as `virtual:slides-data`
- On markdown file change, invalidates the virtual module for HMR
- Live sync uses a WebSocket server on `/live-ws` to broadcast slide changes to audience clients; `useLiveSync` stabilizes the `onSlideChange` callback with a ref to prevent WebSocket reconnects on every slide change

**Ref stabilization pattern (used in useLiveSync, SlideOverview):**
- When a `useEffect` depends on a callback prop or frequently-changing value, use a ref to avoid unnecessary effect re-runs
- Store the value in a ref (`const ref = useRef(value); ref.current = value;`), read from `ref.current` inside the effect, and remove the value from the dependency array
- This prevents teardown/setup cycles for WebSocket connections, event listeners, etc.

**Parser resilience (for LLM-generated content):**
- Annotations are case-insensitive and space-tolerant: `{exec}`, `{ Exec }`, `{LIVE}` all work
- Strips outer markdown code fence wrapping (common LLM quirk)
- Strips surrounding quotes from YAML frontmatter values
- Normalizes CRLF/CR line endings
- Framework markers (`pause`, `column`) excluded from speaker notes extraction

**Additional UI features:**
- Speaker notes: `<!-- Note text -->` comments → toggle with `n` key (`SpeakerNotes.tsx`)
- Print/PDF export: `p` key triggers `window.print()` with `@media print` styles
- Directional slide transitions: forward/backward `translateX` animations based on navigation direction
- Jump to slide by number: type digits + Enter (or auto-jump after 1.5s timeout)
- Dynamic browser tab title: `"Title — N/M"` format
- Error hints for {exec} blocks: contextual fix suggestions for common errors (ReferenceError, TypeError, SyntaxError)
- Inline error display for {live} blocks: script errors shown as `.live-block-error` elements
- Overview mode: `o` key shows grid of slide thumbnails; arrow keys/hjkl navigate grid, Enter selects; navigation keys disabled while open
- Help overlay: `?` key shows all keyboard shortcuts
- Copy button on code blocks: appears on hover (top-right), copies code text to clipboard, shows "Copied!" feedback; works for regular code and {exec} blocks; hidden in print
- Auto-advance mode: `a` key toggles; advances slides/steps every 5s, loops at end; pulsing "Auto" badge in top-right; disabled for audience and overview
- Browser back/forward: `hashchange` listener syncs slide state with browser history (each slide change creates a history entry via `window.location.hash`)
- Slide markdown validator: `validateSlides()` in parser.ts checks for const/let in {exec} blocks, missing IIFE in {live} scripts, missing `<!-- column -->` in two-column layout; integrated into both `serve` (startup) and `generate` (post-output)

## Style conventions

- TypeScript strict mode
- ES modules (`"type": "module"` in package.json)
- React functional components with hooks
- CSS variables for theming (`--slide-bg`, `--slide-text`, `--slide-accent`, etc.)
- No semicolons in markdown code examples

## Testing

No test framework is currently configured. Validate changes by running `npx tsc -b` (type-check) and manually testing with `npm run dev`.
