import { useEffect, useState } from 'react';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [connectivityBanner, setConnectivityBanner] = useState<'offline' | 'online' | null>(
    navigator.onLine ? null : 'offline'
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setConnectivityBanner('offline');
      return;
    }

    setConnectivityBanner((current) => (current === 'offline' ? 'online' : current));
    const timer = window.setTimeout(() => {
      setConnectivityBanner((current) => (current === 'online' ? null : current));
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [isOnline]);

  return { isOnline, connectivityBanner };
}
