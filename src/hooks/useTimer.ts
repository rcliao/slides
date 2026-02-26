import { useState, useEffect, useRef } from 'react';

export function useTimer(currentSlide: number) {
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [slideElapsed, setSlideElapsed] = useState(0);
  const slideStartTime = useRef(Date.now());
  const startTime = useRef(Date.now());

  // Reset slide timer when slide changes
  useEffect(() => {
    slideStartTime.current = Date.now();
    setSlideElapsed(0);
  }, [currentSlide]);

  // Tick every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalElapsed(
        Math.floor((Date.now() - startTime.current) / 1000),
      );
      setSlideElapsed(
        Math.floor((Date.now() - slideStartTime.current) / 1000),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { totalElapsed, slideElapsed };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
