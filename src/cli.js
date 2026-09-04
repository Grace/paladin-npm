#!/usr/bin/env node
// paladin -- audit an npm package before you install it.
//
// Exit codes mirror the Go tool so muscle memory carries over:
//   0 clean   1 hooks or instruction files present   2 hidden characters   3 error

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { audit } from './audit.js';
import { formatRisk, summarize } from './risk.js';

const USAGE = `paladin — audit an npm package before you install it

usage: paladin <package-spec> [flags]

flags:
  --json             machine-readable output
  --ignore-scripts   skip the install-hook check
  --quiet            findings only, no clean lines
  -h, --help         this message

exit codes:
  0  clean     1  hooks or instructions present     2  hidden characters     3  error
`;

const LABEL_WIDTH = 15;

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function row(label, value) {
  return `  ${label.padEnd(LABEL_WIDTH)}${value}`;
}

function render(result, { quiet }) {
  const lines = [];
  const { provenance, hooks, mismatches, instructions, counts } = result;

  lines.push('');
  lines.push(`  ${result.resolved.name}@${result.resolved.version}`);
  lines.push('');

  if (provenance.attested) {
    if (!quiet) lines.push(row('provenance', 'verified — signed attestation published'));
  } else {
    lines.push(row('provenance', `none — ${provenance.reason}, publisher unverifiable`));
  }

  if (hooks.length === 0) {
    if (!quiet) lines.push(row('install hooks', 'none'));
  } else {
    hooks.forEach((h, i) => {
      lines.push(row(i === 0 ? 'install hooks' : '', `${h.stage}: ${h.command}`));
    });
  }

  for (const m of mismatches) {
    lines.push(row('', `! ${m.stage} differs between registry and tarball`));
    lines.push(row('', `    registry: ${m.registry}`));
    lines.push(row('', `    tarball:  ${m.tarball}`));
  }

  if (instructions.length === 0) {
    if (!quiet) lines.push(row('instructions', 'none'));
  } else {
    instructions.forEach((f, i) => {
      lines.push(row(i === 0 ? 'instructions' : '', `${f.path} (${humanSize(f.size)}) — ${f.kind}`));
    });
  }

  const risky = instructions.filter((f) => f.risks.length > 0 || f.decoded.length > 0);
  if (risky.length === 0) {
    if (!quiet) lines.push(row('hidden chars', 'none'));
  } else {
    // The label belongs on the first emitted line, whichever kind it is.
    let labelled = false;
    const emit = (text) => {
      lines.push(row(labelled ? '' : 'hidden chars', text));
      labelled = true;
    };

    for (const f of risky) {
      if (f.risks.length > 0) {
        emit(`${f.path} — ${summarize(f.risks)}`);
        for (const r of f.risks.slice(0, 5)) {
          lines.push(row('', `  ${formatRisk(r)}`));
        }
        if (f.risks.length > 5) {
          lines.push(row('', `  ...and ${f.risks.length - 5} more`));
        }
      }
      for (const d of f.decoded) {
        emit(`${f.path} → ${d.pointer} — ${summarize(d.risks)} (JSON-escaped)`);
        for (const r of d.risks.slice(0, 3)) {
          lines.push(row('', `  ${formatRisk(r)}`));
        }
      }
    }
  }

  lines.push('');
  lines.push(counts.findings === 0 ? '  clean' : `  ${counts.findings} finding${counts.findings === 1 ? '' : 's'}`);
  lines.push('');
  return lines.join('\n');
}

function exitCode(result) {
  if (result.counts.risks > 0) return 2;
  if (result.counts.findings > 0) return 1;
  return 0;
}

export async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('-')));
  const specs = argv.filter((a) => !a.startsWith('-'));

  if (flags.has('-h') || flags.has('--help') || specs.length === 0) {
    process.stdout.write(USAGE);
    return specs.length === 0 && !flags.has('-h') && !flags.has('--help') ? 3 : 0;
  }

  try {
    const result = await audit(specs[0], { ignoreScripts: flags.has('--ignore-scripts') });
    if (flags.has('--json')) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${render(result, { quiet: flags.has('--quiet') })}\n`);
    }
    return exitCode(result);
  } catch (err) {
    process.stderr.write(`paladin: ${err.message}\n`);
    return 3;
  }
}

// npm installs the bin as a symlink named "paladin", so comparing basenames
// would not match. Resolve both sides to a real path instead.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = await main(process.argv.slice(2));
}
