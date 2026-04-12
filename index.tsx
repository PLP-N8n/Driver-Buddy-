import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ?setup=demo — unlocks all features and skips onboarding for beta testers
if (new URLSearchParams(window.location.search).get('setup') === 'demo') {
  localStorage.setItem('drivertax_onboarded', '1');
  localStorage.setItem('dbt_advanced', '1');
  const clean = new URL(window.location.href);
  clean.searchParams.delete('setup');
  window.history.replaceState({}, '', clean.toString());
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
