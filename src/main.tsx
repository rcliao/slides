import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './themes/base.css';
import './themes/default.css';
import './themes/dark.css';
import './themes/retro.css';
import 'highlight.js/styles/github-dark.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
