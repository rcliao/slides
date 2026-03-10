import { useState, useEffect, useRef, useCallback } from 'react';
import type { Slide } from '../types';

interface SlideOverviewProps {
  slides: Slide[];
  current: number;
  onSelect: (index: number) => void;
}

export function SlideOverview({ slides, current, onSelect }: SlideOverviewProps) {
  const [focused, setFocused] = useState(current);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Stabilize callback and focused value with refs so the keyboard effect
  // doesn't re-attach every time (onSelect changes on every App re-render
  // from timer ticks; focused changes on every key press).
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  // Scroll focused card into view
  useEffect(() => {
    cardRefs.current[focused]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  // Compute column count from the grid layout
  const getColumns = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return 3;
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const total = slides.length;
      const cols = getColumns();

      switch (e.key) {
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          setFocused((f) => Math.min(f + 1, total - 1));
          break;
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          setFocused((f) => Math.max(f - 1, 0));
          break;
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setFocused((f) => Math.min(f + cols, total - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setFocused((f) => Math.max(f - cols, 0));
          break;
        case 'Enter':
          e.preventDefault();
          onSelectRef.current(focusedRef.current);
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [slides.length, getColumns]);

  return (
    <div className="overview">
      <div className="overview-grid" ref={gridRef}>
        {slides.map((slide, i) => (
          <button
            key={i}
            ref={(el) => { cardRefs.current[i] = el; }}
            className={`overview-card ${i === current ? 'overview-card-active' : ''} ${i === focused ? 'overview-card-focused' : ''}`}
            onClick={() => onSelect(i)}
          >
            <div className="overview-card-number">{i + 1}</div>
            <div
              className="overview-card-content"
              dangerouslySetInnerHTML={{ __html: slide.content }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
