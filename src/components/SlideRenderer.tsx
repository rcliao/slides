import { useEffect, useRef, useState, useMemo, memo } from 'react';

interface SlideRendererProps {
  html: string;
  steps?: string[];
  currentStep: number;
  layout: string;
  bg?: string;
  particles?: boolean;
}

/** Decode base64 that was encoded from UTF-8 (Node Buffer.toString('base64')). */
function decodeBase64Utf8(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Proxy-based scope that captures bare variable assignments.
 * `with(proxy) { x = 5 }` stores x in storage; globals like
 * Math/Array/Object fall through to the real global scope.
 */
function createExecScope(storage: Record<string, unknown>) {
  return new Proxy(storage, {
    has(_target, key) {
      if (key === Symbol.unscopables) return false;
      if (key in storage) return true;
      if (key in globalThis) return false;
      return true;
    },
    get(_target, key) {
      return storage[key as string];
    },
    set(_target, key, value) {
      storage[key as string] = value;
      return true;
    },
  });
}

// Capture original timer globals once at module load, before any monkey-patching
const _setInterval = window.setInterval.bind(window);
const _setTimeout = window.setTimeout.bind(window);
const _requestAnimationFrame = window.requestAnimationFrame.bind(window);

/** Create a timer tracker that auto-cleans intervals, timeouts, and rafs. */
function createTimerTracker() {
  const ids = { intervals: [] as number[], timeouts: [] as number[], rafs: [] as number[] };
  return {
    setInterval: (fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id = _setInterval(fn, ms, ...args);
      ids.intervals.push(id);
      return id;
    },
    setTimeout: (fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id = _setTimeout(fn, ms, ...args);
      ids.timeouts.push(id);
      return id;
    },
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      const id = _requestAnimationFrame(fn);
      ids.rafs.push(id);
      return id;
    },
    cleanup: () => {
      ids.intervals.forEach(clearInterval);
      ids.timeouts.forEach(clearTimeout);
      ids.rafs.forEach(cancelAnimationFrame);
    },
  };
}

/** Return a helpful hint for common {exec} errors, or null if no hint applies. */
function getExecErrorHint(err: unknown, code: string): string | null {
  const msg = String(err);

  if (err instanceof ReferenceError) {
    const varMatch = msg.match(/(\w+) is not defined/);
    if (varMatch) {
      // Check if the variable was likely declared with const/let in a previous block
      return `Hint: Use bare assignment (${varMatch[1]} = ...) without const/let/var to share variables between {exec} blocks.`;
    }
  }

  if (err instanceof TypeError && msg.includes('Cannot read properties of null')) {
    if (code.includes('getElementById') || code.includes('querySelector')) {
      return 'Hint: Use the provided `output` element instead of document.getElementById in {exec} blocks.';
    }
  }

  if (err instanceof TypeError && msg.includes('is not a function')) {
    return 'Hint: Check that the function exists and is spelled correctly. Imported modules are not available in {exec} blocks.';
  }

  if (err instanceof SyntaxError) {
    return 'Hint: Check for mismatched brackets, quotes, or template literals in the code block.';
  }

  return null;
}

/** Decode {live} blocks, replacing marker divs with rendered HTML. */
function processLiveBlocks(html: string): string {
  const liveRegex = /<div class="live-block" data-code="([^"]+)"><\/div>/g;
  return html.replace(liveRegex, (_match, encoded: string) => {
    const code = decodeBase64Utf8(encoded);
    return `<div class="live-block">${code}</div>`;
  });
}

const PARTICLE_COLORS = [
  'rgba(59,130,246,0.3)',
  'rgba(0,204,150,0.25)',
  'rgba(255,161,90,0.2)',
  'rgba(255,255,255,0.1)',
];

function createParticleElements(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const size = 2 + Math.random() * 4;
    return (
      <div
        key={i}
        className="slide-particle"
        style={{
          left: `${Math.random() * 100}%`,
          width: size,
          height: size,
          background: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
          animationDuration: `${8 + Math.random() * 12}s`,
          animationDelay: `${Math.random() * 10}s`,
        }}
      />
    );
  });
}

/**
 * React.memo prevents re-renders from parent state changes (e.g. timer)
 * that don't affect SlideRenderer's props, which would otherwise cause
 * dangerouslySetInnerHTML to wipe interactive DOM state in {live} blocks.
 */
export const SlideRenderer = memo(function SlideRenderer({
  html,
  steps,
  currentStep,
  layout,
  bg,
  particles,
}: SlideRendererProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const execScopeRef = useRef<Record<string, unknown>>({});
  const particleElements = useMemo(() => (particles ? createParticleElements(25) : null), [particles]);

  // Build visible HTML from steps
  const visibleHtml = useMemo(() => {
    if (steps && steps.length > 1) {
      return steps.slice(0, currentStep + 1).join('');
    }
    return html;
  }, [html, steps, currentStep]);

  // Reset exec scope when the slide itself changes (not step reveals)
  const prevHtmlRef = useRef(html);
  if (prevHtmlRef.current !== html) {
    prevHtmlRef.current = html;
    execScopeRef.current = {};
  }

  // Process {live} blocks during render (decode HTML). {exec} blocks stay
  // as-is — they'll be executed in useEffect after the DOM exists.
  const execLiveHtml = useMemo(() => {
    return processLiveBlocks(visibleHtml);
  }, [visibleHtml]);

  // Only mermaid needs async state. null = no mermaid override.
  const [mermaidHtml, setMermaidHtml] = useState<string | null>(null);

  useEffect(() => {
    setMermaidHtml(null);
    if (!execLiveHtml.includes('class="mermaid"')) return;

    let cancelled = false;

    (async () => {
      const { default: mermaid } = await import('mermaid');
      if (cancelled) return;

      const theme = document.querySelector('.slides-app')?.getAttribute('data-theme');
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' || theme === 'retro' ? 'dark' : 'default',
      });

      let result = execLiveHtml;
      const mermaidRegex = /<div class="mermaid">([\s\S]*?)<\/div>/g;
      const replacements: [string, string][] = [];
      let match;

      while ((match = mermaidRegex.exec(execLiveHtml)) !== null) {
        const rawSource = match[1];
        const tmp = document.createElement('div');
        tmp.innerHTML = rawSource;
        const source = tmp.textContent || '';

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          const { svg } = await mermaid.render(id, source);
          replacements.push([match[0], `<div class="mermaid" data-mermaid-rendered="true">${svg}</div>`]);
        } catch (e) {
          console.error('Mermaid render error:', source.substring(0, 60), e);
        }
      }

      if (!cancelled && replacements.length > 0) {
        for (const [from, to] of replacements) {
          result = result.replace(from, to);
        }
        setMermaidHtml(result);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [execLiveHtml]);

  // Derive final HTML: use mermaid-rendered version if available
  const processedHtml = mermaidHtml ?? execLiveHtml;

  // Execute {exec} blocks after DOM is created
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const blocks = el.querySelectorAll<HTMLElement>('.exec-block[data-code]');
    if (blocks.length === 0) return;

    execScopeRef.current = {};
    const scope = createExecScope(execScopeRef.current);
    const trackers: ReturnType<typeof createTimerTracker>[] = [];

    for (const block of blocks) {
      const encoded = block.getAttribute('data-code');
      if (!encoded) continue;

      const code = decodeBase64Utf8(encoded);
      const outputEl = block.querySelector<HTMLElement>('.exec-output');
      if (!outputEl) continue;

      // Clear any previous output
      outputEl.textContent = '';

      const tracker = createTimerTracker();
      trackers.push(tracker);

      // Create DOM-appending console
      const appendLine = (text: string, className?: string) => {
        const line = document.createElement('div');
        line.textContent = text;
        if (className) line.className = className;
        outputEl.appendChild(line);
      };

      const fakeConsole = {
        log: (...args: unknown[]) => appendLine(args.map(String).join(' ')),
        error: (...args: unknown[]) => appendLine(args.map(String).join(' '), 'exec-output-error'),
        warn: (...args: unknown[]) => appendLine(args.map(String).join(' '), 'exec-output-warn'),
        info: (...args: unknown[]) => appendLine(args.map(String).join(' ')),
      };

      // Inject helpers into scope storage so they're accessible through with(scope)
      const storage = execScopeRef.current;
      storage.console = fakeConsole;
      storage.output = outputEl;
      storage.setInterval = tracker.setInterval;
      storage.setTimeout = tracker.setTimeout;
      storage.requestAnimationFrame = tracker.requestAnimationFrame;

      try {
        const fn = new Function('scope', `with(scope) { ${code} }`);
        const result = fn(scope);
        if (result !== undefined && outputEl.children.length === 0) {
          appendLine(String(result));
        }
      } catch (err) {
        appendLine(String(err), 'exec-output-error');
        const hint = getExecErrorHint(err, code);
        if (hint) appendLine(hint, 'exec-output-hint');
      }

      // Remove injected helpers so user code can't accidentally overwrite them
      // in later blocks (they'll be re-injected with fresh values)
      delete storage.console;
      delete storage.output;
      delete storage.setInterval;
      delete storage.setTimeout;
      delete storage.requestAnimationFrame;
    }

    return () => {
      trackers.forEach((t) => t.cleanup());
    };
  }, [execLiveHtml]);

  // Reactivate <script> tags inside {live} blocks with timer tracking
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const scripts = el.querySelectorAll('.live-block script');
    if (scripts.length === 0) return;

    const tracker = createTimerTracker();

    // Monkey-patch globals to capture timers from inline scripts
    const origSetInterval = window.setInterval;
    const origSetTimeout = window.setTimeout;
    const origRAF = window.requestAnimationFrame;
    window.setInterval = tracker.setInterval as typeof window.setInterval;
    window.setTimeout = tracker.setTimeout as typeof window.setTimeout;
    window.requestAnimationFrame = tracker.requestAnimationFrame;

    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    }

    // Restore originals
    window.setInterval = origSetInterval;
    window.setTimeout = origSetTimeout;
    window.requestAnimationFrame = origRAF;

    return () => {
      tracker.cleanup();
    };
  }, [processedHtml]);

  const bgStyle: React.CSSProperties = {};
  let hasBg = false;

  if (bg) {
    hasBg = true;
    const knownBgs = [
      'bridge_raining', 'castle', 'cherryblossom', 'dawn',
      'et', 'falls', 'nature', 'northlights', 'pixelphony_2', 'watchdogs',
    ];
    if (knownBgs.includes(bg)) {
      bgStyle.backgroundImage = `url(/img/${bg}.gif)`;
      bgStyle.backgroundSize = 'cover';
      bgStyle.backgroundPosition = 'center';
    } else if (bg.startsWith('/') || bg.startsWith('http')) {
      bgStyle.backgroundImage = `url(${bg})`;
      bgStyle.backgroundSize = 'cover';
      bgStyle.backgroundPosition = 'center';
    } else {
      bgStyle.background = bg;
    }
  }

  const classes = [
    'slide',
    'slide-enter',
    `slide-layout-${layout}`,
    hasBg ? 'slide-has-bg' : '',
    particles ? 'slide-has-particles' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={bgStyle}>
      {hasBg && <div className="slide-bg-overlay" />}
      {particleElements && <div className="slide-particles">{particleElements}</div>}
      <div
        ref={contentRef}
        className="slide-content"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    </div>
  );
});
