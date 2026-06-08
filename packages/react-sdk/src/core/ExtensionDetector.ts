/**
 * ExtensionDetector - Automatically detects if the WebBLE Safari extension is installed
 */

export type ExtensionInstallState = 'not-installed' | 'installed-inactive' | 'active';

export class ExtensionDetector {
  private detectionPromise: Promise<ExtensionInstallState> | null = null;
  private readonly DETECTION_TIMEOUT = 3000;

  private readInstallState(): ExtensionInstallState {
    if (typeof navigator !== 'undefined' && (navigator as any).webble?.__webble === true) {
      return 'active';
    }

    if (typeof document !== 'undefined' && document.documentElement.dataset.webbleExtension === 'true') {
      return 'active';
    }

    if (typeof window !== 'undefined' && (window as any).__webble?.status === 'installed') {
      return 'installed-inactive';
    }

    if (typeof document !== 'undefined' && document.documentElement.dataset.webbleInstalled === 'true') {
      return 'installed-inactive';
    }

    return 'not-installed';
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
          window.removeEventListener('webble:extension:ready', handleExtensionReady);
          resolve('active');
        }
      };

      window.addEventListener('webble:extension:ready', handleExtensionReady);

      // Timeout after specified duration
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('webble:extension:ready', handleExtensionReady);
          resolve(this.readInstallState());
        }
      }, this.DETECTION_TIMEOUT);
    });
  }
}
