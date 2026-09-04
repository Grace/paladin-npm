// Port of paladin's risk.go scanner.
//
// Hashing tells you a file changed. It cannot tell you that the change you
// made yourself carries something you could not see. That is the gap this
// fills: an agent reads every byte, and a reviewer reads only the ones their
// font chooses to draw.

// Invisible characters render as nothing but are read by a model.
//
// Written as escapes on purpose: a file about undetectable characters should
// not contain undetectable characters.
const INVISIBLE = new Map([
  ['\u200B', 'zero-width space'],
  ['\u200C', 'zero-width non-joiner'],
  ['\u200D', 'zero-width joiner'],
  ['\u2060', 'word joiner'],
  ['\uFEFF', 'zero-width no-break space (BOM)'],
  ['\u00AD', 'soft hyphen'],
  ['\u034F', 'combining grapheme joiner'],
  ['\u180E', 'Mongolian vowel separator'],
]);

// Bidirectional controls reorder rendered text so what a reviewer reads is not
// what the file says. This is the Trojan Source class of attack.
const BIDI = new Map([
  ['\u202A', 'left-to-right embedding'],
  ['\u202B', 'right-to-left embedding'],
  ['\u202C', 'pop directional formatting'],
  ['\u202D', 'left-to-right override'],
  ['\u202E', 'right-to-left override'],
  ['\u2066', 'left-to-right isolate'],
  ['\u2067', 'right-to-left isolate'],
  ['\u2068', 'first strong isolate'],
  ['\u2069', 'pop directional isolate'],
]);

// Latin lookalikes from other scripts. A rule naming "admin" with a Cyrillic a
// is a different string to every matcher and the same string to a human.
const HOMOGLYPHS = new Map([
  ['\u0410', 'Cyrillic А (looks like Latin A)'],
  ['\u0412', 'Cyrillic В (looks like Latin B)'],
  ['\u0415', 'Cyrillic Е (looks like Latin E)'],
  ['\u041A', 'Cyrillic К (looks like Latin K)'],
  ['\u041C', 'Cyrillic М (looks like Latin M)'],
  ['\u041D', 'Cyrillic Н (looks like Latin H)'],
  ['\u041E', 'Cyrillic О (looks like Latin O)'],
  ['\u0420', 'Cyrillic Р (looks like Latin P)'],
  ['\u0421', 'Cyrillic С (looks like Latin C)'],
  ['\u0422', 'Cyrillic Т (looks like Latin T)'],
  ['\u0430', 'Cyrillic а (looks like Latin a)'],
  ['\u0435', 'Cyrillic е (looks like Latin e)'],
  ['\u043E', 'Cyrillic о (looks like Latin o)'],
  ['\u0440', 'Cyrillic р (looks like Latin p)'],
  ['\u0441', 'Cyrillic с (looks like Latin c)'],
  ['\u0445', 'Cyrillic х (looks like Latin x)'],
  ['\u0391', 'Greek Α (looks like Latin A)'],
  ['\u0392', 'Greek Β (looks like Latin B)'],
  ['\u039F', 'Greek Ο (looks like Latin O)'],
  ['\u03A1', 'Greek Ρ (looks like Latin P)'],
  ['\u0405', 'Cyrillic Ѕ (looks like Latin S)'],
  ['\u0456', 'Cyrillic і (looks like Latin i)'],
  ['\u0458', 'Cyrillic ј (looks like Latin j)'],
]);

const FORMAT = /\p{Cf}/u;
const PRIVATE_USE = /\p{Co}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

// pictographic mirrors the Go implementation: emoji proper, plus the variation
// selectors and gender signs that appear inside emoji sequences.
function pictographic(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0xfe0f || cp === 0xfe0e) return true;
  if (cp >= 0x2640 && cp <= 0x2642) return true;
  return PICTOGRAPHIC.test(ch);
}

// joinsEmoji reports whether the joiner at i sits between two pictographic
// characters, which is a legitimate emoji sequence rather than concealed text.
// Flagging those buries real findings under every document containing an emoji.
function joinsEmoji(chars, i) {
  if (i === 0 || i + 1 >= chars.length) return false;
  return pictographic(chars[i - 1]) && pictographic(chars[i + 1]);
}

/**
 * Report every character a reader would not see, or would see as something else.
 * Tabs, newlines and ordinary printable text are left alone; the goal is a
 * short, actionable list, not a lecture about encoding.
 *
 * @param {string} content
 * @returns {{line: number, col: number, codePoint: number, kind: string, detail: string}[]}
 */
export function scan(content) {
  const out = [];
  const chars = [...content];
  let line = 1;
  let col = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    col++;

    if (ch === '\n') {
      line++;
      col = 0;
      continue;
    }
    if (ch === '\u200D' && joinsEmoji(chars, i)) continue;

    const codePoint = ch.codePointAt(0);
    const add = (kind, detail) => out.push({ line, col, codePoint, kind, detail });

    if (INVISIBLE.has(ch)) add('invisible', INVISIBLE.get(ch));
    else if (BIDI.has(ch)) add('bidi-control', BIDI.get(ch));
    else if (HOMOGLYPHS.has(ch)) add('homoglyph', HOMOGLYPHS.get(ch));
    else if (ch === '\t' || ch === '\r') continue; // ordinary whitespace
    else if (codePoint < 0x20 || codePoint === 0x7f) add('control', 'non-printing control character');
    else if (FORMAT.test(ch)) add('format', 'Unicode format character');
    else if (PRIVATE_USE.test(ch)) add('private-use', 'private use area character');
  }

  return out;
}

/** Render one risk the way the Go tool does: "14:62  U+200B  invisible — ..." */
export function formatRisk(risk) {
  const cp = risk.codePoint.toString(16).toUpperCase().padStart(4, '0');
  return `${risk.line}:${risk.col}  U+${cp}  ${risk.kind} — ${risk.detail}`;
}

/** Collapse risks into a one-line count by kind, in first-seen order. */
export function summarize(risks) {
  if (risks.length === 0) return '';
  const counts = new Map();
  for (const risk of risks) {
    counts.set(risk.kind, (counts.get(risk.kind) ?? 0) + 1);
  }
  return [...counts].map(([kind, n]) => `${n} ${kind}`).join(', ');
}

/**
 * Scan the decoded string values of a JSON document.
 *
 * A JSON file can hide a character from a byte-level scan by writing it as a
 * \u escape: the file is plain ASCII, but the value a model receives after
 * parsing is not. MCP manifests matter here because tool descriptions are
 * model-facing text.
 *
 * @param {string} content
 * @returns {{pointer: string, risks: object[]}[]} empty when the file is not JSON
 */
export function scanDecodedJson(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const out = [];
  const walk = (node, path) => {
    if (typeof node === 'string') {
      const risks = scan(node);
      if (risks.length > 0) out.push({ pointer: path || '(root)', risks });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        // Keys are model-visible too: a tool named with a homoglyph is a
        // different tool to a matcher and the same tool to a reader.
        const keyRisks = scan(k);
        if (keyRisks.length > 0) out.push({ pointer: `${path ? `${path}.` : ''}${k} (key)`, risks: keyRisks });
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };

  walk(parsed, '');
  return out;
}
