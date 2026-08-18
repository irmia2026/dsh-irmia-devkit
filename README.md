# dsh-irmia-devkit

[![npm version](https://img.shields.io/npm/v/dsh-irmia-devkit)](https://www.npmjs.com/package/dsh-irmia-devkit)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-4D6BFE?logo=deepseek&logoColor=white)](https://github.com/topics/dsh-plugin)

Curated **Irmia DevKit** tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Nine battle-tested tools ported as-is from [Irmia DevKit](https://github.com/irmia2026/irmia_devkit_open) v2.6.4, covering the gaps the Harness runtime does not ship natively.

## Features

| Group | Tools | What they do |
|---|---|---|
| Safe editing | `safe_edit` · `safe_rollback` · `multi_edit` | Backup → edit → syntax gate → auto-rollback on failure. `safe_rollback(list=true)` lists backups; `multi_edit` does atomic cross-file batch edits |
| Networking | `http_get` · `http_post` | SSRF-guarded HTTP (private-network blocking + per-hop redirect re-check) |
| Code understanding | `code_index` · `code_explore` · `code_diff_impact` | Symbol indexing (AST + SQLite + FTS5) with BFS call-graph queries; `code_index(status=true)` checks index health |
| Read-only DB | `db_query` | SELECT/PRAGMA whitelist + engine-level `mode=ro` read-only |

Zero third-party Python dependencies — pure standard library (`chardet` / `tree-sitter` are optional enhancements with graceful fallback).

## Install

Requires Node.js ≥ 18 and `python3` (≥ 3.9) on `PATH`. This package ships as a DSH **bundle** (`dsh.bundle`), installed into a profile via `dsh plugin`:

```sh
# From npm (recommended)
npx @deepseek-ai/dsh plugin --profile web add dsh-irmia-devkit

# From GitHub (pin a version)
npx @deepseek-ai/dsh plugin --profile web add github:irmia2026/dsh-irmia-devkit#v0.1.0
```

Verify the layer landed before launching:

```sh
npx @deepseek-ai/dsh --profile web --dump-config   # look for a "# == dsh-irmia-devkit" layer
npx @deepseek-ai/dsh web
```

## Configuration

| Field | Default | Description |
|---|---|---|
| `pythonPath` | `python3` | Executable used to run the bundled Python tools |

## How it works

```
Model → Cordis tool (index.js / src/tools.js)
        │  execFile("python3", python/runner.py <tool> '<json-args>')
        ▼
python/runner.py → python/tools/*.py (DevKit modules, unchanged)
        ▼
JSON result back to the model
```

- The JS layer only defines tool schemas and bridges to subprocesses.
- The Python core comes from [irmia_devkit_open](https://github.com/irmia2026/irmia_devkit_open) v2.6.4, unmodified.
- Per-tool behavior (arguments, guards, return protocol) is preserved exactly.

## Development

```bash
node test/smoke.mjs   # requires node_modules with @deepseek-ai/dsh-tools
```

Repo-internal design docs: `docs/COMPARISON.md` (DevKit ↔ Harness tool comparison) and `docs/PORTING.md` (port blueprint).

## License

**AGPL-3.0**. Python tool core © 2026 伊尔弥亚 / irmia2026, from [Irmia DevKit](https://github.com/irmia2026/irmia_devkit_open), AGPL-3.0. This repository is a derivative work distributed under AGPL-3.0.
