import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    auto: 'src/auto.ts',
    global: 'src/global.ts',
    // @beacio/core/detect subpath — folded in from the former @beacio/detect
    // package (B10-d): the iOS install-banner / onboarding surface
    // (initBeacio / showInstallBanner / removeInstallBanner / presentError).
    // Maps to dist/detect/index.{js,mjs,d.ts}.
    'detect/index': 'src/detect/index.ts',
    // @beacio/core/profiles subpath — folded in from the former @beacio/profiles
    // package (B10-1). Each maps to dist/profiles/<name>.{js,mjs,d.ts}.
    'profiles/index': 'src/profiles/index.ts',
    'profiles/heart-rate': 'src/profiles/heart-rate.ts',
    'profiles/battery': 'src/profiles/battery.ts',
    'profiles/device-info': 'src/profiles/device-info.ts',
    'profiles/nordic-uart': 'src/profiles/nordic-uart.ts',
    'profiles/serial-ffe0': 'src/profiles/serial-ffe0.ts',
    'profiles/storz-bickel': 'src/profiles/storz-bickel.ts',
    // @beacio/core/testing subpath — folded in from the former @beacio/testing
    // package (B10-t): the hardware-free mock/virtual Web Bluetooth surface
    // (installMockBluetooth / createMockBluetooth / MockBluetooth + mock GATT).
    // Powers the "playground" first-run in the campaign narrative. Maps to
    // dist/testing/index.{js,mjs,d.ts}. Pure e2e-harness bits (jest configs,
    // __tests__/) were dropped — they don't belong in core.
    'testing/index': 'src/testing/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  treeshake: true,
  // AIDEV-NOTE: B10-d folded @beacio/detect INTO this package (src/detect/). The
  // install-banner surface auto.ts pulls in via `await import('./detect')` is now
  // local code — code-split by esbuild into its own dynamic chunk so the eager
  // polyfill graph never carries the banner UI. There is no longer a detect↔core
  // cycle to guard against, so no `external` entry is needed.
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
    // .registerServices, BackgroundSync.registerCharacteristicNotifications)
    // and a prefix regex would silently rename those —
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
