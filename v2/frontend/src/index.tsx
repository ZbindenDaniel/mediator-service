import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import './styles.css';

try {
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  root.render(<App />);
  console.log('Frontend loaded');
} catch (err) {
  console.error('Failed to initialize frontend', err);
}
