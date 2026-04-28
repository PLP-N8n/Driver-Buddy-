import React, { useEffect, useRef, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { focusRingClasses, primaryButtonClasses } from '../utils/ui';

const IOS_DISMISSED_KEY = 'dbt_ios_install_banner_dismissed';
const ANDROID_DISMISSED_KEY = 'dbt_android_install_banner_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isIosBrowser(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const isiPhoneOrPad = /iphone|ipad|ipod/.test(userAgent);
  const isModernIpad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isiPhoneOrPad || isModernIpad;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const InstallBanner: React.FC = () => {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installMode, setInstallMode] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    if (isStandalone()) return;

    if (isIosBrowser()) {
      if (localStorage.getItem(IOS_DISMISSED_KEY) === 'true') return;
      setInstallMode('ios');
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      if (localStorage.getItem(ANDROID_DISMISSED_KEY) === 'true') return;
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setInstallMode('android');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (!installMode) return null;

  const dismiss = () => {
    localStorage.setItem(installMode === 'ios' ? IOS_DISMISSED_KEY : ANDROID_DISMISSED_KEY, 'true');
    deferredPromptRef.current = null;
    setInstallMode(null);
  };

  const promptAndroidInstall = async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) {
      setInstallMode(null);
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      deferredPromptRef.current = null;
      setInstallMode(null);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-[148px] z-50 flex justify-center px-4">
      <div className="flex max-w-md items-start gap-3 rounded-2xl border border-brand/30 bg-surface/95 px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-xl">
        {installMode === 'android' ? (
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        ) : (
          <Share className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        )}
        <div className="min-w-0 flex-1">
          {installMode === 'android' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-200">Install Driver Buddy for quicker access.</p>
              <button type="button" onClick={promptAndroidInstall} className={`${primaryButtonClasses} shrink-0 text-xs`}>
                Add to home screen
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-200">
              On iPhone, install from Safari with <span className="font-semibold text-white">Share</span>, then{' '}
              <span className="font-semibold text-white">Add to Home Screen</span>.
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss install instructions"
          onClick={dismiss}
          className={`-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-surface-raised hover:text-white ${focusRingClasses}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
