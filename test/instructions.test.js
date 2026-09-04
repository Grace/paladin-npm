import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classify, normalizeEntryPath } from '../src/instructions.js';

const kindOf = (p) => classify(p)?.kind ?? null;

describe('normalizeEntryPath', () => {
  it('strips the leading package/ npm puts on tarball entries', () => {
    assert.equal(normalizeEntryPath('package/AGENTS.md'), 'AGENTS.md');
  });

  it('leaves an already-bare path alone', () => {
    assert.equal(normalizeEntryPath('AGENTS.md'), 'AGENTS.md');
  });
});

describe('classify', () => {
  it('recognizes agent instruction files a package can ship', () => {
    assert.equal(kindOf('package/AGENTS.md'), 'agent instructions');
    assert.equal(kindOf('package/CLAUDE.md'), 'agent instructions');
    assert.equal(kindOf('package/.cursorrules'), 'agent instructions');
    assert.equal(kindOf('package/.clinerules'), 'agent instructions');
  });

  it('recognizes MCP manifests under any name', () => {
    assert.equal(kindOf('package/.mcp.json'), 'MCP server manifest');
    assert.equal(kindOf('package/servers/github.mcp.json'), 'MCP server manifest');
  });

  it('recognizes skills and agent config directories', () => {
    assert.equal(kindOf('package/skills/review/SKILL.md'), 'agent skill');
    assert.equal(kindOf('package/.claude/settings.json'), 'agent configuration');
    assert.equal(kindOf('package/.github/instructions/style.md'), 'agent configuration');
  });

  it('is case-insensitive on the basename', () => {
    assert.equal(kindOf('package/agents.md'), 'agent instructions');
  });

  it('ignores documentation that lives beside instructions', () => {
    assert.equal(kindOf('package/README.md'), null);
    assert.equal(kindOf('package/CHANGELOG.md'), null);
    assert.equal(kindOf('package/SECURITY.md'), null);
    assert.equal(kindOf('package/LICENSE'), null);
  });

  it('ignores ordinary source and config', () => {
    assert.equal(kindOf('package/index.js'), null);
    assert.equal(kindOf('package/package.json'), null);
    assert.equal(kindOf('package/src/deep/module.ts'), null);
    assert.equal(kindOf('package/.github/workflows/ci.yml'), null);
  });
});
