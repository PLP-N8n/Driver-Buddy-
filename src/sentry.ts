import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as BrowserSentry from '@sentry/browser';
import packageJson from '../package.json';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
let replayIntegrationAdded = false;
let replayListenerRegistered = false;

const addReplay = () => {
  if (replayIntegrationAdded) return;

  replayIntegrationAdded = true;
  BrowserSentry.addIntegration(BrowserSentry.replayIntegration());

  if (typeof document === 'undefined') return;
  document.removeEventListener('click', addReplay);
  document.removeEventListener('keydown', addReplay);
};

const registerDeferredReplay = () => {
  if (replayIntegrationAdded || replayListenerRegistered || typeof document === 'undefined') return;

  replayListenerRegistered = true;
  document.addEventListener('click', addReplay, { once: true });
  document.addEventListener('keydown', addReplay, { once: true });
};

export function initSentry(): void {
  BrowserSentry.init({
    dsn: env?.VITE_SENTRY_DSN ?? '',
    environment: env?.VITE_ENV ?? 'production',
    release: env?.VITE_APP_VERSION ?? packageJson.version,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.05,
    integrations: [BrowserSentry.browserTracingIntegration()],
    sendDefaultPii: false,
  });

  registerDeferredReplay();
}

export const addBreadcrumb = BrowserSentry.addBreadcrumb;
export const captureException = BrowserSentry.captureException;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    BrowserSentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
