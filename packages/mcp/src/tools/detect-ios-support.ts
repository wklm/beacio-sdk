import detectData from '../data/detect.json' with { type: 'json' };
import { docsUrl, type ToolDefinition } from './_common.js';

export interface DetectIOSSupportInput {}

export interface DetectIOSSupportOutput {
  detection_snippet: string;
  global_name: 'window.beacioIOS';
  notes: string[];
  source_url: string;
}

const DATA = detectData as {
  detection_snippet: string;
  global_name: 'window.beacioIOS';
  notes: string[];
};

export function runDetectIOSSupport(_input: DetectIOSSupportInput = {}): DetectIOSSupportOutput {
  return {
    detection_snippet: DATA.detection_snippet,
    global_name: DATA.global_name,
    notes: DATA.notes,
    source_url: docsUrl('/is-web-bluetooth-supported-in-safari.md'),
  };
}

export const detectIOSSupportTool: ToolDefinition<DetectIOSSupportInput, DetectIOSSupportOutput> = {
  name: 'beacio_detect_ios_support',
  title: 'Detect Beacio support on iOS Safari',
  description:
    'Return a runtime detection snippet for navigator.bluetooth and window.beacioIOS, plus notes covering every way the detection can go wrong on iPhone Safari.',
  run: runDetectIOSSupport,
};
