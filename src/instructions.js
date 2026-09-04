// Which paths inside a package tarball are read as instructions by an agent.
//
// This is deliberately not a port of paladin's instructionFile(): that one
// matches paths on a developer's disk. Inside a tarball everything sits under
// "package/", and the interesting names are the ones a package can *ship* into
// a repository it is installed into.

const INSTRUCTION_NAMES = new Map([
  ['agents.md', 'agent instructions'],
  ['agent.md', 'agent instructions'],
  ['claude.md', 'agent instructions'],
  ['gemini.md', 'agent instructions'],
  ['memory.md', 'agent instructions'],
  ['skill.md', 'agent skill'],
  ['.cursorrules', 'agent instructions'],
  ['.windsurfrules', 'agent instructions'],
  ['.clinerules', 'agent instructions'],
  ['copilot-instructions.md', 'agent instructions'],
  ['mcp.json', 'MCP server manifest'],
  ['.mcp.json', 'MCP server manifest'],
]);

// Names that live beside instruction files but are never read as instructions.
// Watching them buries the signal under every package's README.
const DOCUMENTATION = new Set([
  'readme.md', 'changelog.md', 'contributing.md', 'license.md', 'license',
  'code_of_conduct.md', 'security.md', 'history.md', 'authors.md',
]);

// Directories whose markdown/config content is agent-facing by convention.
const AGENT_DIRS = [
  '.claude/', '.codex/', '.cursor/rules', '.config/opencode',
  '.github/instructions/', '.github/prompts/', '.github/chatmodes/',
  '.agents/', '.opencode/',
];

const AGENT_DIR_EXTS = ['.md', '.json', '.yaml', '.yml', '.toml'];

/** Strip the leading "package/" that npm puts on every tarball entry. */
export function normalizeEntryPath(entryPath) {
  const p = entryPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return p.startsWith('package/') ? p.slice('package/'.length) : p;
}

/**
 * Classify one tarball path.
 * @returns {{kind: string} | null} null when the path is not agent-facing.
 */
export function classify(entryPath) {
  const path = normalizeEntryPath(entryPath);
  const base = (path.split('/').pop() ?? '').toLowerCase();
  const lower = path.toLowerCase();

  if (DOCUMENTATION.has(base)) return null;

  // An MCP manifest under any name, e.g. "servers/github.mcp.json".
  if (base.endsWith('.mcp.json')) return { kind: 'MCP server manifest' };

  const named = INSTRUCTION_NAMES.get(base);
  if (named) return { kind: named };

  for (const dir of AGENT_DIRS) {
    if (lower.startsWith(dir) || lower.includes(`/${dir}`)) {
      if (AGENT_DIR_EXTS.some((ext) => lower.endsWith(ext))) {
        return { kind: 'agent configuration' };
      }
    }
  }

  return null;
}

/** Lifecycle scripts that run code on the installing machine. */
export const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];
