import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolDefinition } from '../_common.js';

export interface ListStructureInput {
  rootPath?: string;
  depth?: number;
  gitignore?: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export interface ListStructureOutput {
  tree: TreeNode;
  root_path: string;
  depth: number;
  file_count: number;
  dir_count: number;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'DerivedData', '.next', 'build', '__pycache__']);

function loadGitignore(dir: string): string[] {
  const patterns: string[] = [];
  const giPath = path.join(dir, '.gitignore');
  if (fs.existsSync(giPath)) {
    try {
      const lines = fs.readFileSync(giPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          patterns.push(trimmed);
        }
      }
    } catch { /* skip */ }
  }
  return patterns;
}

function matchesGitignore(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === name) return true;
    if (pattern.startsWith('*') && name.endsWith(pattern.slice(1))) return true;
    if (pattern.endsWith('/') && pattern.slice(0, -1) === name) return true;
  }
  return false;
}

function buildTree(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  gitignorePatterns: string[],
): { node: TreeNode; fileCount: number; dirCount: number } {
  const name = path.basename(dirPath);
  const node: TreeNode = {
    name,
    path: dirPath,
    type: 'directory',
    children: [],
  };
  let fileCount = 0;
  let dirCount = 0;

  if (currentDepth >= maxDepth) {
    return { node: { ...node, children: undefined }, fileCount: 0, dirCount: 0 };
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return { node: { ...node, children: undefined }, fileCount: 0, dirCount: 0 };
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') {
      if (entry.name === '.gitignore' && currentDepth === 0) continue;
      continue;
    }
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    if (gitignorePatterns.length > 0 && matchesGitignore(entry.name, gitignorePatterns)) continue;

    if (entry.isDirectory()) {
      const result = buildTree(
        path.join(dirPath, entry.name),
        currentDepth + 1,
        maxDepth,
        gitignorePatterns,
      );
      node.children!.push(result.node);
      dirCount += 1 + result.dirCount;
      fileCount += result.fileCount;
    } else {
      node.children!.push({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: 'file',
      });
      fileCount++;
    }
  }

  return { node, fileCount, dirCount };
}

export function runListStructure(input: ListStructureInput = {}): ListStructureOutput {
  const depth = typeof input.depth === 'number' && input.depth >= 1 && input.depth <= 4
    ? Math.trunc(input.depth)
    : 3;
  const rootPath = input.rootPath && typeof input.rootPath === 'string'
    ? path.resolve(input.rootPath)
    : process.cwd();
  const useGitignore = input.gitignore === true;

  if (!fs.existsSync(rootPath)) {
    throw new Error(`Path does not exist: ${rootPath}`);
  }

  const cwd = fs.realpathSync(process.cwd());
  const resolved = fs.realpathSync(rootPath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new Error('rootPath must be within the current working directory');
  }

  const gitignorePatterns = useGitignore ? loadGitignore(rootPath) : [];
  const { node, fileCount, dirCount } = buildTree(rootPath, 0, depth, gitignorePatterns);

  return {
    tree: node,
    root_path: rootPath,
    depth,
    file_count: fileCount,
    dir_count: dirCount,
  };
}

export const listStructureTool: ToolDefinition<ListStructureInput, ListStructureOutput> = {
  name: 'beacio_dev_list_structure',
  title: 'List monorepo directory structure',
  description:
    'Build a tree view of the Beacio monorepo directory structure. Optional root path, depth (1-4, default 3), and gitignore support.',
  run: runListStructure,
};
