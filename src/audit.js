// Orchestration. Returns a plain object; all formatting lives in the CLI, so
// --json is free and the audit stays importable as a library.

import { attestation, manifest, parseSpec, readEntries, tarball } from './fetch.js';
import { INSTALL_HOOKS, classify, normalizeEntryPath } from './instructions.js';
import { scan, scanDecodedJson } from './risk.js';

function hooksFrom(scripts = {}) {
  const out = new Map();
  for (const stage of INSTALL_HOOKS) {
    if (typeof scripts[stage] === 'string' && scripts[stage].trim() !== '') {
      out.set(stage, scripts[stage]);
    }
  }
  return out;
}

/**
 * Audit a package without executing any part of it.
 * @param {string} spec e.g. "react", "some-server@0.4.2", "@scope/x@next"
 */
export async function audit(spec, { ignoreScripts = false } = {}) {
  const parsed = parseSpec(spec);
  const meta = await manifest(spec);
  const buf = await tarball(spec);

  const entries = await readEntries(buf, (p) => {
    const norm = normalizeEntryPath(p);
    return norm === 'package.json' || classify(p) !== null;
  });

  // The registry manifest and the package.json inside the tarball can
  // disagree. A disagreement about install hooks is itself worth reporting.
  let tarballScripts = {};
  const pkgEntry = entries.find((e) => normalizeEntryPath(e.path) === 'package.json');
  if (pkgEntry) {
    try {
      tarballScripts = JSON.parse(pkgEntry.content).scripts ?? {};
    } catch {
      tarballScripts = {};
    }
  }

  const fromManifest = hooksFrom(meta.scripts);
  const fromTarball = hooksFrom(tarballScripts);

  const hooks = [];
  const mismatches = [];
  if (!ignoreScripts) {
    for (const stage of INSTALL_HOOKS) {
      const a = fromManifest.get(stage);
      const b = fromTarball.get(stage);
      if (!a && !b) continue;
      hooks.push({ stage, command: b ?? a, source: a && b ? (a === b ? 'both' : 'differs') : a ? 'registry' : 'tarball' });
      if (a && b && a !== b) mismatches.push({ stage, registry: a, tarball: b });
    }
  }

  const instructions = entries
    .filter((e) => classify(e.path) !== null)
    .map((e) => ({
      path: normalizeEntryPath(e.path),
      kind: classify(e.path).kind,
      size: e.size,
      risks: scan(e.content),
      decoded: e.path.toLowerCase().endsWith('.json') ? scanDecodedJson(e.content) : [],
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const riskCount = instructions.reduce(
    (n, f) => n + f.risks.length + f.decoded.reduce((m, d) => m + d.risks.length, 0),
    0,
  );

  return {
    spec,
    resolved: {
      name: meta.name,
      version: meta.version,
      type: parsed.type,
      integrity: meta._integrity ?? meta.dist?.integrity ?? null,
      tarball: meta._resolved ?? meta.dist?.tarball ?? null,
    },
    provenance: await attestation(meta.name, meta.version),
    hooks,
    mismatches,
    instructions,
    counts: {
      hooks: hooks.length,
      instructions: instructions.length,
      risks: riskCount,
      findings: hooks.length + instructions.length + mismatches.length,
    },
  };
}
