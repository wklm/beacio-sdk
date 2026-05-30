import * as fs from 'node:fs';
import * as path from 'node:path';

export type ServerMode = 'consumer' | 'developer';

export interface ParsedFlags {
  mode: ServerMode;
  readOnly: boolean;
  localOnly: boolean;
  experimentalTools: string[];
}

export function autoDetectMode(): ServerMode {
  const cwd = process.cwd();
  const agentsPath = path.join(cwd, 'AGENTS.md');
  const hasAgentsMd = fs.existsSync(agentsPath) && fs.statSync(agentsPath).isFile();
  const pkgPath = path.join(cwd, 'package.json');
  let isMonorepo = false;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      isMonorepo = pkg.name === 'webble-safari-extension';
    } catch { /* not valid JSON */ }
  }
  return (hasAgentsMd && isMonorepo) ? 'developer' : 'consumer';
}
