// Ambient type declaration for the optional @beacio/core dependency.
//
// detect uses core in two ways:
//   1. A runtime-optional platform fast-path via `await import('@beacio/core')`
//      wrapped in try/catch (so core is not REQUIRED at runtime for detection).
//   2. The canonical shared constants — BEACIO_EVENTS (event names) and
//      SETUP_URL (onboarding URL) — imported statically so the dispatch side
//      (this package) references the SAME literals as every listener
//      (@beacio/react, the extension, the CDN). These are pure string
//      constants, so the static import adds no real BLE/runtime coupling.
//
// This ambient module mirrors only the surface detect consumes; it merges with
// (and is satisfied by) the real @beacio/core package in the monorepo.
declare module '@beacio/core' {
  export type Platform = 'safari-extension' | 'ios-safari' | 'other-mobile' | 'desktop';
  export function detectPlatform(): Platform;

  /** Canonical first-party onboarding URL (install → enable → return). */
  export const SETUP_URL: 'https://beacio.com/setup';

  /**
   * Canonical beacio CustomEvent names — the single source of truth shared by
   * this dispatcher and every listener. Mirrors packages/core/src/events.ts;
   * `as const`-style literal value types make a diverged name a compile error.
   */
  export const BEACIO_EVENTS: {
    readonly STATE_CHANGE: 'beacio:statechange';
    readonly READY: 'beacio:ready';
    readonly INSTALLED_INACTIVE: 'beacio:installedinactive';
    readonly NOT_INSTALLED: 'beacio:notinstalled';
    readonly EXTENSION_READY: 'beacio:extension:ready';
    readonly EXTENSION_PING: 'beacio:extension:ping';
    readonly EXTENSION_PONG: 'beacio:extension:pong';
    readonly EXTENSION_ACTIVATE_REQUEST: 'beacio:extension:activate-request';
    readonly EXTENSION_ACTIVATE_RESULT: 'beacio:extension:activate-result';
    readonly EXTENSION_INSTALLED: 'beacio:extension:installed';
  };

  /** The union of every canonical beacio CustomEvent name. */
  export type BeacioEventName = (typeof BEACIO_EVENTS)[keyof typeof BEACIO_EVENTS];
}
