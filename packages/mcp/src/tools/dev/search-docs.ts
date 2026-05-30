import { ToolInputError, type ToolDefinition } from '../_common.js';

export interface SearchDocsInput {
  query: string;
}

export interface SearchDocsResult {
  topic: string;
  url: string;
  snippet: string;
  relevance: number;
}

export interface SearchDocsOutput {
  results: SearchDocsResult[];
  query: string;
}

interface DocEntry {
  topic: string;
  url: string;
  snippet: string;
  keywords: string[];
}

const DOC_INDEX: DocEntry[] = [
  {
    topic: 'Quick Start',
    url: 'https://ioswebble.com/docs/quickstart',
    snippet: 'Install @ios-web-bluetooth/core and add the polyfill to your web app. Works on iOS Safari with the WebBLE extension.',
    keywords: ['quickstart', 'install', 'setup', 'getting started', 'polyfill', 'auto', 'import'],
  },
  {
    topic: 'API Reference — WebBLE class',
    url: 'https://ioswebble.com/docs/api#webble',
    snippet: 'The WebBLE class provides requestDevice, getAvailability, and platform detection. Entry point for all BLE operations.',
    keywords: ['api', 'webble', 'class', 'requestDevice', 'getAvailability', 'platform', 'reference'],
  },
  {
    topic: 'API Reference — WebBLEDevice class',
    url: 'https://ioswebble.com/docs/api#webble-device',
    snippet: 'WebBLEDevice wraps BluetoothDevice with connect, disconnect, read, write, subscribe, and notifications methods.',
    keywords: ['api', 'device', 'connect', 'disconnect', 'read', 'write', 'subscribe', 'notifications', 'gatt'],
  },
  {
    topic: 'API Reference — WebBLEError',
    url: 'https://ioswebble.com/docs/api#webble-error',
    snippet: 'WebBLEError provides typed error codes (DEVICE_NOT_FOUND, GATT_OPERATION_FAILED, etc.) with recovery suggestions.',
    keywords: ['api', 'error', 'webbleerror', 'code', 'suggestion', 'handle', 'catch'],
  },
  {
    topic: 'React SDK',
    url: 'https://ioswebble.com/docs/react',
    snippet: '@ios-web-bluetooth/react provides WebBLEProvider, useWebBLE, useDevice, useNotifications hooks, and ready-made UI components.',
    keywords: ['react', 'hooks', 'provider', 'useWebBLE', 'useDevice', 'useNotifications', 'component', 'jsx', 'tsx'],
  },
  {
    topic: 'Typed Profiles',
    url: 'https://ioswebble.com/docs/profiles',
    snippet: '@ios-web-bluetooth/profiles ships HeartRateProfile, BatteryProfile, DeviceInfoProfile plus defineProfile for custom BLE profiles.',
    keywords: ['profiles', 'heart rate', 'battery', 'device info', 'defineProfile', 'typed', 'parsing', 'hr', 'bpm'],
  },
  {
    topic: 'iOS Detection & Install Banner',
    url: 'https://ioswebble.com/docs/detect',
    snippet: '@ios-web-bluetooth/detect adds an automatic install banner on iOS Safari when the WebBLE extension is not installed.',
    keywords: ['detect', 'ios', 'safari', 'banner', 'install', 'extension', 'initIOSWebBLE', 'window.webbleIOS'],
  },
  {
    topic: 'Error Codes & Troubleshooting',
    url: 'https://ioswebble.com/docs/errors',
    snippet: 'Complete reference of WebBLEError codes: BLUETOOTH_UNAVAILABLE, EXTENSION_NOT_INSTALLED, DEVICE_NOT_FOUND, and more with fixes.',
    keywords: ['errors', 'troubleshoot', 'debug', 'fix', 'not working', 'disconnect', 'permission', 'timeout'],
  },
  {
    topic: 'User Gesture Requirement',
    url: 'https://ioswebble.com/docs/quickstart#user-gesture',
    snippet: 'requestDevice() MUST be called from a user gesture (click/tap). Never call it from useEffect, setTimeout, or page load on iOS Safari.',
    keywords: ['gesture', 'click', 'tap', 'user', 'securityerror', 'useEffect', 'page load', 'button'],
  },
  {
    topic: 'Testing with Mocks',
    url: 'https://ioswebble.com/docs/testing',
    snippet: '@ios-web-bluetooth/testing provides mock BLE devices, mock navigator.bluetooth, and helpers for unit/integration testing.',
    keywords: ['testing', 'mock', 'unit test', 'integration', 'jest', 'vitest', 'fake', 'stub'],
  },
];

export function runSearchDocs(input: SearchDocsInput): SearchDocsOutput {
  if (typeof input.query !== 'string' || input.query.trim().length === 0) {
    throw new ToolInputError('query must be a non-empty string');
  }

  const query = input.query.trim().toLowerCase();
  const queryTokens = query.split(/\s+/);

  const scored = DOC_INDEX.map((entry) => {
    let score = 0;
    const entryText = `${entry.topic} ${entry.snippet} ${entry.keywords.join(' ')}`.toLowerCase();

    for (const token of queryTokens) {
      if (entry.topic.toLowerCase().includes(token)) score += 10;
      if (entry.keywords.some((k) => k.toLowerCase() === token)) score += 8;
      if (entryText.includes(token)) score += 3;
    }

    if (entry.topic.toLowerCase() === query) score += 20;
    if (entryText === query) score += 15;

    return { entry, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({
      topic: s.entry.topic,
      url: s.entry.url,
      snippet: s.entry.snippet,
      relevance: s.score,
    }));

  return { results, query: input.query.trim() };
}

export const searchDocsTool: ToolDefinition<SearchDocsInput, SearchDocsOutput> = {
  name: 'webble_dev_search_docs',
  title: 'Search WebBLE documentation by keyword',
  description:
    'Search the WebBLE documentation index for topics matching a query string. Returns ranked results with URLs to ioswebble.com docs.',
  run: runSearchDocs,
};
