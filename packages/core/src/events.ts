/**
 * Canonical beacio CustomEvent names — the single source of truth shared by the
 * detect dispatcher (@beacio/detect), the react-sdk listeners (@beacio/react),
 * the extension in-page handshake, and the CDN bundle.
 *
 * Lives in @beacio/core for the same reason as `urls.ts`: core depends on
 * nothing, while @beacio/detect (the dispatcher) and @beacio/react (a listener)
 * both peer-depend on core — so importing the event-name constants FROM core
 * introduces no dependency cycle. Both the dispatch side and every listen side
 * reference these literals, so a diverged or typo'd event name becomes a
 * compile error rather than a silent half-rebrand break (a listener registered
 * on a name nobody dispatches).
 *
 * `as const` pins each value to its string-literal type (not widened to
 * `string`); dispatch/listen sites typed against {@link BeacioEventName} reject
 * any non-member string at compile time.
 */
export const BEACIO_EVENTS = {
  // ── @beacio/detect package lifecycle (public) ────────────────────────────
  /** Fired on every initBeacio() run with the resolved install state. */
  STATE_CHANGE: 'beacio:statechange',
  /** Fired when the extension is detected and active/ready. */
  READY: 'beacio:ready',
  /** Fired when the extension is installed but Safari still needs activation. */
  INSTALLED_INACTIVE: 'beacio:installedinactive',
  /** Fired when the extension is not installed. */
  NOT_INSTALLED: 'beacio:notinstalled',

  // ── In-page extension handshake (extension ⇄ page / cdn / react-sdk) ──────
  /** The extension's injected script announces it is live and active. */
  EXTENSION_READY: 'beacio:extension:ready',
  /** Page → extension liveness probe. */
  EXTENSION_PING: 'beacio:extension:ping',
  /** Extension → page liveness response. */
  EXTENSION_PONG: 'beacio:extension:pong',
  /** Page → extension request to activate the API. */
  EXTENSION_ACTIVATE_REQUEST: 'beacio:extension:activate-request',
  /** Extension → page result of an activate request. */
  EXTENSION_ACTIVATE_RESULT: 'beacio:extension:activate-result',
  /** Extension announces it is installed (present, not yet active). */
  EXTENSION_INSTALLED: 'beacio:extension:installed',
} as const;

/**
 * The union of every canonical beacio CustomEvent name. A value typed as this
 * cannot be any string other than a {@link BEACIO_EVENTS} member, so a typo at a
 * dispatch or listen site fails to compile.
 */
export type BeacioEventName = (typeof BEACIO_EVENTS)[keyof typeof BEACIO_EVENTS];
