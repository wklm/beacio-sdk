/**
 * Auto-initialization for Beacio.
 *
 * Import this module to automatically detect and handle the extension:
 *   import '@beacio/detect/auto'
 *
 * Reads the API key from:
 *   1. <meta name="beacio-key" content="wbl_xxxxx">
 *   2. window.__BEACIO_KEY__
 */

import { initBeacio } from './index';

function getApiKey(): string | null {
  // Check meta tag
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="beacio-key"]');
    if (meta) {
      return meta.getAttribute('content');
    }
  }

  // Check global variable
  if (typeof window !== 'undefined' && (window as any).__BEACIO_KEY__) {
    return (window as any).__BEACIO_KEY__;
  }

  return null;
}

function getOperatorName(): string | undefined {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="beacio-name"]');
    if (meta) return meta.getAttribute('content') ?? undefined;
  }
  if (typeof window !== 'undefined' && (window as any).__BEACIO_NAME__) {
    return (window as any).__BEACIO_NAME__;
  }
  return undefined;
}

const key = getApiKey();
initBeacio({ key: key ?? undefined, operatorName: getOperatorName() });
