/**
 * Canonical first-party URLs for the beacio platform.
 *
 * Single source of truth so independent packages (detect's install banner, the
 * react-sdk InstallationWizard) cannot re-diverge onto stale hosts/paths. Lives
 * in @beacio/core because both @beacio/detect and @beacio/react depend on core
 * (core depends on nothing) — importing from here introduces no dependency cycle.
 */

/**
 * The guided zero-config onboarding page: install → enable the Safari extension
 * → return. The default destination when no operator-supplied onboarding/App
 * Store URL override is provided. Authoritative host + path per
 * outreach/campaign/11-rebrand-manifest.md.
 */
export const SETUP_URL = 'https://beacio.com/setup';
