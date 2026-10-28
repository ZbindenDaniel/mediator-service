import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import { applyTheme } from './lib/theme';

// Before the first render, so an explicit light/dark choice doesn't flash the system theme.
applyTheme();

try {
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  root.render(<App />);
  console.log('Frontend loaded');
} catch (err) {
  console.error('Failed to initialize frontend', err);
}
