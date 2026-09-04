// Registry access. Everything here fetches; nothing here executes.
//
// pacote is npm's own package fetcher, so a tarball is resolved exactly the
// way `npm install` would resolve it -- but tarball() only downloads and
// streams bytes. No lifecycle script ever runs, and nothing is written to a
// location npm would run one from.

import { Readable } from 'node:stream';
import npa from 'npm-package-arg';
import pacote from 'pacote';
import { Parser } from 'tar';

const REGISTRY = 'https://registry.npmjs.org';

/** Parse a package spec the way npm does, so "@scope/x@next" works. */
export function parseSpec(spec) {
  return npa(spec);
}

export async function manifest(spec) {
  return pacote.manifest(spec, { fullMetadata: true });
}

export async function tarball(spec) {
  return pacote.tarball(spec);
}

/**
 * Read selected entries out of a tarball buffer, in memory.
 * Entries the caller does not want are drained rather than buffered, so a
 * large package costs little more than its metadata.
 *
 * @param {Buffer} buf
 * @param {(path: string) => boolean} wanted
 * @returns {Promise<{path: string, size: number, content: string}[]>}
 */
export function readEntries(buf, wanted) {
  return new Promise((resolve, reject) => {
    const found = [];
    const parser = new Parser({
      onReadEntry(entry) {
        if (entry.type !== 'File' || !wanted(entry.path)) {
          entry.resume();
          return;
        }
        const chunks = [];
        entry.on('data', (c) => chunks.push(c));
        entry.on('end', () => {
          const content = Buffer.concat(chunks);
          found.push({ path: entry.path, size: content.length, content: content.toString('utf8') });
        });
      },
    });

    parser.on('end', () => resolve(found));
    parser.on('error', reject);
    Readable.from(buf).pipe(parser);
  });
}

/**
 * Look up a published provenance attestation.
 * A 404 means the package has none, which is a finding rather than an error.
 */
export async function attestation(name, version) {
  const url = `${REGISTRY}/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { attested: false, reason: `registry unreachable: ${err.message}` };
  }

  if (res.status === 404) return { attested: false, reason: 'no attestation published' };
  if (!res.ok) return { attested: false, reason: `registry returned ${res.status}` };

  const body = await res.json();
  const bundles = body?.attestations ?? [];
  if (bundles.length === 0) return { attested: false, reason: 'no attestation published' };

  const predicates = bundles.map((a) => a.predicateType).filter(Boolean);
  return { attested: true, predicateTypes: predicates };
}
