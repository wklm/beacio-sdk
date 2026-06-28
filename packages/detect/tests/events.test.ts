/**
 * Seam-crossing event-namespace test for @beacio/detect.
 *
 * The DISPATCH side (initBeacio in src/index.ts) and the in-WORKSPACE LISTEN side
 * (react-sdk InstallationWizard) must agree on the CANONICAL `beacio:*` event
 * namespace after the rebrand. Both reference the shared @beacio/core
 * BEACIO_EVENTS constants through the TS type graph, so a typo on either side is
 * a compile error — the names detect fires are pinned to the same literals every
 * type-graph listener subscribes to.
 *
 * This test does NOT cover the extension / CDN / website-src seams: those cross a
 * realm/bundle boundary and hand-code bare `beacio:*` literals (they cannot import
 * the const today), so the compile-time guarantee does not reach them. Their
 * anti-drift guard is the static parity test at
 * src/extension/event-name-parity.test.ts (SB-SDK-21), which reads each seam file
 * and asserts every literal is a verbatim BEACIO_EVENTS member.
 *
 * This drives initBeacio down the `active` install-state path, which:
 *   - ALWAYS dispatches the install-state event (`beacio:statechange`)
 *   - dispatches the ready event when state === 'active' (`beacio:ready`)
 * and asserts a listener on the CANONICAL name receives each. A regression that
 * dispatched any other namespace would leave the canonical listener silent and
 * fail these assertions.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { initBeacio } from '../src/index';

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * Force isIOSSafari() to return true by presenting an iPhone Safari UA, and
 * make getExtensionInstallState() resolve synchronously to 'active' via the
 * `data-beacio-extension` documentElement marker (hasActiveMarker), so the test
 * never hits the 2-second injection poll.
 */
function pretendActiveIOSSafari(): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => IOS_SAFARI_UA,
  });
  document.documentElement.dataset.beacioExtension = 'true';
}

describe('@beacio/detect dispatches the canonical beacio:* event namespace', () => {
  beforeEach(() => {
    pretendActiveIOSSafari();
  });

  afterEach(() => {
    delete document.documentElement.dataset.beacioExtension;
  });

  it('fires the canonical beacio:statechange event on every run', async () => {
    let fired = false;
    const onStateChange = () => {
      fired = true;
    };
    window.addEventListener('beacio:statechange', onStateChange);

    try {
      await initBeacio({ banner: false });
    } finally {
      window.removeEventListener('beacio:statechange', onStateChange);
    }

    expect(fired).toBe(true);
  });

  it('fires the canonical beacio:ready event when the extension is active', async () => {
    let fired = false;
    const onReady = () => {
      fired = true;
    };
    window.addEventListener('beacio:ready', onReady);

    try {
      await initBeacio({ banner: false });
    } finally {
      window.removeEventListener('beacio:ready', onReady);
    }

    expect(fired).toBe(true);
  });
});
