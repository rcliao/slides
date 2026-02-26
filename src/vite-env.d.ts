/// <reference types="vite/client" />

declare module 'virtual:slides-data' {
  import type { SlidesData } from './types';
  const data: SlidesData;
  export default data;
}
