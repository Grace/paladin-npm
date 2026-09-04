import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatRisk, scan, scanDecodedJson, summarize } from '../src/risk.js';

// Every suspicious character in this file is written as an escape, for the same
// reason risk.js does it: a test about undetectable characters should not
// contain undetectable characters.
const ZWSP = '\u200B';
const ZWJ = '\u200D';
const RLO = '\u202E';
const PDF = '\u202C';
const CYR_A = '\u0430';

describe('scan', () => {
  it('finds a zero-width space with its line and column', () => {
    const risks = scan(`hello${ZWSP}world`);
    assert.equal(risks.length, 1);
    assert.equal(risks[0].kind, 'invisible');
    assert.equal(risks[0].codePoint, 0x200b);
    assert.equal(risks[0].line, 1);
    assert.equal(risks[0].col, 6);
  });

  it('finds bidi controls, the Trojan Source class', () => {
    const risks = scan(`${RLO}reversed${PDF}`);
    assert.deepEqual(risks.map((r) => r.kind), ['bidi-control', 'bidi-control']);
  });

  it('finds Latin lookalikes from other scripts', () => {
    const risks = scan(`${CYR_A}dmin`);
    assert.equal(risks.length, 1);
    assert.equal(risks[0].kind, 'homoglyph');
  });

  it('tracks line numbers across newlines', () => {
    const risks = scan(`clean\nclean\nbad${ZWSP}`);
    assert.equal(risks[0].line, 3);
    assert.equal(risks[0].col, 4);
  });

  it('leaves ordinary text, tabs and carriage returns alone', () => {
    assert.deepEqual(scan('const x = 1;\n\tindented\r\n'), []);
  });

  it('does not flag the joiner inside a compound emoji', () => {
    // Flagging these would bury real findings under every doc with an emoji.
    assert.deepEqual(scan(`\u{1F469}${ZWJ}\u{1F4BB}`), []);
  });

  it('does flag a joiner that is not joining pictographs', () => {
    const risks = scan(`ad${ZWJ}min`);
    assert.equal(risks.length, 1);
    assert.equal(risks[0].codePoint, 0x200d);
  });

  it('flags non-printing control characters', () => {
    assert.equal(scan('a\u0001b')[0].kind, 'control');
  });

  it('catches format characters it does not name explicitly', () => {
    // U+2061 FUNCTION APPLICATION is Cf but not in the named table.
    assert.equal(scan('a\u2061b')[0].kind, 'format');
  });

  it('flags private use area characters', () => {
    assert.equal(scan('a\uE000b')[0].kind, 'private-use');
  });

  it('reports a clean file as clean', () => {
    assert.deepEqual(scan('# Title\n\nOrdinary prose.\n'), []);
  });
});

describe('summarize', () => {
  it('is empty for no risks', () => {
    assert.equal(summarize([]), '');
  });

  it('counts by kind in first-seen order', () => {
    assert.equal(summarize(scan(`${ZWSP}a${RLO}b${ZWSP}c`)), '2 invisible, 1 bidi-control');
  });
});

describe('formatRisk', () => {
  it('renders position, code point, kind and detail', () => {
    assert.equal(formatRisk(scan(`ab${ZWSP}`)[0]), '1:3  U+200B  invisible \u2014 zero-width space');
  });
});

describe('scanDecodedJson', () => {
  it('finds a character that is invisible only after parsing', () => {
    // The file is pure ASCII; the value a model receives is not.
    const raw = '{"description":"Reads the repo\\u200b and summarizes."}';
    assert.deepEqual(scan(raw), [], 'byte-level scan sees nothing');

    const decoded = scanDecodedJson(raw);
    assert.equal(decoded.length, 1);
    assert.equal(decoded[0].pointer, 'description');
    assert.equal(decoded[0].risks[0].codePoint, 0x200b);
  });

  it('checks object keys as well as values', () => {
    const decoded = scanDecodedJson('{"\\u0430dmin":"ok"}');
    assert.equal(decoded.length, 1);
    assert.match(decoded[0].pointer, /\(key\)$/);
  });

  it('walks nested objects and arrays', () => {
    const decoded = scanDecodedJson('{"a":{"b":["x","y\\u202e"]}}');
    assert.equal(decoded[0].pointer, 'a.b[1]');
  });

  it('returns nothing for a file that is not JSON', () => {
    assert.deepEqual(scanDecodedJson('# Not JSON\n'), []);
  });

  it('returns nothing for clean JSON', () => {
    assert.deepEqual(scanDecodedJson('{"name":"ok","deps":[]}'), []);
  });
});
