import { useEffect, useRef, useCallback, useState } from 'react';

export interface Reaction {
  id: number;
  emoji: string;
  left: number;
}

interface LiveSyncOptions {
  enabled: boolean;
  isAudience: boolean;
  currentSlide: number;
  currentStep: number;
  onSlideChange?: (slide: number, step: number) => void;
}

export function useLiveSync({
  enabled,
  isAudience,
  currentSlide,
  currentStep,
  onSlideChange,
}: LiveSyncOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [audienceCount, setAudienceCount] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const reactionId = useRef(0);

  // Connect to WebSocket
  useEffect(() => {
    if (!enabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/live-ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isAudience) {
        ws.send(JSON.stringify({ type: 'presenter-join' }));
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'state':
        case 'slide':
          if (isAudience && onSlideChange) {
            onSlideChange(msg.slide, msg.step);
          }
          if (msg.audienceCount !== undefined) {
            setAudienceCount(msg.audienceCount);
          }
          break;

        case 'audience-count':
          setAudienceCount(msg.count);
          break;

        case 'reaction': {
          const id = reactionId.current++;
          const left = Math.random() * 80 + 10;
          setReactions((prev) => [...prev, { id, emoji: msg.emoji, left }]);
          // Remove after animation
          setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== id));
          }, 3000);
          break;
        }
      }
    };

    ws.onerror = () => {
      // Silently handle connection errors (e.g., when live mode is not enabled)
    };

    return () => {
      ws.close();
    };
  }, [enabled, isAudience, onSlideChange]);

  // Send slide changes (presenter only)
  useEffect(() => {
    if (!enabled || isAudience || !wsRef.current) return;
    if (wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'slide',
        slide: currentSlide,
        step: currentStep,
      }),
    );
  }, [enabled, isAudience, currentSlide, currentStep]);

  const sendReaction = useCallback((emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'reaction', emoji }));
  }, []);

  return { audienceCount, reactions, sendReaction };
}
