# @gracefulcode/paladin

**Audit an npm package before you install it.**

The registry now distributes two kinds of executable thing: code, and
instructions a model will obey.

A `postinstall` script shows up in every supply-chain scanner. An `AGENTS.md`
inside a tarball shows up in none — and once it lands in a repository, a coding
agent reads it every session. MCP servers ship as npm packages, and
`npx some-mcp-server` is the standard install path, so this is not hypothetical.

paladin reports both, plus the characters a reviewer's font will not draw, plus
whether anyone signed for any of it.

```console
$ npx @gracefulcode/paladin demo-mcp-server@0.4.2

  demo-mcp-server@0.4.2

  provenance     none — no attestation published, publisher unverifiable
  install hooks  postinstall: node ./scripts/setup.js
  instructions   .mcp.json (178 B) — MCP server manifest
                 AGENTS.md (218 B) — agent instructions
  hidden chars   .mcp.json → mcpServers.demo.description — 1 invisible (JSON-escaped)
                   1:15  U+200B  invisible — zero-width space
                 AGENTS.md — 1 homoglyph, 2 invisible, 2 bidi-control
                   5:40  U+0430  homoglyph — Cyrillic а (looks like Latin a)
                   6:7  U+200B  invisible — zero-width space
                   7:1  U+202E  bidi-control — right-to-left override

  3 findings
```

It audits itself, too:

```console
$ npx @gracefulcode/paladin @gracefulcode/paladin

  @gracefulcode/paladin@0.1.0

  provenance     verified — signed attestation published
  install hooks  none
  instructions   none
  hidden chars   none

  clean
```

The `provenance` line reads `verified` once published through Trusted
Publishing; before the first release it reports no attestation, which is the
honest answer.

## It never runs the package

Tarballs are fetched with [`pacote`](https://www.npmjs.com/package/pacote) —
npm's own fetcher, so resolution matches `npm install` exactly — and read in
memory. Nothing is written anywhere npm would run a lifecycle script from, and
no lifecycle script is ever executed. If a tool that audits hostile packages can
be made to run one, it is worse than nothing.

## Install

```sh
npx @gracefulcode/paladin <package-spec>     # no install
npm install -g @gracefulcode/paladin         # or keep it around
```

Any spec npm understands works, including a local tarball:

```sh
paladin react
paladin some-server@0.4.2
paladin @scope/thing@next
paladin ./build/my-package-1.0.0.tgz
```

## What it reports

| | |
| --- | --- |
| **provenance** | Whether a Sigstore attestation is published for this exact version. No attestation means the link between the published bytes and any source repository is unverified. |
| **install hooks** | `preinstall`, `install`, `postinstall`, `prepare`. Also flags a hook that *differs* between the registry manifest and the tarball's own `package.json` — a disagreement is itself a finding. |
| **instructions** | Files a package ships that an agent will read: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clinerules`, `SKILL.md`, MCP manifests, and anything under `.claude/`, `.codex/`, `.github/instructions/`. READMEs and changelogs are excluded — watching them buries the signal. |
| **hidden chars** | Invisible characters, bidirectional controls (the Trojan Source class), and homoglyphs, in any of the above. |

### Characters hidden behind a JSON escape

A JSON file can pass a byte-level scan and still deliver an invisible character:
write it as `​` and the file is pure ASCII, while the string a model
receives after parsing is not. paladin parses instruction JSON and scans the
*decoded* values and keys, reporting those separately as `(JSON-escaped)`.

This matters most for MCP manifests, where tool names and descriptions are
model-facing text.

## Flags

```
--json             machine-readable output
--ignore-scripts   skip the install-hook check
--quiet            findings only, no clean lines
```

## Exit codes

```
0  clean
1  install hooks or instruction files present
2  hidden characters found
3  error
```

Highest applicable wins, so `2` outranks `1`. Usable in CI as a gate.

## Dependencies

Three, all of them npm's own: `pacote`, `npm-package-arg`, `tar`. A security
tool with a large dependency tree is a joke reviewers will make.

## What this is, and what it isn't

paladin is small on purpose. It makes one argument — that the registry now
distributes instructions as well as code, and that the two deserve the same
scrutiny — in about 400 lines.

It is **not** a malware scanner. It reports facts about a package and leaves the
judgment to you: plenty of legitimate packages have a `postinstall`, and a
shipped `AGENTS.md` is often exactly what you wanted. The point is that you
should be able to see them before they are on your disk, not after.

Not yet, but intended: dependency-tree walking, and a policy file for CI.

## Related

The original [paladin](https://github.com/Grace/paladin) is a Go tool that
watches the instruction files already on your machine — baselining them and
reporting drift. This one asks the other half of the question: what will I be
obeying if I install this?

## License

MIT
