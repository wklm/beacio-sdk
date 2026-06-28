import { autoDetectMode, type ParsedFlags, type ServerMode } from './modes.js';

export function parseFlags(argv: string[] = process.argv): ParsedFlags {
  let mode: ServerMode | null = null;
  let readOnly = false;
  let localOnly = false;
  const experimentalTools: string[] = [];

  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--developer') {
      if (mode === 'consumer') {
        // eslint-disable-next-line no-console
        console.error('[beacio-mcp] --developer overrides --consumer; running in developer mode');
      }
      mode = 'developer';
    } else if (arg === '--consumer') {
      if (mode === 'developer') {
        // eslint-disable-next-line no-console
        console.error('[beacio-mcp] --developer already set; ignoring --consumer');
      } else {
        mode = 'consumer';
      }
    } else if (arg === '--read-only') {
      readOnly = true;
    } else if (arg === '--local-only') {
      localOnly = true;
    } else if (arg === '-E' || arg === '--experimental-tool') {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        if (!experimentalTools.includes(next)) {
          experimentalTools.push(next);
        }
        i++;
      }
    }
  }

  return {
    mode: mode ?? autoDetectMode(),
    readOnly,
    localOnly,
    experimentalTools,
  };
}
