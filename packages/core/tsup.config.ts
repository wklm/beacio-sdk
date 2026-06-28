import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/auto.ts', 'src/global.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  treeshake: true,
  // AIDEV-NOTE: `@beacio/detect` is a runtime-optional peer that auto.ts pulls in
  // via `await import('@beacio/detect')` for the install banner. It must stay an
  // external runtime import — never bundled — otherwise esbuild follows detect's
  // dist chunks, which statically `import { BEACIO_EVENTS/SETUP_URL } from '@beacio/core'`
  // and cannot resolve core mid-build (the detect↔core cycle). Mirrors the
  // `external: ['@beacio/core']` already used in profiles/react-sdk.
  external: ['@beacio/detect'],
  // Bundle-size: mangle a precisely-audited set of PRIVATE instance-field names
  // that are pure internal state — never public API, never accessed by string /
  // bracket, never JSON-serialized/spread off an instance, and never sent across
  // the Safari wire (the wire uses `type` strings, not these fields; the JS
  // classes are thin forwarders). Matched members: the per-instance GATT/discovery
  // caches (primaryServicesCache, serviceCache, charCache, boundCache), the
  // subscription recoveryRegistry, the foreground auto-reconnect state
  // (autoReconnectConfig, autoReconnectAbort), and the private event-listener
  // arrays + notificationStates map (*Listeners / notificationStates).
  //
  // Why this is safe:
  //  - esbuild only mangles PROPERTY accesses (`.foo` / `obj["foo"]` / class+object
  //    literal keys). TypeScript TYPE names (RawAutoReconnectConfig,
  //    ReplyActionConfig) are erased before esbuild runs, and local FUNCTION
  //    declarations (resolveAutoReconnectConfig, add/removeFromRecoveryRegistry)
  //    are plain identifiers — neither is a property, so neither is touched.
  //  - The suffixes are plural/compound (…States, …Listeners, …Cache) and do NOT
  //    collide with the singular standard DOM names core reads (e.g. document
  //    .readyState — singular, and only in the SEPARATE browser-auto build anyway).
  //  - reserveProps below is belt-and-suspenders: it pins the public API + the
  //    W3C/standard surface so a future regex widening can never rename them.
  // Re-audit (grep for `["']name["']` access / wire `type:` / instance spread)
  // before widening the mangle regex further.
  esbuildOptions(options) {
    // Two explicitly-audited, collision-free groups:
    //  (a) Private INSTANCE-FIELD name tails (pure internal state).
    //  (b) An EXPLICIT allowlist of private HELPER-METHOD names (each verified
    //      `private` and absent from the public barrel / types.ts interfaces).
    // Both groups are confined to the wrapper classes — never public API, never
    // string/bracket-accessed, never serialized off an instance, never on the
    // Safari wire. We name each method EXPLICITLY (not by verb prefix) because
    // verbs like `register*` are ALSO used by PUBLIC methods (Beacio
    // .registerServices, BackgroundSync.registerCharacteristicNotifications,
    // Peripheral.registerService) and a prefix regex would silently rename those —
    // breaking consumers (react-sdk calls them). Cross-module-consistent: the
    // injected WriteChunker `deps` object literal (emitError/validateTimeoutMs/…)
    // is built and read inside this same build, so esbuild mangles both ends to the
    // same name. reserveProps below pins the public + W3C/standard surface as a
    // belt-and-suspenders guard. Re-audit (private? in barrel? in types.ts? string
    // access? wire `type:`?) before adding any name.
    options.mangleProps =
      /Cache$|Registry$|Config$|Abort$|Listeners$|notificationStates$|Manager$|Chunker$|Gate$|Factory$|InFlightWrites$|DisconnectReason$|^(handleDisconnect|handleNotification|deriveChunkSize|deriveChunkSizeFromMtu|validateTimeoutMs|validateMaxQueueSize|normalizeMaxConnections|normalizeRequestDeviceOptions|syncNotificationState|deactivateNotificationState|deleteNotificationStateIfIdle|detachNotificationListener|registerNotificationConsumer|emitError|emitQueueOverflow|emitSubscriptionLost|teardownSubscriptions|assertConnectionCapacity|mergeOptionalServices|wrapDevice|stopNotificationsSafely)$/;
    options.reserveProps =
      /^(code|message|suggestion|isRetriable|retryAfterMs|name|stack|requestDevice|getAvailability|getDevices|referringDevice|gatt|server|service|characteristic|connect|disconnect|startNotifications|stopNotifications|getPrimaryService|getPrimaryServices|getCharacteristic|getCharacteristics|peripheral|backgroundSync|getCapabilities|readyState|visibilityState)$/;
  },
});
