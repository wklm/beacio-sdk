import { ToolInputError, type ToolDefinition } from '../_common.js';

export interface FindExamplesInput {
  query: string;
}

export interface ExampleMatch {
  file: string;
  line: number;
  snippet: string;
  category: string;
  relevance: number;
}

export interface FindExamplesOutput {
  matches: ExampleMatch[];
  query: string;
}

interface IndexedExample {
  file: string;
  line: number;
  snippet: string;
  category: string;
  keywords: string[];
}

const EXAMPLE_INDEX: IndexedExample[] = [
  {
    file: 'packages/core/src/webble.ts',
    line: 42,
    snippet: 'class WebBLE { requestDevice(opts) { ... } getAvailability() { ... } }',
    category: 'core',
    keywords: ['webble', 'class', 'requestDevice', 'getAvailability', 'core', 'entry point'],
  },
  {
    file: 'packages/core/src/device.ts',
    line: 1,
    snippet: 'class WebBLEDevice { connect() disconnect() read() write() subscribe() }',
    category: 'core',
    keywords: ['device', 'connect', 'disconnect', 'read', 'write', 'subscribe', 'gatt'],
  },
  {
    file: 'packages/core/src/errors.ts',
    line: 1,
    snippet: 'class WebBLEError { code: WebBLEErrorCode; suggestion: string; static from() }',
    category: 'core',
    keywords: ['error', 'webbleerror', 'code', 'suggestion', 'from', 'handle'],
  },
  {
    file: 'packages/core/src/uuids.ts',
    line: 1,
    snippet: 'resolveUUID(name) getServiceName(uuid) getCharacteristicName(uuid)',
    category: 'core',
    keywords: ['uuid', 'resolve', 'service', 'characteristic', 'name', 'lookup'],
  },
  {
    file: 'packages/profiles/src/heart-rate.ts',
    line: 1,
    snippet: 'class HeartRateProfile extends BaseProfile { onHeartRate(cb) readSensorLocation() }',
    category: 'profiles',
    keywords: ['heart rate', 'profile', 'bpm', 'sensor', 'hr', 'health'],
  },
  {
    file: 'packages/profiles/src/battery.ts',
    line: 1,
    snippet: 'class BatteryProfile extends BaseProfile { readLevel() onLevelChange(cb) }',
    category: 'profiles',
    keywords: ['battery', 'profile', 'level', 'power', 'percent'],
  },
  {
    file: 'packages/profiles/src/device-info.ts',
    line: 1,
    snippet: 'class DeviceInfoProfile extends BaseProfile { readAll() readManufacturerName() }',
    category: 'profiles',
    keywords: ['device info', 'profile', 'manufacturer', 'serial', 'firmware', 'model'],
  },
  {
    file: 'packages/profiles/src/define.ts',
    line: 1,
    snippet: 'defineProfile({ name, service, characteristics }) -> Profile class',
    category: 'profiles',
    keywords: ['defineProfile', 'custom', 'profile', 'define', 'create', 'build'],
  },
  {
    file: 'packages/react-sdk/src/provider.tsx',
    line: 1,
    snippet: 'WebBLEProvider config={{ apiKey, operatorName, autoConnect }}',
    category: 'react',
    keywords: ['react', 'provider', 'webbleprovider', 'apiKey', 'config'],
  },
  {
    file: 'packages/react-sdk/src/hooks.ts',
    line: 1,
    snippet: 'useWebBLE() useDevice() useNotifications() useBluetooth() useCharacteristic()',
    category: 'react',
    keywords: ['react', 'hooks', 'useWebBLE', 'useDevice', 'useNotifications', 'useBluetooth'],
  },
  {
    file: 'packages/detect/src/index.ts',
    line: 1,
    snippet: 'initIOSWebBLE({ key }) detectIOSWebBLE() -> { installed, version }',
    category: 'detect',
    keywords: ['detect', 'ios', 'safari', 'banner', 'initIOSWebBLE', 'install'],
  },
  {
    file: 'packages/testing/src/mock.ts',
    line: 1,
    snippet: 'createMockDevice(opts) mockNavigatorBluetooth() mockRequestDevice()',
    category: 'testing',
    keywords: ['testing', 'mock', 'fake', 'stub', 'unit test', 'jest', 'vitest'],
  },
  {
    file: 'packages/mcp/src/server.ts',
    line: 24,
    snippet: 'buildServer(opts): McpServer — registers tools with telemetry wrapper',
    category: 'mcp',
    keywords: ['mcp', 'server', 'tool', 'register', 'telemetry', 'buildserver'],
  },
  {
    file: 'packages/mcp/src/tools/install-plan.ts',
    line: 45,
    snippet: 'runInstallPlan({ framework, package_manager, include_premium? }) -> steps, snippet, token',
    category: 'mcp',
    keywords: ['install', 'plan', 'framework', 'package manager', 'mcp tool'],
  },
  {
    file: 'packages/mcp/src/tools/example.ts',
    line: 22,
    snippet: 'runExample({ profile }) -> code, html, preconditions, spec_citations',
    category: 'mcp',
    keywords: ['example', 'code', 'snippet', 'profile', 'mcp tool', 'copy-paste'],
  },
];

export function runFindExamples(input: FindExamplesInput): FindExamplesOutput {
  if (typeof input.query !== 'string' || input.query.trim().length === 0) {
    throw new ToolInputError('query must be a non-empty string');
  }

  const query = input.query.trim().toLowerCase();
  const queryTokens = query.split(/\s+/);

  const scored = EXAMPLE_INDEX.map((entry) => {
    let score = 0;
    const entryText = `${entry.file} ${entry.snippet} ${entry.keywords.join(' ')}`.toLowerCase();

    for (const token of queryTokens) {
      if (entry.keywords.some((k) => k.toLowerCase() === token)) score += 10;
      if (entry.file.toLowerCase().includes(token)) score += 5;
      if (entry.snippet.toLowerCase().includes(token)) score += 5;
      if (entry.category.toLowerCase() === token) score += 8;
      if (entryText.includes(token)) score += 2;
    }

    if (entry.file.toLowerCase() === query) score += 20;

    return { entry, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({
      file: s.entry.file,
      line: s.entry.line,
      snippet: s.entry.snippet,
      category: s.entry.category,
      relevance: s.score,
    }));

  return { matches, query: input.query.trim() };
}

export const findExamplesTool: ToolDefinition<FindExamplesInput, FindExamplesOutput> = {
  name: 'webble_dev_find_examples',
  title: 'Find code examples in the WebBLE monorepo',
  description:
    'Search a curated index of key source files in the WebBLE monorepo. Returns ranked matches with file path, line number, and category.',
  run: runFindExamples,
};
