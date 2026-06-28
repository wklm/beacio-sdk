/**
 * React component for Beacio detection.
 *
 * Usage:
 *   import { BeacioProvider } from '@beacio/detect/react'
 *
 *   export default function Layout({ children }) {
 *     return <BeacioProvider apiKey="wbl_xxxxx">{children}</BeacioProvider>
 *   }
 */

import React, { useEffect, useState, createContext, useContext } from 'react';
import type { BeacioOptions, BannerOptions } from './index';
import type { ExtensionInstallState } from './detect';

interface BeacioContextValue {
  /** Whether the extension is installed */
  isInstalled: boolean | null;
  /** Detailed install state for onboarding vs active flows */
  installState: ExtensionInstallState | null;
  /** Whether detection is still in progress */
  isDetecting: boolean;
  /** Whether we're on iOS Safari */
  isIOSSafari: boolean;
}

const BeacioContext = createContext<BeacioContextValue>({
  isInstalled: null,
  installState: null,
  isDetecting: true,
  isIOSSafari: false,
});

export function useBeacio(): BeacioContextValue {
  return useContext(BeacioContext);
}

interface BeacioProviderProps {
  apiKey?: string;
  /** Operator/app name shown in the install prompt (e.g. "FitTracker") */
  operatorName?: string;
  banner?: BannerOptions | false;
  onReady?: () => void;
  onInstalledInactive?: () => void;
  onNotInstalled?: () => void;
  children: React.ReactNode;
}

export function BeacioProvider({
  apiKey,
  operatorName,
  banner,
  onReady,
  onInstalledInactive,
  onNotInstalled,
  children,
}: BeacioProviderProps) {
  const [state, setState] = useState<BeacioContextValue>({
    isInstalled: null,
    installState: null,
    isDetecting: true,
    isIOSSafari: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const { isIOSSafari: checkIOS } = await import('./detect');

      if (!checkIOS()) {
        if (!cancelled) {
          setState({ isInstalled: null, installState: null, isDetecting: false, isIOSSafari: false });
        }
        return;
      }

      const { initBeacio } = await import('./index');

      const options: BeacioOptions = {
        key: apiKey ?? undefined,
        operatorName,
        banner,
        onReady: () => {
          if (!cancelled) {
            setState({ isInstalled: true, installState: 'active', isDetecting: false, isIOSSafari: true });
          }
          onReady?.();
        },
        onInstalledInactive: () => {
          if (!cancelled) {
            setState({ isInstalled: true, installState: 'installed-inactive', isDetecting: false, isIOSSafari: true });
          }
          onInstalledInactive?.();
        },
        onNotInstalled: () => {
          if (!cancelled) {
            setState({ isInstalled: false, installState: 'not-installed', isDetecting: false, isIOSSafari: true });
          }
          onNotInstalled?.();
        },
      };

      await initBeacio(options);
    }

    detect();

    return () => {
      cancelled = true;
    };
  }, [apiKey, operatorName, banner, onReady, onInstalledInactive, onNotInstalled]);

  return (
    <BeacioContext.Provider value={state}>
      {children}
    </BeacioContext.Provider>
  );
}
