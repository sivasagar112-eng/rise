import { useState, useEffect } from 'react';
import { AlarmNotificationService } from '../services/AlarmNotificationService';

/**
 * Observable live network connectivity status hook.
 * Backed by native Android NetworkMonitor (ConnectivityManager.NetworkCallback with
 * NET_CAPABILITY_INTERNET & NET_CAPABILITY_VALIDATED).
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && (window as any).__INITIAL_NETWORK_ONLINE__ !== undefined) {
      return Boolean((window as any).__INITIAL_NETWORK_ONLINE__);
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    let mounted = true;

    // Fetch initial validated status from native NetworkMonitor
    AlarmNotificationService.getNetworkStatus().then((status) => {
      if (mounted) {
        setIsOnline(status);
      }
    });

    // 1. Listen for native Android NetworkMonitor callback events
    const handleNativeNetwork = (event: Event) => {
      const customEvent = event as CustomEvent<{ isOnline: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.isOnline === 'boolean') {
        if (mounted) {
          setIsOnline(customEvent.detail.isOnline);
        }
      }
    };

    // 2. Standard browser fallback listeners
    const handleOnline = () => {
      AlarmNotificationService.getNetworkStatus().then((status) => {
        if (mounted) setIsOnline(status);
      });
    };

    const handleOffline = () => {
      if (mounted) setIsOnline(false);
    };

    window.addEventListener('networkStatusChanged', handleNativeNetwork);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      window.removeEventListener('networkStatusChanged', handleNativeNetwork);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
