import specData from '../data/spec.json' with { type: 'json' };
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';

export interface SpecCitationInput {
  method: string;
}

export interface SpecCitationOutput {
  spec_url: string;
  summary: string;
  caveats: string[];
  source_url: string;
}

type SpecFile = {
  spec_base_url: string;
  methods: Record<string, { fragment: string; summary: string; caveats: string[] }>;
};

const DATA = specData as SpecFile;

// Anchor hash in api-reference.md is the method name lowercased with dots/dashes normalised.
function apiRefAnchor(method: string): string {
  return method.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function runSpecCitation(input: SpecCitationInput): SpecCitationOutput {
  if (typeof input.method !== 'string' || input.method.trim() === '') {
    throw new ToolInputError('method must be a non-empty string');
  }
  const entry = DATA.methods[input.method];
  if (!entry) {
    const known = Object.keys(DATA.methods).join(', ');
    throw new ToolInputError(
      `unknown method "${input.method}". Supported: ${known}`,
    );
  }
  return {
    spec_url: `${DATA.spec_base_url}${entry.fragment}`,
    summary: entry.summary,
    caveats: entry.caveats,
    source_url: docsUrl('/api-reference.md', apiRefAnchor(input.method)),
  };
}

export const specCitationTool: ToolDefinition<SpecCitationInput, SpecCitationOutput> = {
  name: 'webble_spec_citation',
  title: 'WebBluetooth spec citation',
  description:
    'Return the W3C Web Bluetooth spec URL, a one-paragraph summary, and implementation caveats for a specific method (e.g. navigator.bluetooth.requestDevice).',
  run: runSpecCitation,
};

export const SUPPORTED_METHODS = Object.keys(DATA.methods);
