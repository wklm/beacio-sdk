/**
 * @ios-web-bluetooth/detect
 *
 * Detects iOS Safari, checks if the WebBLE extension is installed,
 * and shows an install banner if not. No-op on all other platforms.
 *
 * Your existing Web Bluetooth code works unchanged — this package only
 * handles the "extension not installed" case on iOS Safari.
 */

export { getExtensionInstallState, isExtensionInstalled, isIOSSafari } from './detect';
export type { ExtensionInstallState } from './detect';
export { showInstallBanner, removeInstallBanner } from './banner';
export type { BannerOptions } from './banner';
export { reportEvent, validateApiKey } from './api';
import { reportEvent } from './api';
import type { ExtensionInstallState } from './detect';
export interface IOSWebBLEOptions {
  /** Optional API key for campaign tracking */
  key?: string;
  /** Operator/app name shown in the prompt (e.g. "FitTracker") */
  operatorName?: string;
  /** Install banner configuration, or false to disable */
  banner?:
    | {
        /** 'sheet' (default) for iOS bottom sheet, 'banner' for lightweight bar */
        mode?: 'sheet' | 'banner';
        position?: 'top' | 'bottom';
        text?: string;
        buttonText?: string;
        style?: Record<string, string>;
        startOnboardingUrl?: string;
        appStoreUrl?: string;
        /** Days to suppress after dismiss (default: 14) */
        dismissDays?: number;
      }
    | false;
  /** Called when the extension is detected and ready */
  onReady?: () => void;
  /** Called when the extension is installed but Safari still needs activation/allow access */
  onInstalledInactive?: () => void;
  /** Called when the extension is NOT installed */
  onNotInstalled?: () => void;
}

function dispatchInstallState(state: ExtensionInstallState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('ioswebble:statechange', {
    detail: { state }
  }));
}

/**
 * Show the install banner unless explicitly disabled.
 * No-op when `options.banner === false`.
 */
async function maybeShowBanner(options: IOSWebBLEOptions): Promise<void> {
  if (options.banner === false) return;
  const { showInstallBanner } = await import('./banner');
  const bannerConfig = typeof options.banner === 'object' ? options.banner : {};
  const bannerOpts: import('./banner').BannerOptions = {
    ...bannerConfig,
    apiKey: options.key ?? '',
    operatorName: options.operatorName,
  };
  showInstallBanner(bannerOpts);
}

/**
 * Initialize WebBLE detection.
 *
 * On iOS Safari: checks if the extension is installed, dispatches events,
 * and optionally shows an install banner.
 *
 * On all other platforms: no-op (returns immediately).
 */
export async function initIOSWebBLE(options: IOSWebBLEOptions): Promise<void> {
  const { getExtensionInstallState, isIOSSafari } = await import('./detect');

  if (!isIOSSafari()) return;

  const installState = await getExtensionInstallState();
  dispatchInstallState(installState);

  if (installState === 'active') {
    reportEvent(options.key ?? '', 'extension_active');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ioswebble:ready'));
    }
    options.onReady?.();
    return;
  }

  if (installState === 'installed-inactive') {
    reportEvent(options.key ?? '', 'extension_installed_inactive');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ioswebble:installedinactive'));
    }
    options.onInstalledInactive?.();

    await maybeShowBanner(options);
    return;
  }

  // Extension NOT installed
  reportEvent(options.key ?? '', 'detect');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ioswebble:notinstalled'));
  }
  options.onNotInstalled?.();

  // Show install banner unless explicitly disabled
  await maybeShowBanner(options);
  if (options.banner !== false) {
    reportEvent(options.key ?? '', 'install_prompted');
  }
}
