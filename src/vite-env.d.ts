/// <reference types="vite/client" />

declare module 'virtual:slides-data' {
  import type { SlidesData } from './types';
  const data: SlidesData;
  export default data;
}

declare module 'canvas-confetti' {
  interface Options {
    particleCount?: number;
    spread?: number;
    origin?: { x?: number; y?: number };
  }
  function confetti(options?: Options): Promise<null>;
  export default confetti;
}
