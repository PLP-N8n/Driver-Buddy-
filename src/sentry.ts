import { Component, type ErrorInfo, type ReactNode } from 'react';
import packageJson from '../package.json';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

type SentryModule = typeof import('@sentry/browser');

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
let sentryPromise: Promise<SentryModule> | null = null;
let sentryInitialized = false;
let replayIntegrationAdded = false;
let replayListenerRegistered = false;

function hasSentryDsn(): boolean {
  return Boolean(env?.VITE_SENTRY_DSN);
}

function loadSentry(): Promise<SentryModule> {
  sentryPromise ??= import('@sentry/browser');
  return sentryPromise;
}

function schedule(callback: () => void): void {
  if (typeof window === 'undefined') return;

  const idleCallback = (window as Window & { requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idleCallback) {
    idleCallback(callback, { timeout: 2500 });
    return;
  }

  window.setTimeout(callback, 1500);
}

async function addReplay(): Promise<void> {
  if (replayIntegrationAdded || !hasSentryDsn()) return;

  replayIntegrationAdded = true;
  const BrowserSentry = await loadSentry();
  BrowserSentry.addIntegration(BrowserSentry.replayIntegration());

  if (typeof document === 'undefined') return;
  document.removeEventListener('click', replayClickHandler);
  document.removeEventListener('keydown', replayKeyHandler);
}

function replayClickHandler(): void {
  void addReplay();
}

function replayKeyHandler(): void {
  void addReplay();
}

function registerDeferredReplay(): void {
  if (replayIntegrationAdded || replayListenerRegistered || typeof document === 'undefined') return;

  replayListenerRegistered = true;
  document.addEventListener('click', replayClickHandler, { once: true });
  document.addEventListener('keydown', replayKeyHandler, { once: true });
}

async function initializeNow(): Promise<void> {
  if (sentryInitialized || !hasSentryDsn()) return;

  sentryInitialized = true;
  const BrowserSentry = await loadSentry();
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

export function initSentry(): void {
  if (!hasSentryDsn()) return;
  schedule(() => {
    void initializeNow();
  });
}

export function addBreadcrumb(breadcrumb: import('@sentry/browser').Breadcrumb): void {
  if (!hasSentryDsn()) return;

  void initializeNow().then(async () => {
    const BrowserSentry = await loadSentry();
    BrowserSentry.addBreadcrumb(breadcrumb);
  });
}

export function captureException(error: unknown, context?: Parameters<SentryModule['captureException']>[1]): void {
  if (!hasSentryDsn()) return;

  void initializeNow().then(async () => {
    const BrowserSentry = await loadSentry();
    BrowserSentry.captureException(error, context);
  });
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureException(error, {
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
