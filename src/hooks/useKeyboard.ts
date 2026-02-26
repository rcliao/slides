import { useEffect, useCallback } from 'react';

interface KeyboardHandlers {
  onNext: () => void;
  onPrev: () => void;
  onFirst: () => void;
  onLast: () => void;
  onOverview: () => void;
  onFullscreen: () => void;
  onTimer: () => void;
  onThemeCycle: () => void;
  onHelp: () => void;
  onEscape: () => void;
}

export function useKeyboard(handlers: KeyboardHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        // Navigation: arrows, space, vim keys
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
        case 'l':
        case 'j':
          e.preventDefault();
          handlers.onNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
        case 'PageUp':
        case 'h':
        case 'k':
          e.preventDefault();
          handlers.onPrev();
          break;
        case 'Home':
          e.preventDefault();
          handlers.onFirst();
          break;
        case 'End':
          e.preventDefault();
          handlers.onLast();
          break;
        // Vim: gg for first, G for last
        case 'g':
          e.preventDefault();
          handlers.onFirst();
          break;
        case 'G':
          e.preventDefault();
          handlers.onLast();
          break;
        // Features
        case 'f':
          handlers.onFullscreen();
          break;
        case 'o':
          handlers.onOverview();
          break;
        case 't':
          handlers.onTimer();
          break;
        case 'd':
          handlers.onThemeCycle();
          break;
        case '?':
          handlers.onHelp();
          break;
        case 'Escape':
          handlers.onEscape();
          break;
      }
    },
    [handlers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
