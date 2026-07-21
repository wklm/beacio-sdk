/**
 * ExtensionDetector - Automatically detects if the Beacio Safari extension is installed
 */

import { BEACIO_EVENTS } from '@beacio/core';
// SB-SDK-12: the install-state marker derivation is now the SINGLE shared
// accessor in @beacio/core/detect (consumed by the detect package's own detect.ts and
// the framework-agnostic headless onboarding API). This react-sdk detector reads
// through the SAME getInstallState() so the four old copies cannot drift — AC1
// "the detection logic is SHARED, not duplicated". @beacio/core/detect is already a
// peer this package imports at module level (see InstallationWizard's SETUP_STEPS
// import), so this reuses the established seam.
import { getInstallState, type ExtensionInstallState } from '@beacio/core/detect';

export type { ExtensionInstallState } from '@beacio/core/detect';

export class ExtensionDetector {
  private detectionPromise: Promise<ExtensionInstallState> | null = null;
  private readonly DETECTION_TIMEOUT = 3000;

  private readInstallState(): ExtensionInstallState {
    return getInstallState();
  }

  getInstallState(): ExtensionInstallState {
    return this.readInstallState();
  }

  /**
   * Detect extension with a timeout
   */
  detect(): Promise<boolean> {
    return this.detectInstallState().then((state) => state !== 'not-installed');
  }

  detectInstallState(): Promise<ExtensionInstallState> {
    const currentState = this.readInstallState();
    if (currentState === 'active') {
      return Promise.resolve(currentState);
    }

    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.performDetection().finally(() => {
      this.detectionPromise = null;
    });
    return this.detectionPromise;
  }

  /**
   * Perform the actual detection
   */
  private async performDetection(): Promise<ExtensionInstallState> {
    return new Promise((resolve) => {
      // Check if already available
      const initialState = this.readInstallState();
      if (initialState !== 'not-installed') {
        resolve(initialState);
        return;
      }

      // Check if window is available
      if (typeof window === 'undefined') {
        resolve('not-installed');
        return;
      }

      let resolved = false;

      // Listen for extension ready event
      const handleExtensionReady = () => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener(BEACIO_EVENTS.EXTENSION_READY, handleExtensionReady);
          resolve('active');
        }
      };

      window.addEventListener(BEACIO_EVENTS.EXTENSION_READY, handleExtensionReady);

      // Timeout after specified duration
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener(BEACIO_EVENTS.EXTENSION_READY, handleExtensionReady);
          resolve(this.readInstallState());
        }
      }, this.DETECTION_TIMEOUT);
    });
  }
}
