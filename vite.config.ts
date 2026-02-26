import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { slidesPlugin } from './src/vite-plugin-slides';

// This config is used by `npm run dev` as a convenience.
// The CLI (src/cli.ts) creates its own Vite config programmatically.
export default defineConfig({
  plugins: [
    react(),
    slidesPlugin({ file: process.env.SLIDES_FILE || 'example.md' }),
  ],
});
