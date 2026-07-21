/**
 * Platform detection utilities for Beacio
 */

// SB-SDK-12: the install-state marker derivation now lives in the single shared
// install-state module (consumed here, by the react-sdk ExtensionDetector, and by
// the headless API), so the detection logic is shared rather than duplicated.
import { getInstallState, type ExtensionInstallState } from './install-state';

export type { ExtensionInstallState } from './install-state';

export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);

  return isIOS && isSafari;
}

export async function getExtensionInstallState(): Promise<ExtensionInstallState> {
  // Fast-path: use core's platform detection (detect now lives INSIDE @beacio/core,
  // so this is an intra-package import — no optional-peer boundary any more).
  try {
    const { detectPlatform } = await import('../platform');
    if (detectPlatform() === 'safari-extension') return 'active';
  } catch { /* defensive — platform probe must never throw the install flow */ }

  return new Promise((resolve) => {
    // Method 1: Check for the global marker set by injected-full.ts
    const immediateState = getInstallState();
    if (immediateState !== 'not-installed') {
      resolve(immediateState);
      return;
    }

    // Method 3: Wait briefly for injection to complete
    // The content script runs at document_start, so injection should be fast
    let checks = 0;
    const interval = setInterval(() => {
      checks++;
      const state = getInstallState();
      if (state !== 'not-installed') {
        clearInterval(interval);
        resolve(state);
      }
      if (checks > 20) {
        // 2 seconds max wait
        clearInterval(interval);
        resolve('not-installed');
      }
    }, 100);
  });
}

export async function isExtensionInstalled(): Promise<boolean> {
  return (await getExtensionInstallState()) !== 'not-installed';
}
