/**
 * Install prompt UI for WebBLE
 *
 * Two modes:
 * 1. Bottom sheet (default) — iOS-native feel, shown on requestDevice() trigger
 * 2. Banner — lightweight top/bottom bar for passive prompting
 *
 * Features:
 * - Clipboard context saving for return-to-web-app flow
 * - 14-day dismissal frequency capping
 * - Configurable install/onboarding redirect
 * - Dark mode support via prefers-color-scheme
 */

export interface BannerOptions {
  /** 'sheet' (default) for iOS bottom sheet, 'banner' for lightweight bar */
  mode?: 'sheet' | 'banner';
  position?: 'top' | 'bottom';
  text?: string;
  buttonText?: string;
  style?: Record<string, string>;
  /** Preferred install or onboarding URL to open when the user taps the CTA */
  startOnboardingUrl?: string;
  /** Legacy install destination option; still supported for compatibility */
  appStoreUrl?: string;
  /** Operator/app name shown in the prompt (e.g. "FitTracker") */
  operatorName?: string;
  /** API key for campaign tracking */
  apiKey?: string;
  /** Days to suppress after dismiss (default: 14) */
  dismissDays?: number;
}

// AIDEV-NOTE: Canonical zero-config onboarding default — the guided /setup page (install →
// enable Safari extension → return), not a bare App Store search. Lets an agent wire the banner
// with no URL config and still send users to a flow that actually completes setup.
const DEFAULT_ONBOARDING_URL = 'https://ioswebble.com/setup';
const DISMISS_KEY = 'ioswebble_dismiss_until';
const RETURN_KEY = 'ioswebble_return';
const RETURN_LINK_HOST = 'link.ioswebble.com';

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

function setDismissed(days: number): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400000));
  } catch {
    /* noop */
  }
}

function saveReturnContext(): void {
  const returnPageURL = new URL(window.location.href);
  const returnLink = new URL(`https://${RETURN_LINK_HOST}/return`);
  returnLink.searchParams.set('url', returnPageURL.toString());

  try {
    localStorage.setItem(
      RETURN_KEY,
      JSON.stringify({ url: returnPageURL.toString(), returnLink: returnLink.toString(), timestamp: Date.now() })
    );
    navigator.storage?.persist?.();
  } catch {
    /* noop */
  }
  try {
    navigator.clipboard?.writeText(returnLink.toString());
  } catch {
    /* noop */
  }
}

function resolveOnboardingUrl(options: Pick<BannerOptions, 'startOnboardingUrl' | 'appStoreUrl'>): string {
  return options.startOnboardingUrl ?? options.appStoreUrl ?? DEFAULT_ONBOARDING_URL;
}

function redirectToOnboarding(url: string, apiKey?: string): void {
  saveReturnContext();

  const parsed = new URL(url, window.location.href);
  const isAppStore = parsed.hostname === 'apps.apple.com';

  if (apiKey && isAppStore && !parsed.searchParams.has('ct')) {
    parsed.searchParams.set('ct', apiKey);
    parsed.searchParams.set('mt', '8');
  }

  window.location.href = parsed.toString();
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ─── Bottom Sheet ──────────────────────────────────────────────────────────

function showBottomSheet(options: BannerOptions): HTMLElement {
  const {
    operatorName = document.title || window.location.hostname,
    buttonText = 'Start Setup',
    apiKey,
    dismissDays = 14,
  } = options;
  const onboardingUrl = resolveOnboardingUrl(options);

  const overlay = document.createElement('div');
  overlay.id = 'ioswebble-banner';
  overlay.innerHTML = `
<style>
#ioswebble-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-end;
  justify-content:center;background:rgba(0,0,0,.4);font-family:-apple-system,BlinkMacSystemFont,
  'SF Pro Text',system-ui,sans-serif;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
  animation:iwb-fi .25s ease-out}
@keyframes iwb-fi{from{opacity:0}to{opacity:1}}
@keyframes iwb-su{from{transform:translateY(100%)}to{transform:translateY(0)}}
#iwb-s{background:#fff;border-radius:16px 16px 0 0;padding:12px 24px 34px;max-width:420px;
  width:100%;animation:iwb-su .3s ease-out}
#iwb-s *{box-sizing:border-box;margin:0;padding:0}
.iwb-h{width:36px;height:5px;border-radius:3px;background:#d1d1d6;margin:0 auto 16px}
.iwb-hdr{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.iwb-ic{width:40px;height:40px;border-radius:10px;background:#007aff;display:flex;
  align-items:center;justify-content:center;flex-shrink:0}
.iwb-ic svg{width:22px;height:22px;fill:#fff}
.iwb-tt{font-size:17px;font-weight:600;color:#000}
.iwb-bd{font-size:15px;line-height:1.4;color:#8e8e93;margin-bottom:16px}
.iwb-mt{font-size:13px;color:#8e8e93;margin-bottom:20px;display:flex;align-items:center;gap:8px}
.iwb-st{color:#ff9500;letter-spacing:1px}
.iwb-btn{display:block;width:100%;padding:14px;background:#007aff;color:#fff;border:none;
  border-radius:12px;font-size:17px;font-weight:600;cursor:pointer;text-align:center;
  -webkit-tap-highlight-color:transparent}
.iwb-btn:active{opacity:.85}
.iwb-det{margin-top:16px}
.iwb-det summary{font-size:15px;color:#007aff;cursor:pointer;list-style:none;padding:4px 0}
.iwb-det summary::before{content:'\\25B8  '}
.iwb-det[open] summary::before{content:'\\25BE  '}
.iwb-det p{font-size:13px;color:#8e8e93;line-height:1.5;padding:8px 0 4px}
.iwb-dis{display:block;width:100%;padding:12px;background:none;border:none;font-size:15px;
  color:#8e8e93;cursor:pointer;text-align:center;margin-top:8px;
  -webkit-tap-highlight-color:transparent}
@media(prefers-color-scheme:dark){
  #iwb-s{background:#1c1c1e}
  .iwb-tt{color:#fff}
  .iwb-bd,.iwb-mt,.iwb-det p{color:#98989f}
  .iwb-dis{color:#98989f}
  .iwb-h{background:#48484a}
}
</style>
<div id="ioswebble-overlay">
<div id="iwb-s">
  <div class="iwb-h"></div>
  <div class="iwb-hdr">
    <div class="iwb-ic"><svg viewBox="0 0 24 24"><path d="M12 2L7 7l5 5-5 5 5 5V2zm0 6.83L10.83 7 12 5.83v2.34zm0 8.34L10.83 17 12 15.83v1.34zM17 7l-5 5 5 5-2.12 2.12L12 17l-2.88 2.12L7 17l5-5-5-5 2.12-2.12L12 7l2.88-2.12L17 7z"/></svg></div>
    <div class="iwb-tt">Set Up Bluetooth in Safari</div>
  </div>
  <div class="iwb-bd">To connect to your device, install WebBLE, open the app once, enable the Safari extension, then return to ${esc(operatorName)}.</div>
  <div class="iwb-mt"><span>Install</span><span>→</span><span>Open app</span><span>→</span><span>Enable in Safari</span><span>→</span><span>Return here</span></div>
  <button class="iwb-btn" id="iwb-install">${esc(buttonText)}</button>
  <details class="iwb-det"><summary>How does setup work?</summary><p>WebBLE uses an iPhone app to guide the one-time Safari extension setup. After install, open the app, enable the extension in Safari, then come back to this page and try again.</p></details>
  <details class="iwb-det"><summary>Privacy: No data collected</summary><p>WebBLE processes all Bluetooth data locally on your device. No browsing data, device data, or personal information is ever collected or transmitted.</p></details>
  <button class="iwb-dis" id="iwb-dismiss">Not now</button>
</div>
</div>`;

  requestAnimationFrame(() => {
    overlay.querySelector('#iwb-install')?.addEventListener('click', () => {
      redirectToOnboarding(onboardingUrl, apiKey);
    });
    overlay.querySelector('#iwb-dismiss')?.addEventListener('click', () => {
      overlay.remove();
      setDismissed(dismissDays);
    });
    overlay.querySelector('#ioswebble-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'ioswebble-overlay') {
        overlay.remove();
        setDismissed(dismissDays);
      }
    });
  });

  document.body.appendChild(overlay);
  return overlay;
}

// ─── Lightweight Banner ────────────────────────────────────────────────────

function showBarBanner(options: BannerOptions): HTMLElement {
  const {
    position = 'bottom',
    text = 'Install WebBLE, open the app, enable the Safari extension, then return here.',
    buttonText = 'Start Setup',
    style = {},
    apiKey,
    dismissDays = 14,
  } = options;
  const onboardingUrl = resolveOnboardingUrl(options);

  const el = document.createElement('div');
  el.id = 'ioswebble-banner';

  const posStyle =
    position === 'top'
      ? 'top:0;border-bottom:1px solid #e5e7eb;'
      : 'bottom:0;border-top:1px solid #e5e7eb;';

  const customStyle = Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  el.innerHTML = `
    <div style="position:fixed;${posStyle}left:0;right:0;z-index:2147483646;
      background:#fff;padding:16px;
      display:flex;align-items:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 ${position === 'top' ? '2px' : '-2px'} 10px rgba(0,0,0,0.1);${customStyle}">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#007AFF"/>
        <path d="M12 7a1 1 0 0 1 1 1v4a1 1 0 0 1-2 0V8a1 1 0 0 1 1-1zm0 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="white"/>
      </svg>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:#1f2937">Enable Bluetooth</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(text)}</div>
      </div>
      <button id="ioswebble-banner-install"
         style="background:#007AFF;color:white;padding:8px 16px;border-radius:8px;
         border:none;font-size:14px;font-weight:500;white-space:nowrap;cursor:pointer">
        ${esc(buttonText)}</button>
      <button id="ioswebble-banner-close"
              style="background:none;border:none;color:#9ca3af;font-size:20px;
              cursor:pointer;padding:4px;line-height:1"
              aria-label="Close">&times;</button>
    </div>`;

  el.querySelector('#ioswebble-banner-install')?.addEventListener('click', () => {
    redirectToOnboarding(onboardingUrl, apiKey);
  });
  el.querySelector('#ioswebble-banner-close')?.addEventListener('click', () => {
    el.remove();
    setDismissed(dismissDays);
  });

  document.body.appendChild(el);
  return el;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function showInstallBanner(options: BannerOptions = {}): HTMLElement | null {
  if (isDismissed()) return null;
  return options.mode === 'banner' ? showBarBanner(options) : showBottomSheet(options);
}

export function removeInstallBanner(): void {
  const el = document.getElementById('ioswebble-banner');
  if (el) el.remove();
}
