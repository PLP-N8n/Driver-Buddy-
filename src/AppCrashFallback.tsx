import React from 'react';

export function AppCrashFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-deep px-6 text-slate-50">
      <div className="w-full max-w-md rounded-3xl border border-white/8 bg-surface p-8 text-center shadow-2xl shadow-black/30">
        <h1 className="text-2xl font-semibold text-white">Something went wrong.</h1>
        <p className="mt-3 text-sm text-slate-300">Your data is safe. Reload to continue.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
