/**
 * @beacio/detect#i18n — SB-SDK-07
 *
 * The shared localized-string seam for the two user-facing surfaces in
 * @beacio/detect: the install banner (banner.ts) and the branded error
 * presenter (error-presenter.ts). The install banner is the SINGLE end-user
 * onboarding screen that replaces S&B's Bluefy alert, and it was hardcoded
 * English — only `text`/`buttonText` were overridable. S&B is HQ'd in Bayreuth
 * and its German users would see English at the make-or-break moment. This
 * module centralises every visible token into a typed string pack, ships a
 * built-in German (`de`) pack alongside the English (`en`) default, and exposes
 * one PURE selector with a documented policy.
 *
 * Selection policy (resolveStrings):
 *   1. an explicit BCP-47 `lang` ALWAYS wins (prefix-matched: 'de', 'de-DE',
 *      'de-AT' all select the German pack);
 *   2. else the runtime's `navigator.language` is prefix-matched the same way
 *      (so a German-locale iPhone gets German with zero config);
 *   3. else English.
 * A caller-supplied partial `strings` object then deep-merges OVER the selected
 * pack, so an operator can override one field (e.g. just `buttonText`) without
 * restating the whole pack, in any language.
 *
 * Design constraints (mirroring banner.ts / error-presenter.ts):
 *  - @beacio/core is an OPTIONAL peer, so this module imports NOTHING from core.
 *    The BeacioErrorCode union is re-declared LOCALLY (kept in lock-step with
 *    core's source by error-presenter-core-parity.test.ts, which pins the SAME
 *    local table this pack's `error.messages` must cover).
 *  - All copy uses neutral install-path framing only — no "App Store approved /
 *    cleared / reviewed" language (feedback_no_app_store_status_claims).
 *  - `{operator}` is the ONLY interpolation token; banner.ts substitutes the
 *    resolved operator name into it (see fill()).
 *
 * SDK has zero external consumers, so adding the `lang`/`strings` seam is a free,
 * non-breaking change (project_sdk_no_consumers).
 */

/**
 * The stable BeacioErrorCode contract (core/src/errors.ts). Re-declared locally
 * — not imported — so detect has no runtime @beacio/core dependency. Kept in
 * lock-step with core by error-presenter-core-parity.test.ts (the COMPILE-TIME
 * EVERY_CODE Record) and by this module's own pack-parity guard in i18n.test.ts.
 */
export type BeacioErrorCode =
  | 'INVALID_PARAMETER'
  | 'BLUETOOTH_UNAVAILABLE'
  | 'EXTENSION_NOT_INSTALLED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_DISCONNECTED'
  | 'CONNECTION_TIMEOUT'
  | 'SERVICE_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_READABLE'
  | 'CHARACTERISTIC_NOT_WRITABLE'
  | 'CHARACTERISTIC_NOT_NOTIFIABLE'
  | 'GATT_OPERATION_FAILED'
  | 'SCAN_ALREADY_IN_PROGRESS'
  | 'CONNECTION_LIMIT_REACHED'
  | 'USER_CANCELLED'
  | 'TIMEOUT'
  | 'WRITE_INCOMPLETE';

/** Funnel-state lead copy: a title + body shown at the top of the bottom sheet. */
export interface StateCopy {
  title: string;
  body: string;
}

/** A single setup step: the imperative label the user taps + its one-line "why". */
export interface SetupStepCopy {
  label: string;
  why: string;
}

/** A branded error card's headline + body. */
export interface ErrorCopy {
  title: string;
  body: string;
}

/** The error-presenter half of the pack — shared by presentError. */
export interface ErrorStrings {
  /** Dismiss button label on the error card. */
  dismiss: string;
  /** Retry affordance label (retriable errors only). */
  retry: string;
  /** Per-code branded headline. EVERY BeacioErrorCode is present (parity-guarded). */
  titles: Record<BeacioErrorCode, string>;
  /** Per-code branded body. EVERY BeacioErrorCode is present (parity-guarded). */
  messages: Record<BeacioErrorCode, string>;
  /** Fallback copy for an unrecognised error (bare string / unknown DOMException). */
  generic: ErrorCopy;
}

/**
 * The complete visible-string surface of @beacio/detect. The built-in `en`/`de`
 * packs both define EXACTLY these keys (i18n.test.ts pins the parity), so a new
 * English-only string cannot silently bypass localization.
 */
export interface LocaleStrings {
  /** Primary CTA label on the not-installed sheet + the lightweight bar. */
  buttonText: string;
  /** Sheet soft-dismiss ("Not now") label — short suppression (SB-PRD-08). */
  dismiss: string;
  /**
   * SB-PRD-08: the EXPLICIT "Don't show again" opt-out label — the long-suppression
   * control, distinct from the soft "Not now" {@link dismiss} above.
   */
  dontShowAgain: string;
  /** Per-funnel-state lead copy (the 'active' state renders the toast instead). */
  states: {
    'not-installed': StateCopy;
    'installed-inactive': StateCopy;
    denied: StateCopy;
    /**
     * SB-SDK-17: Private Browsing dead end. iOS Safari disables web extensions in
     * Private Browsing (no per-extension opt-in), so beacio is inert and the app
     * may already be installed — the recovery is to reopen the page in a normal
     * tab, NOT to install anything. A distinct hint (no install CTA, no steps).
     */
    'private-browsing': StateCopy;
  };
  /** The ordered first-run step list (install → … → return). */
  steps: SetupStepCopy[];
  /** Visible "Return to {operator}" CTA label. */
  returnCta: string;
  /** Sub-line explaining the link was also copied to the clipboard. */
  clipboardHint: string;
  /** "Reload page to re-check" control label. */
  reload: string;
  /** "How does setup work?" <details> summary. */
  howSummary: string;
  /** "How does setup work?" <details> body (ends with the linked guide phrase). */
  howBody: string;
  /** Linked phrase inside howBody that points at the setup guide. */
  howLink: string;
  /** "Privacy: No data collected" <details> summary. */
  privacySummary: string;
  /** "Privacy: No data collected" <details> body. */
  privacyBody: string;
  /** "Still stuck? Open the setup guide" affordance. */
  stillStuck: string;
  /** Lightweight bar banner heading ("Enable Bluetooth"). */
  barTitle: string;
  /** Lightweight bar banner body text. */
  barText: string;
  /** Once-only success toast text ("beacio is ready — tap Connect …"). */
  readyToast: string;
  /** Error-presenter strings (shared with presentError). */
  error: ErrorStrings;
}

/**
 * English (default) pack — the byte-identical source of today's rendered copy.
 * `{operator}` is substituted by banner.ts with the resolved operator name.
 */
export const EN_STRINGS: LocaleStrings = {
  buttonText: 'Start Setup',
  dismiss: 'Not now',
  dontShowAgain: "Don't show again",
  states: {
    'not-installed': {
      title: 'Set Up Bluetooth in Safari',
      body: 'To connect to your device, install beacio, open the app once, enable the Safari extension, allow access on this site, then return to {operator}.',
    },
    'installed-inactive': {
      title: 'Enable beacio in Safari',
      body: 'beacio is installed but the Safari extension is off. Open Settings → Apps → Safari → Extensions → beacio and turn on Allow Extension, then return here.',
    },
    denied: {
      title: 'Allow beacio on this site',
      body: 'beacio is enabled but not yet allowed here. Tap the aA button in the address bar → Manage Extensions → beacio → Allow Every Website, then reload this page.',
    },
    'private-browsing': {
      title: 'Private Browsing blocks extensions',
      body: 'Private Browsing disables Safari extensions, so beacio cannot run here — even if it is installed. Open this page in a normal tab to connect your device.',
    },
  },
  steps: [
    { label: 'Install beacio', why: 'A free one-time companion app from the App Store.' },
    { label: 'Open the app once', why: 'This registers the Safari extension with iOS.' },
    {
      label: 'Enable in Safari Settings',
      why: 'Settings → Apps → Safari → Extensions → beacio → turn on Allow Extension.',
    },
    {
      label: 'Allow website access',
      why: 'On the site, tap the aA button in the address bar → Manage Extensions → beacio → Allow Every Website.',
    },
    {
      label: 'Allow Bluetooth on first scan',
      why: 'The first time you connect, Safari will ask to allow this site — tap Allow.',
    },
    { label: 'Return and reload', why: 'Come back to this page, reload, and tap Connect.' },
  ],
  returnCta: 'Return to {operator}',
  clipboardHint: 'Link also copied — paste it into Safari if this button does not reopen {operator}.',
  reload: 'Reload page to re-check',
  howSummary: 'How does setup work?',
  howBody: 'beacio uses a one-time iPhone app to enable the Safari extension. After enabling it and allowing access on this site (aA button → Manage Extensions → Allow Every Website), Bluetooth works in Safari.',
  howLink: 'See the full setup guide',
  privacySummary: 'Privacy: No data collected',
  privacyBody: 'beacio processes all Bluetooth data locally on your device. No browsing data, device data, or personal information is ever collected or transmitted.',
  stillStuck: 'Still stuck? Open the setup guide',
  barTitle: 'Enable Bluetooth',
  barText: 'Install Beacio, open the app, enable the Safari extension, then return here.',
  readyToast: 'beacio is ready — tap Connect to pair your device with {operator}.',
  error: {
    dismiss: 'Dismiss',
    retry: 'Try again',
    titles: {
      INVALID_PARAMETER: 'Something went wrong',
      BLUETOOTH_UNAVAILABLE: 'Bluetooth is unavailable',
      EXTENSION_NOT_INSTALLED: 'Finish Bluetooth setup',
      PERMISSION_DENIED: 'Allow Bluetooth to continue',
      DEVICE_NOT_FOUND: 'No device found',
      DEVICE_DISCONNECTED: 'Device disconnected',
      CONNECTION_TIMEOUT: 'Connection timed out',
      SERVICE_NOT_FOUND: 'Device feature unavailable',
      CHARACTERISTIC_NOT_FOUND: 'Device feature unavailable',
      CHARACTERISTIC_NOT_READABLE: 'Cannot read from device',
      CHARACTERISTIC_NOT_WRITABLE: 'Cannot send to device',
      CHARACTERISTIC_NOT_NOTIFIABLE: 'Live updates unavailable',
      GATT_OPERATION_FAILED: 'Connection interrupted',
      SCAN_ALREADY_IN_PROGRESS: 'Already searching',
      CONNECTION_LIMIT_REACHED: 'Too many devices connected',
      USER_CANCELLED: 'Connection cancelled',
      TIMEOUT: 'Operation timed out',
      WRITE_INCOMPLETE: 'Send incomplete',
    },
    messages: {
      INVALID_PARAMETER: 'The request could not be completed. Please reload the page and try again.',
      BLUETOOTH_UNAVAILABLE: 'Turn Bluetooth on, then try again.',
      EXTENSION_NOT_INSTALLED: 'Bluetooth is not enabled for this site yet. Finish setup, then try connecting again.',
      PERMISSION_DENIED: 'Bluetooth access was not granted. Tap Connect yourself (Bluetooth needs a tap), then allow access when asked.',
      DEVICE_NOT_FOUND: 'No matching device was found. Switch your device on, keep it close, then try again.',
      DEVICE_DISCONNECTED: 'The connection to your device was lost. Reconnect to continue.',
      CONNECTION_TIMEOUT: 'Your device did not respond in time. Keep it close and powered on, then try again.',
      SERVICE_NOT_FOUND: 'A required feature was not found on this device. Check that it is the right device and try again.',
      CHARACTERISTIC_NOT_FOUND: 'A required feature was not found on this device. Check that it is the right device and try again.',
      CHARACTERISTIC_NOT_READABLE: 'This value cannot be read from your device. No action is needed for this control.',
      CHARACTERISTIC_NOT_WRITABLE: 'This value cannot be sent to your device. No action is needed for this control.',
      CHARACTERISTIC_NOT_NOTIFIABLE: 'This value does not support live updates on your device.',
      GATT_OPERATION_FAILED: 'Something interrupted the connection. Switch your device off and on, then try again.',
      SCAN_ALREADY_IN_PROGRESS: 'A device search is already running. Wait a moment, then try again.',
      CONNECTION_LIMIT_REACHED: 'Disconnect another device before connecting a new one.',
      USER_CANCELLED: 'No device was selected. Tap Connect to try again whenever you are ready.',
      TIMEOUT: 'That took too long. Check your device is close and powered on, then try again.',
      WRITE_INCOMPLETE: 'Only part of the data reached your device. Try again to resend it.',
    },
    generic: {
      title: 'Something went wrong',
      body: 'Something interrupted the connection. Please try again.',
    },
  },
};

/**
 * German (`de`) pack. Mirrors EN_STRINGS key-for-key (i18n.test.ts pins the
 * parity, so this pack can never fall behind a new English string). Native,
 * neutral install-path German; iOS-26 Settings paths use the localized Settings
 * labels (Apps → Safari → Erweiterungen) a German iPhone actually shows. The
 * stylized brand word "beacio" stays lowercase mid-sentence, matching the
 * English copy and the app's lowercase display name.
 */
export const DE_STRINGS: LocaleStrings = {
  buttonText: 'Einrichtung starten',
  dismiss: 'Jetzt nicht',
  dontShowAgain: 'Nicht mehr anzeigen',
  states: {
    'not-installed': {
      title: 'Bluetooth in Safari einrichten',
      body: 'Um dein Gerät zu verbinden, installiere beacio, öffne die App einmal, aktiviere die Safari-Erweiterung, erlaube den Zugriff auf dieser Seite und kehre dann zu {operator} zurück.',
    },
    'installed-inactive': {
      title: 'beacio in Safari aktivieren',
      body: 'beacio ist installiert, aber die Safari-Erweiterung ist deaktiviert. Öffne Einstellungen → Apps → Safari → Erweiterungen → beacio und aktiviere „Erweiterung erlauben“, kehre dann hierher zurück.',
    },
    denied: {
      title: 'beacio für diese Seite erlauben',
      body: 'beacio ist aktiviert, aber für diese Seite noch nicht erlaubt. Tippe auf die Schaltfläche „aA“ in der Adressleiste → Erweiterungen verwalten → beacio → „Auf allen Websites erlauben“ und lade diese Seite dann neu.',
    },
    'private-browsing': {
      title: 'Privates Surfen blockiert Erweiterungen',
      body: 'Im privaten Surfmodus sind Safari-Erweiterungen deaktiviert, daher kann beacio hier nicht laufen — auch wenn es installiert ist. Öffne diese Seite in einem normalen Tab, um dein Gerät zu verbinden.',
    },
  },
  steps: [
    { label: 'beacio installieren', why: 'Eine kostenlose, einmalige Begleit-App aus dem App Store.' },
    { label: 'App einmal öffnen', why: 'Damit wird die Safari-Erweiterung bei iOS registriert.' },
    {
      label: 'In den Safari-Einstellungen aktivieren',
      why: 'Einstellungen → Apps → Safari → Erweiterungen → beacio → „Erweiterung erlauben“ aktivieren.',
    },
    {
      label: 'Website-Zugriff erlauben',
      why: 'Tippe auf der Seite auf die Schaltfläche „aA“ in der Adressleiste → Erweiterungen verwalten → beacio → „Auf allen Websites erlauben“.',
    },
    {
      label: 'Bluetooth beim ersten Scan erlauben',
      why: 'Beim ersten Verbinden fragt Safari, ob diese Seite zugreifen darf — tippe auf „Erlauben“.',
    },
    { label: 'Zurückkehren und neu laden', why: 'Komm zu dieser Seite zurück, lade sie neu und tippe auf „Verbinden“.' },
  ],
  returnCta: 'Zurück zu {operator}',
  clipboardHint: 'Link wurde außerdem kopiert — füge ihn in Safari ein, falls diese Schaltfläche {operator} nicht erneut öffnet.',
  reload: 'Seite neu laden und erneut prüfen',
  howSummary: 'Wie funktioniert die Einrichtung?',
  howBody: 'beacio nutzt eine einmalige iPhone-App, um die Safari-Erweiterung zu aktivieren. Sobald sie aktiviert und der Zugriff auf dieser Seite erlaubt ist (Schaltfläche „aA“ → Erweiterungen verwalten → „Auf allen Websites erlauben“), funktioniert Bluetooth in Safari.',
  howLink: 'Zur vollständigen Einrichtungsanleitung',
  privacySummary: 'Datenschutz: Keine Datenerfassung',
  privacyBody: 'beacio verarbeitet alle Bluetooth-Daten lokal auf deinem Gerät. Es werden niemals Browserdaten, Gerätedaten oder persönliche Informationen erfasst oder übertragen.',
  stillStuck: 'Kommst du nicht weiter? Einrichtungsanleitung öffnen',
  barTitle: 'Bluetooth aktivieren',
  barText: 'Installiere beacio, öffne die App, aktiviere die Safari-Erweiterung und kehre dann hierher zurück.',
  readyToast: 'beacio ist bereit — tippe auf „Verbinden“, um dein Gerät mit {operator} zu koppeln.',
  error: {
    dismiss: 'Schließen',
    retry: 'Erneut versuchen',
    titles: {
      INVALID_PARAMETER: 'Etwas ist schiefgelaufen',
      BLUETOOTH_UNAVAILABLE: 'Bluetooth ist nicht verfügbar',
      EXTENSION_NOT_INSTALLED: 'Bluetooth-Einrichtung abschließen',
      PERMISSION_DENIED: 'Bluetooth erlauben, um fortzufahren',
      DEVICE_NOT_FOUND: 'Kein Gerät gefunden',
      DEVICE_DISCONNECTED: 'Gerät getrennt',
      CONNECTION_TIMEOUT: 'Zeitüberschreitung der Verbindung',
      SERVICE_NOT_FOUND: 'Gerätefunktion nicht verfügbar',
      CHARACTERISTIC_NOT_FOUND: 'Gerätefunktion nicht verfügbar',
      CHARACTERISTIC_NOT_READABLE: 'Lesen vom Gerät nicht möglich',
      CHARACTERISTIC_NOT_WRITABLE: 'Senden an das Gerät nicht möglich',
      CHARACTERISTIC_NOT_NOTIFIABLE: 'Live-Aktualisierungen nicht verfügbar',
      GATT_OPERATION_FAILED: 'Verbindung unterbrochen',
      SCAN_ALREADY_IN_PROGRESS: 'Suche läuft bereits',
      CONNECTION_LIMIT_REACHED: 'Zu viele Geräte verbunden',
      USER_CANCELLED: 'Verbindung abgebrochen',
      TIMEOUT: 'Zeitüberschreitung des Vorgangs',
      WRITE_INCOMPLETE: 'Senden unvollständig',
    },
    messages: {
      INVALID_PARAMETER: 'Die Anfrage konnte nicht abgeschlossen werden. Lade die Seite neu und versuche es erneut.',
      BLUETOOTH_UNAVAILABLE: 'Schalte Bluetooth ein und versuche es erneut.',
      EXTENSION_NOT_INSTALLED: 'Bluetooth ist für diese Seite noch nicht aktiviert. Schließe die Einrichtung ab und versuche dann erneut, dich zu verbinden.',
      PERMISSION_DENIED: 'Der Bluetooth-Zugriff wurde nicht gewährt. Tippe selbst auf „Verbinden“ (Bluetooth erfordert eine Berührung) und erlaube den Zugriff, wenn du gefragt wirst.',
      DEVICE_NOT_FOUND: 'Es wurde kein passendes Gerät gefunden. Schalte dein Gerät ein, halte es in der Nähe und versuche es erneut.',
      DEVICE_DISCONNECTED: 'Die Verbindung zu deinem Gerät wurde unterbrochen. Verbinde dich erneut, um fortzufahren.',
      CONNECTION_TIMEOUT: 'Dein Gerät hat nicht rechtzeitig geantwortet. Halte es in der Nähe und eingeschaltet und versuche es erneut.',
      SERVICE_NOT_FOUND: 'Eine erforderliche Funktion wurde auf diesem Gerät nicht gefunden. Prüfe, ob es das richtige Gerät ist, und versuche es erneut.',
      CHARACTERISTIC_NOT_FOUND: 'Eine erforderliche Funktion wurde auf diesem Gerät nicht gefunden. Prüfe, ob es das richtige Gerät ist, und versuche es erneut.',
      CHARACTERISTIC_NOT_READABLE: 'Dieser Wert kann nicht von deinem Gerät gelesen werden. Für dieses Element ist keine Aktion erforderlich.',
      CHARACTERISTIC_NOT_WRITABLE: 'Dieser Wert kann nicht an dein Gerät gesendet werden. Für dieses Element ist keine Aktion erforderlich.',
      CHARACTERISTIC_NOT_NOTIFIABLE: 'Dieser Wert unterstützt auf deinem Gerät keine Live-Aktualisierungen.',
      GATT_OPERATION_FAILED: 'Etwas hat die Verbindung unterbrochen. Schalte dein Gerät aus und wieder ein und versuche es erneut.',
      SCAN_ALREADY_IN_PROGRESS: 'Es läuft bereits eine Gerätesuche. Warte einen Moment und versuche es erneut.',
      CONNECTION_LIMIT_REACHED: 'Trenne ein anderes Gerät, bevor du ein neues verbindest.',
      USER_CANCELLED: 'Es wurde kein Gerät ausgewählt. Tippe auf „Verbinden“, um es erneut zu versuchen, wann immer du bereit bist.',
      TIMEOUT: 'Das hat zu lange gedauert. Prüfe, ob dein Gerät in der Nähe und eingeschaltet ist, und versuche es erneut.',
      WRITE_INCOMPLETE: 'Nur ein Teil der Daten hat dein Gerät erreicht. Versuche es erneut, um sie noch einmal zu senden.',
    },
    generic: {
      title: 'Etwas ist schiefgelaufen',
      body: 'Etwas hat die Verbindung unterbrochen. Bitte versuche es erneut.',
    },
  },
};

/** The built-in packs, keyed by their primary BCP-47 language subtag. */
const PACKS: Record<string, LocaleStrings> = {
  en: EN_STRINGS,
  de: DE_STRINGS,
};

/**
 * The primary (language) subtag of a BCP-47 tag, lower-cased: 'de-DE' → 'de',
 * 'EN' → 'en'. Returns '' for an empty/garbage value so the caller falls back.
 */
function primarySubtag(lang: string | undefined): string {
  if (!lang || typeof lang !== 'string') return '';
  return lang.split('-', 1)[0]!.trim().toLowerCase();
}

/** The runtime UI language, or undefined when navigator is unavailable (SSR). */
function navigatorLanguage(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.language;
}

/**
 * Deep-merge a caller-supplied partial pack OVER a base pack, producing a new
 * pack (the bases are never mutated). Only plain objects are recursed; arrays
 * and scalars are replaced wholesale by the override when present. This is the
 * narrow merge the seam needs (no array element-wise merge), kept dependency-free.
 */
function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    // Scalar / array leaf: an override of the right kind replaces it.
    return (override as unknown as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override as Record<string, unknown>)) {
    const o = (override as Record<string, unknown>)[key];
    if (o === undefined) continue;
    out[key] = deepMerge((base as Record<string, unknown>)[key], o as never);
  }
  return out as T;
}

/** A recursively-optional view of a type, for partial `strings` overrides. */
export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Options shared by the banner + error presenter for selecting localized copy. */
export interface ResolveStringsOptions {
  /** Explicit BCP-47 language tag. Always wins when its primary subtag is known. */
  lang?: string;
  /** Partial overrides deep-merged over the selected pack (any field, any depth). */
  strings?: DeepPartial<LocaleStrings>;
}

/**
 * PURE locale selector implementing the SB-SDK-07 policy:
 *   explicit `lang` (prefix-matched) > navigator.language (prefix-matched) > English,
 * then a partial `strings` override deep-merged over the selected pack.
 *
 * Pure + side-effect-free: it reads navigator.language only when no explicit
 * `lang` is given, and never mutates the built-in packs. An unknown subtag falls
 * through to English (never throws). Returns a fresh object when an override is
 * supplied, else the shared pack reference (so identity checks against EN/DE_STRINGS
 * hold for the no-override path the tests assert).
 */
export function resolveStrings(options: ResolveStringsOptions = {}): LocaleStrings {
  const explicit = primarySubtag(options.lang);
  const selected =
    (explicit && PACKS[explicit]) ||
    (PACKS[primarySubtag(navigatorLanguage())]) ||
    EN_STRINGS;
  return options.strings ? deepMerge(selected, options.strings) : selected;
}
