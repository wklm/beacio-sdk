import { ExtensionDetector } from '../../src/core/ExtensionDetector';

describe('ExtensionDetector', () => {
  let detector: ExtensionDetector;
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    detector = new ExtensionDetector();
    delete (global.window as any).__beacio;
    Object.defineProperty(global.navigator, 'bluetooth', {
      value: undefined,
      writable: true,
      configurable: true
    });
    Object.defineProperty(global.navigator, 'beacio', {
      value: undefined,
      writable: true,
      configurable: true
    });
    Object.defineProperty(global.window, 'isSecureContext', {
      value: true,
      writable: true,
      configurable: true
    });
    
    // Clean document dataset markers
    delete document.documentElement.dataset.beacioExtension;
    delete document.documentElement.dataset.beacioInstalled;

    // Setup spies
    addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    // Reset timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (global.window as any).__beacio;
    delete document.documentElement.dataset.beacioExtension;
    delete document.documentElement.dataset.beacioInstalled;
    Object.defineProperty(global.navigator, 'bluetooth', {
      value: undefined,
      writable: true,
      configurable: true
    });
    Object.defineProperty(global.navigator, 'beacio', {
      value: undefined,
      writable: true,
      configurable: true
    });
  });

  describe('getInstallState', () => {
    it('should return installed-inactive when window.__beacio is set with status installed', () => {
      (global.window as any).__beacio = { status: 'installed' };

      expect(detector.getInstallState()).toBe('installed-inactive');
    });

    it('should return active when navigator.beacio.__beacio is set', () => {
      Object.defineProperty(global.navigator, 'beacio', {
        value: { __beacio: true },
        writable: true,
        configurable: true
      });

      expect(detector.getInstallState()).toBe('active');
    });

    it('should return installed-inactive when passive document marker exists', () => {
      document.documentElement.dataset.beacioInstalled = 'true';

      expect(detector.getInstallState()).toBe('installed-inactive');
    });

    it('should return not-installed when no __beacio markers exist', () => {
      // @ts-ignore
      delete global.navigator.bluetooth;
      // @ts-ignore
      delete global.navigator.beacio;

      expect(detector.getInstallState()).toBe('not-installed');
    });

    it('should return not-installed when navigator.beacio exists but has no __beacio marker', () => {
      Object.defineProperty(global.navigator, 'beacio', {
        value: {},
        writable: true,
        configurable: true
      });

      expect(detector.getInstallState()).toBe('not-installed');
    });

    it('should return not-installed for non-installed window marker status', () => {
      (global.window as any).__beacio = { status: 'detecting' };

      expect(detector.getInstallState()).toBe('not-installed');
    });

    it('should return not-installed when missing navigator bluetooth/beacio markers', () => {
      expect(detector.getInstallState()).toBe('not-installed');
    });
  });

  describe('detect', () => {
    it('should resolve immediately if already detected', async () => {
      (global.window as any).__beacio = { status: 'installed' };

      // First detection sets the flag
      detector.getInstallState();

      const result = await detector.detect();
      expect(result).toBe(true);
      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should listen for extension ready event', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const detectPromise = detector.detect();
      
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beacio:extension:ready',
        expect.any(Function)
      );

      // Simulate extension ready event
      const handler = addEventListenerSpy.mock.calls[0][1];
      handler();

      const result = await detectPromise;
      expect(result).toBe(true);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beacio:extension:ready',
        expect.any(Function)
      );
    });

    it('should timeout after DETECTION_TIMEOUT', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const detectPromise = detector.detect();
      
      // Fast-forward time by timeout duration
      jest.advanceTimersByTime(3000);
      
      const result = await detectPromise;
      expect(result).toBe(false);
      expect(removeEventListenerSpy).toHaveBeenCalled();
    });

    it('should handle concurrent detection calls', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const promise1 = detector.detect();
      const promise2 = detector.detect();

      jest.advanceTimersByTime(3000);

      const result1 = await promise1;
      const result2 = await promise2;

      expect(result1).toBe(result2);
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1); // Only one detection
    });

    it('should return false when markers remain unavailable through timeout', async () => {
      const detectPromise = detector.detect();
      jest.advanceTimersByTime(3000);
      const result = await detectPromise;
      expect(result).toBe(false);
    });

    it('should detect when __beacio marker becomes available during detection', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const detectPromise = detector.detect();
      
      // Simulate extension setting the __beacio marker
      (global.window as any).__beacio = { status: 'installed' };
      
      // Timeout check re-reads the install state
      jest.advanceTimersByTime(3000);
      
      const result = await detectPromise;
      expect(result).toBe(true);
      expect(detector.getInstallState()).toBe('installed-inactive');
    });

    it('should return installed-inactive state from detectInstallState when passive marker is present', async () => {
      document.documentElement.dataset.beacioInstalled = 'true';

      await expect(detector.detectInstallState()).resolves.toBe('installed-inactive');
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple rapid detections', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const promises: Array<Promise<boolean>> = [];
      for (let i = 0; i < 10; i++) {
        promises.push(detector.detect());
      }

      jest.advanceTimersByTime(3000);
      
      const results = await Promise.all(promises);
      results.forEach(result => expect(result).toBe(false));
      
      // Should only add one event listener
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    });

    it('should reset detection promise after completion', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const detectPromise1 = detector.detect();
      jest.advanceTimersByTime(3000);
      await detectPromise1;
      
      // Second detection should start fresh
      const detectPromise2 = detector.detect();
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
      
      jest.advanceTimersByTime(3000);
      await detectPromise2;
    });

    it('should handle event firing after timeout', async () => {
      // @ts-ignore
      delete global.navigator.bluetooth;

      const detectPromise = detector.detect();
      const handler = addEventListenerSpy.mock.calls[0][1];
      
      jest.advanceTimersByTime(3000);
      await detectPromise;
      
      // Event fires after timeout - should be ignored
      expect(() => handler()).not.toThrow();
    });
  });
});
