import React, { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { focusRingClasses } from '../utils/ui';

const DISMISSED_KEY = 'dbt_ios_install_banner_dismissed';

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
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIosBrowser() || isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-[148px] z-50 flex justify-center px-4">
      <div className="flex max-w-md items-start gap-3 rounded-2xl border border-brand/30 bg-surface/95 px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-xl">
        <Share className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-sm text-slate-200">
          On iPhone, install from Safari with <span className="font-semibold text-white">Share</span>, then{' '}
          <span className="font-semibold text-white">Add to Home Screen</span>.
        </p>
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
