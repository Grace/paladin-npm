import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import { create } from 'tar';

import { audit } from '../src/audit.js';

// Built from the fixture sources at run time, so no binary lives in the repo
// and the tarball layout is exactly what npm produces: everything under
// "package/". Resolving a local file spec keeps this test off the network.
const fixtureSrc = path.join(import.meta.dirname, 'fixtures', 'src');

describe('audit', () => {
  let result;

  before(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'paladin-'));
    const tgz = path.join(dir, 'demo-mcp-server-0.4.2.tgz');
    await create({ gzip: true, file: tgz, cwd: fixtureSrc, prefix: 'package' }, ['.']);
    result = await audit(tgz);
  });

  it('resolves the package without executing it', () => {
    assert.equal(result.resolved.name, 'demo-mcp-server');
    assert.equal(result.resolved.version, '0.4.2');
  });

  it('reports the install hook', () => {
    assert.equal(result.hooks.length, 1);
    assert.equal(result.hooks[0].stage, 'postinstall');
    assert.match(result.hooks[0].command, /setup\.js/);
  });

  it('reports the shipped instruction files and not the README', () => {
    const paths = result.instructions.map((f) => f.path);
    assert.deepEqual(paths, ['.mcp.json', 'AGENTS.md']);
  });

  it('labels the MCP manifest as one', () => {
    const mcp = result.instructions.find((f) => f.path === '.mcp.json');
    assert.equal(mcp.kind, 'MCP server manifest');
  });

  it('finds the hidden characters in the instruction file', () => {
    const agents = result.instructions.find((f) => f.path === 'AGENTS.md');
    const kinds = new Set(agents.risks.map((r) => r.kind));
    assert.ok(kinds.has('invisible'));
    assert.ok(kinds.has('bidi-control'));
    assert.ok(kinds.has('homoglyph'));
  });

  it('finds the character hidden behind a JSON escape', () => {
    const mcp = result.instructions.find((f) => f.path === '.mcp.json');
    assert.deepEqual(mcp.risks, [], 'nothing at the byte level');
    assert.equal(mcp.decoded.length, 1);
    assert.equal(mcp.decoded[0].pointer, 'mcpServers.demo.description');
  });

  it('reports no provenance for an unsigned package', () => {
    assert.equal(result.provenance.attested, false);
  });

  it('counts decoded risks toward the total', () => {
    const raw = result.instructions.reduce((n, f) => n + f.risks.length, 0);
    assert.ok(result.counts.risks > raw, 'JSON-escaped findings must count');
  });
});
