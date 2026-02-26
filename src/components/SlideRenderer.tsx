import { useRef, useEffect, useState } from 'react';

interface SlideRendererProps {
  html: string;
  steps?: string[];
  currentStep: number;
  layout: string;
  bg?: string;
  direction: 'next' | 'prev' | 'none';
}

export function SlideRenderer({ html, steps, currentStep, layout, bg, direction }: SlideRendererProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Build visible HTML
  let visibleHtml: string;
  if (steps && steps.length > 1) {
    visibleHtml = steps.slice(0, currentStep + 1).join('');
  } else {
    visibleHtml = html;
  }

  // State for HTML with rendered mermaid diagrams
  const [processedHtml, setProcessedHtml] = useState(visibleHtml);

  // Trigger animation on slide change
  useEffect(() => {
    if (ref.current && direction !== 'none') {
      ref.current.classList.remove('slide-enter');
      void ref.current.offsetWidth;
      ref.current.classList.add('slide-enter');
    }
  }, [html, direction]);

  // Pre-render mermaid diagrams into the HTML string
  useEffect(() => {
    if (!visibleHtml.includes('class="mermaid"')) {
      setProcessedHtml(visibleHtml);
      return;
    }

    // Show raw content immediately, then replace with rendered SVGs
    setProcessedHtml(visibleHtml);

    let cancelled = false;

    (async () => {
      const { default: mermaid } = await import('mermaid');
      if (cancelled) return;

      const theme = document.querySelector('.slides-app')?.getAttribute('data-theme');
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' || theme === 'retro' ? 'dark' : 'default',
      });

      let result = visibleHtml;
      const mermaidRegex = /<div class="mermaid">([\s\S]*?)<\/div>/g;
      const replacements: [string, string][] = [];
      let match;

      while ((match = mermaidRegex.exec(visibleHtml)) !== null) {
        const rawSource = match[1];
        // Decode HTML entities (e.g., &gt; → >)
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
        setProcessedHtml(result);
      }
    })();

    return () => { cancelled = true; };
  }, [visibleHtml]);

  // Background can be:
  //   - a named 8-bit GIF (e.g. "castle", "northlights")
  //   - an image path (e.g. "/img/custom.jpg")
  //   - a CSS color/gradient (e.g. "#1a1a2e", "linear-gradient(...)")
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

  return (
    <div
      className={`slide slide-layout-${layout} ${hasBg ? 'slide-has-bg' : ''}`}
      ref={ref}
      style={bgStyle}
    >
      {hasBg && <div className="slide-bg-overlay" />}
      <div
        className="slide-content"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    </div>
  );
}
