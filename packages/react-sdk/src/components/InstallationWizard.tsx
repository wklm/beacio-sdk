import React, { useEffect, useState, useCallback } from 'react';
import { SETUP_URL, BEACIO_EVENTS } from '@beacio/core';
// SB-PRD-03: reuse the SINGLE canonical onboarding copy block authored in
// @beacio/core/detect so the web banner and this react wizard never drift on the
// decisive aA → Manage Extensions → Allow Every Website gesture + the first-scan
// Bluetooth prompt.
import { SETUP_STEPS } from '@beacio/core/detect';
import { ExtensionDetector, type ExtensionInstallState } from '../core/ExtensionDetector';

const RETURN_KEY = 'beacio_return';

/**
 * The originating page the user came from (saved in handleInstall before the
 * redirect). SB-PRD-03 AC4: surface this as a VISIBLE return affordance rather
 * than relying on the silent clipboard write. Falls back to the current href.
 */
function readReturnUrl(): string {
  const here = typeof window !== 'undefined' ? window.location.href : '';
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { url?: string };
      if (parsed.url) return parsed.url;
    }
  } catch {
    /* noop */
  }
  return here;
}

interface InstallationWizardProps {
  onComplete?: () => void;
  onInstalledInactive?: () => void;
  /** Preferred onboarding URL override */
  startOnboardingUrl?: string;
  /** App Store URL override */
  appStoreUrl?: string;
  /** Operator/app name shown in the prompt */
  operatorName?: string;
  /**
   * SB-SDK-11 (tier-2 co-brand): partner accent colour applied to the icon tile,
   * step bullets, primary CTA, and disclosure links. Defaults to the beacio
   * Apple-blue (#007aff) so an unthemed wizard renders exactly as before.
   */
  accentColor?: string;
  /**
   * SB-SDK-11: partner logo, restricted to an http(s) URL (no raw markup) so it
   * can never inject script. Validated with `new URL()`; a non-http value is
   * dropped and the default beacio glyph is kept. Rendered as an <img>.
   */
  brandLogoUrl?: string;
  /** SB-SDK-11: the connected device's display name (e.g. "VOLCANO HYBRID"). */
  deviceName?: string;
  /** SB-SDK-11: one-shot lead body copy override (e.g. "Connect your VOLCANO HYBRID …"). */
  body?: string;
  /** SB-SDK-11: privacy reassurance body override (the medical-market trust line). */
  privacyBody?: string;
  className?: string;
}

/**
 * SB-SDK-11 AC2 injection guard (mirrors @beacio/core/detect banner.ts safeLogoUrl):
 * a partner logo is accepted ONLY as a URL resolving to an http(s) resource. A
 * `javascript:`/`data:`/`ftp:` (or any non-http) value is rejected so it can never
 * inject script; relative URLs resolve against the page origin and are allowed.
 * Returns the resolved absolute URL when safe, else null. Never throws.
 */
function safeLogoUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const base = typeof window !== 'undefined' ? window.location.href : 'https://beacio.com';
  try {
    const u = new URL(raw, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export const navigationController = {
  navigateToUrl(url: string) {
    window.location.href = url;
  }
};

/**
 * InstallationWizard - iOS-native style extension installation prompt.
 *
 * Renders as a bottom sheet overlay on iOS Safari, or a simple
 * inline message on other platforms.
 */
export function InstallationWizard({
  onComplete,
  onInstalledInactive,
  startOnboardingUrl,
  appStoreUrl,
  operatorName,
  accentColor,
  brandLogoUrl,
  deviceName,
  body,
  privacyBody,
  className,
}: InstallationWizardProps) {
  const [installState, setInstallState] = useState<ExtensionInstallState>('not-installed');
  const [isChecking, setIsChecking] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const detectorRef = React.useRef(new ExtensionDetector());
  const detector = detectorRef.current;

  const displayName = operatorName || (typeof document !== 'undefined' ? document.title : '') || 'this website';

  // SB-SDK-11 (tier-2 co-brand): resolve the optional theme. The accent defaults
  // to the beacio Apple-blue, so an unthemed wizard is unchanged; the logo is
  // URL-validated (else the beacio glyph is kept); `themed` gates the VISIBLE
  // privacy line + the no-affiliation microcopy (the medical-market trust angle).
  const accent = accentColor || '#007aff';
  const logoUrl = safeLogoUrl(brandLogoUrl);
  const themed = Boolean(accentColor || logoUrl || deviceName);
  const themedIconStyle: React.CSSProperties = { ...iconStyle, background: accent };
  const themedButtonStyle: React.CSSProperties = { ...buttonStyle, background: accent };
  const themedStepNumStyle: React.CSSProperties = { ...stepNumStyle, background: accent };
  const themedSummaryStyle: React.CSSProperties = { ...summaryStyle, color: accent };
  // The lead body copy: a top-level `body` override wins, else the default copy
  // (now device-aware when a deviceName is supplied).
  const bodyText =
    body ||
    `To connect to your device, ${displayName}${deviceName ? ` needs to reach your ${deviceName} and` : ''} needs the Beacio Safari extension.`;
  const privacyText =
    privacyBody ||
    'Beacio processes all Bluetooth data locally on your device. No browsing data, device data, or personal information is ever collected or transmitted.';

  useEffect(() => {
    const checkInstallation = async () => {
      setIsChecking(true);
      try {
        const state = await detector.detectInstallState();
        setInstallState(state);
        if (state === 'active') {
          onComplete?.();
        } else if (state === 'installed-inactive') {
          onInstalledInactive?.();
        }
      } catch {
        setInstallState('not-installed');
      } finally {
        setIsChecking(false);
      }
    };

    checkInstallation();

    const handleReady = () => {
      setInstallState('active');
      onComplete?.();
    };
    window.addEventListener(BEACIO_EVENTS.EXTENSION_READY, handleReady);
    return () => window.removeEventListener(BEACIO_EVENTS.EXTENSION_READY, handleReady);
  }, []);

  const handleInstall = useCallback(() => {
    // Save return context before redirecting
    try {
      localStorage.setItem(
        'beacio_return',
        JSON.stringify({ url: window.location.href, timestamp: Date.now() })
      );
      navigator.clipboard?.writeText(
        `beacio://return?url=${encodeURIComponent(window.location.href)}`
      );
    } catch { /* noop */ }
    navigationController.navigateToUrl(startOnboardingUrl || appStoreUrl || SETUP_URL);
  }, [appStoreUrl, startOnboardingUrl]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(
        'beacio_dismiss_until',
        String(Date.now() + 14 * 86400000)
      );
    } catch { /* noop */ }
  }, []);

  if (isChecking) return null;
  if (installState === 'active' || dismissed) return null;

  return (
    <div className={className} style={overlayStyle} data-beacio-wizard="" data-beacio-state={installState}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()} data-beacio-wizard-sheet="">
        <div style={handleBarStyle} data-beacio-wizard-handle="" />

        <div style={headerStyle} data-beacio-wizard-header="">
          <div style={themedIconStyle} data-beacio-wizard-icon="">
            {logoUrl ? (
              // SB-SDK-11: URL-validated partner logo replaces the beacio glyph.
              <img src={logoUrl} alt="" aria-hidden="true" style={logoImgStyle} />
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
                <path d="M14.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-5 0c.83 0 1.5-.67 1.5-1.5S10.33 8.5 9.5 8.5 8 9.17 8 10s.67 1.5 1.5 1.5zm2.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
            )}
          </div>
          <div style={titleStyle} data-beacio-wizard-title="">Bluetooth Required</div>
        </div>

        <div style={bodyStyle} data-beacio-wizard-body="">
          {bodyText}
        </div>

        <div style={metaStyle} data-beacio-wizard-meta="">
          <span style={starsStyle}>★★★★★</span>
          <span>4.8</span>
          <span>·</span>
          <span>Free</span>
          <span>·</span>
          <span>Takes 1 minute</span>
        </div>

        {/* SB-PRD-03: the real tapped sequence, each grant with its "why" — the
            aA gesture + the first-scan Bluetooth prompt — reused from @beacio/core/detect. */}
        <ol style={stepsStyle} data-beacio-wizard-steps="">
          {SETUP_STEPS.map((s, i) => (
            <li key={s.label} style={stepStyle}>
              <span style={themedStepNumStyle} aria-hidden="true">{i + 1}</span>
              <span style={stepLabelStyle}>{s.label}</span>
              <span style={stepWhyStyle}>{s.why}</span>
            </li>
          ))}
        </ol>

          <button style={themedButtonStyle} onClick={handleInstall} data-beacio-wizard-action="">
          {installState === 'installed-inactive' ? 'Finish Safari Setup' : 'Start Setup'}
          </button>

        {/* SB-PRD-03 AC4: VISIBLE, origin-correct return affordance. */}
        <a style={returnStyle} href={readReturnUrl()} data-beacio-wizard-return="">
          Return to {displayName}
        </a>
        <p style={clipboardNoteStyle} data-beacio-wizard-clipboard-note="">
          Link also copied — paste it into Safari if this button does not reopen {displayName}.
        </p>

        <details style={detailsStyle} data-beacio-wizard-details="">
          <summary style={themedSummaryStyle}>How does this work?</summary>
          <p style={detailsTextStyle}>
            Beacio is a free Safari extension that enables Bluetooth communication
            between this website and your device. After a quick one-time setup, Bluetooth
            will work seamlessly in Safari.
          </p>
        </details>

        <details style={detailsStyle} data-beacio-wizard-details="">
          <summary style={themedSummaryStyle}>Privacy: No data collected</summary>
          <p style={detailsTextStyle}>{privacyText}</p>
        </details>

        {/* SB-SDK-11 AC3: VISIBLE trust surfaces (not the collapsed <details>) — the
            medical-market "No data collected" reassurance + a no-affiliation
            microcopy line. Neutral install-path framing only (no App-Store-
            approved/cleared/audited claims). Rendered for co-brand (themed) prompts. */}
        {themed && (
          <>
            <p style={visiblePrivacyStyle} data-beacio-wizard-privacy="">
              Privacy: No data collected — {privacyText}
            </p>
            <p style={noAffiliationStyle} data-beacio-wizard-noaffiliation="">
              Beacio is an independent Safari extension and is not affiliated with the device maker.
            </p>
          </>
        )}

        <button style={dismissStyle} onClick={handleDismiss} data-beacio-wizard-dismiss="">
          Not now
        </button>
      </div>
    </div>
  );
}

// Inline styles matching the iOS-native bottom sheet design
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483647,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.4)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  backdropFilter: 'blur(4px)',
};

const sheetStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '16px 16px 0 0',
  padding: '12px 24px 34px',
  maxWidth: 420,
  width: '100%',
};

const handleBarStyle: React.CSSProperties = {
  width: 36,
  height: 5,
  borderRadius: 3,
  background: '#d1d1d6',
  margin: '0 auto 16px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 12,
};

const iconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: '#007aff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: '#000',
};

const bodyStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.4,
  color: '#8e8e93',
  marginBottom: 16,
};

const metaStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#8e8e93',
  marginBottom: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const starsStyle: React.CSSProperties = {
  color: '#ff9500',
  letterSpacing: 1,
};

const stepsStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '0 0 18px',
  padding: 0,
  counterReset: 'bc-step',
};

const stepStyle: React.CSSProperties = {
  position: 'relative',
  padding: '0 0 12px 30px',
  fontSize: 14,
  lineHeight: 1.4,
};

const stepNumStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 20,
  height: 20,
  borderRadius: '50%',
  background: '#007aff',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const stepLabelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  color: '#1c1c1e',
};

const stepWhyStyle: React.CSSProperties = {
  display: 'block',
  color: '#8e8e93',
  marginTop: 2,
};

const returnStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 14,
  marginTop: 10,
  background: '#34c759',
  color: '#fff',
  borderRadius: 12,
  fontSize: 17,
  fontWeight: 600,
  textAlign: 'center',
  textDecoration: 'none',
  boxSizing: 'border-box',
};

const clipboardNoteStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#8e8e93',
  textAlign: 'center',
  marginTop: 8,
};

const buttonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 14,
  background: '#007aff',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  fontSize: 17,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'center',
};

const detailsStyle: React.CSSProperties = {
  marginTop: 16,
};

const summaryStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#007aff',
  cursor: 'pointer',
  padding: '4px 0',
};

const detailsTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#8e8e93',
  lineHeight: 1.5,
  padding: '8px 0 4px',
};

// SB-SDK-11: partner logo <img> fills the accent tile (object-fit so any aspect
// ratio sits inside the rounded square without distortion).
const logoImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

// SB-SDK-11 AC3: the VISIBLE privacy reassurance line (distinct from the collapsed
// <details>) and the no-affiliation microcopy, for the medical-market trust angle.
const visiblePrivacyStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#8e8e93',
  lineHeight: 1.5,
  marginTop: 16,
};

const noAffiliationStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#8e8e93',
  lineHeight: 1.4,
  marginTop: 8,
  textAlign: 'center',
};

const dismissStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 12,
  background: 'none',
  border: 'none',
  fontSize: 15,
  color: '#8e8e93',
  cursor: 'pointer',
  textAlign: 'center',
  marginTop: 8,
};
