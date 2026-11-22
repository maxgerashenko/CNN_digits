import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initAnalytics } from './lib/analytics';
import { useDrawingStore } from './state/drawingStore';

// A new visitor sees a drawn digit and its answer at once, not an empty pad.
useDrawingStore.getState().showSample();

// Google Tag Manager (with Google Analytics inside it), unless VITE_GTM_ID is "off".
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
