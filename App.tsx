import React from 'react';
import { AppShell } from './components/AppShell';
import { AppCrashFallback } from './src/AppCrashFallback';
import { ErrorBoundary, initSentry } from './src/sentry';

initSentry();

export default function App() {
  return (
    <ErrorBoundary fallback={<AppCrashFallback />}>
      <AppShell />
    </ErrorBoundary>
  );
}
